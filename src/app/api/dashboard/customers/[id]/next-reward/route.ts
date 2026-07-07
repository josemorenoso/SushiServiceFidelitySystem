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

  const { data: customer } = await db
    .from('customers')
    .select('total_points')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!customer) return NextResponse.json({ next_tier: null })

  const { data: nextTier } = await db
    .from('reward_tiers')
    .select('tier_name, point_threshold, safe_reward_title')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .gt('point_threshold', customer.total_points ?? 0)
    .order('point_threshold', { ascending: true })
    .limit(1)
    .single()

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
