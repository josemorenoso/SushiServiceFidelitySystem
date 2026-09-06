import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveHostContext } from '@/lib/tenant'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

/**
 * GET /api/staff/locations
 *
 * Las sedes activas de la marca, para el paso "¿dónde queda este celular?" de la activación.
 *
 * `auto` es la respuesta a la preocupación que el dueño puso por escrito el 2026-09-05
 * ("me parece que se va a volver un revoltillo completo"): cuando la marca tiene UNA sola
 * sede, el paso no se muestra y la sede se asigna sola. Elegir entre una opción no es una
 * decisión, es un trámite — y hoy eso es casi todo el parque de los 25.
 *
 * SIN SESIÓN A PROPÓSITO: esta ruta se consulta ANTES de activar el aparato, o sea antes de
 * que exista sesión alguna. Lo único que devuelve son los nombres de las sedes de la marca
 * del dominio — información que ya está en la carta y en Google Maps. El aislamiento real es
 * el `.eq('tenant_id', …)`: una marca no ve las sedes de otra.
 *
 * ⚠️ NO es `/api/dashboard/location`, cuyo contrato es un OBJETO PLANO y que rompe
 * `dashboard/settings/page.tsx` si se le devuelve una lista. Son rutas distintas a propósito.
 *
 * Ref: docs/features/staff-qr-scan.md · docs/features/multi-sede.md
 */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function GET(request: NextRequest) {
  try {
    // Multi-sede F4 (D11): `resolveHostContext` resuelve la marca TAMBIEN por
    // `restaurant_locations.domain`. Sin eso, el mesero de la sede 2 abre
    // `laureles.marca.com/mesero` y toda esta superficie responde 404. `getTenantByDomain`
    // solo mira `tenants.domain` y CONSERVA su firma: la sede viaja por aqui.
    const hostContext = await resolveHostContext(request.headers.get('host'))
    const tenant = hostContext.tenant
    if (!tenant) {
      return NextResponse.json(
        { error: 'Restaurante no reconocido', message: 'No se pudo identificar el restaurante para este dominio' },
        { status: 404 }
      )
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('restaurant_locations')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    // Un fallo de base deja `data` en `null`, que es indistinguible de "esta marca no tiene
    // sedes". Con la diferencia de que la segunda lectura hace que la pantalla ofrezca
    // activar el aparato SIN sede, y un aparato sin sede no puede listar meseros.
    if (isDbFailure(error)) {
      logDbFailure({
        scope: 'StaffLocations',
        reason: 'locations_lookup_error',
        error,
        context: { tenant: tenant.slug },
      })
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos cargar las sedes ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }

    const locations = (data ?? []).map((l) => ({ id: l.id, name: l.name }))

    // Si el host ya resolvió una sede (subdominio de sede), esa gana y tampoco se pregunta.
    const auto =
      hostContext.locationId ?? (locations.length === 1 ? locations[0].id : null)

    return NextResponse.json({ ok: true, locations, auto })
  } catch (error) {
    console.error('[StaffLocations] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error cargando las sedes' },
      { status: 500 }
    )
  }
}
