'use client'

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, TrendingUp, Settings } from 'lucide-react'
import Link from 'next/link'

interface EfficiencySummary {
  campaigns_count: number
  total_revenue: number
  avg_ticket: number
  all_time: boolean
  lookback_days: number | null
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

type FilterMode = 'all' | 'month'

export function ROICard() {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [summary, setSummary] = useState<EfficiencySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const params =
      filter === 'all'
        ? '?all=true'
        : `?days=${new Date().getDate()}`

    fetch(`/api/dashboard/campaigns/efficiency${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setSummary(json.summary ?? null)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filter])

  return (
    <div className="metric-card rounded-2xl p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'rgba(16, 185, 129, 0.15)' }}
            >
              <DollarSign className="h-5 w-5" strokeWidth={1.5} style={{ color: '#10b981' }} />
            </div>
            <div>
              <h3 className="font-playfair text-base font-bold" style={{ color: '#1a1c1d' }}>
                Revenue Atribuido
              </h3>
              <p className="text-xs" style={{ color: '#9ca3af' }}>Por campañas enviadas</p>
            </div>
          </div>
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-black/[0.04]"
            style={{ color: '#9ca3af' }}
          >
            <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
            Ajustar ticket
          </Link>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setFilter('all')}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={
              filter === 'all'
                ? { background: '#10b981', color: '#fff' }
                : { background: 'rgba(0,0,0,0.05)', color: '#6b7280' }
            }
          >
            Todo el tiempo
          </button>
          <button
            onClick={() => setFilter('month')}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={
              filter === 'month'
                ? { background: '#10b981', color: '#fff' }
                : { background: 'rgba(0,0,0,0.05)', color: '#6b7280' }
            }
          >
            Este mes
          </button>
        </div>

        {/* Número grande */}
        {loading ? (
          <Skeleton className="h-12 w-48 mb-4" />
        ) : (
          <p
            className="tabular-nums leading-none mb-4"
            style={{
              fontSize: '2.25rem',
              fontWeight: 700,
              letterSpacing: '-0.05em',
              color: '#10b981',
              fontFamily: 'var(--font-inter)',
            }}
          >
            {formatCOP(summary?.total_revenue ?? 0)}
          </p>
        )}

        {/* Campañas */}
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: '#6b7280' }} />
            <span className="text-xs" style={{ color: '#6b7280' }}>
              <strong style={{ color: '#1a1c1d' }}>{summary?.campaigns_count ?? 0}</strong> campañas ejecutadas
            </span>
          </div>
        )}

        <p className="text-xs italic mt-3" style={{ color: '#9ca3af' }}>
          Visitas post-campaña × ticket promedio
        </p>
      </div>
    </div>
  )
}
