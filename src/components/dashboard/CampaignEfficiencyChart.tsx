'use client'

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Legend,
  Cell,
} from 'recharts'
import { TrendingUp, DollarSign, Target } from 'lucide-react'

interface CampaignEfficiency {
  id: string
  name: string
  type: 'manual' | 'birthday' | 'reactivation'
  executed_at: string
  total_sent: number
  attributed_visits: number
  conversion_rate: number
  estimated_revenue: number
}

interface EfficiencyResponse {
  campaigns: CampaignEfficiency[]
  summary: {
    campaigns_count: number
    total_sent: number
    total_attributed: number
    overall_conversion_rate: number
    total_revenue: number
    avg_ticket: number
    attribution_window_days: number
    lookback_days: number
  }
}

const TYPE_COLORS: Record<string, string> = {
  manual: '#3B82F6',
  birthday: '#EC4899',
  reactivation: '#F97316',
}

const TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  birthday: 'Cumpleaños',
  reactivation: 'Reactivación',
}

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

export function CampaignEfficiencyChart() {
  const [data, setData] = useState<EfficiencyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lookback, setLookback] = useState(90)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/dashboard/campaigns/efficiency?days=${lookback}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lookback])

  // Prepara data para chart: las más recientes primero, máx 12
  const chartData = (data?.campaigns ?? [])
    .slice(0, 12)
    .reverse()
    .map((c) => ({
      ...c,
      shortName: c.name.length > 18 ? c.name.slice(0, 15) + '…' : c.name,
      dateLabel: formatDate(c.executed_at),
      revenueK: Math.round(c.estimated_revenue / 1000),
    }))

  const summary = data?.summary

  return (
    <div className="dashboard-card p-6">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3
            className="font-playfair text-lg font-bold"
            style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
          >
            Eficiencia por Campaña
          </h3>
          <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
            Conversión y revenue atribuido (ventana {summary?.attribution_window_days ?? 7} días)
          </p>
        </div>
        <select
          value={lookback}
          onChange={(e) => setLookback(parseInt(e.target.value))}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
          <option value={180}>Últimos 180 días</option>
          <option value={365}>Último año</option>
        </select>
      </div>

      {/* KPIs de resumen */}
      {!loading && summary && summary.campaigns_count > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl p-3" style={{ background: 'rgba(59,130,246,0.08)' }}>
            <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: '#6b7280' }}>
              <Target className="h-3 w-3" />
              Conversión global
            </div>
            <div className="text-xl font-bold" style={{ color: '#3B82F6' }}>
              {summary.overall_conversion_rate}%
            </div>
            <div className="text-[10px]" style={{ color: '#9ca3af' }}>
              {summary.total_attributed} de {summary.total_sent}
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.08)' }}>
            <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: '#6b7280' }}>
              <DollarSign className="h-3 w-3" />
              Revenue atribuido
            </div>
            <div className="text-xl font-bold" style={{ color: '#10B981' }}>
              {formatCOP(summary.total_revenue)}
            </div>
            <div className="text-[10px]" style={{ color: '#9ca3af' }}>
              ticket prom. {formatCOP(summary.avg_ticket)}
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.08)' }}>
            <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: '#6b7280' }}>
              <TrendingUp className="h-3 w-3" />
              Campañas ejecutadas
            </div>
            <div className="text-xl font-bold" style={{ color: '#F59E0B' }}>
              {summary.campaigns_count}
            </div>
            <div className="text-[10px]" style={{ color: '#9ca3af' }}>
              últimos {summary.lookback_days} días
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-[320px] w-full rounded-xl" />
      ) : !summary || summary.campaigns_count === 0 ? (
        <div className="flex flex-col items-center justify-center h-[280px] text-center gap-2">
          <TrendingUp className="h-10 w-10 opacity-30" style={{ color: '#9ca3af' }} />
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            Aún no has ejecutado campañas en este período.
          </p>
          <p className="text-xs" style={{ color: '#d1d5db' }}>
            Envía tu primera campaña desde la pestaña Campañas.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="shortName"
              tick={{ fontSize: 10 }}
              angle={-25}
              textAnchor="end"
              height={60}
              interval={0}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              label={{ value: 'Revenue (miles COP)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              domain={[0, 'auto']}
              unit="%"
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
              labelStyle={{ fontWeight: 600 }}
              formatter={(value, name) => {
                const n = typeof value === 'number' ? value : Number(value ?? 0)
                if (name === 'Revenue') return [formatCOP(n * 1000), name as string]
                if (name === 'Conversión') return [`${n}%`, name as string]
                return [String(value ?? ''), name as string]
              }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
            <Bar yAxisId="left" dataKey="revenueK" name="Revenue" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={TYPE_COLORS[entry.type] || '#6b7280'} />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversion_rate"
              name="Conversión"
              stroke="#10B981"
              strokeWidth={2.5}
              dot={{ fill: '#10B981', r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Leyenda de tipos */}
      {!loading && summary && summary.campaigns_count > 0 && (
        <div className="mt-3 flex items-center justify-center gap-4 text-[11px]" style={{ color: '#6b7280' }}>
          {Object.entries(TYPE_LABELS).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[k] }} />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
