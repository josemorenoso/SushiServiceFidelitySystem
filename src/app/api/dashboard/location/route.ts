/**
 * GET/PUT /api/dashboard/location — la sede PRINCIPAL de la marca.
 *
 * Feature: `docs/features/multi-sede.md` (deuda #14, cerrada en F4)
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md`
 *
 * QUÉ ESTABA ROTO (y por qué se arregla en F4 y no antes)
 * ──────────────────────────────────────────────────────
 * Los dos handlers hacían `.single()` sobre `restaurant_locations` filtrando SOLO por
 * `tenant_id` + `is_active`. Con una sede funciona; con dos rompen, y de dos formas
 * distintas — que es lo peor de todo:
 *
 *   · El **GET** comprobaba el error, así que respondía **500**. Y como el consumidor
 *     (`dashboard/settings/page.tsx`) hace `r.ok ? r.json() : null`, la pantalla mostraba
 *     los campos vacíos como si no hubiera sede configurada: sin aviso y sin log.
 *   · El **PUT** DESCARTABA el error de su sonda de existencia (`const { data: existing }`,
 *     sin `error`). Con dos sedes, `.single()` devuelve error y `data = null`, así que
 *     `existing` quedaba null y el flujo caía al `else`: **INSERT de una TERCERA fila**, en
 *     silencio, con `is_primary = false` y `slug`/`domain` en NULL. Esa sede fantasma entra
 *     en `getActiveLocations()`, y con ella el dominio raíz de la marca deja de resolver
 *     «sede única implícita» — o sea, rompe la atribución de TODO el producto para ese
 *     tenant.
 *
 * Por eso NO bastaba con cambiar `.single()` por `.maybeSingle()`: con 2 filas eso también
 * devuelve error y `null`, y el PUT seguiría insertando. Hay que elegir la fila de forma
 * DETERMINISTA y, además, mirar el error.
 *
 * QUÉ HACE AHORA
 * ──────────────
 * Elige la sede **principal** con el mismo orden que `getActiveLocations()` de
 * `src/lib/tenant.ts` (`is_primary` DESC → `sort_order` ASC → `name` ASC) y se queda con la
 * primera. Ese orden no es un capricho: es el mismo con el que se le presentan las sedes a
 * una persona, y la 00042 dejó exactamente una `is_primary` por tenant vivo.
 *
 * ⚠️ **EL CONTRATO NO CAMBIA.** Sigue devolviendo un OBJETO PLANO con las mismas claves.
 * Devolver la lista de sedes rompería `dashboard/settings/page.tsx:297-301` en silencio
 * (`locationData.lat` → `undefined` → campos vacíos). Editar una sede DISTINTA de la
 * principal necesita un selector, y el selector es **F7** (`LocationScope`, migración 00045).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * Columnas que el panel de ajustes lee. NO se amplía con `slug`/`domain`/`config`: esta
 * pantalla es la de la geocerca, y esas tres las administra el AIOS (F8).
 */
const COLUMNAS = 'id, name, address, lat, lon, radius_meters, is_active'

/**
 * El MISMO orden que `getActiveLocations()` (`src/lib/tenant.ts`). Si los dos se separan,
 * el panel editaría una sede y el check-in atribuiría a otra.
 */
function sedesDeLaMarca(
  service: ReturnType<typeof getServiceClient>,
  tenantId: string,
  columnas: string
) {
  return service
    .from('restaurant_locations')
    .select(columnas)
    // El `.eq('tenant_id', …)` no es decorativo: esta ruta usa `service_role`, que se salta
    // el RLS. El aislamiento entre marcas son estos filtros a mano.
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(1)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const tenantId = await requireTenantId()
    const service = getServiceClient()
    // `maybeSingle()` sobre un `limit(1)` ya ordenado: con 2+ sedes devuelve la principal
    // en vez de reventar, y con 0 devuelve `null` sin error en vez de un 500.
    const { data, error } = await sedesDeLaMarca(service, tenantId, COLUMNAS).maybeSingle()

    if (error) {
      console.error('[Location] Error:', error)
      return NextResponse.json({ error: 'Error obteniendo ubicación' }, { status: 500 })
    }

    // Una marca sin ninguna sede activa no es un error del servidor: es una marca a la que
    // todavía no le configuraron la ubicación. El panel ya sabe pintar `null`.
    return NextResponse.json(data ?? null)
  } catch (err) {
    // `requireTenantId()` LANZA cuando el JWT del admin no trae `tenant_id` (sesión anterior
    // a la migración multitenant). Sin este catch el usuario recibía un 500 sin cuerpo.
    console.error('[Location] Error resolviendo tenant:', err)
    return NextResponse.json(
      { error: 'Sesión inválida', message: 'Vuelve a iniciar sesión para continuar.' },
      { status: 401 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { lat, lon, radius_meters, address } = body as {
    lat: number
    lon: number
    radius_meters?: number
    address?: string
  }

  if (lat == null || lon == null) {
    return NextResponse.json({ error: 'lat y lon son requeridos' }, { status: 400 })
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 })
  }

  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch (err) {
    console.error('[Location] Error resolviendo tenant:', err)
    return NextResponse.json(
      { error: 'Sesión inválida', message: 'Vuelve a iniciar sesión para continuar.' },
      { status: 401 }
    )
  }

  const service = getServiceClient()

  // La sonda de existencia. ⚠️ AQUÍ SE COMPRUEBA EL `error`: descartarlo es exactamente lo
  // que hacía nacer la tercera fila. Ante un fallo de lectura NO se inserta nada — insertar
  // "por si acaso" es la operación irreversible.
  const { data: existing, error: lookupError } = await sedesDeLaMarca(
    service,
    tenantId,
    'id'
  ).maybeSingle<{ id: string }>()

  if (lookupError) {
    console.error('[Location] Error buscando la sede principal:', lookupError)
    return NextResponse.json({ error: 'Error guardando ubicación' }, { status: 500 })
  }

  const updatePayload: Record<string, unknown> = {
    lat,
    lon,
    radius_meters: radius_meters ?? 20,
    updated_at: new Date().toISOString(),
  }
  if (address !== undefined) updatePayload.address = address

  let error
  if (existing) {
    const result = await service
      .from('restaurant_locations')
      .update(updatePayload)
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
    error = result.error
  } else {
    // Solo cuando la marca NO tiene ninguna sede activa. `is_primary` se deja en su default
    // (`false`) a propósito: ponerlo en `true` aquí podría dar una segunda principal si la
    // marca tuviera una sede DESACTIVADA que ya lo es, y nada en la base lo impide todavía
    // (deuda #3 de `docs/features/multi-sede.md`). La sede canónica la crea la 00042.
    const result = await service
      .from('restaurant_locations')
      .insert({ ...updatePayload, name: 'Sede principal', tenant_id: tenantId })
    error = result.error
  }

  if (error) {
    console.error('[Location] Error update:', error)
    return NextResponse.json({ error: 'Error guardando ubicación' }, { status: 500 })
  }

  console.log(`[Location] Actualizado: lat=${lat}, lon=${lon}, radius=${radius_meters ?? 20}`)
  return NextResponse.json({ message: 'Ubicación actualizada', lat, lon, radius_meters: radius_meters ?? 20 })
}
