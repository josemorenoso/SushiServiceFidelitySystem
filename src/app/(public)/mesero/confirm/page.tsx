'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStaffAuth } from '@/hooks/useStaffAuth'
import { decodeCustomerQRTokenUnsafe } from '@/lib/utils/qrcode'
import { RewardAlert } from '@/components/features/staff/RewardAlert'
import { Loader2, ArrowLeft, User, Hash, CheckCircle2 } from 'lucide-react'

export default function MeseroConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <MeseroConfirmContent />
    </Suspense>
  )
}

function MeseroConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session, loading: authLoading } = useStaffAuth()

  const token = searchParams.get('token')
  const manualPhone = searchParams.get('phone')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    name: string
    points: number
    visits: number
    tier?: string | null
  } | null>(null)
  const [tableNumber, setTableNumber] = useState('')

  // Leer datos del cliente desde sessionStorage (escritos por scan/page.tsx antes de navegar).
  // Lazy initializer: se ejecuta síncronamente en el primer render, evitando el "Suspense gap"
  // de App Router donde useSearchParams devuelve null en la primera pintura.
  const [sessionCustomer] = useState<{ name: string; phone: string } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = sessionStorage.getItem('mesero_pending_customer')
      if (!raw) return null
      // NO borrar aquí: si la página se recarga, perderíamos el nombre del cliente.
      // Se limpia tras registrar la visita con éxito (ver handleRegister).
      const data = JSON.parse(raw) as { name: string; phone: string; sub: string; token: string }
      return { name: data.name, phone: data.phone }
    } catch {
      return null
    }
  })

  // Redirigir si no hay auth
  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/mesero')
    }
  }, [authLoading, session, router])

  // Capturador global de errores para diagnosticar crashes
  useEffect(() => {
    const handleErr = (e: ErrorEvent) => {
      console.error('[WindowError]', e.error)
      setError(`CRASH: ${e.message} — Captura esta pantalla y envíala.`)
    }
    const handleRejection = (e: PromiseRejectionEvent) => {
      console.error('[UnhandledRejection]', e.reason)
      setError(`CRASH: ${String(e.reason)} — Captura esta pantalla y envíala.`)
    }
    window.addEventListener('error', handleErr)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleErr)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  const decoded = token ? decodeCustomerQRTokenUnsafe(token) : null

  // Si es modo manual (solo phone), hacer lookup para mostrar datos
  const [manualCustomer, setManualCustomer] = useState<{
    name: string
    phone: string
    total_visits: number
    current_tier?: string | null
    total_points?: number
  } | null>(null)

  useEffect(() => {
    if (!manualPhone) return
    const lookup = async () => {
      try {
        const res = await fetch('/api/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: manualPhone, action: 'lookup' }),
        })
        const data = await res.json()
        if (data.found && data.customer) {
          setManualCustomer({
            name: data.customer.name,
            phone: manualPhone,
            total_visits: data.customer.total_visits,
            current_tier: data.customer.current_tier,
            total_points: data.customer.total_points,
          })
        } else {
          setError('Cliente no encontrado')
        }
      } catch {
        setError('Error buscando cliente')
      }
    }
    lookup()
  }, [manualPhone])

  const customerName = decoded?.name ?? sessionCustomer?.name ?? manualCustomer?.name ?? 'Cliente'
  const customerPhone = decoded?.phone ?? sessionCustomer?.phone ?? manualCustomer?.phone ?? manualPhone ?? ''
  const maskedPhone = customerPhone.length >= 7
    ? `${customerPhone.slice(0, 3)}••••${customerPhone.slice(-3)}`
    : customerPhone

  // Si llegó con token pero no se pudo decodificar, avisar (no dejar el botón muerto en silencio)
  useEffect(() => {
    if (token && !decoded && !error) {
      setError('No se pudo leer el QR del cliente. Pídele que regenere el QR o usa el modo manual.')
    }
  }, [token, decoded, error])

  // Headers de auth del mesero (Bearer JWT o X-Device-Token) — reutilizados por
  // el registro de visita y por la alerta de premio pendiente.
  const staffAuthHeaders = (): Record<string, string> => {
    if (session?.type === 'staff' && session.token) {
      return { Authorization: `Bearer ${session.token}` }
    }
    const deviceToken = typeof window !== 'undefined' ? localStorage.getItem('staff_device_token') : null
    return deviceToken ? { 'X-Device-Token': deviceToken } : {}
  }

  const handleRegister = async () => {
    if (!customerPhone) return
    setLoading(true)
    setError(null)

    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...staffAuthHeaders() }

    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: customerPhone,
          action: 'checkin',
          source: 'staff_scan',
          table_number: tableNumber ? parseInt(tableNumber, 10) : null,
          token: token ?? null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message || 'Error registrando visita')
        setLoading(false)
        return
      }

      // Visita registrada: limpiar el dato temporal del cliente
      try {
        sessionStorage.removeItem('mesero_pending_customer')
      } catch {
        // ignore
      }

      setSuccess({
        name: data.customer?.name ?? customerName,
        points: data.points_awarded ?? 0,
        visits: data.customer?.total_visits ?? 0,
        tier: data.tier_unlocked?.name ?? data.customer?.current_tier ?? null,
      })
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!session) return null

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">¡Visita registrada!</h2>
          <p className="mt-1 text-sm text-gray-500">{success.name}</p>

          <div className="mt-6 space-y-2 rounded-xl bg-gray-50 p-4 text-left text-sm">
            <p><span className="font-medium text-gray-700">Puntos ganados:</span> +{success.points}</p>
            <p><span className="font-medium text-gray-700">Total visitas:</span> {success.visits}</p>
            {success.tier && (
              <p><span className="font-medium text-gray-700">Tier:</span> {success.tier}</p>
            )}
          </div>

          {/* Alerta de premio pendiente: si el cliente ya eligió un premio que aún no
              le han entregado, el mesero lo entrega y lo registra aquí mismo. */}
          {customerPhone && (
            <RewardAlert
              phone={customerPhone}
              authHeaders={staffAuthHeaders()}
              tableNumber={tableNumber ? parseInt(tableNumber, 10) : null}
            />
          )}

          <button
            onClick={() => {
              setSuccess(null)
              setTableNumber('')
              router.push('/mesero/scan')
            }}
            className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-semibold text-white transition-colors hover:bg-red-600"
          >
            Escanear siguiente cliente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            onClick={() => router.push('/mesero/scan')}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Confirmar visita</h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4 pt-6">
        {/* Customer card */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <User className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">{customerName}</p>
              <p className="text-sm text-gray-500">{maskedPhone}</p>
            </div>
          </div>

          {manualCustomer && (
            <div className="mb-4 space-y-1 text-sm text-gray-500">
              <p>Visitas: {manualCustomer.total_visits}</p>
              {manualCustomer.current_tier && <p>Tier: {manualCustomer.current_tier}</p>}
            </div>
          )}

          <div className="space-y-3">
            <label htmlFor="table-number" className="block text-xs font-medium uppercase tracking-wider text-gray-500">
              Número de mesa
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="table-number"
                name="table_number"
                type="text"
                inputMode="numeric"
                placeholder="Ej: 12"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-base outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 space-y-3">
          <button
            onClick={handleRegister}
            disabled={loading || !customerPhone}
            className="flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-red-500 text-lg font-semibold text-white transition-colors hover:bg-red-600 active:bg-red-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Registrando...
              </>
            ) : (
              'Registrar Visita'
            )}
          </button>

          <button
            onClick={() => router.push('/mesero/scan')}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar / Escanear otro
          </button>
        </div>
      </div>
    </div>
  )
}
