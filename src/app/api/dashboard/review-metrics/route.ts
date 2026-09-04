/**
 * GET /api/dashboard/review-metrics?from=&to=
 *
 * El embudo de reseñas: se mostró N veces → X fueron a Google → Y reclamaron el premio.
 *
 * Ref: docs/features/review-flow.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { getReviewFunnel } from '@/services/review.service'

export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { searchParams } = new URL(request.url)

    const funnel = await getReviewFunnel(
      {
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
      },
      scopeResult.scope
    )

    return NextResponse.json(funnel)
  } catch (error) {
    console.error('[ReviewMetrics] Error:', error)
    return NextResponse.json({ error: 'Error obteniendo métricas de reseñas' }, { status: 500 })
  }
}
