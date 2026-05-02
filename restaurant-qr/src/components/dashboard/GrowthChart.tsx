'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
} from 'recharts'
import type { DailyNewCustomers } from '@/types/analytics.types'

interface GrowthChartProps {
  data: DailyNewCustomers[]
  loading: boolean
}

export function GrowthChart({ data, loading }: GrowthChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
  }))

  return (
    <div className="dashboard-card p-6">
      <h3
        className="font-playfair mb-4 text-lg font-bold"
        style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
      >
        Crecimiento de Clientes
      </h3>
      <div>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar
                yAxisId="left"
                dataKey="count"
                name="Nuevos hoy"
                fill="url(#gradientNew)"
                radius={[8, 8, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                name="Total acumulado"
                stroke="#6366F1"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
