import 'server-only'

/**
 * El contexto de host de ESTE request, resuelto UNA sola vez.
 *
 * `resolveHostContext()` cuesta dos consultas (la marca por host y las sedes
 * activas de esa marca). En una página pública lo necesitan dos cosas a la vez
 * —la marca (`getBrandingForHost`) y el píxel de Meta (`getMetaPixelForHost`)—
 * y sin este envoltorio cada una pagaría las suyas: cuatro consultas para
 * responder lo mismo.
 *
 * `cache()` de React memoiza POR REQUEST, no entre requests: dos clientes
 * distintos en dos hosts distintos nunca comparten resultado. Es el mismo
 * mecanismo que ya usaba `getBrandingForHost()`.
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { resolveHostContext, type HostContext } from './tenant'

export const getHostContextForRequest = cache(async (): Promise<HostContext> => {
  const h = await headers()
  return resolveHostContext(h.get('host'))
})
