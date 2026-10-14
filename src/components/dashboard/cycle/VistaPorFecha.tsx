'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DIAS_DE_LA_SEMANA_CORTOS,
  cantidad,
  celdaDelCalendario,
  detalleDelDia,
  fechaLarga,
  leerJson,
  mesDeFecha,
  moverMes,
  particionDeEntrada,
  rangoDelMes,
  semanasDelMes,
  tituloDelMes,
  type MesDelCalendario,
} from '@/lib/cycle-screen'
import type { CycleProjection, EventoDelCalendario } from '@/services/cycle-overview.service'
import { ListaDeCaja } from './ListaDeCaja'

const NO_SE_PUDO_EL_CALENDARIO = 'No pudimos leer el calendario de tu ciclo en este momento. Intenta de nuevo en un minuto.'

export type EstadoDelCalendario =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; proyeccion: CycleProjection }

function esProyeccion(x: unknown): x is CycleProjection {
  const o = x as Partial<CycleProjection> | null
  return !!o && Array.isArray(o.dias) && Array.isArray(o.eventos) && typeof o.hoy === 'string'
}

/** La sombra «reservado para el evento» (blackout): rayas de la marca, ningún hex. */
const SOMBRA_RESERVADA: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, color-mix(in oklab, var(--brand-primary) 14%, transparent) 0 5px, transparent 5px 10px)',
}

/**
 * La vista «por fecha» (spec §6.4, parte C): el calendario como el MISMO dato girado. El mes en
 * cuadrícula y, en cada día, los eventos, las fechas especiales sugeridas y la proyección
 * («23 → rescate»). Tocar un día muestra quiénes entran (nuevos / ya volvieron) y «Crear aquí»;
 * el blackout de un evento se ve como sombra: «reservado para el evento».
 *
 * Todo sale de `GET /api/dashboard/cycle/projection` (el motor del cron): esta vista no calcula
 * ninguna etapa ni día del ciclo. Un fallo dice «no pudimos leer» y no dibuja un solo número.
 */
export function VistaPorFecha({
  hoyIso,
  recarga = 0,
  onCrearAqui,
  onAbrirEvento,
}: {
  /** Hoy en Bogotá (`AAAA-MM-DD`): el mes con que abre y qué días ya pasaron. */
  hoyIso: string
  /** Cambia cuando algo se creó (un evento): vuelve a leer el mes. */
  recarga?: number
  onCrearAqui: (fecha: string) => void
  onAbrirEvento: (eventoId: string) => void
}) {
  const [mes, setMes] = useState<MesDelCalendario>(() => mesDeFecha(hoyIso))
  const [estado, setEstado] = useState<EstadoDelCalendario>({ tipo: 'cargando' })
  const [reintento, setReintento] = useState(0)
  const [elegido, setElegido] = useState(hoyIso)

  const { desde, hasta } = rangoDelMes(mes)
  useEffect(() => {
    let activo = true
    leerJson<unknown>(`/api/dashboard/cycle/projection?from=${desde}&to=${hasta}`, NO_SE_PUDO_EL_CALENDARIO).then((r) => {
      if (!activo) return
      if (!r.ok) setEstado({ tipo: 'error', mensaje: r.mensaje })
      else if (!esProyeccion(r.datos)) setEstado({ tipo: 'error', mensaje: NO_SE_PUDO_EL_CALENDARIO })
      else setEstado({ tipo: 'listo', proyeccion: r.datos })
    })
    return () => {
      activo = false
    }
  }, [desde, hasta, reintento, recarga])

  const cambiarMes = (delta: number) => {
    const otro = moverMes(mes, delta)
    setEstado({ tipo: 'cargando' })
    setMes(otro)
    // Al cambiar de mes queda elegido el día 1 (o hoy, si es el mes de hoy).
    const r = rangoDelMes(otro)
    setElegido(hoyIso >= r.desde && hoyIso <= r.hasta ? hoyIso : r.desde)
  }

  return (
    <CalendarioDelCiclo
      estado={estado}
      mes={mes}
      hoyIso={hoyIso}
      elegido={elegido}
      onElegir={setElegido}
      onMes={cambiarMes}
      onReintentar={() => {
        setEstado({ tipo: 'cargando' })
        setReintento((n) => n + 1)
      }}
      onCrearAqui={onCrearAqui}
      onAbrirEvento={onAbrirEvento}
    />
  )
}

