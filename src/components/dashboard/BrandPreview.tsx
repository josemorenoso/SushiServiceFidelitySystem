'use client'

/**
 * Vista previa en vivo de la identidad visual (§5/§6).
 *
 * Es lo que convierte "elegí un hex" en una decisión que el dueño de un
 * restaurante puede tomar: ve su pantalla y su tarjeta cambiar mientras mueve el
 * selector, antes de guardar nada.
 *
 * DE DÓNDE SALEN LOS COLORES, Y POR QUÉ IMPORTA
 * ─────────────────────────────────────────────
 * De las MISMAS funciones que el producto real: `resolveBranding()` para la
 * marca y `brandWalletCardTheme()` para la tarjeta. La página de arriba arma un
 * `TenantConfig` de mentira con lo que el dueño está tocando y lo pasa por el
 * resolver de verdad. Así la vista previa no puede desincronizarse de la
 * pantalla real por un color que alguien copió a mano.
 *
 * LO QUE SÍ ES UNA MAQUETA. El LAYOUT de las dos pantallas está condensado para
 * caber en el marco del teléfono: `WalletCard` mide `min-h-screen` y `CheckInForm`
 * habla con tres endpoints, así que ninguno de los dos se puede montar acá tal
 * cual. Los componentes que sí se reutilizan enteros son `BrandMark` y
 * `StampsGrid` — y las clases premium (`.premium-card`, `.btn-premium`,
 * `.input-premium`) son las de verdad, leyendo las variables `--brand-*` que
 * este mismo componente estampa. Es decir: se previsualizan colores y marca, no
 * la posición exacta de cada texto.
 */

import { Phone } from 'lucide-react'
import { BrandingProvider } from '@/lib/branding-context'
import { brandCssVars } from '@/lib/brand-css'
import type { Branding } from '@/lib/branding'
import { brandWalletCardTheme } from '@/constants/wallet-card-theme'
import { StampsGrid } from '@/components/features/wallet'
import { BrandMark } from '@/components/features/branding'

export type PreviewScreen = 'checkin' | 'card'

interface BrandPreviewProps {
  branding: Branding
  screen: PreviewScreen
}

/** Datos de muestra. Un cliente a mitad de camino: se ven sellos llenos y vacíos. */
const SAMPLE = {
  name: 'María',
  points: 340,
  visits: 7,
  nextThreshold: 500,
  nextReward: 'Postre de la casa',
}

export function BrandPreview({ branding, screen }: BrandPreviewProps) {
  const theme = brandWalletCardTheme(branding)
  const progress = Math.min((SAMPLE.points / SAMPLE.nextThreshold) * 100, 100)

  return (
    <BrandingProvider value={branding}>
      {/* Marco del teléfono. Las variables `--brand-*` se estampan acá y cascadean
          a todo lo de adentro, así las clases premium reales pintan con el color
          que el dueño está probando sin tocar el resto del panel. */}
      <div
        className="mx-auto w-[300px] rounded-[2.25rem] p-2.5 shadow-2xl"
        style={{ background: '#1a1c1d', ...brandCssVars(branding) }}
      >
        <div className="relative overflow-hidden rounded-[1.75rem]" style={{ height: 560 }}>
          {/* Notch */}
          <div className="absolute left-1/2 top-0 z-20 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#1a1c1d]" />

          {screen === 'checkin' ? <CheckInPreview /> : <CardPreview branding={branding} theme={theme} progress={progress} />}
        </div>
      </div>
    </BrandingProvider>
  )
}

