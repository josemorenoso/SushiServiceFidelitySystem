'use client'

import type { CSSProperties, ReactNode } from 'react'

/**
 * Borde vivo: un gradiente cónico girando dentro de un borde de ~1.5px.
 *
 * Dice **"esto está encendido"**. Es el único elemento con brillo permanente de
 * la tarjeta del cliente — regla 01 del kit visual: *una sola cosa brilla por
 * pantalla*. Si mañana otra pieza necesita brillar, esta se apaga primero.
 *
 * Truco: el gradiente se pinta en un div que cubre toda la caja y después se
 * RECORTA a la franja del borde con dos máscaras compuestas por exclusión
 * (`content-box` menos la caja entera). Sin eso habría que animar un
 * `border-image`, que no interpola.
 *
 * El `black` de las máscaras no es un color visible: una máscara solo mira el
 * canal alfa, y ahí `black` significa "opaco". No es un hex de marca.
 *
 * Los colores del haz los pone el tema (`wallet-card-theme.ts`), nunca este
 * archivo. `prefers-reduced-motion` detiene el giro desde `globals.css`: el
 * borde queda quieto y visible, que es el estado correcto.
 */

const EDGE_MASK =
  'linear-gradient(black 0 0) content-box, linear-gradient(black 0 0)'

interface ShineBorderProps {
  /**
   * Gradiente cónico completo, ya en los colores del tema. Debe arrancar con
   * `from var(--shine-ang)` para que el ángulo animado lo haga girar.
   */
  gradient: string
  /** Radio de la caja, en px. Tiene que coincidir con el de lo que envuelve. */
  radius: number
  /** Grosor del haz, en px. */
  width?: number
  /** Vuelta completa, en segundos. */
  duration?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function ShineBorder({
  gradient,
  radius,
  width = 1.5,
  duration = 6,
  className = '',
  style,
  children,
}: ShineBorderProps) {
  return (
    <div
      className={`relative ${className}`}
      style={{ borderRadius: `${radius}px`, ...style }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 animate-shine-spin"
        style={{
          borderRadius: 'inherit',
          padding: `${width}px`,
          background: gradient,
          animationDuration: `${duration}s`,
          WebkitMask: EDGE_MASK,
          WebkitMaskComposite: 'xor',
          mask: EDGE_MASK,
          maskComposite: 'exclude',
        }}
      />
      {children}
    </div>
  )
}
