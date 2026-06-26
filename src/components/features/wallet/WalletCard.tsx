'use client'

import { useEffect, useState } from 'react'
import { BRAND_NAME, BRAND_CARD_BG, BRAND_PAGE_BG } from '@/lib/branding'
import { StampsGrid } from './StampsGrid'

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
}

interface WalletCardProps {
  name: string
  totalPoints: number
  totalVisits: number
  tiers: TierItem[]
}

export function WalletCard({ name, totalPoints, totalVisits, tiers }: WalletCardProps) {
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold)
  const nextThreshold = nextTier?.point_threshold ?? totalPoints
  const remaining = nextTier ? Math.max(nextTier.point_threshold - totalPoints, 0) : 0
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
      className="min-h-screen flex flex-col items-center justify-start py-8 px-4"
      style={{ background: BRAND_PAGE_BG }}
    >
      <div
        className="w-full max-w-sm animate-fade-in-up"
        style={{
          background: BRAND_CARD_BG,
          borderRadius: '2rem',
          border: '1.5px solid rgba(255,255,255,0.22)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          overflow: 'hidden',
        }}
      >
        <div className="px-5 pt-7 pb-8 flex flex-col items-center">
          {/* Brand */}
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/50">
            {BRAND_NAME}
          </p>
          <p className="text-[11px] text-white/30 mt-0.5 tracking-wide">Tarjeta de Fidelidad</p>

          {/* Name */}
          <h1 className="mt-4 font-playfair text-4xl font-bold text-white text-center leading-tight">
            {name}
          </h1>

          {/* Points */}
          <div className="mt-3 flex items-end justify-center gap-2">
            <span className="text-6xl font-bold text-white leading-none">{totalPoints}</span>
            <span className="text-white/60 text-2xl mb-1">pts</span>
          </div>

          {/* Stamps */}
          <div className="mt-6 w-full">
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
                style={{ width: `${barWidth}%`, background: 'rgba(255,255,255,0.5)' }}
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
            {nextTier ? (
              <p className="text-[11px] text-white/50 mt-1.5 text-center">
                Faltan{' '}
                <span className="text-white/75 font-semibold">{remaining} pts</span>{' '}
                para {nextTier.safe_reward_title}
              </p>
            ) : (
              tiers.length > 0 && (
                <p className="text-[11px] text-white/60 mt-1.5 text-center">
                  🎉 ¡Nivel máximo alcanzado!
                </p>
              )
            )}
          </div>

          {/* Divider */}
          <div
            className="w-full mt-6 mb-5"
            style={{ height: '1px', background: 'rgba(255,255,255,0.12)' }}
          />

          {/* Tiers list */}
          {sorted.length > 0 && (
            <div className="w-full space-y-2">
              <p className="text-[11px] text-white/40 uppercase tracking-[0.15em] text-center mb-3">
                Tu camino de recompensas
              </p>
              {sorted.map((tier) => {
                const reached = totalPoints >= tier.point_threshold
                return (
                  <div
                    key={tier.tier_name}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{
                      background: reached ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
                      border: reached
                        ? '1px solid rgba(255,255,255,0.35)'
                        : '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    <span className="text-lg shrink-0">{reached ? '✅' : '🔒'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{tier.tier_name}</p>
                      <p className="text-xs text-white/50 truncate">{tier.safe_reward_title}</p>
                    </div>
                    <span className="text-xs text-white/40 font-medium shrink-0">
                      {tier.point_threshold} pts
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* CTA al check-in */}
          <div
            className="mt-6 w-full rounded-2xl px-5 py-4 text-center"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}
          >
            <p className="text-sm text-white/55">¿Estás en el restaurante?</p>
            <a
              href="/check-in"
              className="mt-1 block text-sm font-bold text-white transition-opacity hover:opacity-80"
            >
              Escanea el QR en mesa para ganar puntos →
            </a>
          </div>

          <p className="mt-6 text-[11px] text-white/20 text-center">
            {BRAND_NAME} · Programa de Fidelidad
          </p>
        </div>
      </div>
    </div>
  )
}
