'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ScanLine, Loader2, PartyPopper } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { BRAND_NAME, STAFF_LABEL } from '@/lib/branding'
import { getTierEmoji } from '@/lib/tier-emojis'
import { StampsGrid } from '@/components/features/wallet'

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}

interface CustomerCardProps {
  name: string
  totalPoints: number
  qrUrl: string
  tiers: TierItem[]
  checkingStatus: boolean
  justEarnedPoints: number | null
  onBack: () => void
}

const WALLET_BG = 'linear-gradient(160deg, #7B0D1E 0%, #C1121F 35%, #E63946 70%, #FF6B6B 100%)'

export function CustomerCard({
  name,
  totalPoints,
  qrUrl,
  tiers,
  checkingStatus,
  justEarnedPoints,
  onBack,
}: CustomerCardProps) {
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold) ?? null
  const nextIndex = nextTier ? sorted.indexOf(nextTier) : -1
  const remaining = nextTier ? Math.max(nextTier.point_threshold - totalPoints, 0) : 0

  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: WALLET_BG }}
    >
      {/* Overlay de dopamina */}
      {justEarnedPoints != null && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}
        >
          <PartyPopper className="h-16 w-16 text-white animate-pulse" strokeWidth={1.5} />
          <p className="mt-3 font-playfair text-4xl font-bold text-white">¡Listo!</p>
          <p className="mt-1 text-6xl font-bold text-white animate-fade-in-up">
            +{justEarnedPoints}
          </p>
          <p className="text-lg text-white/90">puntos</p>
        </div>
      )}

      <div
        className={`min-h-full flex flex-col items-center px-5 pt-8 pb-10 max-w-sm mx-auto transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Brand */}
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/50">
          {BRAND_NAME}
        </p>

        {/* Name */}
        <h1 className="mt-1 font-playfair text-3xl font-bold text-white text-center">
          ¡Hola, {name}!
        </h1>

        {/* Points */}
        <div className="mt-3 text-center">
          <div className="flex items-end justify-center gap-2">
            <span className="text-5xl font-bold text-white leading-none">{totalPoints}</span>
            <span className="text-white/60 text-xl mb-0.5">pts</span>
          </div>
          {nextTier ? (
            <p className="text-sm text-white/55 mt-1">
              {getTierEmoji(nextIndex, nextTier.is_black)}{' '}
              Faltan <span className="text-white font-semibold">{remaining}</span> para{' '}
              {nextTier.safe_reward_title}
            </p>
          ) : (
            tiers.length > 0 && (
              <p className="text-sm text-white/70 mt-1">🎉 ¡Nivel máximo alcanzado!</p>
            )
          )}
        </div>

        {/* Stamps */}
        {tiers.length > 0 && (
          <div className="mt-5 w-full">
            <StampsGrid totalPoints={totalPoints} tiers={tiers} />
          </div>
        )}

        {/* Banner de acción */}
        <div
          className="mt-5 w-full rounded-2xl px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.25)',
          }}
        >
          <div className="flex items-center gap-3">
            <ScanLine className="h-6 w-6 text-white animate-pulse shrink-0" strokeWidth={2} />
            <div>
              <p className="text-sm font-bold text-white leading-tight">
                DILE AL {STAFF_LABEL.toUpperCase()} QUE TE ESCANEE
              </p>
              <p className="text-xs text-white/65">Si no, NO sumás puntos</p>
            </div>
          </div>
        </div>

        {/* QR */}
        <div className="mt-5 rounded-2xl bg-white p-4 shadow-2xl">
          <QRCodeSVG value={qrUrl} size={220} level="M" />
        </div>

        {/* Estado de polling */}
        {checkingStatus && justEarnedPoints == null && (
          <div className="mt-4 flex items-center gap-2 text-xs text-white/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Esperando que el {STAFF_LABEL.toLowerCase()} te escanee...
          </div>
        )}

        <p className="mt-3 text-xs text-white/30">Este código expira en 30 minutos</p>

        <button
          type="button"
          className="mt-5 flex items-center gap-1.5 text-sm text-white/45 transition-colors hover:text-white/70"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          Volver
        </button>
      </div>
    </div>
  )
}
