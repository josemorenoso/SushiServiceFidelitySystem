import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const db = getServiceClient()

  const { data: customer } = await db
    .from('customers')
    .select('total_visits')
    .eq('id', id)
    .single()

  if (!customer) return NextResponse.json({ reward: null })

  const { data: reward } = await db
    .from('rewards')
    .select('visit_milestone, title')
    .eq('is_active', true)
    .gt('visit_milestone', customer.total_visits)
    .order('visit_milestone', { ascending: true })
    .limit(1)
    .single()

  return NextResponse.json({
    reward: reward ? { milestone: reward.visit_milestone, title: reward.title } : null,
  })
}
