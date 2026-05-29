'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Phone, User, MapPin, ArrowLeft, MapPinOff } from 'lucide-react'
import { getCurrentPosition } from '@/lib/utils/geolocation'

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

  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'verified' | 'denied' | 'error'>('idle')
  const [locationError, setLocationError] = useState<string | null>(null)
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null)

  const verifyLocation = async (): Promise<{ lat: number; lon: number } | null> => {
    setLocationStatus('requesting')
    setLocationError(null)
    try {
      const pos = await getCurrentPosition(10000)
      const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      setUserCoords(coords)
      setLocationStatus('verified')
      return coords
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de ubicación'
      setLocationError(msg)
      setLocationStatus('denied')
      return null
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const mesa = params.get('mesa')
      if (mesa && !isNaN(parseInt(mesa))) {
        setTableNumber(parseInt(mesa))
      }
    }
  }, [])

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.length < 10) return

    const coords = userCoords ?? await verifyLocation()
    if (!coords) return

    setLoading(true)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, action: 'lookup', table_number: tableNumber, lat: coords.lat, lon: coords.lon }),
      })

      const data = (await res.json()) as LookupResult & { error?: string; message?: string; customer?: { name: string; total_visits: number } }

      if (!res.ok) {
        onError(data.message ?? 'Error buscando el número')
        return
      }

      if (data.found && data.customer) {
        onLookupResult(data, phone)
        const checkInRes = await fetch('/api/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, action: 'checkin', table_number: tableNumber, lat: coords.lat, lon: coords.lon }),
        })

        const checkInData = await checkInRes.json()

        if (checkInRes.status === 429) {
          onCheckInSuccess({
            message: 'duplicate',
            customer: checkInData.customer,
            reward: null,
          }, phone)
          return
        }

        if (!checkInRes.ok) {
          onError(checkInData.message ?? 'Error registrando visita')
          return
        }

        onCheckInSuccess(checkInData, phone)
      } else {
        setStep('register')
      }
    } catch {
      onError('Error de conexión. Intenta de nuevo.')
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
          lat: userCoords?.lat,
          lon: userCoords?.lon,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        onError(data.message ?? 'Error registrando')
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

          {locationStatus === 'requesting' && (
            <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.1)' }}>
              <p className="text-sm font-medium" style={{ color: '#d97706' }}>
                Verificando tu ubicación...
              </p>
            </div>
          )}

          {locationStatus === 'verified' && (
            <div className="text-center py-2 rounded-xl" style={{ background: 'rgba(5,150,105,0.08)' }}>
              <p className="text-xs font-medium" style={{ color: '#059669' }}>
                Ubicación verificada
              </p>
            </div>
          )}

          {locationStatus === 'denied' && (
            <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)' }}>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <MapPinOff className="h-4 w-4" strokeWidth={1.5} style={{ color: '#dc2626' }} />
                <p className="text-sm font-medium" style={{ color: '#dc2626' }}>
                  {locationError || 'Debes activar la ubicación para hacer check-in'}
                </p>
              </div>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                El QR solo funciona dentro del restaurante
              </p>
              <button
                type="button"
                onClick={() => { setLocationStatus('idle'); setLocationError(null) }}
                className="mt-2 text-xs font-medium underline"
                style={{ color: '#6b7280' }}
              >
                Reintentar
              </button>
            </div>
          )}

          <button
            type="submit"
            className="btn-premium mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
            style={{ letterSpacing: "-0.01em" }}
            disabled={phone.length < 10 || loading || locationStatus === 'requesting'}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                Buscando...
              </>
            ) : locationStatus === 'requesting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                Verificando ubicación...
              </>
            ) : (
              'Continuar'
            )}
          </button>
        </form>
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
              Acepto ser parte de la familia y recibir regalos, recompensas y comunicaciones por WhatsApp
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
      </div>
    )
  }

  return null
}
