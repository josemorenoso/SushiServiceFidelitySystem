import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getRedemptions } from '@/services/redemption.service'

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
    const result = await getRedemptions({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      staffId: searchParams.get('staff_id') ?? undefined,
      tierId: searchParams.get('tier_id') ?? undefined,
      prizeTitle: searchParams.get('prize_title') ?? undefined,
      page: parseInt(searchParams.get('page') ?? '1'),
      limit: parseInt(searchParams.get('limit') ?? '25'),
    }, tenantId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Dashboard] Error redenciones:', error)
    return NextResponse.json({ error: 'Error obteniendo redenciones' }, { status: 500 })
  }
}
