'use client'

import { useEffect, useState, type CSSProperties } from 'react'

/**
 * Contador que RUEDA, como el odómetro de un carro.
 *
 * Regla 04 del kit visual: *"los números son tipografía"*. Los puntos son el
 * héroe de la tarjeta del cliente, y un número que llega rodando dice
 * "acabás de ganar esto"; el mismo número en texto plano no dice nada.
 *
 * Cómo funciona: una columna por dígito, cada una con la tira 0…9 apilada y
 * recortada a la altura de un dígito. Mover la tira `-Nem` deja el dígito N a
 * la vista. Las columnas arrancan escalonadas (`stagger`) para que la rueda se
 * lea de izquierda a derecha y no como un bloque.
 *
 * ⚠️ **La columna mide `1ch` y ese número NO se baja.** `overflow: hidden` es lo
 * que recorta la tira en vertical, pero recorta los DOS ejes: si la columna es
 * más angosta que el dígito, le come los costados. Estuvo en `0.62ch` —copiado
 * de una demo con otra tipografía— y salió a producción el 2026-09-07 con los
 * dígitos cortados en la tarjeta del cliente (`322` se veía mordido).
 * `1ch` es exactamente el avance de un dígito, y con `tabular-nums` todos los
 * dígitos miden lo mismo: no sobra ni falta un píxel. Apretar las columnas se
 * hace con `letter-spacing`, nunca achicando la caja que recorta.
 *
 * Es una pieza PURA de presentación: no sabe qué son puntos ni visitas. El color
 * y el tamaño los pone quien la usa (`className` / `style`), como el resto de la
 * tarjeta — acá no se hornea ni un hex.
 *
 * `prefers-reduced-motion` lo resuelve el CSS: la transición se apaga sola y el
 * número aparece ya en su valor final.
 */

const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

interface OdometerProps {
  value: number
  /** ms de retraso entre una columna y la siguiente. */
  stagger?: number
  className?: string
  style?: CSSProperties
  /** Para lectores de pantalla, si el número necesita unidad ("88 puntos"). */
  ariaLabel?: string
}

export function Odometer({
  value,
  stagger = 70,
  className = '',
  style,
  ariaLabel,
}: OdometerProps) {
  const digits = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0))
    .toString()
    .split('')

  // Arranca en 0 y rueda hasta el valor: el primer render (y el HTML del
  // servidor) muestran la tira sin desplazar, así que no hay salto de hidratación.
  const [rolled, setRolled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setRolled(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <span className={`inline-flex leading-none tabular-nums ${className}`} style={style}>
      {/* El lector de pantalla lee el número de una vez; las columnas que ruedan
          son decoración. `role="text"` no sirve: solo lo implementa Safari. */}
      <span className="sr-only">{ariaLabel ?? String(value)}</span>
      {digits.map((d, i) => (
        <span
          key={i}
          aria-hidden
          className="block overflow-hidden"
          style={{ height: '1em', width: '1ch' }}
        >
          <span
            className="flex flex-col motion-safe:transition-transform"
            style={{
              transform: `translateY(-${rolled ? Number(d) : 0}em)`,
              transitionDuration: '900ms',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.28, 1)',
              transitionDelay: `${i * stagger}ms`,
            }}
          >
            {STRIP.map((n) => (
              <span key={n} className="block text-center" style={{ height: '1em' }}>
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
