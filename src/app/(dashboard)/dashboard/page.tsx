'use client'

import { useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useDemo } from '@/contexts/DemoContext'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import { useDashboardAnalytics } from '@/hooks/useDashboardAnalytics'
import { DemoToggle } from '@/components/dashboard/DemoToggle'
import { MetricsCards } from '@/components/dashboard/MetricsCards'
import { ROICard } from '@/components/dashboard/ROICard'
import { VisitsChart } from '@/components/dashboard/VisitsChart'
import { GrowthChart } from '@/components/dashboard/GrowthChart'
import { CustomerTiers } from '@/components/dashboard/CustomerTiers'
import { PowerRanking } from '@/components/dashboard/PowerRanking'
import { VisitHeatmap } from '@/components/dashboard/VisitHeatmap'
import { AcquisitionChannelChart } from '@/components/dashboard/AcquisitionChannelChart'
import { ReactivationRateChart } from '@/components/dashboard/ReactivationRateChart'
import { CampaignEfficiencyChart } from '@/components/dashboard/CampaignEfficiencyChart'
import { OptOutPanel } from '@/components/dashboard/OptOutPanel'
import { TwilioMessagesPanel } from '@/components/dashboard/TwilioMessagesPanel'
import { CustomerDetailDialog } from '@/components/dashboard/CustomerDetailDialog'
import { MiniCiclo } from '@/components/dashboard/cycle/MiniCiclo'
import { EtiquetaDeAlcance, TituloDeSeccion } from '@/components/dashboard/sedes/Alcance'
import { TusSedes } from '@/components/dashboard/sedes/TusSedes'
import { contarSedes, modoDelPanel } from '@/lib/panel-sedes'
import type { Customer } from '@/types/database.types'

/**
 * Panel de métricas.
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §14.1 y §15.3 — dos secciones SALIERON de aquí
 * (no se borraron, se mudaron al apartado donde se actúa sobre ellas):
 *   - `BlackTierSection`  → `/dashboard/customers`  (§14.1 la saca, §17.1 la pone)
 *   - `AtRiskBubbles`     → `/dashboard/campaigns` (§15.3). Desde la fase 2 del ciclo
 *                           (2026-10-14) ya no está ni ahí: las reemplazan las cajas del ciclo.
 * Textual del dueño sobre las burbujas: *"considerando el día a día del cliente
 * deberíamos eliminar las burbujas flotantes catalogadas por días en el dashboard
 * y meterla en el área de campañas"*.
 *
 * `MiniCiclo` (spec del ciclo §6.7) es lo que el panel principal muestra del ciclo de
 * recuperación: las mismas cajas que Campañas, sin detalle, con un enlace a la pantalla completa.
 *
 * SEDES SEPARADAS, PARTE 1 (dueño, 2026-10-14, mirando Tepuy): *«una jerarquía bien hecha…
 * cada cosa en su lugar, se ven desde el mismo lado pero bien separadas»*. Tres modos
 * (`modoDelPanel()`, `src/lib/panel-sedes.ts`):
 *   - **una sede** (0 o 1 sede activa): EXACTAMENTE el panel de antes, sin una etiqueta.
 *   - **toda la marca** (2+ sedes): los totales, y debajo «Tus sedes» (una tarjeta por sede,
 *     quién va a las dos, la fila «sin sede» y el gráfico de visitas por sede).
 *   - **una sede elegida**: arriba lo de esa sede (visitas de la sede; lo de clientes, de los
 *     que se registraron ahí), y debajo, con su título, lo que es de toda la marca. Cada
 *     tarjeta lleva su etiqueta: ningún total de la marca se ve como si fuera de la sede.
 * Y si la lectura falla, la pantalla lo dice: nunca «0 clientes» (el incidente del 04-10).
 */
