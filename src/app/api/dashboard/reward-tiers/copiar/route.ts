/**
 * POST /api/dashboard/reward-tiers/copiar — darle premios PROPIOS a una sede,
 * partiendo de los de la marca.
 *
 * POR QUÉ ESTO EXISTE Y NO ES UN LUJO
 * ───────────────────────────────────
 * La regla de la 00058 es que una sede con filas propias usa **las suyas y solo
 * las suyas**. Sin este endpoint, el único camino para que Laureles tuviera un
 * premio distinto sería crear el primero a mano — y en el instante en que se
 * guarda ese primero, la sede deja de heredar y **se queda con UN solo nivel**.
 * El restaurante vería desaparecer sus otros tres premios sin haber borrado
 * nada. Es el modo de fallo más caro de la regla de reemplazo, y se tapa acá:
 * la sede estrena una copia de lo que ya tenía, y desde ahí edita.
 *
 * Es idempotente por negativa: si la sede YA tiene filas propias, responde 409 y
 * no toca nada. Copiar dos veces duplicaría los umbrales.
 *
 * Ref: docs/features/multi-sede.md §3.septies · migración 00058
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireLocationScope } from '@/lib/location-scope'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const scopeResult = await requireLocationScope(request)
    if (!scopeResult.ok) {
      return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
    }
    const { scope } = scopeResult

    const body = (await request.json()) as Record<string, unknown>
    const sede = typeof body.location_id === 'string' ? body.location_id : ''
    if (!UUID_RE.test(sede)) {
      return NextResponse.json({ error: 'Sede no válida' }, { status: 400 })
    }
    // `allowedLocationIds` de un alcance de marca son sus sedes activas, así que
    // esto comprueba de una vez que la sede exista, esté activa y sea suya.
    if (!scope.allowedLocationIds.includes(sede)) {
      return NextResponse.json({ error: 'No tienes permiso sobre esa sede.' }, { status: 403 })
    }

    const db = getServiceClient()

    const { data: filas, error } = await db
      .from('reward_tiers')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .order('sort_order', { ascending: true })

    // `supabase-js` no lanza: sin mirar el error, un fallo de base se leería como
    // "la marca no tiene niveles" y le copiaríamos CERO filas a la sede, que es
    // precisamente el estado que este endpoint existe para evitar.
    if (error) {
      console.error('[RewardTiers/copiar] No se pudieron leer los niveles:', error.message)
      return NextResponse.json({ error: 'No se pudieron leer los niveles' }, { status: 500 })
    }

    const todas = filas ?? []
    if (todas.some((f) => f.location_id === sede)) {
      return NextResponse.json(
        { error: 'Esa sede ya tiene sus propios premios. Editalos desde acá.' },
        { status: 409 }
      )
    }

    const deLaMarca = todas.filter((f) => f.location_id === null)
    if (deLaMarca.length === 0) {
      return NextResponse.json(
        { error: 'La marca todavía no tiene premios que copiar. Creá los de la marca primero.' },
        { status: 409 }
      )
    }

    // Se copia TODO salvo la identidad de la fila: `id` y `created_at` los pone
    // la base, y `location_id` es lo único que cambia de valor.
    const copias = deLaMarca.map((f) => ({
      tier_name: f.tier_name,
      point_threshold: f.point_threshold,
      safe_reward_title: f.safe_reward_title,
      mystery_box_enabled: f.mystery_box_enabled,
      mystery_prizes: f.mystery_prizes,
      is_black: f.is_black,
      sort_order: f.sort_order,
      is_active: f.is_active,
      tenant_id: scope.tenantId,
      location_id: sede,
    }))

    const { data: creadas, error: insertError } = await db
      .from('reward_tiers')
      .insert(copias)
      .select('id')

    if (insertError) {
      console.error('[RewardTiers/copiar] No se pudieron crear los niveles:', insertError.message)
      return NextResponse.json(
        { error: 'No se pudieron crear los premios de la sede' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, creados: creadas?.length ?? 0 })
  } catch (error) {
    console.error('[RewardTiers/copiar] Error:', error)
    return NextResponse.json({ error: 'No se pudieron copiar los premios' }, { status: 500 })
  }
}
