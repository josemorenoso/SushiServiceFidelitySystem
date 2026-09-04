import { NextRequest, NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { getRedemptionSummary } from '@/services/redemption.service'
import { getGrantMetrics } from '@/services/reward-grant.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const range = {
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    }

    // Las métricas de grants responden lo que las redenciones solas no pueden: de los premios
    // que REPARTIMOS, ¿cuántos se reclamaron? La tasa de `source='reactivation'` es el
    // porcentaje de clientes dormidos que la campaña despertó.
    const [summary, grants] = await Promise.all([
      getRedemptionSummary(range, scopeResult.scope),
      getGrantMetrics(range, scopeResult.scope),
    ])

    return NextResponse.json({ ...summary, grants })
  } catch (error) {
    console.error('[Dashboard] Error resumen redenciones:', error)
    return NextResponse.json({ error: 'Error obteniendo resumen' }, { status: 500 })
  }
}
