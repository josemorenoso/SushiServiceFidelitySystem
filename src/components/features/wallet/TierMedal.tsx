'use client'

import { Crown } from 'lucide-react'
import type { WalletCardTheme } from '@/constants/wallet-card-theme'

/**
 * Medalla metálica de un nivel de la escalera de premios.
 *
 * Reemplaza a los emojis ✅ / 🔒 que la tarjeta usaba hasta el 2026-09-07. El
 * motivo no es capricho: un emoji lo dibuja el SISTEMA OPERATIVO, así que el
 * mismo nivel se ve distinto en un iPhone, en un Samsung y en un navegador de
 * escritorio — y esa inconsistencia es la señal número uno de "plantilla". Un
 * círculo con gradiente metálico cuesta lo mismo y se ve fabricado.
 *
 * Qué dibuja adentro:
 *   - nivel Black → una corona, alcanzado o no (es el nivel que se presume);
 *   - nivel alcanzado → el ✓ ya dibujado, quieto (el que se DIBUJA es el del
 *     sello, porque ese sí acaba de pasar);
 *   - nivel pendiente → su posición en la escalera.
 *
 * Solo pinta: quién es Black lo decide `src/lib/black-tier.ts` y los colores
 * vienen del tema (`wallet-card-theme.ts`). Acá no hay ni un hex.
 */

interface TierMedalProps {
  reached: boolean
  isBlack: boolean
  /** Posición en la escalera, empezando en 1. */
  rank: number
  theme: WalletCardTheme
}

export function TierMedal({ reached, isBlack, rank, theme }: TierMedalProps) {
  const ink = reached ? theme.medalReachedInk : theme.medalLockedInk

  return (
    <span
      aria-hidden
      className="relative shrink-0 grid place-items-center rounded-full overflow-hidden"
      style={{
        width: 32,
        height: 32,
        background: reached ? theme.medalReachedBg : theme.medalLockedBg,
        border: reached ? theme.medalReachedBorder : theme.medalLockedBorder,
        color: ink,
      }}
    >
      {isBlack ? (
        <Crown className="h-4 w-4" strokeWidth={1.8} />
      ) : reached ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-[15px] w-[15px]">
          <path
            d="M5 12.8 L9.7 17.5 L19 7.2"
            stroke="currentColor"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span className="text-[11px] font-semibold tabular-nums leading-none">{rank}</span>
      )}
    </span>
  )
}
