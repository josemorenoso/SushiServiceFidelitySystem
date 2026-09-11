/**
 * Line Health Service — Bloque 3 de la gobernanza de envío.
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.5
 * Ver también: docs/features/send-governance.md
 *
 * EL PROBLEMA QUE RESUELVE
 * ────────────────────────
 * La 00037 construyó todo el freno de presupuesto sobre dos columnas —
 * `tenants.messaging_daily_limit` y `tenants.quality_rating`— y no dejó a nadie
 * encargado de escribirlas. El resultado, verificado el 2026-09-10: las 5
 * marcas vivas tienen el límite en NULL (`enforced: false` = se mide pero no se
 * frena) y la calidad en 'unknown'. O sea que el freno existe y está apagado.
 *
 * Este servicio es quien las escribe, leyendo el dato REAL del proveedor en vez
 * de que nadie lo adivine.
 *
 * DE DÓNDE SALE EL DATO (verificado, no de memoria — 2026-09-10)
 * ──────────────────────────────────────────────────────────────
 * · Twilio  → `GET /v2/Channels/Senders`, SDK v5.13.1 ya instalado.
 *             `properties.qualityRating` y `properties.messagingLimit`
 *             (node_modules/twilio/lib/rest/messaging/v2/channelsSender.d.ts:187-193).
 *             Es la fuente de 4 de las 5 marcas vivas.
 * · Zernio  → `GET /v1/whatsapp/number-info?accountId=…`,
 *             `phone.quality_rating` y `phone.messaging_limit_tier` (D-4 del spec).
 *             ⚠️ La ruta se comprobó VIVA (autoriza; con un accountId que no es
 *             de WhatsApp da 404, no 401), pero NUNCA se ha visto una respuesta
 *             real con un número conectado. Los nombres de campo salen del
 *             OpenAPI. Por eso se parsea con tolerancia y se guarda la respuesta
 *             cruda en `line_health_snapshots.raw`: el primer sondeo de verdad
 *             se audita mirando esa columna, no adivinando.
 *
 * LA REGLA QUE GOBIERNA ESTE ARCHIVO: EL SONDEO SOLO PUEDE APRETAR
 * ────────────────────────────────────────────────────────────────
 * Un sondeo puede llevar la línea de `active` a `throttled` o a `frozen`.
 * NUNCA al revés. Volver a `active` es siempre una acción humana con motivo
 * registrado (`aios_set_line_status`), y no es un capricho de proceso: reanudar
 * una línea solo porque la métrica mejoró reanuda TAMBIÉN la campaña que causó
 * la caída, que termina de hundirla. Es exactamente cómo se pierde un número.
 *
 * Esa asimetría es lo que hace seguro correr esto cada hora sin supervisión.
 */

import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { zernioFetch, ZernioApiError } from '@/lib/zernio/client'
import type { QualityRating, LineStatus } from '@/services/line-budget.service'
import type { Tenant } from '@/types/tenant.types'
import { resolveTwilioAccount } from '@/lib/twilio/tenant-credentials'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export type HealthSource = 'twilio_api' | 'zernio_api' | 'webhook' | 'manual'

export interface LineHealthReading {
  qualityRating: QualityRating
  /**
   * Destinatarios únicos por 24h que Meta le concede a esta línea.
   * `null` = el proveedor no lo dijo, O dijo "sin límite". Los dos casos se
   * comportan igual (medir sin frenar), que para "sin límite" es lo correcto.
   */
  messagingLimit: number | null
  source: HealthSource
  /** Respuesta cruda del proveedor, para auditar el primer sondeo real. */
  raw: unknown
}

/**
 * Traduce el escalón de Meta a un número de destinatarios/24h.
 *
 * Acepta las tres formas en que los proveedores lo han escrito, porque no hay
 * garantía de cuál manda cada uno: el enum de Meta (`TIER_1K`), el número
 * pelado (`1000`) y la forma corta (`1K`).
 *
 * Devuelve `null` cuando no entiende — y `null` significa "no lo sabemos", que
 * deja el freno apagado. Es la salida CONSERVADORA a propósito: inventar un
 * número aquí le corta las campañas a una marca que sí tenía cupo, y ese es
 * justo el desastre contra el que la 00037 advierte por escrito.
 */
