'use client'

/**
 * El logo del restaurante en las pantallas de cara al cliente (§6).
 *
 * Un solo componente para los dos fondos que existen en el producto, porque un
 * logo se ve distinto sobre marfil que sobre un gradiente oscuro:
 *
 *   · `variant="surface"` — pantalla de check-in, fondo marfil. Si hay logo, va
 *     limpio; si no, el círculo con gradiente de marca y el cubierto de siempre.
 *   · `variant="onColor"` — tarjeta digital, gradiente oscuro. El logo va sobre
 *     una placa blanca translúcida, porque los logos de restaurante suelen ser
 *     tinta oscura sobre transparente y sin placa desaparecen.
 *
 * SIN LOGO NO CAMBIA NADA. Un tenant que no subió el suyo ve exactamente el
 * círculo con el cubierto que la pantalla de check-in tiene desde siempre.
 *
 * ⚠️ `<img>` y no `next/image` a propósito: la URL sale del proyecto Supabase,
 * cuyo host cambia por entorno, y `next/image` exige declararlo en
 * `next.config.ts` en tiempo de build. La optimización no haría falta igual — la
 * ruta de subida ya guarda el PNG acotado a 512 px.
 */

import { UtensilsCrossed } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'

interface BrandMarkProps {
  variant?: 'surface' | 'onColor'
  /** Lado de la marca en px. El fallback y el logo comparten caja. */
  size?: number
  className?: string
}

export function BrandMark({ variant = 'surface', size = 56, className = '' }: BrandMarkProps) {
  const branding = useBranding()

  if (branding.logoUrl) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          background: variant === 'onColor' ? 'rgba(255,255,255,0.92)' : 'transparent',
          boxShadow:
            variant === 'onColor'
              ? '0 4px 16px rgba(0,0,0,0.22)'
              : '0 4px 16px rgba(0,0,0,0.06)',
          padding: size * 0.1,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logoUrl}
          alt={branding.name}
          className="h-full w-full object-contain"
        />
      </div>
    )
  }

  if (variant === 'onColor') return null

  return (
    <div
      className={`flex items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${branding.primary} 0%, ${branding.primaryEnd} 100%)`,
        boxShadow: `0 6px 20px rgba(0, 0, 0, 0.16)`,
      }}
    >
      <UtensilsCrossed
        className="h-6 w-6"
        strokeWidth={1.25}
        style={{ color: branding.onPrimary }}
      />
    </div>
  )
}
