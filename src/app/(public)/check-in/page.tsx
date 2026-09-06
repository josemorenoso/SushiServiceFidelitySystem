'use client'

import { useState, useCallback } from 'react'
import { CheckInForm, CheckInSuccess } from '@/components/features/check-in'
import { Toaster, toast } from 'sonner'
import { BrandMark } from '@/components/features/branding'
import type { CheckInResult, RegisterResult, TierUnlockedInfo, NextTierInfo, TierItem } from '@/components/features/check-in/CheckInForm.types'
import { useBranding } from '@/lib/branding-context'

type PageState =
  | { view: 'form'; phone?: string }
  | { view: 'success'; type: 'welcome'; customerName: string; totalVisits: number; totalPoints?: number; pointsAwarded?: number; tiers?: TierItem[]; phone?: string }
  | { view: 'success'; type: 'welcome_back' | 'points_earned' | 'tier_unlocked'; customerName: string; totalVisits: number; totalPoints?: number; pointsAwarded?: number; reward: CheckInResult['reward']; tierUnlocked?: TierUnlockedInfo | null; nextTier?: NextTierInfo | null; tiers?: TierItem[]; phone?: string }
  | { view: 'success'; type: 'duplicate'; customerName: string; totalVisits: number }

export default function CheckInPage() {
  const branding = useBranding()
  const [state, setState] = useState<PageState>({ view: 'form' })

  const handleRegisterSuccess = useCallback((result: RegisterResult, phone: string) => {
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
          del color del tenant (§5), que por defecto ES ese mismo par. */}
      <div
        className="pointer-events-none absolute -top-28 -right-28 h-[420px] w-[420px] rounded-full opacity-[0.05]"
        style={{ background: `radial-gradient(circle, ${branding.primary} 0%, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full opacity-[0.04]"
        style={{ background: `radial-gradient(circle, ${branding.primaryEnd} 0%, transparent 70%)` }}
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
