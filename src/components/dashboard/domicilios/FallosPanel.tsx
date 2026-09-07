'use client'

/**
 * Bloque 3 — los domicilios que NO entraron, y la alarma de silencio (§24.3-B).
 *
 * POR QUÉ ES EL BLOQUE MÁS IMPORTANTE DE LA PANTALLA
 * ──────────────────────────────────────────────────
 * Sin él, *«llegaron tres pedidos y se perdieron los tres»* y *«hoy no pidió nadie»* son
 * el mismo dato: cero filas en `visits`. Ningún semáforo honesto puede pintarlos igual, y
 * por eso acá se distingue con todas las letras entre «no hubo fallos» y «no pudimos
 * saber si los hubo».
 *
 * LOS COLORES DEL SEMÁFORO NO SON DE MARCA
 * ────────────────────────────────────────
 * El ámbar de un aviso y el rojo de una alarma son colores de ESTADO, no de identidad: una
 * marca no debería poder repintar su propia alarma de verde. Por eso salen de la escala de
 * Tailwind y no de `--brand-*`, y no hay un solo hex nuevo en este archivo.
 *
 * SIN BOTÓN DE REINTENTAR, A PROPÓSITO
 * ────────────────────────────────────
 * Reprocesar un pedido perdido vuelve a llamar (y a pagar) OpenAI y es otro alcance. Queda
 * anotado como deuda en `docs/features/delivery-dashboard.md`, no construido a medias.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Info,
} from 'lucide-react'
import { formatInAppTz } from '@/lib/timezone'
import type { SilenceAssessment } from '@/lib/delivery-silence'
import type { DeliveryFailureRow } from '@/services/delivery-dashboard.service'

/**
 * Cuatro estados, cuatro tratamientos. **Gris no es verde**: «no hay línea base todavía»
 * tiene su propio color y su propio motivo — es la misma decisión que tomó el tablero de
 * salud del AIOS, y por el mismo motivo.
 */
const SILENCIO_ESTILO: Record<
  SilenceAssessment['status'],
  { caja: string; titulo: string; texto: string; icono: typeof BellOff; etiqueta: string }
> = {
  sin_historial: {
    caja: 'border-slate-200 bg-slate-50',
    titulo: 'text-slate-900',
    texto: 'text-slate-700',
    icono: CircleHelp,
    etiqueta: 'Sin línea base',
  },
  al_dia: {
    caja: 'border-emerald-200 bg-emerald-50',
    titulo: 'text-emerald-900',
    texto: 'text-emerald-800',
    icono: CheckCircle2,
    etiqueta: 'Al día',
  },
  aviso: {
    caja: 'border-amber-200 bg-amber-50',
    titulo: 'text-amber-900',
    texto: 'text-amber-800',
    icono: BellOff,
    etiqueta: 'Fuera de tu ritmo',
  },
  alarma: {
    caja: 'border-rose-200 bg-rose-50',
    titulo: 'text-rose-900',
    texto: 'text-rose-800',
    icono: AlertTriangle,
    etiqueta: 'Silencio largo',
  },
}

