'use client'

import { Crown } from 'lucide-react'
import type { MedalPalette } from '@/constants/tier-medal-theme'

/**
 * Medalla metálica de un nivel de la escalera de premios.
 *
 * Reemplaza a los emojis 🥉🥈🥇💎 / ✅ / 🔒 que las pantallas usaban hasta el
 * 2026-09-07. El motivo no es capricho: un emoji lo dibuja el SISTEMA OPERATIVO,
 * así que el mismo nivel se ve distinto en un iPhone, en un Samsung y en un
 * navegador de escritorio — y esa inconsistencia es la señal número uno de
 * "plantilla". Un círculo con gradiente metálico cuesta lo mismo y se ve
 * fabricado.
 *
 * Qué dibuja adentro:
 *   - nivel Black → una corona, alcanzado o no (es el nivel que se presume);
 *   - nivel alcanzado → un ✓ quieto (el que se DIBUJA es el del sello de la
 *     tarjeta, porque ese sí acaba de pasar);
 *   - nivel pendiente → su posición en la escalera.
 *
 * Solo pinta. Los colores llegan en `palette` (`src/constants/tier-medal-theme.ts`)
 * y salen de la marca del tenant: acá no hay ni un hex.
 */

interface TierMedalProps {
  reached: boolean
  isBlack: boolean
  /** Posición en la escalera, empezando en 1. */
  rank: number
  palette: MedalPalette
  /** Diámetro en px. 32 en las listas, más grande en el carrusel de premios. */
  size?: number
}

export function TierMedal({ reached, isBlack, rank, palette, size = 32 }: TierMedalProps) {
  const glyph = Math.round(size * 0.46)

  return (
    <span
      aria-hidden
      className="relative shrink-0 grid place-items-center rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        background: reached ? palette.reachedBg : palette.lockedBg,
        border: reached ? palette.reachedBorder : palette.lockedBorder,
        color: reached ? palette.reachedInk : palette.lockedInk,
      }}
    >
      {isBlack ? (
        <Crown style={{ width: glyph, height: glyph }} strokeWidth={1.8} />
      ) : reached ? (
        <svg viewBox="0 0 24 24" fill="none" style={{ width: glyph, height: glyph }}>
          <path
            d="M5 12.8 L9.7 17.5 L19 7.2"
            stroke="currentColor"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span
          className="font-semibold tabular-nums leading-none"
          style={{ fontSize: Math.round(size * 0.36) }}
        >
          {rank}
        </span>
      )}
    </span>
  )
}
