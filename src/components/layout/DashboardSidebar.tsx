'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Gift,
  Megaphone,
  QrCode,
  UtensilsCrossed,
  FileText,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Métricas', icon: LayoutDashboard },
  { href: '/dashboard/customers', label: 'Clientes', icon: Users },
  { href: '/dashboard/rewards', label: 'Recompensas', icon: Gift },
  { href: '/dashboard/campaigns', label: 'Campañas', icon: Megaphone },
  { href: '/dashboard/qr', label: 'Código QR', icon: QrCode },
  { href: '/dashboard/templates', label: 'Plantillas', icon: FileText },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-muted/30">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <UtensilsCrossed className="h-5 w-5 text-primary" />
        <span className="font-semibold text-primary">Sushi Service</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
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
    </aside>
  )
}
