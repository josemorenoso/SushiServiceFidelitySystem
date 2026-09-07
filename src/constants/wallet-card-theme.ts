/**
 * Paleta de la tarjeta digital del cliente (`/tarjeta`).
 *
 * Mandamiento II — aquí viven SOLO colores. Ni una decisión de negocio: quién es
 * Black lo resuelve `src/lib/black-tier.ts`, y el JSX vive en
 * `src/components/features/wallet/WalletCard.tsx`.
 *
 * Dos temas:
 *   - `brandWalletCardTheme(branding)` — el de siempre: gradiente de marca del
 *     tenant, texto blanco. Desde §6, los tres que SÍ dependen de la marca
 *     (`pageBg`, `cardBg` y el ✓ del sello) los trae `Branding` ya resueltos; un
 *     tenant sin color propio recibe los literales del sistema de diseño.
 *   - `BLACK_WALLET_CARD_THEME` — negro y dorado, REQUERIMIENTOS_AGOSTO_2026.md
 *     §17.2: *"al entrar a Black, la tarjeta del cliente en su celular cambia a
 *     negro y dorado"*, con distintivo claro (`badge`).
 *
 * ⚠️ **Lo que cambió el 2026-09-07 (capa visual v3).** Hasta esa fecha estos
 * valores eran, uno por uno, los que la tarjeta tenía horneados en clases de
 * Tailwind, y el aspecto por defecto no había cambiado nunca. Ahora sí cambió, y
 * a pedido del dueño: entraron `shine`, `pointsShadow`, `barFillGlow`,
 * `barSweep`, las cuatro `medal*` y el `ring` de los sellos, y `barFill` pasó de
 * un blanco plano a un gradiente. El origen es el "Kit Visual Cada1"
 * (investigación sobre 21st.dev, 2026-09-07) y sus cuatro reglas están citadas
 * en el bloque nuevo de `globals.css`.
 *
 * Ninguno de los campos nuevos suma un color de marca: en el tema de marca son
 * blancos y transparencias sobre el gradiente del tenant, y en el Black son el
 * mismo par de dorados de acá abajo. Un tenant que eligió su color sigue
 * mandando sobre todo lo que se ve.
 *
 * El dorado es `#D4AF37` (oro viejo) con `#F2D479` de realce, no el `#FFD700`
 * puro: sobre negro, el amarillo saturado se lee barato y vibra en pantallas AMOLED.
 * Mismo criterio que la regla 2 del sistema de diseño ("sin negro puro"), aplicada
 * al otro extremo de la escala.
 */

import type { Branding } from '@/lib/branding'

/** Colores de la cuadrícula de sellos (`StampsGrid`). */
export interface StampsTheme {
  label: string
  filledBg: string
  filledBorder: string
  filledShadow: string
  /** Color del ✓ dentro del sello lleno. */
  check: string
  /** Color de la onda que sale del sello recién ganado (regla 02: confirma). */
  ring: string
  emptyBg: string
  emptyBorder: string
}

/** Distintivo de miembro Black. Solo lo trae el tema Black. */
export interface WalletCardBadge {
  label: string
  bg: string
  border: string
  text: string
}

export interface WalletCardTheme {
  pageBg: string
  cardBg: string
  cardBorder: string
  cardShadow: string
  /**
   * Gradiente cónico del borde vivo. Arranca en `from var(--shine-ang)` — el
   * ángulo que anima `globals.css`— y es lo ÚNICO que brilla en la pantalla
   * (regla 01 del kit visual).
   */
  shine: string
  /** Nombre del negocio, arriba del todo. */
  brand: string
  /** "Tarjeta de Fidelidad". */
  subtitle: string
  name: string
  points: string
  pointsUnit: string
  /** Halo detrás del número grande. Regla 03: profundidad por luz, no por gris. */
  pointsShadow: string
  barTrack: string
  barFill: string
  /** Resplandor del relleno de la barra, del mismo color que el relleno. */
  barFillGlow: string
  /** Barrido de luz que cruza la barra. Dice "esto está vivo". */
  barSweep: string
  barLabel: string
  barLabelShadow: string
  /** "Faltan N pts para X". */
  hint: string
  hintStrong: string
  divider: string
  /** "Tu camino de recompensas". */
  sectionLabel: string
  tierReachedBg: string
  tierReachedBorder: string
  tierLockedBg: string
  tierLockedBorder: string
  tierName: string
  tierReward: string
  tierPts: string
  /**
   * Medalla metálica de cada nivel. Reemplaza los emojis ✅/🔒: un emoji se
   * dibuja distinto en cada teléfono y delata la plantilla.
   */
  medalReachedBg: string
  medalReachedBorder: string
  /** Color del ✓ dibujado DENTRO de la medalla alcanzada. */
  medalReachedInk: string
  medalLockedBg: string
  medalLockedBorder: string
  medalLockedInk: string
  ctaBg: string
  ctaBorder: string
  ctaLabel: string
  ctaLink: string
  footer: string
  stamps: StampsTheme
  badge?: WalletCardBadge
}

