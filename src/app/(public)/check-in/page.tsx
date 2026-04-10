'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CheckInForm, CheckInSuccess } from '@/components/features/check-in'
import { Toaster, toast } from 'sonner'
import { UtensilsCrossed } from 'lucide-react'
import type { CheckInResult, RegisterResult } from '@/components/features/check-in/CheckInForm.types'

type PageState =
  | { view: 'form' }
  | { view: 'success'; type: 'welcome'; customerName: string; totalVisits: number }
  | { view: 'success'; type: 'welcome_back'; customerName: string; totalVisits: number; reward: CheckInResult['reward'] }
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
    })
  }

  const handleError = (message: string) => {
    toast.error(message)
  }

  const handleReset = () => {
    setState({ view: 'form' })
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-red-50 via-white to-stone-50 p-4">
      <Image
        src="/images/sushi-1.png"
        alt=""
        width={220}
        height={220}
        className="pointer-events-none absolute -right-8 top-6 opacity-[0.06] select-none"
        priority
      />
      <Image
        src="/images/sushi-5.png"
        alt=""
        width={200}
        height={300}
        className="pointer-events-none absolute -left-6 bottom-0 opacity-[0.05] select-none"
      />

      <Toaster position="top-center" richColors />

      <div className="relative z-10 mb-8 flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20 shadow-lg shadow-primary/10">
          <UtensilsCrossed className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Sushi Service</h1>
        <p className="text-xs text-muted-foreground">Programa de fidelidad</p>
      </div>

      <div className="relative z-10">
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
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
