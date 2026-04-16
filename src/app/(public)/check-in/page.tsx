'use client'

import { useState } from 'react'
import { CheckInForm, CheckInSuccess } from '@/components/features/check-in'
import { Toaster, toast } from 'sonner'
import { UtensilsCrossed } from 'lucide-react'
import type { CheckInResult, RegisterResult } from '@/components/features/check-in/CheckInForm.types'

type PageState =
  | { view: 'form' }
  | { view: 'success'; type: 'welcome'; customerName: string; totalVisits: number }
  | { view: 'success'; type: 'welcome_back'; customerName: string; totalVisits: number; reward: CheckInResult['reward']; nextRewardHint?: string | null }
  | { view: 'success'; type: 'duplicate'; customerName: string; totalVisits: number }

export default function CheckInPage() {
  const [state, setState] = useState<PageState>({ view: 'form' })

  const handleRegisterSuccess = (result: RegisterResult) => {
    setState({
      view: 'success',
      type: 'welcome',
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
    })
  }

  const handleCheckInSuccess = (result: CheckInResult) => {
    setState({
      view: 'success',
      type: 'welcome_back',
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
      reward: result.reward,
      nextRewardHint: result.nextReward?.hint ?? null,
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
      {/* Orb decorativo */}
      <div
        className="pointer-events-none absolute -top-28 -right-28 h-[420px] w-[420px] rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, #FF4D6D 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, #E63946 0%, transparent 70%)" }}
      />

      <Toaster position="top-center" richColors />

      {/* Header de marca */}
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
            Sushi Service
          </h1>
          <p className="mt-0.5 text-xs font-medium" style={{ color: "#9ca3af" }}>
            Programa de fidelidad
          </p>
        </div>
      </div>

      {/* Contenido */}
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
            reward={state.type === 'welcome_back' ? state.reward : null}
            nextRewardHint={state.type === 'welcome_back' ? state.nextRewardHint : null}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
