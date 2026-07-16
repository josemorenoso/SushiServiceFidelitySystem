/**
 * Review Service — el pop-up de reseñas de Google.
 *
 * Tres responsabilidades, y ninguna es "entregar premios":
 *
 *   1. EL GATE     — a quién se le muestra el pop-up (y a quién ya no).
 *   2. EL FUNNEL   — se mostró N veces → X fueron a Google → Y reclamaron el premio.
 *   3. EL PREMIO   — que NO se construye aquí: se delega entero en reward-grant.service,
 *                    donde source='review' ya existía desde la migración 00031.
 *
 * Ref: docs/features/review-flow.md
 *      docs/superpowers/specs/2026-07-13-google-review-popup-design.md
 */

import { createClient } from '@supabase/supabase-js'
import { resolveBranding, NO_GOOGLE_REVIEW_URL } from '@/lib/branding'
import { percentInt } from '@/lib/format/percent'
import { getCampaignRewardById } from '@/services/campaign-reward.service'
import { getMultipleSettings } from '@/services/settings.service'
import { grantReward, getActiveGrants, type ActiveGrant } from '@/services/reward-grant.service'
import {
  DEFAULT_REVIEW_REWARD_WINDOW_DAYS,
  REVIEW_SHOWN_DEDUPE_HOURS,
} from '@/constants/rewards'
import type { Customer, ReviewAction, ReviewFunnel, ReviewPromptState } from '@/types/database.types'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

/** El premio de reseña activo del cliente (si tiene alguno), para no otorgar por duplicado. */
async function getActiveReviewGrant(
  customerId: string,
  tenantId: string
): Promise<ActiveGrant | null> {
  const grants = await getActiveGrants(customerId, tenantId)
  return grants.find((g) => g.source === 'review') ?? null
}

// ═══════════════════════════════════════════════════════════════
// Configuración
// ═══════════════════════════════════════════════════════════════

export interface ReviewConfig {
  /** Título del premio del catálogo, o null si el dueño no eligió ninguno. */
  rewardTitle: string | null
  /** Id del premio en `campaign_rewards`. Null si no hay. */
  rewardId: string | null
  windowDays: number
}

/**
 * Lee la config de reseñas del tenant.
 *
 * Un premio DESACTIVADO en el catálogo cuenta como "sin premio": el pop-up sigue saliendo
 * (decisión B3-D3), pero deja de prometer algo que el negocio ya no quiere entregar.
 */
export async function getReviewConfig(tenantId: string): Promise<ReviewConfig> {
  const settings = await getMultipleSettings(
    ['review_reward_id', 'review_reward_window_days'],
    tenantId
  )

  const parsedWindow = parseInt(settings.review_reward_window_days ?? '', 10)
  const windowDays =
    Number.isInteger(parsedWindow) && parsedWindow > 0
      ? parsedWindow
      : DEFAULT_REVIEW_REWARD_WINDOW_DAYS

  const rewardId = settings.review_reward_id || null
  if (!rewardId) return { rewardTitle: null, rewardId: null, windowDays }

  const reward = await getCampaignRewardById(rewardId, tenantId)
  if (!reward || !reward.is_active) return { rewardTitle: null, rewardId: null, windowDays }

  return { rewardTitle: reward.title, rewardId: reward.id, windowDays }
}

// ═══════════════════════════════════════════════════════════════
// El gate
// ═══════════════════════════════════════════════════════════════

/**
 * ¿Se le muestra el pop-up a este cliente?
 *
 * Lo decide el SERVIDOR, nunca el navegador: el check-in del cliente es stateless (cero
 * localStorage, cero cookies) y se identifica solo por teléfono. La memoria vive en la DB
 * o no existe.
 *
 * - Sin link de Google → no se muestra. No hay a dónde mandarlo.
 * - Ya fue a Google → no se muestra NUNCA más (R6.b).
 * - Tocó "La próxima lo hago" → SÍ se le vuelve a mostrar (decisión B3-D4). Por eso
 *   `google_review_postponed_at` no aparece en esta función: es informativo, no un freno.
 *
 * OJO con el link: NO se toma de `resolveBranding()`, porque ese resolver cae al default
 * del entorno (`NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`, el link de la cuenta maestra) cuando el
 * tenant tiene el campo vacío. Un tenant que BORRA su link a propósito (string vacío) quiere
 * apagar el pop-up, no heredar el link de otro negocio. Por eso se distingue:
 *   - `undefined` (nunca configurado) → cae al default del entorno (comportamiento cuenta maestra).
 *   - `''` (configurado y vaciado) → apaga el pop-up: no hereda nada.
 *   - un link real → se usa tal cual.
 */
