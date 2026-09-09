import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { elegirFilasDeSede } from '@/services/reward-tiers.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * La sede que pide esta petición, o `null` = «los de la MARCA».
 *
 * ⚠️ Esto NO es control de acceso: solo dice qué conjunto se mira. Quien decide
 * si el usuario puede tocar esa sede es `requireLocationScope()`. Acá alcanza
 * con el filtro por `tenant_id` de cada consulta, que es el aislamiento real
 * (`service_role` se salta el RLS).
 */
function sedePedida(raw: string | null | undefined): string | null {
  if (!raw || raw === 'brand' || raw === 'all') return null
  return UUID_RE.test(raw) ? raw : null
}

/**
 * El CUBO de un alcance: `location_id IS NULL` para la marca, `= <uuid>` para
 * una sede. Es el espejo del índice `reward_tiers_threshold_tenant_sede_unique`,
 * que resuelve lo mismo en SQL con `COALESCE(location_id, uuid cero)`.
 *
 * ⚠️ **Se escribe con un ternario sobre una VARIABLE, no con una función
 * ayudante**, y no es estilo: cualquier helper genérico
 * (`<T extends { eq(...): T }>`, o incluso con tipo `this`) obliga a TypeScript
 * a unificar el builder de supabase-js —ya profundamente genérico— dentro de
 * OTRO genérico, y acá revienta con **TS2589** ("Type instantiation is
 * excessively deep and possibly infinite") en cuanto se encadena `.maybeSingle()`
 * o `.order()`. Con una variable el tipo se infiere UNA vez y no hay problema.
 * Es la misma trampa que documenta `LocationFilterable` en
 * `src/lib/location-scope.ts`, con una salida distinta porque acá la de allá no
 * alcanza.
 */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * GET — Los reward_tiers que gobiernan en un alcance, por sort_order (incluye
 * inactivos, que el dashboard necesita para poder reactivarlos).
 *
 * `?location_id=<uuid>` elige la sede; sin él, o con `brand`, son los de la
 * MARCA. La regla de resolución es `elegirFilasDeSede()` y está escrita una sola
 * vez: una sede con filas propias usa las suyas, una sin filas hereda las de la
 * marca (00058 §3).
 *
 * ⚠️ **SIGUE DEVOLVIENDO UN ARRAY, y eso no es negociable.** Tiene DOS
 * consumidores —`dashboard/rewards` y `dashboard/settings:226`, que hace
 * `r.ok ? r.json() : []` y lo usa como lista— así que envolverlo en un objeto
 * para poder mandar metadatos dejaría el selector de premios de Ajustes vacío
 * **en silencio**. Es exactamente la trampa que `/api/dashboard/location` ya
 * tiene documentada. Si el panel necesita saber si está heredando, lo deduce:
 * pidió una sede y todo lo que volvió tiene `location_id === null`.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const tenantId = await requireTenantId()
    const sede = sedePedida(new URL(request.url).searchParams.get('location_id'))
    const db = getServiceClient()
    const { data, error } = await db
      .from('reward_tiers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return NextResponse.json(elegirFilasDeSede(data ?? [], sede))
  } catch (error) {
    console.error('[RewardTiers] Error GET:', error)
    return NextResponse.json({ error: 'Error obteniendo tiers' }, { status: 500 })
  }
}

