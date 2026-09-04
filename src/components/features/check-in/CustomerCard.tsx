'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ScanLine, Loader2, PartyPopper } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useBranding } from '@/lib/branding-context'
import { getTierEmoji } from '@/lib/tier-emojis'
import { StampsGrid } from '@/components/features/wallet'
import { AvailableRewardBanner, type ActiveGrant } from './AvailableRewardBanner'

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
  totalVisits: number
  qrUrl: string
  tiers: TierItem[]
  checkingStatus: boolean
  justEarnedPoints: number | null
  /** Premios otorgados y sin reclamar (migración 00031). */
  activeGrants?: ActiveGrant[]
  onBack: () => void
}

export function CustomerCard({
  name,
  totalPoints,
  totalVisits,
  qrUrl,
  tiers,
  checkingStatus,
  justEarnedPoints,
  activeGrants = [],
  onBack,
}: CustomerCardProps) {
  const branding = useBranding()
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold) ?? null
  const nextIndex = nextTier ? sorted.indexOf(nextTier) : -1
  const nextThreshold = nextTier?.point_threshold ?? totalPoints
  const remaining = nextTier ? Math.max(nextThreshold - totalPoints, 0) : 0
  const progressPercent = nextTier
    ? Math.min((totalPoints / nextThreshold) * 100, 100)
    : 100

  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(progressPercent), 200)
    return () => clearTimeout(t)
  }, [progressPercent])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center py-6 px-4"
      style={{ background: branding.pageBg }}
    >
      {/* Overlay de dopamina */}
      {justEarnedPoints != null && justEarnedPoints > 0 && (
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

      {/* Card */}
      <div
        className="w-full max-w-sm animate-fade-in-up"
        style={{
          background: branding.cardBg,
          borderRadius: '2rem',
          border: '1.5px solid rgba(255,255,255,0.22)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          overflow: 'hidden',
        }}
      >
        <div className="px-5 pt-7 pb-8 flex flex-col items-center">
          {/* Brand */}
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/50">
            {branding.name}
          </p>

          {/* Name */}
          <h1 className="mt-1 font-playfair text-3xl font-bold text-white text-center">
            ¡Hola, {name}!
          </h1>

          {/* Points big */}
          <div className="mt-3 flex items-end justify-center gap-2">
            <span className="text-5xl font-bold text-white leading-none">{totalPoints}</span>
            <span className="text-white/60 text-xl mb-0.5">pts</span>
          </div>

          {/* Stamps */}
          <div className="mt-5 w-full">
            <StampsGrid totalVisits={totalVisits} />
          </div>

          {/* Points progress bar */}
          <div className="mt-4 w-full">
            <div
              className="relative h-7 rounded-full overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.25)' }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${barWidth}%`,
                  background: 'rgba(255,255,255,0.5)',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-xs font-bold text-white"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
                >
                  {totalPoints}{nextTier ? ` / ${nextThreshold}` : ''} pts
                </span>
              </div>
            </div>
            {nextTier && (
              <p className="text-[11px] text-white/50 mt-1.5 text-center">
                {getTierEmoji(nextIndex, nextTier.is_black)} Faltan{' '}
                <span className="text-white/75 font-semibold">{remaining} pts</span>{' '}
                para {nextTier.safe_reward_title}
              </p>
            )}
            {!nextTier && tiers.length > 0 && (
              <p className="text-[11px] text-white/60 mt-1.5 text-center">
                🎉 ¡Nivel máximo alcanzado!
              </p>
            )}
          </div>

          {/* Premio disponible sin reclamar */}
          <AvailableRewardBanner grants={activeGrants} staffLabel={branding.staffLabel} />

          {/* Divider */}
          <div
            className="w-full mt-5 mb-4"
            style={{ height: '1px', background: 'rgba(255,255,255,0.12)' }}
          />

          {/* Banner de acción */}
          <div
            className="w-full rounded-2xl px-4 py-3"
            style={{
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <div className="flex items-center gap-3">
              <ScanLine className="h-6 w-6 text-white animate-pulse shrink-0" strokeWidth={2} />
              <div>
                <p className="text-sm font-bold text-white leading-tight">
                  DILE AL {branding.staffLabel.toUpperCase()} QUE TE ESCANEE
                </p>
                <p className="text-xs text-white/60">Si no, NO sumás puntos</p>
              </div>
            </div>
          </div>

          {/* QR */}
          <div className="mt-5 rounded-2xl bg-white p-4 shadow-2xl">
            <QRCodeSVG value={qrUrl} size={210} level="M" />
          </div>

          {/* Estado de polling */}
          {checkingStatus && justEarnedPoints == null && (
            <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Esperando que el {branding.staffLabel.toLowerCase()} te escanee...
            </div>
          )}

          <p className="mt-3 text-[11px] text-white/25">Este código expira en 30 minutos</p>

          <button
            type="button"
            className="mt-4 flex items-center gap-1.5 py-2 text-sm text-white/40 transition-colors hover:text-white/65"
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Volver
          </button>
        </div>
      </div>
    </div>
  )
}