export function parseMessagingLimit(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null

  const s = String(raw).trim().toUpperCase()
  if (!s) return null

  // "Sin límite" es un estado real de Meta, no un error de parseo. Se devuelve
  // null porque hoy `enforced: false` es exactamente el comportamiento correcto
  // para una línea sin tope: medir y no frenar.
  if (s.includes('UNLIMITED')) return null

  const m = s.match(/(\d+)\s*([KM]?)/)
  if (!m) return null

  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null

  const mult = m[2] === 'K' ? 1_000 : m[2] === 'M' ? 1_000_000 : 1
  return n * mult
}

/** Normaliza la calidad. Cualquier cosa que no reconozca es 'unknown'. */
export function parseQualityRating(raw: unknown): QualityRating {
  const s = String(raw ?? '').trim().toUpperCase()
  if (s === 'GREEN') return 'green'
  if (s === 'YELLOW') return 'yellow'
  if (s === 'RED') return 'red'
  return 'unknown'
}

// ─── Lectura por proveedor ──────────────────────────────────────

/**
 * Twilio. Lista los senders de la (sub)cuenta del tenant y busca el que
 * coincide con su número de WhatsApp.
 *
 * Se lista en vez de pedir por SID porque el repo NO guarda el SID del sender
 * en ninguna columna: lo que hay es `twilio_whatsapp_number`. Emparejar por
 * número es la única vía sin inventarse un dato que no tenemos.
 */
async function readTwilio(tenant: Tenant): Promise<LineHealthReading | null> {
  const account = resolveTwilioAccount(tenant)
  const numero = account?.whatsappNumber

  if (!account || !numero) return null

  const client = twilio(account.accountSid, account.authToken)
  // `channel` es OBLIGATORIO en este listado (no es un filtro opcional): sin
  // él el SDK ni siquiera compila. 'whatsapp' es el único canal que este
  // producto usa.
  const senders = await client.messaging.v2.channelsSenders.list({ channel: 'whatsapp', limit: 100 })

  // `senderId` viene como 'whatsapp:+573001234567'. El número del tenant puede
  // venir con o sin el prefijo, según cómo lo cargó quien dio de alta la marca.
  const objetivo = numero.replace(/^whatsapp:/, '').replace(/\D/g, '')
  const sender = senders.find((s) => (s.senderId ?? '').replace(/\D/g, '') === objetivo)

  if (!sender) {
    console.warn(
      `[LineHealth] ${tenant.slug}: Twilio devolvió ${senders.length} sender(s) y ninguno es ${numero}`
    )
    return null
  }

  return {
    qualityRating: parseQualityRating(sender.properties?.qualityRating),
    messagingLimit: parseMessagingLimit(sender.properties?.messagingLimit),
    source: 'twilio_api',
    raw: {
      sid: sender.sid,
      senderId: sender.senderId,
      status: sender.status,
      properties: sender.properties,
      offlineReasons: sender.offlineReasons,
    },
  }
}

/** Forma ESPERADA de `/v1/whatsapp/number-info`. Ver la advertencia de arriba. */
interface ZernioNumberInfo {
  phone?: {
    quality_rating?: unknown
    messaging_limit_tier?: unknown
    qualityRating?: unknown
    messagingLimitTier?: unknown
  }
  [k: string]: unknown
}

/**
 * Zernio. Se leen las DOS convenciones de nombre (snake_case y camelCase)
 * porque el spec OpenAPI usa una y el `metadata` de `/v1/accounts` usa la otra,
 * y nadie ha visto todavía cuál manda de verdad en esta ruta.
 */
