import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

interface ManualCampaignBody {
  name: string
  filters: {
    city: string
    minVisits: string
    maxVisits: string
    minAge: string
    maxAge: string
    source: string
  }
  messageTemplate: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = (await request.json()) as ManualCampaignBody
    const { name, filters, messageTemplate } = body

    if (!messageTemplate?.trim()) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    const db = getServiceClient()

    // Create campaign record
    const { data: campaign, error: campaignError } = await db
      .from('campaigns')
      .insert({
        name: name || 'Campaña Manual',
        type: 'manual',
        status: 'running',
        message_template: messageTemplate,
        filters: filters as Record<string, unknown>,
        executed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (campaignError) {
      console.error('[ManualCampaign] Error creating campaign:', campaignError)
      return NextResponse.json({ error: 'Error creando campaña' }, { status: 500 })
    }

    // Fetch matching customers
    let query = db.from('customers').select('id, phone, name')
    if (filters.city) query = query.ilike('city', `%${filters.city}%`)
    if (filters.minVisits) query = query.gte('total_visits', parseInt(filters.minVisits))
    if (filters.maxVisits) query = query.lte('total_visits', parseInt(filters.maxVisits))
    if (filters.minAge) {
      const maxBirthday = new Date()
      maxBirthday.setFullYear(maxBirthday.getFullYear() - parseInt(filters.minAge))
      query = query.lte('birthday', maxBirthday.toISOString().split('T')[0])
    }
    if (filters.maxAge) {
      const minBirthday = new Date()
      minBirthday.setFullYear(minBirthday.getFullYear() - parseInt(filters.maxAge) - 1)
      query = query.gte('birthday', minBirthday.toISOString().split('T')[0])
    }

    const { data: customers } = await query

    const total = customers?.length ?? 0

    // Record campaign messages (best-effort, actual sending via Twilio would happen here)
    if (customers && customers.length > 0) {
      const messages = customers.map((c) => ({
        campaign_id: campaign.id,
        customer_id: c.id,
        status: 'pending' as const,
      }))

      await db.from('campaign_messages').insert(messages)
    }

    // Update campaign status
    await db
      .from('campaigns')
      .update({ status: 'completed', total_sent: total })
      .eq('id', campaign.id)

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      totalSent: total,
    })
  } catch (error) {
    console.error('[ManualCampaign]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
