/**
 * PUT /api/dashboard/locations/[id]/card — la TARJETA de una sede (sedes separadas, parte 2).
 *
 * El dueño, mirando Tepuy (2026-10-14): *«Si escojo una sede u otra, cuando voy a modificar la
 * tarjeta sale la misma para las dos, incoherente, a menos que haya un botón que diga "tarjetas
 * separadas"»*. Con «Una tarjeta para cada sede» (`tenants.config.card.mode = 'per_location'`,
 * que se elige en «Tarjeta principal»), cada sede tiene su sello, su decoración, su descripción y
 * sus políticas. Esto es lo que las guarda.
 *
 * QUIÉN PUEDE: un super usuario de la marca (o el operador de Cada1), NO un administrador de sede.
 * Es la misma regla que el resto de la tarjeta desde SEG-3 (`PUT tenant-config`, `brand-logo`):
 * la tarjeta muestra los puntos y los premios de la MARCA, y separarla por sede es una decisión de
 * la marca. Lo que sí es del administrador de su sede —la dirección, el horario, los teléfonos, las
 * redes y la ficha de Google— lo sigue cambiando él en «Mis sedes» (`PATCH /api/dashboard/locations/[id]`).
 * La puerta va PRIMERO, antes de leer el cuerpo, y falla CERRADO: 401 sin sesión, 403 sin alcance de
 * marca, 500 si la base falló (nunca un 403 por eso).
 *
 * QUÉ ESCRIBE: SOLO `LOCATION_CARD_PATH_NAMES` (`src/lib/location-config-paths.ts`), con las mismas
 * validaciones que la tarjeta de la marca. Lo demás se ignora; un valor mal formado corta con 400.
 * El vacío es «esto lo toma de la marca». Pasa por `merge_location_config_deep()`, que filtra por
 * `tenant_id` además del id: el uuid de la sede llega del navegador, y una sede de otra marca
 * devuelve NULL → 403, sin escribir nada.
 *
 * Esta ruta NO decide si la tarjeta de la sede se MUESTRA: eso lo decide `card.mode` de la marca
 * (`mergeLocationOverConfig()`, `src/lib/branding.ts`). Guardar con la tarjeta compartida es válido
 * y no cambia nada visible hasta que la marca separe.
 *
 * ⚠️ Necesita la migración 00074 (sin ella el CHECK rechaza las claves con 23514): se responde 503
 * con su número, en vez de un 500 que se lee como fallo genérico durante horas.
 *
 * Ref: docs/features/multi-sede.md §3.nonies · migración 00074
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { exigirAlcanceDeMarca } from '@/lib/alcance-de-marca'
import { buildLocationCardPatch } from '@/lib/location-config-paths'

/** Lo que lee en su pantalla un administrador de sede que intenta guardar. */
const SOLO_LA_MARCA_TARJETA =
  'La tarjeta de cada sede la cambia un super usuario de la marca. Los datos de tu sede (dirección, horario, teléfonos, redes) se cambian en Mis sedes.'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guardia = await exigirAlcanceDeMarca(request, SOLO_LA_MARCA_TARJETA)
    if (!guardia.ok) return guardia.res
    const tenantId = guardia.tenantId

    const { id } = await ctx.params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Sede no válida' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'El cuerpo tiene que ser un objeto' }, { status: 400 })
    }

    const built = buildLocationCardPatch(body)
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    const service = getServiceClient()
    const { data: guardada, error } = await service.rpc('merge_location_config_deep', {
      p_tenant_id: tenantId,
      p_location_id: id,
      p_patch: built.patch,
    })

    if (error) {
      const codigo = (error as { code?: string }).code
      console.error('[LocationCard] No se pudo guardar la tarjeta de la sede:', error)
      // 23514 = el CHECK de la sede rechazó las claves de la tarjeta: la 00074 no está aplicada.
      // 42883 = ni siquiera existe la función de la 00058.
      if (codigo === '23514' || codigo === '42883') {
        return NextResponse.json(
          { error: 'Falta aplicar la migración 00074 en la base: la tarjeta de cada sede todavía no se puede guardar.' },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: 'No se pudo guardar la tarjeta de la sede' }, { status: 500 })
    }

    // NULL = esa sede no es de esta marca (o no existe). Mismo mensaje para los dos casos: la
    // diferencia le diría a alguien qué uuids existen en otra marca.
    if (guardada === null) {
      return NextResponse.json({ error: 'No tienes permiso sobre esa sede' }, { status: 403 })
    }

    return NextResponse.json({ ok: true, paths: built.paths })
  } catch (error) {
    console.error('[LocationCard] Error:', error)
    return NextResponse.json({ error: 'No se pudo guardar la tarjeta de la sede' }, { status: 500 })
  }
}
