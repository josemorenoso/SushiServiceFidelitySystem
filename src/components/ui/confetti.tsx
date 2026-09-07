'use client'

import { useEffect, useRef } from 'react'

/**
 * Ráfaga de confeti sobre el elemento que la contiene.
 *
 * Regla 02 del kit visual: el movimiento CONFIRMA algo que hizo el cliente. Por
 * eso no hay un confeti "de fondo" que corra siempre: esta pieza dispara una
 * sola ráfaga cuando `fire` pasa a `true`, y se apaga sola cuando las partículas
 * se caen. Es el momento del premio, y de ningún otro.
 *
 * Es canvas y no DOM a propósito: noventa partículas como `<div>` obligan al
 * navegador a recalcular estilo y layout noventa veces por cuadro, y en un
 * teléfono de gama media eso se ve como tirones justo en la pantalla que uno
 * quiere que se vea cara.
 *
 * `prefers-reduced-motion` no se resuelve por CSS acá — no hay animación CSS que
 * apagar — así que se consulta antes de dibujar: quien pidió menos movimiento no
 * ve nada y la pantalla funciona igual.
 *
 * Los colores los pasa quien la usa y salen de la marca: acá no hay ni un hex.
 */

interface ConfettiProps {
  /** Al pasar de `false` a `true`, dispara la ráfaga. */
  fire: boolean
  /** Paleta de las partículas. Sale de `Branding`. */
  colors: string[]
  /** Altura relativa desde donde salen (0 = arriba, 1 = abajo). */
  originY?: number
  className?: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rot: number
  vr: number
  life: number
}

const COUNT = 90
const GRAVITY = 0.16

export function Confetti({ fire, colors, originY = 0.42, className = '' }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!fire || firedRef.current) return

    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    firedRef.current = true

    const { width, height } = parent.getBoundingClientRect()
    canvas.width = width
    canvas.height = height

    const parts: Particle[] = Array.from({ length: COUNT }, () => ({
      x: width / 2,
      y: height * originY,
      vx: (Math.random() - 0.5) * 7,
      vy: Math.random() * -6 - 1.5,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0],
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      life: 70 + Math.random() * 40,
    }))

    let raf = 0
    const tick = () => {
      ctx.clearRect(0, 0, width, height)
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.vy += GRAVITY
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life--
        if (p.life <= 0 || p.y > height + 20) {
          parts.splice(i, 1)
          continue
        }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.min(1, p.life / 30)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6)
        ctx.restore()
      }
      if (parts.length > 0) {
        raf = requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, width, height)
      }
    }
    raf = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(raf)
  }, [fire, colors, originY])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  )
}
