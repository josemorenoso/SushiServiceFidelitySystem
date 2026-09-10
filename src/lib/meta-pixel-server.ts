import 'server-only'

/**
 * Qué píxeles de Meta se disparan en el host de ESTE request, y con qué marca y
 * sede se etiquetan sus eventos.
 *
 * Es la única puerta entre `tenants.config` y el `<script>` de Meta. Lo usa
 * `src/app/(public)/layout.tsx` y nadie más.
 *
 * ⚠️ NO PASA POR `resolveBranding()`, Y ES A PROPÓSITO. `Branding` es la
 * proyección pública de la config y su comentario de cabecera lo dice con todas
 * las letras: si algún día `config` guarda metadatos de la cuenta de Meta, NO se
 * agregan campos ahí para exponerlos "porque son útiles". El id del píxel es
 * público (se lee en el HTML de la página) pero no es identidad visual, así que
 * viaja por su propio camino y no engorda el objeto que toda página inyecta.
 *
 * Ante cualquier fallo devuelve "sin píxel": una página pública jamás deja de
 * renderizar porque la medición no se pudo resolver.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { cache } from 'react'
import { getHostContextForRequest } from './host-context-server'
import { resolveMetaPixelIds, type MetaPixelContext } from './meta-pixel'
import type { TenantConfig } from '@/types/tenant.types'

export interface MetaPixelForHost {
  pixelIds: string[]
  context: MetaPixelContext
}

const SIN_PIXEL: MetaPixelForHost = { pixelIds: [], context: { tenant: null, location: null } }

export const getMetaPixelForHost = cache(async (): Promise<MetaPixelForHost> => {
  try {
    const { tenant, locationId } = await getHostContextForRequest()
    const pixelIds = resolveMetaPixelIds({
      platformId: process.env.NEXT_PUBLIC_META_PIXEL_ID,
      tenantConfig: (tenant?.config ?? null) as TenantConfig | null,
    })
    if (pixelIds.length === 0) return SIN_PIXEL
    return {
      pixelIds,
      // El slug y no el UUID: el slug ya viaja en el subdominio, así que no
      // revela nada nuevo, y en el Administrador de eventos de Meta se lee.
      context: { tenant: tenant?.slug ?? null, location: locationId },
    }
  } catch {
    return SIN_PIXEL
  }
})
