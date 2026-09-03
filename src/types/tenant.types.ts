// Tipos del modelo multitenant.
// Ver docs/superpowers/plans/2026-07-05-multitenant-MASTER.md

export type BusinessType = 'restaurant' | 'barbershop' | 'beauty_salon'

/**
 * Config por-tenant (columna jsonb `tenants.config`). Generaliza el branding y las
 * etiquetas de negocio para que la misma app sirva a restaurantes, barberías y salones.
 */
export interface TenantConfig {
  brand_name: string
  brand_tagline?: string
  brand_short?: string
  brand_description?: string
  staff_role_label?: string // 'Mesero' | 'Barbero' | 'Barista'
  visit_label?: string // 'visita' | 'cita' | 'servicio'
  station_label?: string // 'mesa' | 'silla' | 'cabina'
  has_delivery_webhook?: boolean
  whatsapp_link?: string
  instagram_url?: string // perfil de Instagram — contacto alterno si el negocio no da WhatsApp
  google_maps_url?: string // URL de reseña en Google Maps
  delivery_phone?: string // teléfono de domicilios (fallback del link de WhatsApp)
  /**
   * Ciudad por defecto de los pedidos de domicilio (Fase 2 de §25).
   *
   * La usa el prompt de extracción con IA (`src/constants/delivery-ai.ts`) cuando la
   * dirección no nombra una ciudad. El workflow de n8n tenía «Envigado» HORNEADO —
   * correcto para un solo restaurante, veneno para 25: le escribiría esa ciudad en
   * `customers.city` a los clientes de todas las marcas.
   *
   * **Sin configurar, la IA no inventa ciudad y `customers.city` queda `null`.**
   * ⚠️ Sushi Service necesita `"Envigado"` aquí para comportarse igual que hoy.
   */
  delivery_default_city?: string
  /**
   * Emoji de marca que se hornea en las plantillas de WhatsApp del estilo
   * `calido`. Opcional: sin él se usa el de `business_type`
   * (`resolveTemplateEmoji()` en src/constants/template-catalog.ts).
   * ⚠️ Cambiarlo NO cambia las plantillas ya aprobadas: el texto que Meta
   * aprobó es literal. Solo afecta a las que se creen o se re-sometan después.
   */
  template_emoji?: string
  card_bg?: string // gradiente CSS de la tarjeta digital
  page_bg?: string // gradiente CSS de fondo de la tarjeta/wallet
}

/**
 * Tenant tal como lo consume el código de la app.
 * Nota: las columnas se llaman `twilio_subaccount_*` pero contienen "las credenciales
 * Twilio de este tenant" — sea una subcuenta real (clientes nuevos, bajo el master de
 * Cada1) o una cuenta separada (Sushi Fun). El código las trata igual.
 * ⚠️ `twilio_subaccount_auth_token` es SENSIBLE: solo se resuelve en el server para
 * enviar mensajes; NUNCA se expone en respuestas de API públicas ni al frontend.
 */
export interface Tenant {
  id: string
  slug: string
  name: string
  business_type: BusinessType
  config: TenantConfig
  domain: string | null
  twilio_subaccount_sid: string | null
  twilio_subaccount_auth_token: string | null
  twilio_messaging_service_sid: string | null
  twilio_whatsapp_number: string | null
  is_active: boolean
  /** true = tenant de demostración (ventas). Nunca dispara Twilio real — ver sendTemplateMessage(). */
  is_demo: boolean
  /**
   * Proveedor de mensajería (migración 00036). Default 'twilio' — los tenants
   * existentes no cambian de comportamiento. sendTemplateMessage() rutea por
   * este campo, no por presencia de credenciales.
   */
  messaging_provider: 'twilio' | 'zernio'
  /** Profile de Zernio — informativo/trazabilidad, el envío usa zernio_account_id. */
  zernio_profile_id: string | null
  /** Account de Zernio (el número/canal). Requerido junto a zernio_phone_number para enviar. */
  zernio_account_id: string | null
  /** E.164 CON '+', ej. +573001234567. SIN el prefijo whatsapp: que usa Twilio. */
  zernio_phone_number: string | null
  created_at: string
}

/** Versión sin credenciales Twilio — segura para enviar al frontend. */
export type TenantPublic = Omit<Tenant, 'twilio_subaccount_sid' | 'twilio_subaccount_auth_token'>

export interface TenantWalletTransaction {
  id: string
  tenant_id: string
  type: 'topup' | 'adjustment' | 'refund' | 'debit'
  amount_cop: number
  amount_usd: number | null
  usd_cop_rate: number | null
  // Columnas del débito (migración 00033). NULL en recargas/ajustes.
  unit_price_cop: number | null
  quantity: number | null
  message_log_id: string | null
  source: 'manual' | 'wompi' | 'system' | null
  external_ref: string | null
  notes: string | null
  created_by: string
  created_at: string
}
