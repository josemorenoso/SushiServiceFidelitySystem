import { createClient } from '@supabase/supabase-js'
import type { Reward } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

export async function checkRewardForVisit(totalVisits: number): Promise<Reward | null> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('visit_milestone', totalVisits)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error buscando recompensa: ${error.message}`)
  }

  return data
}
