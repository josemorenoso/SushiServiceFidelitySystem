'use client'

/**
 * El `<script>` del píxel de Meta en las páginas públicas.
 *
 * Lo monta `src/app/(public)/layout.tsx`, que es quien resuelve la marca por el
 * host. Este componente no sabe nada de tenants: recibe la lista de ids ya
 * resuelta y el contexto (marca + sede) que va a viajar con cada evento.
 *
 * SIN IDS NO RENDERIZA NADA. Un despliegue sin `NEXT_PUBLIC_META_PIXEL_ID` y un
 * restaurante sin píxel propio no cargan un solo byte de Meta — ni el script, ni
 * el `<noscript>`. Es el estado por defecto y es el correcto.
 *
 * POR QUÉ EL PAGEVIEW SE DISPARA DOS VECES DE FORMAS DISTINTAS
 * ───────────────────────────────────────────────────────────
 * El snippet de Meta hace `init` + `PageView` de la primera carga, porque corre
 * dentro del `<script>` y no depende de que React haya hidratado. Pero las
 * páginas públicas son una SPA: ir de `/check-in` a `/tarjeta` NO recarga la
 * página y el snippet no vuelve a correr. Por eso además hay un efecto sobre el
 * pathname, que se SALTA la primera vuelta (`yaContado`) para no contar dos
 * veces la misma carga — el error clásico de este patrón, que infla el número
 * al doble y no se ve hasta que alguien compara con otra fuente.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import {
  META_EVENT_PAGE_VIEW,
  isMeasuredPath,
  surfaceForPath,
  type MetaPixelContext,
} from '@/lib/meta-pixel'
import { setMetaPixelContext, trackMetaEvent } from '@/lib/meta-pixel-client'

interface MetaPixelProps {
  /** Ids ya normalizados y sin repetidos (`resolveMetaPixelIds()`). Vacío = no hacer nada. */
  pixelIds: string[]
  /** Marca y sede que viajan con cada evento. Nunca datos del cliente. */
  context: MetaPixelContext
}

export function MetaPixel({ pixelIds, context }: MetaPixelProps) {
  const pathname = usePathname()
  const yaContado = useRef(false)
  // `/mesero/*` no se mide (ver `isMeasuredPath`). Se decide acá, en el cliente,
  // porque un layout de servidor no conoce la ruta — y porque el mismo predicado
  // apaga el aviso de medición, que si no quedaría mintiendo.
  const activo = pixelIds.length > 0 && isMeasuredPath(pathname)

  // El contexto se guarda ANTES de cualquier evento: quien dispare un
  // `CompleteRegistration` a los tres segundos ya lo va a encontrar puesto.
  useEffect(() => {
    setMetaPixelContext(context)
  }, [context])

  useEffect(() => {
    if (!activo) return
    if (!yaContado.current) {
      // La primera carga ya la contó el snippet de abajo.
      yaContado.current = true
      return
    }
    trackMetaEvent(META_EVENT_PAGE_VIEW, surfaceForPath(pathname))
  }, [pathname, activo])

  if (!activo) return null

  const inits = pixelIds.map((id) => `fbq('init', '${id}');`).join('\n')

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
${inits}
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {pixelIds.map((id) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={id}
            height="1"
            width="1"
            style={{ display: 'none' }}
            alt=""
            src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
          />
        ))}
      </noscript>
    </>
  )
}
