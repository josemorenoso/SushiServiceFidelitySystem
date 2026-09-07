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

/**
 * El estado del ALTA (`tenant_connections`, 00054). `null` = todavía no empezó, o la
 * migración no está aplicada — la pantalla degrada a la parte de C1, que no la necesita.
 *
 * ⚠️ `signup_nonce` NO está acá y no puede estarlo: es lo único que impide que un `code`
 * de otra pestaña conecte la WABA equivocada. Si viajara al navegador dejaría de ser un
 * secreto y dejaría de servir para nada.
 */
export interface TenantConnectionView {
  id: string
  route: 'coexistence' | 'byo_cloud_api' | 'zernio_number' | null
  status:
    | 'sin_empezar'
    | 'camino_elegido'
    | 'kyc_pendiente'
    | 'numero_declarado'
    | 'numero_comprado'
    | 'signup_abierto'
    | 'verificacion_pendiente'
    | 'conectada'
    | 'activa'
    | 'fallida'
    | 'suspendida'
    | 'liberada'
  phone_e164: string | null
  label: string | null
  purchase_allowed: boolean
  last_error: string | null
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
  connection?: TenantConnectionView | null
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
