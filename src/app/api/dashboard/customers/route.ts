import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCustomers } from '@/services/dashboard.service'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')
    const search = searchParams.get('search') ?? undefined

    const result = await getCustomers({ page, limit, search })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Dashboard] Error clientes:', error)
    return NextResponse.json({ error: 'Error obteniendo clientes' }, { status: 500 })
  }
}