async function readZernio(tenant: Tenant): Promise<LineHealthReading | null> {
  if (!tenant.zernio_account_id) return null

  const info = await zernioFetch<ZernioNumberInfo>(
    `/whatsapp/number-info?accountId=${encodeURIComponent(tenant.zernio_account_id)}`
  )

  const phone = info?.phone ?? {}
  const calidad = phone.quality_rating ?? phone.qualityRating
  const escalon = phone.messaging_limit_tier ?? phone.messagingLimitTier

  return {
    qualityRating: parseQualityRating(calidad),
    messagingLimit: parseMessagingLimit(escalon),
    source: 'zernio_api',
    raw: info,
  }
}

/**
 * Lee la salud de la línea de un tenant contra su proveedor.
 * Devuelve `null` cuando no se pudo leer — que NO es lo mismo que 'unknown':
 * `null` significa "no preguntamos o no contestó", y no escribe nada.
 */
export async function readLineHealth(tenant: Tenant): Promise<LineHealthReading | null> {
  try {
    return tenant.messaging_provider === 'zernio'
      ? await readZernio(tenant)
      : await readTwilio(tenant)
  } catch (err) {
    const detalle =
      err instanceof ZernioApiError
        ? `${err.status} ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err)
    console.error(`[LineHealth] ${tenant.slug}: no se pudo leer el proveedor — ${detalle}`)
    return null
  }
}

// ─── Decisión: qué hacer con lo leído ───────────────────────────

export interface HealthDecision {
  /** Estado al que hay que mover la línea, o `null` si no se toca. */
  nuevoEstado: LineStatus | null
  motivo: string | null
  /** Límite a escribir, o `null` si el proveedor no lo dijo. */
  limite: number | null
}

/**
 * Decide el estado nuevo de la línea.
 *
 * LAS DOS ASIMETRÍAS, Y POR QUÉ:
 *
 *  1. **Rojo congela de inmediato; amarillo exige DOS lecturas seguidas.** Un
 *     amarillo aislado suele ser ruido (un puñado de bloqueos en una hora
 *     floja). Un rojo no: cuando Meta lo pinta, ya hay daño.
 *
 *  2. **Verde no asciende a nadie.** Ni de `frozen` ni de `throttled`. El spec
 *     lo dice para el congelamiento y el mismo razonamiento vale para el
 *     estrangulamiento: si la métrica mejoró porque la campaña dejó de enviar,
 *     reanudarla automáticamente vuelve a poner en marcha exactamente lo que
 *     causó la caída. Reactivar es una decisión humana con motivo escrito.
 *
 * `estadoActual` entra como parámetro para que esta función sea PURA y
 * testeable sin base de datos.
 */
export function decidirEstado(
  lectura: LineHealthReading,
  estadoActual: LineStatus,
  calidadAnterior: QualityRating
): HealthDecision {
  const limite = lectura.messagingLimit

  if (lectura.qualityRating === 'red') {
    return estadoActual === 'frozen'
      ? { nuevoEstado: null, motivo: null, limite }
      : {
          nuevoEstado: 'frozen',
          motivo: 'Meta puso la línea en ROJO. Congelada automáticamente por el sondeo de salud.',
          limite,
        }
  }

  if (lectura.qualityRating === 'yellow') {
    // Histéresis: solo aprieta si la lectura ANTERIOR también era amarilla.
    if (calidadAnterior !== 'yellow') return { nuevoEstado: null, motivo: null, limite }
    if (estadoActual !== 'active') return { nuevoEstado: null, motivo: null, limite }
    return {
      nuevoEstado: 'throttled',
      motivo: 'Meta lleva dos lecturas seguidas en AMARILLO. Presupuesto de campaña a la mitad.',
      limite,
    }
  }

  // 'green' y 'unknown' no mueven el estado. Ver la asimetría 2.
  return { nuevoEstado: null, motivo: null, limite }
}

// ─── Persistencia ───────────────────────────────────────────────

export interface SyncResult {
  slug: string
  quality: QualityRating
  limit: number | null
  /** Límite que tenía antes. Sirve para ver de un vistazo qué cambió. */
  limitAnterior: number | null
  nuevoEstado: LineStatus | null
  /** true = no se escribió nada (modo ensayo). */
  dryRun: boolean
}

/**
 * Sondea un tenant, guarda el snapshot y aplica la decisión.
 *
 * `dryRun` existe porque este servicio ESCRIBE `messaging_daily_limit`, y esa
 * columna es el freno de las campañas de una marca en producción. La primera
 * corrida contra una cuenta real tiene que poder mirarse antes de que cambie
 * nada: `GET /api/cron/line-health?dry=1` devuelve exactamente lo que
 * escribiría, sin escribirlo.
 */
export async function syncTenantHealth(
  tenant: Tenant,
  opts: { dryRun?: boolean } = {}
): Promise<SyncResult | null> {
  const dryRun = opts.dryRun === true
  const lectura = await readLineHealth(tenant)
  if (!lectura) return null

  const db = getServiceClient()

  // La calidad ANTERIOR sale de la fila del tenant, no del último snapshot:
  // es la que se comparó la vez pasada y la que el CHECK garantiza no-nula.
  const { data: fila, error: errFila } = await db
    .from('tenants')
    .select('quality_rating, line_status, messaging_daily_limit')
    .eq('id', tenant.id)
    .maybeSingle()

  if (errFila) {
    console.error(`[LineHealth] ${tenant.slug}: no se pudo leer el estado actual — ${errFila.message}`)
    return null
  }

  const calidadAnterior = (fila?.quality_rating ?? 'unknown') as QualityRating
  const estadoActual = (fila?.line_status ?? 'active') as LineStatus
  const limiteAnterior = (fila?.messaging_daily_limit ?? null) as number | null

  const decision = decidirEstado(lectura, estadoActual, calidadAnterior)

  const resultado: SyncResult = {
    slug: tenant.slug,
    quality: lectura.qualityRating,
    limit: decision.limite,
    limitAnterior: limiteAnterior,
    nuevoEstado: decision.nuevoEstado,
    dryRun,
  }

  if (dryRun) return resultado

  // 1. El snapshot, SIEMPRE. Es el historial y la evidencia; se guarda incluso
  //    cuando nada cambia, porque la histéresis del amarillo necesita saber que
  //    hubo una lectura previa y el primer sondeo real de Zernio se audita aquí.
  const { error: errSnap } = await db.from('line_health_snapshots').insert({
    tenant_id: tenant.id,
    quality_rating: lectura.qualityRating,
    messaging_limit: decision.limite,
    // El estado de plantillas pausadas lo escribe `applyProviderTemplateStatus()`
    // en template.service.ts, que es el ÚNICO código autorizado a mover
    // `admin_settings.*_template_sid`. Este sondeo NO lo duplica.
    paused_templates: [],
    source: lectura.source,
    raw: lectura.raw as Record<string, unknown>,
  })
  if (errSnap) {
    console.error(`[LineHealth] ${tenant.slug}: no se pudo guardar el snapshot — ${errSnap.message}`)
  }

  // 2. La fila del tenant.
  const cambios: Record<string, unknown> = { quality_rating: lectura.qualityRating }

  if (decision.limite !== null) {
    cambios.messaging_daily_limit = decision.limite
    cambios.messaging_limit_synced_at = new Date().toISOString()
  }

  if (decision.nuevoEstado) {
    cambios.line_status = decision.nuevoEstado
    cambios.line_status_reason = decision.motivo
    cambios.line_status_changed_at = new Date().toISOString()
    console.warn(`[LineHealth] ${tenant.slug} → ${decision.nuevoEstado}: ${decision.motivo}`)
  }

  const { error: errUpd } = await db.from('tenants').update(cambios).eq('id', tenant.id)
  if (errUpd) {
    console.error(`[LineHealth] ${tenant.slug}: no se pudo actualizar el tenant — ${errUpd.message}`)
  }

  return resultado
}
