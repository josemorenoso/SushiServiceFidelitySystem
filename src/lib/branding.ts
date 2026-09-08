/**
 * Configuración de marca — POR TENANT (multitenant).
 *
 * Modelo:
 *   - `DEFAULT_BRANDING` toma los valores de las variables de entorno
 *     (NEXT_PUBLIC_BRAND_*, etc.) y del sistema de diseño de la casa. Son el
 *     FALLBACK del sistema y la marca de la cuenta maestra (Sushi Service), que
 *     no guarda branding en su config.
 *   - Cada tenant puede sobreescribir su marca en `tenants.config`. El resolver
 *     mezcla: valor del tenant ?? default.
 *
 * DÓNDE MIRA EL RESOLVER, Y EN QUÉ ORDEN (§5/§6)
 * ──────────────────────────────────────────────
 * Hay dos generaciones de claves en el mismo jsonb y el orden entre ellas no es
 * casual (ver el comentario largo de `TenantConfig`):
 *
 *   1. `config.branding.*`  — lo que edita el panel desde §5/§6. Manda.
 *   2. lo derivado del color principal del tenant, si eligió uno.
 *   3. `config.card_bg` / `config.page_bg` — las claves planas de siempre,
 *      sembradas por SQL al dar de alta el tenant. Se siguen leyendo para que
 *      ningún tenant vivo cambie de aspecto por esta sesión.
 *   4. El literal del sistema de diseño.
 *
 * ⚠️ LO QUE SALE DE ACÁ VIAJA AL NAVEGADOR. `Branding` es la proyección PÚBLICA
 * de `tenants.config`: el root layout la inyecta en el HTML de toda página. Si
 * algún día `config` guarda metadatos de la cuenta de Google o de Meta del
 * restaurante, NO se agregan campos acá para exponerlos "porque son útiles".
 *
 * Cómo se consume:
 *   - Client components → `useBranding()` (branding-context.tsx).
 *   - Server components / webhooks → `getBrandingForHost()` (branding-server.ts)
 *     o `resolveBranding(tenant.config)` cuando ya se tiene el tenant.
 *   - CSS de las pantallas públicas → `brandCssVars()` (brand-css.ts).
 */

import type { TenantConfig } from '@/types/tenant.types'
import {
  DEFAULT_CARD_MOTIF,
  DEFAULT_STAMP_ICON,
  isCardMotifId,
  isStampIconId,
  type CardMotifId,
  type StampIconId,
} from '@/constants/card-extras'
import {
  INK,
  deriveCardGradient,
  deriveGradientEnd,
  derivePageGradient,
  deriveStampCheck,
  normalizeHex,
  onColor,
  qrSafe,
} from './brand-palette'

export interface Branding {
  name: string
  short: string
  tagline: string
  description: string
  /** Label del rol de staff. Restaurante: "Mesero" | Barbería: "Barbero" | Café: "Barista". */
  staffLabel: string
  staffLabelPlural: string
  /** URL de reseña en Google Maps (botón post check-in). */
  googleReviewUrl: string
  /** Link de WhatsApp del negocio (respuestas automáticas / privacidad). */
  whatsappLink: string | null
  /** Perfil de Instagram. Contacto alterno cuando el negocio no atiende por WhatsApp. */
  instagramUrl: string | null
  /** Teléfono de domicilios (fallback para armar el link de WhatsApp). */
  deliveryPhone: string | null
  /** Gradiente de fondo de la tarjeta digital. */
  cardBg: string
  /** Gradiente de fondo de página de la tarjeta/wallet. */
  pageBg: string

  // ─── Identidad visual (§5 pantalla + tarjeta, §6 logo y paleta) ────────────

  /** Logo del restaurante (Storage, público). `null` = se dibuja el ícono genérico. */
  logoUrl: string | null
  /** Color principal: arranque del gradiente del CTA. */
  primary: string
  /** Segundo tono del gradiente del CTA. */
  primaryEnd: string
  /** Texto legible ENCIMA de `primary`. Blanco o tinta, según contraste. */
  onPrimary: string
  /** Fondo de las pantallas públicas (el marfil, por defecto). */
  surface: string
  /** Texto más oscuro. Nunca negro puro. */
  ink: string
  /** Color del ✓ dentro de un sello lleno. */
  stampCheck: string
  /** Versión del principal con contraste suficiente para dibujar un QR. */
  qrForeground: string

  // ─── Tarjeta principal (dueño, 2026-09-08) ──────────────────────────────────
  /** Lo que la tarjeta muestra además de puntos y sellos. Siempre presente; vacío = la tarjeta de siempre. */
  card: CardExtras
}

/**
 * Proyección pública de `tenants.config.card`. Todo es `null` cuando no está
 * configurado, y la tarjeta no dibuja la sección. Instagram y WhatsApp siguen
 * en `Branding.instagramUrl` / `Branding.whatsappLink` (claves planas).
 */
