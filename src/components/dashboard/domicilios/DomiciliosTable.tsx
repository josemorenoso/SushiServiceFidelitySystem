'use client'

/**
 * Bloque 2 — los domicilios que SÍ entraron.
 *
 * Es lo que pidió el dueño el 2026-09-07: *el apartado MUESTRA los domicilios que ellos
 * registran*. **No hay formulario de carga manual** y no es un olvido — está fuera del
 * alcance decidido.
 *
 * DOS COSAS QUE PARECEN DETALLE Y NO LO SON
 * ─────────────────────────────────────────
 * 1. **La hora se formatea en Bogotá, no en la del navegador** (`src/lib/timezone.ts`).
 *    Un admin mirando el panel desde otro país vería los pedidos corridos de día, y de
 *    noche en Colombia el servidor —que corre en UTC— los adelantaría al día siguiente.
 *
 * 2. **`location_id` NULL se muestra como «Sin sede», visible.** Significa *sede
 *    desconocida* y nunca se backfillea: repartirlo o esconderlo sería inventarse una
 *    atribución que nadie hizo.
 */

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, MapPinOff, Sparkles } from 'lucide-react'
import { formatInAppTz } from '@/lib/timezone'
import type { DeliveryOrderRow } from '@/services/delivery-dashboard.service'

/** Pesos colombianos. El `amount` de un PEDIDO es dinero real (lo que no tiene precio es un premio). */
const MONEDA = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function formatPhone(phone: string | null): string {
  if (!phone) return '—'
  if (phone.length === 10) return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`
  return phone
}

export function DomiciliosTable({
  orders,
  loading,
}: {
  orders: DeliveryOrderRow[]
  loading: boolean
}) {
  const [abierto, setAbierto] = useState<string | null>(null)

  if (loading) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
        Cargando domicilios…
      </p>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--brand-ink-soft)' }}>
          No hay domicilios registrados en este rango
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
          Si esperabas alguno, mirá «Los que no entraron» más abajo antes de dar por hecho que no
          pidió nadie: no son lo mismo.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Sede</TableHead>
            <TableHead>Operador</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const expandido = abierto === order.id
            return [
              <TableRow key={order.id}>
                <TableCell>
                  {order.raw_message && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={expandido ? 'Ocultar el mensaje original' : 'Ver el mensaje original'}
                      aria-expanded={expandido}
                      onClick={() => setAbierto(expandido ? null : order.id)}
                    >
                      {expandido ? (
                        <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                      ) : (
                        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                      )}
                    </Button>
                  )}
                </TableCell>

                <TableCell className="whitespace-nowrap text-sm">
                  {formatInAppTz(order.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
                      {order.customer_name ?? 'Cliente Domicilio'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
                      {formatPhone(order.customer_phone)}
                    </span>
                    {/* `null` = no se pudo calcular. Se calla en vez de afirmar «recurrente». */}
                    {order.is_new_customer === true && (
                      <Badge className="w-fit gap-1 bg-emerald-100 text-emerald-800">
                        <Sparkles className="h-3 w-3" strokeWidth={1.5} />
                        Nuevo
                      </Badge>
                    )}
                    {order.is_new_customer === false && (
                      <Badge variant="outline" className="w-fit">
                        Recurrente
                      </Badge>
                    )}
                  </div>
                </TableCell>

                <TableCell className="max-w-56 text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
                  {order.address ?? '—'}
                </TableCell>

                <TableCell className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
                  {order.payment_method ?? '—'}
                </TableCell>

                <TableCell className="whitespace-nowrap text-right text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
                  {order.amount === null ? '—' : MONEDA.format(order.amount)}
                </TableCell>

                <TableCell className="text-sm">
                  {order.location_id === null ? (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--brand-ink-muted)' }}>
                      <MapPinOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Sin sede
                    </span>
                  ) : (
                    (order.location_name ?? 'Sede desconocida')
                  )}
                </TableCell>

                <TableCell className="text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
                  {/* Hoy siempre vacío: `visits` no guarda quién reenvió el cuadro.
                      Está documentado en delivery-dashboard.md como límite conocido. */}
                  {order.operator_phone ? formatPhone(order.operator_phone) : 'No se registra'}
                </TableCell>
              </TableRow>,

              expandido && order.raw_message ? (
                <TableRow key={`${order.id}-raw`}>
                  <TableCell colSpan={8}>
                    <div className="rounded-2xl p-3" style={{ background: 'var(--brand-surface)' }}>
                      <p
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--brand-ink-muted)' }}
                      >
                        El mensaje original, tal como lo escribió tu operador
                      </p>
                      <p
                        className="mt-1 font-mono text-sm whitespace-pre-wrap"
                        style={{ color: 'var(--brand-ink)' }}
                      >
                        {order.raw_message}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null,
            ]
          })}
        </TableBody>
      </Table>
    </div>
  )
}
