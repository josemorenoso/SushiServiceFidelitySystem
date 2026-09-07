/**
 * GET /api/dashboard/qr-locations — las sedes de la marca CON su subdominio.
 *
 * Feature: `docs/features/qr-studio.md` · Decisión: D-QR-1
 * (`docs/DECISIONES-QR-Y-SEDE-2026-09-06.md`)
 *
 * POR QUÉ UNA RUTA NUEVA Y NO UNA DE LAS DOS QUE YA HAY
 * ────────────────────────────────────────────────────
 * El QR Studio necesita, por cada sede, el `domain`: el QR de una sede apunta a
 * SU subdominio porque la sede se resuelve del host y nunca de un parámetro
 * (D-QR-1). Ninguna de las rutas existentes lo da, y ampliar cualquiera de las
 * dos costaba más de lo que valía:
 *
 *   · `/api/dashboard/location` devuelve **un objeto plano** con la sede
 *     PRINCIPAL. Su contrato está congelado a propósito: devolver una lista
 *     rompe `dashboard/settings/page.tsx` en silencio (los campos de la geocerca
 *     quedan vacíos, sin aviso y sin log).
 *   · `/api/dashboard/location-scope` sí devuelve la lista, pero su
 *     `LocationOption` (`src/lib/location-scope-shared.ts`) es el tipo que
 *     alimenta el selector de TODO el panel. Agregarle `domain` mueve un hub por
 *     una pantalla sola.
 *
 * Así que esta ruta es de solo lectura, de una sola pantalla, y no comparte tipo
 * con nadie. Si mañana `LocationOption` gana `domain` por otro motivo, esto se
 * borra sin que se caiga nada.
 *
 * ALCANCE: la marca entera, a propósito. Quien imprime el material de una sede
 * está preparando su apertura, así que necesita ver las sedes que todavía no
 * tienen subdominio para saber que les falta. El filtro por `LocationScope`
 * (§8.4) escondería justo eso. Lo que SÍ se filtra siempre es el `tenant_id`.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
// El tipo vive en `qr-svg.ts` y no acá: lo comparten la ruta y la pantalla, y un
// `route.ts` de Next no es sitio para exportar nada que no sea un handler.
import type { QrLocation } from '@/lib/utils/qr-svg'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch (err) {
    // `requireTenantId()` LANZA cuando el JWT del admin no trae `tenant_id`
    // (sesión anterior a la migración multitenant). Sin este catch es un 500 sin cuerpo.
    console.error('[QrLocations] Error resolviendo tenant:', err)
    return NextResponse.json(
      { error: 'Sesión inválida', message: 'Vuelve a iniciar sesión para continuar.' },
      { status: 401 }
    )
  }

  const { data, error } = await getServiceClient()
    .from('restaurant_locations')
    .select('id, name, slug, domain, is_primary')
    // No es decorativo: esta ruta usa `service_role`, que se salta el RLS.
    // El aislamiento entre marcas son estos filtros a mano.
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    // El MISMO orden que `getActiveLocations()` (`src/lib/tenant.ts`): es el orden
    // en el que se le presentan las sedes a una persona en todo el producto.
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  // Con supabase-js, `data` es `null` tanto si falló como si no hay filas: los dos
  // casos son indistinguibles si no se mira el `error`. Y acá la diferencia importa —
  // "no tenés sedes" y "no pude leer tus sedes" mandan a hacer cosas distintas.
  if (isDbFailure(error)) {
    logDbFailure({ scope: 'QrLocations', reason: 'locations_read_error', error, context: { tenantId } })
    return NextResponse.json({ error: 'No se pudieron leer las sedes' }, { status: 500 })
  }

  return NextResponse.json((data ?? []) as QrLocation[])
}
