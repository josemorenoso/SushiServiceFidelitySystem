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
  Palette,
  UtensilsCrossed,
  FileText,
  Settings,
  ShieldCheck,
  CalendarDays,
  UserCog,
  Crosshair,
  Ticket,
  PackageOpen,
  Wallet,
} from 'lucide-react'
import { useBranding } from '@/lib/branding-context'

export function DashboardSidebar({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname()
  const branding = useBranding()

  const navItems = [
    { href: '/dashboard', label: 'Métricas', icon: LayoutDashboard },
    { href: '/dashboard/customers', label: 'Clientes', icon: Users },
    { href: '/dashboard/rewards', label: 'Recompensas', icon: Gift },
    { href: '/dashboard/campaign-rewards', label: 'Premios de campaña', icon: PackageOpen },
    { href: '/dashboard/redemptions', label: 'Redenciones', icon: Ticket },
    { href: '/dashboard/campaigns', label: 'Campañas', icon: Megaphone },
    { href: '/dashboard/imported-contacts', label: 'Golden Bullet', icon: Crosshair },
    { href: '/dashboard/calendar', label: 'Calendario', icon: CalendarDays },
    // "QR Studio" y no "Código QR": el nombre viejo hacía creer que era un
    // generador pelado y por eso nadie encontraba los temas, los tamaños de
    // imprenta ni el logo que ya existían (§3).
    { href: '/dashboard/qr', label: 'QR Studio', icon: QrCode },
    { href: '/dashboard/marca', label: 'Identidad visual', icon: Palette },
    { href: '/dashboard/templates', label: 'Plantillas', icon: FileText },
    { href: '/dashboard/staff', label: `${branding.staffLabelPlural} QR`, icon: UserCog },
    { href: '/dashboard/authorized-numbers', label: 'Autorizados Domicilio', icon: ShieldCheck },
    // Solo super-admin (operador de Cada1): billeteras de todos los tenants.
    ...(isSuperAdmin ? [{ href: '/dashboard/admin/wallets', label: 'Billeteras', icon: Wallet }] : []),
    { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
  ]

  return (
    <aside className="glass-sidebar hidden md:flex md:w-60 md:flex-col">
      <div className="flex h-14 items-center gap-2 px-5" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)' }}
        >
          <UtensilsCrossed className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
        </div>
        <span className="font-playfair text-base font-bold" style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}>
          {branding.name}
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'text-white'
                  : 'hover:bg-black/[0.04]'
              )}
              style={isActive ? {
                background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                boxShadow: '0 4px 12px rgba(230, 57, 70, 0.25)',
                color: '#fff',
              } : { color: '#6b7280' }}
            >
              <item.icon className="h-4 w-4" strokeWidth={1.5} />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
