'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Gift } from 'lucide-react'
import { STAFF_LABEL } from '@/lib/branding'
import type { MysteryPrizeDisplay } from './CheckInSuccess.types'

interface MysteryBoxResultProps {
  prizeTitle: string
  prizeEmoji: string
  wasGolden: boolean
  nearMiss: string | null
  allPrizes: MysteryPrizeDisplay[]
  /** Auditoría 12-Julio: si el WhatsApp de confirmación falló, mostrar fallback visual. */
  whatsappSent?: boolean
}

export function MysteryBoxResult({
  prizeTitle,
  prizeEmoji,
  wasGolden,
  nearMiss,
  allPrizes,
  whatsappSent = true,
}: MysteryBoxResultProps) {
  const [phase, setPhase] = useState<'rolling' | 'reveal' | 'done'>('rolling')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 1800)
    const t2 = setTimeout(() => setPhase('done'), 2600)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const gradientBg = wasGolden
    ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
    : 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)'

  const accentColor = wasGolden ? '#92400e' : '#5b21b6'

  return (
    <div className="animate-fade-in-up w-full space-y-4">
      <div className="premium-card p-7 text-center overflow-hidden relative">
        {wasGolden && (
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, #fbbf24 0, #fbbf24 1px, transparent 0, transparent 50%)',
              backgroundSize: '10px 10px',
            }}
          />
        )}

        <div className="relative">
          <div className="flex justify-center mb-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: gradientBg,
                boxShadow: wasGolden
                  ? '0 8px 32px rgba(245,158,11,0.4)'
                  : '0 8px 32px rgba(124,58,237,0.35)',
              }}
            >
              {phase === 'rolling' ? (
                <span className="text-2xl animate-spin" style={{ animationDuration: '0.4s' }}>🎲</span>
              ) : (
                <Sparkles className="h-7 w-7 text-white" strokeWidth={1.5} />
              )}
            </div>
          </div>

          {phase === 'rolling' && (
            <div>
              <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
                {wasGolden ? 'Abriendo Golden Box...' : 'Abriendo Mystery Box...'}
              </p>
              <div className="flex justify-center gap-2 mt-3">
                {allPrizes.map((p, i) => (
                  <span
                    key={i}
                    className="text-2xl animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  >
                    {p.emoji}
                  </span>
                ))}
              </div>
            </div>
          )}

          {phase !== 'rolling' && (
            <div className="animate-fade-in-up">
              {wasGolden && (
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-2"
                  style={{ color: '#d97706' }}
                >
                  Golden Box ✨
                </p>
              )}
              <p className="text-4xl mb-2">{prizeEmoji}</p>
              <h3
                className="font-playfair text-2xl font-bold"
                style={{ color: accentColor, letterSpacing: '-0.02em' }}
              >
                {prizeTitle}
              </h3>

              {nearMiss && phase === 'done' && (
                <p
                  className="mt-2 text-xs font-medium animate-fade-in-up"
                  style={{ color: '#ef4444' }}
                >
                  {nearMiss} 🤯
                </p>
              )}

              {phase === 'done' && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Gift className="h-4 w-4" style={{ color: '#059669' }} strokeWidth={1.5} />
                  <p className="text-sm font-medium" style={{ color: '#059669' }}>
                    Mostrále este mensaje al {STAFF_LABEL.toLowerCase()} para reclamar
                  </p>
                </div>
              )}

              {phase === 'done' && !whatsappSent && (
                <p
                  className="mt-3 rounded-lg px-3 py-2 text-xs font-medium animate-fade-in-up"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309' }}
                >
                  ⚠️ No pudimos enviarte el WhatsApp. Esta pantalla es tu comprobante: mostrásela al {STAFF_LABEL.toLowerCase()} para reclamar tu premio.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
