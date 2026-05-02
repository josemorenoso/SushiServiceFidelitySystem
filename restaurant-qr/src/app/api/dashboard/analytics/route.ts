import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFullAnalytics } from '@/services/dashboard.service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const analytics = await getFullAnalytics()
    return NextResponse.json(analytics)
  } catch (error) {
    console.error('[Dashboard] Error analytics:', error)
    return NextResponse.json({ error: 'Error obteniendo analytics' }, { status: 500 })
  }
}
