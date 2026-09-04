'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStaffAuth } from '@/hooks/useStaffAuth'
import { PendingRewardsList } from '@/components/features/staff/PendingRewardsList'
import { ArrowLeft, Loader2 } from 'lucide-react'

/**
 * Premios pendientes de entrega.
 *
 * Ref: docs/features/reward-grants.md
 */
export default function MeseroRewardsPage() {
  const router = useRouter()
  const { session, loading: authLoading, getAuthHeaders } = useStaffAuth()

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/mesero')
    }
  }, [authLoading, session, router])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            onClick={() => router.push('/mesero/dashboard')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Premios pendientes</h1>
            <p className="text-xs text-gray-500">Clientes en el local con premio sin entregar</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <PendingRewardsList authHeaders={getAuthHeaders()} />
      </main>
    </div>
  )
}
