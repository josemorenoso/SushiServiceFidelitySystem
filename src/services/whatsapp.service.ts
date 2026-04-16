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
  variables: Record<string, string>
): Promise<TwilioMessageResponse | null> {
  const config = getTwilioClient()
  if (!config) {
    console.warn('[WhatsApp] Twilio no configurado — mensaje no enviado')
    return null
  }

  try {
    const twilio = (await import('twilio')).default
    const client = twilio(config.accountSid, config.authToken)

    const message = await client.messages.create({
      from: config.whatsappNumber,
      to: formatPhoneForWhatsApp(phone),
      contentSid,
      contentVariables: JSON.stringify(variables),
    })

    console.log(`[WhatsApp] Template enviado: ${message.sid} (contentSid=${contentSid})`)
    return { sid: message.sid, status: message.status }
  } catch (error) {
    console.error(`[WhatsApp] Error enviando template ${contentSid}:`, error)
    return null
  }
}
