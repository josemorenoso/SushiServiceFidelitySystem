'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ScanLine, Loader2, PartyPopper } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useBranding } from '@/lib/branding-context'
import { StampsGrid, CardMotif, CardExtras } from '@/components/features/wallet'
import { BrandMark } from '@/components/features/branding'
import { Odometer } from '@/components/ui/odometer'
import { ShineBorder } from '@/components/ui/shine-border'
import { brandWalletCardTheme } from '@/constants/wallet-card-theme'
import { AvailableRewardBanner, type ActiveGrant } from './AvailableRewardBanner'
import { QrCountdown } from './QrCountdown'

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}

interface CustomerCardProps {
  name: string
  totalPoints: number
  totalVisits: number
  qrUrl: string
  tiers: TierItem[]
  checkingStatus: boolean
  justEarnedPoints: number | null
  /** Premios otorgados y sin reclamar (migración 00031). */
  activeGrants?: ActiveGrant[]
  onBack: () => void
}

export function CustomerCard({
  name,
  totalPoints,
  totalVisits,
  qrUrl,
  tiers,
  checkingStatus,
  justEarnedPoints,
  activeGrants = [],
  onBack,
}: CustomerCardProps) {
  const branding = useBranding()
  // Misma paleta que la tarjeta permanente de `/tarjeta`. Antes esta pantalla
  // llamaba a `StampsGrid` sin tema y se quedaba con el ✓ rojo del sistema de
  // diseño aunque el tenant tuviera otro color (§5).
  const theme = brandWalletCardTheme(branding)
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold) ?? null
  const nextThreshold = nextTier?.point_threshold ?? totalPoints
  const remaining = nextTier ? Math.max(nextThreshold - totalPoints, 0) : 0
  const progressPercent = nextTier
    ? Math.min((totalPoints / nextThreshold) * 100, 100)
    : 100

  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(progressPercent), 200)
    return () => clearTimeout(t)
  }, [progressPercent])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center py-6 px-4"
      style={{ background: branding.pageBg }}
    >
      {/* Overlay de dopamina */}
      {justEarnedPoints != null && justEarnedPoints > 0 && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}
        >
          <PartyPopper className="h-16 w-16 text-white animate-pulse" strokeWidth={1.5} />
          <p className="mt-3 font-playfair text-4xl font-bold text-white">¡Listo!</p>
          <p className="mt-1 text-6xl font-bold text-white animate-fade-in-up">
            +{justEarnedPoints}
          </p>
          <p className="text-lg text-white/90">puntos</p>
        </div>
      )}

      {/* Card. Los colores salen del MISMO tema que `/tarjeta`. Antes estaban
          copiados a mano acá y las dos pantallas se iban separando solas. */}
      <ShineBorder
        gradient={theme.shine}
        radius={32}
        className="w-full max-w-sm animate-fade-in-up"
        style={{ boxShadow: theme.cardShadow }}
      >
        <div
          className="relative isolate px-5 pt-7 pb-8 flex flex-col items-center"
          style={{
            background: theme.cardBg,
            borderRadius: 'inherit',
            border: theme.cardBorder,
            overflow: 'hidden',
          }}
        >
          {/* Decoración de contorno (Tarjeta principal), debajo de todo. */}
          <CardMotif id={branding.card.motif} />

          {/* Brand */}
          <BrandMark variant="onColor" size={52} className="mb-3" />
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/50">
            {branding.name}
          </p>

          {/* Name */}
          <h1 className="mt-1 font-playfair text-3xl font-bold text-white text-center">
            ¡Hola, {name}!
          </h1>

          {/* Puntos: ruedan al entrar (regla 04 del kit visual). */}
          <div className="mt-3 flex items-end justify-center gap-2">
            <Odometer
              value={totalPoints}
              ariaLabel={`${totalPoints} puntos`}
              className="text-5xl font-bold"
              style={{ color: theme.points, textShadow: theme.pointsShadow }}
            />
            <span className="text-white/60 text-xl mb-0.5">pts</span>
          </div>

          {/* Stamps */}
          <div className="mt-5 w-full">
            <StampsGrid totalVisits={totalVisits} theme={theme.stamps} icon={branding.card.stampIcon} />
          </div>

          {/* Points progress bar */}
          <div className="mt-4 w-full">
            <div
              className="relative h-7 rounded-full overflow-hidden"
              style={{ background: theme.barTrack }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full overflow-hidden transition-all duration-1000 ease-out"
                style={{
                  width: `${barWidth}%`,
                  background: theme.barFill,
                  boxShadow: theme.barFillGlow,
                }}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-full animate-bar-sweep"
                  style={{ background: theme.barSweep }}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-xs font-bold text-white"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
                >
                  {totalPoints}{nextTier ? ` / ${nextThreshold}` : ''} pts
                </span>
              </div>
            </div>
            {nextTier && (
              <p className="text-[11px] text-white/50 mt-1.5 text-center">
                Faltan{' '}
                <span className="text-white/75 font-semibold">{remaining} pts</span>{' '}
                para {nextTier.safe_reward_title}
              </p>
            )}
            {!nextTier && tiers.length > 0 && (
              <p className="text-[11px] text-white/60 mt-1.5 text-center">
                🎉 ¡Nivel máximo alcanzado!
              </p>
            )}
          </div>

          {/* Premio disponible sin reclamar */}
          <AvailableRewardBanner grants={activeGrants} staffLabel={branding.staffLabel} />

          {/* Divider */}
          <div
            className="w-full mt-5 mb-4"
            style={{ height: '1px', background: 'rgba(255,255,255,0.12)' }}
          />

          {/* Banner de acción */}
          <div
            className="w-full rounded-2xl px-4 py-3"
            style={{
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <div className="flex items-center gap-3">
              <ScanLine className="h-6 w-6 text-white animate-pulse shrink-0" strokeWidth={2} />
              <div>
                <p className="text-sm font-bold text-white leading-tight">
                  DILE AL {branding.staffLabel.toUpperCase()} QUE TE ESCANEE
                </p>
                <p className="text-xs text-white/60">Si no, NO sumás puntos</p>
              </div>
            </div>
          </div>

          {/* QR — §3, "el QR de la tarjeta es 100% básico".
              Dos cambios y ninguno es cosmético:
              · `fgColor` sale de la marca, pero PASADO por `qrSafe()`: garantiza
                7:1 de contraste contra el blanco, así que un restaurante con
                color claro no se queda con un QR que ninguna cámara lee.
              · `level="H"` (30 % de redundancia) porque el logo tapa el centro.
                Con el nivel "M" de antes, un logo encima lo volvía ilegible. */}
          <div className="relative mt-5 overflow-hidden rounded-2xl bg-white p-4 shadow-2xl">
            <QRCodeSVG
              value={qrUrl}
              size={210}
              level="H"
              fgColor={branding.qrForeground}
              bgColor="#ffffff"
              imageSettings={
                branding.logoUrl
                  ? { src: branding.logoUrl, height: 44, width: 44, excavate: true }
                  : undefined
              }
            />
            {/* Marco de escaner: cuatro esquinas + una linea que barre. El QR
                suelto era un cuadro blanco que no decia que hacer con el; el
                marco lo dice sin texto, en el color de la marca. */}
            <ScannerCorners color={branding.primary} />
          </div>

          {/* Estado de polling */}
          {checkingStatus && justEarnedPoints == null && (
            <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Esperando que el {branding.staffLabel.toLowerCase()} te escanee...
            </div>
          )}

          <QrCountdown qrUrl={qrUrl} className="mt-3" />

          {/* Redes, contacto y políticas — mismo bloque que la tarjeta de /tarjeta. */}
          <div className="mt-5 w-full">
            <CardExtras
              extras={branding.card}
              instagramUrl={branding.instagramUrl}
              whatsappLink={branding.whatsappLink}
              googleReviewUrl={branding.googleReviewUrl}
              theme={theme}
            />
          </div>

          <button
            type="button"
            className="mt-4 flex items-center gap-1.5 py-2 text-sm text-white/40 transition-colors hover:text-white/65"
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Volver
          </button>
        </div>
      </ShineBorder>
    </div>
  )
}

/**
 * Las cuatro esquinas del marco de escaner + la linea que barre, en el color de
 * la marca. Solo decoracion: no toca el QR ni su contraste, que los resuelve
 * `branding.qrForeground` (pasado por `qrSafe()`).
 */
function ScannerCorners({ color }: { color: string }) {
  const common = 'pointer-events-none absolute h-5 w-5'
  return (
    <>
      <span className={`${common} left-2 top-2 rounded-tl-md border-l-2 border-t-2`} style={{ borderColor: color }} />
      <span className={`${common} right-2 top-2 rounded-tr-md border-r-2 border-t-2`} style={{ borderColor: color }} />
      <span className={`${common} bottom-2 left-2 rounded-bl-md border-b-2 border-l-2`} style={{ borderColor: color }} />
      <span className={`${common} bottom-2 right-2 rounded-br-md border-b-2 border-r-2`} style={{ borderColor: color }} />
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 right-3 h-0.5 rounded-full animate-qr-scan"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 12px 2px ${color}59`,
        }}
      />
    </>
  )
}
