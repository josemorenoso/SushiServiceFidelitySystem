/**
 * Message Log Service — persistencia de TODOS los envíos WhatsApp.
 *
 * Resuelve los hallazgos CRÍTICOS de la auditoría 12-Julio: antes los
 * mensajes transaccionales (welcome, check-in, tier, mystery box) se
 * enviaban sin dejar rastro en la base de datos. Ahora cada intento queda
 * registrado en `message_logs` con su estado y código de error de Twilio.
 *
 * El registro es best-effort: si la escritura falla, NUNCA debe romper el
 * envío del mensaje al cliente. Por eso todo va envuelto en try/catch.
 */

import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export type MessageLogStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'undelivered'

export interface RecordMessageLogParams {
  customerId?: string | null
  tenantId: string
  phone: string
  /** welcome | checkin | tier_unlocked | points_earned_near | points_earned_far | safe_reward | mystery_box | golden_box | birthday | reactivation | manual | event | delivery */
  messageType: string
  templateSid?: string | null
  variables?: Record<string, string> | null
  status: MessageLogStatus
  twilioSid?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  /**
   * Sede a la que se IMPUTA el mensaje (`message_logs.location_id`, migración 00043).
   * D4: la billetera es de la marca, pero el desglose por sede es obligatorio.
   * Multi-sede F3. `null` = sede desconocida, y se MUESTRA como "Sin sede".
   *
   * ⚠️ NO es lo mismo que `line_location_id` (la sede DUEÑA DE LA LÍNEA por la que salió).
   * Esa segunda columna es de D6, que el dueño todavía no decidió, y hoy nadie la escribe:
   * con una sola línea por marca siempre valdría NULL.
   */
  locationId?: string | null
}

/**
 * Inserta una fila en message_logs. Best-effort: cualquier error se loguea
 * pero no se propaga, para no afectar el flujo de envío.
 */
export async function recordMessageLog(params: RecordMessageLogParams): Promise<void> {
  try {
    const supabase = getServiceClient()
    const { error } = await supabase.from('message_logs').insert({
      customer_id: params.customerId ?? null,
      tenant_id: params.tenantId,
      phone: params.phone,
      message_type: params.messageType,
      template_sid: params.templateSid ?? null,
      variables: params.variables ?? null,
      status: params.status,
      twilio_sid: params.twilioSid ?? null,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
      location_id: params.locationId ?? null,
    })
    if (error) {
      console.error('[MessageLog] No se pudo registrar el mensaje:', error.message)
    }
  } catch (err) {
    console.error('[MessageLog] Excepción registrando el mensaje:', err instanceof Error ? err.message : err)
  }
}
