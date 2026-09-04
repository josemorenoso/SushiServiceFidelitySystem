import { NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { getDashboardMetrics } from '@/services/dashboard.service'

export async function GET(request: Request) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const metrics = await getDashboardMetrics(scopeResult.scope)
    return NextResponse.json(metrics)
  } catch (error) {
    console.error('[Dashboard] Error métricas:', error)
    return NextResponse.json({ error: 'Error obteniendo métricas' }, { status: 500 })
  }
}
