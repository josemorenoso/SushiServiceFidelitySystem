'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Gift, Clock, TrendingUp } from 'lucide-react'

export interface RedemptionSummaryData {
  total_redemptions: number
  by_prize: { prize_title: string; count: number }[]
  by_hour: { hour: number; count: number }[]
  by_staff: { staff_id: string | null; staff_name: string | null; count: number }[]
}

interface Props {
  summary: RedemptionSummaryData | null
  loading: boolean
}

export function RedemptionSummaryCards({ summary, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  // Blindaje: si la API respondió con error (p.ej. la tabla aún no existe porque
  // falta correr la migración 00022), `summary` puede no traer los arrays. Nunca
  // debemos reventar el render — degradamos a vacío.
  const byPrize = summary?.by_prize ?? []
  const byHour = summary?.by_hour ?? []
  const byStaff = summary?.by_staff ?? []
  const totalRedemptions = summary?.total_redemptions ?? 0

  if (!summary) return null

  const topPrize = byPrize[0]
  const maxHourCount = Math.max(1, ...byHour.map((h) => h.count))

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Total + por premio */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Gift className="h-4 w-4" /> Redenciones en el rango
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{totalRedemptions}</p>
          {topPrize && (
            <p className="mt-1 text-xs text-muted-foreground">
              Más entregado: <span className="font-medium text-foreground">{topPrize.prize_title}</span> ({topPrize.count})
            </p>
          )}
          <div className="mt-3 space-y-1">
            {byPrize.slice(0, 4).map((p) => (
              <div key={p.prize_title} className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">{p.prize_title}</span>
                <span className="font-mono font-medium">{p.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Heatmap por hora (análisis de turnos) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Redenciones por hora
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byHour.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin datos en el rango</p>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {byHour.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center gap-1" title={`${h.hour}:00 — ${h.count}`}>
                  <div
                    className="w-full rounded-t bg-[#E63946]/80"
                    style={{ height: `${Math.max(4, (h.count / maxHourCount) * 80)}px` }}
                  />
                  <span className="text-[9px] text-muted-foreground">{h.hour}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Por mesero */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> Entregas por mesero
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byStaff.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin datos en el rango</p>
          ) : (
            <div className="space-y-1.5">
              {byStaff.slice(0, 6).map((s) => (
                <div key={s.staff_id ?? 'unassigned'} className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">{s.staff_name ?? 'Sin asignar'}</span>
                  <span className="font-mono font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
