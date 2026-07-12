import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import {
  getCampaignRewards,
  createCampaignReward,
  updateCampaignReward,
  deactivateCampaignReward,
} from '@/services/campaign-reward.service'

/**
 * Catálogo de premios de campaña (Dashboard > Premios de campaña).
 *
 * Los premios que las campañas otorgan como `reward_grants`: reactivación agresiva hoy;
 * referidos, promos y recompensa por reseña después.
 *
 * Ref: docs/features/reward-grants.md
 */

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** GET — Lista el catálogo. `?active=true` para solo los activos. */
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const tenantId = await requireTenantId()
    const onlyActive = new URL(request.url).searchParams.get('active') === 'true'
    const rewards = await getCampaignRewards(tenantId, onlyActive)
    return NextResponse.json(rewards)
  } catch (error) {
    console.error('[CampaignRewards] Error GET:', error)
    return NextResponse.json({ error: 'Error obteniendo el catálogo' }, { status: 500 })
  }
}

/** POST — Crea un premio. */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''

    if (!title) {
      return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    const reward = await createCampaignReward(
      { title, description: body.description?.trim() || null },
      tenantId
    )
    return NextResponse.json(reward, { status: 201 })
  } catch (error) {
    console.error('[CampaignRewards] Error POST:', error)
    return NextResponse.json({ error: 'Error creando el premio' }, { status: 500 })
  }
}

/** PATCH — Actualiza un premio (título, descripción o estado). */
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
    }

    const patch: { title?: string; description?: string | null; is_active?: boolean } = {}
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
    if ('description' in body) patch.description = body.description?.trim() || null
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    const reward = await updateCampaignReward(body.id, patch, tenantId)
    return NextResponse.json(reward)
  } catch (error) {
    console.error('[CampaignRewards] Error PATCH:', error)
    return NextResponse.json({ error: 'Error actualizando el premio' }, { status: 500 })
  }
}

/**
 * DELETE — Baja lógica, no borrado.
 *
 * Los `reward_grants` ya otorgados guardan el título como snapshot, así que retirar un
 * premio del catálogo no rompe nada de lo que hay en curso: los clientes que ya lo tienen
 * lo siguen viendo y el mesero lo sigue pudiendo entregar.
 */
export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    await deactivateCampaignReward(id, tenantId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[CampaignRewards] Error DELETE:', error)
    return NextResponse.json({ error: 'Error desactivando el premio' }, { status: 500 })
  }
}
