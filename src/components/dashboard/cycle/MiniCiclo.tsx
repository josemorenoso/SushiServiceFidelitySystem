'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDemo } from '@/contexts/DemoContext'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import {
  COLOR_DE_CAJA,
  RUTAS_DEL_CICLO,
  cantidad,
  leerPortadaDelCiclo,
  rangoDeCaja,
  type PortadaDelCiclo,
} from '@/lib/cycle-screen'

export type EstadoDelMiniCiclo =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; portada: PortadaDelCiclo }

/**
 * El mini-ciclo del panel principal (spec §6.7): las cajas SIN detalle —nombre, rango y cuántos
 * hay— con un enlace a la pantalla completa. Reemplaza a las burbujas de riesgo, que tenían su
 * propia escala de días; ahora el panel y Campañas dicen lo mismo.
 *
 * Lee `overview?mini=1`: no le pregunta nada al proveedor de WhatsApp, así que no frena la
 * carga del panel. Es de la MARCA entera (el ciclo no se parte por sede), y lo dice cuando la
 * marca tiene varias. Un fallo no es «0 clientes»: es «no pudimos leer tu ciclo».
 */
export function MiniCiclo() {
  const { isDemo } = useDemo()
  const { view } = useLocationScope()
  const [estado, setEstado] = useState<EstadoDelMiniCiclo>({ tipo: 'cargando' })
  const [lectura, setLectura] = useState(0)

  useEffect(() => {
    if (isDemo) return
    let activo = true
    leerPortadaDelCiclo({ mini: true }).then((r) => {
      if (!activo) return
      setEstado(r.ok ? { tipo: 'listo', portada: r.datos } : { tipo: 'error', mensaje: r.mensaje })
    })
    return () => {
      activo = false
    }
  }, [isDemo, lectura])

  // En modo demostración el panel enseña datos de muestra: el ciclo real de la marca no se mezcla.
  if (isDemo) return null

  return (
    <VistaDelMiniCiclo
      estado={estado}
      deToda={view?.multiSede === true}
      onReintentar={() => {
        setEstado({ tipo: 'cargando' })
        setLectura((n) => n + 1)
      }}
    />
  )
}

/** Dibuja un estado del mini-ciclo. Sin efectos propios. */
export function VistaDelMiniCiclo({
  estado,
  deToda,
  onReintentar,
}: {
  estado: EstadoDelMiniCiclo
  /** La marca tiene varias sedes: se aclara que el ciclo es de toda la marca. */
  deToda: boolean
  onReintentar: () => void
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="text-lg font-semibold">Tu ciclo de recuperación</h2>
            <p className="text-xs text-muted-foreground">
              Cuántos clientes hay en cada etapa{deToda ? ' (de toda la marca, no de una sede)' : ''}.
            </p>
          </div>
          <Link
            href={RUTAS_DEL_CICLO.campanas}
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline underline-offset-2"
          >
            Ver el ciclo <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {estado.tipo === 'cargando' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-busy="true">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}

        {estado.tipo === 'error' && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-800">
              {estado.mensaje}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={onReintentar}>
              Reintentar
            </Button>
          </div>
        )}

        {estado.tipo === 'listo' && (
          <>
            {!estado.portada.ciclo.encendido && (
              <p className="text-xs text-muted-foreground">
                El ciclo automático está apagado en tu marca: así estarían tus clientes si estuviera encendido.
              </p>
            )}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {[
                ...estado.portada.cajas.map((c) => ({
                  clave: c.key,
                  etiqueta: c.etiqueta,
                  rango: rangoDeCaja(c),
                  total: c.total,
                })),
                {
                  clave: 'dormidos' as const,
                  etiqueta: estado.portada.dormidos.etiqueta,
                  rango: 'sin insistir',
                  total: estado.portada.dormidos.total,
                },
              ].map((c) => (
                <li
                  key={c.clave}
                  style={{ '--c': COLOR_DE_CAJA[c.clave] } as CSSProperties}
                  className="grid min-w-0 gap-0.5 rounded-lg border border-t-4 border-t-[var(--c)] bg-[color-mix(in_oklab,var(--c)_8%,var(--card))] p-2"
                >
                  <span className="truncate text-xs font-semibold">{c.etiqueta}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{c.rango}</span>
                  <span className="text-xl font-semibold leading-tight tabular-nums">{cantidad(c.total)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