/** Dibuja un estado del calendario. Sin efectos propios (se prueba sin navegador). */
export function CalendarioDelCiclo({
  estado,
  mes,
  hoyIso,
  elegido,
  onElegir,
  onMes,
  onReintentar,
  onCrearAqui,
  onAbrirEvento,
}: {
  estado: EstadoDelCalendario
  mes: MesDelCalendario
  hoyIso: string
  elegido: string
  onElegir: (fecha: string) => void
  onMes: (delta: number) => void
  onReintentar: () => void
  onCrearAqui: (fecha: string) => void
  onAbrirEvento: (eventoId: string) => void
}) {
  const semanas = semanasDelMes(mes)
  const datos = estado.tipo === 'listo' ? estado.proyeccion : null
  const porFecha = useMemo(() => new Map((datos?.dias ?? []).map((d) => [d.fecha, d])), [datos])
  const eventos = useMemo(() => new Map<string, EventoDelCalendario>((datos?.eventos ?? []).map((e) => [e.id, e])), [datos])
  const diaElegido = porFecha.get(elegido) ?? null

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Qué pasa cada día</h2>
              <p className="text-xs text-muted-foreground">
                Quiénes entran a un toque, los eventos y las fechas especiales. Toca un día para crear algo ahí.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={() => onMes(-1)} aria-label="Mes anterior">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold capitalize">{tituloDelMes(mes)}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => onMes(1)} aria-label="Mes siguiente">
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {estado.tipo === 'error' ? (
            <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p>{estado.mensaje}</p>
              <Button type="button" size="sm" variant="outline" onClick={onReintentar}>
                Reintentar
              </Button>
            </div>
          ) : (
            <div role="grid" aria-label={`Calendario de ${tituloDelMes(mes)}`} aria-busy={estado.tipo === 'cargando'} className="space-y-1">
              <div role="row" className="grid grid-cols-7 gap-1">
                {DIAS_DE_LA_SEMANA_CORTOS.map((d, i) => (
                  <div key={i} role="columnheader" className="text-center text-[11px] font-semibold text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>
              {semanas.map((semana, i) => (
                <div key={i} role="row" className="grid grid-cols-7 gap-1">
                  {semana.map((fecha, j) => {
                    if (!fecha) return <div key={j} role="gridcell" aria-hidden="true" />
                    const dia = porFecha.get(fecha)
                    if (estado.tipo === 'cargando' || !dia) {
                      return <Skeleton key={j} className="h-14 sm:h-24" />
                    }
                    const c = celdaDelCalendario(dia, eventos, hoyIso)
                    const marcado = fecha === elegido
                    return (
                      <button
                        key={j}
                        type="button"
                        role="gridcell"
                        aria-selected={marcado}
                        aria-label={`${fechaLarga(fecha)}${c.total > 0 ? `: ${c.total} entran a un toque` : ''}${c.eventos.length > 0 ? `, evento ${c.eventos.map((e) => e.titulo).join(', ')}` : ''}${c.especiales.length > 0 ? `, ${c.especiales.join(', ')}` : ''}${c.reservado ? ', reservado para un evento' : ''}`}
                        onClick={() => onElegir(fecha)}
                        style={c.reservado ? SOMBRA_RESERVADA : undefined}
                        className={`flex min-h-14 min-w-0 flex-col gap-0.5 overflow-hidden rounded-md border p-1 text-left text-[11px] leading-tight transition-colors sm:min-h-24 sm:p-1.5 ${
                          marcado ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/30' : 'hover:bg-muted/40'
                        } ${c.pasado ? 'opacity-55' : ''} ${c.especiales.length > 0 ? 'border-dashed' : ''}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-semibold ${c.hoy ? 'text-[var(--brand-primary)]' : ''}`}>{c.numero}</span>
                          {c.hoy && <span className="hidden rounded bg-[var(--brand-primary)]/10 px-1 text-[10px] font-semibold text-[var(--brand-primary)] sm:inline">hoy</span>}
                        </span>
                        {c.eventos.map((e) => (
                          <span key={e.id} className="truncate font-semibold text-[var(--brand-primary)]">
                            ●<span className="hidden sm:inline"> {e.titulo}</span>
                          </span>
                        ))}
                        {c.especiales.map((nombre) => (
                          <span key={nombre} className="hidden truncate rounded border border-dashed px-1 text-muted-foreground sm:block">
                            {nombre}
                          </span>
                        ))}
                        {c.entran.map((e) => (
                          <span key={e.etapa} className="hidden truncate text-muted-foreground sm:block">
                            {e.texto}
                          </span>
                        ))}
                        {c.total > 0 && (
                          <span className="mt-auto font-semibold tabular-nums">
                            {cantidad(c.total)}
                            <span className="hidden font-normal text-muted-foreground sm:inline"> entran</span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm border" style={SOMBRA_RESERVADA} aria-hidden="true" />
              reservado para un evento (los días antes)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm border border-dashed" aria-hidden="true" />
              fecha especial sugerida
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--brand-primary)]" aria-hidden="true">●</span> evento
            </span>
          </div>
        </CardContent>
      </Card>

      <aside className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardContent>
            {datos && diaElegido ? (
              <DetalleDelDia
                key={diaElegido.fecha}
                dia={diaElegido}
                eventos={eventos}
                hoyIso={hoyIso}
                onCrearAqui={onCrearAqui}
                onAbrirEvento={onAbrirEvento}
              />
            ) : estado.tipo === 'listo' ? (
              <p className="text-sm text-muted-foreground">Toca un día para ver quiénes entran.</p>
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}

function DetalleDelDia({
  dia,
  eventos,
  hoyIso,
  onCrearAqui,
  onAbrirEvento,
}: {
  dia: CycleProjection['dias'][number]
  eventos: ReadonlyMap<string, EventoDelCalendario>
  hoyIso: string
  onCrearAqui: (fecha: string) => void
  onAbrirEvento: (eventoId: string) => void
}) {
  const [verQuienes, setVerQuienes] = useState(false)
  const d = detalleDelDia(dia, eventos, hoyIso)
  const delDia = dia.eventos.map((id) => eventos.get(id)).filter((e): e is EventoDelCalendario => !!e)
  return (
    <div aria-live="polite" className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{fechaLarga(dia.fecha)}</p>
        <h3 className="text-lg font-semibold">{d.titulo}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{d.texto}</p>
      </div>

      {dia.entran.length > 0 && (
        <ul className="space-y-1.5">
          {dia.entran.map((e) => (
            <li key={e.etapa} className="grid grid-cols-[1fr_auto] gap-x-2 border-t pt-1.5 first:border-t-0 first:pt-0">
              <span className="text-sm font-semibold">{e.etapa === 'heartbeat' ? 'Toque trimestral a dormidos' : e.etiqueta}</span>
              <span className="rounded-full bg-muted px-2 text-xs font-semibold tabular-nums">{cantidad(e.total)}</span>
              <span className="col-span-2 text-xs text-muted-foreground">{particionDeEntrada(e)}</span>
            </li>
          ))}
        </ul>
      )}

      {delDia.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {delDia.map((e) => (
            <Button key={e.id} type="button" size="sm" variant="outline" onClick={() => onAbrirEvento(e.id)}>
              {e.sin_foto ? `Subir foto · ${e.titulo}` : `Ver «${e.titulo}»`}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {d.sePuedeCrear && (
          <Button type="button" size="sm" onClick={() => onCrearAqui(dia.fecha)}>
            Crear aquí
          </Button>
        )}
        {dia.entran.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => setVerQuienes((v) => !v)} aria-expanded={verQuienes}>
            {verQuienes ? 'Ocultar quiénes' : 'Ver quiénes'}
          </Button>
        )}
      </div>

      {verQuienes && (
        <ListaDeCaja filtro={{ tipo: 'fecha', fecha: dia.fecha }} titulo="Quiénes" descripcion={`Entran el ${fechaLarga(dia.fecha)}`} />
      )}
    </div>
  )
}
