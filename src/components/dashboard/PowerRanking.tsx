'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { RankedCustomer } from '@/types/analytics.types'

interface PowerRankingProps {
  customers: RankedCustomer[]
  loading: boolean
}

function PositionBadge({ pos }: { pos: number }) {
  if (pos === 1) return <span className="text-2xl">🥇</span>
  if (pos === 2) return <span className="text-2xl">🥈</span>
  if (pos === 3) return <span className="text-2xl">🥉</span>
  return (
    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xs font-bold">
      #{pos}
    </span>
  )
}

export function PowerRanking({ customers, loading }: PowerRankingProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Top Clientes — Ranking de Poder
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No hay clientes aún.</p>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => {
              const isTop3 = c.position <= 3
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-all duration-300 ${
                    isTop3 ? 'shadow-md' : ''
                  }`}
                  style={
                    isTop3
                      ? { borderImage: `linear-gradient(135deg, ${getGradientColors(c.gradient)}) 1` }
                      : undefined
                  }
                >
                  <PositionBadge pos={c.position} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold truncate ${isTop3 ? 'text-base' : 'text-sm'}`}>
                        {c.name}
                      </p>
                      <span className="text-lg flex-shrink-0">{c.emoji}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white bg-gradient-to-r ${c.gradient}`}
                      >
                        {c.rank}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{c.phone}</span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold tabular-nums ${isTop3 ? 'text-2xl' : 'text-lg'}`}>
                      {c.total_visits}
                    </p>
                    <p className="text-xs text-muted-foreground">visitas</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
