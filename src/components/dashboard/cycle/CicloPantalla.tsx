'use client'

import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDemo } from '@/contexts/DemoContext'
import {
  hoyEnBogota,
  leerPortadaDelCiclo,
  mostrarPrimerUso,
  rangoDeCaja,
  type ClaveDeCaja,
  type FiltroDeLista,
  type PortadaDelCiclo,
} from '@/lib/cycle-screen'
import { CajasDelCiclo } from './CajasDelCiclo'
import { ComoDecide } from './ComoDecide'
import { EstadoDelCiclo } from './EstadoDelCiclo'
import { ListaDeCaja } from './ListaDeCaja'
import { NumerosDeArriba } from './NumerosDeArriba'
import { ParaHoy } from './ParaHoy'
import { PrimerUso } from './PrimerUso'
import { VerPorDia } from './VerPorDia'

export type EstadoDeLaPantalla =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; portada: PortadaDelCiclo; aviso: string | null }

/**
 * La pantalla «Ciclo» (fase 2, parte B). El dueño la abre desde el celular, entre incendios, y
 * necesita tres respuestas en este orden: **¿qué tengo que hacer hoy?** («Para hoy»), **¿está
 * funcionando?** (los tres números de arriba) y **¿cuántos hay en cada etapa?** (las cajas).
 *
 * Todo sale de `GET /api/dashboard/cycle/overview` —el MISMO motor que el cron—. **Un fallo
 * nunca es un cero:** si la lectura falla, la pantalla dice «no pudimos leer tu ciclo» con un
 * botón para reintentar, y no dibuja ni un número. Si falla una RELECTURA (después de un
 * cambio), se queda con lo que ya mostraba y avisa.
 *
 * En modo demostración (el interruptor del panel) no se lee nada: el ciclo es de la marca real y
 * enseñarlo en una demo sería enseñar sus clientes.
 *
 * Esta función tiene los efectos (leer, recordar qué caja se tocó); `VistaDelCiclo` solo dibuja
 * un estado, y es la que se prueba sin navegador.
 */
export function CicloPantalla() {
  const { isDemo } = useDemo()
  const [estado, setEstado] = useState<EstadoDeLaPantalla>({ tipo: 'cargando' })
  const [lectura, setLectura] = useState(0)
  const [seleccion, setSeleccion] = useState<FiltroDeLista | null>(null)
  const detalle = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isDemo) return
    let activo = true
    leerPortadaDelCiclo().then((r) => {
      if (!activo) return
      setEstado((previo) => {
        if (r.ok) return { tipo: 'listo', portada: r.datos, aviso: null }
        // Una relectura que falla no borra lo que ya se veía: lo avisa.
        return previo.tipo === 'listo'
          ? { tipo: 'listo', portada: previo.portada, aviso: r.mensaje }
          : { tipo: 'error', mensaje: r.mensaje }
      })
    })
    return () => {
      activo = false
    }
  }, [isDemo, lectura])

  const recargar = useCallback(() => setLectura((n) => n + 1), [])

  const elegir = useCallback((filtro: FiltroDeLista) => {
    setSeleccion(filtro)
    // En el celular la lista queda debajo de las cajas: se lleva la vista hasta ella.
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() =>
        detalle.current?.scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'start' })
      )
    }
  }, [])

  if (isDemo) {
    return (
      <Card size="sm">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Estás en modo demostración. El ciclo es de tu marca real: apaga la demostración para verlo.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <VistaDelCiclo
      estado={estado}
      seleccion={seleccion}
      detalleRef={detalle}
      onElegir={elegir}
      onReintentar={() => {
        setEstado({ tipo: 'cargando' })
        recargar()
      }}
      onCambio={recargar}
    />
  )
}

/** Dibuja un estado de la pantalla. Sin efectos propios: lo que recibe es lo que muestra. */
export function VistaDelCiclo({
  estado,
  seleccion,
  detalleRef,
  onElegir,
  onReintentar,
  onCambio,
}: {
  estado: EstadoDeLaPantalla
  seleccion: FiltroDeLista | null
  detalleRef?: Ref<HTMLDivElement>
  onElegir: (filtro: FiltroDeLista) => void
  onReintentar: () => void
  onCambio?: () => void
}) {
  if (estado.tipo === 'cargando') return <PantallaCargando />

  if (estado.tipo === 'error') {
    return (
      <Card size="sm">
        <CardContent className="space-y-3">
          <p role="alert" className="text-sm text-red-800">
            {estado.mensaje}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onReintentar}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { portada, aviso } = estado
  const permisos = portada.permisos ?? null
  const claveElegida: ClaveDeCaja | null = seleccion?.tipo === 'caja' ? seleccion.clave : null
  const diaElegido = seleccion?.tipo === 'dia' ? seleccion.dia : null

  const cajaElegida = claveElegida ? portada.cajas.find((c) => c.key === claveElegida) : undefined
  const tituloDeLaLista =
    seleccion?.tipo === 'dia'
      ? `Día ${seleccion.dia} sin venir`
      : claveElegida === 'dormidos'
        ? portada.dormidos.etiqueta
        : (cajaElegida?.etiqueta ?? '')
  const descripcionDeLaLista =
    seleccion?.tipo === 'dia' ? 'Por día' : cajaElegida ? rangoDeCaja(cajaElegida) : 'sin insistir'

  return (
    <div className="space-y-5">
      {aviso && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
          {aviso} Lo que ves es lo último que pudimos leer.
        </p>
      )}

      <EstadoDelCiclo ciclo={portada.ciclo} ritmo={portada.ritmo} permisos={permisos} onCambio={onCambio} />

      {mostrarPrimerUso(portada.primer_uso) && <PrimerUso datos={portada.primer_uso} />}

      {portada.para_hoy && (
        <ParaHoy tarjetas={portada.para_hoy} permisos={permisos} hoyIso={hoyEnBogota()} onCambio={onCambio} />
      )}

      <NumerosDeArriba portada={portada} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardContent className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Cuántos hay en cada etapa</h2>
              <p className="text-xs text-muted-foreground">
                Partidos en nuevos (una sola visita) y los que ya volvieron antes. Toca una caja para ver quiénes.
                {portada.no_reciben_mensajes > 0 &&
                  ` No cuentan ${portada.no_reciben_mensajes} que no reciben mensajes.`}
              </p>
            </div>

            <CajasDelCiclo
              cajas={portada.cajas}
              dormidos={portada.dormidos}
              seleccion={claveElegida}
              onElegir={(clave) => onElegir({ tipo: 'caja', clave })}
            />

            <VerPorDia
              porDia={portada.por_dia}
              cajas={portada.cajas}
              seleccion={diaElegido}
              onElegirDia={(dia) => onElegir({ tipo: 'dia', dia })}
            />
          </CardContent>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card ref={detalleRef}>
            <CardContent>
              {seleccion ? (
                <ListaDeCaja
                  key={seleccion.tipo === 'dia' ? `dia-${seleccion.dia}` : `caja-${seleccion.clave}`}
                  filtro={seleccion}
                  titulo={tituloDeLaLista}
                  descripcion={descripcionDeLaLista}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Toca una caja para ver quiénes son.</p>
              )}
            </CardContent>
          </Card>
          <ComoDecide grupoDeControlPct={portada.ciclo.grupo_de_control_pct} />
        </aside>
      </div>
    </div>
  )
}

function PantallaCargando() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando el ciclo">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    </div>
  )
}