/** Tema por defecto: el gradiente de marca del tenant sobre texto blanco. */
export function brandWalletCardTheme(branding: Branding): WalletCardTheme {
  return {
    pageBg: branding.pageBg,
    cardBg: branding.cardBg,
    cardBorder: '1.5px solid rgba(255,255,255,0.22)',
    cardShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
    // Blanco a propósito: la tarjeta ya ES el color del tenant, así que el haz
    // tiene que ser luz, no un segundo color que pelee con la marca.
    shine:
      'conic-gradient(from var(--shine-ang), transparent 0 62%, rgba(255,255,255,0.22) 72%, rgba(255,255,255,0.95) 84%, rgba(255,255,255,0.35) 89%, transparent 96%)',
    brand: 'rgba(255,255,255,0.5)',
    subtitle: 'rgba(255,255,255,0.3)',
    name: '#ffffff',
    points: '#ffffff',
    pointsUnit: 'rgba(255,255,255,0.6)',
    pointsShadow: '0 10px 30px rgba(0,0,0,0.35)',
    barTrack: 'rgba(0,0,0,0.25)',
    // Antes era un plano `rgba(255,255,255,0.5)`. El gradiente le da volumen sin
    // sumar un color: sigue siendo luz blanca sobre el gradiente de la marca.
    barFill:
      'linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.95) 55%, rgba(255,255,255,0.7) 100%)',
    barFillGlow: '0 0 18px rgba(255,255,255,0.35)',
    barSweep:
      'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
    barLabel: '#ffffff',
    barLabelShadow: '0 1px 3px rgba(0,0,0,0.35)',
    hint: 'rgba(255,255,255,0.5)',
    hintStrong: 'rgba(255,255,255,0.75)',
    divider: 'rgba(255,255,255,0.12)',
    sectionLabel: 'rgba(255,255,255,0.4)',
    tierReachedBg: 'rgba(255,255,255,0.18)',
    tierReachedBorder: '1px solid rgba(255,255,255,0.35)',
    tierLockedBg: 'rgba(255,255,255,0.07)',
    tierLockedBorder: '1px solid rgba(255,255,255,0.12)',
    tierName: '#ffffff',
    tierReward: 'rgba(255,255,255,0.5)',
    tierPts: 'rgba(255,255,255,0.4)',
    medalReachedBg:
      'linear-gradient(145deg, #ffffff 0%, rgba(255,255,255,0.78) 62%, #ffffff 100%)',
    medalReachedBorder: '1px solid rgba(255,255,255,0.9)',
    medalReachedInk: branding.stampCheck,
    medalLockedBg:
      'linear-gradient(145deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
    medalLockedBorder: '1px solid rgba(255,255,255,0.2)',
    medalLockedInk: 'rgba(255,255,255,0.45)',
    ctaBg: 'rgba(255,255,255,0.1)',
    ctaBorder: '1px solid rgba(255,255,255,0.18)',
    ctaLabel: 'rgba(255,255,255,0.55)',
    ctaLink: '#ffffff',
    footer: 'rgba(255,255,255,0.2)',
    stamps: {
      label: 'rgba(255,255,255,0.5)',
      filledBg: 'rgba(255,255,255,1)',
      filledBorder: '2px solid rgba(255,255,255,0.9)',
      filledShadow: '0 2px 8px rgba(0,0,0,0.18)',
      // Antes era el literal '#C1121F'. Ahora sale de la marca: `resolveBranding()`
      // lo deriva del color del tenant y, si no eligió ninguno, devuelve ese
      // mismo literal — la tarjeta por defecto no cambió ni un píxel (§6).
      check: branding.stampCheck,
      ring: 'rgba(255,255,255,0.6)',
      emptyBg: 'rgba(255,255,255,0.18)',
      emptyBorder: '2px solid rgba(255,255,255,0.35)',
    },
  }
}