export interface CardExtras {
  stampIcon: StampIconId
  motif: CardMotifId
  description: string | null
  facebookUrl: string | null
  tiktokUrl: string | null
  websiteUrl: string | null
  googleProfileUrl: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  hours: string | null
  policies: string | null
}

export const EMPTY_CARD_EXTRAS: CardExtras = {
  stampIcon: DEFAULT_STAMP_ICON,
  motif: DEFAULT_CARD_MOTIF,
  description: null,
  facebookUrl: null,
  tiktokUrl: null,
  websiteUrl: null,
  googleProfileUrl: null,
  contactPhone: null,
  contactEmail: null,
  address: null,
  hours: null,
  policies: null,
}

// ─── Literales del sistema de diseño (docs/features/design-system.md) ────────
// Son los valores que el producto tiene HOY. Un tenant sin color propio recibe
// estos, no una derivación: nadie que no haya pedido un cambio ve un cambio.
const DESIGN_PRIMARY = '#FF4D6D'
const DESIGN_PRIMARY_END = '#E63946'
const DESIGN_SURFACE = '#F9F8F6'
const DESIGN_STAMP_CHECK = '#C1121F'
const DEFAULT_CARD_BG = 'linear-gradient(160deg, #7B0D1E 0%, #C1121F 35%, #E63946 75%, #FF6B6B 100%)'
const DEFAULT_PAGE_BG = 'linear-gradient(160deg, #2D0000 0%, #5A0A15 50%, #8B1A2A 100%)'

/** Centinela de "sin link de reseñas" cuando ni el tenant ni el entorno lo definen. */
export const NO_GOOGLE_REVIEW_URL = '#'

/** Marca por defecto del sistema, tomada de variables de entorno. */
export const DEFAULT_BRANDING: Branding = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Constelarys Fidelity System',
  short: process.env.NEXT_PUBLIC_BRAND_SHORT || 'Constelarys',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Programa de Fidelidad',
  description:
    process.env.NEXT_PUBLIC_BRAND_DESCRIPTION ||
    'Registra tus visitas, acumula premios y disfruta de beneficios exclusivos.',
  staffLabel: process.env.NEXT_PUBLIC_STAFF_ROLE_LABEL || 'Mesero',
  staffLabelPlural: `${process.env.NEXT_PUBLIC_STAFF_ROLE_LABEL || 'Mesero'}s`,
  googleReviewUrl: process.env.NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL || NO_GOOGLE_REVIEW_URL,
  whatsappLink: process.env.RESTAURANT_WHATSAPP_LINK || null,
  instagramUrl: null,
  deliveryPhone: process.env.DELIVERY_PHONE_NUMBER || null,
  cardBg: DEFAULT_CARD_BG,
  pageBg: DEFAULT_PAGE_BG,
  logoUrl: null,
  primary: DESIGN_PRIMARY,
  primaryEnd: DESIGN_PRIMARY_END,
  onPrimary: '#ffffff',
  surface: DESIGN_SURFACE,
  ink: INK,
  stampCheck: DESIGN_STAMP_CHECK,
  qrForeground: qrSafe(DESIGN_PRIMARY_END),
  card: EMPTY_CARD_EXTRAS,
}

/** Trata la cadena vacía, `null` y `undefined` como "no configurado". */
function text(value: string | null | undefined): string | null {
  const v = typeof value === 'string' ? value.trim() : ''
  return v.length > 0 ? v : null
}

/**
 * Mezcla la config de la SEDE sobre la de la MARCA, campo a campo.
 *
 * Solo el primer nivel y `card`, que es la única forma que tiene el `config` de
 * una sede (lo garantiza el CHECK `chk_restaurant_locations_config_whitelist`,
 * migración 00058 §1). Un valor vacío o ausente en la sede NO pisa: es como una
 * sede dice *"esto lo hereda de la marca"*, y es lo que hace que una sede recién
 * creada —`config = {}`— se comporte bit a bit como antes de la 00058.
 *
 * PURA a propósito: es la regla de precedencia entera, probable sin base.
 */
export function mergeLocationOverConfig(
  brand?: TenantConfig | null,
  location?: TenantConfig | null
): TenantConfig | undefined {
  if (!location) return brand ?? undefined
  // `TenantConfig` tiene claves declaradas, no un index signature: el puente por
  // `unknown` es lo que permite recorrerla por nombre sin aflojar el tipo público.
  const base = (brand ?? {}) as unknown as Record<string, unknown>
  const over = location as unknown as Record<string, unknown>

  const out: Record<string, unknown> = { ...base }

  for (const [k, v] of Object.entries(over)) {
    if (k === 'card') continue
    // `text()` es el mismo criterio de "no configurado" que usa todo el archivo:
    // '' y null heredan, en vez de borrar el dato de la marca.
    if (text(v as string | null | undefined) !== null) out[k] = v
  }

  const cardBase = (base.card ?? {}) as Record<string, unknown>
  const cardOver = (over.card ?? {}) as Record<string, unknown>
  const card: Record<string, unknown> = { ...cardBase }
  for (const [k, v] of Object.entries(cardOver)) {
    if (text(v as string | null | undefined) !== null) card[k] = v
  }
  if (Object.keys(card).length > 0) out.card = card

  return out as unknown as TenantConfig
}

