'use client'

import { useDemo } from '@/contexts/DemoContext'
import { useDashboardAnalytics } from '@/hooks/useDashboardAnalytics'
import { DemoToggle } from '@/components/dashboard/DemoToggle'
import { MetricsCards } from '@/components/dashboard/MetricsCards'
import { VisitsChart } from '@/components/dashboard/VisitsChart'
import { GrowthChart } from '@/components/dashboard/GrowthChart'
import { CustomerTiers } from '@/components/dashboard/CustomerTiers'
import { AtRiskBubbles } from '@/components/dashboard/AtRiskBubbles'
import { PowerRanking } from '@/components/dashboard/PowerRanking'

export default function DashboardPage() {
  const { isDemo, demoError } = useDemo()
  const { data, loading } = useDashboardAnalytics()

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

      <VisitsChart data={data?.visitsPerDay ?? []} loading={loading} />

      <div className="grid gap-8 lg:grid-cols-2">
        <GrowthChart data={data?.newCustomersPerDay ?? []} loading={loading} />
        <CustomerTiers tiers={data?.customerTiers ?? []} loading={loading} />
      </div>

      <AtRiskBubbles groups={data?.atRiskGroups ?? []} loading={loading} isDemo={isDemo} />

      <PowerRanking customers={data?.topCustomers ?? []} loading={loading} />
    </div>
  )
}
