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
}

/** Trata la cadena vacía, `null` y `undefined` como "no configurado". */
function text(value: string | null | undefined): string | null {
  const v = typeof value === 'string' ? value.trim() : ''
  return v.length > 0 ? v : null
}

/**
 * Mezcla la config de un tenant (`tenants.config`) sobre los defaults.
 * Cualquier campo ausente cae al default → un tenant cuya config no fije un
 * campo se ve idéntico al comportamiento anterior a §5/§6.
 */
export function resolveBranding(config?: TenantConfig | null): Branding {
  const c = config ?? undefined
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
  }
}
