'use client'

import { useState, useEffect } from 'react'
import { Loader2, Phone, User, Calendar, MapPin, ArrowLeft } from 'lucide-react'
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
  const [birthday, setBirthday] = useState('')
  const [city, setCity] = useState('')
  const [acceptsMarketing, setAcceptsMarketing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [tableNumber, setTableNumber] = useState<number | null>(null)

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

    setLoading(true)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, action: 'lookup', table_number: tableNumber }),
      })

      const data = (await res.json()) as LookupResult & { error?: string; message?: string; customer?: { name: string; total_visits: number } }

      if (!res.ok) {
        onError(data.message ?? 'Error buscando el número')
        return
      }

      if (data.found && data.customer) {
        onLookupResult(data)
        const checkInRes = await fetch('/api/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, action: 'checkin', table_number: tableNumber }),
        })

        const checkInData = await checkInRes.json()

        if (checkInRes.status === 429) {
          onCheckInSuccess({
            message: 'welcome_back',
            customer: checkInData.customer,
            reward: null,
          })
          return
        }

        if (!checkInRes.ok) {
          onError(checkInData.message ?? 'Error registrando visita')
          return
        }

        onCheckInSuccess(checkInData)
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
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        onError(data.message ?? 'Error registrando')
        return
      }

      onRegisterSuccess(data)
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
          <div className="space-y-1.5">
            <label
              htmlFor="city"
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#6b7280", letterSpacing: "0.05em" }}
            >
              Ciudad
            </label>
            <div className="relative">
              <MapPin
                className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                strokeWidth={1.5}
                style={{ color: "#9ca3af" }}
              />
              <input
                id="city"
                type="text"
                placeholder="Ej: Bogotá, Medellín..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="input-premium w-full rounded-xl py-3.5 pl-10 pr-4 text-base outline-none"
                style={{ color: "#1a1c1d" }}
              />
            </div>
          </div>

          {/* Fecha de nacimiento */}
          <div className="space-y-1.5">
            <label
              htmlFor="birthday"
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#6b7280", letterSpacing: "0.05em" }}
            >
              Cumpleaños{" "}
              <span style={{ color: "#d1d5db", textTransform: "none", fontSize: "0.65rem" }}>
                (opcional)
              </span>
            </label>
            <div className="relative">
              <Calendar
                className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                strokeWidth={1.5}
                style={{ color: "#9ca3af" }}
              />
              <input
                id="birthday"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="input-premium w-full rounded-xl py-3.5 pl-10 pr-4 text-base outline-none"
                style={{ color: "#1a1c1d" }}
                max={new Date().toISOString().split('T')[0]}
              />
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
            disabled={!name.trim() || name.trim().length < 2 || loading}
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
