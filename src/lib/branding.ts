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
