'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDemo } from '@/contexts/DemoContext'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { LogOut, Menu, QrCode, LayoutDashboard, Users, Gift, Megaphone, UtensilsCrossed, FileText, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Métricas', icon: LayoutDashboard },
  { href: '/dashboard/customers', label: 'Clientes', icon: Users },
  { href: '/dashboard/rewards', label: 'Recompensas', icon: Gift },
  { href: '/dashboard/campaigns', label: 'Campañas', icon: Megaphone },
  { href: '/dashboard/qr', label: 'Código QR', icon: QrCode },
  { href: '/dashboard/templates', label: 'Plantillas', icon: FileText },
  { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
]

export function DashboardHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { isDemo } = useDemo()

  const handleLogout = async () => {
    if (isDemo) {
      router.push('/demo')
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="glass-header flex h-14 items-center justify-between px-5">
      <div className="flex items-center gap-2 md:hidden">
        <Sheet>
          <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0">
            <div className="flex h-14 items-center gap-2 border-b px-4">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">Sushi Service</span>
            </div>
            <nav className="space-y-1 p-3">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>
        <span className="font-semibold text-sm text-primary">Sushi Service</span>
      </div>

      <div className="hidden md:block">
        <h2 className="text-sm font-medium text-muted-foreground">Panel de Administración — Sushi Service</h2>
      </div>

      <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Cerrar sesión</span>
      </Button>
    </header>
  )
}
