import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listBatches } from '@/services/imported-contacts.service'

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

    // Listado de contactos de un lote específico
    if (batchId) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      const db = createServiceClient(url, key)
      const page = parseInt(searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
      const status = searchParams.get('status')

      let query = db
        .from('imported_contacts')
        .select('id, phone, name, email, status, message_sent_at, twilio_sid, converted_to_customer_id, created_at', { count: 'exact' })
        .eq('source_batch', batchId)
        .order('created_at', { ascending: false })
      if (status) query = query.eq('status', status)

      const { data, count } = await query.range((page - 1) * limit, page * limit - 1)
      return NextResponse.json({ contacts: data ?? [], total: count ?? 0, page, limit })
    }

    // Listado de lotes (resumen)
    const batches = await listBatches()
    return NextResponse.json({ batches })
  } catch (error) {
    console.error('[GoldenBullet] Error listando:', error)
    return NextResponse.json({ error: 'Error obteniendo contactos importados' }, { status: 500 })
  }
}
