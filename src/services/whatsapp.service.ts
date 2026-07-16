/**
 * WhatsApp Service — SOLO PLANTILLAS APROBADAS
 *
 * IMPORTANTE: No existe ventana de 24h en este sistema.
 * El cliente escanea un QR y registra datos, pero NUNCA envía un mensaje
 * WhatsApp al negocio. Por tanto, los mensajes free-text (body) NUNCA
 * serán entregados por Meta/WhatsApp.
 *
 * TODOS los mensajes deben enviarse mediante plantillas aprobadas
 * (Twilio Content API con contentSid).
 *
 * Mapeo estándar de variables por tipo de plantilla:
 *   welcome:       {{1}}=nombre
 *   welcome_back:  {{1}}=nombre, {{2}}=total_visitas, {{3}}=hint_recompensa
 *   reward:        {{1}}=nombre, {{2}}=total_visitas, {{3}}=nombre_premio
 *   birthday:      {{1}}=nombre
 *   reactivation:  {{1}}=nombre, {{2}}=total_visitas, {{3}}=hint_recompensa
 *   campaign:      {{1}}=nombre, {{2}}=total_visitas, {{3}}=hint_recompensa
 */

import { formatPhoneForWhatsApp } from '@/lib/validators/phone'
import { recordMessageLog } from '@/services/message-log.service'
import { isPhoneOptedOut } from '@/services/customer.service'

export interface TwilioMessageResponse {
  sid: string
  status: string
}

/**
 * Contexto opcional para persistir el envío en `message_logs`.
 * Si se omite, el mensaje se envía sin registrar (comportamiento legacy).
 * Auditoría 12-Julio: los callers transaccionales deben pasarlo siempre.
 */
export interface MessageLogContext {
  customerId?: string | null
  /** welcome | checkin | tier_unlocked | points_earned_near | points_earned_far | safe_reward | mystery_box | golden_box | delivery | ... */
  messageType: string
}

/**
 * Credenciales Twilio + identidad del tenant para enviar mensajes.
 * Se pasa el tenant resuelto (por dominio/slug/JWT). Si el tenant no tiene
 * subaccount propio, se usa la cuenta master via env (TWILIO_*) — que apunta a
 * Sushi Service (la cuenta master de Cada1).
 */
export interface TenantMessagingContext {
  id: string
  twilio_subaccount_sid: string | null
  twilio_subaccount_auth_token: string | null
  twilio_whatsapp_number: string | null
}

function getTwilioClient(tenant: TenantMessagingContext) {
  const accountSid = tenant.twilio_subaccount_sid ?? process.env.TWILIO_ACCOUNT_SID
  const authToken = tenant.twilio_subaccount_auth_token ?? process.env.TWILIO_AUTH_TOKEN
  const whatsappNumber = tenant.twilio_whatsapp_number ?? process.env.TWILIO_WHATSAPP_NUMBER

  if (!accountSid || !authToken || !whatsappNumber) {
    return null
  }

  return { accountSid, authToken, whatsappNumber }
}

/**
 * NO recibe `mediaUrl` a propósito: en la API de Mensajes de Twilio `ContentSid` y
 * `MediaUrl` son mutuamente excluyentes. Al enviar una plantilla, la media sale
 * ÚNICAMENTE de la definición de la plantilla. Para media dinámica, la plantilla
 * debe declarar la variable en el path (ver `src/lib/twilio/media.ts`) y la URL real
 * viaja en `contentVariables`.
 */
