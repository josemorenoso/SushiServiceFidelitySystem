/**
 * Paleta de la tarjeta digital del cliente (`/tarjeta`).
 *
 * Mandamiento II — aquí viven SOLO colores. Ni una decisión de negocio: quién es
 * Black lo resuelve `src/lib/black-tier.ts`, y el JSX vive en
 * `src/components/features/wallet/WalletCard.tsx`.
 *
 * Dos temas:
 *   - `brandWalletCardTheme(branding)` — el de siempre: gradiente de marca del
 *     tenant, texto blanco. Los valores son EXACTAMENTE los que tenía la tarjeta
 *     antes de esta refactorización (`text-white/50` → `rgba(255,255,255,0.5)`,
 *     etc.), así que el aspecto por defecto no cambia.
 *   - `BLACK_WALLET_CARD_THEME` — negro y dorado, REQUERIMIENTOS_AGOSTO_2026.md
 *     §17.2: *"al entrar a Black, la tarjeta del cliente en su celular cambia a
 *     negro y dorado"*, con distintivo claro (`badge`).
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
  /** Nombre del negocio, arriba del todo. */
  brand: string
  /** "Tarjeta de Fidelidad". */
  subtitle: string
  name: string
  points: string
  pointsUnit: string
  barTrack: string
  barFill: string
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
    brand: 'rgba(255,255,255,0.5)',
    subtitle: 'rgba(255,255,255,0.3)',
    name: '#ffffff',
    points: '#ffffff',
    pointsUnit: 'rgba(255,255,255,0.6)',
    barTrack: 'rgba(0,0,0,0.25)',
    barFill: 'rgba(255,255,255,0.5)',
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
      check: '#C1121F',
      emptyBg: 'rgba(255,255,255,0.18)',
      emptyBorder: '2px solid rgba(255,255,255,0.35)',
    },
  }
}

const GOLD = '#D4AF37'
const GOLD_BRIGHT = '#F2D479'

/** Tema Black: negro y dorado, con distintivo. §17.2. */
export const BLACK_WALLET_CARD_THEME: WalletCardTheme = {
  pageBg: 'linear-gradient(160deg, #000000 0%, #0a0a0a 45%, #141210 100%)',
  cardBg: 'linear-gradient(160deg, #0a0a0a 0%, #191919 40%, #262320 72%, #131211 100%)',
  cardBorder: `1.5px solid ${GOLD}59`,
  cardShadow: '0 25px 60px rgba(0,0,0,0.75), 0 0 50px rgba(212,175,55,0.10), inset 0 1px 0 rgba(212,175,55,0.28)',
  brand: 'rgba(212,175,55,0.75)',
  subtitle: 'rgba(212,175,55,0.4)',
  name: GOLD_BRIGHT,
  points: GOLD_BRIGHT,
  pointsUnit: 'rgba(212,175,55,0.6)',
  barTrack: 'rgba(0,0,0,0.55)',
  barFill: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_BRIGHT} 100%)`,
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
