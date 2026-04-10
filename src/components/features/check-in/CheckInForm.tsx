'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Phone, User, Calendar, MapPin } from 'lucide-react'
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
  const [loading, setLoading] = useState(false)

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.length < 10) return

    setLoading(true)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, action: 'lookup' }),
      })

      const data = (await res.json()) as LookupResult & { error?: string; message?: string; customer?: { name: string; total_visits: number } }

      if (!res.ok) {
        onError(data.message ?? 'Error buscando el número')
        return
      }

      if (data.found && data.customer) {
        onLookupResult(data)
        // Auto check-in
        const checkInRes = await fetch('/api/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, action: 'checkin' }),
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
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Bienvenido</CardTitle>
          <CardDescription>Ingresa tu número de celular para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Número de celular</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="3001234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="pl-10 text-lg h-12"
                  maxLength={10}
                  required
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">10 dígitos, empieza con 3</p>
            </div>
            <Button
              type="submit"
              className="w-full h-12 text-lg"
              disabled={phone.length < 10 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                'Continuar'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  if (step === 'register') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Regístrate</CardTitle>
          <CardDescription>Es tu primera vez. ¡Completa tu registro!</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10 text-lg h-12"
                  required
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="city"
                  type="text"
                  placeholder="Ej: Bogotá, Medellín..."
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="pl-10 text-lg h-12"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthday">Fecha de nacimiento (opcional)</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="pl-10 text-lg h-12"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-12 text-lg"
              disabled={!name.trim() || name.trim().length < 2 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                'Registrarme'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setStep('phone')}
              disabled={loading}
            >
              Volver
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return null
}