/** POST — Crea un nuevo reward tier. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const {
      tier_name,
      point_threshold,
      safe_reward_title,
      mystery_box_enabled,
      mystery_prizes,
      is_black,
    } = body

    if (!tier_name || typeof tier_name !== 'string' || !tier_name.trim()) {
      return NextResponse.json({ error: 'tier_name es requerido' }, { status: 400 })
    }

    const threshold = parseInt(String(point_threshold))
    if (isNaN(threshold) || threshold < 1) {
      return NextResponse.json({ error: 'point_threshold debe ser un número positivo' }, { status: 400 })
    }

    if (!safe_reward_title || typeof safe_reward_title !== 'string' || !safe_reward_title.trim()) {
      return NextResponse.json({ error: 'safe_reward_title es requerido' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    // La sede duena del nivel. `null` = de la MARCA, que es lo de siempre.
    const sede = sedePedida(typeof body.location_id === 'string' ? body.location_id : null)
    const db = getServiceClient()

    // Verificar que no exista un tier con el mismo umbral. No hay UNIQUE en `point_threshold`
    // que sostenga esta regla: ante un fallo de base `existingThreshold` llegaba `null`, el
    // código concluía "no hay duplicado" y el INSERT de abajo creaba un tier duplicado real,
    // sin ningún constraint que lo impidiera.
    // El umbral es único DENTRO de su cubo: la marca tiene el suyo y cada sede
    // el suyo. Sin acotar, Laureles no podría tener su propio «Oro a los 100»
    // porque chocaría con el de la marca — que es justo lo que la 00058 vino a
    // permitir.
    let consultaUmbral = db
      .from('reward_tiers')
      .select('id')
      .eq('point_threshold', threshold)
      .eq('tenant_id', tenantId)
    consultaUmbral =
      sede === null
        ? consultaUmbral.is('location_id', null)
        : consultaUmbral.eq('location_id', sede)

    const { data: existingThreshold, error: existingThresholdError } =
      await consultaUmbral.maybeSingle()

    if (isDbFailure(existingThresholdError)) {
      logDbFailure({
        scope: 'RewardTiers',
        reason: 'threshold_dup_check_error',
        error: existingThresholdError,
        context: { tenant_id: tenantId, threshold },
      })
      return NextResponse.json(
        { error: 'Problema técnico', message: 'No pudimos verificar el umbral ahora mismo. Intenta de nuevo en un momento.' },
        { status: 503 }
      )
    }

    if (existingThreshold) {
      return NextResponse.json(
        { error: `Ya existe un tier con umbral de ${threshold} puntos` },
        { status: 409 }
      )
    }

    // Validar probabilidades de mystery box si está habilitado
    const boxEnabled = mystery_box_enabled === true
    let prizes = mystery_prizes ?? []

    if (boxEnabled) {
      if (!Array.isArray(prizes) || prizes.length === 0) {
        return NextResponse.json(
          { error: 'Mystery Box habilitada requiere al menos 1 premio' },
          { status: 400 }
        )
      }
      const totalProb = prizes.reduce((sum: number, p: { probability?: number }) => sum + (p.probability ?? 0), 0)
      if (Math.abs(totalProb - 100) > 0.01) {
        return NextResponse.json(
          { error: `Las probabilidades deben sumar 100% (actual: ${totalProb}%)` },
          { status: 400 }
        )
      }
    }

    // Calcular sort_order: siguiente disponible. Ante un fallo de base esto no debe
    // fundirse con "no hay tiers todavía" (que da nextOrder=1 legítimamente): un fallo
    // aquí puede colisionar el sort_order del tier nuevo con uno existente.
    // El sort_order también se cuenta POR CUBO: si no, una sede que estrena sus
    // premios arrancaría numerando desde donde quedó la marca.
    let consultaOrden = db
      .from('reward_tiers')
      .select('sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: false })
      .limit(1)
    consultaOrden =
      sede === null
        ? consultaOrden.is('location_id', null)
        : consultaOrden.eq('location_id', sede)

    const { data: allTiers, error: allTiersError } = await consultaOrden

    if (isDbFailure(allTiersError)) {
      logDbFailure({
        scope: 'RewardTiers',
        reason: 'sort_order_lookup_error',
        error: allTiersError,
        context: { tenant_id: tenantId },
      })
      return NextResponse.json(
        { error: 'Problema técnico', message: 'No pudimos calcular el orden del tier ahora mismo. Intenta de nuevo en un momento.' },
        { status: 503 }
      )
    }

    const nextOrder = (allTiers?.[0]?.sort_order ?? 0) + 1

    const blackFlag = is_black === true

    // Si es BLACK, verificar que no exista ya uno activo. Sin backing UNIQUE: un fallo de
    // base en esta lectura dejaría crear un segundo tier BLACK activo en silencio.
    if (blackFlag) {
      // Por cubo, igual que el umbral: cada sede puede tener SU nivel Black, y
      // dos Black activos dentro del MISMO cubo siguen prohibidos.
      let consultaBlack = db
        .from('reward_tiers')
        .select('id')
        .eq('is_black', true)
        .eq('is_active', true)
        .eq('tenant_id', tenantId)
      consultaBlack =
        sede === null
          ? consultaBlack.is('location_id', null)
          : consultaBlack.eq('location_id', sede)

      const { data: existingBlack, error: existingBlackError } = await consultaBlack.maybeSingle()

      if (isDbFailure(existingBlackError)) {
        logDbFailure({
          scope: 'RewardTiers',
          reason: 'black_dup_check_error',
          error: existingBlackError,
          context: { tenant_id: tenantId },
        })
        return NextResponse.json(
          { error: 'Problema técnico', message: 'No pudimos verificar el tier BLACK ahora mismo. Intenta de nuevo en un momento.' },
          { status: 503 }
        )
      }

      if (existingBlack) {
        return NextResponse.json(
          { error: 'Ya existe un tier BLACK activo. Desactívalo primero.' },
          { status: 409 }
        )
      }
    }

    const { data: tier, error } = await db
      .from('reward_tiers')
      .insert({
        tier_name: tier_name.trim(),
        point_threshold: threshold,
        safe_reward_title: safe_reward_title.trim(),
        mystery_box_enabled: boxEnabled,
        mystery_prizes: boxEnabled ? prizes : [],
        is_black: blackFlag,
        sort_order: nextOrder,
        is_active: true,
        tenant_id: tenantId,
        // `null` = de la MARCA. La FK compuesta (location_id, tenant_id) impide
        // que esto apunte a una sede de otra marca aunque el uuid llegue del
        // navegador: el motor lo rechaza, no este archivo.
        location_id: sede,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(tier, { status: 201 })
  } catch (error) {
    console.error('[RewardTiers] Error POST:', error)
    return NextResponse.json({ error: 'Error creando tier' }, { status: 500 })
  }
}

/** PATCH — Actualiza un reward tier existente. */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const tenantId = await requireTenantId()
    const db = getServiceClient()
    const updates: Record<string, unknown> = {}

    if (typeof body.tier_name === 'string') {
      const trimmed = body.tier_name.trim()
      if (!trimmed) return NextResponse.json({ error: 'tier_name no puede ser vacío' }, { status: 400 })
      updates.tier_name = trimmed
    }

    if (body.point_threshold !== undefined) {
      const threshold = parseInt(String(body.point_threshold))
      if (isNaN(threshold) || threshold < 1) {
        return NextResponse.json({ error: 'point_threshold debe ser positivo' }, { status: 400 })
      }

      // Verificar que no exista otro tier con el mismo umbral EN SU MISMO CUBO.
      //
      // ⚠️ Sin el filtro de cubo, este chequeo devolvia un 409 FALSO en cuanto una
      // sede estrenaba premios propios: sus niveles son una COPIA de los de la
      // marca, asi que cada umbral existe dos veces —una en la marca, otra en la
      // sede— y guardar cualquiera de los dos chocaba contra el otro. O sea que
      // «Darle premios propios» dejaba los niveles de esa sede Y los de la marca
      // imposibles de editar. La sede del tier que se esta editando se lee de la
      // fila, no del cuerpo: nadie puede mudar un nivel de cubo por accidente.
      const { data: filaActual, error: filaActualError } = await db
        .from('reward_tiers')
        .select('location_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (isDbFailure(filaActualError)) {
        logDbFailure({
          scope: 'RewardTiers',
          reason: 'tier_cubo_lookup_error',
          error: filaActualError,
          context: { tenant_id: tenantId, id },
        })
        return NextResponse.json(
          { error: 'Problema técnico', message: 'No pudimos verificar el umbral ahora mismo. Intenta de nuevo en un momento.' },
          { status: 503 }
        )
      }

      const cuboActual = (filaActual?.location_id as string | null) ?? null

      let consultaDup = db
        .from('reward_tiers')
        .select('id')
        .eq('point_threshold', threshold)
        .eq('tenant_id', tenantId)
        .neq('id', id)
      consultaDup =
        cuboActual === null
          ? consultaDup.is('location_id', null)
          : consultaDup.eq('location_id', cuboActual)

      const { data: existingThreshold, error: existingThresholdError } = await consultaDup.maybeSingle()

      if (isDbFailure(existingThresholdError)) {
        logDbFailure({
          scope: 'RewardTiers',
          reason: 'threshold_dup_check_error',
          error: existingThresholdError,
          context: { tenant_id: tenantId, threshold, id },
        })
        return NextResponse.json(
          { error: 'Problema técnico', message: 'No pudimos verificar el umbral ahora mismo. Intenta de nuevo en un momento.' },
          { status: 503 }
        )
      }

      if (existingThreshold) {
        return NextResponse.json(
          { error: `Ya existe otro tier con umbral de ${threshold} puntos` },
          { status: 409 }
        )
      }
      updates.point_threshold = threshold
    }

    if (typeof body.safe_reward_title === 'string') {
      const trimmed = body.safe_reward_title.trim()
      if (!trimmed) return NextResponse.json({ error: 'safe_reward_title no puede ser vacío' }, { status: 400 })
      updates.safe_reward_title = trimmed
    }

    if (typeof body.mystery_box_enabled === 'boolean') {
      updates.mystery_box_enabled = body.mystery_box_enabled
    }

    if (body.mystery_prizes !== undefined) {
      const prizes = body.mystery_prizes
      if (Array.isArray(prizes)) {
        // Validar probabilidades si mystery box estará habilitada
        const willBeEnabled = body.mystery_box_enabled ?? true
        if (willBeEnabled && prizes.length > 0) {
          const totalProb = prizes.reduce((sum: number, p: { probability?: number }) => sum + (p.probability ?? 0), 0)
          if (Math.abs(totalProb - 100) > 0.01) {
            return NextResponse.json(
              { error: `Las probabilidades deben sumar 100% (actual: ${totalProb}%)` },
              { status: 400 }
            )
          }
        }
        updates.mystery_prizes = prizes
      }
    }

    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
    if (typeof body.is_black === 'boolean') updates.is_black = body.is_black
    if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const { data: tier, error } = await db
      .from('reward_tiers')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(tier)
  } catch (error) {
    console.error('[RewardTiers] Error PATCH:', error)
    return NextResponse.json({ error: 'Error actualizando tier' }, { status: 500 })
  }
}

