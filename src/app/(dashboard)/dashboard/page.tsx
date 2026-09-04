'use client'

import { useState, useCallback } from 'react'
import { useDemo } from '@/contexts/DemoContext'
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
import type { Customer } from '@/types/database.types'

/**
 * Panel de métricas.
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §14.1 y §15.3 — dos secciones SALIERON de aquí
 * (no se borraron, se mudaron al apartado donde se actúa sobre ellas):
 *   - `BlackTierSection`  → `/dashboard/customers`  (§14.1 la saca, §17.1 la pone)
 *   - `AtRiskBubbles`     → `/dashboard/campaigns`, pestaña Manuales (§15.3)
 * Textual del dueño sobre las burbujas: *"considerando el día a día del cliente
 * deberíamos eliminar las burbujas flotantes catalogadas por días en el dashboard
 * y meterla en el área de campañas"*.
 */
export default function DashboardPage() {
  const { isDemo, demoError } = useDemo()
  const { data, loading, refetch } = useDashboardAnalytics()
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

      {/* Multi-sede F7 (§8.4): `summary` mergea brand+location — es el único punto
          de presentación donde numerador de sede y denominador de marca se tocan. */}
      <MetricsCards
        summary={data ? { ...data.brand.summary, ...data.location.summary } : null}
        loading={loading}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <CustomerTiers tiers={data?.brand.customerTiers ?? []} loading={loading} />
        <ROICard />
      </div>

      <VisitsChart data={data?.location.visitsPerDay ?? []} loading={loading} />

      <PowerRanking customers={data?.brand.topCustomers ?? []} loading={loading} onCustomerClick={handleCustomerClick} />

      <GrowthChart data={data?.brand.newCustomersPerDay ?? []} loading={loading} />

      <VisitHeatmap data={data?.location.heatmap ?? []} loading={loading} />

      <AcquisitionChannelChart data={data?.brand.acquisitionByMonth ?? []} loading={loading} />

      <ReactivationRateChart data={data?.brand.reactivationRate ?? []} loading={loading} />

      <CampaignEfficiencyChart />

      {/* Va ANTES del panel de Twilio: este cuenta los opt-outs de verdad (la
          columna que el envío consulta), sirva el negocio por Twilio o por
          Zernio. El de abajo los deduce de la API de Twilio y solo aplica ahí. */}
      <OptOutPanel />

      <TwilioMessagesPanel />

      <CustomerDetailDialog
        customer={selectedCustomer}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onVisitsAdded={refetch}
      />
    </div>
  )
}
