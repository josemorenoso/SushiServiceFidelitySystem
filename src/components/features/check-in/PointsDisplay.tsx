'use client'

import { useState, useEffect } from 'react'
import { Zap, Target } from 'lucide-react'

interface PointsDisplayProps {
  pointsAwarded: number
  totalPoints: number
  nextTierName?: string
  nextTierThreshold?: number
  pointsRemaining?: number
}

export function PointsDisplay({
  pointsAwarded,
  totalPoints,
  nextTierName,
  nextTierThreshold,
  pointsRemaining,
}: PointsDisplayProps) {
  const [displayedPoints, setDisplayedPoints] = useState(0)
  const [showTotal, setShowTotal] = useState(false)

  useEffect(() => {
    let frame = 0
    const totalFrames = 30
    const interval = setInterval(() => {
      frame++
      const progress = frame / totalFrames
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayedPoints(Math.round(eased * pointsAwarded))
      if (frame >= totalFrames) {
        clearInterval(interval)
        setTimeout(() => setShowTotal(true), 300)
      }
    }, 35)
    return () => clearInterval(interval)
  }, [pointsAwarded])

  const progressPercent = nextTierThreshold
    ? Math.min((totalPoints / nextTierThreshold) * 100, 100)
    : 100

  return (
    <div className="premium-card p-6 text-center space-y-4">
      <div className="flex justify-center mb-2">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.35)',
          }}
        >
          <Zap className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
          Sumaste hoy
        </p>
        <p
          className="font-playfair text-4xl font-bold"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.03em',
          }}
        >
          +{displayedPoints}
        </p>
        <p className="text-xs" style={{ color: '#9ca3af' }}>puntos</p>
      </div>

      {showTotal && (
        <div className="animate-fade-in-up space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm" style={{ color: '#6b7280' }}>Tu saldo:</span>
            <span
              className="font-playfair text-xl font-bold"
              style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
            >
              {totalPoints} pts
            </span>
          </div>

          {nextTierThreshold && nextTierName && (
            <div className="space-y-2">
              <div
                className="relative h-3 rounded-full overflow-hidden"
                style={{ background: 'rgba(0,0,0,0.06)' }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${progressPercent}%`,
                    background: progressPercent >= 90
                      ? 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)'
                      : 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
                    boxShadow: '0 1px 3px rgba(245, 158, 11, 0.3)',
                  }}
                />
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Target className="h-3.5 w-3.5" style={{ color: '#f59e0b' }} strokeWidth={2} />
                <span className="text-xs font-medium" style={{ color: '#92400e' }}>
                  {pointsRemaining != null && pointsRemaining <= 30
                    ? `¡Te faltan solo ${pointsRemaining} pts para ${nextTierName}!`
                    : `${nextTierName} a ${nextTierThreshold} pts`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
