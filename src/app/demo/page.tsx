'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, UtensilsCrossed } from 'lucide-react'

export default function DemoPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    const loginDemo = async () => {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: process.env.NEXT_PUBLIC_DEMO_EMAIL!,
        password: process.env.NEXT_PUBLIC_DEMO_PASSWORD!,
      })

      if (authError) {
        setError('No se pudo iniciar el demo. Intenta más tarde.')
        return
      }

      window.location.href = '/dashboard'
    }

    loginDemo()
  }, [])

  return (
    <div className="premium-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-[400px] w-[400px] rounded-full opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, #FF4D6D 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-20 h-[320px] w-[320px] rounded-full opacity-[0.05]"
        style={{ background: 'radial-gradient(circle, #E63946 0%, transparent 70%)' }}
      />

      <div className="animate-fade-in-up relative z-10 flex flex-col items-center gap-6 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
            boxShadow: '0 8px 24px rgba(230, 57, 70, 0.28)',
          }}
        >
          <UtensilsCrossed className="h-7 w-7 text-white" strokeWidth={1.25} />
        </div>

        {error ? (
          <div className="premium-card px-8 py-6">
            <p className="text-sm" style={{ color: '#E63946' }}>{error}</p>
          </div>
        ) : (
          <div className="premium-card px-8 py-6 flex flex-col items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#E63946' }} />
            <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
              Cargando demo...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
