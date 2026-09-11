import 'server-only'

/**
 * Mandar un evento a la API de Conversiones de Meta — a los DOS píxeles.
 *
 * Mismo par que el píxel del navegador (`meta-pixel.ts`): el de la plataforma
 * (`NEXT_PUBLIC_META_PIXEL_ID` + `META_CONVERSIONS_ACCESS_TOKEN`) y el propio
 * de la marca (`config.integrations.meta_pixel_id` + su token en
 * `tenant_integration_secrets`, 00061). Cada uno con SU token: el token de
 * Cada1 no puede escribir en el píxel del restaurante ni al revés.
 *
 * NUNCA BLOQUEA NI ROMPE UN CHECK-IN. Se llama desde `after()` de Next, o sea
 * después de que la respuesta ya salió; tiene un timeout corto; y cualquier
 * fallo —Meta caída, token vencido, tabla sin aplicar— se registra con el
 * prefijo `[MetaCAPI]` y se traga. El cliente está parado en el local
 * esperando sus puntos; medir no es más importante que eso.
 *
 * FALLA CERRADO SI LA 00061 NO CORRIÓ. La lectura del token distingue «no hay
 * fila» (la marca no cargó token: normal) de «la consulta falló» (42P01 si la
 * tabla no existe): la segunda se loguea como fallo de base y la marca queda
 * sin token. Así se puede desplegar el código antes de aplicar la migración
 * sin que un solo check-in se entere.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure } from './db-failure'
import { normalizeMetaPixelId, tenantMetaPixelId } from './meta-pixel'
import { postConversionEvent, type ConversionEvent, type ConversionTarget } from './meta-conversions'
import type { TenantConfig } from '@/types/tenant.types'

export const META_CONVERSIONS_PROVIDER = 'meta_conversions'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/**
 * El token de la marca, o `null`. Solo lo lee esto y el endpoint del panel.
 *
 * `maybeSingle()` y no `single()`: «no hay fila» es el caso normal de una
 * marca sin token, no un error. El `error` sí se mira ANTES que el `data`
 * (regla de `db-failure.ts`): una tabla que no existe no es «sin token», es
 * un fallo que hay que ver en el log.
 */
export async function readBrandConversionsToken(tenantId: string): Promise<string | null> {
  if (!tenantId) return null
  const { data, error } = await getServiceClient()
    .from('tenant_integration_secrets')
    .select('secret')
    .eq('tenant_id', tenantId)
    .eq('provider', META_CONVERSIONS_PROVIDER)
    .maybeSingle()
  if (error) {
    logDbFailure({ scope: 'MetaCAPI', reason: 'token_lookup_error', error, context: { tenantId } })
    return null
  }
  const secret = (data as { secret?: unknown } | null)?.secret
  return typeof secret === 'string' && secret.trim() !== '' ? secret.trim() : null
}

/**
 * Los destinos de un evento: plataforma y/o marca, cada uno con su token y
 * sin repetidos. Un píxel sin token no entra: mandar sin token es un 401 que
 * solo ensucia el log.
 */
export async function resolveConversionTargets(args: {
  tenantId: string
  tenantConfig: TenantConfig | null | undefined
}): Promise<ConversionTarget[]> {
  const targets: ConversionTarget[] = []

  const platformPixel = normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID)
  const platformToken = process.env.META_CONVERSIONS_ACCESS_TOKEN?.trim()
  if (platformPixel && platformToken) {
    targets.push({ pixelId: platformPixel, accessToken: platformToken, owner: 'platform' })
  }

  const brandPixel = tenantMetaPixelId(args.tenantConfig)
  if (brandPixel && !targets.some((t) => t.pixelId === brandPixel)) {
    const brandToken = await readBrandConversionsToken(args.tenantId)
    if (brandToken) targets.push({ pixelId: brandPixel, accessToken: brandToken, owner: 'brand' })
  }

  return targets
}

/**
 * Lo que llama la ruta del check-in desde `after()`: resuelve destinos y manda.
 * Envuelto entero en try/catch por la regla de arriba.
 */
export async function sendConversionEvent(args: {
  tenantId: string
  tenantConfig: TenantConfig | null | undefined
  event: ConversionEvent | null
}): Promise<void> {
  if (!args.event) return
  try {
    const targets = await resolveConversionTargets({ tenantId: args.tenantId, tenantConfig: args.tenantConfig })
    // `META_CONVERSIONS_TEST_EVENT_CODE` (opcional) manda los eventos a la pestaña
    // «Probar eventos» del Administrador de eventos en vez de contarlos: es cómo
    // se verifica sin ensuciar los números. Quitarla al terminar la prueba.
    await postConversionEvent(targets, args.event, {
      testEventCode: process.env.META_CONVERSIONS_TEST_EVENT_CODE?.trim() || undefined,
    })
  } catch (err) {
    console.error(`[MetaCAPI][FALLO] reason=unexpected detalle="${err instanceof Error ? err.message : String(err)}"`)
  }
}
