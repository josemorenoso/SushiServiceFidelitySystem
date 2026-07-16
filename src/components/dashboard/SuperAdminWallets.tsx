'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Wallet, Plus, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Panel de billeteras del super-admin.
 *
 * Cada fila es un tenant con su saldo COP, mensajes disponibles y consumo del
 * mes. El botón "Recargar" abre un diálogo para asignarle plata ("me dieron
 * 50k → le asigno 50k"). Puente manual hasta el autoservicio con pasarela.
 *
 * Ref: docs/features/wallet-billing.md
 */

interface WalletRow {
  tenantId: string
  name: string
  slug: string
  isActive: boolean
  pricePerMessage: number
  balanceCop: number
  messagesAvailable: number
  monthSpendCop: number
  lastTopupAt: string | null
}

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000]

function formatCop(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso))
}

export function SuperAdminWallets() {
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<WalletRow | null>(null)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/wallets')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setWallets(json.wallets ?? [])
    } catch {
      toast.error('No se pudieron cargar las billeteras (¿falta correr la migración 00033?)')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  const openTopup = (row: WalletRow) => {
    setSelected(row)
    setAmount('')
    setReference('')
    setNotes('')
  }

  const amountNumber = Number(amount.replace(/[^\d]/g, ''))
  const previewMessages = useMemo(() => {
    if (!selected || !Number.isFinite(amountNumber) || amountNumber <= 0) return 0
    return Math.floor(amountNumber / selected.pricePerMessage)
  }, [selected, amountNumber])

  const handleTopup = async () => {
    if (!selected) return
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.error('Escribe un monto válido')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selected.tenantId,
          amountCop: amountNumber,
          notes: notes.trim() || null,
          externalRef: reference.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'No se pudo registrar la recarga')
        return
      }
      toast.success(`Recarga de ${formatCop(amountNumber)} asignada a ${selected.name}`)
      setSelected(null)
      await fetchWallets()
    } catch {
      toast.error('Error de red al registrar la recarga')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6" />
          Billeteras de clientes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Asigna el saldo que cada cliente te transfirió y controla cuánto ha consumido. El saldo baja
          solo con cada mensaje enviado; cuando no alcanza, sus campañas masivas se bloquean.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estado por cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : wallets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay clientes todavía.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Negocio</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Mensajes</TableHead>
                  <TableHead className="text-right">Consumo del mes</TableHead>
                  <TableHead className="text-right">$/msg</TableHead>
                  <TableHead className="text-right">Última recarga</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((w) => {
                  const negative = w.balanceCop < 0
                  const low = !negative && w.messagesAvailable <= 100
                  return (
                    <TableRow key={w.tenantId}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {w.name}
                          {!w.isActive && <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${negative ? 'text-red-600' : ''}`}>
                        {formatCop(w.balanceCop)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`inline-flex items-center gap-1 ${negative ? 'text-red-600' : low ? 'text-amber-600' : ''}`}>
                          {(negative || low) && <AlertTriangle className="h-3 w-3" />}
                          {w.messagesAvailable.toLocaleString('es-CO')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCop(w.monthSpendCop)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCop(w.pricePerMessage)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(w.lastTopupAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" className="h-8 gap-1.5" onClick={() => openTopup(w)}>
                          <Plus className="h-3.5 w-3.5" /> Recargar
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Un saldo en rojo (negativo) significa que el cliente consumió más de lo que tenía con mensajes
            transaccionales (bienvenida, check-in), que nunca se bloquean. Cóbralo en la próxima recarga.
          </p>
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recargar saldo</DialogTitle>
            <DialogDescription>
              {selected ? <>Asignar saldo a <strong>{selected.name}</strong> ({formatCop(selected.pricePerMessage)}/mensaje).</> : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Monto recibido (COP)
              </Label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="h-9"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK_AMOUNTS.map((q) => (
                  <Button key={q} type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setAmount(String(q))}>
                    {formatCop(q)}
                  </Button>
                ))}
              </div>
              {previewMessages > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  = <strong className="text-foreground">{previewMessages.toLocaleString('es-CO')}</strong> mensajes
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reference" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Referencia del pago (opcional)
              </Label>
              <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="Nequi M12345" className="h-9" />
              <p className="text-[11px] text-muted-foreground">
                Si la repites, el sistema no acredita el mismo pago dos veces.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Nota (opcional)
              </Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Transferencia del 13 de julio" className="h-9" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setSelected(null)} disabled={submitting}>Cancelar</Button>
              <Button onClick={handleTopup} disabled={submitting} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {submitting ? 'Registrando…' : 'Asignar saldo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
