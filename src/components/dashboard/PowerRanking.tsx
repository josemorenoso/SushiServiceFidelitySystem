'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { RankedCustomer } from '@/types/analytics.types'

interface PowerRankingProps {
  customers: RankedCustomer[]
  loading: boolean
  onCustomerClick?: (customerId: string) => void
}

function PositionBadge({ pos }: { pos: number }) {
  if (pos === 1) return <span className="text-2xl leading-none">🥇</span>
  if (pos === 2) return <span className="text-2xl leading-none">🥈</span>
  if (pos === 3) return <span className="text-2xl leading-none">🥉</span>
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
      style={{ background: '#F9F8F6', color: '#9ca3af' }}
    >
      #{pos}
    </span>
  )
}

export function PowerRanking({ customers, loading, onCustomerClick }: PowerRankingProps) {
  return (
    <div className="dashboard-card p-6">
      <h3
        className="font-playfair mb-5 text-lg font-bold"
        style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
      >
        Top Clientes — Ranking de Poder
      </h3>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: '#9ca3af' }}>
          No hay clientes aún.
        </p>
      ) : (
        <div className="space-y-1">
          {customers.map((c) => {
            const isTop3 = c.position <= 3
            return (
              <div
                key={c.id}
                className="ranking-row flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all hover:bg-black/[0.02]"
                onClick={() => onCustomerClick?.(c.id)}
              >
                <PositionBadge pos={c.position} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className="truncate font-semibold"
                      style={{
                        color: '#1a1c1d',
                        fontSize: isTop3 ? '0.9375rem' : '0.875rem',
                      }}
                    >
                      {c.name}
                    </p>
                    <span className="flex-shrink-0 text-base">{c.emoji}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white bg-gradient-to-r"
                      style={{
                        background: `linear-gradient(135deg, ${getGradientColors(c.gradient)})`,
                        fontSize: '0.65rem',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {c.rank}
                    </span>
                    <span className="text-xs font-mono" style={{ color: '#d1d5db' }}>
                      {c.phone}
                    </span>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p
                    className="tabular-nums font-bold leading-none"
                    style={{
                      fontSize: isTop3 ? '1.5rem' : '1.125rem',
                      fontWeight: 700,
                      letterSpacing: '-0.04em',
                      color: '#1a1c1d',
                      fontFamily: 'var(--font-inter)',
                    }}
                  >
                    {c.total_visits}
                  </p>
                  <p className="text-[10px] font-semibold uppercase" style={{ color: '#9ca3af', letterSpacing: '0.04em' }}>
                    visitas
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getGradientColors(gradient: string): string {
  const colorMap: Record<string, string> = {
    'from-yellow-400 to-amber-600': '#FACC15, #D97706',
    'from-purple-500 to-violet-700': '#A855F7, #6D28D9',
    'from-blue-500 to-indigo-700': '#3B82F6, #4338CA',
    'from-emerald-500 to-green-700': '#10B981, #15803D',
    'from-orange-400 to-amber-600': '#FB923C, #D97706',
    'from-gray-400 to-gray-600': '#9CA3AF, #4B5563',
  }
  return colorMap[gradient] ?? '#9CA3AF, #4B5563'
}
