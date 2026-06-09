'use client'

import { Gift, Box } from 'lucide-react'
import { getTierEmoji } from '@/lib/tier-emojis'

interface TierPreview {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}

interface RewardsPreviewProps {
  tiers: TierPreview[]
  pointsRange?: { min: number; max: number } | null
}

export function RewardsPreview({ tiers, pointsRange }: RewardsPreviewProps) {
  if (tiers.length === 0) return null

  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)

  return (
    <div className="mt-5">
      <h3
        className="mb-3 text-center text-base font-bold"
        style={{ color: '#1a1c1d', letterSpacing: '-0.01em' }}
      >
        Ganás premios reales en cada visita 👇
      </h3>

      {pointsRange && (
        <div className="mb-3 flex justify-center">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: 'rgba(230, 57, 70, 0.1)', color: '#E63946' }}
          >
            Cada visita: +{pointsRange.min} a +{pointsRange.max} pts
          </span>
        </div>
      )}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 snap-x">
        {sorted.map((tier, index) => (
          <div
            key={tier.tier_name}
            className="snap-start shrink-0 rounded-2xl border p-4 text-center"
            style={{
              minWidth: '150px',
              borderColor: 'rgba(0,0,0,0.08)',
              background: tier.is_black
                ? 'linear-gradient(135deg, #1a1c1d 0%, #2d2f30 100%)'
                : '#fff',
            }}
          >
            <div className="text-4xl leading-none">{getTierEmoji(index, tier.is_black)}</div>
            <div
              className="mt-2 text-lg font-bold"
              style={{ color: tier.is_black ? '#fbbf24' : '#1a1c1d', letterSpacing: '-0.01em' }}
            >
              {tier.tier_name}
            </div>
            <div
              className="mt-1 text-sm font-medium"
              style={{ color: tier.is_black ? 'rgba(251,191,36,0.85)' : '#6b7280' }}
            >
              {tier.safe_reward_title}
            </div>
            <div
              className="mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold"
              style={{
                background: tier.is_black ? 'rgba(251,191,36,0.15)' : 'rgba(245,158,11,0.12)',
                color: tier.is_black ? '#fbbf24' : '#b45309',
              }}
            >
              {tier.point_threshold} pts
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
        style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e' }}
      >
        <Box className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: '#d97706' }} />
        En cada premio elegís ir a la segura o arriesgar con la Mystery Box 🎲
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px]" style={{ color: '#9ca3af' }}>
        <Gift className="h-3 w-3" strokeWidth={1.5} />
        A veces ganás más puntos y te acercás más rápido a tu premio
      </div>
    </div>
  )
}
