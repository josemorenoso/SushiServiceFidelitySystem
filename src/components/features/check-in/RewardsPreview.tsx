'use client'

import { Gift } from 'lucide-react'
import { getTierEmoji } from '@/lib/tier-emojis'

interface TierPreview {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  is_black: boolean
  sort_order: number
}

interface RewardsPreviewProps {
  tiers: TierPreview[]
}

export function RewardsPreview({ tiers }: RewardsPreviewProps) {
  if (tiers.length === 0) return null

  return (
    <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: '#E63946' }} />
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: '#6b7280', letterSpacing: '0.05em' }}
        >
          Lo que te espera
        </span>
      </div>

      <ul className="space-y-2">
        {tiers.map((tier, index) => (
          <li key={tier.tier_name} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base leading-none">{getTierEmoji(index, tier.is_black)}</span>
              <span className="text-xs font-semibold truncate" style={{ color: '#1a1c1d' }}>
                {tier.tier_name}
              </span>
              <span className="text-xs shrink-0" style={{ color: '#d1d5db' }}>
                {tier.point_threshold} pts
              </span>
            </div>
            <span
              className="text-xs text-right shrink-0 max-w-[120px] truncate"
              style={{ color: '#9ca3af' }}
            >
              {tier.safe_reward_title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
