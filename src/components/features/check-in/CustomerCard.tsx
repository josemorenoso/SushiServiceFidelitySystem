'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ScanLine, Loader2, PartyPopper } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { BRAND_NAME, STAFF_LABEL } from '@/lib/branding'
import { getTierEmoji } from '@/lib/tier-emojis'
import { TiersRoadmap } from './TiersRoadmap'

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
  justEarnedPoints: number | null // si != null, muestra overlay de dopamina
  onBack: () => void
}

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
  const nextThreshold = nextTier?.point_threshold ?? totalPoints
  const remaining = nextTier ? Math.max(nextThreshold - totalPoints, 0) : 0
  const progressPercent = nextTier
    ? Math.min((totalPoints / nextThreshold) * 100, 100)
    : 100

  // Animación de llenado de la barra
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(progressPercent), 150)
    return () => clearTimeout(t)
  }, [progressPercent])

  return (
    <div className="premium-card animate-fade-in-up w-full p-6 text-center relative overflow-hidden">
      {/* Overlay de dopamina cuando el mesero registra */}
      {justEarnedPoints != null && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}
        >
          <PartyPopper className="h-12 w-12 text-white animate-pulse" strokeWidth={1.5} />
          <p className="mt-3 font-playfair text-3xl font-bold text-white">¡Listo!</p>
          <p className="mt-1 text-5xl font-bold text-white animate-fade-in-up">
            +{justEarnedPoints}
          </p>
          <p className="text-sm text-white/90">puntos</p>
        </div>
      )}

      {/* Branding */}
      <p
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: '#9ca3af', letterSpacing: '0.08em' }}
      >
        {BRAND_NAME}
      </p>
      <h2
        className="mt-1 font-playfair text-2xl font-bold"
        style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
      >
        ¡Hola, {name}!
      </h2>

      {/* Banner imperativo — la acción dominante */}
      <div
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-3"
        style={{ background: '#E63946' }}
      >
        <ScanLine className="h-6 w-6 text-white animate-pulse shrink-0" strokeWidth={2} />
        <div className="text-left">
          <p className="text-base font-bold leading-tight text-white">
            DILE AL {STAFF_LABEL.toUpperCase()} QUE TE ESCANEE
          </p>
          <p className="text-xs font-medium text-white/85">Si no, NO sumás puntos</p>
        </div>
      </div>

      {/* QR grande con borde pulsante */}
      <div className="mx-auto my-5 flex justify-center">
        <div className="rounded-2xl border-4 p-3 animate-pulse" style={{ borderColor: '#E63946' }}>
          <QRCodeSVG value={qrUrl} size={270} level="M" />
        </div>
      </div>

      {/* Termómetro de puntos */}
      <div className="mb-2">
        <div
          className="relative h-8 w-full overflow-hidden rounded-full"
          style={{ background: 'rgba(0,0,0,0.06)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${barWidth}%`,
              background: 'linear-gradient(90deg, #f59e0b 0%, #E63946 100%)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-sm font-bold"
              style={{
                color: totalPoints > 0 ? '#fff' : '#6b7280',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              {totalPoints} {nextTier ? `/ ${nextThreshold}` : ''} pts
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold" style={{ color: '#92400e' }}>
          {nextTier
            ? `${getTierEmoji(nextIndex, nextTier.is_black)} Te faltan ${remaining} pts: ${nextTier.safe_reward_title}`
            : '🎉 ¡Alcanzaste el nivel máximo!'}
        </p>
      </div>

      {/* Camino completo de recompensas */}
      {sorted.length > 0 && (
        <div className="mt-4">
          <TiersRoadmap tiers={sorted} totalPoints={totalPoints} />
        </div>
      )}

      {/* Estado de polling */}
      {checkingStatus && justEarnedPoints == null && (
        <div
          className="mt-4 flex items-center justify-center gap-2 text-xs"
          style={{ color: '#9ca3af' }}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Esperando que el {STAFF_LABEL.toLowerCase()} te escanee...
        </div>
      )}

      <p className="mt-3 text-xs" style={{ color: '#d1d5db' }}>
        Este código expira en 30 minutos
      </p>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium"
        style={{ color: '#9ca3af' }}
        onClick={onBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Volver
      </button>
    </div>
  )
}
