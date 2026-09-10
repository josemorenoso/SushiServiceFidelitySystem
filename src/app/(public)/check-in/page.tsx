'use client'

import { useState, useCallback } from 'react'
import { CheckInForm, CheckInSuccess } from '@/components/features/check-in'
import { Toaster, toast } from 'sonner'
import { BrandMark } from '@/components/features/branding'
import type { CheckInResult, RegisterResult, TierUnlockedInfo, NextTierInfo, TierItem } from '@/components/features/check-in/CheckInForm.types'
import { useBranding } from '@/lib/branding-context'
import { META_EVENT_CHECK_IN, META_EVENT_REGISTER } from '@/lib/meta-pixel'
import { trackMetaEvent } from '@/lib/meta-pixel-client'

type PageState =
  | { view: 'form'; phone?: string }
  | { view: 'success'; type: 'welcome'; customerName: string; totalVisits: number; totalPoints?: number; pointsAwarded?: number; tiers?: TierItem[]; phone?: string }
  | { view: 'success'; type: 'welcome_back' | 'points_earned' | 'tier_unlocked'; customerName: string; totalVisits: number; totalPoints?: number; pointsAwarded?: number; reward: CheckInResult['reward']; tierUnlocked?: TierUnlockedInfo | null; nextTier?: NextTierInfo | null; tiers?: TierItem[]; phone?: string }
  | { view: 'success'; type: 'duplicate'; customerName: string; totalVisits: number }

export default function CheckInPage() {
  const branding = useBranding()
  const [state, setState] = useState<PageState>({ view: 'form' })

  const handleRegisterSuccess = useCallback((result: RegisterResult, phone: string) => {
    // Un cliente NUEVO. Es el evento con el que se optimiza una campaña de Meta.
    // No viaja ni el celular ni el nombre: solo la marca y la sede (meta-pixel.ts).
    trackMetaEvent(META_EVENT_REGISTER, 'check-in')
    setState({
      view: 'success',
      type: 'welcome',
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
      totalPoints: result.customer.total_points ?? 0,
      pointsAwarded: result.points_awarded ?? 0,
      tiers: (result as unknown as CheckInResult).tiers,
      phone,
    })
  }, [])

  const handleCheckInSuccess = useCallback((result: CheckInResult, phone: string) => {
    const resultType = result.message === 'tier_unlocked' ? 'tier_unlocked'
      : result.message === 'points_earned' ? 'points_earned'
      : result.message === 'duplicate' ? 'duplicate'
      : 'welcome_back'

    // Un cliente que VUELVE. El duplicado queda afuera a propósito: es el mismo
    // cliente en la misma visita apretando de nuevo, y contarlo infla la
    // audiencia de "los que vuelven" con gente que no volvió.
    if (resultType !== 'duplicate') {
      trackMetaEvent(META_EVENT_CHECK_IN, 'check-in')
    }

    setState({
      view: 'success',
      type: resultType,
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
      totalPoints: result.customer.total_points ?? 0,
      pointsAwarded: result.points_awarded ?? 0,
      reward: result.reward,
      tierUnlocked: result.tier_unlocked ?? null,
      nextTier: result.next_tier ?? null,
      tiers: result.tiers,
      phone,
    })
  }, [])

  const handleError = (message: string) => {
    toast.error(message)
  }

  const handleReset = () => {
    setState({ view: 'form' })
  }

  return (
    <div className="premium-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* Halos de marca. Antes eran los dos hex del sistema de diseño; ahora salen
          del color del tenant (§5), que por defecto ES ese mismo par.
          Desde la capa visual v3 se MUEVEN, muy lento y desfasados entre sí: el
          fondo respira en vez de ser un marfil plano. Siguen sin ser un color
          nuevo — es el mismo par de la marca, solo que ya no está quieto. */}
      <div
        className="animate-aurora-a pointer-events-none absolute -top-28 -right-28 h-[420px] w-[420px] rounded-full opacity-[0.10]"
        style={{ background: `radial-gradient(circle, ${branding.primary} 0%, transparent 70%)` }}
      />
      <div
        className="animate-aurora-b pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full opacity-[0.09]"
        style={{ background: `radial-gradient(circle, ${branding.primaryEnd} 0%, transparent 70%)` }}
      />
      <div
        className="animate-aurora-a pointer-events-none absolute top-1/3 -left-24 h-[260px] w-[260px] rounded-full opacity-[0.06]"
        style={{
          background: `radial-gradient(circle, ${branding.primary} 0%, transparent 70%)`,
          animationDirection: 'reverse',
          animationDuration: '23s',
        }}
      />

      <Toaster position="top-center" richColors />

      <div className="animate-fade-in-up relative z-10 mb-7 flex flex-col items-center gap-3 text-center">
        <BrandMark size={56} />
        <div>
          <h1
            className="font-playfair text-2xl font-bold"
            style={{ color: "var(--brand-ink)", letterSpacing: "-0.02em" }}
          >
            {branding.name}
          </h1>
          <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--brand-ink-muted)" }}>
            Programa de fidelidad
          </p>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {state.view === 'form' && (
          <CheckInForm
            onLookupResult={() => {}}
            onRegisterSuccess={handleRegisterSuccess}
            onCheckInSuccess={handleCheckInSuccess}
            onError={handleError}
          />
        )}

        {state.view === 'success' && (
          <CheckInSuccess
            type={state.type}
            customerName={state.customerName}
            totalVisits={state.totalVisits}
            totalPoints={state.type !== 'duplicate' ? (state as { totalPoints?: number }).totalPoints : undefined}
            pointsAwarded={state.type !== 'duplicate' ? (state as { pointsAwarded?: number }).pointsAwarded : undefined}
            reward={state.type === 'welcome_back' || state.type === 'points_earned' || state.type === 'tier_unlocked' ? (state as { reward: CheckInResult['reward'] }).reward : null}
            tierUnlocked={state.type === 'tier_unlocked' ? (state as { tierUnlocked?: TierUnlockedInfo | null }).tierUnlocked : undefined}
            nextTier={state.type === 'points_earned' || state.type === 'tier_unlocked' ? (state as { nextTier?: NextTierInfo | null }).nextTier : undefined}
            tiers={state.type !== 'duplicate' ? (state as { tiers?: TierItem[] }).tiers : undefined}
            customerPhone={state.type !== 'duplicate' ? (state as { phone?: string }).phone : undefined}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
