'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { leerJson, type Lectura } from '@/lib/cycle-screen'
import type { AudienciaDeRegalo } from '@/services/cycle-overview.service'
import type { VistaPreviaDelRegalo } from '@/services/cycle-gift.service'
import { CrearEvento } from './CrearEvento'
import { MandarRegalo } from './MandarRegalo'

export type TipoDeCreador = 'regalo' | 'evento'

/** Con qué se abre el creador: desde el botón principal, una caja, un día o una tarjeta de «Para hoy». */
export interface PedidoDelCreador {
  tipo: TipoDeCreador
  /** El regalo para una caja («Mandarles un regalo» desde su lista). */
  audiencia?: AudienciaDeRegalo
  /** «Crear aquí» de un día: la fecha del evento, o el día en que sale el regalo. */
  fecha?: string
  /** El nombre sugerido para el evento (la fecha especial de «Para hoy»). */
  nombre?: string
}

const NO_SE_PUDO_PREPARAR = 'No pudimos preparar el regalo en este momento. Intenta de nuevo en un minuto.'

function esVistaPrevia(x: unknown): x is VistaPreviaDelRegalo {
  const o = x as Partial<VistaPreviaDelRegalo> | null
  return !!o && Array.isArray(o.audiencias) && Array.isArray(o.regalos) && !!o.cupo && !!o.cuerpos
}

/**
 * El creador de la pantalla del ciclo (spec §6.5): abre DIRECTO en lo que se pidió —«Mandar un
 * regalo» por defecto, sin un modal de «¿qué quieres mandar?»— y, en chico, los otros dos:
 * «Crear un evento» y «Mensaje libre (avanzado)» (el asistente manual de siempre).
 *
 * Lee `GET /api/dashboard/cycle/gift` (el conteo vivo, el cupo, la plantilla, los cuerpos de la
 * vista previa) para el día del envío; cambiar el «cuándo» lo vuelve a pedir.
 */
export function CreadorDelCiclo({
  pedido,
  onCerrar,
  numeros,
  puedeMandarRegalos,
  onListo,
  onMensajeLibre,
}: {
  /** `null` = cerrado. */
  pedido: PedidoDelCreador | null
  onCerrar: () => void
  numeros: { enElCiclo: number; dormidos: number; encendido: boolean; hora: string }
  puedeMandarRegalos: boolean
  /** Algo se programó: la pantalla vuelve a leer. */
  onListo?: () => void
  onMensajeLibre?: () => void
}) {
  const abierto = pedido !== null
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {pedido && (
          <ContenidoDelCreador
            // Cada apertura empieza de cero (con lo que se pidió).
            key={`${pedido.tipo}|${pedido.audiencia ?? ''}|${pedido.fecha ?? ''}|${pedido.nombre ?? ''}`}
            pedido={pedido}
            numeros={numeros}
            puedeMandarRegalos={puedeMandarRegalos}
            onListo={onListo}
            onMensajeLibre={onMensajeLibre}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ContenidoDelCreador({
  pedido,
  numeros,
  puedeMandarRegalos,
  onListo,
  onMensajeLibre,
}: {
  pedido: PedidoDelCreador
  numeros: { enElCiclo: number; dormidos: number; encendido: boolean; hora: string }
  puedeMandarRegalos: boolean
  onListo?: () => void
  onMensajeLibre?: () => void
}) {
  const [tipo, setTipo] = useState<TipoDeCreador>(pedido.tipo)
  // El regalo de «Crear aquí» sale ese día; el del botón principal, hoy a la hora de la marca.
  const [cuando, setCuando] = useState(pedido.tipo === 'regalo' && pedido.fecha ? pedido.fecha : 'hoy')
  const [lectura, setLectura] = useState<Lectura<VistaPreviaDelRegalo> | null>(null)

  useEffect(() => {
    let activo = true
    leerJson<unknown>(`/api/dashboard/cycle/gift?cuando=${encodeURIComponent(cuando)}`, NO_SE_PUDO_PREPARAR).then((r) => {
      if (!activo) return
      if (!r.ok) setLectura(r)
      else if (!esVistaPrevia(r.datos)) setLectura({ ok: false, mensaje: NO_SE_PUDO_PREPARAR })
      else setLectura({ ok: true, datos: r.datos })
    })
    return () => {
      activo = false
    }
  }, [cuando])

  const datos = lectura?.ok ? lectura.datos : null

  return (
    <div className="space-y-4">
      <DialogHeader>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Crear</p>
        <DialogTitle className="text-lg">{tipo === 'regalo' ? '🎁 Mandar un regalo' : 'Crear un evento'}</DialogTitle>
        <DialogDescription>
          {tipo === 'regalo'
            ? 'El regalo se entrega cuando a cada persona le llega el mensaje, y vence según lo que elijas.'
            : 'La invitación sale el día del evento a la hora de tu marca, con la foto y el texto que pongas.'}
        </DialogDescription>
      </DialogHeader>

      {tipo === 'regalo' ? (
        <MandarRegalo
          lectura={lectura}
          cuando={cuando}
          onCuando={(c) => {
            setLectura(null)
            setCuando(c)
          }}
          audienciaPedida={pedido.audiencia}
          puedeMandar={puedeMandarRegalos}
          onProgramado={onListo}
        />
      ) : (
        <CrearEvento
          datos={{
            enElCiclo: numeros.enElCiclo,
            dormidos: numeros.dormidos,
            encendido: numeros.encendido,
            hora: numeros.hora,
            marca: datos?.marca.nombre ?? null,
            cuerpo: datos?.cuerpos.event_image ?? null,
          }}
          fechaInicial={pedido.tipo === 'evento' ? pedido.fecha : undefined}
          nombreInicial={pedido.nombre}
          onCreado={onListo}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs">
        <span className="text-muted-foreground">También puedes:</span>
        {tipo !== 'regalo' && (
          <button type="button" className="font-medium text-[var(--brand-primary)] underline-offset-2 hover:underline" onClick={() => setTipo('regalo')}>
            Mandar un regalo
          </button>
        )}
        {tipo !== 'evento' && (
          <button type="button" className="font-medium text-[var(--brand-primary)] underline-offset-2 hover:underline" onClick={() => setTipo('evento')}>
            Crear un evento
          </button>
        )}
        {onMensajeLibre && (
          <button type="button" className="font-medium text-[var(--brand-primary)] underline-offset-2 hover:underline" onClick={onMensajeLibre}>
            Mensaje libre (avanzado)
          </button>
        )}
      </div>
    </div>
  )
}
