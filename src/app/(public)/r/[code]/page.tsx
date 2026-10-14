'use client'

/**
 * Landing de un referido — `/r/{código}` (2026-10-15).
 *
 * Doc: docs/features/referral-program.md
 *
 * Quien llega acá abrió el enlace que un amigo le mandó por SU WhatsApp. Ve «{Nombre} te regaló
 * {beneficio} 🎁» y el mismo formulario de registro de siempre, con el `referralCode` puesto: al
 * registrarse, el regalo le queda en la tarjeta y la visita #1 se la cuenta el mesero cuando lo
 * escanee; ese mismo escaneo le da a su amigo el premio por traerlo.
 *
 * Un código que no existe, de otra marca, o con los referidos apagados (`GET /api/referral/{código}`
 * no contesta 200): la landing NORMAL de la marca, el registro de siempre, sin ningún error. Lo
 * mismo si la base falla: se pierde el regalo, no el cliente.
 *
 * En una marca de 2+ sedes, el registro en el dominio raíz pide la sede; el selector manda a la
 * sede elegida CON esta misma ruta (`CheckInForm`), así que el código no se pierde.
 *
 * Todo el color sale de `--brand-*` y de la marca: ningún hex horneado (§5). Celular primero.
 * Sin `useSearchParams()` (la trampa del CSR bailout): el código viene del segmento de la ruta.
 */

