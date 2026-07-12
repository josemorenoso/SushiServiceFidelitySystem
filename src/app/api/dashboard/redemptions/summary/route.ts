import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getRedemptionSummary } from '@/services/redemption.service'
import { getGrantMetrics } from '@/services/reward-grant.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const tenantId = await requireTenantId()
    const { searchParams } = new URL(request.url)
    const range = {
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    }

    // Las métricas de grants responden lo que las redenciones solas no pueden: de los premios
    // que REPARTIMOS, ¿cuántos se reclamaron? La tasa de `source='reactivation'` es el
    // porcentaje de clientes dormidos que la campaña despertó.
    const [summary, grants] = await Promise.all([
      getRedemptionSummary(range, tenantId),
      getGrantMetrics(range, tenantId),
    ])

    return NextResponse.json({ ...summary, grants })
  } catch (error) {
    console.error('[Dashboard] Error resumen redenciones:', error)
    return NextResponse.json({ error: 'Error obteniendo resumen' }, { status: 500 })
  }
}
