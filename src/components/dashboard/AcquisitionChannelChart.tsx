'use client'

import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { AcquisitionChannel } from '@/types/analytics.types'

interface AcquisitionChannelChartProps {
  data: AcquisitionChannel[]
  loading: boolean
}

export function AcquisitionChannelChart({ data, loading }: AcquisitionChannelChartProps) {
  return (
    <div className="dashboard-card p-6">
      <div className="mb-4">
        <h3
          className="font-playfair text-lg font-bold"
          style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
        >
          Canal de Adquisición por Mes
        </h3>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
          Nuevos clientes por QR (presencial) vs Domicilio — últimos 6 meses
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-[280px] w-full rounded-xl" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradAcqQr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.85} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="gradAcqDel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.85} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb' }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '13px' }} />
            <Bar
              dataKey="qr"
              name="QR (presencial)"
              fill="url(#gradAcqQr)"
              stackId="a"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="delivery"
              name="Domicilio"
              fill="url(#gradAcqDel)"
              stackId="a"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
