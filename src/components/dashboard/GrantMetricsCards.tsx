'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Gift, CheckCircle2, TimerOff, Percent } from 'lucide-react'

export interface GrantSourceMetric {
  source: string
  granted: number
  redeemed: number
  expired: number
  redemption_rate: number
}

export interface GrantMetricsData {
  granted: number
  redeemed: number
  expired: number
  active: number
  redemption_rate: number
  by_source: GrantSourceMetric[]
}

interface Props {
  metrics: GrantMetricsData | null
  loading: boolean
}

const SOURCE_LABEL: Record<string, string> = {
  mystery_box: 'Mystery Box',
  safe_choice: 'Premio seguro',
  reactivation: 'Reactivación agresiva',
  review: 'Reseña de Google',
  manual: 'Manual',
}

/**
 * Métricas de la cohorte de premios OTORGADOS en el rango.
 *
 * La tasa de redención de `reactivation` es, literalmente, el porcentaje de clientes
 * dormidos que la campaña despertó. Es la única métrica que contesta si la reactivación
 * agresiva sirve.
 *
 * Ref: docs/features/reward-grants.md
 */
export function GrantMetricsCards({ metrics, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  if (!metrics) return null

  const tiles = [
    {
      key: 'granted',
      label: 'Premios otorgados',
      value: metrics.granted,
      icon: Gift,
      hint: metrics.active > 0 ? `${metrics.active} todavía activos` : null,
    },
    {
      key: 'redeemed',
      label: 'Redimidos',
      value: metrics.redeemed,
      icon: CheckCircle2,
      hint: null,
    },
    {
      key: 'expired',
      label: 'Vencidos sin reclamar',
      value: metrics.expired,
      icon: TimerOff,
      hint: null,
    },
    {
      key: 'rate',
      label: 'Tasa de redención',
      value: `${metrics.redemption_rate}%`,
      icon: Percent,
      hint: 'De los que repartimos',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <Card key={tile.key}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Icon className="h-4 w-4" /> {tile.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{tile.value}</p>
                {tile.hint && <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {metrics.by_source.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Efectividad por origen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.by_source.map((s) => (
                <div key={s.source}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {SOURCE_LABEL[s.source] ?? s.source}
                    </span>
                    <span className="font-mono font-medium">
                      {s.redeemed}/{s.granted}{' '}
                      <span className="text-muted-foreground">({s.redemption_rate}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#E63946]/80"
                      style={{ width: `${s.redemption_rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
