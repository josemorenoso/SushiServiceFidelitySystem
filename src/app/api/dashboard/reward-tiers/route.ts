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

/** GET — Lista todos los reward_tiers ordenados por sort_order (incluye inactivos para el dashboard). */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const tenantId = await requireTenantId()
    const db = getServiceClient()
    const { data, error } = await db
      .from('reward_tiers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return NextResponse.json(data ?? [])
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
    const db = getServiceClient()

    // Verificar que no exista un tier con el mismo umbral
    const { data: existingThreshold } = await db
      .from('reward_tiers')
      .select('id')
      .eq('point_threshold', threshold)
      .eq('tenant_id', tenantId)
      .single()

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

    // Calcular sort_order: siguiente disponible
    const { data: allTiers } = await db
      .from('reward_tiers')
      .select('sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = (allTiers?.[0]?.sort_order ?? 0) + 1

    const blackFlag = is_black === true

    // Si es BLACK, verificar que no exista ya uno activo
    if (blackFlag) {
      const { data: existingBlack } = await db
        .from('reward_tiers')
        .select('id')
        .eq('is_black', true)
        .eq('is_active', true)
        .eq('tenant_id', tenantId)
        .single()

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

      // Verificar que no exista otro tier con el mismo umbral
      const { data: existingThreshold } = await db
        .from('reward_tiers')
        .select('id')
        .eq('point_threshold', threshold)
        .eq('tenant_id', tenantId)
        .neq('id', id)
        .single()

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

    // Verificar si hay clientes con este tier
    const { data: tier } = await db
      .from('reward_tiers')
      .select('tier_name')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

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
