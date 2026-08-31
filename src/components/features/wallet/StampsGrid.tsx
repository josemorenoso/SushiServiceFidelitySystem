'use client'

import { brandWalletCardTheme, type StampsTheme } from '@/constants/wallet-card-theme'
import { DEFAULT_BRANDING } from '@/lib/branding'

const STAMPS_COUNT = 10

/** Colores de siempre (blanco sobre el gradiente rojo de marca). */
const DEFAULT_STAMPS_THEME: StampsTheme = brandWalletCardTheme(DEFAULT_BRANDING).stamps

interface StampsGridProps {
  totalVisits: number
  /** Paleta a usar. Sin ella, la de siempre. La Black la pasa `WalletCard` (§17.2). */
  theme?: StampsTheme
}

export function StampsGrid({ totalVisits, theme = DEFAULT_STAMPS_THEME }: StampsGridProps) {
  const mod = totalVisits % STAMPS_COUNT
  const filledStamps = mod === 0 && totalVisits > 0 ? STAMPS_COUNT : mod
  const cycleNumber = totalVisits > 0 ? Math.floor((totalVisits - 1) / STAMPS_COUNT) + 1 : 1

  return (
    <div>
      <p
        className="text-center text-xs mb-2.5 font-medium uppercase tracking-widest"
        style={{ color: theme.label }}
      >
        {totalVisits >= STAMPS_COUNT
          ? `Tarjeta #${cycleNumber} · ${filledStamps}/${STAMPS_COUNT} visitas`
          : `${filledStamps}/${STAMPS_COUNT} visitas`}
      </p>
      <div className="grid grid-cols-5 gap-2.5 w-full">
        {Array.from({ length: STAMPS_COUNT }).map((_, i) => {
          const filled = i < filledStamps
          return (
            <div
              key={i}
              className={`aspect-square rounded-full flex items-center justify-center ${filled ? 'animate-stamp-pop' : ''}`}
              style={{
                animationDelay: filled ? `${i * 40}ms` : '0ms',
                background: filled ? theme.filledBg : theme.emptyBg,
                border: filled ? theme.filledBorder : theme.emptyBorder,
                boxShadow: filled ? theme.filledShadow : 'none',
              }}
            >
              {filled && (
                <span className="text-sm font-bold" style={{ color: theme.check }}>
                  ✓
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
