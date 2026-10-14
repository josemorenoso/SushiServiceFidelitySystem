'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDemo } from '@/contexts/DemoContext'
import {
  hoyEnBogota,
  leerJson,
  leerPortadaDelCiclo,
  mostrarPrimerUso,
  pedidoDeLaUrl,
  rangoDeCaja,
  type AccionDeTarjeta,
  type ClaveDeCaja,
  type FiltroDeLista,
  type PortadaDelCiclo,
} from '@/lib/cycle-screen'
import type { RestaurantEvent } from '@/types/database.types'
import type { TarjetaParaHoy } from '@/services/cycle-overview.service'
import { EventDetailDrawer } from '@/components/dashboard/Calendar/EventDetailDrawer'
import { CajasDelCiclo } from './CajasDelCiclo'
import { ComoDecide } from './ComoDecide'
import { CreadorDelCiclo, type PedidoDelCreador } from './CreadorDelCiclo'
import { EstadoDelCiclo } from './EstadoDelCiclo'
import { ListaDeCaja } from './ListaDeCaja'
import { NumerosDeArriba } from './NumerosDeArriba'
import { ParaHoy } from './ParaHoy'
import { PrimerUso } from './PrimerUso'
import { VerPorDia } from './VerPorDia'
import { VistaPorFecha } from './VistaPorFecha'

/** Por etapa (las cajas, default) o por fecha (el calendario, parte C). */
export type VistaDelCicloEn = 'etapa' | 'fecha'

/** Lo que se toca en la vista por etapa: una caja o una barra del histograma. */
type SeleccionPorEtapa = Exclude<FiltroDeLista, { tipo: 'fecha' }>

// La URL se lee con `useSyncExternalStore` (como la página), nunca con `useSearchParams()`.
const sinSuscripcion = () => () => {}
const leerBusqueda = () => {
  try {
    return window.location.search
  } catch {
    return ''
  }
}

/** La ficha de un evento (para «Subir foto» y los eventos de la vista por fecha). */
async function leerEvento(id: string): Promise<{ ok: true; evento: RestaurantEvent } | { ok: false; mensaje: string }> {
  const r = await leerJson<{ event?: RestaurantEvent }>(
    `/api/dashboard/calendar/events/${encodeURIComponent(id)}`,
    'No pudimos abrir ese evento. Intenta de nuevo en un minuto.'
  )
  if (!r.ok) return r
  return r.datos.event ? { ok: true, evento: r.datos.event } : { ok: false, mensaje: 'No encontramos ese evento.' }
}

/** Quita de la URL lo que ya se atendió (recargar no lo vuelve a abrir). */
function limpiarPedidoDeLaUrl() {
  try {
    const url = new URL(window.location.href)
    for (const k of ['fecha', 'nombre', 'evento']) url.searchParams.delete(k)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
  } catch {
    // Sin historial (navegador raro): la URL queda como estaba. No pasa nada.
  }
}

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
 *
 * PARTE C (2026-10-14): arriba, «Por etapa | Por fecha» y el botón principal «Mandar un regalo».
 * La vista por fecha es el calendario (el mismo dato girado, spec §6.4); el creador
 * (`CreadorDelCiclo`) abre directo en el regalo, y «Crear aquí» de un día, «Crear evento» y
 * «Subir foto» de «Para hoy» abren el creador de eventos o la ficha del evento sin salir de acá.
 * Una URL con `?fecha=…&nombre=…` (o `?evento=<id>`) —el viejo `/dashboard/calendar` redirige
 * así— abre lo mismo al entrar.
 */
