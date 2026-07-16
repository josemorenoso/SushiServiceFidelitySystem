/**
 * Reward Grant Service — el premio otorgado.
 *
 * La pieza que va entre "ganar" y "entregar": un premio que le PERTENECE a un
 * cliente y está pendiente de reclamar.
 *
 *   GANAR                    TENER                  ENTREGAR
 *   mystery_box_results  →   reward_grants      →   reward_redemptions
 *   cron reactivación    →   (este servicio)        (mesa + mesero)
 *
 * Ref: docs/features/reward-grants.md
 */

import { createClient } from '@supabase/supabase-js'
import { percentInt } from '@/lib/format/percent'
import type { GrantSource, GrantStatus, GrantType, RewardGrant } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

/** `active` y todavía no vencido. Los premios sin `expires_at` no vencen nunca. */
function notExpiredFilter(nowIso: string) {
  return `expires_at.is.null,expires_at.gt.${nowIso}`
}

// ═══════════════════════════════════════════════════════════════
// Otorgar
// ═══════════════════════════════════════════════════════════════

export interface GrantRewardParams {
  customerId: string
  grantType: GrantType
  source: GrantSource
  prizeTitle: string
  tierId?: string | null
  mysteryBoxResultId?: string | null
  campaignRewardId?: string | null
  campaignId?: string | null
  /** Días de ventana desde ahora. Omitir (null/undefined) → el premio NO vence.
   *  Un número (incluido 0) SÍ define una ventana: 0 o negativo = vence de inmediato. */
  windowDays?: number | null
}

export type GrantRewardResult =
  | { ok: true; grant: RewardGrant }
  | { ok: false; code: 'duplicate_active' | 'db_error'; error: string }

/**
 * Otorga un premio a un cliente.
 *
 * Si el cliente ya tiene un premio de campaña activo del mismo `source`, la base de
 * datos lo rechaza con un 23505 (índice único parcial) y se devuelve `duplicate_active`.
 * Es una condición esperada, no un error: el cron la usa para no otorgar dos veces.
 */
