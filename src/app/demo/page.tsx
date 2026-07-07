'use client'

import { DemoProvider, useDemo } from '@/contexts/DemoContext'
import { useDashboardAnalytics } from '@/hooks/useDashboardAnalytics'
import { MetricsCards } from '@/components/dashboard/MetricsCards'
import { VisitsChart } from '@/components/dashboard/VisitsChart'
import { GrowthChart } from '@/components/dashboard/GrowthChart'
import { CustomerTiers } from '@/components/dashboard/CustomerTiers'
import { AtRiskBubbles } from '@/components/dashboard/AtRiskBubbles'
import { PowerRanking } from '@/components/dashboard/PowerRanking'
import {
  LayoutDashboard,
  Users,
  Gift,
  Megaphone,
  QrCode,
  UtensilsCrossed,
  FileText,
} from 'lucide-react'
import { useBranding } from '@/lib/branding-context'

const navItems = [
  { label: 'Métricas', icon: LayoutDashboard, active: true },
  { label: 'Clientes', icon: Users, active: false },
  { label: 'Recompensas', icon: Gift, active: false },
  { label: 'Campañas', icon: Megaphone, active: false },
  { label: 'Código QR', icon: QrCode, active: false },
  { label: 'Plantillas', icon: FileText, active: false },
]

function DemoDashboardContent() {
  const branding = useBranding()
  const { data, loading } = useDashboardAnalytics()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar visual — sin links de navegación para no redirigir a /login */}
      <aside className="glass-sidebar hidden md:flex md:w-60 md:flex-col">
        <div
          className="flex h-14 items-center gap-2 px-5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)' }}
          >
            <UtensilsCrossed className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
          </div>
          <span
            className="font-playfair text-base font-bold"
            style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
          >
            {branding.name}
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {navItems.map((item) => (
            <div
              key={item.label}
              className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
              style={
                item.active
                  ? {
                      background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                      boxShadow: '0 4px 12px rgba(230, 57, 70, 0.25)',
                      color: '#fff',
                    }
                  : { color: '#6b7280' }
              }
            >
              <item.icon className="h-4 w-4" strokeWidth={1.5} />
              {item.label}
            </div>
          ))}
        </nav>
      </aside>

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header sin botón de logout */}
        <header className="glass-header flex h-14 items-center justify-between px-5">
          <div className="hidden md:block">
            <h2 className="text-sm font-medium text-muted-foreground">
              Panel de Administración — {branding.name}
            </h2>
          </div>
          <span className="animate-pulse rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            DEMOSTRACIÓN
          </span>
        </header>

        {/* Dashboard */}
        <main className="dashboard-bg flex-1 overflow-y-auto p-6 md:p-8">
          <div className="space-y-8">
            <h1
              className="font-playfair text-3xl font-bold"
              style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
            >
              Métricas
            </h1>
            <MetricsCards summary={data?.summary ?? null} loading={loading} />
            <VisitsChart data={data?.visitsPerDay ?? []} loading={loading} />
            <div className="grid gap-8 lg:grid-cols-2">
              <GrowthChart data={data?.newCustomersPerDay ?? []} loading={loading} />
              <CustomerTiers tiers={data?.customerTiers ?? []} loading={loading} />
            </div>
            <AtRiskBubbles groups={data?.atRiskGroups ?? []} loading={loading} isDemo />
            <PowerRanking customers={data?.topCustomers ?? []} loading={loading} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default function DemoPage() {
  // Fuerza el flag ANTES de que DemoProvider monte para que lo lea en su propio useEffect
  if (typeof window !== 'undefined') {
    localStorage.setItem('restaurantqr_demo', 'true')
  }

  return (
    <DemoProvider>
      <DemoDashboardContent />
    </DemoProvider>
  )
}