export async function sendTemplateMessage(
  phone: string,
  contentSid: string,
  variables: Record<string, string>,
  tenant: TenantMessagingContext,
  logContext?: MessageLogContext
): Promise<TwilioMessageResponse | null> {
  const config = getTwilioClient(tenant)
  if (!config) {
    console.warn('[WhatsApp] Twilio no configurado — mensaje no enviado')
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'failed',
        errorCode: 'twilio_not_configured',
        errorMessage: 'Credenciales Twilio del tenant/master ausentes',
      })
    }
    return null
  }

  // Opt-out persistente (auditoría 12-Julio, tarea 8): si el cliente respondió
  // SALIR/STOP/BAJA, no malgastamos el envío ni generamos un error 21610.
  if (await isPhoneOptedOut(phone, tenant.id)) {
    console.warn(`[WhatsApp] Envío omitido: el cliente está en opt-out (contentSid=${contentSid})`)
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'failed',
        errorCode: 'opted_out_local',
        errorMessage: 'Cliente con opt-out activo (whatsapp_opt_out_at)',
      })
    }
    return null
  }

  const twilio = (await import('twilio')).default
  const client = twilio(config.accountSid, config.authToken)

  // Twilio 21656: rejects contentVariables values that contain newline characters.
  // Sanitize all values: replace \n with ' · ' to keep roadmap readable in one line.
  const sanitize = (v: string) => v.replace(/\n/g, ' · ').replace(/\r/g, '').trim()
  const sanitized: Record<string, string> = {}
  Object.keys(variables).forEach((k) => { sanitized[k] = sanitize(variables[k]) })

  // Sort keys numerically: ['1','2','3','4'] etc.
  const sortedKeys = Object.keys(sanitized).sort((a, b) => Number(a) - Number(b))

  // Progressive retry: if Twilio returns 21665 (contentVariables count mismatch vs template definition),
  // reduce variable count by 1 and retry until we find the right count.
  for (let maxVars = sortedKeys.length; maxVars >= 1; maxVars--) {
    const subset: Record<string, string> = {}
    sortedKeys.slice(0, maxVars).forEach((k) => { subset[k] = sanitized[k] })

    try {
      const message = await client.messages.create({
        from: config.whatsappNumber,
        to: formatPhoneForWhatsApp(phone),
        contentSid,
        contentVariables: JSON.stringify(subset),
      })
      if (maxVars < sortedKeys.length) {
        console.warn(`[WhatsApp] Enviado con ${maxVars}/${sortedKeys.length} vars (mismatch corregido): ${message.sid}`)
      } else {
        console.log(`[WhatsApp] Template enviado: ${message.sid} (contentSid=${contentSid})`)
      }
      if (logContext) {
        await recordMessageLog({
          ...logContext,
          tenantId: tenant.id,
          phone,
          templateSid: contentSid,
          variables: subset,
          status: 'sent',
          twilioSid: message.sid,
        })
      }
      return { sid: message.sid, status: message.status }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      // Only retry on 21665 (variable COUNT mismatch) — NOT on 21656 (invalid format)
      const isCountMismatch = errMsg.includes('21665')
      if (isCountMismatch && maxVars > 1) {
        console.warn(`[WhatsApp] Variable count mismatch (${maxVars} vars), reintentando con ${maxVars - 1}…`)
        continue
      }
      // Exponer el código de error de Twilio para diagnóstico (p.ej. 63016 opt-out,
      // 21655 contentSid inválido, 63007 número fuera de WhatsApp). Antes el fallo se
      // perdía y el cliente quedaba sin mensaje sin rastro de la causa.
      const twilioErr = error as { code?: number | string; status?: number; moreInfo?: string }
      console.error(
        `[WhatsApp] FALLO envío template contentSid=${contentSid} code=${twilioErr?.code ?? 'n/a'} status=${twilioErr?.status ?? 'n/a'} msg="${errMsg}"${twilioErr?.moreInfo ? ` info=${twilioErr.moreInfo}` : ''}`
      )
      if (logContext) {
        await recordMessageLog({
          ...logContext,
          tenantId: tenant.id,
          phone,
          templateSid: contentSid,
          variables: subset,
          status: 'failed',
          errorCode: twilioErr?.code != null ? String(twilioErr.code) : null,
          errorMessage: errMsg,
        })
      }
      return null
    }
  }
  return null
}
