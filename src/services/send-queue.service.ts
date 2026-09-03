/**
 * Send Queue Service — la cola de goteo (Bloque 2 del spec de gobernanza).
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.4
 * Migraciones: 00037 (tabla `send_queue`) + 00038 (claim, expiración, índices)
 * Feature doc: docs/features/send-governance.md
 *
 * QUÉ PROBLEMA RESUELVE
 * ─────────────────────
 * Con el Bloque 1, una campaña de 380 destinatarios y presupuesto 180 enviaba
 * 180 y marcaba los otros 200 como `failed` con
 * `error_code = 'campaign_budget_exhausted'`. Se perdían. Con la cola, esos 200
 * se guardan y se envían solos en los días siguientes.
 *
 * LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO
 * ───────────────────────────────────────
 * **Encolar no es un permiso permanente.** Entre que un cliente entra en la
 * cola y que le toca su turno pueden pasar días: puede haber hecho opt-out,
 * haber visitado el restaurante (y dejar de ser "inactivo"), o haber llegado a
 * su cap mensual. Por eso las guardas de demanda se RE-EVALÚAN al drenar, no
 * al encolar (spec §3.4).
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { classifyMessageType, type MessagePriority } from '@/constants/messaging'

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export type QueueStatus = 'queued' | 'sent' | 'failed' | 'cancelled' | 'expired'

export const QUEUE_STATUSES: readonly QueueStatus[] = [
  'queued',
  'sent',
  'failed',
  'cancelled',
  'expired',
] as const

/**
 * Intentos antes de rendirse con un item. Spec §3.4: «`attempts` con backoff;
 * a los 3 intentos fallidos → `status='failed'`».
 */
export const MAX_ATTEMPTS = 3

/** Espera antes de reintentar, por número de intentos ya gastados. */
const BACKOFF_MINUTES = [15, 60, 240]

/**
 * Duración del arriendo del drenador, en segundos. **Tiene que coincidir con el
 * default de `claim_send_queue()` en 00038** — si aquí fuera más corto, el
 * dashboard cancelaría items que el drenador todavía considera suyos.
 */
const LEASE_SECONDS = 600

export interface EnqueueItem {
  tenantId: string
  phone: string
  customerId?: string | null
  importedContactId?: string | null
  campaignId?: string | null
  messageType: string
  templateSid: string
  variables?: Record<string, string>
  mediaUrl?: string | null
  mediaType?: string | null
  /** Antes de esta fecha el item no se intenta. Default: ya. */
  notBefore?: Date | null
  /**
   * Después de esta fecha el item NO se envía nunca: pasa a `expired`.
   * OBLIGATORIO en todo lo sensible al tiempo (P1). Un cumpleaños entregado
   * mañana no vale nada.
   */
  expiresAt?: Date | null
  /**
   * Sede a la que pertenece el envío (`send_queue.location_id`, 00043). Multi-sede F4.
   *
   * Existe para que **el goteo no pierda la sede entre encolar y drenar**: quien encola sabe
   * de dónde salió el envío, y el drenador —que corre horas después desde un cron— ya no.
   * `null` u omitida = sede desconocida, que es lo que manda hoy toda campaña masiva y lo
   * que seguirá mandando hasta que F6 arme la cascada de respaldo del §6.1.
   */
  locationId?: string | null
}

export interface QueueRow {
  id: string
  tenant_id: string
  phone: string
  customer_id: string | null
  imported_contact_id: string | null
  campaign_id: string | null
  priority: MessagePriority
  message_type: string
  template_sid: string
  variables: Record<string, string>
  media_url: string | null
  media_type: string | null
  status: QueueStatus
  not_before: string
  expires_at: string | null
  attempts: number
  last_error: string | null
  enqueued_at: string
  sent_at: string | null
  message_log_id: string | null
  claimed_at: string | null
}

