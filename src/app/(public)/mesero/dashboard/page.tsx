'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStaffAuth } from '@/hooks/useStaffAuth'
import { useBranding } from '@/lib/branding-context'
import { Loader2, ScanLine, LogOut, ClipboardList, Gift } from 'lucide-react'

export default function MeseroDashboardPage() {
  const router = useRouter()
  const branding = useBranding()
  const { session, loading: authLoading, logout } = useStaffAuth()
  const [stats, setStats] = useState<{ visits_today: number } | null>(null)
  const [pendingRewards, setPendingRewards] = useState(0)

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/mesero')
    }
  }, [authLoading, session, router])

  useEffect(() => {
    if (!session) return

    const buildHeaders = () => {
      const headers: Record<string, string> = {}
      if (session.type === 'staff' && session.token) {
        headers.Authorization = `Bearer ${session.token}`
      } else {
        const deviceToken = localStorage.getItem('staff_device_token')
        if (deviceToken) headers['X-Device-Token'] = deviceToken
      }
      return headers
    }

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/staff/stats', { headers: buildHeaders() })
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch {
        // ignore
      }
    }

    const fetchPending = async () => {
      try {
        const res = await fetch('/api/staff/pending-rewards', { headers: buildHeaders() })
        if (res.ok) {
          const data = await res.json()
          setPendingRewards(data.count ?? 0)
        }
      } catch {
        // ignore
      }
    }

    fetchStats()
    fetchPending()

    // Un premio recién elegido por un cliente debe encender el contador sin recargar.
    const interval = setInterval(fetchPending, 30_000)
    return () => clearInterval(interval)
  }, [session])

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
      {/* Header */}
      <header className="bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">
              {session.type === 'device' ? 'Dispositivo de confianza' : branding.staffLabel}
            </p>
            <h1 className="text-lg font-bold text-gray-900">{session.name}</h1>
          </div>
          <button
            onClick={logout}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="mx-auto w-full max-w-md px-4 pt-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-gray-500">
              <ClipboardList className="h-4 w-4" />
              <span className="text-xs font-medium">Hoy</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.visits_today ?? 0}
            </p>
            <p className="text-xs text-gray-400">Visitas registradas</p>
          </div>

          <button
            onClick={() => router.push('/mesero/rewards')}
            className={`rounded-2xl p-4 text-left shadow-sm transition-colors ${
              pendingRewards > 0 ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-white'
            }`}
          >
            <div
              className={`mb-1 flex items-center gap-2 ${
                pendingRewards > 0 ? 'text-amber-600' : 'text-gray-500'
              }`}
            >
              <Gift className="h-4 w-4" />
              <span className="text-xs font-medium">Premios</span>
            </div>
            <p
              className={`text-2xl font-bold ${
                pendingRewards > 0 ? 'text-amber-700' : 'text-gray-900'
              }`}
            >
              {pendingRewards}
            </p>
            <p className={`text-xs ${pendingRewards > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {pendingRewards > 0 ? 'Pendientes de entregar' : 'Todo entregado'}
            </p>
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mx-auto mt-6 w-full max-w-md px-4 pb-8">
        <button
          onClick={() => router.push('/mesero/scan')}
          className="btn-premium flex h-[64px] w-full items-center justify-center gap-3 rounded-2xl text-lg font-semibold"
        >
          <ScanLine className="h-6 w-6" />
          Escanear QR de Cliente
        </button>

        {pendingRewards > 0 && (
          <button
            onClick={() => router.push('/mesero/rewards')}
            className="mt-3 flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-amber-500 text-base font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 active:bg-amber-700"
          >
            <Gift className="h-5 w-5" />
            Entregar {pendingRewards} premio{pendingRewards === 1 ? '' : 's'}
          </button>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">
          Apunta la cámara al código QR del cliente para registrar su visita.
        </p>
      </div>
    </div>
  )
}
