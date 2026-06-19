'use client'

const STAMPS_COUNT = 10

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  is_black: boolean
}

interface StampsGridProps {
  totalPoints: number
  tiers: TierItem[]
}

export function StampsGrid({ totalPoints, tiers }: StampsGridProps) {
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold)

  let filledStamps: number
  if (!nextTier) {
    filledStamps = STAMPS_COUNT
  } else {
    const ptsPerStamp = nextTier.point_threshold / STAMPS_COUNT
    filledStamps = Math.min(STAMPS_COUNT, Math.floor(totalPoints / ptsPerStamp))
  }

  return (
    <div>
      {nextTier ? (
        <p className="text-center text-xs text-white/50 mb-2.5 font-medium uppercase tracking-widest">
          {filledStamps}/{STAMPS_COUNT} → {nextTier.safe_reward_title}
        </p>
      ) : (
        tiers.length > 0 && (
          <p className="text-center text-xs text-white/50 mb-2.5 font-medium uppercase tracking-widest">
            ¡Todos los niveles completados!
          </p>
        )
      )}
      <div className="grid grid-cols-5 gap-2.5 w-full">
        {Array.from({ length: STAMPS_COUNT }).map((_, i) => {
          const filled = i < filledStamps
          return (
            <div
              key={i}
              className={`aspect-square rounded-full flex items-center justify-center transition-all duration-200 ${filled ? 'animate-stamp-pop' : ''}`}
              style={{
                animationDelay: filled ? `${i * 40}ms` : '0ms',
                background: filled ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.18)',
                border: filled
                  ? '2px solid rgba(255,255,255,0.9)'
                  : '2px solid rgba(255,255,255,0.35)',
                boxShadow: filled ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
              }}
            >
              {filled && (
                <span className="text-sm font-bold" style={{ color: '#C1121F' }}>
                  ✓
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