import { use, useCallback, useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { Gift, Clock, Users } from 'lucide-react'
import { CheckInForm, CheckInSuccess } from '@/components/features/check-in'
import { BrandMark } from '@/components/features/branding'
import { useBranding } from '@/lib/branding-context'
import { META_EVENT_CHECK_IN, META_EVENT_REGISTER } from '@/lib/meta-pixel'
import { trackMetaEvent } from '@/lib/meta-pixel-client'
import type {
  CheckInResult,
  LookupResult,
  RegisterResult,
  TierItem,
  TierUnlockedInfo,
  NextTierInfo,
} from '@/components/features/check-in/CheckInForm.types'

interface Referido {
  codigo: string
  nombre: string
  beneficio: string | null
  dias: number
}

type Exito =
  | null
  | {
      type: 'welcome' | 'welcome_back' | 'points_earned' | 'tier_unlocked'
      customerName: string
      totalVisits: number
      totalPoints?: number
      pointsAwarded?: number
      reward?: CheckInResult['reward']
      tierUnlocked?: TierUnlockedInfo | null
      nextTier?: NextTierInfo | null
      tiers?: TierItem[]
      phone: string
    }

export default function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const branding = useBranding()
  /** `undefined` = cargando · `null` = sin referido (la landing de siempre) · el referido. */
  const [referido, setReferido] = useState<Referido | null | undefined>(undefined)
  const [exito, setExito] = useState<Exito>(null)

  useEffect(() => {
    fetch(`/api/referral/${encodeURIComponent(code)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as Referido) : null))
      .then(setReferido)
      .catch(() => setReferido(null))
  }, [code])

  const handleLookup = useCallback((result: LookupResult) => {
    // Ya es cliente: el regalo es para amigos nuevos. Se le dice sin drama y sigue a su tarjeta.
    if (result.referral_status === 'ya_cliente') {
      toast.info('Ya eres parte del club: este regalo es para amigos que llegan por primera vez.')
    }
  }, [])

  const handleRegisterSuccess = useCallback((result: RegisterResult, phone: string) => {
    // Superficie 'check-in': es el mismo formulario de registro; el píxel no distingue por qué
    // enlace llegó la persona (y no debe: no viaja ningún dato personal).
    trackMetaEvent(META_EVENT_REGISTER, 'check-in', result.meta_event_id)
    setExito({
      type: 'welcome',
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
      totalPoints: result.customer.total_points ?? 0,
      pointsAwarded: result.points_awarded ?? 0,
      tiers: (result as unknown as CheckInResult).tiers,
      phone,
    })
  }, [])

  const handleCheckInSuccess = useCallback((result: CheckInResult, phone: string) => {
    if (result.message !== 'duplicate') trackMetaEvent(META_EVENT_CHECK_IN, 'check-in', result.meta_event_id)
    setExito({
      type: result.message === 'tier_unlocked' ? 'tier_unlocked' : result.message === 'points_earned' ? 'points_earned' : 'welcome_back',
      customerName: result.customer.name,
      totalVisits: result.customer.total_visits,
      totalPoints: result.customer.total_points ?? 0,
      pointsAwarded: result.points_awarded ?? 0,
      reward: result.reward,
      tierUnlocked: result.tier_unlocked ?? null,
      nextTier: result.next_tier ?? null,
      tiers: result.tiers,
      phone,
    })
  }, [])

  const handleError = useCallback((message: string) => toast.error(message), [])

  const mesero = branding.staffLabel?.toLowerCase() ?? 'mesero'

  return (
    <div className="premium-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div
        className="animate-aurora-a pointer-events-none absolute -top-28 -right-28 h-[420px] w-[420px] rounded-full opacity-[0.10]"
        style={{ background: `radial-gradient(circle, ${branding.primary} 0%, transparent 70%)` }}
      />
      <div
        className="animate-aurora-b pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full opacity-[0.09]"
        style={{ background: `radial-gradient(circle, ${branding.primaryEnd} 0%, transparent 70%)` }}
      />

      <Toaster position="top-center" richColors />

      <div className="animate-fade-in-up relative z-10 mb-5 flex flex-col items-center gap-3 text-center">
        <BrandMark size={56} />
        <div>
          <h1 className="font-playfair text-2xl font-bold" style={{ color: 'var(--brand-ink)', letterSpacing: '-0.02em' }}>
            {branding.name}
          </h1>
          {!referido && (
            <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--brand-ink-muted)' }}>
              Programa de fidelidad
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md space-y-4">
        {referido === undefined && (
          <p className="text-center text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
            Cargando tu invitación…
          </p>
        )}

        {exito && (
          <CheckInSuccess
            type={exito.type}
            customerName={exito.customerName}
            totalVisits={exito.totalVisits}
            totalPoints={exito.totalPoints}
            pointsAwarded={exito.pointsAwarded}
            reward={exito.reward ?? null}
            tierUnlocked={exito.type === 'tier_unlocked' ? exito.tierUnlocked : undefined}
            nextTier={exito.type === 'points_earned' || exito.type === 'tier_unlocked' ? exito.nextTier : undefined}
            tiers={exito.tiers}
            customerPhone={exito.phone}
            onReset={() => setExito(null)}
          />
        )}

        {!exito && referido && (
          <>
            {/* El regalo, como héroe: el nombre del amigo es lo que hace que se abra el enlace. */}
            <div
              className="animate-fade-in-up rounded-2xl p-5 text-center text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, ${branding.primary}, ${branding.primaryEnd})` }}
            >
              <Gift className="mx-auto h-9 w-9 opacity-90" />
              {referido.beneficio ? (
                <>
                  <p className="mt-2 text-xs font-medium uppercase tracking-widest opacity-80">{referido.nombre} te regaló</p>
                  <p className="font-playfair mt-1 text-2xl font-bold leading-tight">{referido.beneficio} 🎁</p>
                </>
              ) : (
                <p className="font-playfair mt-2 text-2xl font-bold leading-tight">
                  {referido.nombre} te invitó a {branding.name}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs opacity-85">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {referido.dias} días para venir
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Los dos ganan cuando vengas
                </span>
              </div>
            </div>

            <p className="text-center text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
              Regístrate con tu celular.{' '}
              {referido.beneficio
                ? `Tu regalo queda en tu tarjeta y lo reclamas cuando vengas: el ${mesero} lo activa al escanearte.`
                : `Cuando vengas, el ${mesero} te escanea y empiezas a sumar.`}
            </p>
            <CheckInForm
              referralCode={referido.codigo}
              onLookupResult={handleLookup}
              onRegisterSuccess={handleRegisterSuccess}
              onCheckInSuccess={handleCheckInSuccess}
              onError={handleError}
            />
          </>
        )}

        {/* Sin referido (código que no existe, de otra marca, programa apagado o la base que no
            contestó): la landing de siempre, sin error. */}
        {!exito && referido === null && (
          <CheckInForm
            onLookupResult={() => {}}
            onRegisterSuccess={handleRegisterSuccess}
            onCheckInSuccess={handleCheckInSuccess}
            onError={handleError}
          />
        )}
      </div>
    </div>
  )
}
