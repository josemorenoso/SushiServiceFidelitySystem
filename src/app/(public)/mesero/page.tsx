'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useStaffAuth } from '@/hooks/useStaffAuth'
import { useBranding } from '@/lib/branding-context'
import { Loader2, Smartphone, Tablet, ScanLine, MapPin, Check } from 'lucide-react'

interface Sede {
  id: string
  name: string
}

/**
 * Activación del celular DEL LOCAL (§19).
 *
 * Esta pantalla ya no es un login de mesero: ese login desapareció. Es el ÚNICO momento en
 * que alguien escribe una credencial, lo hace el supervisor, y pasa una vez en la vida del
 * aparato. Textual del dueño (2026-09-05): *"se crea un usuario, se inicia sesión y ya está,
 * no hay mayor logica ahí"*.
 *
 * DOS PASOS, Y EL SEGUNDO CASI NUNCA SE VE. La sede solo se pregunta cuando la marca tiene 2
 * o más: con una sola, `/api/staff/locations` la devuelve en `auto` y el paso se salta
 * entero. Era la preocupación explícita del dueño ("me parece que se va a volver un
 * revoltillo completo") y por eso está resuelta aquí y no en un ajuste posterior.
 *
 * Ref: docs/features/staff-qr-scan.md · spec 2026-09-05-staff-scanner-19-design.md
 */
export default function MeseroActivarPage() {
  const router = useRouter()
  const branding = useBranding()
  const { session, loading: authLoading, verifySession } = useStaffAuth()

  const [step, setStep] = useState<'creds' | 'sede'>('creds')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [sedes, setSedes] = useState<Sede[]>([])
  const [autoSede, setAutoSede] = useState<string | null>(null)
  const [sedeElegida, setSedeElegida] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * El aparato ya está activo pero le falta la sede. Es TODO el parque instalado: la 00044
   * no backfilleó nada a propósito, así que sus `location_id` son NULL. Sin sede no hay lista
   * de meseros, y la alternativa —mostrar los de todas las sedes— es justo la que el dueño
   * rechazó, así que la pantalla pide asignarla en vez de dejar escanear.
   */
  const faltaSede = Boolean(session && !session.locationId)

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

  // Las sedes de la marca. Se piden siempre: son las que deciden si el paso 2 existe.
  useEffect(() => {
    const cargarSedes = async () => {
      try {
        const res = await fetch('/api/staff/locations')
        if (!res.ok) return
        const data = await res.json()
        setSedes(data.locations ?? [])
        setAutoSede(data.auto ?? null)
      } catch {
        // Sin sedes cargadas el flujo sigue: el backend vuelve a decidir y, si hace falta
        // elegir, responde `sede_requerida` y esta pantalla muestra el paso 2.
      }
    }
    cargarSedes()
  }, [])

  useEffect(() => {
    if (session && session.locationId) {
      router.replace('/mesero/dashboard')
    }
  }, [session, router])

  const activar = useCallback(
    async (locationId: string | null) => {
      setLoading(true)
      setError(null)
      try {
        const fingerprint = getDeviceFingerprint()
        const res = await fetch('/api/staff/device/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            pin,
            device_fingerprint: fingerprint,
            device_name: deviceName.trim() || null,
            location_id: locationId,
          }),
        })
        const data = await res.json()

        // El backend es el que manda: si dice que falta la sede, se muestra el paso 2 aunque
        // `/api/staff/locations` haya fallado antes.
        if (!res.ok) {
          if (data.code === 'sede_requerida') {
            setStep('sede')
            setError(null)
            return
          }
          throw new Error(data.message || 'Error activando el celular')
        }

        localStorage.setItem('staff_device_token', fingerprint)
        await verifySession()
        router.replace('/mesero/dashboard')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error activando el celular')
      } finally {
        setLoading(false)
      }
    },
    [phone, pin, deviceName, verifySession, router]
  )

  const handleCreds = (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.length < 10 || pin.length < 4) return
    // Una sola sede (o el subdominio ya la resolvió) → no se pregunta nada.
    if (autoSede) {
      activar(autoSede)
      return
    }
    if (sedes.length > 1) {
      setStep('sede')
      return
    }
    // Marca sin sedes creadas: se activa sin sede y el backend lo permite.
    activar(null)
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
            {step === 'sede' ? (
              <MapPin className="h-6 w-6 text-red-500" />
            ) : (
              <ScanLine className="h-6 w-6 text-red-500" />
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {step === 'sede' ? '¿Dónde queda este celular?' : 'Activar este celular'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'sede'
              ? 'Sirve para que después solo aparezcan los ' +
                branding.staffLabel.toLowerCase() +
                's de esta sede.'
              : 'Queda activado para siempre. Nadie tiene que volver a entrar.'}
          </p>
        </div>

        {faltaSede && step === 'creds' && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Este celular ya está activo pero no tiene sede asignada. Confirma con el PIN del
            supervisor para asignársela: se pide una sola vez.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        {step === 'creds' ? (
          <form onSubmit={handleCreds} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Celular del supervisor
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
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                maxLength={6}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                ¿Cómo se llama este aparato?
              </label>
              <input
                type="text"
                placeholder="Tablet de la caja"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value.slice(0, 60))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                maxLength={60}
              />
              <p className="mt-1 text-xs text-gray-400">
                Es la nota de a quién pertenece el celular. Opcional.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || phone.length < 10 || pin.length < 4}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Activando...
                </>
              ) : (
                <>
                  <Tablet className="h-4 w-4" />
                  Activar
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-400">
              Van el celular y el PIN del <strong>supervisor o admin</strong> que autoriza.
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {sedes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSedeElegida(s.id)}
                  className={`flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-base transition-colors ${
                    sedeElegida === s.id
                      ? 'border-2 border-red-500 bg-red-50 font-semibold text-gray-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{s.name}</span>
                  {sedeElegida === s.id && <Check className="h-5 w-5 text-red-500" />}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => sedeElegida && activar(sedeElegida)}
              disabled={loading || !sedeElegida}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                'Confirmar'
              )}
            </button>

            <button
              type="button"
              onClick={() => setStep('creds')}
              className="min-h-[44px] w-full text-center text-xs text-gray-400 hover:text-gray-600"
            >
              Volver
            </button>
          </div>
        )}
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
