import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone } from '@/services/customer.service'
import { getNextTier, getAllTiers } from '@/services/reward-tiers.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { getTenantByDomain } from '@/lib/tenant'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = rateLimit(`public-card:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  const { searchParams } = new URL(request.url)
  const rawPhone = searchParams.get('phone')

  if (!rawPhone) {
    return NextResponse.json({ error: 'Se requiere phone' }, { status: 400 })
  }

  const { valid, cleaned } = validatePhone(rawPhone)
  if (!valid) {
    return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
  }

  const tenant = await getTenantByDomain(request.headers.get('host'))
  if (!tenant) {
    return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })
  }

  try {
    const customer = await findCustomerByPhone(cleaned, tenant.id)
    if (!customer) {
      return NextResponse.json({ found: false })
    }

    const totalPoints = customer.total_points ?? 0
    const [tiers, nextTierInfo] = await Promise.all([
      getAllTiers(tenant.id),
      getNextTier(totalPoints, tenant.id),
    ])

    const publicTiers = tiers.map(({ tier_name, point_threshold, safe_reward_title, mystery_box_enabled, is_black }) => ({
      tier_name,
      point_threshold,
      safe_reward_title,
      mystery_box_enabled: mystery_box_enabled ?? false,
      is_black,
    }))

    return NextResponse.json({
      found: true,
      customer: {
        name: customer.name,
        total_points: totalPoints,
        total_visits: customer.total_visits ?? 0,
      },
      tiers: publicTiers,
      next_tier: nextTierInfo
        ? {
            name: nextTierInfo.tier.tier_name,
            threshold: nextTierInfo.tier.point_threshold,
            points_remaining: nextTierInfo.pointsRemaining,
          }
        : null,
    })
  } catch (err) {
    console.error('[public/customer-card] Error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
