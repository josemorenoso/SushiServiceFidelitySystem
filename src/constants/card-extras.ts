/**
 * Catálogos cerrados de la "Tarjeta principal" (dueño, 2026-09-08).
 *
 * El dueño pidió *"símbolos bonitos a los sellos de la tarjeta"* y *"figuritas
 * tipo contorno para decorar"*. Las dos cosas son LISTAS CERRADAS a propósito:
 *
 *   · un id de acá termina en `tenants.config.card.*`, que es público y viaja
 *     al navegador en cada página. Un id no puede ejecutar nada; un SVG subido
 *     por el dueño, sí. Por eso no hay "subí tu propio ícono".
 *   · el dibujo de cada id vive en el cliente (`StampIcon.tsx`, `CardMotif.tsx`)
 *     y se pinta con los colores del tema de la tarjeta, así que una marca que
 *     cambie su paleta cambia también sus sellos y su decoración. Ni un hex acá.
 *
 * Este módulo NO importa nada de React ni de lucide: lo lee la whitelist del
 * server (`src/lib/tenant-config-paths.ts`) y los componentes del cliente. Es
 * el mismo criterio que `QR_THEME_IDS`, pero sin la copia a mano: acá la
 * lista se importa de un solo lado.
 */

/** Símbolo que va dentro de cada sello lleno. `check` es el de siempre. */
export const STAMP_ICON_IDS = [
  'check',
  'star',
  'heart',
  'utensils',
  'chef_hat',
  'pizza',
  'fish',
  'coffee',
  'wine',
  'beer',
  'ice_cream',
  'cake',
  'croissant',
  'flame',
  'leaf',
  'gem',
  'crown',
  'sparkles',
  'scissors',
  'paw',
] as const

export type StampIconId = (typeof STAMP_ICON_IDS)[number]

export const STAMP_ICON_LABELS: Record<StampIconId, string> = {
  check: 'Chulo',
  star: 'Estrella',
  heart: 'Corazón',
  utensils: 'Cubiertos',
  chef_hat: 'Gorro de chef',
  pizza: 'Pizza',
  fish: 'Pescado',
  coffee: 'Café',
  wine: 'Copa de vino',
  beer: 'Cerveza',
  ice_cream: 'Helado',
  cake: 'Torta',
  croissant: 'Croissant',
  flame: 'Llama',
  leaf: 'Hoja',
  gem: 'Gema',
  crown: 'Corona',
  sparkles: 'Destellos',
  scissors: 'Tijeras',
  paw: 'Huella',
}

/**
 * Decoración de contorno detrás del contenido de la tarjeta. Se dibuja en
 * blanco translúcido sobre el gradiente, así que sirve para cualquier paleta.
 */
export const CARD_MOTIF_IDS = [
  'none',
  'ornamento',
  'puntos',
  'ondas',
  'hojas',
  'estrellas',
  'geometrico',
] as const

export type CardMotifId = (typeof CARD_MOTIF_IDS)[number]

export const CARD_MOTIF_LABELS: Record<CardMotifId, string> = {
  none: 'Sin decoración',
  ornamento: 'Ornamento clásico',
  puntos: 'Puntos',
  ondas: 'Ondas',
  hojas: 'Hojas',
  estrellas: 'Estrellas',
  geometrico: 'Geométrico',
}

export const DEFAULT_STAMP_ICON: StampIconId = 'check'
export const DEFAULT_CARD_MOTIF: CardMotifId = 'none'

export function isStampIconId(value: unknown): value is StampIconId {
  return typeof value === 'string' && (STAMP_ICON_IDS as readonly string[]).includes(value)
}

export function isCardMotifId(value: unknown): value is CardMotifId {
  return typeof value === 'string' && (CARD_MOTIF_IDS as readonly string[]).includes(value)
}
