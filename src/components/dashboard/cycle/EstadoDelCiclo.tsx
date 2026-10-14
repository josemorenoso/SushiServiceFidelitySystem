'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  estadoDelCiclo,
  frasesDelRitmo,
  leerJson,
  opcionesDeRitmo,
  type Lectura,
  type PermisosDelCiclo,
  type ValorDeRitmo,
} from '@/lib/cycle-screen'
import type { CycleOverview } from '@/services/cycle-overview.service'

/** Guarda un ajuste de la marca (`PUT /api/dashboard/settings`: alcance de marca, lista cerrada). */
function guardarAjuste(key: string, value: string): Promise<Lectura<unknown>> {
  return leerJson<unknown>('/api/dashboard/settings', 'No pudimos guardar el cambio ahora mismo. Intenta de nuevo en un momento.', {
    init: { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) },
  })
}

type Confirmando = 'encender' | 'apagar' | null

/**
 * Dos cosas que el dueño necesita saber antes de mirar las cajas:
 *
 *   1. **Si el ciclo está encendido o apagado.** Con el ciclo APAGADO (la mayoría de las marcas
 *      hoy) la pantalla igual muestra las cajas, y esta franja lo dice en una línea. **El
 *      interruptor lo ve y lo usa SOLO el operador de Cada1** (`permisos.interruptor`, decisión
 *      H7: encender sube el volumen de mensajes y el costo). El dueño del restaurante ve el
 *      estado, no el botón. Y no es solo la pantalla: desde la parte C (2026-10-14) el `PUT` de
 *      Ajustes le contesta 403 a quien no es el operador (`CLAVES_DEL_OPERADOR`, `settings-keys.ts`).
 *   2. **El ritmo de su clientela** (spec §6.0): «Tus clientes vuelven cada mes · Calculado con
 *      135 regresos de tu marca · cambiar». Lo calcula el sistema; «cambiar» deja que el dueño
 *      lo fije (solo con permiso de marca).
 */
export function EstadoDelCiclo({
  ciclo,
  ritmo,
  permisos,
  guardar = guardarAjuste,
  onCambio,
}: {
  ciclo: CycleOverview['ciclo']
  ritmo: CycleOverview['ritmo']
  permisos: PermisosDelCiclo | null
  /** Inyectable para las pruebas. */
  guardar?: (key: string, value: string) => Promise<Lectura<unknown>>
  /** Avisa que algo cambió (para volver a leer la portada). */
  onCambio?: () => void
}) {
  const estado = estadoDelCiclo(ciclo, permisos)
  const frases = frasesDelRitmo(ritmo)
  const [confirmando, setConfirmando] = useState<Confirmando>(null)
  const [eligiendoRitmo, setEligiendoRitmo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const aplicar = async (key: string, value: string) => {
    setOcupado(true)
    setError(null)
    const r = await guardar(key, value)
    setOcupado(false)
    if (!r.ok) {
      setError(r.mensaje)
      return
    }
    setConfirmando(null)
    setEligiendoRitmo(false)
    onCambio?.()
  }

  const elegirRitmo = (valor: ValorDeRitmo) => aplicar('cycle_rhythm', valor)

  return (
    <Card
      size="sm"
      className={`border-l-4 ${estado.encendido ? 'border-l-emerald-600' : 'border-l-amber-600'}`}
      aria-label="Estado del ciclo"
    >
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{estado.titular}</h2>
            <p className="text-xs text-muted-foreground">{estado.detalle}</p>
          </div>

          {estado.botonDeInterruptor && confirmando === null && (
            <Button
              type="button"
              size="sm"
              variant={estado.botonDeInterruptor === 'encender' ? 'default' : 'outline'}
              onClick={() => setConfirmando(estado.botonDeInterruptor)}
            >
              {estado.botonDeInterruptor === 'encender' ? 'Encender el ciclo' : 'Apagar el ciclo'}
            </Button>
          )}
        </div>

        {confirmando && (
          <div role="alertdialog" aria-label="Confirmar" className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <p>
              {confirmando === 'encender'
                ? 'Vas a encender el ciclo en esta marca. Desde la próxima corrida diaria el sistema le escribirá a sus clientes según su etapa: sube el volumen y el costo de los mensajes.'
                : 'Vas a apagar el ciclo en esta marca. Lo que ya estaba en cola no sale y los clientes vuelven a la reactivación de siempre.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={ocupado}
                onClick={() => aplicar('cycle_enabled', confirmando === 'encender' ? 'true' : 'false')}
              >
                {ocupado ? 'Guardando…' : confirmando === 'encender' ? 'Sí, encender' : 'Sí, apagar'}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => setConfirmando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="border-t pt-2.5 text-xs text-muted-foreground">
          <p>
            <b className="font-semibold text-foreground">{frases.principal}.</b> {frases.origen}
            {permisos?.aprobar && !eligiendoRitmo && (
              <>
                {' '}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-2"
                  onClick={() => setEligiendoRitmo(true)}
                >
                  cambiar
                </button>
              </>
            )}
          </p>

          {permisos?.aprobar && eligiendoRitmo && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Cada cuánto vuelven tus clientes">
              {opcionesDeRitmo(ritmo).map((o) => (
                <Button
                  key={o.valor}
                  type="button"
                  size="sm"
                  variant={o.elegida ? 'default' : 'outline'}
                  aria-pressed={o.elegida}
                  disabled={ocupado}
                  onClick={() => elegirRitmo(o.valor)}
                >
                  {o.etiqueta}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => setEligiendoRitmo(false)}>
                Cerrar
              </Button>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
