'use client'

import { Crown, Star, Gift, CalendarHeart, Sparkles } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { RankedCustomer } from '@/types/analytics.types'

interface BlackTierSectionProps {
  customers: RankedCustomer[]
  loading: boolean
  benefits?: string[]
  onCustomerClick?: (customerId: string) => void
}

const DEFAULT_BENEFITS = [
  '15% descuento permanente',
  'Eventos exclusivos',
  'Prioridad en reservas',
  'Sorpresas especiales',
]

const BENEFIT_ICONS = [Gift, CalendarHeart, Star, Sparkles]

export function BlackTierSection({ customers, loading, benefits, onCustomerClick }: BlackTierSectionProps) {
  const blackCustomers = customers.filter((c) => c.rank === 'Black')

  if (loading) {
    return (
      <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)' }}>
        <Skeleton className="h-8 w-48 mb-4 bg-neutral-700" />
        <Skeleton className="h-20 w-full bg-neutral-700" />
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #262626 70%, #1a1a1a 100%)',
        border: '1px solid rgba(255, 215, 0, 0.15)',
        boxShadow: '0 0 40px rgba(255, 215, 0, 0.05)',
      }}
    >
      {/* Gold shimmer accent */}
      <div
        className="absolute top-0 right-0 w-40 h-40 opacity-[0.07] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FFD700 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-32 h-32 opacity-[0.05] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FFD700 0%, transparent 70%)' }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg, #FFD700 0%, #B8860B 100%)', boxShadow: '0 4px 12px rgba(255, 215, 0, 0.3)' }}
            >
              <Crown className="h-5 w-5" strokeWidth={1.5} style={{ color: '#0a0a0a' }} />
            </div>
            <div>
              <h3
                className="font-playfair text-lg font-bold"
                style={{ color: '#FFD700', letterSpacing: '-0.02em' }}
              >
                Clientes Black
              </h3>
              <p className="text-xs" style={{ color: '#737373' }}>
                Nivel máximo — Beneficios exclusivos
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{ background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.2)' }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: '#FFD700' }} />
            <span className="text-sm font-bold" style={{ color: '#FFD700' }}>{blackCustomers.length}</span>
          </div>
        </div>

        {/* Black members or empty state */}
        {blackCustomers.length === 0 ? (
          <div className="text-center py-8">
            <Crown className="h-10 w-10 mx-auto mb-3 opacity-30" style={{ color: '#FFD700' }} />
            <p className="text-sm font-medium" style={{ color: '#737373' }}>
              Aún no hay clientes Black
            </p>
            <p className="text-xs mt-1" style={{ color: '#525252' }}>
              El primer cliente en alcanzar 10 visitas desbloqueará este nivel
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {blackCustomers.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl p-3 transition-all duration-200 cursor-pointer hover:scale-[1.01]"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 215, 0, 0.1)',
                }}
                onClick={() => onCustomerClick?.(c.id)}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #FFD700 0%, #B8860B 100%)' }}
                >
                  <span className="text-sm font-bold" style={{ color: '#0a0a0a' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#e5e5e5' }}>
                    {c.name}
                  </p>
                  <p className="text-xs" style={{ color: '#737373' }}>
                    {c.total_visits} visitas — {c.phone}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" style={{ color: '#FFD700' }} fill="#FFD700" />
                  <span className="text-xs font-bold" style={{ color: '#FFD700' }}>VIP</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Benefits section */}
        <div
          className="mt-5 rounded-xl p-4"
          style={{ background: 'rgba(255, 215, 0, 0.03)', border: '1px solid rgba(255, 215, 0, 0.08)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#FFD700', letterSpacing: '0.08em' }}>
            Beneficios Black
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(benefits && benefits.length > 0 ? benefits : DEFAULT_BENEFITS).map((benefit, i) => {
              const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length]
              return (
                <div key={i} className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#a3a3a3' }} />
                  <span className="text-xs" style={{ color: '#a3a3a3' }}>{benefit}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Future: Events for Black customers */}
        {/* TODO v0.20+: Crear sección de eventos exclusivos para Black
            - Admin crea evento (fecha, descripción, cupo limitado)
            - Solo visible para clientes Black en su card pública
            - Notificación WhatsApp automática a Black customers
            - Idea futura: "Mesa VIP" visible para todos los clientes,
              pero solo accesible para Black. Genera deseo en los demás
              de alcanzar ese nivel ("la mesa dorada" / "el rincón Black")
        */}
      </div>
    </div>
  )
}
