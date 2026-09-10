/**
 * Disparar un evento del píxel desde el navegador.
 *
 * Vive aparte de `meta-pixel.ts` porque ese es puro y este toca `window`. Todo
 * lo que decide QUÉ se manda está allá; acá solo está el cómo.
 *
 * FALLA EN SILENCIO, A PROPÓSITO. Si no hay píxel configurado, si el script de
 * Meta todavía no cargó, o si un bloqueador de anuncios lo tumbó, `fbq` no
 * existe y esto no hace nada. Un check-in NUNCA puede romperse porque una
 * herramienta de medición no está: el cliente está parado en el local esperando
 * sus puntos.
 *
 * Ref: docs/features/meta-pixel.md
 */

import {
  buildMetaEventParams,
  type MetaEventSpec,
  type MetaEventSurface,
  type MetaPixelContext,
} from './meta-pixel'

/** La firma real de `fbq`, que Meta define como una función variádica. */
type Fbq = (...args: unknown[]) => void

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
    /**
     * La marca y la sede de ESTA página. Lo escribe `<MetaPixel>` al montarse.
     * Vive en `window` y no en un contexto de React porque quien dispara los
     * eventos puede ser cualquier componente, incluido uno que no cuelga del
     * proveedor — y porque un contexto más por esto no se paga solo.
     */
    __cada1MetaPixelContext?: MetaPixelContext
  }
}

/** Guarda la marca y la sede de la página. Lo llama `<MetaPixel>`, nadie más. */
export function setMetaPixelContext(context: MetaPixelContext): void {
  if (typeof window === 'undefined') return
  window.__cada1MetaPixelContext = context
}

/**
 * Manda un evento a TODOS los píxeles inicializados (el de Cada1 y, si la marca
 * cargó el suyo, también el de ella). Meta reparte solo: no hay que repetir.
 */
export function trackMetaEvent(event: MetaEventSpec, surface: MetaEventSurface): void {
  if (typeof window === 'undefined') return
  const fbq = window.fbq
  if (typeof fbq !== 'function') return

  const params = buildMetaEventParams(window.__cada1MetaPixelContext ?? null, surface)
  try {
    fbq(event.standard ? 'track' : 'trackCustom', event.name, params)
  } catch {
    // Ver el comentario de arriba: medir jamás rompe el flujo del cliente.
  }
}
