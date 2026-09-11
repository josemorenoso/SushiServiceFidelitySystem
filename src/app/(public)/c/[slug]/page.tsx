'use client'

/**
 * Landing de una invitación con premio — `/c/{slug}`.
 *
 * Doc: docs/features/invite-campaigns.md
 *
 * Quien llega acá abrió un enlace que el restaurante mandó por WhatsApp o puso en
 * redes. Ve el premio como héroe y el mismo formulario de registro de siempre, con
 * el `campaignSlug` puesto: al registrarse, el premio le queda en la tarjeta y la
 * visita #1 se la cuenta el mesero cuando lo escanee en el local.
 *
 * Todo el color sale de `--brand-*`: ningún hex horneado (§5).
 */

import { use, useCallback, useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { Gift, Clock, Users } from 'lucide-react'
import { CheckInForm } from '@/components/features/check-in'
import { BrandMark } from '@/components/features/branding'
import { useBranding } from '@/lib/branding-context'
import { META_EVENT_REGISTER } from '@/lib/meta-pixel'
import { trackMetaEvent } from '@/lib/meta-pixel-client'
import type { RegisterResult } from '@/components/features/check-in/CheckInForm.types'

interface Invite {
  slug: string
  name: string
  reward_title: string
  reward_description: string | null
  window_days: number | null
  ends_at: string | null
  availability: { ok: true } | { ok: false; reason: 'inactive' | 'not_started' | 'ended' | 'sold_out' }
  remaining: number | null
}

const MOTIVO: Record<string, string> = {
  inactive: 'Esta invitación ya no está activa.',
  not_started: 'Esta invitación todavía no empieza.',
  ended: 'Esta invitación ya venció.',
  sold_out: 'Se agotaron los cupos de esta invitación.',
}

export default function InviteLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const branding = useBranding()
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined)

  useEffect(() => {
    fetch(`/api/invite/${encodeURIComponent(slug)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as Invite) : null))
      .then(setInvite)
      .catch(() => setInvite(null))
  }, [slug])

  const handleRegisterSuccess = useCallback((result: RegisterResult) => {
    // Superficie 'check-in': es el mismo formulario de registro; el pixel no distingue
    // por que enlace llego la persona (y no debe: no viaja ningun dato personal).
    trackMetaEvent(META_EVENT_REGISTER, 'check-in', result.meta_event_id)
  }, [])

  const handleError = useCallback((message: string) => toast.error(message), [])

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
        <h1 className="font-playfair text-2xl font-bold" style={{ color: 'var(--brand-ink)', letterSpacing: '-0.02em' }}>
          {branding.name}
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-md space-y-4">
        {invite === undefined && (
          <p className="text-center text-sm" style={{ color: 'var(--brand-ink-muted)' }}>Cargando tu invitación…</p>
        )}

        {invite === null && (
          <div className="rounded-2xl border p-5 text-center" style={{ borderColor: 'var(--brand-ink-faint)', background: 'var(--brand-surface)' }}>
            <p className="font-semibold" style={{ color: 'var(--brand-ink)' }}>No encontramos esta invitación.</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
              Revisá el enlace o escaneá el código QR en el local para registrarte.
            </p>
          </div>
        )}

        {invite && (
          <>
            {/* El premio, como héroe */}
            <div
              className="animate-fade-in-up rounded-2xl p-5 text-center text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, ${branding.primary}, ${branding.primaryEnd})` }}
            >
              <Gift className="mx-auto h-9 w-9 opacity-90" />
              <p className="mt-2 text-xs font-medium uppercase tracking-widest opacity-80">Te regalamos</p>
              <p className="font-playfair mt-1 text-2xl font-bold leading-tight">{invite.reward_title}</p>
              {invite.reward_description && (
                <p className="mt-2 text-sm opacity-90">{invite.reward_description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs opacity-85">
                {invite.window_days !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {invite.window_days} días para reclamarlo
                  </span>
                )}
                {invite.remaining !== null && invite.availability.ok && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Quedan {invite.remaining}
                  </span>
                )}
              </div>
            </div>

            {invite.availability.ok ? (
              <>
                <p className="text-center text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
                  Registrate con tu celular. El premio queda en tu tarjeta y lo reclamás cuando
                  vengas: el {branding.staffLabel?.toLowerCase() ?? 'mesero'} lo activa al escanearte.
                </p>
                <CheckInForm
                  campaignSlug={invite.slug}
                  onLookupResult={() => {}}
                  onRegisterSuccess={handleRegisterSuccess}
                  onCheckInSuccess={() => {}}
                  onError={handleError}
                />
              </>
            ) : (
              <div className="rounded-2xl border p-5 text-center" style={{ borderColor: 'var(--brand-ink-faint)', background: 'var(--brand-surface)' }}>
                <p className="font-semibold" style={{ color: 'var(--brand-ink)' }}>
                  {MOTIVO[invite.availability.reason]}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
                  Igual podés registrarte en el programa escaneando el código QR en el local.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
