// Tipos del modelo multitenant.
// Ver docs/superpowers/plans/2026-07-05-multitenant-MASTER.md

export type BusinessType = 'restaurant' | 'barbershop' | 'beauty_salon'

/**
 * Config por-tenant (columna jsonb `tenants.config`). Generaliza el branding y las
 * etiquetas de negocio para que la misma app sirva a restaurantes, barberías y salones.
 *
 * DOS FORMAS EN EL MISMO JSONB, Y NO ES UN DESCUIDO
 * ─────────────────────────────────────────────────
 * Las claves de arriba son PLANAS (`brand_name`, `card_bg`, …): nacieron cuando
 * `config` solo llevaba marca y no había nada más con qué chocar. Se quedan como
 * están — moverlas obligaría a migrar el jsonb de 25 tenants vivos para no ganar
 * nada.
 *
 * Lo nuevo va en ESPACIOS CON NOMBRE (`branding`, `qr_studio`, y el reservado
 * `integrations`). La razón es concreta: el siguiente inquilino de este jsonb son
 * las cuentas de Google y de Meta que el restaurante va a conectar. Con todo
 * plano, `google_*` y `meta_*` acabarían mezclados con `brand_name` a un descuido
 * de `resolveBranding()` — que es la función cuya salida VIAJA AL NAVEGADOR.
 * Con espacios, cada bloque es una unidad: se lee, se escribe y se audita solo.
 *
 * ⚠️ Escribir un espacio con el merge plano de siempre (`config || patch`)
 * REEMPLAZA el espacio entero. Por eso la 00047 agrega `merge_tenant_config_deep()`
 * y el endpoint del panel escribe por RUTA, no por clave.
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

  // ─── Espacios con nombre (§5/§6/§3) ────────────────────────────────────────
  // Todo lo de arriba es PLANO por historia: nació cuando `config` solo llevaba
  // branding. De acá para abajo, cada bloque nuevo vive en su propio espacio.
  // El porqué está en `TenantConfig`, más abajo.

  /** Identidad visual editable desde el panel (§5 pantalla + tarjeta, §6 logo y paleta). */
  branding?: TenantBrandingConfig
  /** Config del QR Studio. Antes vivía SOLO en el `localStorage` del navegador (§3). */
  qr_studio?: TenantQrStudioConfig
  /**
   * RESERVADO — cuentas de terceros que el restaurante conecte (Google, Meta).
   * **No está construido y esta sesión no lo construye.** El nombre se aparta
   * ahora para que el día que exista no haya que romper nada de lo de arriba.
   *
   * ⚠️ Dos reglas que van con el nombre, y que valen desde ya:
   *
   * 1. **Acá NUNCA va un token.** `tenants.config` lo lee el service role y su
   *    proyección pública (`resolveBranding()`) viaja al navegador en cada
   *    página. Un `refresh_token` guardado acá está a un campo de distancia de
   *    filtrarse. Lo que puede vivir acá es metadato NO secreto: el id de la
   *    cuenta conectada, cuándo se conectó, qué permisos dio. Las credenciales
   *    van en su propia tabla, con RLS, fuera de `config`.
   * 2. **Nada de esto entra en la whitelist del panel** sin una decisión
   *    explícita: el endpoint de config solo escribe rutas listadas a mano.
   */
  integrations?: Record<string, unknown>
}

/**
 * Identidad visual de la marca (§5 y §6).
 *
 * TODO campo es opcional y TODO campo ausente cae al sistema de diseño de la
 * casa (`docs/features/design-system.md`): marfil #F9F8F6, Playfair + Inter,
 * gradiente #FF4D6D → #E63946, radio 24px. Lo que se agrega no es una paleta
 * nueva — es que cada marca pueda poner la suya encima.
 */
export interface TenantBrandingConfig {
  /** URL pública del logo en Storage (bucket `brand-assets`). La escribe `/api/dashboard/brand-logo`. */
  logo_url?: string
  /** Color principal: arranque del gradiente del CTA, acento del QR. */
  primary?: string
  /** Segundo tono del gradiente. Sin él se deriva del principal (`deriveGradientEnd`). */
  primary_end?: string
  /** Fondo de las pantallas públicas. Default: el marfil #F9F8F6. */
  surface?: string
  /** Texto más oscuro. Default: #1a1c1d — nunca negro puro. */
  ink?: string
  /**
   * Gradiente CSS literal de la tarjeta. Es el escape para quien quiere algo
   * que no se deriva de un color. Vacío o ausente → se deriva de `primary`.
   */
  card_bg?: string
  /** Idem para el fondo de página de la tarjeta. */
  page_bg?: string
}

/**
 * Config del QR Studio (§3). Antes vivía en seis claves de `localStorage`, así
 * que se perdía al cambiar de equipo o de navegador — y con ella el diseño del
 * material que el restaurante ya había mandado a imprenta.
 *
 * El logo NO está acá a propósito: es el mismo de `branding.logo_url`. Tener dos
 * era tener dos logos distintos en el póster y en la tarjeta.
 */
export interface TenantQrStudioConfig {
  /** Id de `QR_THEMES` (`src/lib/utils/qr-poster.ts`). */
  theme?: string
  /** Id de `QR_SIZES`. */
  size?: string
  /** Acento que pisa el del tema. Vacío = usar el del tema. */
  accent?: string
  headline?: string
  subline?: string
  /** Cuántas mesas genera el "descargar todas". */
  tables?: number
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