/** DELETE — Soft-delete (desactiva) un tier. Si no tiene clientes, permite hard-delete. */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const hard = searchParams.get('hard') === 'true'

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const tenantId = await requireTenantId()
    const db = getServiceClient()

    // Verificar si hay clientes con este tier. Sin esto, un fallo de base aquí se
    // confundía con "Tier no encontrado" (404) en vez del fallo real.
    const { data: tier, error: tierError } = await db
      .from('reward_tiers')
      .select('tier_name')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (isDbFailure(tierError)) {
      logDbFailure({
        scope: 'RewardTiers',
        reason: 'tier_lookup_error',
        error: tierError,
        context: { tenant_id: tenantId, id },
      })
      return NextResponse.json(
        { error: 'Problema técnico', message: 'No pudimos verificar el tier ahora mismo. Intenta de nuevo en un momento.' },
        { status: 503 }
      )
    }

    if (!tier) {
      return NextResponse.json({ error: 'Tier no encontrado' }, { status: 404 })
    }

    const { count } = await db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('current_tier', tier.tier_name)
      .eq('tenant_id', tenantId)

    if ((count ?? 0) > 0 || !hard) {
      // Soft delete: desactivar
      const { error } = await db
        .from('reward_tiers')
        .update({ is_active: false })
        .eq('id', id)
        .eq('tenant_id', tenantId)

      if (error) throw error
      return NextResponse.json({ ok: true, action: 'deactivated', customers_affected: count ?? 0 })
    }

    // Hard delete solo si no hay clientes
    const { error } = await db.from('reward_tiers').delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) throw error
    return NextResponse.json({ ok: true, action: 'deleted' })
  } catch (error) {
    console.error('[RewardTiers] Error DELETE:', error)
    return NextResponse.json({ error: 'Error eliminando tier' }, { status: 500 })
  }
}