export async function getReviewPromptState(
  customer: Customer,
  tenant: Tenant
): Promise<ReviewPromptState> {
  const configuredUrl = tenant.config?.google_maps_url
  const googleUrl =
    configuredUrl === undefined
      ? resolveBranding(tenant.config).googleReviewUrl
      : configuredUrl
  const hasUrl = !!googleUrl && googleUrl !== NO_GOOGLE_REVIEW_URL

  if (!hasUrl || customer.google_review_clicked_at) {
    return { show: false, reward_title: null, google_url: '' }
  }

  const config = await getReviewConfig(tenant.id)

  return {
    show: true,
    reward_title: config.rewardTitle,
    google_url: googleUrl,
  }
}

// ═══════════════════════════════════════════════════════════════
// Eventos (el funnel)
// ═══════════════════════════════════════════════════════════════

export async function logReviewEvent(
  action: ReviewAction,
  customerId: string,
  tenantId: string,
  grantId: string | null = null
): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase.from('review_events').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    action,
    grant_id: grantId,
  })

  // El tracking no puede tumbar el flujo del cliente: una impresión perdida es un dato
  // menos, un check-in caído es un cliente menos.
  if (error) {
    console.error(`[Review] Error registrando evento '${action}':`, error.message)
  }
}

/**
 * Registra la impresión, deduplicada.
 *
 * Recargar la pantalla de éxito no debe contar como una segunda impresión: si lo hiciera,
 * el denominador del funnel se infla y la tasa de conversión miente hacia abajo.
 */
export async function logReviewShown(customerId: string, tenantId: string): Promise<void> {
  const supabase = getServiceClient()

  // Dedup en UNA sola sentencia SQL (INSERT ... WHERE NOT EXISTS, vía RPC de la 00032): una
  // ida a la base en vez de dos (antes SELECT + INSERT), y la ventana de carrera del
  // check-then-act se estrecha a lo que dura la sentencia. Es un contador de impresiones, no
  // dinero: no se busca atomicidad perfecta, solo dejar de inflar el denominador del funnel
  // en recargas y reintentos.
  const { error } = await supabase.rpc('log_review_shown_deduped', {
    p_tenant_id: tenantId,
    p_customer_id: customerId,
    p_within_hours: REVIEW_SHOWN_DEDUPE_HOURS,
  })

  if (error) {
    console.error('[Review] Error registrando impresión (dedup):', error.message)
  }
}

// ═══════════════════════════════════════════════════════════════
// Acciones del cliente
// ═══════════════════════════════════════════════════════════════

export interface ReviewClickResult {
  /** El premio otorgado. Null si el dueño no configuró ninguno (el modal sale igual). */
  prize_title: string | null
  expires_at: string | null
}

/**
 * El cliente tocó el link de Google.
 *
 * Sella la columna (no se le vuelve a mostrar), otorga el premio y registra el evento.
 *
 * El premio se otorga SIN verificar que la reseña exista. No es un agujero: el paso 1 que
 * el cliente lee en pantalla es "muéstrale la reseña al mesero", y el mesero es el
 * verificador — igual que con cualquier otro premio. Google no expone ninguna API para
 * confirmarlo; cualquier otra cosa sería teatro.
 */
