/**
 * Line Budget Service — gobernanza de la OFERTA de envío.
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.1–§3.2
 * Migración: 00037_send_governance.sql
 *
 * Meta limita cada línea de WhatsApp a N destinatarios ÚNICOS por ventana
 * RODANTE de 24h, y ese límite lo consumen por igual las plantillas de
 * marketing y las de utility. Antes de 00037, nada en el sistema lo sabía: una
 * campaña recorría su lista completa y, pasado el límite, Meta empezaba a
 * rechazar — degradando la calidad de la línea principal del restaurante.
 *
 * DIFERENCIA IMPORTANTE CON `message-log.service.ts`: aquel es best-effort (un
 * fallo de registro nunca debe romper un envío). Este es lo contrario:
 * **falla cerrado**. Si no podemos confirmar que hay cupo, NO se envía. Un
 * mensaje de bienvenida perdido por una caída de la base es un problema menor;
 * pasarse del límite de Meta de forma repetida le restringe el número al
 * cliente, que es el peor resultado posible del producto.
 */

import { createClient } from '@supabase/supabase-js'
import type { MessageClass } from '@/constants/messaging'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export type LineStatus = 'active' | 'throttled' | 'frozen'
export type QualityRating = 'green' | 'yellow' | 'red' | 'unknown'

export interface LineBudget {
  /**
   * false = no conocemos el límite de esta línea: se contabiliza el consumo
   * pero NO se bloquea ningún envío. Es el estado de los tenants Twilio
   * anteriores a la migración 00037 — imponerles un tope inventado les
   * cortaría campañas que hoy salen sin problema.
   */
  enforced: boolean
  /** Límite de Meta: destinatarios únicos por 24h rodantes. `null` si no se conoce. */
  limit: number | null
  /** Destinatarios únicos ya consumidos en la ventana. Siempre disponible. */
  used24h: number
  /** Cupos apartados para lo transaccional (bienvenidas, check-in, premios). */
  reserve: number | null
  /** Techo de consumo total que las campañas pueden alcanzar. */
  campaignBudget: number | null
  campaignAvailable: number | null
  transactionalAvailable: number | null
  qualityRating: QualityRating
  lineStatus: LineStatus
}

export type ReservationDenialReason =
  | 'line_frozen'
  | 'budget_exhausted'
  | 'campaign_budget_exhausted'
  | 'budget_check_failed'

export interface ReservationResult {
  granted: boolean
  /** true = el teléfono ya se había contado en la ventana; no consumió cupo nuevo. */
  free: boolean
  /** false = el tenant no tiene límite conocido; se midió pero no se aplicó tope. */
  enforced: boolean
  reservationId: string | null
  reason: ReservationDenialReason | null
}

interface RawBudget {
  enforced: boolean
  limit: number | null
  used_24h: number
  reserve: number | null
  campaign_budget: number | null
  campaign_available: number | null
  transactional_available: number | null
  quality_rating: QualityRating
  line_status: LineStatus
}

interface RawReservation {
  granted: boolean
  free?: boolean
  enforced?: boolean
  reservation_id?: string
  reason?: ReservationDenialReason
}

/**
 * Reserva un cupo de envío de forma ATÓMICA.
 *
 * La atomicidad la garantiza `reserve_send_slot()` en Postgres con un advisory
 * lock por tenant — no se puede replicar aquí en TypeScript, porque las
 * campañas envían en paralelo (BATCH_SIZE = 10) y un patrón
 * leer-contar-insertar tiene una carrera que permite pasarse del límite.
 *
 * Falla cerrado: cualquier error devuelve `granted: false`.
 */
export async function reserveSendSlot(
  tenantId: string,
  phone: string,
  messageClass: MessageClass
): Promise<ReservationResult> {
  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase.rpc('reserve_send_slot', {
      p_tenant: tenantId,
      p_phone: phone,
      p_class: messageClass,
    })

    if (error) {
      console.error(`[LineBudget] reserve_send_slot falló para tenant ${tenantId}: ${error.message}`)
      return { granted: false, free: false, enforced: true, reservationId: null, reason: 'budget_check_failed' }
    }

    const raw = data as RawReservation | null
    if (!raw || typeof raw.granted !== 'boolean') {
      console.error(`[LineBudget] reserve_send_slot devolvió una forma inesperada para tenant ${tenantId}`)
      return { granted: false, free: false, enforced: true, reservationId: null, reason: 'budget_check_failed' }
    }

    return {
      granted: raw.granted,
      free: raw.free ?? false,
      enforced: raw.enforced ?? true,
      reservationId: raw.reservation_id ?? null,
      reason: raw.reason ?? null,
    }
  } catch (err) {
    console.error('[LineBudget] Excepción reservando cupo:', err instanceof Error ? err.message : err)
    return { granted: false, free: false, enforced: true, reservationId: null, reason: 'budget_check_failed' }
  }
}

/**
 * Devuelve un cupo cuando el proveedor rechazó el envío.
 *
 * Este SÍ es best-effort: si falla, se pierde un cupo de los 250 del día. Es el
 * lado seguro del error — desperdiciar cupo nunca le restringe el número a
 * nadie, pasarse del límite sí.
 */
export async function releaseSendSlot(
  reservationId: string | null,
  messageLogId?: string | null
): Promise<void> {
  if (!reservationId) return
  try {
    const supabase = getServiceClient()
    const { error } = await supabase.rpc('release_send_slot', {
      p_reservation: reservationId,
      p_message_log: messageLogId ?? null,
    })
    if (error) {
      console.error(`[LineBudget] No se pudo liberar la reserva ${reservationId}: ${error.message}`)
    }
  } catch (err) {
    console.error('[LineBudget] Excepción liberando reserva:', err instanceof Error ? err.message : err)
  }
}

/** Lee el presupuesto de la línea. Lanza si no se puede calcular. */
export async function getLineBudget(tenantId: string): Promise<LineBudget> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('line_budget', { p_tenant: tenantId })

  if (error) throw new Error(`No se pudo calcular el presupuesto de línea: ${error.message}`)
  if (!data) throw new Error('line_budget() no devolvió datos')

  const raw = data as RawBudget
  return {
    enforced: raw.enforced ?? false,
    limit: raw.limit,
    used24h: raw.used_24h,
    reserve: raw.reserve,
    campaignBudget: raw.campaign_budget,
    campaignAvailable: raw.campaign_available,
    transactionalAvailable: raw.transactional_available,
    qualityRating: raw.quality_rating,
    lineStatus: raw.line_status,
  }
}

/**
 * Mensaje legible para el dashboard cuando un envío se deniega. El operador
 * tiene que entender por qué su campaña no salió sin leer logs.
 */
export function describeDenial(reason: ReservationDenialReason): string {
  switch (reason) {
    case 'line_frozen':
      return 'La línea está congelada por calidad. Las campañas están detenidas; los mensajes transaccionales siguen saliendo.'
    case 'campaign_budget_exhausted':
      return 'Se agotó el cupo de campañas de hoy. El resto se envía automáticamente en los próximos días.'
    case 'budget_exhausted':
      return 'Se agotó el límite diario de la línea, incluida la reserva transaccional.'
    case 'budget_check_failed':
      return 'No se pudo verificar el cupo disponible. El envío se detuvo por precaución.'
  }
}
