'use client'

/**
 * Decoración de contorno detrás del contenido de la tarjeta (Tarjeta principal,
 * 2026-09-08): las *"figuritas tipo contorno para decorar"* que pidió el dueño.
 *
 * Es una capa SVG absoluta, en blanco translúcido, que se pinta DEBAJO del
 * contenido: el contenedor de la tarjeta lleva `isolate` y esta capa `-z-10`,
 * así ningún texto ni sello queda tapado. Sin relleno sólido nunca: solo
 * trazos finos y puntos, para que funcione igual sobre el gradiente de
 * cualquier marca y sobre el negro del tema Black.
 *
 * `none` no dibuja nada, y es el default: un tenant que no eligió decoración
 * ve la tarjeta de siempre.
 */

import type { CardMotifId } from '@/constants/card-extras'

interface CardMotifProps {
  id: CardMotifId
  /** Color del trazo. Por defecto blanco; el Black manda su dorado. */
  color?: string
  className?: string
}

export function CardMotif({ id, color = '#ffffff', className = '' }: CardMotifProps) {
  if (id === 'none') return null
  const common = {
    'aria-hidden': true,
    className: `pointer-events-none absolute inset-0 -z-10 h-full w-full ${className}`,
    style: { color },
  } as const

  switch (id) {
    case 'ornamento':
      // Cuatro flourishes en las esquinas y un filete fino a 10 px del borde.
      return (
        <svg {...common} viewBox="0 0 320 560" preserveAspectRatio="none" fill="none">
          <rect x="10" y="10" width="300" height="540" rx="22" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1" />
          <g stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.2" strokeLinecap="round">
            <path d="M22 60 C22 38, 38 22, 60 22" />
            <path d="M30 60 C30 43, 43 30, 60 30" />
            <path d="M298 60 C298 38, 282 22, 260 22" />
            <path d="M290 60 C290 43, 277 30, 260 30" />
            <path d="M22 500 C22 522, 38 538, 60 538" />
            <path d="M30 500 C30 517, 43 530, 60 530" />
            <path d="M298 500 C298 522, 282 538, 260 538" />
            <path d="M290 500 C290 517, 277 530, 260 530" />
          </g>
        </svg>
      )
    case 'puntos':
      return (
        <svg {...common}>
          <defs>
            <pattern id="motif-puntos" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="11" cy="11" r="1.3" fill="currentColor" fillOpacity="0.16" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#motif-puntos)" />
        </svg>
      )
    case 'ondas':
      return (
        <svg {...common}>
          <defs>
            <pattern id="motif-ondas" width="80" height="28" patternUnits="userSpaceOnUse">
              <path d="M0 14 C 13 2, 27 2, 40 14 S 67 26, 80 14" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#motif-ondas)" />
        </svg>
      )
    case 'hojas':
      return (
        <svg {...common}>
          <defs>
            <pattern id="motif-hojas" width="64" height="64" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.1" strokeLinecap="round">
                <path d="M14 46 C14 30, 24 20, 40 18 C40 34, 30 44, 14 46 Z" />
                <path d="M14 46 L34 24" />
                <path d="M46 14 C48 8, 54 6, 58 6" />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#motif-hojas)" />
        </svg>
      )
    case 'estrellas':
      return (
        <svg {...common}>
          <defs>
            <pattern id="motif-estrellas" width="72" height="72" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.1" strokeLinecap="round">
                <path d="M18 10 L18 26 M10 18 L26 18" />
                <path d="M54 44 L54 60 M46 52 L62 52" />
                <circle cx="52" cy="16" r="1.2" fill="currentColor" fillOpacity="0.25" stroke="none" />
                <circle cx="20" cy="56" r="1.2" fill="currentColor" fillOpacity="0.25" stroke="none" />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#motif-estrellas)" />
        </svg>
      )
    case 'geometrico':
      return (
        <svg {...common}>
          <defs>
            <pattern id="motif-geometrico" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M24 2 L46 24 L24 46 L2 24 Z" fill="none" stroke="currentColor" strokeOpacity="0.13" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#motif-geometrico)" />
        </svg>
      )
    default:
      return null
  }
}
