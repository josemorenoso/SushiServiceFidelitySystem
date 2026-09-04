import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { DemoProvider } from '@/contexts/DemoContext'
import { LocationScopeProvider } from '@/contexts/LocationScopeContext'
import { isSuperAdmin } from '@/lib/admin'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // El link a "Billeteras" solo se muestra al super-admin (el operador de Cada1).
  const superAdmin = await isSuperAdmin()

  return (
    <DemoProvider>
      {/* Multi-sede F7 (§8.4): el selector vive en DashboardHeader; el estado de
          alcance es de sesión de navegador (localStorage), no de la URL. */}
      <LocationScopeProvider>
        <div className="flex h-screen overflow-hidden">
          <DashboardSidebar isSuperAdmin={superAdmin} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <DashboardHeader />
            <main className="dashboard-bg flex-1 overflow-y-auto p-6 md:p-8">
              {children}
            </main>
          </div>
        </div>
      </LocationScopeProvider>
    </DemoProvider>
  )
}
