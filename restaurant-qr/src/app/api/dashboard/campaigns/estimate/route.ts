import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const minVisits = searchParams.get('minVisits')
    const maxVisits = searchParams.get('maxVisits')
    const minAge = searchParams.get('minAge')
    const maxAge = searchParams.get('maxAge')
    const source = searchParams.get('source')

    const db = getServiceClient()
    let query = db.from('customers').select('id', { count: 'exact', head: true })
    query = query.eq('accepts_marketing', true)

    if (city) {
      query = query.ilike('city', `%${city}%`)
    }
    if (minVisits) {
      query = query.gte('total_visits', parseInt(minVisits))
    }
    if (maxVisits) {
      query = query.lte('total_visits', parseInt(maxVisits))
    }
    if (minAge) {
      const maxBirthday = new Date()
      maxBirthday.setFullYear(maxBirthday.getFullYear() - parseInt(minAge))
      query = query.lte('birthday', maxBirthday.toISOString().split('T')[0])
    }
    if (maxAge) {
      const minBirthday = new Date()
      minBirthday.setFullYear(minBirthday.getFullYear() - parseInt(maxAge) - 1)
      query = query.gte('birthday', minBirthday.toISOString().split('T')[0])
    }

    // Source filter requires a subquery via visits — simplified to customer-level for now
    // TODO: Add source-based filtering via visits join when needed

    const { count, error } = await query

    if (error) {
      console.error('[CampaignEstimate]', error)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (error) {
    console.error('[CampaignEstimate]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
