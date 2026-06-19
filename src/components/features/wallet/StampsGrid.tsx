'use client'

const STAMPS_COUNT = 10

interface StampsGridProps {
  totalVisits: number
}

export function StampsGrid({ totalVisits }: StampsGridProps) {
  const mod = totalVisits % STAMPS_COUNT
  const filledStamps = mod === 0 && totalVisits > 0 ? STAMPS_COUNT : mod
  const cycleNumber = Math.floor(totalVisits / STAMPS_COUNT) + 1

  return (
    <div>
      <p className="text-center text-xs text-white/50 mb-2.5 font-medium uppercase tracking-widest">
        {totalVisits >= STAMPS_COUNT
          ? `Tarjeta #${cycleNumber} · ${filledStamps}/${STAMPS_COUNT} visitas`
          : `${filledStamps}/${STAMPS_COUNT} visitas`}
      </p>
      <div className="grid grid-cols-5 gap-2.5 w-full">
        {Array.from({ length: STAMPS_COUNT }).map((_, i) => {
          const filled = i < filledStamps
          return (
            <div
              key={i}
              className={`aspect-square rounded-full flex items-center justify-center ${filled ? 'animate-stamp-pop' : ''}`}
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
