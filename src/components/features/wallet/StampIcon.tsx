'use client'

/**
 * El símbolo dentro de un sello lleno (Tarjeta principal, 2026-09-08).
 *
 * El dueño pidió *"símbolos bonitos a los sellos"*. El catálogo es cerrado
 * (`STAMP_ICON_IDS`, `src/constants/card-extras.ts`) y acá se le pone dibujo a
 * cada id. Dos reglas:
 *
 *   · `check` sigue siendo el trazo dibujado de siempre (`animate-draw-check`),
 *     así que un tenant que no eligió nada ve exactamente lo que veía.
 *   · el resto son íconos de lucide en el color del ✓ del tema, sin relleno:
 *     contorno fino sobre el fondo del sello, que es lo que se ve elegante
 *     sobre un gradiente. Ni un hex acá: el color viene del tema.
 */

import type { ComponentType } from 'react'
import {
  Beer, Cake, ChefHat, Coffee, Croissant, Crown, Fish, Flame, Gem, Heart,
  IceCreamCone, Leaf, PawPrint, Pizza, Scissors, Sparkles, Star, Utensils, Wine,
  type LucideProps,
} from 'lucide-react'
import type { StampIconId } from '@/constants/card-extras'

const ICONS: Record<Exclude<StampIconId, 'check'>, ComponentType<LucideProps>> = {
  star: Star,
  heart: Heart,
  utensils: Utensils,
  chef_hat: ChefHat,
  pizza: Pizza,
  fish: Fish,
  coffee: Coffee,
  wine: Wine,
  beer: Beer,
  ice_cream: IceCreamCone,
  cake: Cake,
  croissant: Croissant,
  flame: Flame,
  leaf: Leaf,
  gem: Gem,
  crown: Crown,
  sparkles: Sparkles,
  scissors: Scissors,
  paw: PawPrint,
}

interface StampIconProps {
  id: StampIconId
  color: string
  /** Retraso de la animación del trazo, solo para `check`. */
  delayMs?: number
  /** Lado relativo al sello. La cuadrícula usa 52 %; el selector del panel, más. */
  sizeClass?: string
}

export function StampIcon({ id, color, delayMs = 0, sizeClass = 'w-[52%] h-[52%]' }: StampIconProps) {
  if (id === 'check') {
    // El ✓ se DIBUJA trazo a trazo en vez de aparecer de golpe.
    // `pathLength={1}` normaliza el largo real del trazo a 1, así el par
    // dasharray/dashoffset no depende de la geometría del path: se oculta con 1
    // y se dibuja hasta 0. El resto lo hace `animate-draw-check` (`globals.css`),
    // que ya respeta `prefers-reduced-motion`.
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden className={sizeClass}>
        <path
          d="M5 12.8 L9.7 17.5 L19 7.2"
          stroke={color}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="animate-draw-check"
          style={{ strokeDasharray: 1, strokeDashoffset: 1, animationDelay: `${delayMs}ms` }}
        />
      </svg>
    )
  }
  const Icon = ICONS[id]
  return <Icon aria-hidden className={sizeClass} strokeWidth={2.2} style={{ color }} />
}
