'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStaffAuth } from '@/hooks/useStaffAuth'
import { useBranding } from '@/lib/branding-context'
import { Loader2, Smartphone, Tablet, ScanLine } from 'lucide-react'

export default function MeseroLoginPage() {
  const router = useRouter()
  const branding = useBranding()
  const { session, loading: authLoading, login, verifySession } = useStaffAuth()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [assignPhone, setAssignPhone] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Verificar dispositivo de confianza al cargar
  useEffect(() => {
    const checkDevice = async () => {
      const fingerprint = getDeviceFingerprint()
      try {
        const res = await fetch('/api/staff/device/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_fingerprint: fingerprint }),
        })
        const data = await res.json()
        if (data.valid) {
          localStorage.setItem('staff_device_token', fingerprint)
          await verifySession()
        }
      } catch {
        // silently fail
      }
    }

    if (!session && !authLoading) {
      checkDevice()
    }
  }, [session, authLoading, verifySession])

  useEffect(() => {
    if (session) {
      router.replace('/mesero/dashboard')
    }
  }, [session, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.length < 10 || pin.length < 4) return

    setLoading(true)
    setError(null)
    try {
      await login(phone, pin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de login')
    } finally {
      setLoading(false)
    }
  }

  const handleActivateDevice = async () => {
    if (phone.length < 10 || pin.length < 4) {
      setError('Ingresa número y PIN del supervisor')
      return
    }
    if (showAssign && assignPhone.length > 0 && assignPhone.length < 10) {
      setError('El celular del mesero debe tener 10 dígitos')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const fingerprint = getDeviceFingerprint()
      const assigning = showAssign && assignPhone.length === 10
      const res = await fetch('/api/staff/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          pin,
          device_fingerprint: fingerprint,
          // Sin asignación explícita se mantiene el nombre genérico del local;
          // con mesero asignado el backend lo nombra "Dispositivo de {mesero}".
          device_name: assigning ? null : 'Celular del Local',
          assign_staff_phone: assigning ? assignPhone : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Error activando dispositivo')
      }
      if (data.assigned_to) setNotice(`Dispositivo activado a nombre de ${data.assigned_to}`)
      localStorage.setItem('staff_device_token', fingerprint)
      await verifySession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error activando dispositivo')
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <ScanLine className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">App del {branding.staffLabel}</h1>
          <p className="mt-1 text-sm text-gray-500">Escanea los QR de los clientes</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {notice}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
              Número de celular
            </label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                placeholder="3001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-base outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                maxLength={10}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 px-4 text-base outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              maxLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || phone.length < 10 || pin.length < 4}
            className="btn-premium flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showAssign}
              onChange={(e) => setShowAssign(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Asignar este dispositivo a un {branding.staffLabel.toLowerCase()} específico
          </label>

          {showAssign && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Celular del {branding.staffLabel.toLowerCase()}
              </label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="3009876543"
                value={assignPhone}
                onChange={(e) => setAssignPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 px-4 text-base outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                maxLength={10}
              />
              <p className="mt-1 text-xs text-gray-400">
                Las visitas registradas desde este dispositivo quedarán a su nombre.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleActivateDevice}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <Tablet className="h-4 w-4" />
            Activar este dispositivo (autoriza el supervisor)
          </button>
          <p className="text-center text-xs text-gray-400">
            Arriba van el celular y PIN del <strong>supervisor o admin</strong> que autoriza.
            {showAssign ? ' El dispositivo quedará a nombre del mesero indicado.' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

function getDeviceFingerprint(): string {
  const raw = `${navigator.userAgent}|${screen.width}x${screen.height}|${navigator.platform}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return `df_${Math.abs(hash).toString(16)}`
}
