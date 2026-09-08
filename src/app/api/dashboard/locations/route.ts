/**
 * GET /api/dashboard/locations — TODAS las sedes de la marca, con todo lo que
 * el cliente puede editar de cada una.
 *
 * POR QUÉ EXISTE, SI YA ESTÁ `/api/dashboard/location`
 * ───────────────────────────────────────────────────
 * Esa (en singular) devuelve **la sede principal y nada más**, con las cinco
 * columnas de la geocerca, y su propio comentario lo dice: *"Editar una sede
 * DISTINTA de la principal necesita un selector"*. Su contrato es un OBJETO
 * PLANO y romperlo dejaría `dashboard/settings` con los campos vacíos en
 * silencio, así que **no se toca**: esta es la ruta nueva, en plural, y la vieja
 * se queda sirviendo a la pantalla de la geocerca hasta que esa pantalla muera.
 *
 * El pedido del dueño (2026-09-08) fue literal: *"el cliente debe poder ver sus
 * sedes, seleccionarlas y modificarlas desde un solo lugar, punto final"*.
 *
 * QUIÉN VE QUÉ
 * ────────────
 * El alcance sale de `requireLocationScope()`, que lo resuelve SIEMPRE en el
 * servidor contra `dashboard_user_locations` (00045). Los dos roles que pidió el
 * dueño ya existían ahí y no hubo que inventar nada:
 *
 *   · `role='brand'`    → «super usuario»: ve y edita TODAS las sedes.
 *   · `role='location'` → «administrador»: ve y edita SOLO la suya.
 *
 * QUÉ NO HACE ESTA RUTA, A PROPÓSITO: **crear ni borrar sedes.** Abrir un local
 * nuevo no es un cambio de configuración, es un cambio de lo que el restaurante
 * PAGA (cada sede es una mensualidad en el AIOS) y de lo que hay que imprimir
 * (su subdominio va en los QR). Eso se sigue haciendo desde el AIOS, con su
 * paso a paso. Acá se edita lo que ya existe.
 *
 * Ref: docs/features/multi-sede.md §7 · migración 00058
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireLocationScope } from '@/lib/location-scope'
import { projectLocationEditablePaths } from '@/lib/location-config-paths'
import { projectEditablePaths } from '@/lib/tenant-config-paths'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * Las columnas de la sede que el panel muestra o edita. `config` va entera y se
 * proyecta abajo: lo que viaja al navegador es la forma plana por rutas, la
 * misma que consume `/api/dashboard/tenant-config`.
 */
const COLUMNAS =
  'id, name, slug, domain, address, lat, lon, radius_meters, is_active, is_primary, sort_order, config'

export async function GET(request: Request) {
  try {
    const scopeResult = await requireLocationScope(request)
    if (!scopeResult.ok) {
      return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
    }
    const { scope } = scopeResult
    const service = getServiceClient()

    // Las DOS lecturas de una vez: las sedes y el `config` de la marca. La marca
    // viaja porque el panel enseña lo que cada campo vale HOY por herencia
    // ("Instagram: hereda @lamarca") en vez de un campo vacío que no dice si
    // está sin configurar o si lo hereda. Es la diferencia entre una pantalla
    // que se entiende y una que hay que explicar por teléfono.
    const [sedes, marca] = await Promise.all([
      service
        .from('restaurant_locations')
        .select(COLUMNAS)
        // `service_role` no aísla nada: el filtro por tenant es el aislamiento.
        .eq('tenant_id', scope.tenantId)
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      service.from('tenants').select('config').eq('id', scope.tenantId).single(),
    ])

    // `supabase-js` no lanza: sin mirar el `error`, un fallo de base sería
    // indistinguible de "esta marca no tiene sedes" — y el panel diría que el
    // restaurante no tiene locales. Se responde 500 y se ve.
    if (sedes.error) {
      console.error('[Locations] No se pudieron leer las sedes:', sedes.error.message)
      return NextResponse.json({ error: 'No se pudieron leer las sedes' }, { status: 500 })
    }
    if (marca.error) {
      console.error('[Locations] No se pudo leer la config de la marca:', marca.error.message)
      return NextResponse.json({ error: 'No se pudo leer la marca' }, { status: 500 })
    }

    const filas = (sedes.data ?? []) as Array<Record<string, unknown>>

    // Un `role='location'` no ve las sedes hermanas ni por asomo: el recorte va
    // acá, en el servidor, y no en el navegador.
    const visibles =
      scope.role === 'brand'
        ? filas
        : filas.filter((f) => scope.allowedLocationIds.includes(f.id as string))

    return NextResponse.json({
      role: scope.role,
      // Mismo interruptor que el selector: con una sola sede el panel no habla
      // de sedes, habla del local y punto.
      multiSede: filas.filter((f) => f.is_active === true).length >= 2,
      brandConfig: projectEditablePaths((marca.data?.config ?? {}) as Record<string, unknown>),
      locations: visibles.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        domain: f.domain,
        address: f.address,
        lat: f.lat,
        lon: f.lon,
        radius_meters: f.radius_meters,
        is_active: f.is_active,
        is_primary: f.is_primary,
        sort_order: f.sort_order,
        config: projectLocationEditablePaths((f.config ?? {}) as Record<string, unknown>),
      })),
    })
  } catch (error) {
    console.error('[Locations] Error:', error)
    return NextResponse.json({ error: 'No se pudieron leer las sedes' }, { status: 500 })
  }
}