/**
 * Encola un lote de forma idempotente.
 *
 * POR QUÉ PASA POR UNA FUNCIÓN SQL Y NO POR `.upsert()`
 * ─────────────────────────────────────────────────────
 * El anti-duplicado de 00038 es un índice único PARCIAL sobre una EXPRESIÓN:
 * `(tenant_id, phone, COALESCE(campaign_id, centinela), message_type) WHERE
 * status='queued'`. El `onConflict` de supabase-js solo admite una lista de
 * columnas, así que nunca podría apuntar a ese índice — PostgREST caería en la
 * clave primaria y el anti-duplicado no se aplicaría jamás, en silencio.
 *
 * `enqueue_send_queue()` usa `ON CONFLICT DO NOTHING` sin destino, que absorbe
 * la violación de cualquier índice único de la tabla. Encolar dos veces la
 * misma campaña no duplica a nadie.
 *
 * Devuelve cuántos entraron de verdad (los duplicados no cuentan).
 */
export async function enqueueSendBatch(items: EnqueueItem[]): Promise<{ enqueued: number }> {
  if (items.length === 0) return { enqueued: 0 }

  const db = getServiceClient()
  const filas = items.map((item) => {
    const { priority } = classifyMessageType(item.messageType)
    return {
      tenant_id: item.tenantId,
      phone: item.phone,
      customer_id: item.customerId ?? null,
      imported_contact_id: item.importedContactId ?? null,
      campaign_id: item.campaignId ?? null,
      priority,
      message_type: item.messageType,
      template_sid: item.templateSid,
      variables: item.variables ?? {},
      media_url: item.mediaUrl ?? null,
      media_type: item.mediaType ?? null,
      not_before: (item.notBefore ?? new Date()).toISOString(),
      expires_at: item.expiresAt ? item.expiresAt.toISOString() : null,
      // Multi-sede F4. La lee `enqueue_send_queue()` desde la 00044; antes de esa migración
      // la función ni siquiera tenía la columna en su INSERT y la sede se perdía en silencio.
      location_id: item.locationId ?? null,
    }
  })

  // En trozos: una campaña de 5.000 destinatarios en un solo payload se pasa
  // del límite de tamaño de request de PostgREST.
  const CHUNK = 500
  let enqueued = 0
  for (let i = 0; i < filas.length; i += CHUNK) {
    const { data, error } = await db.rpc('enqueue_send_queue', {
      p_items: filas.slice(i, i + CHUNK),
    })
    if (error) {
      console.error('[SendQueue] Error encolando lote:', error.message)
      throw new Error(`No se pudo encolar: ${error.message}`)
    }
    enqueued += (data as number | null) ?? 0
  }

  return { enqueued }
}

/** Marca como `expired` todo lo que se pasó de su ventana. Devuelve cuántos. */
export async function expireQueue(): Promise<number> {
  const db = getServiceClient()
  const { data, error } = await db.rpc('expire_send_queue')
  if (error) {
    console.error('[SendQueue] expire_send_queue falló:', error.message)
    return 0
  }
  return (data as number | null) ?? 0
}

export interface PendingTenant {
  tenant_id: string
  queued: number
  min_priority: number
}

/** Tenants con items listos para drenar, ordenados por urgencia. */
export async function getPendingTenants(): Promise<PendingTenant[]> {
  const db = getServiceClient()
  const { data, error } = await db.rpc('send_queue_pending_tenants')
  if (error) {
    console.error('[SendQueue] send_queue_pending_tenants falló:', error.message)
    return []
  }
  return (data as PendingTenant[] | null) ?? []
}

/**
 * Reclama atómicamente hasta `limit` items del tenant.
 *
 * La atomicidad vive en `claim_send_queue()` (00038), que usa
 * `FOR UPDATE SKIP LOCKED`. Es lo que impide que dos invocaciones del drenador
 * —n8n reintentando tras un timeout, o una corrida lenta solapándose con la
 * siguiente— envíen el mismo mensaje dos veces.
 */
