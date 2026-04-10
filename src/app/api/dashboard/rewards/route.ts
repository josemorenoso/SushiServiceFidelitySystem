import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRewards } from '@/services/dashboard.service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const rewards = await getRewards()
    return NextResponse.json(rewards)
  } catch (error) {
    console.error('[Dashboard] Error recompensas:', error)
    return NextResponse.json({ error: 'Error obteniendo recompensas' }, { status: 500 })
  }
}
