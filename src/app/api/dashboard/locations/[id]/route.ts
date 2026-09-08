/**
 * PATCH /api/dashboard/locations/[id] — editar UNA sede.
 *
 * Es la mitad que faltaba de multi-sede: hasta hoy el cliente podía VER sus
 * sedes (el selector) pero no tocar ninguna salvo la principal, y solo sus
 * cinco columnas de geocerca (`/api/dashboard/location`, en singular). La ficha
 * de Google, la dirección, el horario y los teléfonos de la segunda sede no
 * tenían pantalla en ningún lado — ni acá ni en el AIOS.
 *
 * DOS ESCRITURAS, NO UNA — y por qué no se pueden fundir
 * ─────────────────────────────────────────────────────
 *   1. Las COLUMNAS (`name`, `address`, `lat`/`lon`, `radius_meters`,
 *      `is_active`, `sort_order`) → un UPDATE normal.
 *   2. El `config` (ficha de Google, redes, contacto) → `merge_location_config_deep()`,
 *      porque `config` es un jsonb con TODO lo de la sede y un UPDATE que lo
 *      reemplazara entero borraría lo que esta petición no menciona. Es el mismo
 *      motivo por el que `tenants.config` se escribe con su propia función.
 *
 * Van en ese orden y **no** en una transacción: PostgREST no expone una. Si la
 * segunda falla, la primera ya quedó — se responde 500 nombrando cuál falló, y
 * el panel vuelve a pedir el estado real. Se prefiere eso a escribir el jsonb a
 * mano en el UPDATE, que es exactamente la ventana de carrera que la 00032 vino
 * a cerrar.
 *
 * LO QUE NO SE PUEDE CAMBIAR DESDE ACÁ
 * ────────────────────────────────────
 *   · `slug` y `domain` — el subdominio puede estar IMPRESO en los QR y es único
 *     en todo el producto. Lo mueve el AIOS con `aios_set_location()`, que sabe
 *     rechazar el que ya se estrenó (`sede_dominio_congelado`, 00056).
 *   · `is_primary` — la sede principal es la que hereda el dominio raíz de la
 *     marca; cambiarla en caliente reatribuye el material impreso.
 *   · Crear o borrar sedes — eso cambia lo que el restaurante PAGA. Va por el AIOS.
 *
 * Ref: docs/features/multi-sede.md §7 · migración 00058
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireLocationScope } from '@/lib/location-scope'
import { buildLocationConfigPatch, isLocationEditablePath } from '@/lib/location-config-paths'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Coordenada válida, o `null` para "sin geocerca". Media coordenada no existe. */
function coord(raw: unknown, min: number, max: number): number | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n < min || n > max) return undefined
  return n
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Sede no válida' }, { status: 400 })
    }

    const scopeResult = await requireLocationScope(request)
    if (!scopeResult.ok) {
      return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
    }
    const { scope } = scopeResult

    // Un «administrador» solo toca SU sede. El super usuario, cualquiera de su
    // marca. Mismo mensaje para "no existe", "es de otra marca" y "no tienes
    // permiso": la diferencia le diría a un admin de sede qué sedes hay.
    if (scope.role !== 'brand' && !scope.allowedLocationIds.includes(id)) {
      return NextResponse.json({ error: 'No tienes permiso sobre esa sede' }, { status: 403 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const service = getServiceClient()

    // ─── El estado actual, y de paso la comprobación de que es de esta marca ──
    const { data: actual, error: leerError } = await service
      .from('restaurant_locations')
      .select('id, name, is_active, is_primary')
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle()

    if (leerError) {
      console.error('[Locations] No se pudo leer la sede:', leerError.message)
      return NextResponse.json({ error: 'No se pudo leer la sede' }, { status: 500 })
    }
    if (!actual) {
      return NextResponse.json({ error: 'No tienes permiso sobre esa sede' }, { status: 403 })
    }

    // ─── 1. Las columnas ──────────────────────────────────────────────────────
    const columnas: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim()
      if (name.length === 0) {
        return NextResponse.json({ error: 'La sede necesita un nombre' }, { status: 400 })
      }
      if (name.length > 120) {
        return NextResponse.json({ error: 'El nombre no puede pasar de 120 caracteres' }, { status: 400 })
      }
      columnas.name = name
    }

    if (body.address !== undefined) {
      const address = String(body.address ?? '').trim()
      columnas.address = address.length > 0 ? address.slice(0, 300) : null
    }

    // `lat`/`lon` van JUNTAS o ninguna: media coordenada no es una ubicación, es
    // un dato roto que `calculate_distance()` convertiría en NULL sin avisar. Lo
    // impone `restaurant_locations_latlon_pair_check` (00041); se comprueba acá
    // para explicarlo en vez de devolver un 23514 críptico.
    if (body.lat !== undefined || body.lon !== undefined) {
      const lat = coord(body.lat, -90, 90)
      const lon = coord(body.lon, -180, 180)
      if (lat === undefined || lon === undefined) {
        return NextResponse.json(
          { error: 'Latitud y longitud van juntas, y tienen que ser números válidos. Dejá las dos vacías para quitar la geocerca.' },
          { status: 400 }
        )
      }
      if ((lat === null) !== (lon === null)) {
        return NextResponse.json(
          { error: 'Media coordenada no ubica nada: cargá latitud y longitud, o dejá las dos vacías.' },
          { status: 400 }
        )
      }
      columnas.lat = lat
      columnas.lon = lon
    }

    if (body.radius_meters !== undefined) {
      const n = Number(body.radius_meters)
      if (!Number.isFinite(n) || n < 10 || n > 20000) {
        return NextResponse.json({ error: 'El radio va entre 10 y 20.000 metros' }, { status: 400 })
      }
      columnas.radius_meters = Math.round(n)
    }

    if (body.sort_order !== undefined) {
      const n = Number(body.sort_order)
      if (!Number.isFinite(n) || n < 0 || n > 9999) {
        return NextResponse.json({ error: 'El orden va entre 0 y 9999' }, { status: 400 })
      }
      columnas.sort_order = Math.round(n)
    }

    if (body.is_active !== undefined) {
      const activa = body.is_active === true
      // Solo el super usuario abre y cierra locales: para un admin de sede,
      // desactivar la suya sería echarse a sí mismo del panel (su alcance se
      // interseca con las ACTIVAS y quedaría en 403 sin entender por qué).
      if (scope.role !== 'brand') {
        return NextResponse.json(
          { error: 'Solo un super usuario puede activar o desactivar una sede.' },
          { status: 403 }
        )
      }
      if (!activa) {
        // Desactivar la ÚLTIMA sede activa deja a la marca sin ninguna, y una
        // marca sin sedes es inservible: no resuelve el host, no atribuye
        // check-ins y el panel entero se queda sin alcance. Se corta acá.
        const { count, error: contarError } = await service
          .from('restaurant_locations')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', scope.tenantId)
          .eq('is_active', true)

        if (contarError) {
          console.error('[Locations] No se pudieron contar las sedes activas:', contarError.message)
          return NextResponse.json({ error: 'No se pudo verificar el cambio' }, { status: 500 })
        }
        if ((count ?? 0) <= 1 && actual.is_active === true) {
          return NextResponse.json(
            { error: 'Es la única sede activa de la marca: si la desactivás, el restaurante se queda sin local.' },
            { status: 409 }
          )
        }
      }
      columnas.is_active = activa
    }

    if (Object.keys(columnas).length > 0) {
      columnas.updated_at = new Date().toISOString()
      const { error: updateError } = await service
        .from('restaurant_locations')
        .update(columnas)
        .eq('id', id)
        .eq('tenant_id', scope.tenantId)

      if (updateError) {
        console.error('[Locations] No se pudo guardar la sede:', updateError.message)
        return NextResponse.json({ error: 'No se pudieron guardar los datos de la sede' }, { status: 500 })
      }
    }

    // ─── 2. El `config` de la sede ────────────────────────────────────────────
    const configBody = (body.config ?? {}) as Record<string, unknown>
    const rutas = Object.keys(configBody).filter(isLocationEditablePath)

    if (rutas.length > 0) {
      const built = buildLocationConfigPatch(configBody)
      if (!built.ok) {
        return NextResponse.json({ error: built.error }, { status: 400 })
      }

      // `merge_location_config_deep` filtra por tenant_id ADEMÁS del id (00058
      // §2): el uuid llega del navegador y esa comprobación vive en la base, no
      // acá, para que no exista una segunda ruta que la olvide.
      const { data: guardada, error: mergeError } = await service.rpc('merge_location_config_deep', {
        p_tenant_id: scope.tenantId,
        p_location_id: id,
        p_patch: built.patch,
      })

      if (mergeError) {
        console.error('[Locations] No se pudo guardar el config de la sede:', mergeError)
        // 42883 = la función no existe todavía. Es EL error que se ve cuando el
        // código se despliega antes de aplicar la migración, y sin nombrarlo se
        // lee como un fallo genérico durante horas.
        const código = (mergeError as { code?: string }).code
        if (código === '42883') {
          return NextResponse.json(
            { error: 'Falta aplicar la migración 00058 en la base: merge_location_config_deep() no existe.' },
            { status: 503 }
          )
        }
        return NextResponse.json({ error: 'No se pudo guardar la información de la sede' }, { status: 500 })
      }

      // La función devuelve NULL si no encontró la sede EN ESTA MARCA. Con las
      // comprobaciones de arriba no debería pasar nunca; si pasa, es que algo
      // cambió entre medias y no se puede decir que se guardó.
      if (guardada === null) {
        return NextResponse.json({ error: 'No tienes permiso sobre esa sede' }, { status: 403 })
      }
    }

    return NextResponse.json({ ok: true, paths: rutas, columns: Object.keys(columnas) })
  } catch (error) {
    console.error('[Locations] Error:', error)
    return NextResponse.json({ error: 'No se pudo guardar la sede' }, { status: 500 })
  }
}
