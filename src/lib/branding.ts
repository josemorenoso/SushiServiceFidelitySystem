/**
 * Configuración de marca — ahora POR TENANT (multitenant).
 *
 * Modelo:
 *   - `DEFAULT_BRANDING` toma los valores de las variables de entorno
 *     (NEXT_PUBLIC_BRAND_*, etc.). Son el FALLBACK del sistema y la marca de la
 *     cuenta maestra (Sushi Service), que no guarda branding en su config.
 *   - Cada tenant puede sobreescribir su marca en `tenants.config.branding`
 *     (jsonb). El resolver mezcla: valor del tenant ?? default de entorno.
 *
 * Cómo se consume:
 *   - Client components → `useBranding()` (branding-context.tsx), que recibe la
 *     marca ya resuelta por dominio desde el root layout.
 *   - Server components / webhooks → `getBrandingForHost()` (branding-server.ts)
 *     o `resolveBranding(tenant.config)` cuando ya se tiene el tenant.
 */

import type { TenantConfig } from '@/types/tenant.types'

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
}

// Gradientes de marca por defecto (tarjeta digital wallet).
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
}

/**
 * Mezcla la config plana de un tenant (`tenants.config`) sobre los defaults de
 * entorno. Cualquier campo ausente cae al default → un tenant cuya config no fije
 * un campo se ve idéntico al comportamiento por variables de entorno.
 * Las llaves siguen el esquema de `TenantConfig` (brand_name, staff_role_label, …).
 */
export function resolveBranding(config?: TenantConfig | null): Branding {
  const c = config ?? undefined
  const staffLabel = c?.staff_role_label || DEFAULT_BRANDING.staffLabel
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
    cardBg: c?.card_bg || DEFAULT_BRANDING.cardBg,
    pageBg: c?.page_bg || DEFAULT_BRANDING.pageBg,
  }
}
