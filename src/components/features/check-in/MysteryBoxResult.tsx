'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Gift, Dices } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import { Confetti } from '@/components/ui/confetti'
import { GOLD, GOLD_BRIGHT } from '@/constants/wallet-card-theme'
import type { MysteryPrizeDisplay } from './CheckInSuccess.types'

/**
 * El resultado de la Mystery Box: el único momento del sistema con carga
 * emocional real, y el que la gente graba y manda al grupo de WhatsApp.
 *
 * CAPA VISUAL v3 (2026-09-07). Cambió cómo se ve, NO cómo funciona: las mismas
 * tres fases (`rolling` → `reveal` → `done`), los mismos tiempos, el mismo
 * premio — que ya viene decidido del servidor, esta pantalla solo lo muestra.
 *
 *   - **Confeti al revelar.** Una ráfaga, una sola vez, en el color de la marca.
 *   - **El violeta y el rosa se fueron.** `#7c3aed → #db2777` no eran de ninguna
 *     marca: eran dos hex horneados en una pantalla pública, o sea un color que
 *     ningún restaurante podía cambiar. Ahora la caja normal va en el color del
 *     tenant.
 *   - **La Golden Box usa el dorado DEL SISTEMA** (`GOLD`/`GOLD_BRIGHT`, el
 *     mismo de la tarjeta Black), no un ámbar propio. Dos dorados parecidos pero
 *     distintos en el mismo producto es lo que hace que algo se vea armado a
 *     pedazos.
 *   - **El 🎲 del dado sale.** Lo dibuja el sistema operativo; el ícono de la
 *     casa gira igual y se ve igual en todos los teléfonos. Los emojis de los
 *     PREMIOS se quedan: esos los configura el restaurante, son su contenido.
 *
 * ⚠️ Sobre los textos de dorado: en el fondo blanco de la tarjeta el título va
 * en `--brand-ink`, no en oro. El oro sobre blanco no llega al contraste mínimo,
 * así que se queda donde sí se lee — el aro, la insignia y el confeti.
 */

interface MysteryBoxResultProps {
  prizeTitle: string
  prizeEmoji: string
  wasGolden: boolean
  nearMiss: string | null
  allPrizes: MysteryPrizeDisplay[]
  /** Auditoría 12-Julio: si el WhatsApp de confirmación falló, mostrar fallback visual. */
  whatsappSent?: boolean
}

export function MysteryBoxResult({
  prizeTitle,
  prizeEmoji,
  wasGolden,
  nearMiss,
  allPrizes,
  whatsappSent = true,
}: MysteryBoxResultProps) {
  const branding = useBranding()
  const [phase, setPhase] = useState<'rolling' | 'reveal' | 'done'>('rolling')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 1800)
    const t2 = setTimeout(() => setPhase('done'), 2600)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const gradientBg = wasGolden
    ? `linear-gradient(135deg, ${GOLD_BRIGHT} 0%, ${GOLD} 100%)`
    : `linear-gradient(135deg, ${branding.primary} 0%, ${branding.primaryEnd} 100%)`

  const ringShadow = wasGolden
    ? `0 8px 32px ${GOLD}66`
    : `0 8px 32px rgba(var(--brand-primary-end-rgb), 0.38)`

  const confettiColors = wasGolden
    ? [GOLD, GOLD_BRIGHT, '#ffffff', branding.primary]
    : [branding.primary, branding.primaryEnd, '#ffffff', GOLD_BRIGHT]

  return (
    <div className="animate-fade-in-up w-full space-y-4">
      <div className="premium-card p-7 text-center overflow-hidden relative">
        {wasGolden && (
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, ${GOLD} 0, ${GOLD} 1px, transparent 0, transparent 50%)`,
              backgroundSize: '10px 10px',
            }}
          />
        )}

        {/* Una ráfaga, al revelar. Se apaga sola. */}
        <Confetti fire={phase !== 'rolling'} colors={confettiColors} originY={0.35} />

        <div className="relative">
          <div className="flex justify-center mb-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: gradientBg, boxShadow: ringShadow }}
            >
              {phase === 'rolling' ? (
                <Dices
                  className="h-7 w-7 text-white animate-spin"
                  strokeWidth={1.5}
                  style={{ animationDuration: '0.6s' }}
                />
              ) : (
                <Sparkles className="h-7 w-7 text-white" strokeWidth={1.5} />
              )}
            </div>
          </div>

          {phase === 'rolling' && (
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--brand-ink-soft)' }}>
                {wasGolden ? 'Abriendo Golden Box...' : 'Abriendo Mystery Box...'}
              </p>
              <div className="flex justify-center gap-2 mt-3">
                {allPrizes.map((p, i) => (
                  <span
                    key={i}
                    className="text-2xl animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  >
                    {p.emoji}
                  </span>
                ))}
              </div>
            </div>
          )}

          {phase !== 'rolling' && (
            <div className="animate-fade-in-up">
              {wasGolden && (
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-2 inline-block rounded-full px-2.5 py-1"
                  style={{ background: `${GOLD}1f`, color: 'var(--brand-ink)' }}
                >
                  Golden Box
                </p>
              )}
              <p className="text-4xl mb-2">{prizeEmoji}</p>
              <h3
                className="font-playfair text-2xl font-bold"
                style={{
                  color: wasGolden ? 'var(--brand-ink)' : branding.stampCheck,
                  letterSpacing: '-0.02em',
                }}
              >
                {prizeTitle}
              </h3>

              {nearMiss && phase === 'done' && (
                <p
                  className="mt-2 text-xs font-medium animate-fade-in-up"
                  style={{ color: 'var(--brand-ink-soft)' }}
                >
                  {nearMiss}
                </p>
              )}

              {phase === 'done' && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Gift
                    className="h-4 w-4"
                    style={{ color: branding.primaryEnd }}
                    strokeWidth={1.5}
                  />
                  <p className="text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
                    Mostrále este mensaje al {branding.staffLabel.toLowerCase()} para reclamar
                  </p>
                </div>
              )}

              {phase === 'done' && !whatsappSent && (
                <p
                  className="mt-3 rounded-lg px-3 py-2 text-xs font-medium animate-fade-in-up"
                  style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--brand-ink)' }}
                >
                  ⚠️ No pudimos enviarte el WhatsApp. Esta pantalla es tu comprobante: mostrásela al {branding.staffLabel.toLowerCase()} para reclamar tu premio.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