/**
 * Mezcla la config de un tenant (`tenants.config`) sobre los defaults.
 * Cualquier campo ausente cae al default → un tenant cuya config no fije un
 * campo se ve idéntico al comportamiento anterior a §5/§6.
 *
 * `locationConfig` es el override de la SEDE (`restaurant_locations.config`,
 * migración 00058). Existe porque cada local tiene su propia ficha de Google, su
 * propia dirección y su propio teléfono, y sin esto las dos sedes de una marca
 * mandaban a reseñar la MISMA ficha: la de la segunda sede nacía muerta.
 *
 * Lo que la sede NO puede pisar —nombre, logo, colores, sellos— lo impone la
 * whitelist, no este archivo. El porqué está en `src/lib/location-config-paths.ts`:
 * la tarjeta muestra puntos que son de la MARCA, así que si la identidad
 * cambiara con la sede, la tarjeta mentiría.
 */
export function resolveBranding(
  config?: TenantConfig | null,
  locationConfig?: TenantConfig | null
): Branding {
  const c = mergeLocationOverConfig(config, locationConfig)
  const b = c?.branding ?? undefined
  const staffLabel = c?.staff_role_label || DEFAULT_BRANDING.staffLabel

  // Paleta. Si el tenant no eligió color, TODO lo de abajo queda en el literal
  // del sistema de diseño y no se deriva nada.
  const primary = normalizeHex(b?.primary)
  const primaryEnd = normalizeHex(b?.primary_end) ?? (primary ? deriveGradientEnd(primary) : null)
  const effPrimary = primary ?? DEFAULT_BRANDING.primary
  const effPrimaryEnd = primaryEnd ?? DEFAULT_BRANDING.primaryEnd

  // El gradiente de la tarjeta: literal del panel → derivado del color →
  // la clave plana de siempre → el literal del sistema de diseño.
  const cardBg =
    text(b?.card_bg) ??
    (primary ? deriveCardGradient(effPrimary, effPrimaryEnd) : null) ??
    text(c?.card_bg) ??
    DEFAULT_BRANDING.cardBg
  const pageBg =
    text(b?.page_bg) ??
    (primary ? derivePageGradient(effPrimaryEnd) : null) ??
    text(c?.page_bg) ??
    DEFAULT_BRANDING.pageBg

  return {
    name: c?.brand_name || DEFAULT_BRANDING.name,
    short: c?.brand_short || DEFAULT_BRANDING.short,
    tagline: c?.brand_tagline || DEFAULT_BRANDING.tagline,
    description: c?.brand_description || DEFAULT_BRANDING.description,
    staffLabel,
    staffLabelPlural: `${staffLabel}s`,
    googleReviewUrl: c?.google_maps_url || DEFAULT_BRANDING.googleReviewUrl,
    whatsappLink: c?.whatsapp_link || DEFAULT_BRANDING.whatsappLink,
    instagramUrl: c?.instagram_url || DEFAULT_BRANDING.instagramUrl,
    deliveryPhone: c?.delivery_phone || DEFAULT_BRANDING.deliveryPhone,
    cardBg,
    pageBg,
    logoUrl: text(b?.logo_url),
    primary: effPrimary,
    primaryEnd: effPrimaryEnd,
    onPrimary: primary ? onColor(effPrimary) : DEFAULT_BRANDING.onPrimary,
    surface: normalizeHex(b?.surface) ?? DEFAULT_BRANDING.surface,
    ink: normalizeHex(b?.ink) ?? DEFAULT_BRANDING.ink,
    stampCheck: primary ? deriveStampCheck(effPrimaryEnd) : DEFAULT_BRANDING.stampCheck,
    qrForeground: primary ? qrSafe(effPrimaryEnd) : DEFAULT_BRANDING.qrForeground,
    card: resolveCardExtras(c),
  }
}

/**
 * Proyecta `config.card`. Un id de sello o de decoración que no esté en el
 * catálogo cae al default en vez de romper la tarjeta: el catálogo puede
 * encoger y la config guardada, no.
 */
function resolveCardExtras(c?: TenantConfig): CardExtras {
  const k = c?.card
  if (!k) return EMPTY_CARD_EXTRAS
  return {
    stampIcon: isStampIconId(k.stamp_icon) ? k.stamp_icon : DEFAULT_STAMP_ICON,
    motif: isCardMotifId(k.motif) ? k.motif : DEFAULT_CARD_MOTIF,
    description: text(k.description),
    facebookUrl: text(k.facebook_url),
    tiktokUrl: text(k.tiktok_url),
    websiteUrl: text(k.website_url),
    googleProfileUrl: text(k.google_profile_url),
    contactPhone: text(k.contact_phone),
    contactEmail: text(k.contact_email),
    address: text(k.address),
    hours: text(k.hours),
    policies: text(k.policies),
  }
}
