'use client'

import { Gift, Clock } from 'lucide-react'

export interface ActiveGrant {
  id: string
  prize_title: string
  grant_type: 'tier_prize' | 'campaign_prize'
  source: 'mystery_box' | 'safe_choice' | 'reactivation' | 'review' | 'manual'
  /** null = no vence */
  expires_at: string | null
  granted_at: string
}

interface Props {
  grants: ActiveGrant[]
  staffLabel: string
}

/** "vence en 3 días · 18 de julio". Null si el premio no vence. */
function expiryText(iso: string | null): string | null {
  if (!iso) return null
  const expires = new Date(iso)
  const days = Math.ceil((expires.getTime() - Date.now()) / 86400000)
  const date = expires.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })

  if (days <= 0) return `Vence hoy · ${date}`
  if (days === 1) return `Vence mañana · ${date}`
  return `Vence en ${days} días · ${date}`
}

/**
 * "Disponible: X premio" en la tarjeta del cliente, con su cuenta regresiva.
 *
 * Es lo que hace que una campaña de reactivación sea agresiva de verdad: el cliente ve su
 * premio y el tiempo que le queda CADA VEZ que abre su tarjeta, y llega al local pidiéndolo
 * en vez de esperar a que el mesero se acuerde.
 *
 * Ref: docs/features/reward-grants.md
 */
export function AvailableRewardBanner({ grants, staffLabel }: Props) {
  if (grants.length === 0) return null

  return (
    <div className="mt-4 w-full space-y-2">
      {grants.map((grant) => {
        const expiry = expiryText(grant.expires_at)
        return (
          <div
            key={grant.id}
            className="w-full rounded-2xl px-4 py-3"
            style={{
              background: 'rgba(251, 191, 36, 0.16)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(251, 191, 36, 0.45)',
            }}
          >
            <div className="flex items-start gap-3">
              <Gift className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                  Disponible
                </p>
                <p className="mt-0.5 text-base font-bold leading-tight text-white">
                  {grant.prize_title}
                </p>

                {expiry && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-200">
                    <Clock className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                    {expiry}
                  </p>
                )}

                <p className="mt-1.5 text-[11px] text-white/55">
                  Muéstrale esto al {staffLabel.toLowerCase()} para reclamarlo
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
