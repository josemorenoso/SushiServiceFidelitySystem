'use client'

/**
 * /dashboard/domicilios — el apartado de Domicilios. §18.d + §24.3-B.
 *
 * Doc: `docs/features/delivery-dashboard.md`.
 *
 * Dos pestañas:
 *
 * · **Domicilios** — tres bloques: (1) cómo funciona (incluido A QUÉ NÚMERO se manda el
 *   cuadro, que bajo coexistencia es distinto en cada marca); (2) los domicilios que SÍ
 *   entraron; (3) los que NO entraron + la alarma de silencio. **Es SOLO LECTURA.** No hay
 *   formulario de carga manual: el alcance que fijó el dueño (2026-09-07) es que el apartado
 *   *muestre* los domicilios que ellos registran.
 * · **Autorizados** — los celulares que pueden mandar un pedido y su sede
 *   (`AutorizadosPanel`). Antes era una página aparte con entrada propia en el menú;
 *   `/dashboard/authorized-numbers` sigue funcionando y redirige acá (dueño, 2026-09-12).
 *
 * ⚠️ **Ni un `useSearchParams()`.** En Next.js 16 fuerza el CSR bailout de todo el grupo
 * `(dashboard)`, que no tiene `loading.tsx` ni Suspense en ninguna página. Los filtros
 * viven en estado local y la sede en `localStorage`, exactamente igual que el selector de
 * sede: el `?location_id=` viaja en la query de cada `fetch()`, nunca en la barra de
 * direcciones. La pestaña inicial se lee de `?tab=` con `window.location` vía
 * `useSyncExternalStore`, igual que en Recompensas: el servidor pinta «domicilios», el
 * cliente hidrata sin choque y después aplica la de la URL.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PackageCheck, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useLocationScope, LOCATION_ALL } from '@/contexts/LocationScopeContext'
import { ComoFuncionaCard } from '@/components/dashboard/domicilios/ComoFuncionaCard'
import { DomiciliosTable } from '@/components/dashboard/domicilios/DomiciliosTable'
import { FallosPanel, SilenceAlert } from '@/components/dashboard/domicilios/FallosPanel'
import { AutorizadosPanel } from '@/components/dashboard/domicilios/AutorizadosPanel'
import type {
  DeliveryChannel,
  DeliveryFailureRow,
  DeliveryOrderRow,
  DeliverySummary,
} from '@/services/delivery-dashboard.service'

const LIMIT = 25

const TABS = new Set(['domicilios', 'autorizados'])

const noSubscribe = () => () => {}
const leerTabDeUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('tab')
  } catch {
    return null
  }
}

/**
 * Fecha LOCAL del navegador en `YYYY-MM-DD`, solo para PRERRELLENAR los dos inputs.
 *
 * Que el prellenado use el reloj del navegador es aceptable —es una comodidad, y el
 * usuario lo puede cambiar—; lo que NO puede depender del navegador es cómo se muestran
 * las horas de los pedidos, y eso va por `formatInAppTz()` en hora de Bogotá.
 */
function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

function haceDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toLocaleDateString('en-CA')
}

