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
import { AtRiskBubbles } from '@/components/dashboard/AtRiskBubbles'
import { PowerRanking } from '@/components/dashboard/PowerRanking'
import { VisitHeatmap } from '@/components/dashboard/VisitHeatmap'
import { AcquisitionChannelChart } from '@/components/dashboard/AcquisitionChannelChart'
import { ReactivationRateChart } from '@/components/dashboard/ReactivationRateChart'
import { BlackTierSection } from '@/components/dashboard/BlackTierSection'
import { CustomerDetailDialog } from '@/components/dashboard/CustomerDetailDialog'
import type { Customer } from '@/types/database.types'

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

      <MetricsCards summary={data?.summary ?? null} loading={loading} />

      <div className="grid gap-8 lg:grid-cols-2">
        <CustomerTiers tiers={data?.customerTiers ?? []} loading={loading} />
        <ROICard data={data?.roiEstimate ?? null} loading={loading} />
      </div>

      <BlackTierSection customers={data?.topCustomers ?? []} loading={loading} onCustomerClick={handleCustomerClick} />

      <VisitsChart data={data?.visitsPerDay ?? []} loading={loading} />

      <PowerRanking customers={data?.topCustomers ?? []} loading={loading} onCustomerClick={handleCustomerClick} />

      <div className="grid gap-8 lg:grid-cols-2">
        <GrowthChart data={data?.newCustomersPerDay ?? []} loading={loading} />
        <AtRiskBubbles groups={data?.atRiskGroups ?? []} loading={loading} isDemo={isDemo} />
      </div>

      <VisitHeatmap data={data?.heatmap ?? []} loading={loading} />

      <AcquisitionChannelChart data={data?.acquisitionByMonth ?? []} loading={loading} />

      <ReactivationRateChart data={data?.reactivationRate ?? []} loading={loading} />

      <CustomerDetailDialog
        customer={selectedCustomer}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onVisitsAdded={refetch}
      />
    </div>
  )
}
