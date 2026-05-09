import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getNextReward, getRewardTitle, getRewardById } from '@/services/reward.service'
import { FREQUENCY_CAP_DAYS, RECOVERY_ZONE_START_DAYS, RECOVERY_ZONE_END_DAYS } from '@/constants/rewards'

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
  templateSid: string
  messageTemplate: string
  /**
   * Qué recompensa mostrar en {{3}}:
   *  - 'auto' (default): próxima recompensa de cada cliente
   *  - uuid: recompensa fija para todos los clientes
   *  - 'none': la plantilla no usa {{3}} (sólo {{1}}, {{2}})
   */
  rewardId?: string | 'auto' | 'none'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = (await request.json()) as ManualCampaignBody
    const { name, filters, templateSid, messageTemplate, rewardId = 'auto' } = body

    if (!templateSid) {
      return NextResponse.json({ error: 'Plantilla requerida' }, { status: 400 })
    }

    const db = getServiceClient()

    // Create campaign record
    const { data: campaign, error: campaignError } = await db
      .from('campaigns')
      .insert({
        name: name || 'Campaña Manual',
        type: 'manual',
        status: 'running',
        message_template: messageTemplate || templateSid,
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
    let query = db.from('customers').select('id, phone, name, total_visits, last_campaign_at, last_visit_at, source_channels, accepts_marketing')
    query = query.eq('accepts_marketing', true)
    if (filters.city) query = query.ilike('city', `%${filters.city}%`)
    if (filters.minVisits) query = query.gte('total_visits', parseInt(filters.minVisits))
    if (filters.maxVisits) query = query.lte('total_visits', parseInt(filters.maxVisits))
    if (filters.source && filters.source !== 'all') {
      if (filters.source === 'qr_only') {
        query = query.eq('source_channels', 'qr')
      } else if (filters.source === 'delivery_only') {
        query = query.eq('source_channels', 'delivery')
      }
    }
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

    // Frequency cap: excluir clientes contactados en los últimos FREQUENCY_CAP_DAYS días
    const capCutoff = new Date(Date.now() - FREQUENCY_CAP_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const afterFrequencyCap = (customers ?? []).filter(
      (c) => !c.last_campaign_at || c.last_campaign_at < capCutoff
    )
    const skipped = (customers?.length ?? 0) - afterFrequencyCap.length

    // Recovery Zone: excluir clientes entre RECOVERY_ZONE_START_DAYS y RECOVERY_ZONE_END_DAYS días
    // sin visitar — están reservados para el cron de reactivación personalizado.
    const zoneCutoffNear = new Date(Date.now() - RECOVERY_ZONE_START_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const zoneCutoffFar = new Date(Date.now() - RECOVERY_ZONE_END_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const eligible = afterFrequencyCap.filter((c) => {
      if (!c.last_visit_at) return true
      const inRecoveryZone = c.last_visit_at < zoneCutoffNear && c.last_visit_at >= zoneCutoffFar
      return !inRecoveryZone
    })
    const skippedRecoveryZone = afterFrequencyCap.length - eligible.length

    // Pre-compute reward titles según rewardId:
    //  - 'auto': título de próxima recompensa por total_visits (1 query por valor único)
    //  - 'none': sin {{3}}
    //  - uuid: 1 sola query, mismo título para todos
    const titleByVisits: Record<number, string> = {}
    let fixedRewardTitle: string | null = null
    let useReward3 = true

    if (rewardId === 'none') {
      useReward3 = false
    } else if (rewardId && rewardId !== 'auto') {
      const fixedReward = await getRewardById(rewardId)
      fixedRewardTitle = fixedReward?.title ?? 'más beneficios'
    } else {
      const uniqueVisitCounts = [...new Set(eligible.map((c) => c.total_visits))]
      await Promise.all(
        uniqueVisitCounts.map(async (v) => {
          const next = await getNextReward(v)
          titleByVisits[v] = getRewardTitle(next)
        })
      )
    }

    // Send en paralelo en batches para evitar timeout + saturar Twilio
    const BATCH_SIZE = 10
    const now = new Date().toISOString()
    let sent = 0
    let failed = 0
    const messageRecords: { campaign_id: string; customer_id: string; status: string; twilio_sid: string | null; sent_at: string | null; error_message: string | null }[] = []
    const sentCustomerIds: string[] = []

    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const batch = eligible.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (customer) => {
          try {
            const variables: Record<string, string> = {
              '1': customer.name,
              '2': String(customer.total_visits),
            }
            if (useReward3) {
              variables['3'] = fixedRewardTitle ?? titleByVisits[customer.total_visits] ?? 'más beneficios'
            }
            const result = await sendTemplateMessage(customer.phone, templateSid, variables)
            return { customer, result, error: null as string | null }
          } catch (err) {
            return {
              customer,
              result: null,
              error: err instanceof Error ? err.message : 'Error desconocido',
            }
          }
        })
      )

      for (const { customer, result, error } of results) {
        if (result) {
          sent++
          sentCustomerIds.push(customer.id)
          messageRecords.push({
            campaign_id: campaign.id,
            customer_id: customer.id,
            status: 'sent',
            twilio_sid: result.sid,
            sent_at: now,
            error_message: null,
          })
        } else {
          failed++
          messageRecords.push({
            campaign_id: campaign.id,
            customer_id: customer.id,
            status: 'failed',
            twilio_sid: null,
            sent_at: null,
            error_message: error || 'Twilio no configurado o error de envío',
          })
        }
      }
    }

    // Bulk update last_campaign_at para todos los enviados (1 query)
    if (sentCustomerIds.length > 0) {
      await db
        .from('customers')
        .update({ last_campaign_at: now })
        .in('id', sentCustomerIds)
    }

    // Bulk insert message records
    if (messageRecords.length > 0) {
      await db.from('campaign_messages').insert(messageRecords)
    }

    // Update campaign status
    await db
      .from('campaigns')
      .update({ status: 'completed', total_sent: sent })
      .eq('id', campaign.id)

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      totalSent: sent,
      totalFailed: failed,
      totalSkippedFrequencyCap: skipped,
      totalSkippedRecoveryZone: skippedRecoveryZone,
    })
  } catch (error) {
    console.error('[ManualCampaign]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
