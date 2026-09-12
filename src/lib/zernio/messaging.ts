/**
 * Envío de mensajes de plantilla de WhatsApp vía Zernio.
 *
 * Forma del request confirmada línea por línea contra el spec OpenAPI público
 * (docs.zernio.com/api/openapi, endpoint `POST /v1/inbox/conversations`), NO
 * contra un resumen — es la fuente de verdad, no una inferencia.
 *
 * Diferencia clave con Twilio (src/services/whatsapp.service.ts): las variables
 * de la plantilla viajan como un ARRAY PLANO en orden de aparición
 * (`templateParams: [valor1, valor2, ...]`), no como el diccionario
 * `{'1': ..., '2': ...}` que arma Twilio. Sirve tanto para plantillas con
 * variables posicionales ({{1}}, {{2}}) como nombradas ({{nombre}}) — Zernio
 * resuelve el nombre por posición de aparición en ambos casos.
 *
 * Los headers de media (imagen/video/documento) de la plantilla se rellenan
 * AUTOMÁTICAMENTE con el asset de muestra aprobado por Meta, salvo que se pase
 * `headerMedia` para usar un asset distinto en este envío puntual (ej. un
 * flyer distinto por evento, como hace hoy el calendario con Twilio).
 */

import { zernioFetch } from './client'

export interface ZernioHeaderMedia {
  type: 'image' | 'video' | 'document'
  /** Público, alcanzable sin auth. Usar esto O `id`, no ambos. */
  link?: string
  /** Media id ya subido a Meta, alternativa a `link`. */
  id?: string
  /** Solo aplica a `type: 'document'`. */
  filename?: string
}

export interface ZernioHeaderLocation {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface ZernioTemplateButtonParam {
  /** Posición (0-based) del botón dentro de la plantilla aprobada. */
  index: number
  subType: 'url' | 'copy_code' | 'flow'
  value: string
}

export interface SendZernioTemplateInput {
  /** El "account" de WhatsApp (número) desde el que se envía. */
  accountId: string
  /** Teléfono del destinatario en formato internacional, solo dígitos (sin '+'). */
  toPhone: string
  templateName: string
  templateLanguage: string
  /** Variables de texto en orden de aparición: header de texto, luego body, luego botones URL dinámicos. */
  templateParams?: string[]
  /** Solo para botones copy_code/flow — los botones URL van en `templateParams`. */
  templateButtonParams?: ZernioTemplateButtonParam[]
  /** Sobrescribe el asset de muestra de un header de media para ESTE envío. */
  headerMedia?: ZernioHeaderMedia
  /** Obligatorio si la plantilla tiene header de tipo LOCATION. */
  headerLocation?: ZernioHeaderLocation
}

export interface ZernioSendResult {
  success: boolean
  data: {
    messageId: string
    /** Id interno de conversación de Zernio (hex 24 chars) — correlaciona con los webhooks entrantes. */
    conversationId: string
    participantId: string
    participantName: string | null
    participantUsername: string | null
  }
}

export async function sendZernioTemplateMessage(input: SendZernioTemplateInput): Promise<ZernioSendResult> {
  const body: Record<string, unknown> = {
    accountId: input.accountId,
    participantId: input.toPhone,
    templateName: input.templateName,
    templateLanguage: input.templateLanguage,
  }
  if (input.templateParams) body.templateParams = input.templateParams
  if (input.templateButtonParams) body.templateButtonParams = input.templateButtonParams
  if (input.headerMedia) body.headerMedia = input.headerMedia
  if (input.headerLocation) body.headerLocation = input.headerLocation

  return zernioFetch<ZernioSendResult>('/inbox/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Un componente tal como Meta lo devuelve en el listado. Es la definición
 * aprobada (texto con `{{n}}`, formato del header, botones), no un envío.
 * Tipado laxo a propósito: Meta agrega campos y el listado solo se lee.
 */
export interface ZernioListedTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | (string & {})
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | (string & {})
  text?: string
  buttons?: { type: string; text?: string }[]
  [extra: string]: unknown
}

export interface ZernioTemplateSummary {
  id: string
  name: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | 'PENDING_DELETION'
  category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'
  language: string
  /** Presente en el spec público (2026-09-12); se lee con tolerancia a que falte. */
  components?: ZernioListedTemplateComponent[]
}

export interface ZernioListTemplatesResult {
  success: boolean
  templates: ZernioTemplateSummary[]
}

/** Lista las plantillas de WhatsApp de una cuenta (solo lectura). */
export async function listZernioTemplates(accountId: string): Promise<ZernioListTemplatesResult> {
  return zernioFetch<ZernioListTemplatesResult>(`/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`)
}

// ─── Texto libre dentro de una conversación abierta ───────────────────────

export interface SendZernioConversationMessageInput {
  accountId: string
  /** `message.conversationId` del webhook `message.received`, tal cual. */
  conversationId: string
  message: string
  /** URL pública. Con `attachmentType: 'image'` WhatsApp la muestra arriba del texto. */
  attachmentUrl?: string | null
  attachmentType?: 'image' | 'video' | 'file'
  /**
   * `Idempotency-Key`: mismo valor + mismo cuerpo = Zernio devuelve la primera
   * respuesta en vez de mandar dos veces. Se le pasa el id del evento que se
   * está contestando, porque Zernio reintenta webhooks y este acuse no puede
   * llegarle dos veces a la persona.
   */
  idempotencyKey?: string
}

export interface ZernioConversationMessageResult {
  success: boolean
  data?: {
    messageId?: string
    conversationId?: string
  }
}

/**
 * Manda un mensaje de TEXTO LIBRE (con foto opcional) en una conversación que
 * la persona abrió al escribir o al tocar un botón.
 *
 * `POST /v1/inbox/conversations/{conversationId}/messages` — verificado contra
 * el spec OpenAPI público el 2026-09-12 y anotado en
 * `Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §8.
 *
 * WhatsApp solo lo entrega DENTRO de la ventana de 24 h que abre el último
 * mensaje entrante de esa persona; fuera de ella Meta lo rechaza y la única
 * salida es una plantilla aprobada (`sendZernioTemplateMessage`). Por eso este
 * envío vive en los webhooks —se contesta en el acto— y en ningún cron.
 */
export async function sendZernioConversationMessage(
  input: SendZernioConversationMessageInput
): Promise<ZernioConversationMessageResult> {
  const body: Record<string, unknown> = {
    accountId: input.accountId,
    message: input.message,
  }
  const attachmentUrl = input.attachmentUrl?.trim()
  if (attachmentUrl) {
    body.attachmentUrl = attachmentUrl
    body.attachmentType = input.attachmentType ?? 'image'
  }

  const headers: Record<string, string> = {}
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey

  return zernioFetch<ZernioConversationMessageResult>(
    `/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    { method: 'POST', headers, body: JSON.stringify(body) }
  )
}
