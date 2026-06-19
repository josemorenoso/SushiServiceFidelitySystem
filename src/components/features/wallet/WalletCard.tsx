'use client'

import { BRAND_NAME } from '@/lib/branding'
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
  tiers: TierItem[]
}

const WALLET_BG = 'linear-gradient(160deg, #7B0D1E 0%, #C1121F 35%, #E63946 70%, #FF6B6B 100%)'

export function WalletCard({ name, totalPoints, tiers }: WalletCardProps) {
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold)
  const remaining = nextTier ? nextTier.point_threshold - totalPoints : 0

  return (
    <div
      className="min-h-screen flex flex-col items-center px-5 pt-10 pb-12"
      style={{ background: WALLET_BG }}
    >
      <div className="w-full max-w-sm flex flex-col items-center animate-fade-in-up">
        {/* Brand */}
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/50">
          {BRAND_NAME}
        </p>
        <p className="text-[11px] text-white/35 mt-0.5 tracking-wide">Tarjeta de Fidelidad</p>

        {/* Name */}
        <h1 className="mt-4 font-playfair text-4xl font-bold text-white text-center leading-tight">
          {name}
        </h1>

        {/* Points */}
        <div className="mt-4 text-center">
          <div className="flex items-end justify-center gap-2">
            <span className="text-7xl font-bold text-white leading-none">{totalPoints}</span>
            <span className="text-white/60 text-2xl mb-1">pts</span>
          </div>
          {nextTier ? (
            <p className="text-sm text-white/55 mt-2">
              Faltan{' '}
              <span className="text-white font-semibold">{remaining} pts</span>{' '}
              para {nextTier.safe_reward_title}
            </p>
          ) : (
            tiers.length > 0 && (
              <p className="text-sm text-white/70 mt-2">🎉 ¡Nivel máximo alcanzado!</p>
            )
          )}
        </div>

        {/* Stamps */}
        {tiers.length > 0 && (
          <div className="mt-7 w-full">
            <StampsGrid totalPoints={totalPoints} tiers={tiers} />
          </div>
        )}

        {/* Tiers list */}
        {sorted.length > 0 && (
          <div className="mt-8 w-full space-y-2.5">
            <p className="text-[11px] text-white/40 uppercase tracking-[0.15em] text-center mb-3">
              Tu camino de recompensas
            </p>
            {sorted.map((tier) => {
              const reached = totalPoints >= tier.point_threshold
              return (
                <div
                  key={tier.tier_name}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{
                    background: reached ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                    border: reached
                      ? '1px solid rgba(255,255,255,0.4)'
                      : '1px solid rgba(255,255,255,0.14)',
                  }}
                >
                  <span className="text-xl shrink-0">{reached ? '✅' : '🔒'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{tier.tier_name}</p>
                    <p className="text-xs text-white/55 truncate">{tier.safe_reward_title}</p>
                  </div>
                  <span className="text-xs text-white/45 font-medium shrink-0">
                    {tier.point_threshold} pts
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA al check-in */}
        <div
          className="mt-8 w-full rounded-2xl px-5 py-4 text-center"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <p className="text-sm text-white/60">¿Estás en el restaurante?</p>
          <a
            href="/check-in"
            className="mt-1 block text-sm font-bold text-white transition-opacity hover:opacity-80"
          >
            Escanea el QR en mesa para ganar puntos →
          </a>
        </div>

        <p className="mt-8 text-[11px] text-white/25 text-center">
          {BRAND_NAME} · Programa de Fidelidad
        </p>
      </div>
    </div>
  )
}
