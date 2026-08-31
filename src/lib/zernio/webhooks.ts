/**
 * Verificación de firma y tipos de payload de los webhooks salientes de Zernio.
 *
 * Diferencia importante con Twilio (src/lib/validators/twilio.ts): en Zernio la
 * firma es OPCIONAL — Zernio solo firma si se configura un `secret` al crear el
 * webhook (dashboard o API). Por eso esta función EXIGE el secreto propio y
 * rechaza cualquier webhook si no está configurado o si el header falta, en vez
 * de aceptarlo sin firma como haría Zernio por defecto.
 *
 * Algoritmo confirmado contra el spec OpenAPI público: HMAC-SHA256 en hex,
 * calculado sobre el body CRUDO (raw), header `X-Zernio-Signature`.
 *
 * Formato de respuesta esperado por Zernio (no implementado aquí, es
 * responsabilidad del route handler que use esto): cualquier `2xx` en menos de
 * 5 segundos, sin body ni formato particular — nada de TwiML/XML como Twilio.
 * Reintentos: hasta 7 por evento con backoff exponencial; el webhook completo
 * se desactiva solo tras 10 fallos consecutivos.
 */

import crypto from 'crypto'

export function verifyZernioSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[Zernio] ZERNIO_WEBHOOK_SECRET no configurado — rechazando webhook')
    return false
  }
  if (!signatureHeader) {
    return false
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf-8').digest('hex')

  // Comparación en tiempo constante (mismo criterio que validateTwilioSignature
  // debería usar pero no usa hoy — aquí sí lo hacemos bien desde el inicio).
  const expectedBuf = Buffer.from(expected, 'utf-8')
  const receivedBuf = Buffer.from(signatureHeader, 'utf-8')
  if (expectedBuf.length !== receivedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

/**
 * Eventos relevantes para WhatsApp. Zernio puede agregar eventos nuevos sin
 * avisar (es una plataforma de 16 redes, no solo WhatsApp) — por eso el tipo
 * no se cierra del todo.
 */
export type ZernioWebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'
  | 'whatsapp.template.status_updated'
  | 'whatsapp.template.category_updated'
  | 'whatsapp.number.kyc_submitted'
  | 'whatsapp.number.activated'
  | 'whatsapp.number.declined'
  | 'whatsapp.number.action_required'
  | 'whatsapp.number.verification_required'
  | 'whatsapp.number.suspended'
  | 'webhook.test'
  | (string & {})

export interface ZernioInboxMessageSender {
  /** WhatsApp: número sin '+', o el businessScopedUserId (BSUID) de Meta. */
  id: string
  contactId?: string
  name?: string
  /** E.164. Puede venir null — Meta está migrando a BSUID (rollout abr-2026). */
  phoneNumber?: string | null
  businessScopedUserId?: string
}

export interface ZernioInboxMessage {
  id: string
  conversationId: string
  platform: 'whatsapp' | 'sms' | 'instagram' | 'facebook' | 'telegram' | (string & {})
  /** wamid de Meta para WhatsApp. */
  platformMessageId: string
  direction: 'incoming' | 'outgoing'
  text: string | null
  sender: ZernioInboxMessageSender
  sentAt: string
}

/** Evento `message.received` / `message.sent`. */
export interface ZernioWebhookPayloadMessage {
  id: string
  event: 'message.received' | 'message.sent'
  message: ZernioInboxMessage
  /** Forma exacta no confirmada del todo en la doc pública — tratar como opaco. */
  conversation: Record<string, unknown>
  account: Record<string, unknown>
  metadata?: Record<string, unknown>
  timestamp: string
}

/** Evento `message.delivered` / `message.read` / `message.failed`. */
export interface ZernioWebhookPayloadDeliveryStatus {
  id: string
  event: 'message.delivered' | 'message.read' | 'message.failed'
  message: ZernioInboxMessage
  statusAt: string
  error: {
    code: string
    title: string
    message: string
    explanation?: string
  } | null
  conversation: Record<string, unknown>
  account: Record<string, unknown>
  timestamp: string
}

export interface ZernioWebhookPayloadTest {
  id: string
  event: 'webhook.test'
  message: string
  timestamp: string
}

/**
 * Evento `whatsapp.template.status_updated` / `whatsapp.template.category_updated`.
 *
 * ES EL DETECTOR DE APROBACIÓN de plantillas: sin él habría que hacer poll cada
 * pocas horas contra `GET /v1/whatsapp/templates` para enterarse de que Meta ya
 * revisó una edición. Forma tomada literal del contrato verificado
 * (`Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §5) — el `account`
 * trae `accountId`, que es como se resuelve el tenant.
 *
 * `reason` llega como `"NONE"` cuando no hay motivo, no como null.
 */
export interface ZernioWebhookPayloadTemplateStatus {
  id: string
  event: 'whatsapp.template.status_updated' | 'whatsapp.template.category_updated'
  account: Record<string, unknown>
  template: {
    templateId: string
    name: string
    language: string
    status: string
    reason?: string | null
  }
  timestamp: string
}

export type ZernioWebhookPayload =
  | ZernioWebhookPayloadMessage
  | ZernioWebhookPayloadDeliveryStatus
  | ZernioWebhookPayloadTest
  | ZernioWebhookPayloadTemplateStatus
