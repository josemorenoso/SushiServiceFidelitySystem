import 'server-only'

/**
 * Resolución de marca por dominio para el lado servidor (root layout, metadata,
 * server components, webhooks). Lee el host de la request, resuelve el tenant y
 * mezcla su `config.branding` sobre los defaults de entorno.
 *
 * Ante cualquier fallo (sin host, tenant no encontrado, error de DB) devuelve
 * DEFAULT_BRANDING — nunca lanza, para no tumbar el render de la página.
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { getTenantByDomain } from './tenant'
import { DEFAULT_BRANDING, resolveBranding, type Branding } from './branding'

/**
 * Memoizado con `cache()` de React: dentro de un mismo request, el root layout y
 * `generateMetadata` lo llaman por separado pero solo se hace UNA query a la DB.
 */
export const getBrandingForHost = cache(async (): Promise<Branding> => {
  try {
    const h = await headers()
    const host = h.get('host')
    const tenant = await getTenantByDomain(host)
    if (!tenant) return DEFAULT_BRANDING
    return resolveBranding(tenant.config)
  } catch {
    return DEFAULT_BRANDING
  }
})
