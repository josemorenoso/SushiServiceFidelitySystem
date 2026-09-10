'use client'

/**
 * La línea chiquitita que avisa que la página mide (dueño, 2026-09-10).
 *
 * Es la contraparte visible de `<MetaPixel>` y usa EL MISMO predicado
 * (`isMeasuredPath`) para decidir si aparece. Esa es toda la gracia: no puede
 * existir una página que mida sin avisar, ni un aviso en una página que no mide.
 * Si `NEXT_PUBLIC_META_PIXEL_ID` no está y la marca no cargó píxel propio, no se
 * dispara nada y esta línea tampoco se dibuja.
 *
 * Es un AVISO, no un consentimiento: no bloquea, no pide aceptar y no se puede
 * cerrar. El consentimiento del programa de fidelización sigue viviendo donde
 * vivía —la casilla del formulario de check-in— y ahí también está el enlace a
 * la política. El detalle completo es `/privacidad` §7.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { usePathname } from 'next/navigation'
import { isMeasuredPath } from '@/lib/meta-pixel'

export function MetaPixelNote({ active }: { active: boolean }) {
  const pathname = usePathname()
  if (!active || !isMeasuredPath(pathname)) return null

  return (
    // Fija al pie y no al final del documento: las pantallas públicas son una
    // tarjeta centrada en `min-h-screen`, así que en el flujo normal esta línea
    // caería bajo el pliegue y no la vería nadie — que es lo mismo que no
    // ponerla. `pointer-events-none` en la barra y `auto` en el enlace: la línea
    // no le roba un toque al botón que tenga debajo, pero el enlace se abre.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),4px)] pt-1 text-center"
      style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.92), rgba(255,255,255,0))' }}
    >
      <p className="text-[10px] leading-snug" style={{ color: 'var(--brand-ink-muted, #9ca3af)' }}>
        Usamos el píxel de Meta para medir y mejorar nuestras campañas.{' '}
        <a
          href="/privacidad"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto underline"
        >
          Más información
        </a>
      </p>
    </div>
  )
}
