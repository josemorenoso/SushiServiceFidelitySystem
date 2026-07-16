'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, ExternalLink, Gift, Heart, Clock } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import { expiryLabel } from '@/lib/format/grant-expiry'

interface GoogleReviewModalProps {
  phone: string
  customerName: string
  /** null = el dueño no configuró recompensa. El modal sale igual, sin prometer nada. */
  rewardTitle: string | null
  googleUrl: string
  onDismiss: () => void
}

type Phase = 'offer' | 'steps' | 'waiting' | 'thanks'

interface ReviewActionResponse {
  ok: boolean
  prize_title?: string | null
  expires_at?: string | null
}

/**
 * Pop-up de reseña de Google (R6).
 *
 * **NO tiene X. No se cierra al tocar fuera. No se cierra con Escape.** El modal viejo la
 * tenía y la gente lo cerraba por reflejo a los 2 segundos, sin leerlo. La única salida es
 * un botón explícito ("La próxima lo hago"), que exige una decisión consciente.
 *
 * Cuatro fases:
 *   OFERTA → PASOS → ESPERA → GRACIAS
 *
 * La fase GRACIAS se dispara con `visibilitychange`, cuando el cliente VUELVE a la pestaña
 * (R6.c) — no al tocar el botón. Decirle "gracias por tu reseña" a alguien que todavía no la
 * ha escrito sería mentirle.
 *
 * Ref: docs/features/review-flow.md
 */
