'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { TrendingUp, ChevronDown } from 'lucide-react'

interface BatchSummary {
  source_batch: string
  source_file: string
  total: number
  sent: number
  converted: number
  created_at: string
}

interface BatchRoi {
  batch_id: string
  enviados: number
  convertidos: number
  conversion_rate: number
  visitas_generadas: number
  avg_ticket: number
  ingreso_estimado_cop: number
  costo_campana_cop: number
  roi_neto_cop: number
  multiplo_retorno: number
}

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

interface Props {
  refreshKey?: number
}

export function ImportedContactsHistory({ refreshKey = 0 }: Props) {
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [roi, setRoi] = useState<Record<string, BatchRoi>>({})

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/imported-contacts')
      const data = await res.json()
      setBatches(data.batches ?? [])
    } catch {
      setBatches([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches, refreshKey])

  const toggleRoi = async (batchId: string) => {
    if (expanded === batchId) { setExpanded(null); return }
    setExpanded(batchId)
    if (!roi[batchId]) {
      try {
        const res = await fetch(`/api/dashboard/imported-contacts/roi?batch_id=${batchId}`)
        const data = await res.json()
        setRoi((prev) => ({ ...prev, [batchId]: data }))
      } catch {
        /* noop */
      }
    }
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
  }

  if (batches.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Aún no hay lotes importados.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Archivo</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-center">Total</TableHead>
          <TableHead className="text-center">Enviados</TableHead>
          <TableHead className="text-center">Convertidos</TableHead>
          <TableHead className="text-center">Conversión</TableHead>
          <TableHead className="text-right">ROI</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((b) => {
          const r = roi[b.source_batch]
          const conv = b.sent > 0 ? Math.round((b.converted / b.sent) * 1000) / 10 : 0
          return (
            <Fragment key={b.source_batch}>
              <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRoi(b.source_batch)}>
                <TableCell className="font-medium">{b.source_file}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(b.created_at).toLocaleDateString('es-CO')}</TableCell>
                <TableCell className="text-center">{b.total}</TableCell>
                <TableCell className="text-center">{b.sent}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={b.converted > 0 ? 'default' : 'secondary'}>{b.converted}</Badge>
                </TableCell>
                <TableCell className="text-center text-sm">{conv}%</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="gap-1">
                    <TrendingUp className="h-3.5 w-3.5" /> Ver
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded === b.source_batch ? 'rotate-180' : ''}`} />
                  </Button>
                </TableCell>
              </TableRow>
              {expanded === b.source_batch && (
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/30">
                    {!r ? (
                      <Skeleton className="h-20 w-full" />
                    ) : (
                      <div className="grid gap-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
                        <RoiCard label="Visitas generadas" value={String(r.visitas_generadas)} />
                        <RoiCard label="Ingreso estimado" value={fmtCOP(r.ingreso_estimado_cop)} />
                        <RoiCard label="Costo campaña" value={fmtCOP(r.costo_campana_cop)} />
                        <RoiCard label="ROI neto" value={fmtCOP(r.roi_neto_cop)} highlight />
                        <RoiCard label="Múltiplo de retorno" value={`${r.multiplo_retorno}x`} highlight />
                        <RoiCard label="Ticket promedio" value={fmtCOP(r.avg_ticket)} />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function RoiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-lg font-bold ${highlight ? 'text-[#E63946]' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