export default function DashboardPage() {
  const { isDemo, demoError } = useDemo()
  const { data, loading, error, refetch } = useDashboardAnalytics()
  const { view, loading: scopeLoading } = useLocationScope()
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const handleCustomerClick = useCallback(async (customerId: string) => {
    try {
      const res = await fetch(`/api/dashboard/customers/${customerId}`)
      if (res.ok) {
        const customer = await res.json()
        setSelectedCustomer(customer)
        setDetailOpen(true)
      }
    } catch { /* best effort */ }
  }, [])

  // La demo no tiene sedes. Mientras el alcance carga no se elige modo: pintar el panel «de una
  // sede» con los totales de la marca y cambiarlo un segundo después sería justo la confusión.
  const panel = isDemo ? ({ modo: 'una-sede' } as const) : modoDelPanel(view)
  const esperandoAlcance = !isDemo && scopeLoading && !view
  // Con una sede elegida, lo de clientes viene en `origin`. Si todavía no llegó (cambio de
  // sede en curso), se espera: nunca se rellena con la marca.
  const faltaLoDeLaSede = panel.modo === 'sede' && !!data && !data.origin
  const cargando = loading || esperandoAlcance || faltaLoDeLaSede
  // Sin datos y con error: la pantalla lo dice en vez de mostrar ceros.
  const sinLectura = !isDemo && !!error && !data

  const marca = (texto = 'Toda la marca') => <EtiquetaDeAlcance texto={texto} de="marca" />
  const deLaSede = (texto: string) => <EtiquetaDeAlcance texto={texto} de="sede" />

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1
          className="font-playfair text-3xl font-bold"
          style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
        >
          Métricas
        </h1>
        <DemoToggle />
      </div>

      {isDemo && demoError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Demo:</strong> {demoError}
        </div>
      )}

      {!isDemo && error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>No pudimos leer tus métricas.</strong>{' '}
            {data
              ? 'Lo que ves abajo es la última lectura buena y puede estar desactualizado. Volvemos a intentar en un minuto.'
              : 'No mostramos números para no mostrarte ceros que no son. Volvemos a intentar en un minuto.'}
          </span>
        </div>
      )}

      {sinLectura ? null : panel.modo === 'sede' ? (
        <>
          {/* ── Arriba: la sede elegida ─────────────────────────────────── */}
          <TituloDeSeccion
            titulo={panel.varias ? 'Tus sedes' : panel.nombre}
            detalle={panel.varias ? `Lo de ${panel.nombre}, juntas` : 'Lo de esta sede'}
            de="sede"
          />
          <MetricsCards
            summary={data?.origin ? { ...data.origin.summary, ...data.location.summary } : null}
            loading={cargando}
            sede={{ varias: panel.varias, sedesDeLaMarca: panel.sedes }}
          />
          <div className="grid gap-8 lg:grid-cols-2">
            <CustomerTiers
              tiers={data?.origin?.customerTiers ?? []}
              loading={cargando}
              etiqueta={deLaSede(panel.varias ? 'Registrados en tus sedes' : 'Registrados aquí')}
            />
            <GrowthChart
              data={data?.origin?.newCustomersPerDay ?? []}
              loading={cargando}
              etiqueta={deLaSede(panel.varias ? 'Registrados en tus sedes' : 'Registrados aquí')}
            />
          </div>
          <VisitsChart data={data?.location.visitsPerDay ?? []} loading={cargando} etiqueta={deLaSede(panel.varias ? 'Tus sedes' : 'Esta sede')} />
          <VisitHeatmap data={data?.location.heatmap ?? []} loading={cargando} etiqueta={deLaSede(panel.varias ? 'Tus sedes' : 'Esta sede')} />
          <AcquisitionChannelChart
            data={data?.origin?.acquisitionByMonth ?? []}
            loading={cargando}
            etiqueta={deLaSede(panel.varias ? 'Registrados en tus sedes' : 'Registrados aquí')}
          />

          {/* ── Abajo: lo que es de toda la marca ───────────────────────── */}
          <TituloDeSeccion
            titulo="De toda la marca"
            detalle={`Lo ven y lo usan las ${contarSedes(panel.sedes)}: no cambia con la sede elegida.`}
            de="marca"
          />
          <ROICard etiqueta={marca()} />
          <MiniCiclo />
          <PowerRanking
            customers={data?.brand.topCustomers ?? []}
            loading={cargando}
            onCustomerClick={handleCustomerClick}
            etiqueta={marca()}
          />
          <ReactivationRateChart data={data?.brand.reactivationRate ?? []} loading={cargando} etiqueta={marca()} />
          <CampaignEfficiencyChart etiqueta={marca()} />
          <OptOutPanel />
          <TwilioMessagesPanel />
        </>
      ) : (
        <>
          {panel.modo === 'toda-la-marca' && (
            <TituloDeSeccion titulo="Toda la marca" detalle={`Las ${contarSedes(panel.sedes)} juntas`} de="marca" />
          )}

          {/* Multi-sede F7 (§8.4): `summary` mergea brand+location — es el único punto
              de presentación donde numerador de sede y denominador de marca se tocan. Con
              «toda la marca» los dos son la marca entera. */}
          <MetricsCards
            summary={data ? { ...data.brand.summary, ...data.location.summary } : null}
            loading={cargando}
          />

          {panel.modo === 'toda-la-marca' && <TusSedes resumen={data?.sedes ?? null} loading={cargando} />}

          {panel.modo === 'toda-la-marca' && (
            <TituloDeSeccion titulo="Toda la marca, en detalle" detalle="Niveles, ciclo, ranking y campañas de las sedes juntas" de="marca" />
          )}

          <div className="grid gap-8 lg:grid-cols-2">
            <CustomerTiers tiers={data?.brand.customerTiers ?? []} loading={cargando} />
            <ROICard />
          </div>

          <MiniCiclo />

          <VisitsChart data={data?.location.visitsPerDay ?? []} loading={cargando} />

          <PowerRanking customers={data?.brand.topCustomers ?? []} loading={cargando} onCustomerClick={handleCustomerClick} />

          <GrowthChart data={data?.brand.newCustomersPerDay ?? []} loading={cargando} />

          <VisitHeatmap data={data?.location.heatmap ?? []} loading={cargando} />

          <AcquisitionChannelChart data={data?.brand.acquisitionByMonth ?? []} loading={cargando} />

          <ReactivationRateChart data={data?.brand.reactivationRate ?? []} loading={cargando} />

          <CampaignEfficiencyChart />

          {/* Va ANTES del panel de Twilio: este cuenta los opt-outs de verdad (la
              columna que el envío consulta), sirva el negocio por Twilio o por
              Zernio. El de abajo los deduce de la API de Twilio y solo aplica ahí. */}
          <OptOutPanel />

          <TwilioMessagesPanel />
        </>
      )}

      <CustomerDetailDialog
        customer={selectedCustomer}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onVisitsAdded={refetch}
      />
    </div>
  )
}
