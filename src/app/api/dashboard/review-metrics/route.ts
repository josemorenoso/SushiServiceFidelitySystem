/**
 * GET /api/dashboard/review-metrics?from=&to=
 *
 * El embudo de reseñas: se mostró N veces → X fueron a Google → Y reclamaron el premio.
 *
 * Ref: docs/features/review-flow.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getReviewFunnel } from '@/services/review.service'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const tenantId = await requireTenantId()
    const { searchParams } = new URL(request.url)

    const funnel = await getReviewFunnel(
      {
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
      },
      tenantId
    )

    return NextResponse.json(funnel)
  } catch (error) {
    console.error('[ReviewMetrics] Error:', error)
    return NextResponse.json({ error: 'Error obteniendo métricas de reseñas' }, { status: 500 })
  }
}
