/**
 * El contrato de `/api/dashboard/conexiones`, tal como lo consume la pantalla.
 *
 * Es un **objeto plano**: las tarjetas futuras (Google, Meta) entran como claves nuevas,
 * nunca como elementos de una lista. Ver el comentario de la ruta.
 */

export type MessagingProvider = 'twilio' | 'zernio'

export interface WhatsappConnection {
  provider: MessagingProvider
  phone: string | null
  configured: boolean
  readOnly: boolean
  autoReplyEnabled: boolean
  autoReplyApplies: boolean
}

export interface ConnectionPermissions {
  canAct: boolean
  isSuperAdmin: boolean
  isOwner: boolean
  ownerRegistered: boolean
  /** Por qué no puede actuar, en el idioma del cliente. `null` cuando sí puede. */
  denialMessage: string | null
}

export interface ConnectionsResponse {
  available: boolean
  permissions?: ConnectionPermissions
  whatsapp?: WhatsappConnection
  google?: { available: boolean }
  meta?: { available: boolean }
  error?: string
}

/** Lo que devuelve `/api/dashboard/line-budget`. Se reusa tal cual: esa ruta no se toca. */
export interface LineBudgetResponse {
  available: boolean
  enforced?: boolean
  limit?: number | null
  used24h?: number
  campaignAvailable?: number | null
  transactionalAvailable?: number | null
  qualityRating?: 'green' | 'yellow' | 'red' | 'unknown'
  lineStatus?: 'active' | 'throttled' | 'frozen'
  queueDepth?: number
  error?: string
}
