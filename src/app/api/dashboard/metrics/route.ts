import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getDashboardMetrics } from '@/services/dashboard.service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const tenantId = await requireTenantId()
    const metrics = await getDashboardMetrics(tenantId)
    return NextResponse.json(metrics)
  } catch (error) {
    console.error('[Dashboard] Error métricas:', error)
    return NextResponse.json({ error: 'Error obteniendo métricas' }, { status: 500 })
  }
}
