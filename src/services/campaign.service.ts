import { createClient } from '@supabase/supabase-js'
import type { Customer, Campaign, CampaignMessage, RestaurantEvent } from '@/types/database.types'
import { REACTIVATION_DAYS, FREQUENCY_CAP_DAYS, MONTHLY_CAP_SOURCES, MONTHLY_MARKETING_CAP } from '@/constants/rewards'

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

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .not('birthday', 'is', null)
    .eq('accepts_marketing', true)

  if (error) {
    throw new Error(`Error buscando cumpleañeros: ${error.message}`)
  }

  // birthday is stored as date (YYYY-MM-DD); filter by month and day in JS
  return (data ?? []).filter(c => {
    if (!c.birthday) return false
    const parts = String(c.birthday).split('-')
    return parts[1] === month && parts[2] === day
  })
}

/**
 * Finds customers inactive for more than REACTIVATION_DAYS,
 * respecting the global frequency cap (last_campaign_at).
 */
export async function findInactiveCustomers(): Promise<Customer[]> {
  const supabase = getServiceClient()
  const cutoffDate = new Date(Date.now() - REACTIVATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const campaignCapDate = new Date(Date.now() - FREQUENCY_CAP_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .lt('last_visit_at', cutoffDate)
    .not('last_visit_at', 'is', null)
    .eq('accepts_marketing', true)
    .or(`last_campaign_at.is.null,last_campaign_at.lt.${campaignCapDate}`)

  if (error) {
    throw new Error(`Error buscando inactivos: ${error.message}`)
  }

  return data ?? []
}

/**
 * Updates last_campaign_at for a list of customers after a successful send.
 * Call this after any cron or campaign that sends messages.
 */
export async function updateCustomerLastCampaignAt(customerIds: string[]): Promise<void> {
  if (customerIds.length === 0) return
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('customers')
    .update({ last_campaign_at: new Date().toISOString() })
    .in('id', customerIds)
  if (error) {
    console.error(`Error actualizando last_campaign_at: ${error.message}`)
  }
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

// ═══════════════════════════════════════════════════════════
// CAP MENSUAL DE MARKETING (3 mensajes/mes/cliente)
// ═══════════════════════════════════════════════════════════
// Cuenta solo campaigns.source IN ('manual','calendar','reactivation').
// Cumpleaños queda fuera (prioridad absoluta) y utility tampoco entra.

function getMonthBoundaries(refDate: Date = new Date()) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0)
  const nextMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1, 0, 0, 0, 0)
  return { startISO: start.toISOString(), nextMonthISO: nextMonth.toISOString() }
}

/**
 * Returns a Set of customer IDs that have ALREADY reached the monthly marketing cap
 * within the current month. Use it to exclude them from new sends.
 */
export async function getCustomersAtMonthlyCap(
  customerIds: string[],
  cap: number = MONTHLY_MARKETING_CAP
): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set()
  const supabase = getServiceClient()
  const { startISO, nextMonthISO } = getMonthBoundaries()

  // Join campaign_messages -> campaigns to count only relevant sources within the month.
  // Note: we count "sent" messages by sent_at timestamp (which falls inside the month window).
  const { data, error } = await supabase
    .from('campaign_messages')
    .select('customer_id, campaigns!inner(source)')
    .in('customer_id', customerIds)
    .eq('status', 'sent')
    .gte('sent_at', startISO)
    .lt('sent_at', nextMonthISO)
    .in('campaigns.source', MONTHLY_CAP_SOURCES as unknown as string[])

  if (error) {
    console.error(`[MonthlyCap] Error consultando campaign_messages: ${error.message}`)
    return new Set()
  }

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { customer_id: string }[]) {
    counts[row.customer_id] = (counts[row.customer_id] ?? 0) + 1
  }

  const atCap = new Set<string>()
  for (const [id, n] of Object.entries(counts)) {
    if (n >= cap) atCap.add(id)
  }
  return atCap
}

/**
 * Filters a list of customer IDs, returning only those who still have room
 * under the monthly marketing cap.
 */
export async function filterByMonthlyCap<T extends { id: string }>(
  customers: T[],
  cap: number = MONTHLY_MARKETING_CAP
): Promise<{ eligible: T[]; excluded: T[] }> {
  if (customers.length === 0) return { eligible: [], excluded: [] }
  const atCap = await getCustomersAtMonthlyCap(customers.map((c) => c.id), cap)
  const eligible: T[] = []
  const excluded: T[] = []
  for (const c of customers) {
    if (atCap.has(c.id)) excluded.push(c)
    else eligible.push(c)
  }
  return { eligible, excluded }
}

// ═══════════════════════════════════════════════════════════
// BLACKOUT PRE-EVENTO DEL CALENDARIO
// ═══════════════════════════════════════════════════════════
// Si hay un evento del calendario en X días (X <= blackout_days), las campañas
// manuales NO asociadas a ese evento excluyen clientes para reservarles cupo.

/**
 * Returns active blackouts: events whose blackout window contains `refDate`.
 * Blackout window: [event_date - blackout_days, event_date).
 */
export async function getActiveBlackouts(refDate: Date = new Date()): Promise<RestaurantEvent[]> {
  const supabase = getServiceClient()
  const today = refDate.toISOString().split('T')[0]

  // Pull only future-or-today events that haven't been sent/cancelled
  const { data, error } = await supabase
    .from('restaurant_events')
    .select('*')
    .gte('event_date', today)
    .in('status', ['planned', 'scheduled'])

  if (error) {
    console.error(`[Blackout] Error consultando eventos: ${error.message}`)
    return []
  }

  // Filter in JS: keep only events whose blackout window includes refDate
  const refTime = refDate.getTime()
  return (data ?? []).filter((ev: RestaurantEvent) => {
    const eventDate = new Date(`${ev.event_date}T00:00:00Z`)
    const blackoutStart = new Date(eventDate.getTime() - ev.blackout_days * 24 * 60 * 60 * 1000)
    return refTime >= blackoutStart.getTime() && refTime < eventDate.getTime()
  })
}
