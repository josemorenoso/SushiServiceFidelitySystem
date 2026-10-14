'use client'

import { CheckCircle, Copy, Loader2, Store } from 'lucide-react'
import type { CardMode } from '@/lib/tenant-config-paths'
import { opcionesDeTarjeta } from '@/lib/tarjeta-de-sede'

/**
 * La elección de «Tarjeta principal» con 2+ sedes (sedes separadas, parte 2, 2026-10-14): «La
 * misma tarjeta para todas las sedes» (lo de siempre) o «Una tarjeta para cada sede». Sin estado:
 * la página decide y guarda; esto dibuja. Con una sola sede la página ni lo monta.
 *
 * Un administrador de sede la VE (sabe cuál rige) pero no la cambia: `puedeCambiar = false`.
 */
export function EleccionDeTarjeta({
  sedes,
  modo,
  puedeCambiar,
  guardando,
  onElegir,
}: {
  sedes: number
  modo: CardMode
  puedeCambiar: boolean
  guardando: boolean
  onElegir: (modo: CardMode) => void
}) {
  return (
    <div role="radiogroup" aria-label="Tarjetas de las sedes" className="grid gap-2 sm:grid-cols-2">
      {opcionesDeTarjeta(sedes).map((o) => {
        const elegida = o.modo === modo
        return (
          <button
            key={o.modo}
            type="button"
            role="radio"
            aria-checked={elegida}
            disabled={!puedeCambiar || guardando}
            onClick={() => (elegida ? undefined : onElegir(o.modo))}
            className={`flex min-h-11 items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-default ${
              elegida ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input bg-background hover:bg-accent'
            } ${!puedeCambiar && !elegida ? 'opacity-60' : ''}`}
          >
            {o.modo === 'shared' ? (
              <Copy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {o.titulo}
                {elegida &&
                  (guardando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3.5 w-3.5 text-primary" aria-label="Elegida" />
                  ))}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.detalle}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
