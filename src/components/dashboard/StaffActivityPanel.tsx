'use client'

/**
 * Rendimiento del equipo — escaneos y premios por mesero, clientes nuevos vs
 * frecuentes y mesas que más piden. Lee `GET /api/dashboard/staff-activity`
 * (docs/features/staff-activity.md).
 *
 * Dos reglas de esta pantalla:
 * · Ningún NULL se esconde: un escaneo sin mesero (aparato sin login) y un escaneo
 *   sin mesa son filas propias («Sin mesero», «Sin mesa»), igual que «sede desconocida».
 * · Ningún peso: «Mesas que más piden» es por escaneos y premios; no tenemos el ticket.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScanLine, UserPlus, Repeat, Gift } from 'lucide-react'
import { toast } from 'sonner'
import { useLocationScope, LOCATION_ALL } from '@/contexts/LocationScopeContext'
import { useBranding } from '@/lib/branding-context'
import type { StaffActivityReport } from '@/services/staff-activity.service'

function todayISO() {
  // Fecha LOCAL del navegador (en-CA da YYYY-MM-DD), no UTC: con toISOString(),
  // después de las 7pm en Colombia «hoy» apuntaba al día siguiente.
  return new Date().toLocaleDateString('en-CA')
}

function daysAgoISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA')
}

function pct(part: number, total: number): string {
  if (!total) return '—'
  return `${Math.round((part / total) * 100)} %`
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StaffActivityPanel() {
  const branding = useBranding()
  const [from, setFrom] = useState(daysAgoISO(6))
  const [to, setTo] = useState(todayISO())
  const [report, setReport] = useState<StaffActivityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { selection: locationSelection } = useLocationScope()

  // El rango cubre el día completo: [from 00:00, to 23:59:59]. Multi-sede F7 (§8.4):
  // `location_id` viaja SIEMPRE que el selector eligió algo distinto de «Todas».
  const rangeParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('from', new Date(`${from}T00:00:00`).toISOString())
    params.set('to', new Date(`${to}T23:59:59`).toISOString())
    if (locationSelection !== LOCATION_ALL) params.set('location_id', locationSelection)
    return params
  }, [from, to, locationSelection])

  const fetchData = useCallback(async () => {
    if (!from || !to) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/dashboard/staff-activity?${rangeParams()}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // El 503 trae el nombre de la migración que falta: se muestra tal cual,
        // porque un «error genérico» ahí se lee como permisos y no lo es.
        const msg = data?.error ?? 'No se pudo cargar el rendimiento del equipo'
        setReport(null)
        setErrorMsg(msg)
        toast.error(msg)
        return
      }
      setReport(data && data.totals && Array.isArray(data.by_staff) ? data : null)
    } catch {
      setReport(null)
      setErrorMsg('Error cargando el rendimiento del equipo')
      toast.error('Error cargando el rendimiento del equipo')
    } finally {
      setLoading(false)
    }
  }, [rangeParams, from, to])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totals = report?.totals
  const byStaff = report?.by_staff ?? []
  const byTable = report?.by_table ?? []
  const staffLabel = branding.staffLabel
  const staffPlural = branding.staffLabelPlural

  return (
    <div className="space-y-6">
      {/* Filtros de fecha */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-3">
        <div className="space-y-1">
          <Label htmlFor="sa-from" className="text-[11px] uppercase tracking-wide text-muted-foreground">Desde</Label>
          <Input id="sa-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sa-to" className="text-[11px] uppercase tracking-wide text-muted-foreground">Hasta</Label>
          <Input id="sa-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </div>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => { setFrom(todayISO()); setTo(todayISO()) }}>Hoy</Button>
          <Button variant="secondary" size="sm" onClick={() => { setFrom(daysAgoISO(6)); setTo(todayISO()) }}>7 días</Button>
          <Button variant="secondary" size="sm" onClick={() => { setFrom(daysAgoISO(29)); setTo(todayISO()) }}>30 días</Button>
        </div>
      </div>

      {errorMsg && !loading && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* Totales */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : totals ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <ScanLine className="h-4 w-4" /> Escaneos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totals.scans}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {totals.distinct_customers} cliente{totals.distinct_customers === 1 ? '' : 's'} distinto{totals.distinct_customers === 1 ? '' : 's'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <UserPlus className="h-4 w-4" /> Clientes nuevos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totals.new_customers}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pct(totals.new_customers, totals.scans)} de los escaneos · primera visita en la marca
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Repeat className="h-4 w-4" /> Clientes frecuentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totals.returning_customers}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pct(totals.returning_customers, totals.scans)} de los escaneos · ya habían venido
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Gift className="h-4 w-4" /> Premios entregados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totals.redemptions}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {totals.scans ? `${(totals.redemptions / totals.scans).toFixed(2)} por escaneo` : 'sin escaneos en el rango'}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {totals && (totals.scans_without_staff > 0 || totals.scans_without_table > 0) && !loading && (
        <p className="text-xs text-muted-foreground">
          {totals.scans_without_staff > 0 && (
            <>{totals.scans_without_staff} escaneo{totals.scans_without_staff === 1 ? '' : 's'} sin {staffLabel.toLowerCase()} (aparato sin login). </>
          )}
          {totals.scans_without_table > 0 && (
            <>{totals.scans_without_table} escaneo{totals.scans_without_table === 1 ? '' : 's'} sin mesa.</>
          )}
        </p>
      )}

      {/* Por mesero */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Por {staffLabel.toLowerCase()}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : byStaff.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin escaneos ni premios en el rango.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{staffLabel}</TableHead>
                    <TableHead className="text-right">Escaneos</TableHead>
                    <TableHead className="text-right">Nuevos</TableHead>
                    <TableHead className="text-right">Frecuentes</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">Premios</TableHead>
                    <TableHead className="text-right">Último escaneo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byStaff.map((s) => (
                    <TableRow key={s.staff_id ?? 'sin-mesero'}>
                      <TableCell>
                        {s.staff_id === null ? (
                          <span className="italic text-muted-foreground">Sin {staffLabel.toLowerCase()}</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{s.staff_name ?? `${staffLabel} borrado`}</span>
                            {s.staff_is_active === false && <Badge variant="outline">Inactivo</Badge>}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{s.scans}</TableCell>
                      <TableCell className="text-right">
                        {s.new_customers}
                        <span className="ml-1 text-xs text-muted-foreground">{pct(s.new_customers, s.scans)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.returning_customers}
                        <span className="ml-1 text-xs text-muted-foreground">{pct(s.returning_customers, s.scans)}</span>
                      </TableCell>
                      <TableCell className="text-right">{s.distinct_customers}</TableCell>
                      <TableCell className="text-right font-semibold">{s.redemptions}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatRelative(s.last_scan_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            «Nuevo» = primera visita del cliente en la marca; «Frecuente» = ya tenía visitas. Los premios son los
            mismos de Recompensas › Redenciones, puestos al lado de los escaneos. Los {staffPlural.toLowerCase()} sin
            actividad en el rango no aparecen.
          </p>
        </CardContent>
      </Card>

      {/* Por mesa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mesas que más piden</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : byTable.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin escaneos ni premios en el rango.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mesa</TableHead>
                    <TableHead className="text-right">Escaneos</TableHead>
                    <TableHead className="text-right">Clientes distintos</TableHead>
                    <TableHead className="text-right">Nuevos</TableHead>
                    <TableHead className="text-right">Premios</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byTable.map((t) => (
                    <TableRow key={t.table_number ?? 'sin-mesa'}>
                      <TableCell>
                        {t.table_number === null ? (
                          <span className="italic text-muted-foreground">Sin mesa</span>
                        ) : (
                          <span className="font-medium">Mesa {t.table_number}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{t.scans}</TableCell>
                      <TableCell className="text-right">{t.distinct_customers}</TableCell>
                      <TableCell className="text-right">{t.new_customers}</TableCell>
                      <TableCell className="text-right font-semibold">{t.redemptions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Se cuenta por escaneos y premios entregados en cada mesa, no por consumo: el sistema no conoce el ticket.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
