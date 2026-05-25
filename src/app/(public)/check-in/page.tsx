'use client'

import { useState } from 'react'
import { CheckInForm, CheckInSuccess } from '@/components/features/check-in'
import { Toaster, toast } from 'sonner'
import { UtensilsCrossed } from 'lucide-react'
import type { CheckInResult, RegisterResult, RoadmapItem, TierUnlockedInfo, NextTierInfo } from '@/components/features/check-in/CheckInForm.types'
import { BRAND_NAME } from '@/lib/branding'

type PageState =
  | { view: 'form'; phone?: string }
  | { view: 'success'; type: 'welcome'; customerName: string; totalVisits: number; totalPoints?: number; pointsAwarded?: number; roadmap?: RoadmapItem[]; phone?: string }
  | { view: 'success'; type: 'welcome_back' | 'points_earned' | 'tier_unlocked'; customerName: string; totalVisits: number; totalPoints?: number; pointsAwarded?: number; reward: CheckInResult['reward']; nextRewardHint?: string | null; roadmap?: RoadmapItem[]; tierUnlocked?: TierUnlockedInfo | null; nextTier?: NextTierInfo | null; phone?: string }
  | { view: 'success'; type: 'duplicate'; customerName: string; totalVisits: number }

export default function CheckInPage() {
  const [state, setState] = useState<PageState>({ view: 'form' })
  const [lastPhone, setLastPhone] = useState<string>('')

  const handleRegisterSuccess = (result: RegisterResult) => {
    setState({
      view: 'success',
      type: 'welcome',
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
      totalPoints: result.customer.total_points ?? 0,
      pointsAwarded: result.points_awarded ?? 0,
      roadmap: result.roadmap,
      phone: lastPhone,
    })
  }

  const handleCheckInSuccess = (result: CheckInResult) => {
    const resultType = result.message === 'tier_unlocked' ? 'tier_unlocked'
      : result.message === 'points_earned' ? 'points_earned'
      : 'welcome_back'

    setState({
      view: 'success',
      type: resultType,
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
      totalPoints: result.customer.total_points ?? 0,
      pointsAwarded: result.points_awarded ?? 0,
      reward: result.reward,
      nextRewardHint: result.nextReward?.hint ?? null,
      roadmap: result.roadmap,
      tierUnlocked: result.tier_unlocked ?? null,
      nextTier: result.next_tier ?? null,
      phone: lastPhone,
    })
  }

  const handleError = (message: string) => {
    toast.error(message)
  }

  const handleReset = () => {
    setState({ view: 'form' })
  }

  return (
    <div className="premium-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div
        className="pointer-events-none absolute -top-28 -right-28 h-[420px] w-[420px] rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, #FF4D6D 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, #E63946 0%, transparent 70%)" }}
      />

      <Toaster position="top-center" richColors />

      <div className="animate-fade-in-up relative z-10 mb-7 flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)",
            boxShadow: "0 6px 20px rgba(230, 57, 70, 0.26)",
          }}
        >
          <UtensilsCrossed className="h-6 w-6 text-white" strokeWidth={1.25} />
        </div>
        <div>
          <h1
            className="font-playfair text-2xl font-bold"
            style={{ color: "#1a1c1d", letterSpacing: "-0.02em" }}
          >
            {BRAND_NAME}
          </h1>
          <p className="mt-0.5 text-xs font-medium" style={{ color: "#9ca3af" }}>
            Programa de fidelidad
          </p>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {state.view === 'form' && (
          <CheckInForm
            onLookupResult={(result) => {
              if (result.found && result.customer) {
                setLastPhone((document.querySelector('input[type="tel"]') as HTMLInputElement)?.value ?? '')
              }
            }}
            onRegisterSuccess={(result) => {
              setLastPhone((document.querySelector('input[type="tel"]') as HTMLInputElement)?.value ?? '')
              handleRegisterSuccess(result)
            }}
            onCheckInSuccess={(result) => {
              handleCheckInSuccess(result)
            }}
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
            nextRewardHint={state.type === 'welcome_back' || state.type === 'points_earned' ? (state as { nextRewardHint?: string | null }).nextRewardHint : null}
            roadmap={state.type !== 'duplicate' ? (state as { roadmap?: RoadmapItem[] }).roadmap : undefined}
            tierUnlocked={state.type === 'tier_unlocked' ? (state as { tierUnlocked?: TierUnlockedInfo | null }).tierUnlocked : undefined}
            nextTier={state.type === 'points_earned' || state.type === 'tier_unlocked' ? (state as { nextTier?: NextTierInfo | null }).nextTier : undefined}
            customerPhone={state.type !== 'duplicate' ? (state as { phone?: string }).phone : undefined}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
