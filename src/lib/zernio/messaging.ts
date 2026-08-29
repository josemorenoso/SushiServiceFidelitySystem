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

export interface ZernioTemplateSummary {
  id: string
  name: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | 'PENDING_DELETION'
  category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'
  language: string
}

export interface ZernioListTemplatesResult {
  success: boolean
  templates: ZernioTemplateSummary[]
}

/** Lista las plantillas de WhatsApp de una cuenta (solo lectura). */
export async function listZernioTemplates(accountId: string): Promise<ZernioListTemplatesResult> {
  return zernioFetch<ZernioListTemplatesResult>(`/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`)
}
