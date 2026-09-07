'use client'

import type { CSSProperties } from 'react'
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

  // El último sello ganado es el único que emite la onda. Regla 02 del kit
  // visual: la animación confirma algo que hizo el cliente — y lo que hizo fue
  // ganar ESE sello, no los nueve anteriores.
  const newestIndex = filledStamps - 1

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
            <div key={i} className="relative aspect-square">
              {/* La onda vive en su propia capa: un solo elemento no puede
                  correr el rebote y la onda a la vez (la segunda clase de
                  animación pisa a la primera). */}
              {filled && i === newestIndex && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full animate-stamp-ring"
                  style={{ '--stamp-ring-color': theme.ring } as CSSProperties}
                />
              )}
              <div
                className={`absolute inset-0 rounded-full flex items-center justify-center ${
                  filled ? 'animate-stamp-pop' : ''
                }`}
                style={{
                  animationDelay: filled ? `${i * 40}ms` : '0ms',
                  background: filled ? theme.filledBg : theme.emptyBg,
                  border: filled ? theme.filledBorder : theme.emptyBorder,
                  boxShadow: filled ? theme.filledShadow : 'none',
                }}
              >
                {filled && <StampCheck color={theme.check} delayMs={i * 40 + 120} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * El ✓ se DIBUJA trazo a trazo en vez de aparecer de golpe.
 *
 * `pathLength={1}` normaliza el largo real del trazo a 1, así el par
 * dasharray/dashoffset no depende de la geometría del path: se oculta con 1 y
 * se dibuja hasta 0. El resto lo hace `animate-draw-check` (`globals.css`), que
 * ya respeta `prefers-reduced-motion`.
 */
function StampCheck({ color, delayMs }: { color: string; delayMs: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="w-[52%] h-[52%]">
      <path
        d="M5 12.8 L9.7 17.5 L19 7.2"
        stroke={color}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="animate-draw-check"
        style={{ strokeDasharray: 1, strokeDashoffset: 1, animationDelay: `${delayMs}ms` }}
      />
    </svg>
  )
}
