'use client'

import { useEffect, useState } from 'react'
import { Crown } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import { isBlackMember } from '@/lib/black-tier'
import { BLACK_WALLET_CARD_THEME, brandWalletCardTheme } from '@/constants/wallet-card-theme'
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

/**
 * Tarjeta digital del cliente (`/tarjeta`).
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §17.2 — al entrar a Black la tarjeta pasa a negro
 * y dorado, con distintivo claro. Quién es Black lo decide `isBlackMember()`
 * (`src/lib/black-tier.ts`); los colores viven en `wallet-card-theme.ts`. Aquí
 * solo se arma el layout (Mandamiento II).
 */
export function WalletCard({ name, totalPoints, totalVisits, tiers }: WalletCardProps) {
  const branding = useBranding()
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold)
  const nextThreshold = nextTier?.point_threshold ?? totalPoints
  const remaining = nextTier ? Math.max(nextTier.point_threshold - totalPoints, 0) : 0
  const progressPercent = nextTier
    ? Math.min((totalPoints / nextThreshold) * 100, 100)
    : 100

  const isBlack = isBlackMember(tiers, totalPoints)
  const theme = isBlack ? BLACK_WALLET_CARD_THEME : brandWalletCardTheme(branding)

  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(progressPercent), 200)
    return () => clearTimeout(t)
  }, [progressPercent])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-8 px-4"
      style={{ background: theme.pageBg }}
    >
      <div
        className="w-full max-w-sm animate-fade-in-up"
        style={{
          background: theme.cardBg,
          borderRadius: '2rem',
          border: theme.cardBorder,
          boxShadow: theme.cardShadow,
          overflow: 'hidden',
        }}
      >
        <div className="px-5 pt-7 pb-8 flex flex-col items-center">
          {/* Brand */}
          <p
            className="text-xs font-bold tracking-[0.2em] uppercase"
            style={{ color: theme.brand }}
          >
            {branding.name}
          </p>
          <p className="text-[11px] mt-0.5 tracking-wide" style={{ color: theme.subtitle }}>
            Tarjeta de Fidelidad
          </p>

          {/* Distintivo Black (§17.2) */}
          {theme.badge && (
            <div
              className="mt-3 flex items-center gap-1.5 rounded-full px-3.5 py-1.5"
              style={{ background: theme.badge.bg, border: theme.badge.border }}
            >
              <Crown className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: theme.badge.text }} />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: theme.badge.text }}
              >
                {theme.badge.label}
              </span>
            </div>
          )}

          {/* Name */}
          <h1
            className="mt-4 font-playfair text-4xl font-bold text-center leading-tight"
            style={{ color: theme.name }}
          >
            {name}
          </h1>

          {/* Points */}
          <div className="mt-3 flex items-end justify-center gap-2">
            <span className="text-6xl font-bold leading-none" style={{ color: theme.points }}>
              {totalPoints}
            </span>
            <span className="text-2xl mb-1" style={{ color: theme.pointsUnit }}>pts</span>
          </div>

          {/* Stamps */}
          <div className="mt-6 w-full">
            <StampsGrid totalVisits={totalVisits} theme={theme.stamps} />
          </div>

          {/* Points progress bar */}
          <div className="mt-4 w-full">
            <div
              className="relative h-7 rounded-full overflow-hidden"
              style={{ background: theme.barTrack }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${barWidth}%`, background: theme.barFill }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-xs font-bold"
                  style={{ color: theme.barLabel, textShadow: theme.barLabelShadow }}
                >
                  {totalPoints}{nextTier ? ` / ${nextThreshold}` : ''} pts
                </span>
              </div>
            </div>
            {nextTier ? (
              <p className="text-[11px] mt-1.5 text-center" style={{ color: theme.hint }}>
                Faltan{' '}
                <span className="font-semibold" style={{ color: theme.hintStrong }}>
                  {remaining} pts
                </span>{' '}
                para {nextTier.safe_reward_title}
              </p>
            ) : (
              tiers.length > 0 && (
                <p className="text-[11px] mt-1.5 text-center" style={{ color: theme.hintStrong }}>
                  {isBlack ? '🖤 Estás en el nivel Black' : '🎉 ¡Nivel máximo alcanzado!'}
                </p>
              )
            )}
          </div>

          {/* Divider */}
          <div
            className="w-full mt-6 mb-5"
            style={{ height: '1px', background: theme.divider }}
          />

          {/* Tiers list */}
          {sorted.length > 0 && (
            <div className="w-full space-y-2">
              <p
                className="text-[11px] uppercase tracking-[0.15em] text-center mb-3"
                style={{ color: theme.sectionLabel }}
              >
                Tu camino de recompensas
              </p>
              {sorted.map((tier) => {
                const reached = totalPoints >= tier.point_threshold
                return (
                  <div
                    key={tier.tier_name}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{
                      background: reached ? theme.tierReachedBg : theme.tierLockedBg,
                      border: reached ? theme.tierReachedBorder : theme.tierLockedBorder,
                    }}
                  >
                    <span className="text-lg shrink-0">{reached ? '✅' : '🔒'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: theme.tierName }}>
                        {tier.tier_name}
                      </p>
                      <p className="text-xs truncate" style={{ color: theme.tierReward }}>
                        {tier.safe_reward_title}
                      </p>
                    </div>
                    <span
                      className="text-xs font-medium shrink-0"
                      style={{ color: theme.tierPts }}
                    >
                      {tier.point_threshold} pts
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* CTA al check-in — toda la tarjeta es el área táctil, no solo el link */}
          <a
            href="/check-in"
            className="mt-6 block w-full rounded-2xl px-5 py-4 text-center transition-opacity hover:opacity-80"
            style={{ background: theme.ctaBg, border: theme.ctaBorder }}
          >
            <p className="text-sm" style={{ color: theme.ctaLabel }}>¿Estás en el restaurante?</p>
            <p className="mt-1 text-sm font-bold" style={{ color: theme.ctaLink }}>
              Escanea el QR en mesa para ganar puntos →
            </p>
          </a>

          <p className="mt-6 text-[11px] text-center" style={{ color: theme.footer }}>
            {branding.name} · Programa de Fidelidad
          </p>
        </div>
      </div>
    </div>
  )
}