export async function claimQueueBatch(tenantId: string, limit: number): Promise<QueueRow[]> {
  if (limit <= 0) return []
  const db = getServiceClient()
  const { data, error } = await db.rpc('claim_send_queue', {
    p_tenant: tenantId,
    p_limit: limit,
  })
  if (error) {
    console.error(`[SendQueue] claim_send_queue falló para ${tenantId}:`, error.message)
    return []
  }
  return (data as QueueRow[] | null) ?? []
}

/** El item salió. */
export async function markQueueItemSent(id: string, messageLogId?: string | null): Promise<void> {
  const db = getServiceClient()
  const { error } = await db
    .from('send_queue')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      last_error: null,
      message_log_id: messageLogId ?? null,
    })
    .eq('id', id)
  if (error) console.error(`[SendQueue] No se pudo marcar enviado ${id}:`, error.message)
}

/**
 * El item falló. Vuelve a la cola con backoff, o se rinde a los MAX_ATTEMPTS.
 *
 * `attempts` ya viene incrementado por `claim_send_queue()`, así que aquí solo
 * se decide si hay otra oportunidad.
 */
export async function markQueueItemFailed(
  item: QueueRow,
  motivo: string
): Promise<'retry' | 'failed'> {
  const db = getServiceClient()
  const agotado = item.attempts >= MAX_ATTEMPTS

  if (agotado) {
    const { error } = await db
      .from('send_queue')
      .update({ status: 'failed', last_error: motivo })
      .eq('id', item.id)
    if (error) console.error(`[SendQueue] No se pudo marcar fallido ${item.id}:`, error.message)
    return 'failed'
  }

  const minutos = BACKOFF_MINUTES[Math.min(item.attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 15
  const { error } = await db
    .from('send_queue')
    .update({
      last_error: motivo,
      not_before: new Date(Date.now() + minutos * 60_000).toISOString(),
      // Soltar el arriendo: si no, el item queda esperando a que venza.
      claimed_at: null,
    })
    .eq('id', item.id)
  if (error) console.error(`[SendQueue] No se pudo reprogramar ${item.id}:`, error.message)
  return 'retry'
}

/**
 * El item ya no debe enviarse por una razón de negocio (opt-out, cap mensual,
 * cooldown). NO es un fallo: no consume intentos ni vuelve a la cola.
 */
export async function cancelQueueItem(id: string, motivo: string): Promise<void> {
  const db = getServiceClient()
  const { error } = await db
    .from('send_queue')
    .update({ status: 'cancelled', last_error: motivo })
    .eq('id', id)
  if (error) console.error(`[SendQueue] No se pudo cancelar ${id}:`, error.message)
}

/**
 * Cancela un item desde el dashboard. Filtra por tenant a mano: el service role
 * se salta RLS, así que el aislamiento es responsabilidad del código.
 * Solo cancela lo que sigue `queued` — un item ya enviado no se puede deshacer.
 */
export async function cancelQueueItemForTenant(
  tenantId: string,
  id: string
): Promise<{ cancelled: boolean; reason?: 'sending' | 'not_found' }> {
  const db = getServiceClient()

  // Un item con arriendo VIVO lo está enviando el drenador en este momento.
  // Cancelarlo no detiene ese envío —ya salió hacia Twilio o Zernio— así que
  // responder "cancelado" sería mentirle al operador: el cliente va a recibir
  // el mensaje igual. Peor: el drenador lo marcaría después como `sent`,
  // pisando el `cancelled`.
  const corteArriendo = new Date(Date.now() - LEASE_SECONDS * 1000).toISOString()

  const { data, error } = await db
    .from('send_queue')
    .update({ status: 'cancelled', last_error: 'Cancelado desde el dashboard' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'queued')
    .or(`claimed_at.is.null,claimed_at.lt.${corteArriendo}`)
    .select('id')

  if (error) throw new Error(error.message)
  if ((data?.length ?? 0) > 0) return { cancelled: true }

  // No se canceló: distinguir "se está enviando ahora" de "no existe", para
  // poder decírselo al operador.
  const { data: existente } = await db
    .from('send_queue')
    .select('id, status, claimed_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (
    existente &&
    existente.status === 'queued' &&
    existente.claimed_at &&
    existente.claimed_at > corteArriendo
  ) {
    return { cancelled: false, reason: 'sending' }
  }

  return { cancelled: false, reason: 'not_found' }
}

export interface ListQueueFilters {
  campaignId?: string | null
  status?: QueueStatus | null
  page?: number
  limit?: number
}

export interface ListQueueResult {
  items: QueueRow[]
  total: number
  page: number
  limit: number
}

/** Cola del tenant, paginada. Mismo contrato que `getRedemptions()`. */
export async function listQueue(
  tenantId: string,
  filters: ListQueueFilters = {}
): Promise<ListQueueResult> {
  const db = getServiceClient()
  const page = filters.page && filters.page > 0 ? filters.page : 1
  const limit = Math.min(filters.limit && filters.limit > 0 ? filters.limit : 25, 200)
  const desde = (page - 1) * limit

  let query = db
    .from('send_queue')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('priority', { ascending: true })
    .order('not_before', { ascending: true })
    .order('enqueued_at', { ascending: true })
    .range(desde, desde + limit - 1)

  if (filters.campaignId) query = query.eq('campaign_id', filters.campaignId)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  return { items: (data as QueueRow[] | null) ?? [], total: count ?? 0, page, limit }
}

export interface QueueDepth {
  queued: number
  sent: number
  failed: number
  cancelled: number
  expired: number
  next_at: string | null
}

/** Desglose de la cola por estado. Alimenta la tarjeta del dashboard. */
export async function getQueueDepth(tenantId: string): Promise<QueueDepth> {
  const db = getServiceClient()
  const { data, error } = await db.rpc('send_queue_depth', { p_tenant: tenantId })
  if (error) {
    console.error(`[SendQueue] send_queue_depth falló para ${tenantId}:`, error.message)
    return { queued: 0, sent: 0, failed: 0, cancelled: 0, expired: 0, next_at: null }
  }
  return data as QueueDepth
}

/** Cuántos items siguen en cola de una campaña. Decide si ya se puede cerrar. */
export async function getCampaignQueuedCount(campaignId: string): Promise<number> {
  const db = getServiceClient()
  const { count, error } = await db
    .from('send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')
  if (error) {
    console.error(`[SendQueue] No se pudo contar la cola de ${campaignId}:`, error.message)
    // Falla CERRADO: ante la duda, la campaña sigue 'running'. Marcarla
    // 'completed' con cola pendiente le miente al operador.
    return 1
  }
  return count ?? 0
}

/**
 * Campañas `running` cuya cola ya se vació por cualquier vía —enviada,
 * cancelada o vencida— y que por tanto se pueden cerrar.
 *
 * Hace falta porque hay tres caminos que sacan items de `queued` SIN pasar por
 * el envío: `expire_send_queue()`, el `DELETE` del dashboard, y una tanda que
 * las guardas cancelan entera al drenar. Por cualquiera de ellos la campaña se
 * quedaría en `running` para siempre.
 */
export async function getFinishedCampaigns(): Promise<string[]> {
  const db = getServiceClient()
  const { data, error } = await db.rpc('send_queue_finished_campaigns')
  if (error) {
    console.error('[SendQueue] send_queue_finished_campaigns falló:', error.message)
    return []
  }
  return ((data as Array<{ campaign_id: string }> | null) ?? []).map((r) => r.campaign_id)
}

/** Poda de retención (00037). La llama el drenador. */
export async function pruneSendGovernance(): Promise<void> {
  const db = getServiceClient()
  const { error } = await db.rpc('prune_send_governance')
  if (error) console.error('[SendQueue] prune_send_governance falló:', error.message)
}
