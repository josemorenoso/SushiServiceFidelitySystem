'use client'

import { Lock, Target, CheckCircle2, Box } from 'lucide-react'
import { getTierEmoji } from '@/lib/tier-emojis'

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
}

interface TiersRoadmapProps {
  tiers: TierItem[]
  totalPoints: number
}

export function TiersRoadmap({ tiers, totalPoints }: TiersRoadmapProps) {
  if (!tiers || tiers.length === 0) return null

  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)

  return (
    <div className="premium-card p-5 space-y-3">
      <h3
        className="text-xs font-bold text-center uppercase tracking-widest"
        style={{ color: '#9ca3af', letterSpacing: '0.08em' }}
      >
        Tu camino de recompensas
      </h3>

      <div className="space-y-2.5">
        {sorted.map((tier, index) => {
          const reached = totalPoints >= tier.point_threshold
          const isNext = !reached && (index === 0 || totalPoints >= sorted[index - 1].point_threshold)
          const remaining = tier.point_threshold - totalPoints
          const emoji = getTierEmoji(index, tier.is_black)

          return (
            <div
              key={tier.tier_name}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
              style={{
                background: reached
                  ? 'rgba(5, 150, 105, 0.06)'
                  : isNext
                    ? 'rgba(251, 191, 36, 0.08)'
                    : 'rgba(0,0,0,0.015)',
                border: reached
                  ? '1px solid rgba(5, 150, 105, 0.25)'
                  : isNext
                    ? '1px solid rgba(251, 191, 36, 0.25)'
                    : '1px solid transparent',
              }}
            >
              {/* Icono del tier */}
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shrink-0"
                style={{
                  background: reached
                    ? 'linear-gradient(135deg, #34d399 0%, #059669 100%)'
                    : isNext
                      ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
                      : tier.is_black
                        ? 'linear-gradient(135deg, #1a1c1d 0%, #374151 100%)'
                        : 'rgba(0,0,0,0.04)',
                  color: reached || isNext ? '#fff' : tier.is_black ? '#fbbf24' : '#9ca3af',
                  boxShadow: reached
                    ? '0 3px 10px rgba(5, 150, 105, 0.25)'
                    : isNext
                      ? '0 3px 10px rgba(245, 158, 11, 0.25)'
                      : 'none',
                }}
              >
                {reached ? (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                ) : isNext ? (
                  <Target className="h-4 w-4" strokeWidth={2} />
                ) : tier.is_black ? (
                  <Lock className="h-4 w-4" strokeWidth={2} />
                ) : (
                  <Lock className="h-4 w-4" strokeWidth={2} />
                )}
              </div>

              {/* Info del tier */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">
                    {emoji} {tier.tier_name}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#9ca3af' }}>
                    {tier.point_threshold} pts
                  </span>
                  {reached && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}
                    >
                      ✅ Listo
                    </span>
                  )}
                  {isNext && remaining > 0 && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}
                    >
                      🔥 Faltan {remaining}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs font-medium truncate"
                  style={{ color: reached ? '#059669' : isNext ? '#92400e' : '#6b7280' }}
                >
                  {tier.safe_reward_title}
                  {tier.mystery_box_enabled && !tier.is_black && (
                    <span className="ml-1 inline-flex items-center gap-0.5" style={{ color: '#d97706' }}>
                      <Box className="h-3 w-3 inline" strokeWidth={2} />
                      {' '}o Mystery Box
                    </span>
                  )}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
