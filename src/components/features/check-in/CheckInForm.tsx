'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Phone, User, MapPin, ArrowLeft } from 'lucide-react'
import { RewardsPreview } from './RewardsPreview'
import { CustomerCard } from './CustomerCard'

interface TierPreview {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}
// import { getCurrentPosition } from '@/lib/utils/geolocation'  // standby — desactivado v1.0.5-3

const COLOMBIAN_CITIES = [
  'Medellín','Envigado','Itagüí','Bello','Sabaneta','La Estrella','Caldas','Copacabana','Girardota','Barbosa',
  'Bogotá','Soacha','Chía','Zipaquirá','Fusagasugá','Facatativá','Mosquera','Madrid','Funza',
  'Cali','Palmira','Buenaventura','Tuluá','Cartago','Buga','Yumbo',
  'Barranquilla','Soledad','Malambo','Sabanalarga',
  'Cartagena','Turbaco',
  'Bucaramanga','Floridablanca','Girón','Piedecuesta',
  'Cúcuta','Villa del Rosario','Los Patios',
  'Manizales','La Dorada','Villamaría',
  'Pereira','Dosquebradas','Santa Rosa de Cabal',
  'Armenia','Calarcá','Montenegro',
  'Ibagué','Espinal','Girardot',
  'Neiva','Pitalito','Garzón',
  'Santa Marta','Ciénaga',
  'Valledupar','Aguachica',
  'Montería','Cereté',
  'Villavicencio','Acacías',
  'Pasto','Ipiales','Tumaco',
  'Popayán','Santander de Quilichao',
  'Riohacha','Maicao',
  'Sincelejo','Corozal',
  'Tunja','Duitama','Sogamoso',
  'Florencia','San Vicente del Caguán',
  'Yopal','Aguazul',
  'Mocoa','Puerto Asís',
  'Mitú','Leticia','Puerto Inírida','San José del Guaviare',
].sort()
import type {
  CheckInFormProps,
  CheckInStep,
  LookupResult,
  CheckInResult,
  RegisterResult,
} from './CheckInForm.types'

