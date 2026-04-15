'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, TrendingUp, Users, Settings } from 'lucide-react'
import Link from 'next/link'
import type { ROIEstimate } from '@/types/analytics.types'

interface ROICardProps {
  data: ROIEstimate | null
  loading: boolean
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function ROICard({ data, loading }: ROICardProps) {
  return (
    <div className="metric-card rounded-2xl p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        }}
      />
      <div className="relative z-10">
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
                ROI Estimado
              </h3>
              <p className="text-xs" style={{ color: '#9ca3af' }}>Este mes</p>
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

        {loading ? (
          <Skeleton className="h-12 w-40 mb-4" />
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
            {formatCOP(data?.estimatedROI ?? 0)}
          </p>
        )}

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: '#6b7280' }} />
            <span className="text-xs" style={{ color: '#6b7280' }}>
              <strong style={{ color: '#1a1c1d' }}>{data?.reactivatedThisMonth ?? 0}</strong> reactivados
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: '#6b7280' }} />
            <span className="text-xs" style={{ color: '#6b7280' }}>
              Ticket: <strong style={{ color: '#1a1c1d' }}>{formatCOP(data?.avgTicket ?? 0)}</strong>
            </span>
          </div>
        </div>

        <p className="text-xs mt-3 italic" style={{ color: '#9ca3af' }}>
          Retorno estimado = clientes reactivados × ticket promedio
        </p>
      </div>
    </div>
  )
}
