'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { Search, ChevronLeft, ChevronRight, Users, MessageCircleOff, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { CustomerDetailDialog } from '@/components/dashboard/CustomerDetailDialog'
import { BlackTierSection } from '@/components/dashboard/BlackTierSection'
import { useDashboardAnalytics } from '@/hooks/useDashboardAnalytics'
import type { Customer } from '@/types/database.types'

/**
 * Apartado de Clientes.
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §17.1 (contraparte de §14.1) — textual del dueño:
 * *"la pantalla negra de clientes VIP tiene que quedar dentro del apartado de
 * clientes"*. `BlackTierSection` vivía en `/dashboard` y se mudó aquí tal cual:
 * mismos datos (`topCustomers` de analytics) y mismo comportamiento al hacer clic.
 */
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [blackBenefits, setBlackBenefits] = useState<string[] | undefined>(undefined)
  const limit = 15

  // Los clientes Black salen del mismo `topCustomers` que alimentaba la sección
  // en el dashboard — no de la lista paginada de abajo, que va filtrada.
  const { data: analytics, loading: analyticsLoading } = useDashboardAnalytics()

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.black_benefits) {
          try { setBlackBenefits(JSON.parse(s.black_benefits)) } catch { /* ignore */ }
        }
      })
      .catch(() => {})
  }, [])

  /** Abre la ficha completa desde la sección Black (allí solo hay el id). */
  const handleBlackCustomerClick = useCallback(async (customerId: string) => {
    try {
      const res = await fetch(`/api/dashboard/customers/${customerId}`)
      if (res.ok) {
        const customer = await res.json()
        setSelectedCustomer(customer)
        setDetailOpen(true)
      }
    } catch { /* best effort */ }
  }, [])

  const handleExportCSV = async () => {
    try {
      const res = await fetch('/api/dashboard/customers?limit=10000')
      const data = await res.json()
      const all: Customer[] = data.customers ?? []
      if (all.length === 0) { toast.error('No hay clientes para exportar'); return }

      const headers = ['nombre','telefono','visitas','cumpleanos','ciudad','canal','acepta_marketing','ultima_visita','creado']
      const rows = all.map((c) => [
        c.name,
        c.phone,
        String(c.total_visits),
        c.birthday || '',
        c.city || '',
        c.source_channels,
        c.accepts_marketing ? 'si' : 'no',
        c.last_visit_at ? new Date(c.last_visit_at).toISOString().split('T')[0] : '',
        new Date(c.created_at).toISOString().split('T')[0],
      ])

      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `clientes-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success(`${all.length} clientes exportados`)
    } catch {
      toast.error('Error al exportar')
    }
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) { toast.error('CSV vacío o sin datos'); return }

      // Parse header
      const headerLine = lines[0].toLowerCase()
      const parseCSVLine = (line: string) => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (const char of line) {
          if (char === '"') { inQuotes = !inQuotes; continue }
          if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
          current += char
        }
        result.push(current.trim())
        return result
      }

      const headers = parseCSVLine(headerLine)
      const nameIdx = headers.findIndex(h => h.includes('nombre') || h.includes('name'))
      const phoneIdx = headers.findIndex(h => h.includes('telefono') || h.includes('phone') || h.includes('celular'))

      if (phoneIdx === -1) { toast.error('CSV debe tener columna "telefono" o "celular"'); return }

      let imported = 0
      let skipped = 0

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const phone = cols[phoneIdx]?.replace(/[^0-9]/g, '').slice(-10)
        if (!phone || !/^3\d{9}$/.test(phone)) { skipped++; continue }

        const name = cols[nameIdx] || 'Importado'
        try {
          const res = await fetch('/api/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, action: 'lookup' }),
          })
          const data = await res.json()
          if (data.found) { skipped++; continue }

          await fetch('/api/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, action: 'register', name, accepts_marketing: true }),
          })
          imported++
        } catch { skipped++ }
      }

      toast.success(`Importados: ${imported}, Omitidos: ${skipped} (ya existían o inválidos)`)
      fetchCustomers()
    } catch {
      toast.error('Error al importar CSV')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)
      if (tierFilter !== 'all') params.set('tier', tierFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/dashboard/customers?${params}`)
      const data = await res.json()
      setCustomers(data.customers ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [page, search, sourceFilter, tierFilter, statusFilter])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  useEffect(() => {
    setPage(1)
  }, [sourceFilter, tierFilter, statusFilter])

  const totalPages = Math.ceil(total / limit)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchCustomers()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Clientes
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{total} total</Badge>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-xs font-medium hover:bg-accent gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            {importing ? 'Importando...' : 'Importar CSV'}
            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" disabled={importing} />
          </label>
        </div>
      </div>

      <BlackTierSection
        customers={analytics?.topCustomers ?? []}
        loading={analyticsLoading}
        benefits={blackBenefits}
        onCustomerClick={handleBlackCustomerClick}
      />

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Canal</span>
          {[{ v: 'all', l: 'Todos' }, { v: 'qr', l: 'QR' }, { v: 'delivery', l: 'Domicilio' }, { v: 'both', l: 'Ambos' }].map(f => (
            <button key={f.v} onClick={() => setSourceFilter(f.v)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                sourceFilter === f.v ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
              }`}>{f.l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Nivel</span>
          {[{ v: 'all', l: 'Todos' }, { v: 'plata', l: '🥈 Plata' }, { v: 'oro', l: '🥇 Oro' }, { v: 'platino', l: '⚜️ Platino' }, { v: 'black', l: '👑 Black' }].map(f => (
            <button key={f.v} onClick={() => setTierFilter(f.v)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                tierFilter === f.v ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
              }`}>{f.l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Estado</span>
          {[{ v: 'all', l: 'Todos' }, { v: 'active', l: 'Activos' }, { v: 'inactive', l: 'Recuperación' }, { v: 'lost', l: 'Perdidos' }].map(f => (
            <button key={f.v} onClick={() => setStatusFilter(f.v)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                statusFilter === f.v ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
              }`}>{f.l}</button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lista de Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {search ? 'No se encontraron clientes con esa búsqueda.' : 'No hay clientes registrados.'}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="text-center">Visitas</TableHead>
                    <TableHead>Última Visita</TableHead>
                    <TableHead>Registro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => { setSelectedCustomer(c); setDetailOpen(true) }}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {c.name}
                          {!c.accepts_marketing && (
                            <span title="No acepta marketing">
                              <MessageCircleOff className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={c.total_visits >= 5 ? 'default' : 'secondary'}>
                          {c.total_visits}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.last_visit_at
                          ? new Date(c.last_visit_at).toLocaleDateString('es-CO')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString('es-CO')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CustomerDetailDialog
        customer={selectedCustomer}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onVisitsAdded={fetchCustomers}
      />
    </div>
  )
}