export async function registerReviewClick(
  customer: Customer,
  tenant: Tenant
): Promise<ReviewClickResult> {
  const supabase = getServiceClient()
  const config = await getReviewConfig(tenant.id)

  // IDEMPOTENCIA REAL (R6.b, fix auditoría): si el cliente YA fue a Google, no se le otorga
  // un SEGUNDO premio. El gate (getReviewPromptState) ya no le muestra el modal, pero este
  // endpoint es público: sin este freno, repetir el POST después de que el primer premio se
  // redimió o venció acuñaría uno nuevo cada vez (el índice único de la 00031 solo bloquea
  // mientras el grant sigue ACTIVO — deja de proteger en cuanto cambia de estado).
  // `google_review_clicked_at` es el candado permanente que faltaba.
  if (customer.google_review_clicked_at) {
    const existing = await getActiveReviewGrant(customer.id, tenant.id)
    return {
      prize_title: existing?.prize_title ?? config.rewardTitle,
      expires_at: existing?.expires_at ?? null,
    }
  }

  const { error: sealError } = await supabase
    .from('customers')
    .update({ google_review_clicked_at: new Date().toISOString() })
    .eq('id', customer.id)
    .eq('tenant_id', tenant.id)

  if (sealError) {
    console.error('[Review] Error sellando el click:', sealError.message)
  }

  if (!config.rewardId || !config.rewardTitle) {
    await logReviewEvent('clicked', customer.id, tenant.id)
    return { prize_title: null, expires_at: null }
  }

  const granted = await grantReward(
    {
      customerId: customer.id,
      grantType: 'campaign_prize',
      source: 'review',
      prizeTitle: config.rewardTitle,
      campaignRewardId: config.rewardId,
      windowDays: config.windowDays,
    },
    tenant.id
  )

  if (!granted.ok) {
    if (granted.code === 'duplicate_active') {
      // Ya tenía un premio de reseña activo (p. ej. doble-tap o reintento). No es un error:
      // devolvemos ESE premio con su expiry REAL —no `null`—, para que la cuenta regresiva
      // del modal sea la verdadera y no desaparezca en el reintento.
      const existing = await getActiveReviewGrant(customer.id, tenant.id)
      await logReviewEvent('clicked', customer.id, tenant.id, existing?.id ?? null)
      return {
        prize_title: existing?.prize_title ?? config.rewardTitle,
        expires_at: existing?.expires_at ?? null,
      }
    }
    // `db_error` real: NO se otorgó nada. No prometemos un premio que no existe (antes se
    // devolvía `config.rewardTitle` y el cliente veía "Tu regalo: X" sin un grant que lo
    // respaldara, imposible de redimir por el mesero).
    console.error('[Review] No se pudo otorgar el premio por reseña:', granted.error)
    await logReviewEvent('clicked', customer.id, tenant.id)
    return { prize_title: null, expires_at: null }
  }

  await logReviewEvent('clicked', customer.id, tenant.id, granted.grant.id)

  return {
    prize_title: granted.grant.prize_title,
    expires_at: granted.grant.expires_at,
  }
}

/** "La próxima lo hago" — sin culpa. Se le vuelve a mostrar en su próximo check-in. */
export async function registerReviewPostpone(customer: Customer, tenantId: string): Promise<void> {
  const supabase = getServiceClient()

  const { error } = await supabase
    .from('customers')
    .update({ google_review_postponed_at: new Date().toISOString() })
    .eq('id', customer.id)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[Review] Error sellando el aplazamiento:', error.message)
  }

  await logReviewEvent('postponed', customer.id, tenantId)
}

// ═══════════════════════════════════════════════════════════════
// Métricas (dashboard)
// ═══════════════════════════════════════════════════════════════

/**
 * El embudo completo de reseñas.
 *
 * Las dos tasas miden cosas distintas y hay que poder separarlas:
 *   - `click_rate` (clicks / impresiones) es el GANCHO. Un 3% aquí es un problema de
 *     incentivo: el premio no convence o el copy no se lee.
 *   - `redemption_rate` (redimidos / clicks) es la OPERACIÓN. Un 20% aquí es un problema
 *     de servicio: la gente sí deja la reseña, pero el mesero no está cerrando el ciclo.
 *
 * Los premios se cuentan por `granted_at` (no por `redeemed_at`) para que numerador y
 * denominador miren la misma cohorte: de las reseñas de julio, ¿cuántas se cobraron?
 */
export async function getReviewFunnel(
  params: { from?: string; to?: string },
  tenantId: string
): Promise<ReviewFunnel> {
  const supabase = getServiceClient()

  let eventsQuery = supabase
    .from('review_events')
    .select('action')
    .eq('tenant_id', tenantId)

  if (params.from) eventsQuery = eventsQuery.gte('created_at', params.from)
  if (params.to) eventsQuery = eventsQuery.lte('created_at', params.to)

  let grantsQuery = supabase
    .from('reward_grants')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('source', 'review')

  if (params.from) grantsQuery = grantsQuery.gte('granted_at', params.from)
  if (params.to) grantsQuery = grantsQuery.lte('granted_at', params.to)

  const [events, grants] = await Promise.all([eventsQuery, grantsQuery])

  if (events.error) {
    throw new Error(`Error obteniendo el funnel de reseñas: ${events.error.message}`)
  }
  if (grants.error) {
    throw new Error(`Error obteniendo los premios por reseña: ${grants.error.message}`)
  }

  let shown = 0
  let clicked = 0
  let postponed = 0

  for (const row of events.data ?? []) {
    if (row.action === 'shown') shown++
    else if (row.action === 'clicked') clicked++
    else if (row.action === 'postponed') postponed++
  }

  const redeemed = (grants.data ?? []).filter((g) => g.status === 'redeemed').length

  return {
    shown,
    clicked,
    postponed,
    redeemed,
    click_rate: percentInt(clicked, shown),
    redemption_rate: percentInt(redeemed, clicked),
  }
}
