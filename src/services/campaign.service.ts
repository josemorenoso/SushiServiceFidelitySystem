import { createClient } from '@supabase/supabase-js'
import type { Customer, Campaign, CampaignMessage } from '@/types/database.types'
import { REACTIVATION_DAYS } from '@/constants/rewards'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

/**
 * Finds customers whose birthday is today (matching day and month).
 */
export async function findBirthdayCustomers(): Promise<Customer[]> {
  const supabase = getServiceClient()
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  const pattern = `%-${month}-${day}`

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .not('birthday', 'is', null)
    .like('birthday', pattern)

  if (error) {
    throw new Error(`Error buscando cumpleañeros: ${error.message}`)
  }

  return data ?? []
}

/**
 * Finds customers inactive for more than REACTIVATION_DAYS.
 */
export async function findInactiveCustomers(): Promise<Customer[]> {
  const supabase = getServiceClient()
  const cutoffDate = new Date(Date.now() - REACTIVATION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .lt('last_visit_at', cutoffDate)
    .not('last_visit_at', 'is', null)
    .eq('accepts_marketing', true)

  if (error) {
    throw new Error(`Error buscando inactivos: ${error.message}`)
  }

  return data ?? []
}

/**
 * Checks if a customer already received a campaign message of a given type
 * within the specified number of days.
 */
export async function hasRecentCampaignMessage(
  customerId: string,
  campaignType: string,
  withinDays: number
): Promise<boolean> {
  const supabase = getServiceClient()
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('campaign_messages')
    .select('id, campaigns!inner(type)')
    .eq('customer_id', customerId)
    .eq('campaigns.type', campaignType)
    .gte('sent_at', since)
    .limit(1)

  if (error) {
    console.error(`Error verificando campaña reciente: ${error.message}`)
    return false
  }

  return (data?.length ?? 0) > 0
}

/**
 * Creates or finds today's campaign of a given type.
 */
export async function getOrCreateTodayCampaign(
  type: 'birthday' | 'reactivation',
  messageTemplate: string
): Promise<Campaign> {
  const supabase = getServiceClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const name = `${type}_${todayStr}`

  const { data: existing } = await supabase
    .from('campaigns')
    .select('*')
    .eq('name', name)
    .single()

  if (existing) return existing

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      type,
      status: 'running',
      message_template: messageTemplate,
      executed_at: today.toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Error creando campaña: ${error.message}`)
  }

  return data
}

/**
 * Records a campaign message sent to a customer.
 */
export async function recordCampaignMessage(params: {
  campaignId: string
  customerId: string
  status: 'sent' | 'failed'
  twilioSid?: string | null
  errorMessage?: string | null
}): Promise<CampaignMessage> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('campaign_messages')
    .insert({
      campaign_id: params.campaignId,
      customer_id: params.customerId,
      status: params.status,
      twilio_sid: params.twilioSid ?? null,
      sent_at: new Date().toISOString(),
      error_message: params.errorMessage ?? null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Error registrando mensaje de campaña: ${error.message}`)
  }

  return data
}

/**
 * Updates campaign totals and status after execution.
 */
export async function finalizeCampaign(
  campaignId: string,
  totalSent: number
): Promise<void> {
  const supabase = getServiceClient()

  const { error } = await supabase
    .from('campaigns')
    .update({
      status: 'completed',
      total_sent: totalSent,
      executed_at: new Date().toISOString(),
    })
    .eq('id', campaignId)

  if (error) {
    console.error(`Error finalizando campaña: ${error.message}`)
  }
}
