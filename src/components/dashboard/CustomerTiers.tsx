'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { TierCount } from '@/types/analytics.types'

interface CustomerTiersProps {
  tiers: TierCount[]
  loading: boolean
}

export function CustomerTiers({ tiers, loading }: CustomerTiersProps) {
  const total = tiers.reduce((sum, t) => sum + t.count, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Niveles de Clientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : (
          <div className="space-y-3">
            {tiers.map((tier) => {
              const pct = total > 0 ? (tier.count / total) * 100 : 0
              return (
                <div key={tier.rank} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="text-lg">{tier.emoji}</span>
                      {tier.rank}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {tier.count}
                      <span className="text-muted-foreground font-normal ml-1">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${tier.gradient} transition-all duration-1000 ease-out`}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {total > 0 && (
              <p className="text-xs text-muted-foreground pt-2 text-center">
                {total} clientes clasificados en {tiers.filter((t) => t.count > 0).length} niveles
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
