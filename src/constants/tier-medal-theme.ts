/**
 * Paleta de la medalla de un nivel de premios.
 *
 * Mandamiento II — acá viven SOLO colores. Qué nivel está alcanzado lo decide
 * quien dibuja; quién es Black, `src/lib/black-tier.ts`.
 *
 * Existe porque la MISMA medalla aparece sobre dos fondos muy distintos:
 *
 *   - sobre el gradiente de la marca (la tarjeta del cliente, `/tarjeta` y la
 *     del check-in) → `walletMedalPalette()`, que la saca del tema de la
 *     tarjeta y por lo tanto también funciona en la variante Black (§17.2);
 *   - sobre el marfil de las pantallas públicas (el camino de recompensas y el
 *     carrusel de premios del check-in) → `surfaceMedalPalette()`.
 *
 * Ninguna de las dos hornea un color de marca: la primera lo hereda del tema de
 * la tarjeta y la segunda lo saca de `Branding`. Los grises salen de las
 * variables del sistema (`--brand-ink-*`), que a propósito NO son de marca.
 */

import type { Branding } from '@/lib/branding'
import type { WalletCardTheme } from './wallet-card-theme'

export interface MedalPalette {
  reachedBg: string
  reachedBorder: string
  reachedInk: string
  lockedBg: string
  lockedBorder: string
  lockedInk: string
}

/** La medalla sobre la tarjeta (gradiente de marca, o negro y dorado). */
export function walletMedalPalette(theme: WalletCardTheme): MedalPalette {
  return {
    reachedBg: theme.medalReachedBg,
    reachedBorder: theme.medalReachedBorder,
    reachedInk: theme.medalReachedInk,
    lockedBg: theme.medalLockedBg,
    lockedBorder: theme.medalLockedBorder,
    lockedInk: theme.medalLockedInk,
  }
}

/** La medalla sobre el marfil de las pantallas públicas. */
export function surfaceMedalPalette(branding: Branding): MedalPalette {
  return {
    reachedBg: `linear-gradient(145deg, ${branding.primary} 0%, ${branding.primaryEnd} 62%, ${branding.primary} 100%)`,
    reachedBorder: `1px solid ${branding.primaryEnd}`,
    reachedInk: branding.onPrimary,
    lockedBg: 'linear-gradient(145deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.02) 100%)',
    lockedBorder: '1px solid rgba(0,0,0,0.07)',
    lockedInk: 'var(--brand-ink-muted)',
  }
}
