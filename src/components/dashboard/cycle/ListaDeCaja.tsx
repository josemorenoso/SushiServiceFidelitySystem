'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  QUE_RECIBEN,
  clientes as textoClientes,
  consultaDeLista,
  detalleDeCliente,
  leerJson,
  pildoraDeCliente,
  type FiltroDeLista,
} from '@/lib/cycle-screen'
import type { ClienteDeLaLista, ListaDelCiclo } from '@/services/cycle-overview.service'

const NO_SE_PUDO_LA_LISTA = 'No pudimos cargar la lista ahora mismo.'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; total: number; clientes: ClienteDeLaLista[]; pagina: number }

/**
 * La lista de quiénes (spec §6.2): nombre, ciclo, visitas, puntos, último toque y si volvió.
 * Se abre al tocar una caja (`?stage=` / `?state=dormido`) o una barra del histograma (`?day=`).
 *
 * **Cada filtro es una instancia nueva** (el padre le pone `key`): el estado arranca en
 * «cargando» y no se resetea con un efecto. Un 500 o un corte de red dice «no pudimos cargar la
 * lista» con un botón para reintentar; NUNCA «0 clientes» (el incidente del 04-10).
 */
export function ListaDeCaja({
  filtro,
  titulo,
  descripcion,
  accion,
}: {
  filtro: FiltroDeLista
  titulo: string
  descripcion: string
  /** Un botón bajo el título: «Mandarles un regalo» (parte C). */
  accion?: { etiqueta: string; onClick: () => void }
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [reintento, setReintento] = useState(0)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [errorAlPaginar, setErrorAlPaginar] = useState<string | null>(null)
  const consulta = consultaDeLista(filtro, 1)

  useEffect(() => {
    let activo = true
    leerJson<ListaDelCiclo>(consulta, NO_SE_PUDO_LA_LISTA).then((r) => {
      if (!activo) return
      setEstado(
        r.ok
          ? { tipo: 'lista', total: r.datos.total, clientes: r.datos.clientes, pagina: r.datos.pagina }
          : { tipo: 'error', mensaje: r.mensaje }
      )
    })
    return () => {
      activo = false
    }
  }, [consulta, reintento])

  const verMas = async () => {
    if (estado.tipo !== 'lista') return
    setCargandoMas(true)
    setErrorAlPaginar(null)
    const r = await leerJson<ListaDelCiclo>(consultaDeLista(filtro, estado.pagina + 1), NO_SE_PUDO_LA_LISTA)
    setCargandoMas(false)
    if (!r.ok) {
      setErrorAlPaginar(r.mensaje)
      return
    }
    setEstado({
      tipo: 'lista',
      total: r.datos.total,
      clientes: [...estado.clientes, ...r.datos.clientes],
      pagina: r.datos.pagina,
    })
  }

  const clave = filtro.tipo === 'caja' ? filtro.clave : null

  return (
    <div aria-live="polite">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{descripcion}</p>
      <h3 className="text-lg font-semibold">
        {estado.tipo === 'lista' ? textoClientes(estado.total) : titulo}
      </h3>
      {clave && <p className="mt-0.5 text-xs text-muted-foreground">{QUE_RECIBEN[clave]}</p>}
      {accion && (
        <Button type="button" size="sm" className="mt-2" onClick={accion.onClick}>
          {accion.etiqueta}
        </Button>
      )}

      {estado.tipo === 'cargando' && (
        <div className="mt-3 space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {estado.tipo === 'error' && (
        <div role="alert" className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>{estado.mensaje}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEstado({ tipo: 'cargando' })
              setReintento((n) => n + 1)
            }}
          >
            Reintentar
          </Button>
        </div>
      )}

      {estado.tipo === 'lista' && (
        <>
          {estado.clientes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nadie está aquí en este momento.</p>
          ) : (
            <ul className="mt-2">
              {estado.clientes.map((c) => {
                const pildora = pildoraDeCliente(c)
                return (
                  <li key={c.id} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 border-t py-2 first:border-t-0">
                    <span className="min-w-0 truncate text-sm font-semibold">{c.nombre}</span>
                    <span
                      className={`self-start whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        pildora.nuevo ? 'bg-primary/10 text-primary' : 'bg-emerald-600/10 text-emerald-700'
                      }`}
                    >
                      {pildora.texto}
                    </span>
                    <span className="col-span-2 text-xs text-muted-foreground">{detalleDeCliente(c)}</span>
                  </li>
                )
              })}
            </ul>
          )}

          {estado.clientes.length < estado.total && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Mostrando {estado.clientes.length} de {estado.total}
              </p>
              {errorAlPaginar && (
                <p role="alert" className="text-xs text-red-700">
                  {errorAlPaginar}
                </p>
              )}
              <Button type="button" size="sm" variant="outline" disabled={cargandoMas} onClick={verMas}>
                {cargandoMas ? 'Cargando…' : 'Ver más'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
