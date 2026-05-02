import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const service = createServiceClient(url, key)

    const { data, error } = await service
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('[Dashboard] Error campañas:', error)
    return NextResponse.json({ error: 'Error obteniendo campañas' }, { status: 500 })
  }
}
