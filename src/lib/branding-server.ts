import 'server-only'

/**
 * Resolución de marca por dominio para el lado servidor (root layout, metadata,
 * server components, webhooks). Lee el host de la request, resuelve el tenant y
 * mezcla su `config.branding` sobre los defaults de entorno.
 *
 * Ante cualquier fallo (sin host, tenant no encontrado, error de DB) devuelve
 * DEFAULT_BRANDING — nunca lanza, para no tumbar el render de la página.
 *
 * ⚠️ RESUELVE POR `getTenantByHost`, NO POR `getTenantByDomain`. El subdominio propio
 * de una SEDE (`laureles.marca.com`) no está en `tenants.domain` sino en
 * `restaurant_locations.domain`: con la consulta corta, ese host caía a
 * DEFAULT_BRANDING, que son las variables `NEXT_PUBLIC_BRAND_*` del despliegue — o sea
 * la marca de OTRO restaurante. Un cliente escaneando el QR impreso de su sede veía el
 * nombre y los colores de Sushi Service. Lo destapó Tepuy el 2026-09-08.
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { getTenantByHost } from './tenant'
import { DEFAULT_BRANDING, resolveBranding, type Branding } from './branding'

/**
 * Memoizado con `cache()` de React: dentro de un mismo request, el root layout y
 * `generateMetadata` lo llaman por separado pero solo se hace UNA query a la DB.
 */
export const getBrandingForHost = cache(async (): Promise<Branding> => {
  try {
    const h = await headers()
    const host = h.get('host')
    const tenant = await getTenantByHost(host)
    if (!tenant) return DEFAULT_BRANDING
    return resolveBranding(tenant.config)
  } catch {
    return DEFAULT_BRANDING
  }
})
