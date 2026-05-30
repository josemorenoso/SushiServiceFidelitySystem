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

export interface TwilioMessageResponse {
  sid: string
  status: string
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER

  if (!accountSid || !authToken || !whatsappNumber) {
    return null
  }

  return { accountSid, authToken, whatsappNumber }
}

export async function sendTemplateMessage(
  phone: string,
  contentSid: string,
  variables: Record<string, string>,
  mediaUrl?: string
): Promise<TwilioMessageResponse | null> {
  const config = getTwilioClient()
  if (!config) {
    console.warn('[WhatsApp] Twilio no configurado — mensaje no enviado')
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

    const messagePayload: Record<string, string> = {
      from: config.whatsappNumber,
      to: formatPhoneForWhatsApp(phone),
      contentSid,
      contentVariables: JSON.stringify(subset),
    }
    if (mediaUrl) {
      messagePayload.mediaUrl = mediaUrl
    }

    try {
      const message = await client.messages.create(messagePayload as any)
      if (maxVars < sortedKeys.length) {
        console.warn(`[WhatsApp] Enviado con ${maxVars}/${sortedKeys.length} vars (mismatch corregido): ${message.sid}`)
      } else {
        console.log(`[WhatsApp] Template enviado: ${message.sid} (contentSid=${contentSid})`)
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
      console.error(`[WhatsApp] Error enviando template ${contentSid}:`, error)
      return null
    }
  }
  return null
}
