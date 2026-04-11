'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Users, ShoppingBag, UserPlus, Star, Cake, QrCode, TrendingUp } from 'lucide-react'
import { MiniSparkline } from './MiniSparkline'
import type { AnalyticsSummary } from '@/types/analytics.types'

interface MetricsCardsProps {
  summary: AnalyticsSummary | null
  loading: boolean
}

const metricsConfig = [
  {
    key: 'visitsToday' as const,
    label: 'Visitas Hoy',
    icon: TrendingUp,
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.1)',
    trend: 'up' as const,
  },
  {
    key: 'qrToday' as const,
    label: 'QR Hoy',
    icon: QrCode,
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.1)',
    trend: 'stable' as const,
  },
  {
    key: 'deliveriesToday' as const,
    label: 'Domicilios Hoy',
    icon: ShoppingBag,
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.1)',
    trend: 'up' as const,
  },
  {
    key: 'newCustomersToday' as const,
    label: 'Nuevos Hoy',
    icon: UserPlus,
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.1)',
    trend: 'up' as const,
  },
  {
    key: 'totalCustomers' as const,
    label: 'Total Clientes',
    icon: Users,
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.1)',
    trend: 'up' as const,
  },
  {
    key: 'frequentCustomers' as const,
    label: 'Frecuentes (3+)',
    icon: Star,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.1)',
    trend: 'stable' as const,
  },
  {
    key: 'birthdaysToday' as const,
    label: 'Cumpleaños Hoy',
    icon: Cake,
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.1)',
    trend: 'stable' as const,
  },
]

export function MetricsCards({ summary, loading }: MetricsCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {metricsConfig.map((m, i) => (
        <div key={m.key} className="metric-card rounded-2xl p-4 overflow-hidden relative">
          {/* Icono */}
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: m.bg }}
            >
              <m.icon className="h-4 w-4" strokeWidth={1.5} style={{ color: m.color }} />
            </div>
          </div>

          {/* Número */}
          {loading ? (
            <Skeleton className="h-8 w-14 mb-1" />
          ) : (
            <p
              className="tabular-nums leading-none"
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                letterSpacing: '-0.05em',
                color: '#1a1c1d',
                fontFamily: 'var(--font-inter)',
              }}
            >
              {summary?.[m.key] ?? 0}
            </p>
          )}

          {/* Label */}
          <p
            className="mt-1 text-xs font-semibold uppercase"
            style={{ color: '#9ca3af', letterSpacing: '0.04em' }}
          >
            {m.label}
          </p>

          {/* Sparkline */}
          {!loading && (
            <div className="absolute bottom-3 right-3 opacity-80">
              <MiniSparkline trend={m.trend} color={m.color} delay={i * 80} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
