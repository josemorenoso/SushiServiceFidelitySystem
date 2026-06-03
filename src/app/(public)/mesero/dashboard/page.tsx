'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStaffAuth } from '@/hooks/useStaffAuth'
import { STAFF_LABEL } from '@/lib/branding'
import { Loader2, ScanLine, LogOut, ClipboardList } from 'lucide-react'

export default function MeseroDashboardPage() {
  const router = useRouter()
  const { session, loading: authLoading, logout } = useStaffAuth()
  const [stats, setStats] = useState<{ visits_today: number } | null>(null)

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/mesero')
    }
  }, [authLoading, session, router])

  useEffect(() => {
    if (!session) return
    const fetchStats = async () => {
      const headers: Record<string, string> = {}
      if (session.type === 'staff' && session.token) {
        headers.Authorization = `Bearer ${session.token}`
      } else {
        const deviceToken = localStorage.getItem('staff_device_token')
        if (deviceToken) headers['X-Device-Token'] = deviceToken
      }
      try {
        const res = await fetch('/api/staff/stats', { headers })
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch {
        // ignore
      }
    }
    fetchStats()
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
              {session.type === 'device' ? 'Dispositivo de confianza' : STAFF_LABEL}
            </p>
            <h1 className="text-lg font-bold text-gray-900">{session.name}</h1>
          </div>
          <button
            onClick={logout}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
        </div>
      </div>

      {/* Actions */}
      <div className="mx-auto mt-6 w-full max-w-md px-4 pb-8">
        <button
          onClick={() => router.push('/mesero/scan')}
          className="flex h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-red-500 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-red-600 active:bg-red-700"
        >
          <ScanLine className="h-6 w-6" />
          Escanear QR de Cliente
        </button>

        <p className="mt-4 text-center text-xs text-gray-400">
          Apunta la cámara al código QR del cliente para registrar su visita.
        </p>
      </div>
    </div>
  )
}