export function CheckInForm({
  onLookupResult,
  onRegisterSuccess,
  onCheckInSuccess,
  onError,
}: CheckInFormProps) {
  const [step, setStep] = useState<CheckInStep>('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')

  const birthday = birthDay && birthMonth && birthYear
    ? `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`
    : ''
  const [city, setCity] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [cityOpen, setCityOpen] = useState(false)
  const cityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setCityOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cityMatches = cityInput.length > 0
    ? COLOMBIAN_CITIES.filter((c) =>
        c.toLowerCase().includes(cityInput.toLowerCase())
      ).slice(0, 6)
    : []
  const [acceptsMarketing, setAcceptsMarketing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tableNumber, setTableNumber] = useState<number | null>(null)
  const [customerQR, setCustomerQR] = useState<string | null>(null)
  const [lookupCustomer, setLookupCustomer] = useState<{
    id?: string
    name: string
    total_visits: number
    current_tier?: string | null
    total_points?: number
  } | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [previewTiers, setPreviewTiers] = useState<TierPreview[]>([])
  const [pointsRange, setPointsRange] = useState<{ min: number; max: number } | null>(null)
  const [justEarnedPoints, setJustEarnedPoints] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/public/reward-tiers')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPreviewTiers(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/public/points-range')
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.min === 'number' && typeof data.max === 'number') {
          setPointsRange({ min: data.min, max: data.max })
        }
      })
      .catch(() => {})
  }, [])

  // ─── Geolocalización standby — desactivado v1.0.5-3 ───
  // const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'verified' | 'denied' | 'error'>('idle')
  // const [locationError, setLocationError] = useState<string | null>(null)
  // const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null)

  // const verifyLocation = async (): Promise<{ lat: number; lon: number } | null> => {
  //   setLocationStatus('requesting')
  //   setLocationError(null)
  //   try {
  //     const pos = await getCurrentPosition(10000)
  //     const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude }
  //     setUserCoords(coords)
  //     setLocationStatus('verified')
  //     return coords
  //   } catch (err) {
  //     const msg = err instanceof Error ? err.message : 'Error de ubicación'
  //     setLocationError(msg)
  //     setLocationStatus('denied')
  //     return null
  //   }
  // }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const mesa = params.get('mesa')
      if (mesa && !isNaN(parseInt(mesa))) {
        setTableNumber(parseInt(mesa))
      }
    }
  }, [])

  // ─── Polling automático: detectar cuando el mesero registra la visita ───
  // IMPORTANTE: debe estar aquí, ANTES de cualquier return condicional, para
  // que React llame este hook en el mismo orden en cada render (Rules of Hooks).
  useEffect(() => {
    if (step !== 'customer_qr' || !phone) return

    let cancelled = false
    const poll = async () => {
      try {
        setCheckingStatus(true)
        const res = await fetch(`/api/check-in/status?phone=${encodeURIComponent(phone)}`)
        const data = await res.json()
        if (cancelled) return

        if (data.hasRecentVisit) {
          const tierUnlocked = data.tier_unlocked ?? null
          const awarded = data.points_awarded ?? 0
          const isFirstVisit = data.customer.total_visits === 1

          // Mostrar overlay de dopamina ~1.6s, luego continuar al éxito
          setJustEarnedPoints(awarded)

          // Cliente nuevo cuya primera visita acaba de validar el mesero →
          // pantalla de BIENVENIDA (no "¡volviste!"), para que no parezca frecuente.
          if (isFirstVisit && !tierUnlocked) {
            const welcomeResult: RegisterResult = {
              message: 'welcome',
              customer: {
                name: data.customer.name,
                total_visits: data.customer.total_visits,
                total_points: data.customer.total_points,
              },
              points_awarded: awarded,
              tiers: data.tiers ?? [],
            }
            setTimeout(() => onRegisterSuccess(welcomeResult, phone), 1600)
            return
          }

          const result: CheckInResult = {
            message: tierUnlocked ? 'tier_unlocked' : 'points_earned',
            customer: {
              name: data.customer.name,
              total_visits: data.customer.total_visits,
              total_points: data.customer.total_points,
            },
            points_awarded: awarded,
            tier_unlocked: tierUnlocked,
            next_tier: data.next_tier ?? null,
            tiers: data.tiers ?? [],
          }
          setTimeout(() => onCheckInSuccess(result, phone), 1600)
          return
        }
      } catch (err) {
        console.error('[CheckInForm] Status poll error:', err)
      } finally {
        if (!cancelled) setCheckingStatus(false)
      }
    }

    poll()
    const interval = setInterval(poll, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [step, phone, onCheckInSuccess, onRegisterSuccess])

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.length < 10) return

    setLoading(true)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, action: 'lookup', table_number: tableNumber }),
      })

      const data = (await res.json()) as LookupResult & { error?: string; message?: string }

      if (!res.ok) {
        onError(data.message ?? 'Error buscando el número')
        return
      }

      if (data.found && data.customer) {
        onLookupResult(data, phone)

        // ─── Cliente frecuente: usar token firmado que devuelve el servidor ───
        if (data.qr_token) {
          const qrUrl = `${window.location.origin}/mesero/scan?token=${encodeURIComponent(data.qr_token)}`
          setCustomerQR(qrUrl)
          setLookupCustomer(data.customer)
          setStep('customer_qr')
        } else {
          // STAFF_QR_JWT_SECRET no configurado — mostrar mensaje de fallback
          onError('Configura STAFF_QR_JWT_SECRET para habilitar el QR de mesero.')
        }
        setLoading(false)
        return
      } else {
        setStep('register')
      }
    } catch (err) {
      console.error('[CheckInForm] Lookup error:', err)
      const msg = err instanceof Error ? err.message : 'Error de conexión. Intenta de nuevo.'
      onError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || name.trim().length < 2) return

    setLoading(true)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          action: 'register',
          name: name.trim(),
          birthday: birthday || null,
          city: city.trim() || null,
          accepts_marketing: acceptsMarketing,
          table_number: tableNumber,
          // lat/lon standby — desactivado v1.0.5-3
        }),
      })

      const data = (await res.json()) as RegisterResult & { message?: string }

      if (!res.ok) {
        onError(data.message ?? 'Error registrando')
        return
      }

      // Primera visita requiere validación del mesero: mostrar QR dinámico y dejar
      // que el polling detecte el escaneo (mismo flujo que cliente frecuente).
      if (data.message === 'registered_pending_scan') {
        if (data.qr_token) {
          const qrUrl = `${window.location.origin}/mesero/scan?token=${encodeURIComponent(data.qr_token)}`
          setCustomerQR(qrUrl)
          setLookupCustomer({
            id: data.customer.id,
            name: data.customer.name,
            total_visits: data.customer.total_visits,
            total_points: data.customer.total_points ?? 0,
          })
          setStep('customer_qr')
        } else {
          onError('Configura STAFF_QR_JWT_SECRET para habilitar el QR de mesero.')
        }
        return
      }

      onRegisterSuccess(data, phone)
    } catch {
      onError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'phone') {
    return (
      <div className="premium-card animate-fade-in-up w-full p-7">
        {/* Encabezado */}
        <div className="mb-6 text-center">
          <h2
            className="font-playfair text-2xl font-bold"
            style={{ color: "#1a1c1d", letterSpacing: "-0.02em" }}
          >
            Bienvenido
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#9ca3af" }}>
            Ingresa tu número de celular para continuar
          </p>
        </div>

        <form onSubmit={handlePhoneSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="phone"
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#6b7280", letterSpacing: "0.05em" }}
            >
              Número de celular
            </label>
            <div className="relative">
              <Phone
                className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                strokeWidth={1.5}
                style={{ color: "#9ca3af" }}
              />
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="3001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="input-premium w-full rounded-xl py-3.5 pl-10 pr-4 text-lg font-medium outline-none"
                style={{ color: "#1a1c1d", letterSpacing: "-0.01em" }}
                maxLength={10}
                required
                autoFocus
              />
            </div>
            <p className="text-xs" style={{ color: "#d1d5db" }}>
              10 dígitos, empieza con 3
            </p>
          </div>

          <button
            type="submit"
            className="btn-premium mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
            style={{ letterSpacing: "-0.01em" }}
            disabled={phone.length < 10 || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                Buscando...
              </>
            ) : (
              'Continuar'
            )}
          </button>
        </form>

        {previewTiers.length > 0 && <RewardsPreview tiers={previewTiers} pointsRange={pointsRange} />}
      </div>
    )
  }

  if (step === 'register') {
    return (
      <div className="premium-card animate-fade-in-up w-full p-7">
        {/* Encabezado */}
        <div className="mb-6 text-center">
          <h2
            className="font-playfair text-2xl font-bold"
            style={{ color: "#1a1c1d", letterSpacing: "-0.02em" }}
          >
            Regístrate
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#9ca3af" }}>
            Es tu primera vez. ¡Completa tu registro!
          </p>
        </div>

        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#6b7280", letterSpacing: "0.05em" }}
            >
              Nombre
            </label>
            <div className="relative">
              <User
                className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                strokeWidth={1.5}
                style={{ color: "#9ca3af" }}
              />
              <input
                id="name"
                type="text"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-premium w-full rounded-xl py-3.5 pl-10 pr-4 text-base outline-none"
                style={{ color: "#1a1c1d" }}
                required
                autoFocus
              />
            </div>
          </div>

          {/* Ciudad */}
          <div className="space-y-1.5" ref={cityRef}>
            <label
              htmlFor="city-input"
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#6b7280", letterSpacing: "0.05em" }}
            >
              Ciudad
            </label>
            <div className="relative">
              <MapPin
                className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 z-10"
                strokeWidth={1.5}
                style={{ color: "#9ca3af" }}
              />
              <input
                id="city-input"
                type="text"
                autoComplete="off"
                placeholder="Escribe tu ciudad..."
                value={city ? city : cityInput}
                onChange={(e) => {
                  setCity('')
                  setCityInput(e.target.value)
                  setCityOpen(true)
                }}
                onFocus={() => { if (!city) setCityOpen(true) }}
                className="input-premium w-full rounded-xl py-3.5 pl-10 pr-4 text-base outline-none"
                style={{ color: "#1a1c1d" }}
              />
              {city && (
                <button
                  type="button"
                  onClick={() => { setCity(''); setCityInput(''); setCityOpen(false) }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  ×
                </button>
              )}
              {cityOpen && cityMatches.length > 0 && (
                <ul className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  {cityMatches.map((c) => (
                    <li
                      key={c}
                      onMouseDown={() => { setCity(c); setCityInput(''); setCityOpen(false) }}
                      className="cursor-pointer px-4 py-3 text-sm hover:bg-gray-50 active:bg-gray-100 border-b last:border-0 border-gray-100"
                      style={{ color: "#1a1c1d" }}
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Fecha de nacimiento */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#6b7280", letterSpacing: "0.05em" }}>
              Cumpleaños{" "}
              <span style={{ color: "#d1d5db", textTransform: "none", fontSize: "0.65rem" }}>(opcional)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value)}
                className="input-premium w-full rounded-xl py-3.5 px-3 text-base outline-none appearance-none text-center"
                style={{ color: birthDay ? "#1a1c1d" : "#9ca3af" }}
              >
                <option value="">Día</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>{d}</option>
                ))}
              </select>

              <select
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
                className="input-premium w-full rounded-xl py-3.5 px-3 text-base outline-none appearance-none text-center"
                style={{ color: birthMonth ? "#1a1c1d" : "#9ca3af" }}
              >
                <option value="">Mes</option>
                {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => (
                  <option key={i + 1} value={String(i + 1)}>{m}</option>
                ))}
              </select>

              <select
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                className="input-premium w-full rounded-xl py-3.5 px-3 text-base outline-none appearance-none text-center"
                style={{ color: birthYear ? "#1a1c1d" : "#9ca3af" }}
              >
                <option value="">Año</option>
                {Array.from({ length: 85 }, (_, i) => new Date().getFullYear() - 10 - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Consentimiento de comunicaciones */}
          <div className="flex items-start gap-2.5 mt-1">
            <input
              id="accepts_marketing"
              type="checkbox"
              checked={acceptsMarketing}
              onChange={(e) => setAcceptsMarketing(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#E63946] cursor-pointer"
            />
            <label
              htmlFor="accepts_marketing"
              className="text-xs leading-relaxed cursor-pointer"
              style={{ color: "#6b7280" }}
            >
              Acepto recibir regalos, recompensas y comunicaciones por WhatsApp. He leído y acepto la{' '}
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: '#E63946' }}
            >
              Política de Privacidad
            </a>.
            </label>
          </div>

          <button
            type="submit"
            className="btn-premium mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
            style={{ letterSpacing: "-0.01em" }}
            disabled={!name.trim() || name.trim().length < 2 || !acceptsMarketing || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                Registrando...
              </>
            ) : (
              'Registrarme'
            )}
          </button>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors duration-200"
            style={{ color: "#9ca3af" }}
            onClick={() => setStep('phone')}
            disabled={loading}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Volver
          </button>
        </form>

        {previewTiers.length > 0 && <RewardsPreview tiers={previewTiers} pointsRange={pointsRange} />}
      </div>
    )
  }

  if (step === 'customer_qr' && customerQR && lookupCustomer) {
    return (
      <CustomerCard
        name={lookupCustomer.name}
        totalPoints={lookupCustomer.total_points ?? 0}
        qrUrl={customerQR}
        tiers={previewTiers}
        checkingStatus={checkingStatus}
        justEarnedPoints={justEarnedPoints}
        onBack={() => {
          setStep('phone')
          setCustomerQR(null)
          setLookupCustomer(null)
          setJustEarnedPoints(null)
        }}
      />
    )
  }

  return null
}
