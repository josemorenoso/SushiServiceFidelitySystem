import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getBatchStats } from '@/services/imported-contacts.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batch_id')
    if (!batchId) {
      return NextResponse.json({ error: 'Se requiere batch_id' }, { status: 400 })
    }
    const tenantId = await requireTenantId()
    const stats = await getBatchStats(batchId, tenantId)
    return NextResponse.json(stats)
  } catch (error) {
    console.error('[GoldenBullet] Error stats:', error)
    return NextResponse.json({ error: 'Error obteniendo estadísticas' }, { status: 500 })
  }
}
