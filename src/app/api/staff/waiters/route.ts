import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveHostContext } from '@/lib/tenant'
import { resolveStaffAuth } from '@/lib/staff-auth'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

/**
 * GET /api/staff/waiters
 *
 * La lista del selector: los meseros ACTIVOS de la sede en la que está el aparato.
 *
 * Es el corazón de §19 y la razón de producto de D11. Textual del dueño (2026-09-05):
 * *"si metemos a todos de todas las sedes buscarse a la hora de entregar premio es una
 * focking bestialidad"*. Una lista de 8 nombres se recorre con el pulgar; una de 40 no.
 *
 * FAIL-CLOSED, NO FAIL-OPEN. Si no se puede resolver la sede del aparato, esta ruta
 * responde 409 y NO devuelve la marca entera. Devolver "todos por si acaso" sería
 * exactamente el resultado que el dueño rechazó, y encima disfrazado de éxito: la pantalla
 * no tendría forma de notar que el filtro no se aplicó. El 409 manda al aparato a asignarse
 * una sede, que se hace una sola vez.
 *
 * Ref: docs/features/staff-qr-scan.md · spec 2026-09-05-staff-scanner-19-design.md
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

    const auth = await resolveStaffAuth(request, tenant)
    // El fallo de base NO es un 401: decirle "no válido" al mesero cuando la base está
    // caída le hace reintentar con la misma credencial buena y deja el incidente invisible.
    if (auth.dbFailure) {
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos cargar los meseros ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Mesero o dispositivo no válido.' },
        { status: 401 }
      )
    }

    // ─── La sede: aparato → host → nada ───
    // Espejo de la precedencia del §3.1 (`src/lib/location-resolver.ts`), recortada a las
    // dos vías que un aparato puede aportar. El host cubre a las marcas de una sola sede
    // aunque su aparato todavía no la tenga guardada.
    const locationId = auth.deviceLocationId ?? hostContext.locationId ?? null

    if (!locationId) {
      return NextResponse.json(
        {
          error: 'Sede sin asignar',
          code: 'sede_no_asignada',
          message: 'Este aparato todavía no tiene sede. Asígnala una vez y no vuelve a pedirla.',
        },
        { status: 409 }
      )
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('staff_users')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('location_id', locationId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    // Sin esto, un timeout del pooler deja `data` en `null` —indistinguible de "esta sede no
    // tiene meseros"— y la pantalla muestra un selector vacío. El mesero concluye que lo
    // borraron y registra la visita sin atribuir a nadie, que es justo lo que §19 viene a
    // arreglar.
    if (isDbFailure(error)) {
      logDbFailure({
        scope: 'StaffWaiters',
        reason: 'waiters_lookup_error',
        error,
        context: { tenant: tenant.slug, location_id: locationId },
      })
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos cargar los meseros ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      ok: true,
      location_id: locationId,
      waiters: (data ?? []).map((w) => ({ id: w.id, name: w.name })),
    })
  } catch (error) {
    console.error('[StaffWaiters] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error cargando los meseros' },
      { status: 500 }
    )
  }
}
