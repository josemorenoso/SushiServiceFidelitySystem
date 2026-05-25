'use client'

import { useState } from 'react'
import { Gift, Dice5, Loader2 } from 'lucide-react'
import type { MysteryPrizeDisplay } from './CheckInSuccess.types'

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
  const [selected, setSelected] = useState<'safe' | 'mystery' | null>(null)

  const handleChoice = (choice: 'safe' | 'mystery') => {
    if (loading) return
    setSelected(choice)
    onChoice(choice)
  }

  const tierColors = isBlack
    ? { bg: '#1a1c1d', accent: '#fbbf24', border: 'rgba(251,191,36,0.45)' }
    : { bg: '#fffbeb', accent: '#f59e0b', border: 'rgba(245,158,11,0.3)' }

  return (
    <div className="animate-fade-in-up w-full space-y-4">
      <div
        className="premium-card p-6 text-center"
        style={{
          background: isBlack ? tierColors.bg : undefined,
          border: `1px solid ${tierColors.border}`,
        }}
      >
        <p
          className="text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: tierColors.accent }}
        >
          Desbloqueaste
        </p>
        <h2
          className="font-playfair text-2xl font-bold"
          style={{
            color: isBlack ? '#fbbf24' : '#92400e',
            letterSpacing: '-0.02em',
          }}
        >
          {tierName}
        </h2>
        <p className="mt-1 text-sm" style={{ color: isBlack ? 'rgba(255,255,255,0.5)' : '#b45309' }}>
          Elegí tu recompensa
        </p>
      </div>

      <button
        onClick={() => handleChoice('safe')}
        disabled={loading}
        className="w-full premium-card p-5 text-left transition-all duration-200"
        style={{
          border: selected === 'safe' ? '2px solid #059669' : '1px solid rgba(0,0,0,0.08)',
          opacity: loading && selected !== 'safe' ? 0.5 : 1,
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            style={{
              background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
              boxShadow: '0 4px 12px rgba(5,150,105,0.25)',
            }}
          >
            <Gift className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#065f46' }}>
              Ir a la segura
            </p>
            <p className="text-base font-semibold" style={{ color: '#1a1c1d' }}>
              {safeReward}
            </p>
            <p className="text-xs" style={{ color: '#059669' }}>100% garantizado</p>
          </div>
          {loading && selected === 'safe' && (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#059669' }} />
          )}
        </div>
      </button>

      {mysteryBoxEnabled && (
        <button
          onClick={() => handleChoice('mystery')}
          disabled={loading}
          className="w-full premium-card p-5 text-left transition-all duration-200"
          style={{
            border: selected === 'mystery' ? '2px solid #7c3aed' : '1px solid rgba(0,0,0,0.08)',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.03) 0%, rgba(219,39,119,0.03) 100%)',
            opacity: loading && selected !== 'mystery' ? 0.5 : 1,
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
              }}
            >
              <Dice5 className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: '#5b21b6' }}>
                Mystery Box 🎲
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {mysteryPrizes.map((prize) => (
                  <span
                    key={prize.title}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(124,58,237,0.08)',
                      color: '#6d28d9',
                    }}
                  >
                    {prize.emoji} {prize.title} · {prize.probability}%
                  </span>
                ))}
              </div>
            </div>
            {loading && selected === 'mystery' && (
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#7c3aed' }} />
            )}
          </div>
        </button>
      )}
    </div>
  )
}
