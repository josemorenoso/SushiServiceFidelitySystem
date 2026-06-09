import { NextRequest, NextResponse } from 'next/server'
import { getPointsConfig } from '@/services/points.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = rateLimit(`public-points-range:${ip}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  try {
    const { min, max } = await getPointsConfig()
    return NextResponse.json(
      { min, max },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    )
  } catch (err) {
    console.error('[public/points-range] Error:', err)
    return NextResponse.json({ min: 60, max: 90 }, { status: 200 })
  }
}