export function GoogleReviewModal({
  phone,
  customerName,
  rewardTitle,
  googleUrl,
  onDismiss,
}: GoogleReviewModalProps) {
  const branding = useBranding()
  const [phase, setPhase] = useState<Phase>('offer')
  const [grantedPrize, setGrantedPrize] = useState<string | null>(null)
  const [grantExpiry, setGrantExpiry] = useState<string | null>(null)

  const firstName = customerName.split(' ')[0]
  const staff = branding.staffLabel.toLowerCase()

  // El cliente volvió de Google → pantalla de agradecimiento (R6.c).
  useEffect(() => {
    if (phase !== 'waiting') return

    const onVisible = () => {
      if (document.visibilityState === 'visible') setPhase('thanks')
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [phase])

  const handlePostpone = useCallback(() => {
    // Fire-and-forget: no se le hace esperar a nadie para decir "ahora no".
    fetch('/api/check-in/review-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, action: 'postponed' }),
    }).catch((err) => console.error('[GoogleReviewModal] Error registrando el aplazamiento:', err))
    onDismiss()
  }, [phone, onDismiss])

  /**
   * El click al link de Google.
   *
   * CRÍTICO: el POST NO se espera (`await`) antes de navegar. El CTA es un `<a target="_blank">`
   * de verdad, y la navegación ocurre en el gesto del usuario. Si abriéramos la pestaña con
   * `window.open()` DESPUÉS de un await, Safari en iOS lo trataría como un pop-up no solicitado
   * y lo bloquearía — el cliente tocaría "Ir a Google" y no pasaría nada.
   */
  const handleReviewClick = useCallback(() => {
    setPhase('waiting')

    fetch('/api/check-in/review-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, action: 'clicked' }),
    })
      .then((res) => res.json())
      .then((data: ReviewActionResponse) => {
        if (data.ok) {
          setGrantedPrize(data.prize_title ?? null)
          setGrantExpiry(data.expires_at ?? null)
        }
      })
      .catch((err) => console.error('[GoogleReviewModal] Error registrando el click:', err))
  }, [phone])

  // Teaser en OFERTA/PASOS: antes del click no hay grant, así que se muestra la recompensa
  // configurada (`rewardTitle`). En la fase GRACIAS, en cambio, se usa `grantedPrize` (lo que
  // el servidor REALMENTE otorgó): si el grant falló, no se promete un regalo inexistente.
  const prize = grantedPrize ?? rewardTitle
  const expiry = expiryLabel(grantExpiry)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 17, 18, 0.72)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      <div className="premium-card animate-fade-in-up w-full max-w-sm overflow-hidden p-0">
        {/* ─── Cabecera ─── */}
        <div className="px-6 pt-7 pb-4 text-center">
          <div className="mb-3 flex justify-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                background:
                  phase === 'thanks'
                    ? 'linear-gradient(135deg, #34d399 0%, #059669 100%)'
                    : 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                boxShadow:
                  phase === 'thanks'
                    ? '0 8px 24px rgba(5, 150, 105, 0.3)'
                    : '0 8px 24px rgba(230, 57, 70, 0.3)',
              }}
            >
              {phase === 'thanks' ? (
                <Heart className="h-6 w-6 text-white" strokeWidth={1.5} />
              ) : prize ? (
                <Gift className="h-6 w-6 text-white" strokeWidth={1.5} />
              ) : (
                <Star className="h-6 w-6 text-white" strokeWidth={1.5} />
              )}
            </div>
          </div>

          {phase === 'thanks' ? (
            <>
              <h3
                id="review-modal-title"
                className="font-playfair text-xl font-bold"
                style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
              >
                ¡Gracias por dejarnos tus comentarios!
              </h3>
              <p className="mt-1.5 text-sm" style={{ color: '#9ca3af' }}>
                Te esperamos de regreso, {firstName} 💚
              </p>
            </>
          ) : (
            <>
              <h3
                id="review-modal-title"
                className="font-playfair text-xl font-bold leading-snug"
                style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
              >
                {prize ? (
                  <>
                    {firstName}, gánate{' '}
                    <span style={{ color: '#E63946' }}>{prize}</span> por dejarnos una reseña
                    en Google
                  </>
                ) : (
                  <>{firstName}, ¿nos regalas una reseña en Google?</>
                )}
              </h3>
              <p className="mt-1.5 text-sm" style={{ color: '#9ca3af' }}>
                {prize
                  ? `Te toma menos de 1 minuto y tu regalo te espera aquí mismo.`
                  : `Tu opinión ayuda a que más personas conozcan ${branding.name}. Toma menos de 1 minuto.`}
              </p>
            </>
          )}
        </div>

        {/* ─── Cuerpo ─── */}
        <div className="px-6 pb-6">
          {phase === 'offer' && (
            <>
              <button
                onClick={() => setPhase('steps')}
                className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                  boxShadow: '0 8px 24px rgba(230, 57, 70, 0.3)',
                }}
              >
                <Star className="h-4 w-4" strokeWidth={2} />
                Dejar reseña
              </button>

              {/* La ÚNICA salida. Es un botón, no una X: exige una decisión consciente. */}
              <button
                onClick={handlePostpone}
                className="mt-3 w-full rounded-xl py-3 text-sm font-medium transition-colors duration-200"
                style={{ color: '#9ca3af' }}
              >
                La próxima lo hago
              </button>
            </>
          )}

          {phase === 'steps' && (
            <>
              <div
                className="rounded-xl px-4 py-4"
                style={{ background: 'rgba(249, 250, 251, 0.9)', border: '1px dashed rgba(156, 163, 175, 0.35)' }}
              >
                <div className="flex gap-3">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: '#E63946' }}
                  >
                    1
                  </div>
                  <p className="text-sm leading-snug" style={{ color: '#4b5563' }}>
                    Escribe tu reseña y <span className="font-semibold">muéstrasela al {staff}</span>
                  </p>
                </div>
                <div className="mt-3 flex gap-3">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: '#E63946' }}
                  >
                    2
                  </div>
                  <p className="text-sm leading-snug" style={{ color: '#4b5563' }}>
                    {prize ? (
                      <>
                        <span className="font-semibold">Redime tu regalo:</span> {prize}
                      </>
                    ) : (
                      <span className="font-semibold">Redime tu regalo</span>
                    )}
                  </p>
                </div>
              </div>

              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleReviewClick}
                className="mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                  boxShadow: '0 8px 24px rgba(230, 57, 70, 0.3)',
                }}
              >
                <ExternalLink className="h-4 w-4" strokeWidth={2} />
                Ir a Google y escribir mi reseña
              </a>

              <button
                onClick={handlePostpone}
                className="mt-3 w-full rounded-xl py-3 text-sm font-medium transition-colors duration-200"
                style={{ color: '#9ca3af' }}
              >
                La próxima lo hago
              </button>
            </>
          )}

          {phase === 'waiting' && (
            <div
              className="rounded-xl px-4 py-5 text-center"
              style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.25)' }}
            >
              <p className="text-sm font-semibold" style={{ color: '#065f46' }}>
                Termina tu reseña en Google Maps
              </p>
              <p className="mt-1 text-xs" style={{ color: '#059669' }}>
                Cuando vuelvas, te esperamos aquí 👋
              </p>
            </div>
          )}

          {phase === 'thanks' && (
            <>
              {/* Solo se promete un regalo si el servidor lo otorgó de verdad (`grantedPrize`).
                  Con el teaser `prize` se mostraría "Tu regalo: X" aun cuando el grant falló. */}
              {grantedPrize && (
                <div
                  className="rounded-xl px-4 py-4 text-center"
                  style={{ background: 'rgba(251, 191, 36, 0.14)', border: '1px solid rgba(251, 191, 36, 0.4)' }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#b45309' }}>
                    Tu regalo
                  </p>
                  <p className="mt-1 text-base font-bold" style={{ color: '#92400e' }}>
                    {grantedPrize}
                  </p>
                  {expiry && (
                    <p
                      className="mt-1.5 flex items-center justify-center gap-1 text-xs font-semibold"
                      style={{ color: '#b45309' }}
                    >
                      <Clock className="h-3 w-3" strokeWidth={2.5} />
                      {expiry}
                    </p>
                  )}
                  <p className="mt-2 text-[11px]" style={{ color: '#a16207' }}>
                    Muéstrale tu reseña al {staff} para reclamarlo
                  </p>
                </div>
              )}

              <button
                onClick={onDismiss}
                className="mt-4 flex h-[52px] w-full items-center justify-center rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
                  boxShadow: '0 8px 24px rgba(5, 150, 105, 0.28)',
                }}
              >
                Listo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
