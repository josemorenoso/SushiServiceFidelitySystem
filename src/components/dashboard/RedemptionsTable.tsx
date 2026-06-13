'use client'

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
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface RedemptionRow {
  id: string
  prize_title: string
  source: string
  redeemed_at: string
  table_number: number | null
  pos_reference: string | null
  notes: string | null
  customer_name: string | null
  customer_phone: string | null
  staff_name: string | null
}

interface Props {
  rows: RedemptionRow[]
  loading: boolean
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

const SOURCE_LABEL: Record<string, string> = {
  mystery_box: 'Mystery Box',
  safe_choice: 'Premio seguro',
  staff_override: 'Manual mesero',
  campaign_reward: 'Campaña',
}

export function RedemptionsTable({ rows, loading, page, totalPages, onPageChange }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No hay redenciones en el rango seleccionado.</p>
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha / Hora</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Premio</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Mesero</TableHead>
            <TableHead className="text-center">Mesa</TableHead>
            <TableHead>Ref. POS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {new Date(r.redeemed_at).toLocaleString('es-CO', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </TableCell>
              <TableCell className="font-medium">
                {r.customer_name ?? '—'}
                {r.customer_phone && (
                  <span className="block font-mono text-xs text-muted-foreground">{r.customer_phone}</span>
                )}
              </TableCell>
              <TableCell>{r.prize_title}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-[11px]">
                  {SOURCE_LABEL[r.source] ?? r.source}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.staff_name ?? '—'}</TableCell>
              <TableCell className="text-center text-sm">{r.table_number ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.pos_reference ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
