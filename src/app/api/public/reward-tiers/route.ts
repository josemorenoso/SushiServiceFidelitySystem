import { NextRequest, NextResponse } from 'next/server'
import { getAllTiers } from '@/services/reward-tiers.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { resolveHostContext } from '@/lib/tenant'

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
    // `resolveHostContext` y no `getTenantByHost`: además de la marca devuelve la
    // SEDE del host, que es lo que decide de qué local son los premios (00058).
    // Cuesta una consulta más (las sedes activas de la marca) y con el dominio
    // raíz de una marca de varias sedes devuelve `locationId: null` — o sea, los
    // premios de la marca, que es lo correcto: ahí no se sabe en cuál está.
    const { tenant, locationId } = await resolveHostContext(request.headers.get('host'))
    if (!tenant) {
      return NextResponse.json([], { status: 200 })
    }
    const tiers = await getAllTiers(tenant.id, locationId)
    const publicTiers = tiers.map(({ tier_name, point_threshold, safe_reward_title, mystery_box_enabled, is_black, sort_order }) => ({
      tier_name,
      point_threshold,
      safe_reward_title,
      mystery_box_enabled: mystery_box_enabled ?? false,
      is_black,
      sort_order,
    }))

    return NextResponse.json(publicTiers, {
      headers: { 'Cache-Control': 'public, max-age=60',
        // ⚠️ Desde la 00058 la respuesta varía por SEDE, y la sede sale del
        // host. Sin esto, una caché compartida que no keye por host podría
        // servirle a Envigado los niveles de Laureles durante un minuto.
        Vary: 'Host' },
    })
  } catch (err) {
    console.error('[public/reward-tiers] Error fetching tiers:', err)
    return NextResponse.json([], { status: 200 })
  }
}