export default function DomiciliosPage() {
  const { selection: locationSelection } = useLocationScope()

  // La URL no cambia mientras la página vive, así que no hay a qué suscribirse;
  // lo que importa es el par cliente/servidor de snapshots.
  const tabDeUrl = useSyncExternalStore(noSubscribe, leerTabDeUrl, () => null)
  const [tabElegida, setTab] = useState<string | null>(null)
  const tab = tabElegida ?? (tabDeUrl && TABS.has(tabDeUrl) ? tabDeUrl : 'domicilios')

  const [from, setFrom] = useState(haceDias(29))
  const [to, setTo] = useState(hoyISO())
  const [page, setPage] = useState(1)

  const [channel, setChannel] = useState<DeliveryChannel | null>(null)
  const [summary, setSummary] = useState<DeliverySummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [orders, setOrders] = useState<DeliveryOrderRow[]>([])
  const [total, setTotal] = useState(0)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [loadingOrders, setLoadingOrders] = useState(true)

  const [failures, setFailures] = useState<DeliveryFailureRow[]>([])
  const [failuresAvailable, setFailuresAvailable] = useState(true)
  const [failuresError, setFailuresError] = useState<string | null>(null)
  const [loadingFailures, setLoadingFailures] = useState(true)

  const scopeParam = useCallback(() => {
    const params = new URLSearchParams()
    if (locationSelection !== LOCATION_ALL) params.set('location_id', locationSelection)
    return params
  }, [locationSelection])

  // ─── Bloque 1 + contadores + alarma ───
  // El resumen NO depende del rango de fechas: sus ventanas (hoy / 7 / 30 días) son fijas
  // por definición, y hacerlas seguir al filtro convertiría "hoy" en otra cosa.
  const fetchResumen = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/domicilios/resumen?${scopeParam()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setSummary(null)
        setSummaryError(data?.error ?? 'No se pudo leer el resumen de domicilios.')
        return
      }
      setChannel(data.channel ?? null)
      setSummary(data.summary ?? null)
      setSummaryError(null)
    } catch {
      setSummary(null)
      setSummaryError('No se pudo leer el resumen de domicilios.')
    }
  }, [scopeParam])

  // ─── Bloque 2 ───
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const params = scopeParam()
      // El rango cubre el día completo en hora de Bogotá: [from 00:00, to 23:59:59.999].
      // El `-05:00` es literal a propósito: Colombia no tiene horario de verano, así que
      // el offset es constante (ver `APP_UTC_OFFSET` en src/lib/timezone.ts).
      if (from) params.set('from', new Date(`${from}T00:00:00-05:00`).toISOString())
      if (to) params.set('to', new Date(`${to}T23:59:59.999-05:00`).toISOString())
      params.set('page', String(page))
      params.set('limit', String(LIMIT))

      const res = await fetch(`/api/dashboard/domicilios?${params}`, { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        // Vacío por error NUNCA se pinta como "no hubo domicilios".
        setOrders([])
        setTotal(0)
        setOrdersError(data?.error ?? 'No se pudieron leer los domicilios.')
        toast.error('No se pudieron leer los domicilios')
        return
      }

      setOrders(Array.isArray(data.orders) ? data.orders : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
      setOrdersError(null)
    } catch {
      setOrders([])
      setTotal(0)
      setOrdersError('No se pudieron leer los domicilios.')
    } finally {
      setLoadingOrders(false)
    }
  }, [scopeParam, from, to, page])

  // ─── Bloque 3 ───
  const fetchFailures = useCallback(async () => {
    setLoadingFailures(true)
    try {
      const res = await fetch(`/api/dashboard/domicilios/fallos?${scopeParam()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setFailures([])
        setFailuresAvailable(true)
        setFailuresError(data?.error ?? 'No se pudo leer el registro de pedidos perdidos.')
        return
      }
      setFailures(Array.isArray(data.failures) ? data.failures : [])
      setFailuresAvailable(data.available !== false)
      setFailuresError(null)
    } catch {
      setFailures([])
      setFailuresError('No se pudo leer el registro de pedidos perdidos.')
    } finally {
      setLoadingFailures(false)
    }
  }, [scopeParam])

  useEffect(() => {
    fetchResumen()
  }, [fetchResumen])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    fetchFailures()
  }, [fetchFailures])

  // Cambiar de sede o de rango vuelve a la primera página: quedarse en la 4 de un
  // resultado que ahora tiene 2 muestra un vacío que parece "no hay nada".
  useEffect(() => {
    setPage(1)
  }, [from, to, locationSelection])

  const totalPaginas = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      <div>
        <h1 className="font-playfair text-2xl font-bold" style={{ color: 'var(--brand-ink)' }}>
          Domicilios
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
          Cómo funciona el flujo, los pedidos que entraron y los que no, y quién puede mandarlos.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="domicilios">Domicilios</TabsTrigger>
          <TabsTrigger value="autorizados">Autorizados</TabsTrigger>
        </TabsList>

        <TabsContent value="domicilios" className="mt-4 space-y-6">
          {/* ═══ BLOQUE 1 ═══ */}
          <ComoFuncionaCard channel={channel} onGestionarAutorizados={() => setTab('autorizados')} />

          {/* ═══ BLOQUE 2 ═══ */}
          <Card className="premium-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg" style={{ color: 'var(--brand-ink)' }}>
                <PackageCheck className="h-5 w-5" strokeWidth={1.5} />
                Los domicilios registrados
              </CardTitle>
              <CardDescription style={{ color: 'var(--brand-ink-soft)' }}>
                Cada pedido que entró por WhatsApp, con su cliente, su dirección y el mensaje original.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* ── Contadores ── */}
              {summaryError ? (
                <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-900" strokeWidth={1.5} />
                  <p className="text-sm text-rose-800">
                    {summaryError} No estamos mostrando ceros porque <strong>no lo sabemos</strong>: un
                    cero acá sería mentira.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Contador etiqueta="Hoy" valor={summary?.hoy} />
                  <Contador etiqueta="Últimos 7 días" valor={summary?.ultimos7} />
                  <Contador etiqueta="Últimos 30 días" valor={summary?.ultimos30} />
                  <Contador
                    etiqueta="Clientes nuevos (30 días)"
                    valor={summary?.clientesNuevos30Disponible === false ? undefined : summary?.clientesNuevos30}
                    nota={
                      summary?.clientesNuevos30Disponible === false
                        ? 'No se pudo calcular'
                        : 'Su primera visita en la marca fue un domicilio'
                    }
                  />
                </div>
              )}

              {/* ── Filtros ── */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="dom-from" className="text-xs" style={{ color: 'var(--brand-ink-soft)' }}>
                    Desde
                  </Label>
                  <Input
                    id="dom-from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="input-premium mt-1 w-40"
                  />
                </div>
                <div>
                  <Label htmlFor="dom-to" className="text-xs" style={{ color: 'var(--brand-ink-soft)' }}>
                    Hasta
                  </Label>
                  <Input
                    id="dom-to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="input-premium mt-1 w-40"
                  />
                </div>
                <p className="pb-2 text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
                  La sede se elige arriba, en el selector del panel. Las horas están en hora de Colombia.
                </p>
              </div>

              {/* ── La lista ── */}
              {ordersError ? (
                <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-900" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm font-semibold text-rose-900">No pudimos leer los domicilios</p>
                    <p className="mt-1 text-sm text-rose-800">
                      {ordersError} Eso <strong>no</strong> quiere decir que no haya habido pedidos:
                      quiere decir que ahora mismo no lo sabemos. Recargá en un momento.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <DomiciliosTable orders={orders} loading={loadingOrders} />

                  {total > LIMIT && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
                        {total} domicilio(s) · página {page} de {totalPaginas}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="btn-secondary-premium"
                          disabled={page <= 1 || loadingOrders}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Anterior
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="btn-secondary-premium"
                          disabled={page >= totalPaginas || loadingOrders}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Siguiente
                          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ═══ BLOQUE 3 ═══ */}
          {summary && <SilenceAlert silence={summary.silence} />}

          <FallosPanel
            failures={failures}
            available={failuresAvailable}
            loading={loadingFailures}
            error={failuresError}
            sedeSeleccionada={locationSelection !== LOCATION_ALL}
          />
        </TabsContent>

        <TabsContent value="autorizados" className="mt-4">
          <AutorizadosPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Contador({ etiqueta, valor, nota }: { etiqueta: string; valor?: number; nota?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--brand-surface)' }}>
      <p className="text-xs font-medium" style={{ color: 'var(--brand-ink-soft)' }}>
        {etiqueta}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: 'var(--brand-ink)' }}>
        {valor === undefined ? '—' : valor}
      </p>
      {nota && (
        <p className="mt-1 text-[11px] leading-tight" style={{ color: 'var(--brand-ink-muted)' }}>
          {nota}
        </p>
      )}
    </div>
  )
}
