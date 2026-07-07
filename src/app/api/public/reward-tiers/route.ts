import { NextRequest, NextResponse } from 'next/server'
import { getAllTiers } from '@/services/reward-tiers.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { getTenantByDomain } from '@/lib/tenant'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = rateLimit(`public-tiers:${ip}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  try {
    const tenant = await getTenantByDomain(request.headers.get('host'))
    if (!tenant) {
      return NextResponse.json([], { status: 200 })
    }
    const tiers = await getAllTiers(tenant.id)
    const publicTiers = tiers.map(({ tier_name, point_threshold, safe_reward_title, mystery_box_enabled, is_black, sort_order }) => ({
      tier_name,
      point_threshold,
      safe_reward_title,
      mystery_box_enabled: mystery_box_enabled ?? false,
      is_black,
      sort_order,
    }))

    return NextResponse.json(publicTiers, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  } catch (err) {
    console.error('[public/reward-tiers] Error fetching tiers:', err)
    return NextResponse.json([], { status: 200 })
  }
}
