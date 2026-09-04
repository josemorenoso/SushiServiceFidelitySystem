'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Gift, Download } from 'lucide-react'
import { toast } from 'sonner'
import { RedemptionSummaryCards, type RedemptionSummaryData } from '@/components/dashboard/RedemptionSummaryCards'
import { GrantMetricsCards, type GrantMetricsData } from '@/components/dashboard/GrantMetricsCards'
import { ReviewFunnelCard, type ReviewFunnelData } from '@/components/dashboard/ReviewFunnelCard'
import { RedemptionsTable, type RedemptionRow } from '@/components/dashboard/RedemptionsTable'
import { useLocationScope, LOCATION_ALL } from '@/contexts/LocationScopeContext'

function todayISO() {
  // Fecha LOCAL del navegador (en-CA da formato YYYY-MM-DD), no UTC: con
  // toISOString(), después de las 7pm en Colombia "hoy" apuntaba al día
  // siguiente y el filtro mostraba vacía la hora pico del restaurante.
  return new Date().toLocaleDateString('en-CA')
}

export default function RedemptionsPage() {
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [summary, setSummary] = useState<RedemptionSummaryData | null>(null)
  const [grantMetrics, setGrantMetrics] = useState<GrantMetricsData | null>(null)
  const [reviewFunnel, setReviewFunnel] = useState<ReviewFunnelData | null>(null)
  const [rows, setRows] = useState<RedemptionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 25
  const { selection: locationSelection } = useLocationScope()

  // El rango cubre el día completo: [from 00:00, to 23:59:59].
  // Multi-sede F7 (§8.4): `location_id` viaja SIEMPRE que el selector eligió
  // algo distinto de "Todas las sedes" — ausente por defecto, el servidor
  // colapsa eso a "todo lo que este usuario puede ver".
  const rangeParams = useCallback(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString())
    if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString())
    if (locationSelection !== LOCATION_ALL) params.set('location_id', locationSelection)
    return params
  }, [from, to, locationSelection])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const summaryParams = rangeParams()
      const listParams = rangeParams()
      listParams.set('page', String(page))
      listParams.set('limit', String(limit))

      const [summaryRes, listRes, reviewRes] = await Promise.all([
        fetch(`/api/dashboard/redemptions/summary?${summaryParams}`),
        fetch(`/api/dashboard/redemptions?${listParams}`),
        // El funnel de reseñas degrada solo: si falta la migración 00032, la card no se
        // renderiza y el resto de la página sigue funcionando.
        fetch(`/api/dashboard/review-metrics?${rangeParams()}`).catch(() => null),
      ])
      const summaryData = summaryRes.ok ? await summaryRes.json() : null
      const listData = listRes.ok ? await listRes.json() : null
      const reviewData = reviewRes?.ok ? await reviewRes.json() : null

      setReviewFunnel(
        reviewData && typeof reviewData.shown === 'number' ? reviewData : null
      )

      // Solo aceptamos un summary con la forma esperada (arrays). Si la API falló
      // (p.ej. falta correr la migración 00022) degradamos a null/vacío sin reventar.
      setSummary(summaryData && Array.isArray(summaryData.by_prize) ? summaryData : null)
      setGrantMetrics(
        summaryData?.grants && Array.isArray(summaryData.grants.by_source)
          ? summaryData.grants
          : null
      )
      setRows(Array.isArray(listData?.redemptions) ? listData.redemptions : [])
      setTotal(typeof listData?.total === 'number' ? listData.total : 0)

      if (!summaryRes.ok || !listRes.ok) {
        toast.error('No se pudieron cargar las redenciones (¿faltan las migraciones 00022 / 00031?)')
      }
    } catch {
      setSummary(null)
      setGrantMetrics(null)
      setReviewFunnel(null)
      setRows([])
      toast.error('Error cargando redenciones')
    } finally {
      setLoading(false)
    }
  }, [rangeParams, page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleExportPOS = async () => {
    try {
      const params = rangeParams()
      params.set('limit', '10000')
      params.set('page', '1')
      const res = await fetch(`/api/dashboard/redemptions?${params}`)
      const data = await res.json()
      const all: RedemptionRow[] = data.redemptions ?? []
      if (all.length === 0) { toast.error('No hay redenciones para exportar'); return }

      const headers = ['fecha_hora', 'premio', 'cliente', 'telefono', 'mesero', 'mesa', 'ref_pos', 'origen', 'notas']
      const csvRows = all.map((r) => [
        // Hora local del navegador — el POS del restaurante vive en hora Colombia, no UTC.
        new Date(r.redeemed_at).toLocaleString('sv-SE'),
        r.prize_title,
        r.customer_name ?? '',
        r.customer_phone ?? '',
        r.staff_name ?? '',
        r.table_number ?? '',
        r.pos_reference ?? '',
        r.source,
        r.notes ?? '',
      ])
      const csv = [headers, ...csvRows]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `redenciones-${from}_${to}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success(`${all.length} redenciones exportadas`)
    } catch {
      toast.error('Error al exportar')
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6" />
          Redenciones
        </h1>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPOS}>
          <Download className="h-3.5 w-3.5" />
          Cuadrar con POS (CSV)
        </Button>
      </div>

      {/* Filtros de fecha */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-3">
        <div className="space-y-1">
          <Label htmlFor="from" className="text-[11px] uppercase tracking-wide text-muted-foreground">Desde</Label>
          <Input id="from" type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value) }} className="h-8 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-[11px] uppercase tracking-wide text-muted-foreground">Hasta</Label>
          <Input id="to" type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value) }} className="h-8 w-40" />
        </div>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => { setPage(1); setFrom(todayISO()); setTo(todayISO()) }}>Hoy</Button>
          <Button variant="secondary" size="sm" onClick={() => {
            const d = new Date(); d.setDate(1)
            setPage(1); setFrom(d.toISOString().split('T')[0]); setTo(todayISO())
          }}>Este mes</Button>
        </div>
      </div>

      <GrantMetricsCards metrics={grantMetrics} loading={loading} />

      <ReviewFunnelCard funnel={reviewFunnel} loading={loading} />

      <RedemptionSummaryCards summary={summary} loading={loading} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalle de redenciones</CardTitle>
        </CardHeader>
        <CardContent>
          <RedemptionsTable
            rows={rows}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  )
}
