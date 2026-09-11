import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { getSettingValue } from '@/services/settings.service'
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  QrCampaignError,
  type CreateCampaignInput,
  type UpdateCampaignInput,
} from '@/services/qr-campaign.service'

export const dynamic = 'force-dynamic'

/**
 * Invitaciones con premio — docs/features/invite-campaigns.md
 *
 * GET    → las de la marca, cada una con cuántos se registraron / vinieron / vencieron.
 * POST   → crear. El slug se deriva del nombre si no viene.
 * PATCH  → editar (`id` en el body). El slug NO se edita: puede estar impreso.
 */

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const tenantId = await requireTenantId()
    const [campaigns, tenant, goldenBulletSlug] = await Promise.all([
      listCampaigns(tenantId),
      getTenantById(tenantId),
      getSettingValue('golden_bullet_invite_slug', tenantId),
    ])
    // El enlace que se comparte vive en el dominio PÚBLICO de la marca, que no
    // siempre es el host desde el que se mira el panel (un super-admin, por
    // ejemplo). Si la marca no tiene dominio propio, el origen de la petición.
    const publicBase = tenant?.domain
      ? `https://${tenant.domain}`
      : new URL(request.url).origin
    return NextResponse.json({
      campaigns,
      public_base: publicBase,
      golden_bullet_invite_slug: goldenBulletSlug ?? null,
    })
  } catch (error) {
    console.error('[QrCampaigns] GET:', error)
    return NextResponse.json({ error: 'No se pudieron listar las invitaciones' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const tenantId = await requireTenantId()
    const body = (await request.json()) as CreateCampaignInput
    const campaign = await createCampaign(body, tenantId)
    return NextResponse.json({ campaign }, { status: 201 })
  } catch (error) {
    if (error instanceof QrCampaignError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[QrCampaigns] POST:', error)
    return NextResponse.json({ error: 'No se pudo crear la invitación' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const tenantId = await requireTenantId()
    const body = (await request.json()) as UpdateCampaignInput & { id?: string }
    if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { id, ...cambios } = body
    const campaign = await updateCampaign(id, cambios, tenantId)
    return NextResponse.json({ campaign })
  } catch (error) {
    if (error instanceof QrCampaignError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[QrCampaigns] PATCH:', error)
    return NextResponse.json({ error: 'No se pudo guardar la invitación' }, { status: 500 })
  }
}