export async function grantReward(
  params: GrantRewardParams,
  tenantId: string
): Promise<GrantRewardResult> {
  const supabase = getServiceClient()

  // `windowDays` omitido (null/undefined) → el premio no vence nunca. Un número —incluido
  // 0— SÍ es una ventana: NO se colapsa `0` con "omitido" (ese era el bug: `windowDays: 0`
  // producía un grant permanente en vez de uno vencido). 0 o negativo → vence de inmediato.
  const expiresAt =
    params.windowDays == null
      ? null
      : new Date(Date.now() + Math.max(0, params.windowDays) * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('reward_grants')
    .insert({
      tenant_id: tenantId,
      customer_id: params.customerId,
      grant_type: params.grantType,
      source: params.source,
      prize_title: params.prizeTitle,
      tier_id: params.tierId ?? null,
      mystery_box_result_id: params.mysteryBoxResultId ?? null,
      campaign_reward_id: params.campaignRewardId ?? null,
      campaign_id: params.campaignId ?? null,
      status: 'active',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation → ya tiene un premio activo de este source.
    if (error.code === '23505') {
      return { ok: false, code: 'duplicate_active', error: 'El cliente ya tiene un premio activo de este tipo' }
    }
    return { ok: false, code: 'db_error', error: error.message }
  }

  return { ok: true, grant: data as RewardGrant }
}

// ═══════════════════════════════════════════════════════════════
// Consultar (cliente y mesero)
// ═══════════════════════════════════════════════════════════════

/** Un premio activo, tal como lo ven la tarjeta del cliente y el mesero al escanear. */
export interface ActiveGrant {
  id: string
  prize_title: string
  grant_type: GrantType
  source: GrantSource
  /** null = no vence */
  expires_at: string | null
  granted_at: string
  tier_id: string | null
  mystery_box_result_id: string | null
}

/**
 * Premios activos (no vencidos) de un cliente.
 * Alimenta el banner "Disponible" de la tarjeta y la alerta del mesero al escanear.
 */
export async function getActiveGrants(customerId: string, tenantId: string): Promise<ActiveGrant[]> {
  const supabase = getServiceClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('reward_grants')
    .select('id, prize_title, grant_type, source, expires_at, granted_at, tier_id, mystery_box_result_id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .or(notExpiredFilter(nowIso))
    .order('granted_at', { ascending: true })

  if (error) {
    console.error('[RewardGrant] Error consultando premios activos:', error.message)
    return []
  }

  return (data ?? []) as ActiveGrant[]
}

/** Un premio pendiente en la lista del mesero, ya con los datos del cliente. */
export interface PendingGrantRow extends ActiveGrant {
  customer_id: string
  customer_name: string | null
  customer_phone: string | null
}

/**
 * Premios pendientes de entrega, acotados a clientes PRESENTES.
 *
 * "Presente" = con check-in en las últimas `hoursPresent` horas. Sin este recorte, una
 * campaña que reparte premios a 200 clientes dormidos convertiría la pantalla del mesero
 * en una guía telefónica inútil durante el servicio (decisión D4).
 */
export async function getPendingGrantsForPresentCustomers(
  tenantId: string,
  hoursPresent = 6
): Promise<PendingGrantRow[]> {
  const supabase = getServiceClient()
  const nowIso = new Date().toISOString()
  const since = new Date(Date.now() - hoursPresent * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('reward_grants')
    .select(
      'id, customer_id, prize_title, grant_type, source, expires_at, granted_at, tier_id, mystery_box_result_id, customers!inner(name, phone, last_visit_at)'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .or(notExpiredFilter(nowIso))
    .gte('customers.last_visit_at', since)
    .order('granted_at', { ascending: true })

  if (error) {
    console.error('[RewardGrant] Error consultando pendientes del mesero:', error.message)
    return []
  }

  return (data ?? []).map((row) => {
    // Supabase devuelve los joins embebidos como objeto o como array según el caso.
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
    return {
      id: row.id,
      customer_id: row.customer_id,
      prize_title: row.prize_title,
      grant_type: row.grant_type as GrantType,
      source: row.source as GrantSource,
      expires_at: row.expires_at,
      granted_at: row.granted_at,
      tier_id: row.tier_id,
      mystery_box_result_id: row.mystery_box_result_id,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
    }
  })
}

/** Un grant concreto, validando que pertenezca al tenant (defensa contra IDOR). */
export async function getGrantById(grantId: string, tenantId: string): Promise<RewardGrant | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('reward_grants')
    .select('*')
    .eq('id', grantId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !data) return null
  return data as RewardGrant
}

// ═══════════════════════════════════════════════════════════════
// Vencimiento y recordatorio (cron)
// ═══════════════════════════════════════════════════════════════

/**
 * Marca como `expired` los premios activos cuya fecha ya pasó.
 * Corre dentro del cron de recordatorio: no necesita un cron propio.
 * Devuelve cuántos venció.
 */
export async function expireGrants(tenantId: string): Promise<number> {
  const supabase = getServiceClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('reward_grants')
    .update({ status: 'expired' as GrantStatus })
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso)
    .select('id')

  if (error) {
    console.error('[RewardGrant] Error venciendo premios:', error.message)
    return 0
  }
  return (data ?? []).length
}

export interface ReminderCandidate {
  grant_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  prize_title: string
  expires_at: string
  days_left: number
}

/**
 * Premios a punto de vencer cuyo dueño NO ha vuelto desde que se le otorgó.
 *
 * Al que ya volvió no se le manda nada: o bien reclamó el premio, o bien lo tiene
 * pendiente en la lista del mesero. En cualquier caso, la urgencia ya no aplica.
 */
export async function findGrantsDueForReminder(
  tenantId: string,
  daysBefore: number
): Promise<ReminderCandidate[]> {
  const supabase = getServiceClient()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const horizonIso = new Date(now + daysBefore * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('reward_grants')
    .select('id, customer_id, prize_title, expires_at, granted_at, customers!inner(name, phone, last_visit_at)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .is('reminder_sent_at', null)
    .not('expires_at', 'is', null)
    .gt('expires_at', nowIso)
    .lte('expires_at', horizonIso)

  if (error) {
    console.error('[RewardGrant] Error buscando candidatos a recordatorio:', error.message)
    return []
  }

  const candidates: ReminderCandidate[] = []

  for (const row of data ?? []) {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
    if (!customer?.phone || !customer?.name) continue

    // El cliente ya volvió después de que se le otorgó → nada que recordarle.
    if (customer.last_visit_at && customer.last_visit_at >= row.granted_at) continue

    const expiresAt = row.expires_at as string
    const daysLeft = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now) / (24 * 60 * 60 * 1000)))

    candidates.push({
      grant_id: row.id,
      customer_id: row.customer_id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      prize_title: row.prize_title,
      expires_at: expiresAt,
      days_left: daysLeft,
    })
  }

  return candidates
}

/** Sella el recordatorio para que una segunda corrida no lo mande otra vez. */
export async function markReminderSent(grantIds: string[]): Promise<void> {
  if (grantIds.length === 0) return
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('reward_grants')
    .update({ reminder_sent_at: new Date().toISOString() })
    .in('id', grantIds)

  if (error) {
    console.error('[RewardGrant] Error sellando recordatorios:', error.message)
  }
}

// ═══════════════════════════════════════════════════════════════
// Métricas (dashboard)
// ═══════════════════════════════════════════════════════════════

export interface GrantSourceMetric {
  source: GrantSource
  granted: number
  redeemed: number
  expired: number
  /** redimidos / otorgados, en porcentaje. */
  redemption_rate: number
}

export interface GrantMetrics {
  granted: number
  redeemed: number
  expired: number
  active: number
  redemption_rate: number
  by_source: GrantSourceMetric[]
}

/**
 * Métricas de la cohorte de premios OTORGADOS en el rango.
 *
 * Se cuenta por `granted_at`, no por `redeemed_at`: así la tasa de redención compara
 * manzanas con manzanas (de los premios que repartimos en julio, ¿cuántos se reclamaron?).
 * Segmentada por origen, la tasa de `reactivation` es literalmente el porcentaje de
 * clientes dormidos que la campaña despertó.
 */
export async function getGrantMetrics(
  params: { from?: string; to?: string },
  tenantId: string
): Promise<GrantMetrics> {
  const supabase = getServiceClient()

  let query = supabase
    .from('reward_grants')
    .select('source, status')
    .eq('tenant_id', tenantId)

  if (params.from) query = query.gte('granted_at', params.from)
  if (params.to) query = query.lte('granted_at', params.to)

  const { data, error } = await query

  if (error) {
    throw new Error(`Error obteniendo métricas de premios: ${error.message}`)
  }

  const rows = data ?? []
  const bySource = new Map<GrantSource, { granted: number; redeemed: number; expired: number }>()
  let redeemed = 0
  let expired = 0
  let active = 0

  for (const row of rows) {
    const source = row.source as GrantSource
    const status = row.status as GrantStatus
    const bucket = bySource.get(source) ?? { granted: 0, redeemed: 0, expired: 0 }

    bucket.granted++
    if (status === 'redeemed') {
      bucket.redeemed++
      redeemed++
    } else if (status === 'expired') {
      bucket.expired++
      expired++
    } else {
      active++
    }
    bySource.set(source, bucket)
  }

  const granted = rows.length

  return {
    granted,
    redeemed,
    expired,
    active,
    redemption_rate: percentInt(redeemed, granted),
    by_source: [...bySource.entries()]
      .map(([source, b]) => ({
        source,
        granted: b.granted,
        redeemed: b.redeemed,
        expired: b.expired,
        redemption_rate: percentInt(b.redeemed, b.granted),
      }))
      .sort((a, b) => b.granted - a.granted),
  }
}