/**
 * El par de dorados del sistema. Se exportan porque la Golden Box (§ mystery
 * box) tiene que usar EXACTAMENTE estos: dos dorados parecidos pero distintos en
 * dos pantallas del mismo producto es justo lo que hace que algo se vea armado a
 * pedazos.
 */
export const GOLD = '#D4AF37'
export const GOLD_BRIGHT = '#F2D479'

/** Tema Black: negro y dorado, con distintivo. §17.2. */
export const BLACK_WALLET_CARD_THEME: WalletCardTheme = {
  pageBg: 'linear-gradient(160deg, #000000 0%, #0a0a0a 45%, #141210 100%)',
  cardBg: 'linear-gradient(160deg, #0a0a0a 0%, #191919 40%, #262320 72%, #131211 100%)',
  cardBorder: `1.5px solid ${GOLD}59`,
  cardShadow: '0 25px 60px rgba(0,0,0,0.75), 0 0 50px rgba(212,175,55,0.10), inset 0 1px 0 rgba(212,175,55,0.28)',
  shine: `conic-gradient(from var(--shine-ang), transparent 0 58%, rgba(212,175,55,0.25) 70%, ${GOLD_BRIGHT} 83%, rgba(255,255,255,0.85) 87%, transparent 95%)`,
  brand: 'rgba(212,175,55,0.75)',
  subtitle: 'rgba(212,175,55,0.4)',
  name: GOLD_BRIGHT,
  points: GOLD_BRIGHT,
  pointsUnit: 'rgba(212,175,55,0.6)',
  pointsShadow: '0 0 34px rgba(212,175,55,0.35)',
  barTrack: 'rgba(0,0,0,0.55)',
  barFill: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_BRIGHT} 100%)`,
  barFillGlow: '0 0 18px rgba(212,175,55,0.45)',
  barSweep:
    'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
  barLabel: '#0a0a0a',
  barLabelShadow: '0 1px 2px rgba(242,212,121,0.45)',
  hint: 'rgba(212,175,55,0.6)',
  hintStrong: GOLD_BRIGHT,
  divider: 'rgba(212,175,55,0.22)',
  sectionLabel: 'rgba(212,175,55,0.55)',
  tierReachedBg: 'rgba(212,175,55,0.13)',
  tierReachedBorder: `1px solid ${GOLD}66`,
  tierLockedBg: 'rgba(255,255,255,0.04)',
  tierLockedBorder: '1px solid rgba(212,175,55,0.14)',
  tierName: '#f5f0e6',
  tierReward: 'rgba(212,175,55,0.65)',
  tierPts: 'rgba(212,175,55,0.5)',
  medalReachedBg: `linear-gradient(145deg, ${GOLD_BRIGHT} 0%, ${GOLD} 58%, #A8862A 100%)`,
  medalReachedBorder: `1px solid ${GOLD_BRIGHT}`,
  medalReachedInk: '#0a0a0a',
  medalLockedBg:
    'linear-gradient(145deg, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.04) 100%)',
  medalLockedBorder: `1px solid ${GOLD}30`,
  medalLockedInk: 'rgba(212,175,55,0.5)',
  ctaBg: 'rgba(212,175,55,0.08)',
  ctaBorder: `1px solid ${GOLD}3d`,
  ctaLabel: 'rgba(212,175,55,0.6)',
  ctaLink: GOLD_BRIGHT,
  footer: 'rgba(212,175,55,0.3)',
  stamps: {
    label: 'rgba(212,175,55,0.6)',
    filledBg: `linear-gradient(135deg, ${GOLD_BRIGHT} 0%, ${GOLD} 55%, #A8862A 100%)`,
    filledBorder: `2px solid ${GOLD_BRIGHT}`,
    filledShadow: '0 2px 10px rgba(212,175,55,0.35)',
    check: '#0a0a0a',
    ring: 'rgba(242,212,121,0.55)',
    emptyBg: 'rgba(212,175,55,0.08)',
    emptyBorder: `2px solid ${GOLD}3d`,
  },
  badge: {
    label: 'Miembro Black',
    bg: 'rgba(212,175,55,0.12)',
    border: `1px solid ${GOLD}66`,
    text: GOLD_BRIGHT,
  },
}
