/**
 * Configuración de marca del sistema.
 *
 * Para personalizar por cliente (clone-per-client):
 * - Modifica solo este archivo al hacer fork/clone para un nuevo negocio.
 * - También considera variables de entorno si prefieres sin editar código:
 *   NEXT_PUBLIC_BRAND_NAME, NEXT_PUBLIC_BRAND_SHORT, NEXT_PUBLIC_BRAND_TAGLINE
 */

export const BRAND_NAME =
  process.env.NEXT_PUBLIC_BRAND_NAME || 'Constelarys Fidelity System'

export const BRAND_SHORT =
  process.env.NEXT_PUBLIC_BRAND_SHORT || 'Constelarys'

export const BRAND_TAGLINE =
  process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Programa de Fidelidad'

export const BRAND_DESCRIPTION =
  process.env.NEXT_PUBLIC_BRAND_DESCRIPTION ||
  'Registra tus visitas, acumula premios y disfruta de beneficios exclusivos.'

// Label del rol del staff — cambia por cliente según tipo de negocio
// Restaurante: "Mesero" | Barbería: "Barbero" | etc.
export const STAFF_LABEL =
  process.env.NEXT_PUBLIC_STAFF_ROLE_LABEL ?? 'Mesero'

export const STAFF_LABEL_PLURAL = `${STAFF_LABEL}s`

// Gradientes de marca para la tarjeta digital wallet
export const BRAND_CARD_BG = 'linear-gradient(160deg, #7B0D1E 0%, #C1121F 35%, #E63946 75%, #FF6B6B 100%)'
export const BRAND_PAGE_BG = 'linear-gradient(160deg, #2D0000 0%, #5A0A15 50%, #8B1A2A 100%)'
