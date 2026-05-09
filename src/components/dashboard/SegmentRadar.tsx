'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, ShieldAlert, UserX, Clock, RefreshCw } from 'lucide-react'

interface Segments {
  active: number
  recovery: number
  lost: number
  inCap: number
}

interface SegmentConfig {
  key: keyof Segments
  label: string
  sublabel: string
  icon: typeof Users
  color: string
  bg: string
  border: string
  badge: string
  badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive'
  tip: string
}

const SEGMENT_CONFIG: SegmentConfig[] = [
  {
    key: 'active',
    label: 'Disponibles',
    sublabel: 'visitaron en los últimos 17 días',
    icon: Users,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: '✅ Campaña manual OK',
    badgeVariant: 'outline',
    tip: 'Nuevo plato, evento, promoción de fin de semana.',
  },
  {
    key: 'recovery',
    label: 'Zona Recuperación',
    sublabel: '18 – 25 días sin visitar',
    icon: ShieldAlert,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: '🔒 Reservados al cron',
    badgeVariant: 'outline',
    tip: 'El sistema los contacta solo al día 21. No interferir.',
  },
  {
    key: 'lost',
    label: 'Perdidos',
    sublabel: 'más de 25 días sin visitar',
    icon: UserX,
    color: 'text-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: '✅ Oferta agresiva OK',
    badgeVariant: 'outline',
    tip: 'El cron ya disparó. Usa la campaña "Invitar al Restaurante" con un incentivo.',
  },
  {
    key: 'inCap',
    label: 'En Espera',
    sublabel: 'contactados esta semana',
    icon: Clock,
    color: 'text-slate-500',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: '⏸ Cap 7 días',
    badgeVariant: 'secondary',
    tip: 'Recibieron mensaje hace menos de 7 días. El sistema los omite automáticamente.',
  },
]

export function SegmentRadar() {
  const [segments, setSegments] = useState<Segments | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/dashboard/campaigns/segments')
      .then((r) => r.json())
      .then((d) => setSegments(d))
      .catch(() => setSegments(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const total = segments ? segments.active + segments.recovery + segments.lost + segments.inCap : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Radar de Segmentos
          </h2>
          {!loading && segments && (
            <p className="text-xs text-muted-foreground">{total} clientes con marketing activo</p>
          )}
        </div>
        <button
          onClick={load}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SEGMENT_CONFIG.map(({ key, label, sublabel, icon: Icon, color, bg, border, badge, tip }) => {
          const count = segments?.[key] ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0

          return (
            <Card key={key} className={`border ${border}`}>
              <CardContent className="pt-4 pb-3 px-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className={`rounded-md p-1.5 ${bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground">{loading ? '—' : `${pct}%`}</span>
                </div>

                <div>
                  <div className={`text-2xl font-bold ${color}`}>
                    {loading ? <span className="text-muted-foreground text-base">...</span> : count}
                  </div>
                  <p className="text-xs font-medium leading-tight">{label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{sublabel}</p>
                </div>

                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${bg} ${color} w-full justify-center`}>
                  {badge}
                </Badge>

                <p className="text-[11px] text-muted-foreground leading-snug border-t pt-2">{tip}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
