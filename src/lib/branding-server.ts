import 'server-only'

/**
 * Resolución de marca por dominio para el lado servidor (root layout, metadata,
 * server components, webhooks). Lee el host de la request, resuelve el tenant y
 * mezcla su `config.branding` sobre los defaults de entorno.
 *
 * Ante cualquier fallo (sin host, tenant no encontrado, error de DB) devuelve
 * DEFAULT_BRANDING — nunca lanza, para no tumbar el render de la página.
 *
 * ⚠️ RESUELVE POR `resolveHostContext`, NO POR `getTenantByDomain`. El subdominio propio
 * de una SEDE (`laureles.marca.com`) no está en `tenants.domain` sino en
 * `restaurant_locations.domain`: con la consulta corta, ese host caía a
 * DEFAULT_BRANDING, que son las variables `NEXT_PUBLIC_BRAND_*` del despliegue — o sea
 * la marca de OTRO restaurante. Un cliente escaneando el QR impreso de su sede veía el
 * nombre y los colores de Sushi Service. Lo destapó Tepuy el 2026-09-08.
 *
 * ⚠️ Y RESUELVE LA SEDE, NO SOLO LA MARCA (00058). Cada local tiene su propia ficha
 * de Google, su dirección, su horario y sus teléfonos. Con `getTenantByHost()` —que
 * devuelve la marca y nada más— las dos sedes de una marca mandaban a reseñar la
 * MISMA ficha, así que la ficha de la segunda sede nacía muerta. `resolveHostContext()`
 * cuesta una consulta más (las sedes activas de la marca), y esa consulta es la que
 * trae el `config` de la sede: no hay una tercera.
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { resolveHostContext } from './tenant'
import { DEFAULT_BRANDING, resolveBranding, type Branding } from './branding'
import type { TenantConfig } from '@/types/tenant.types'

/**
 * Memoizado con `cache()` de React: dentro de un mismo request, el root layout y
 * `generateMetadata` lo llaman por separado pero solo se hace UNA query a la DB.
 */
export const getBrandingForHost = cache(async (): Promise<Branding> => {
  try {
    const h = await headers()
    const host = h.get('host')
    const { tenant, location } = await resolveHostContext(host)
    if (!tenant) return DEFAULT_BRANDING
    // Sede desconocida (el host es el dominio raíz de una marca con varias sedes):
    // contesta la marca, que es lo de siempre. `null` no pisa nada.
    return resolveBranding(tenant.config, (location?.config ?? null) as TenantConfig | null)
  } catch {
    return DEFAULT_BRANDING
  }
})
