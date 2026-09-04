import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const tenantId = await requireTenantId()
  const db = getServiceClient()

  // Sin destructurar `error`, un fallo de base aquí llegaba `null` igual que "cliente no
  // encontrado" y el endpoint respondía `{ next_tier: null }` — el widget del dashboard
  // se queda en blanco sin que nadie sepa que la base falló.
  const { data: customer, error: customerError } = await db
    .from('customers')
    .select('total_points')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (isDbFailure(customerError)) {
    logDbFailure({
      scope: 'NextReward',
      reason: 'customer_lookup_error',
      error: customerError,
      context: { tenant_id: tenantId, customer_id: id },
    })
    return NextResponse.json(
      { error: 'Problema técnico', message: 'No pudimos calcular la próxima recompensa ahora mismo.' },
      { status: 503 }
    )
  }

  if (!customer) return NextResponse.json({ next_tier: null })

  const { data: nextTier, error: nextTierError } = await db
    .from('reward_tiers')
    .select('tier_name, point_threshold, safe_reward_title')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .gt('point_threshold', customer.total_points ?? 0)
    .order('point_threshold', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (isDbFailure(nextTierError)) {
    logDbFailure({
      scope: 'NextReward',
      reason: 'next_tier_lookup_error',
      error: nextTierError,
      context: { tenant_id: tenantId, customer_id: id },
    })
    return NextResponse.json(
      { error: 'Problema técnico', message: 'No pudimos calcular la próxima recompensa ahora mismo.' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    next_tier: nextTier
      ? {
          name: nextTier.tier_name,
          threshold: nextTier.point_threshold,
          safe_reward: nextTier.safe_reward_title,
          points_remaining: nextTier.point_threshold - (customer.total_points ?? 0),
        }
      : null,
  })
}
