'use client'

/**
 * «Salir» — quién pidió no recibir más mensajes.
 *
 * Funciona con cualquier proveedor porque lee la columna que el sistema de
 * verdad respeta (`customers.whatsapp_opt_out_at`), la misma que consulta
 * `isPhoneOptedOut()` antes de cada envío. El panel de Twilio de más abajo
 * deduce los opt-outs de la API de Mensajes de Twilio, así que a un negocio en
 * Zernio le mostraría cero aunque sus clientes sí hayan respondido SALIR.
 *
 * Por qué merece pantalla propia: la tasa de opt-out es la señal temprana de
 * que la lista se está quemando. Meta baja la calidad del número —y con ella el
 * límite diario— mucho antes de bloquearlo, y para cuando eso pasa ya no hay
 * marcha atrás rápida.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, RefreshCw, UserMinus } from 'lucide-react'

interface OptOutCustomer {
  id: string
  name: string | null
  phone: string
  optedOutAt: string
  totalVisits: number
  totalPoints: number
}

interface OptOutData {
  total: number
  base: number
  rate: number
  days: number
  recentCount: number
  recent: OptOutCustomer[]
}

/**
 * Umbrales de atención sobre el % de la base que pidió salir.
 *
 * No son reglas de Meta —Meta no publica un número— sino el criterio con el
 * que mirar la cifra: por debajo de 2 % es ruido normal, por encima de 5 % algo
 * en el contenido o en la frecuencia está molestando.
 */
const WARN_RATE = 2
const DANGER_RATE = 5

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function OptOutPanel() {
  const [data, setData] = useState<OptOutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // `cache: 'no-store'` no es adorno. La ruta es `force-dynamic` en el servidor,
      // pero eso no gobierna la caché HTTP del navegador: un `fetch` normal puede
      // servir la respuesta anterior y hacer que un SALIR recién llegado solo aparezca
      // al segundo refresco. Misma convención que `dashboard/calendar/page.tsx`.
      const res = await fetch('/api/dashboard/opt-outs', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo cargar.')
        return
      }
      setError(null)
      setData(json as OptOutData)
    } catch {
      setError('Error de conexión.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rateTone =
    !data || data.rate < WARN_RATE
      ? 'text-foreground'
      : data.rate < DANGER_RATE
        ? 'text-amber-600'
        : 'text-red-600'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserMinus className="h-4 w-4" />
              Clientes que pidieron salir
            </CardTitle>
            <CardDescription>
              Respondieron <strong>SALIR</strong> (o STOP, BAJA, CANCELAR) y el sistema dejó de
              enviarles. Se cuentan igual con Twilio y con Zernio.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading && !data ? (
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : !data ? null : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">{data.total}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  % de tu base
                </p>
                <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${rateTone}`}>
                  {data.rate}%
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Últimos {data.days} días
                </p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">{data.recentCount}</p>
              </div>
            </div>

            {data.rate >= DANGER_RATE && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                Más de {DANGER_RATE}% de tu base pidió salir. Cuando eso pasa, Meta baja la calidad
                del número y con ella el límite diario de mensajes. Vale la pena revisar la
                frecuencia de las campañas antes de lanzar la siguiente.
              </p>
            )}

            {data.recent.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                  {expanded ? 'Ocultar' : 'Ver'} los {data.recent.length} más recientes
                </button>

                {expanded && (
                  <ul className="mt-3 divide-y rounded-lg border">
                    {data.recent.map((customer) => (
                      <li
                        key={customer.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {customer.name || 'Sin nombre'}{' '}
                            <span className="font-normal text-muted-foreground">
                              {customer.phone}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {customer.totalVisits} visita
                            {customer.totalVisits === 1 ? '' : 's'} · {customer.totalPoints} puntos
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(customer.optedOutAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Un cliente puede volver a entrar respondiendo <strong>ALTA</strong> o{' '}
              <strong>START</strong>: eso limpia su salida y vuelve a recibir. Sus puntos y su
              historial nunca se tocan — salir es dejar de recibir mensajes, no perder el progreso.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
