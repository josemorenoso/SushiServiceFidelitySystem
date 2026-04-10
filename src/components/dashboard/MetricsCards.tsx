'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, ShoppingBag, UserPlus, Star, Cake, QrCode, TrendingUp } from 'lucide-react'
import type { AnalyticsSummary } from '@/types/analytics.types'

interface MetricsCardsProps {
  summary: AnalyticsSummary | null
  loading: boolean
}

const metricsConfig = [
  { key: 'visitsToday' as const, label: 'Visitas Hoy', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'qrToday' as const, label: 'QR Hoy', icon: QrCode, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'deliveriesToday' as const, label: 'Domicilios Hoy', icon: ShoppingBag, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'newCustomersToday' as const, label: 'Nuevos Hoy', icon: UserPlus, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'totalCustomers' as const, label: 'Total Clientes', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'frequentCustomers' as const, label: 'Frecuentes (3+)', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'birthdaysToday' as const, label: 'Cumpleaños Hoy', icon: Cake, color: 'text-pink-600', bg: 'bg-pink-50' },
]

export function MetricsCards({ summary, loading }: MetricsCardsProps) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {metricsConfig.map((m) => (
        <Card key={m.key} className="relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`rounded-lg p-1.5 ${m.bg}`}>
                <m.icon className={`h-4 w-4 ${m.color}`} />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold tracking-tight">{summary?.[m.key] ?? 0}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
