import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRedemptionSummary } from '@/services/redemption.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const summary = await getRedemptionSummary({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    })
    return NextResponse.json(summary)
  } catch (error) {
    console.error('[Dashboard] Error resumen redenciones:', error)
    return NextResponse.json({ error: 'Error obteniendo resumen' }, { status: 500 })
  }
}
