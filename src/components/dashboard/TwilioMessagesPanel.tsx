'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MessageCircle,
  Send,
  CheckCheck,
  Eye,
  XCircle,
  UserX,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { TwilioWallet } from '@/components/dashboard/TwilioWallet'

interface TimelinePoint {
  date: string
  enviados: number
  entregados: number
  leidos: number
  fallidos: number
}

interface OptOutEntry {
  phone: string
  name: string | null
  date: string
  reason: 'keyword' | 'error_code'
  detail: string
}

interface FailureReason {
  code: number
  count: number
  description: string
}

interface TwilioMetrics {
  days: number
  since: string
  totals: {
    total: number
    delivered: number
    read: number
    failed: number
    undelivered: number
    pending: number
    deliveryRate: number
    readRate: number
  }
  optOuts: OptOutEntry[]
  optOutCount: number
  failureBreakdown: FailureReason[]
  timeline: TimelinePoint[]
  truncated: boolean
}

const RANGE_OPTIONS = [7, 30, 90] as const

/**
 * Panel colapsable de métricas de Mensajería WhatsApp (Twilio).
 *
 * Vive dentro de la página de Métricas detrás de un botón: no se renderiza ni
 * consulta la Twilio Messages API hasta que el usuario lo abre por primera vez
 * (carga diferida), para no penalizar la carga del dashboard con una llamada lenta.
 */
export function TwilioMessagesPanel() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [metrics, setMetrics] = useState<TwilioMetrics | null>(null)
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMetrics = useCallback((rangeDays: number) => {
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard/twilio-metrics?days=${rangeDays}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
        setMetrics(data)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Error cargando métricas')
        setMetrics(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (next && !loaded) {
        setLoaded(true)
        loadMetrics(days)
      }
      return next
    })
  }, [loaded, days, loadMetrics])

  const handleRange = useCallback((r: number) => {
    setDays(r)
    loadMetrics(r)
  }, [loadMetrics])

  const kpis = metrics
    ? [
        {
          label: 'Enviados',
          value: metrics.totals.total,
          sub: `Últimos ${metrics.days} días`,
          icon: Send,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
        },
        {
          label: 'Entregados',
          value: metrics.totals.delivered,
          sub: `${metrics.totals.deliveryRate}% tasa de entrega`,
          icon: CheckCheck,
          color: 'text-green-600',
          bg: 'bg-green-50',
        },
        {
          label: 'Leídos',
          value: metrics.totals.read,
          sub: `${metrics.totals.readRate}% tasa de lectura`,
          icon: Eye,
          color: 'text-purple-600',
          bg: 'bg-purple-50',
        },
        {
          label: 'Fallidos / No entregados',
          value: metrics.totals.failed + metrics.totals.undelivered,
          sub: `${metrics.totals.pending} en tránsito`,
          icon: XCircle,
          color: 'text-red-600',
          bg: 'bg-red-50',
        },
      ]
    : []

  return (
    <Card>
      {/* ─── Botón de revelado ─── */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-black/[0.02]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-2">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold">Mensajería WhatsApp</p>
            <p className="text-xs text-muted-foreground">
              Enviados, entregados, leídos, fallidos y opt-outs (Twilio)
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <CardContent className="space-y-6 border-t pt-6">
          {/* ─── Selector de rango ─── */}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {RANGE_OPTIONS.map((r) => (
              <Button
                key={r}
                variant={days === r ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRange(r)}
                disabled={loading}
              >
                {r} días
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => loadMetrics(days)} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ─── KPIs ─── */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)
              : kpis.map((kpi) => (
                  <Card key={kpi.label}>
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className={`rounded-lg p-2 ${kpi.bg}`}>
                        <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{kpi.label}</p>
                        <p className="text-lg font-bold">{kpi.value}</p>
                        <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>

          {/* ─── Gráfico de evolución ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evolución de Mensajes</CardTitle>
              <CardDescription>
                Enviados, entregados, leídos y fallidos por día. Los &quot;leídos&quot; solo aplican a WhatsApp con confirmación de lectura activa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : metrics && metrics.timeline.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics.timeline} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                      />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="enviados" name="Enviados" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2} />
                      <Area type="monotone" dataKey="entregados" name="Entregados" stroke="#10b981" fill="#10b981" fillOpacity={0.12} strokeWidth={2} />
                      <Area type="monotone" dataKey="leidos" name="Leídos" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.12} strokeWidth={2} />
                      <Area type="monotone" dataKey="fallidos" name="Fallidos" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground text-sm">Sin datos en el rango seleccionado.</p>
              )}
            </CardContent>
          </Card>

          {/* ─── Motivos de fallo ─── */}
          {!loading && metrics && metrics.failureBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  ¿Por qué fallaron? ({metrics.totals.failed + metrics.totals.undelivered} mensajes)
                </CardTitle>
                <CardDescription>
                  Motivo que reportó Twilio para cada envío fallido o no entregado. La causa más común suele ser números sin WhatsApp o mal escritos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Cant.</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="w-24 text-right">Código</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.failureBreakdown.map((f) => (
                      <TableRow key={f.code}>
                        <TableCell>
                          <Badge variant="destructive" className="text-xs">{f.count}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{f.description}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {f.code === 0 ? '—' : f.code}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ─── Opt-Outs ─── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserX className="h-4 w-4 text-orange-600" />
                    Opt-Outs (clientes que pidieron no recibir mensajes)
                  </CardTitle>
                  <CardDescription>
                    Detectados por respuesta con keyword (SALIR, STOP, BAJA...) o por rechazo de Twilio (error 21610/63016) en el rango seleccionado.
                  </CardDescription>
                </div>
                {metrics && (
                  <Badge variant={metrics.optOutCount > 0 ? 'destructive' : 'outline'} className="text-sm">
                    {metrics.optOutCount}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !metrics || metrics.optOuts.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground text-sm">
                  Ningún opt-out detectado en los últimos {days} días. 🎉
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.optOuts.map((o) => (
                      <TableRow key={o.phone}>
                        <TableCell className="font-medium">{o.name ?? 'Desconocido'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">+{o.phone}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {o.detail}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(o.date).toLocaleDateString('es-CO')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {metrics?.truncated && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              El rango contiene más de 5.000 mensajes — las cifras mostradas son parciales. Usa un rango más corto.
            </div>
          )}

          <TwilioWallet />
        </CardContent>
      )}
    </Card>
  )
}