/** Pantalla 1 — ingreso de celular. La "piel" sale de las clases premium reales. */
function CheckInPreview() {
  return (
    <div className="premium-bg h-full overflow-y-auto px-4 pb-4 pt-9">
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <BrandMark size={44} />
        <div>
          <p
            className="font-playfair text-lg font-bold leading-tight"
            style={{ color: 'var(--brand-ink)', letterSpacing: '-0.02em' }}
          >
            Tu Restaurante
          </p>
          <p className="text-[10px] font-medium" style={{ color: 'var(--brand-ink-muted)' }}>
            Programa de fidelidad
          </p>
        </div>
      </div>

      <div className="premium-card p-5">
        <div className="mb-4 text-center">
          <p
            className="font-playfair text-lg font-bold"
            style={{ color: 'var(--brand-ink)', letterSpacing: '-0.02em' }}
          >
            Bienvenido
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--brand-ink-muted)' }}>
            Ingresa tu número de celular para continuar
          </p>
        </div>

        <p
          className="mb-1.5 text-[9px] font-semibold uppercase"
          style={{ color: 'var(--brand-ink-soft)', letterSpacing: '0.05em' }}
        >
          Número de celular
        </p>
        <div className="input-premium relative flex items-center rounded-xl py-2.5 pl-8 pr-3">
          <Phone
            className="absolute left-2.5 h-3.5 w-3.5"
            strokeWidth={1.5}
            style={{ color: 'var(--brand-ink-muted)' }}
          />
          <span className="text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
            3001234567
          </span>
        </div>

        <div className="btn-premium mt-3 flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold">
          Continuar
        </div>
      </div>
    </div>
  )
}

/** Pantalla 2 — la tarjeta del cliente recurrente. */
function CardPreview({
  branding,
  theme,
  progress,
}: {
  branding: Branding
  theme: ReturnType<typeof brandWalletCardTheme>
  progress: number
}) {
  return (
    <div
      className="h-full overflow-y-auto px-3 pb-4 pt-8"
      style={{ background: theme.pageBg }}
    >
      <div
        className="flex flex-col items-center px-4 pb-6 pt-5"
        style={{
          background: theme.cardBg,
          borderRadius: '1.5rem',
          border: theme.cardBorder,
          boxShadow: theme.cardShadow,
        }}
      >
        <BrandMark variant="onColor" size={44} className="mb-2.5" />

        <p
          className="text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ color: theme.brand }}
        >
          {branding.name}
        </p>
        <p className="mt-0.5 text-[9px] tracking-wide" style={{ color: theme.subtitle }}>
          Tarjeta de Fidelidad
        </p>

        <p
          className="mt-2 font-playfair text-2xl font-bold leading-tight"
          style={{ color: theme.name }}
        >
          {SAMPLE.name}
        </p>

        <div className="mt-1.5 flex items-end gap-1.5">
          <span className="text-4xl font-bold leading-none" style={{ color: theme.points }}>
            {SAMPLE.points}
          </span>
          <span className="mb-0.5 text-base" style={{ color: theme.pointsUnit }}>pts</span>
        </div>

        <div className="mt-4 w-full">
          <StampsGrid totalVisits={SAMPLE.visits} theme={theme.stamps} />
        </div>

        <div className="mt-3 w-full">
          <div className="relative h-6 overflow-hidden rounded-full" style={{ background: theme.barTrack }}>
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progress}%`, background: theme.barFill }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-[10px] font-bold"
                style={{ color: theme.barLabel, textShadow: theme.barLabelShadow }}
              >
                {SAMPLE.points} / {SAMPLE.nextThreshold} pts
              </span>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[9px]" style={{ color: theme.hint }}>
            Faltan{' '}
            <span className="font-semibold" style={{ color: theme.hintStrong }}>
              {SAMPLE.nextThreshold - SAMPLE.points} pts
            </span>{' '}
            para {SAMPLE.nextReward}
          </p>
        </div>

        <div className="mt-4 w-full" style={{ height: '1px', background: theme.divider }} />

        <div
          className="mt-4 w-full rounded-xl px-3 py-2.5 text-center"
          style={{ background: theme.ctaBg, border: theme.ctaBorder }}
        >
          <p className="text-[10px]" style={{ color: theme.ctaLabel }}>¿Estás en el restaurante?</p>
          <p className="mt-0.5 text-[10px] font-bold" style={{ color: theme.ctaLink }}>
            Escanea el QR en mesa →
          </p>
        </div>
      </div>
    </div>
  )
}
