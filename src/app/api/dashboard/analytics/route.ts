import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getFullAnalytics } from '@/services/dashboard.service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const tenantId = await requireTenantId()
    const analytics = await getFullAnalytics(tenantId)
    return NextResponse.json(analytics)
  } catch (error) {
    console.error('[Dashboard] Error analytics:', error)
    return NextResponse.json({ error: 'Error obteniendo analytics' }, { status: 500 })
  }
}
