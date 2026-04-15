'use client'

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
} from 'recharts'
import type { ReactivationData } from '@/types/analytics.types'

interface ReactivationRateChartProps {
  data: ReactivationData[]
  loading: boolean
}

export function ReactivationRateChart({ data, loading }: ReactivationRateChartProps) {
  const totalSent = data.reduce((a, b) => a + b.sent, 0)
  const totalReturned = data.reduce((a, b) => a + b.returned, 0)
  const overallRate = totalSent > 0 ? Math.round((totalReturned / totalSent) * 100) : 0

  return (
    <div className="dashboard-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3
            className="font-playfair text-lg font-bold"
            style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
          >
            Tasa de Reactivación
          </h3>
          <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
            Clientes que volvieron en 7 días tras campaña de reactivación
          </p>
        </div>
        {!loading && totalSent > 0 && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-1.5"
            style={{ background: 'rgba(16, 185, 129, 0.1)' }}
          >
            <span className="text-2xl font-bold" style={{ color: '#10b981', letterSpacing: '-0.05em' }}>
              {overallRate}%
            </span>
            <span className="text-xs font-medium" style={{ color: '#6b7280' }}>promedio</span>
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[280px] w-full rounded-xl" />
      ) : totalSent === 0 ? (
        <div className="flex items-center justify-center h-[280px] text-sm" style={{ color: '#9ca3af' }}>
          Aún no hay campañas de reactivación ejecutadas.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="gradReturned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb' }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '13px' }} />
            <Bar yAxisId="left" dataKey="sent" name="Enviados" fill="url(#gradSent)" radius={[8, 8, 0, 0]} />
            <Bar yAxisId="left" dataKey="returned" name="Volvieron" fill="url(#gradReturned)" radius={[8, 8, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="rate"
              name="Tasa %"
              stroke="#F59E0B"
              strokeWidth={2.5}
              dot={{ fill: '#F59E0B', r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
