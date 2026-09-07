'use client'

import { useState } from 'react'
import { Gift, Dice5, Loader2 } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import { BLACK_WALLET_CARD_THEME, GOLD } from '@/constants/wallet-card-theme'
import type { MysteryPrizeDisplay } from './CheckInSuccess.types'

/**
 * La elección entre el premio seguro y la Mystery Box.
 *
 * CAPA VISUAL v3 (2026-09-07). No cambia ni una regla: las mismas dos opciones,
 * el mismo `onChoice`, las mismas probabilidades — que las decide el servidor.
 *
 * Qué cambió y por qué:
 *
 *   - **El verde y el violeta se fueron.** `#059669` y `#7c3aed → #db2777` eran
 *     hex horneados en pantalla pública: colores que ningún restaurante podía
 *     cambiar. Pero la distinción que hacían SÍ importaba, así que se conserva
 *     con otros medios — la opción segura queda en tinta, calma y sólida; la
 *     Mystery Box se lleva el color de la marca y es la única que brilla
 *     (regla 01 del kit). Sigue leyéndose cuál es la arriesgada, y ahora además
 *     se ve del color del restaurante.
 *   - **El nivel Black usa su paleta de §17.2**, la misma que verá en la
 *     tarjeta, en vez del ámbar `#fbbf24` que tenía suelto acá.
 */

interface RewardChoiceProps {
  tierName: string
  safeReward: string
  mysteryBoxEnabled: boolean
  mysteryPrizes: MysteryPrizeDisplay[]
  isBlack: boolean
  onChoice: (choice: 'safe' | 'mystery') => void
  loading: boolean
}

export function RewardChoice({
  tierName,
  safeReward,
  mysteryBoxEnabled,
  mysteryPrizes,
  isBlack,
  onChoice,
  loading,
}: RewardChoiceProps) {
  const branding = useBranding()
  const [selected, setSelected] = useState<'safe' | 'mystery' | null>(null)

  const handleChoice = (choice: 'safe' | 'mystery') => {
    if (loading) return
    setSelected(choice)
    onChoice(choice)
  }

  const header = isBlack
    ? {
        bg: BLACK_WALLET_CARD_THEME.cardBg,
        border: `1px solid ${GOLD}59`,
        eyebrow: BLACK_WALLET_CARD_THEME.brand,
        title: BLACK_WALLET_CARD_THEME.name,
        sub: BLACK_WALLET_CARD_THEME.subtitle,
      }
    : {
        bg: undefined,
        border: `1px solid ${branding.primary}3d`,
        eyebrow: branding.primaryEnd,
        title: 'var(--brand-ink)',
        sub: 'var(--brand-ink-soft)',
      }

  return (
    <div className="animate-fade-in-up w-full space-y-4">
      <div
        className="premium-card p-6 text-center"
        style={{ background: header.bg, border: header.border }}
      >
        <p
          className="text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: header.eyebrow }}
        >
          Desbloqueaste
        </p>
        <h2
          className="font-playfair text-2xl font-bold"
          style={{ color: header.title, letterSpacing: '-0.02em' }}
        >
          {tierName}
        </h2>
        <p className="mt-1 text-sm" style={{ color: header.sub }}>
          Elegí tu recompensa
        </p>
      </div>

      {/* Ir a la segura: calma, en tinta. No compite con la de al lado. */}
      <button
        onClick={() => handleChoice('safe')}
        disabled={loading}
        className="w-full premium-card p-5 text-left transition-all duration-200"
        style={{
          border:
            selected === 'safe'
              ? '2px solid var(--brand-ink)'
              : '1px solid rgba(0,0,0,0.08)',
          opacity: loading && selected !== 'safe' ? 0.5 : 1,
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            style={{
              background: 'linear-gradient(135deg, var(--brand-ink-raised) 0%, var(--brand-ink) 100%)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            }}
          >
            <Gift className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: 'var(--brand-ink-soft)' }}>
              Ir a la segura
            </p>
            <p className="text-base font-semibold" style={{ color: 'var(--brand-ink)' }}>
              {safeReward}
            </p>
            <p className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
              100% garantizado
            </p>
          </div>
          {loading && selected === 'safe' && (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--brand-ink)' }} />
          )}
        </div>
      </button>

      {/* La Mystery Box es la arriesgada: es la única con el color de la marca. */}
      {mysteryBoxEnabled && (
        <button
          onClick={() => handleChoice('mystery')}
          disabled={loading}
          className="w-full premium-card p-5 text-left transition-all duration-200"
          style={{
            border:
              selected === 'mystery'
                ? `2px solid ${branding.primaryEnd}`
                : `1px solid ${branding.primary}29`,
            background: `linear-gradient(135deg, ${branding.primary}0a 0%, ${branding.primaryEnd}0a 100%)`,
            opacity: loading && selected !== 'mystery' ? 0.5 : 1,
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `linear-gradient(135deg, ${branding.primary} 0%, ${branding.primaryEnd} 100%)`,
                boxShadow: '0 4px 12px rgba(var(--brand-primary-end-rgb), 0.32)',
              }}
            >
              <Dice5 className="h-5 w-5" style={{ color: branding.onPrimary }} strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: branding.stampCheck }}>
                Mystery Box
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {mysteryPrizes.map((prize) => (
                  <span
                    key={prize.title}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full tabular-nums"
                    style={{
                      background: `${branding.primary}14`,
                      color: 'var(--brand-ink-soft)',
                    }}
                  >
                    {prize.emoji} {prize.title} · {prize.probability}%
                  </span>
                ))}
              </div>
            </div>
            {loading && selected === 'mystery' && (
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: branding.primaryEnd }} />
            )}
          </div>
        </button>
      )}
    </div>
  )
}