export function CicloPantalla({
  vista = 'etapa',
  onVista,
  onMensajeLibre,
}: {
  vista?: VistaDelCicloEn
  onVista?: (v: VistaDelCicloEn) => void
  onMensajeLibre?: () => void
} = {}) {
  const { isDemo } = useDemo()
  const [estado, setEstado] = useState<EstadoDeLaPantalla>({ tipo: 'cargando' })
  const [lectura, setLectura] = useState(0)
  const [seleccion, setSeleccion] = useState<SeleccionPorEtapa | null>(null)
  const [creador, setCreador] = useState<PedidoDelCreador | null>(null)
  const [evento, setEvento] = useState<RestaurantEvent | null>(null)
  const [errorDelEvento, setErrorDelEvento] = useState<string | null>(null)
  const [recargaDelCalendario, setRecargaDelCalendario] = useState(0)
  const detalle = useRef<HTMLDivElement>(null)
  /** El evento cuya ficha está abierta: una relectura que llega tarde no reabre una ficha cerrada. */
  const fichaAbierta = useRef<string | null>(null)

  /** Lo leído llega acá; si mientras tanto se cerró (u se abrió otra), no se aplica. */
  const aplicarEvento = useCallback((id: string, r: Awaited<ReturnType<typeof leerEvento>>) => {
    if (fichaAbierta.current !== id) return
    if (r.ok) {
      setErrorDelEvento(null)
      setEvento(r.evento)
    } else {
      setErrorDelEvento(r.mensaje)
    }
  }, [])
  const abrirEvento = useCallback(
    (id: string, soloSiSigueAbierta = false) => {
      if (!soloSiSigueAbierta) fichaAbierta.current = id
      return leerEvento(id).then((r) => aplicarEvento(id, r))
    },
    [aplicarEvento]
  )

  // Lo que pide la URL al entrar («Crear evento» / «Subir foto» desde otra pantalla, o el
  // calendario viejo que redirige): `?fecha=…&nombre=…` abre el creador de eventos; `?evento=`,
  // la ficha. Se atiende una vez; al cerrar se limpia de la URL para que recargar no lo reabra.
  const busqueda = useSyncExternalStore(sinSuscripcion, leerBusqueda, () => '')
  const pedidoUrl = useMemo(() => pedidoDeLaUrl(busqueda), [busqueda])
  const [urlAtendida, setUrlAtendida] = useState(false)
  const creadorPedido: PedidoDelCreador | null =
    creador ??
    (!isDemo && !urlAtendida && pedidoUrl.fecha && !pedidoUrl.evento
      ? { tipo: 'evento', fecha: pedidoUrl.fecha, nombre: pedidoUrl.nombre }
      : null)
  useEffect(() => {
    if (isDemo || urlAtendida || !pedidoUrl.evento) return
    const id = pedidoUrl.evento
    fichaAbierta.current = id
    let activo = true
    leerEvento(id).then((r) => {
      if (activo) aplicarEvento(id, r)
    })
    return () => {
      activo = false
    }
  }, [isDemo, urlAtendida, pedidoUrl.evento, aplicarEvento])
  const atenderUrl = useCallback(() => {
    setUrlAtendida(true)
    limpiarPedidoDeLaUrl()
  }, [])

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
  const trasCrear = useCallback(() => {
    setLectura((n) => n + 1)
    setRecargaDelCalendario((n) => n + 1)
  }, [])

  const elegir = useCallback((filtro: SeleccionPorEtapa) => {
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

  const portada = estado.tipo === 'listo' ? estado.portada : null
  const accionDeTarjeta = (accion: AccionDeTarjeta, t: TarjetaParaHoy): boolean => {
    if (accion === 'crear_evento') {
      setCreador({ tipo: 'evento', fecha: t.fecha, nombre: t.nombre })
      return true
    }
    if (accion === 'subir_foto' && t.evento_id) {
      void abrirEvento(t.evento_id)
      return true
    }
    return false
  }

  return (
    <>
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
        vista={vista}
        onVista={onVista}
        onCrear={setCreador}
        onAbrirEvento={(id) => void abrirEvento(id)}
        onAccionDeTarjeta={accionDeTarjeta}
        recargaDelCalendario={recargaDelCalendario}
        avisoDelEvento={errorDelEvento}
      />
      {portada && (
        <CreadorDelCiclo
          pedido={creadorPedido}
          onCerrar={() => {
            setCreador(null)
            atenderUrl()
          }}
          numeros={{
            enElCiclo: portada.numeros.en_el_ciclo,
            dormidos: portada.numeros.dormidos,
            encendido: portada.ciclo.encendido,
            hora: portada.ciclo.hora,
          }}
          puedeMandarRegalos={portada.permisos?.aprobar === true}
          onListo={trasCrear}
          onMensajeLibre={
            onMensajeLibre
              ? () => {
                  setCreador(null)
                  atenderUrl()
                  onMensajeLibre()
                }
              : undefined
          }
        />
      )}
      <EventDetailDrawer
        open={evento !== null}
        onOpenChange={(o) => {
          if (!o) {
            fichaAbierta.current = null
            setEvento(null)
            atenderUrl()
          }
        }}
        event={evento}
        onUpdated={() => {
          trasCrear()
          // La ficha muestra lo que se acaba de guardar (la foto, por ejemplo).
          if (fichaAbierta.current) void abrirEvento(fichaAbierta.current, true)
        }}
      />
    </>
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
  vista = 'etapa',
  onVista,
  onCrear,
  onAbrirEvento,
  onAccionDeTarjeta,
  recargaDelCalendario = 0,
  avisoDelEvento = null,
}: {
  estado: EstadoDeLaPantalla
  seleccion: SeleccionPorEtapa | null
  detalleRef?: Ref<HTMLDivElement>
  onElegir: (filtro: SeleccionPorEtapa) => void
  onReintentar: () => void
  onCambio?: () => void
  vista?: VistaDelCicloEn
  onVista?: (v: VistaDelCicloEn) => void
  /** Abre el creador («Mandar un regalo», «Crear aquí», «Mandarles un regalo»). */
  onCrear?: (pedido: PedidoDelCreador) => void
  onAbrirEvento?: (eventoId: string) => void
  /** «Crear evento» / «Subir foto» de «Para hoy» sin salir de la pantalla. */
  onAccionDeTarjeta?: (accion: AccionDeTarjeta, t: TarjetaParaHoy) => boolean
  recargaDelCalendario?: number
  /** Un evento que no se pudo abrir. */
  avisoDelEvento?: string | null
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
  const puedeMandar = permisos?.aprobar === true
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
      <BarraDelCiclo
        vista={vista}
        onVista={onVista}
        onMandarRegalo={onCrear && puedeMandar ? () => onCrear({ tipo: 'regalo' }) : undefined}
      />

      {aviso && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
          {aviso} Lo que ves es lo último que pudimos leer.
        </p>
      )}

      <EstadoDelCiclo ciclo={portada.ciclo} ritmo={portada.ritmo} permisos={permisos} onCambio={onCambio} />

      {mostrarPrimerUso(portada.primer_uso) && <PrimerUso datos={portada.primer_uso} />}

      {avisoDelEvento && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
          {avisoDelEvento}
        </p>
      )}

      {portada.para_hoy && (
        <ParaHoy
          tarjetas={portada.para_hoy}
          permisos={permisos}
          hoyIso={hoyEnBogota()}
          onCambio={onCambio}
          onAccion={onAccionDeTarjeta}
        />
      )}

      <NumerosDeArriba portada={portada} />

      {vista === 'fecha' ? (
        <VistaPorFecha
          hoyIso={hoyEnBogota()}
          recarga={recargaDelCalendario}
          onCrearAqui={(fecha) => onCrear?.({ tipo: 'evento', fecha })}
          onAbrirEvento={(id) => onAbrirEvento?.(id)}
        />
      ) : (
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
                  accion={
                    onCrear && puedeMandar && seleccion.tipo === 'caja' && seleccion.clave !== 'reciente'
                      ? {
                          etiqueta: 'Mandarles un regalo',
                          onClick: () =>
                            onCrear({ tipo: 'regalo', audiencia: seleccion.clave }),
                        }
                      : undefined
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">Toca una caja para ver quiénes son.</p>
              )}
            </CardContent>
          </Card>
          <ComoDecide grupoDeControlPct={portada.ciclo.grupo_de_control_pct} />
        </aside>
      </div>
      )}
    </div>
  )
}

/** «Por etapa | Por fecha» y el botón principal (spec §6.5: «Mandar un regalo» abre directo). */
function BarraDelCiclo({
  vista,
  onVista,
  onMandarRegalo,
}: {
  vista: VistaDelCicloEn
  onVista?: (v: VistaDelCicloEn) => void
  onMandarRegalo?: () => void
}) {
  if (!onVista && !onMandarRegalo) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {onVista ? (
        <div role="group" aria-label="Vista" className="inline-flex rounded-lg border p-0.5">
          {(['etapa', 'fecha'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => onVista(v)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                vista === v ? 'bg-[var(--brand-primary)] text-[var(--brand-on-primary)]' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'etapa' ? 'Por etapa' : 'Por fecha'}
            </button>
          ))}
        </div>
      ) : (
        <span />
      )}
      {onMandarRegalo && (
        <Button type="button" onClick={onMandarRegalo}>
          <Gift className="size-4" aria-hidden="true" />
          Mandar un regalo
        </Button>
      )}
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