export function SilenceAlert({ silence }: { silence: SilenceAssessment }) {
  const estilo = SILENCIO_ESTILO[silence.status]
  const Icono = estilo.icono

  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${estilo.caja}`}>
      <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${estilo.titulo}`} strokeWidth={1.5} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-semibold ${estilo.titulo}`}>{estilo.etiqueta}</p>
          {silence.lastDeliveryDate && (
            <Badge variant="outline">
              Último pedido: {formatInAppTz(`${silence.lastDeliveryDate}T12:00:00-05:00`, { dateStyle: 'medium' })}
            </Badge>
          )}
        </div>

        <p className={`mt-1 text-sm ${estilo.texto}`}>{silence.message}</p>

        {silence.alarmaAtDays !== null && (
          <p className={`mt-2 text-xs ${estilo.texto} opacity-80`}>
            El umbral sale de TU historial, no de un número fijo: en los últimos{' '}
            {silence.windowDays} días entró al menos un pedido en {silence.activeDays} días
            distintos, así que acá avisamos a los {silence.avisoAtDays} días de silencio y alarmamos
            a los {silence.alarmaAtDays}. Otra marca con otro ritmo tiene otros números.
          </p>
        )}

        <p className={`mt-2 text-xs ${estilo.texto} opacity-70`}>
          Esto solo se muestra acá. No se manda ningún mensaje ni correo por este aviso.
        </p>
      </div>
    </div>
  )
}

export function FallosPanel({
  failures,
  available,
  loading,
  error,
  sedeSeleccionada,
}: {
  failures: DeliveryFailureRow[]
  available: boolean
  loading: boolean
  error: string | null
  /** `true` si el selector de sede tiene una sede concreta elegida. */
  sedeSeleccionada: boolean
}) {
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <Card className="premium-card">
      <CardHeader>
        <CardTitle className="text-lg" style={{ color: 'var(--brand-ink)' }}>
          Los que no entraron
        </CardTitle>
        <CardDescription style={{ color: 'var(--brand-ink-soft)' }}>
          Pedidos que llegaron pero no se pudieron guardar, con el motivo real de cada uno.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {sedeSeleccionada && (
          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" strokeWidth={1.5} />
            <p className="text-xs text-slate-700">
              Esta lista es de <strong>toda la marca</strong>, no solo de la sede que elegiste. No es
              un descuido: cuando un pedido se pierde porque no se pudo verificar quién lo mandó, la
              sede es imposible de saber — así que registrarla habría sido inventarla.
            </p>
          </div>
        )}

        {loading && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
            Cargando…
          </p>
        )}

        {/* No se pudo leer ≠ no hubo fallos. Es la distinción que esta pantalla vino a hacer. */}
        {!loading && error && (
          <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-900" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-semibold text-rose-900">No pudimos leer esta lista</p>
              <p className="mt-1 text-sm text-rose-800">
                {error} Eso <strong>no</strong> quiere decir que no haya habido pedidos perdidos:
                quiere decir que ahora mismo no lo sabemos. Recargá en un momento.
              </p>
            </div>
          </div>
        )}

        {/* La 00053 todavía no corrió en esta base. Tampoco es «cero fallos». */}
        {!loading && !error && !available && (
          <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Todavía no se está guardando el registro de pedidos perdidos
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Falta un paso técnico en la base de datos (la migración <code>00053</code>). Hasta
                que Cada1 lo corra, un pedido que no entre solo deja rastro en los registros
                internos y no se puede listar acá. <strong>No significa que no haya habido
                ninguno.</strong>
              </p>
            </div>
          </div>
        )}

        {!loading && !error && available && failures.length === 0 && (
          <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-900" strokeWidth={1.5} />
            <p className="text-sm text-emerald-800">
              No se perdió ni un pedido. Esto sí es un cero de verdad: el registro está activo y no
              tiene nada.
            </p>
          </div>
        )}

        {!loading && !error && available && failures.length > 0 && (
          <ul className="space-y-3">
            {failures.map((f) => {
              const expandido = abierto === f.id
              const culpaNuestra = f.explanation.blame === 'nosotros'
              return (
                <li
                  key={f.id}
                  className={`rounded-2xl border p-4 ${
                    culpaNuestra ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={culpaNuestra ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'}>
                      {f.explanation.label}
                    </Badge>
                    {!f.explanation.conocido && (
                      <Badge variant="outline">Motivo nuevo, sin traducir</Badge>
                    )}
                    <span className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
                      {formatInAppTz(f.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
                      · Operador: {f.operator_phone ?? 'no se pudo saber'}
                    </span>
                  </div>

                  <p className={`mt-2 text-sm ${culpaNuestra ? 'text-rose-900' : 'text-amber-900'}`}>
                    {f.explanation.quePaso}
                  </p>
                  <p className={`mt-1 text-sm ${culpaNuestra ? 'text-rose-800' : 'text-amber-800'}`}>
                    {f.explanation.queHacer}
                  </p>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 px-0"
                    aria-expanded={expandido}
                    onClick={() => setAbierto(expandido ? null : f.id)}
                  >
                    {expandido ? (
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    )}
                    {expandido ? 'Ocultar el detalle' : 'Ver el mensaje original y el detalle'}
                  </Button>

                  {expandido && (
                    <div className="mt-2 space-y-2 rounded-xl bg-white p-3">
                      <div>
                        <p
                          className="text-xs font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--brand-ink-muted)' }}
                        >
                          Detalle técnico ({f.explanation.reason})
                        </p>
                        <p className="mt-1 font-mono text-xs" style={{ color: 'var(--brand-ink-soft)' }}>
                          {f.detail}
                        </p>
                      </div>
                      <div>
                        <p
                          className="text-xs font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--brand-ink-muted)' }}
                        >
                          El mensaje original
                        </p>
                        <p
                          className="mt-1 font-mono text-sm whitespace-pre-wrap"
                          style={{ color: 'var(--brand-ink)' }}
                        >
                          {f.raw_message}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
