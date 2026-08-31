import { createClient } from '@supabase/supabase-js'
import type { Customer, Reward } from '@/types/database.types'
import { POWER_RANKS, RISK_LEVELS, TOP_CUSTOMERS_LIMIT, getCustomerRank } from '@/constants/rankings'
import type {
  DashboardAnalytics,
  DailyVisits,
  DailyNewCustomers,
  TierCount,
  RiskGroup,
  RankedCustomer,
  HeatmapCell,
  AcquisitionChannel,
  ReactivationData,
  ROIEstimate,
} from '@/types/analytics.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

export interface DashboardMetrics {
  totalCustomers: number
  visitsToday: number
  visitsThisWeek: number
  birthdaysToday: number
  inactiveCustomers: number
  recentCustomers: Customer[]
}

export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  const supabase = getServiceClient()
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const inactiveCutoff = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  const [
    { count: totalCustomers },
    { count: visitsToday },
    { count: visitsThisWeek },
    { data: birthdayData },
    { count: inactiveCustomers },
    { data: recentCustomers },
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('visits').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStr),
    supabase.from('visits').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', weekAgo),
    supabase.from('customers').select('id').eq('tenant_id', tenantId).not('birthday', 'is', null).like('birthday', `%-${month}-${day}`),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).lt('last_visit_at', inactiveCutoff).not('last_visit_at', 'is', null),
    supabase.from('customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5),
  ])

  return {
    totalCustomers: totalCustomers ?? 0,
    visitsToday: visitsToday ?? 0,
    visitsThisWeek: visitsThisWeek ?? 0,
    birthdaysToday: birthdayData?.length ?? 0,
    inactiveCustomers: inactiveCustomers ?? 0,
    recentCustomers: recentCustomers ?? [],
  }
}

export async function getCustomers(params: {
  page?: number
  limit?: number
  search?: string
  source?: string
  tier?: string
  status?: string
}, tenantId: string): Promise<{ customers: Customer[]; total: number }> {
  const supabase = getServiceClient()
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const from = (page - 1) * limit
  const to = from + limit - 1
  const now = new Date()

  let query = supabase.from('customers').select('*', { count: 'exact' }).eq('tenant_id', tenantId)

  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,phone.ilike.%${params.search}%`)
  }

  if (params.source && params.source !== 'all') {
    query = query.eq('source_channels', params.source)
  }

  if (params.tier && params.tier !== 'all') {
    const tierRanges: Record<string, { min: number; max?: number }> = {
      plata:   { min: 0, max: 3 },
      oro:     { min: 4, max: 6 },
      platino: { min: 7, max: 9 },
      black:   { min: 10 },
    }
    const range = tierRanges[params.tier]
    if (range) {
      query = query.gte('total_visits', range.min)
      if (range.max !== undefined) query = query.lte('total_visits', range.max)
    }
  }

  if (params.status && params.status !== 'all') {
    const activeCutoff = new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString()
    const lostCutoff   = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString()
    if (params.status === 'active') {
      query = query.gte('last_visit_at', activeCutoff)
    } else if (params.status === 'inactive') {
      query = query.lt('last_visit_at', activeCutoff).gte('last_visit_at', lostCutoff)
    } else if (params.status === 'lost') {
      query = query.or(`last_visit_at.is.null,last_visit_at.lt.${lostCutoff}`)
    }
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(`Error obteniendo clientes: ${error.message}`)
  }

  return { customers: data ?? [], total: count ?? 0 }
}

export async function getRewards(tenantId: string): Promise<Reward[]> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('visit_milestone', { ascending: true })

  if (error) {
    throw new Error(`Error obteniendo recompensas: ${error.message}`)
  }

  return data ?? []
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

export async function getFullAnalytics(tenantId: string): Promise<DashboardAnalytics> {
  const supabase = getServiceClient()
  const now = new Date()
  const todayStr = formatDate(now)
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = formatDate(thirtyDaysAgo)
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoStr = formatDate(sixMonthsAgo)

  const [
    { data: allCustomers },
    { data: recentVisits },
    { data: birthdayData },
    { data: allVisits6m },
    { data: reactivationCampaigns },
    { data: reactivationMessages },
    { data: settingsData },
  ] = await Promise.all([
    supabase.from('customers').select('*').eq('tenant_id', tenantId).order('total_visits', { ascending: false }),
    supabase.from('visits').select('id, customer_id, source, created_at').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgoStr),
    supabase.from('customers').select('id').eq('tenant_id', tenantId).not('birthday', 'is', null).like('birthday', `%-${month}-${day}`),
    supabase.from('visits').select('id, customer_id, source, created_at').eq('tenant_id', tenantId).gte('created_at', sixMonthsAgoStr),
    supabase.from('campaigns').select('id, type, executed_at').eq('tenant_id', tenantId).eq('type', 'reactivation').not('executed_at', 'is', null),
    supabase.from('campaign_messages').select('id, campaign_id, customer_id, sent_at, status').eq('tenant_id', tenantId),
    supabase.from('admin_settings').select('key, value').eq('tenant_id', tenantId).eq('key', 'avg_ticket'),
  ])

  const customers: Customer[] = allCustomers ?? []
  const visits = recentVisits ?? []

  const visitsMap: Record<string, { qr: number; delivery: number }> = {}
  const newCustMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = formatDate(d)
    visitsMap[key] = { qr: 0, delivery: 0 }
    newCustMap[key] = 0
  }

  for (const v of visits) {
    const vDate = v.created_at.split('T')[0]
    if (visitsMap[vDate]) {
      if (v.source === 'delivery') visitsMap[vDate].delivery++
      else visitsMap[vDate].qr++
    }
  }

  for (const c of customers) {
    const cDate = c.created_at.split('T')[0]
    if (newCustMap[cDate] !== undefined) newCustMap[cDate]++
  }

  const visitsPerDay: DailyVisits[] = Object.entries(visitsMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, qr: v.qr, delivery: v.delivery, total: v.qr + v.delivery }))

  const olderCustomers = customers.filter((c) => new Date(c.created_at) < thirtyDaysAgo).length
  let cumulative = olderCustomers
  const newCustomersPerDay: DailyNewCustomers[] = Object.entries(newCustMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => {
      cumulative += count
      return { date, count, cumulative }
    })

  const tierCounts: Record<string, number> = {}
  for (const rank of POWER_RANKS) tierCounts[rank.name] = 0
  for (const c of customers) {
    const rank = getCustomerRank(c.total_visits)
    tierCounts[rank.name]++
  }
  const customerTiers: TierCount[] = POWER_RANKS.map((r) => ({
    rank: r.name,
    count: tierCounts[r.name] ?? 0,
    emoji: r.emoji,
    gradient: r.gradient,
    percentage: customers.length > 0 ? Math.round((tierCounts[r.name] / customers.length) * 100) : 0,
  }))

  const riskBuckets: Record<string, { id: string; name: string; phone: string; daysInactive: number; total_visits: number }[]> = {}
  for (const level of RISK_LEVELS) riskBuckets[level.name] = []
  for (const c of customers) {
    if (!c.last_visit_at) continue
    const inactive = daysBetween(new Date(c.last_visit_at), now)
    if (inactive >= 7) {
      const level = RISK_LEVELS.find((r) => inactive >= r.minDays && inactive <= r.maxDays)
      if (level) {
        riskBuckets[level.name].push({
          id: c.id,
          name: c.name,
          phone: c.phone,
          daysInactive: inactive,
          total_visits: c.total_visits,
        })
      }
    }
  }
  const atRiskGroups: RiskGroup[] = RISK_LEVELS.map((r) => ({
    level: r.name,
    count: riskBuckets[r.name].length,
    color: r.color,
    description: r.description,
    daysRange: r.maxDays === Infinity ? `${r.minDays}+ días` : `${r.minDays}-${r.maxDays} días`,
    customers: riskBuckets[r.name].slice(0, 10),
  }))

  // 15 y no 20: REQUERIMIENTOS_AGOSTO_2026.md §14.2 — el resumen de clientes del
  // dashboard se acortó a 15 filas. Espejo en `src/lib/demo-analytics.ts` (modo demo).
  const topCustomers: RankedCustomer[] = customers.slice(0, TOP_CUSTOMERS_LIMIT).map((c, i) => {
    const rank = getCustomerRank(c.total_visits)
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      total_visits: c.total_visits,
      rank: rank.name,
      emoji: rank.emoji,
      gradient: rank.gradient,
      position: i + 1,
    }
  })

  const todayVisits = visitsMap[todayStr] ?? { qr: 0, delivery: 0 }
  const newToday = newCustMap[todayStr] ?? 0
  const newWeek = customers.filter((c) => new Date(c.created_at) >= weekAgo).length

  // --- HEATMAP: Día × Hora de visitas (últimos 6 meses) ---
  const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const heatmapGrid: Record<string, number> = {}
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      heatmapGrid[`${d}-${h}`] = 0
    }
  }
  for (const v of (allVisits6m ?? [])) {
    const vDate = new Date(v.created_at)
    const colombiaStr = vDate.toLocaleString('en-US', { timeZone: 'America/Bogota' })
    const colombiaDate = new Date(colombiaStr)
    const dayOfWeek = colombiaDate.getDay()
    const hour = colombiaDate.getHours()
    heatmapGrid[`${dayOfWeek}-${hour}`]++
  }
  const heatmap: HeatmapCell[] = []
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      heatmap.push({
        day: d,
        hour: h,
        dayLabel: DAY_LABELS[d],
        hourLabel: h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`,
        count: heatmapGrid[`${d}-${h}`],
      })
    }
  }

  // --- ACQUISITION CHANNEL BY MONTH (últimos 6 meses) ---
  const acqMap: Record<string, { qr: number; delivery: number }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    acqMap[key] = { qr: 0, delivery: 0 }
  }
  for (const c of customers) {
    const cMonth = c.created_at.substring(0, 7)
    if (acqMap[cMonth]) {
      const src = c.source_channels
      if (src === 'delivery') acqMap[cMonth].delivery++
      else if (src === 'both') {
        acqMap[cMonth].qr++
        acqMap[cMonth].delivery++
      } else {
        acqMap[cMonth].qr++
      }
    }
  }
  const acquisitionByMonth: AcquisitionChannel[] = Object.entries(acqMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => {
      const d = new Date(m + '-15')
      const label = d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
      return { month: label, qr: v.qr, delivery: v.delivery }
    })

  // --- REACTIVATION RATE (por mes, últimos 6 meses) ---
  const campaigns6m = (reactivationCampaigns ?? [])
  const messages6m = (reactivationMessages ?? [])
  const visits6m = (allVisits6m ?? [])

  const reactivationMap: Record<string, { sent: Set<string>; returned: Set<string> }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    reactivationMap[key] = { sent: new Set(), returned: new Set() }
  }

  for (const campaign of campaigns6m) {
    if (!campaign.executed_at) continue
    const campaignMonth = campaign.executed_at.substring(0, 7)
    if (!reactivationMap[campaignMonth]) continue

    const campaignDate = new Date(campaign.executed_at)
    const sevenDaysLater = new Date(campaignDate.getTime() + 7 * 24 * 60 * 60 * 1000)

    const campaignMsgs = messages6m.filter((m: { campaign_id: string }) => m.campaign_id === campaign.id)
    const customerIds = campaignMsgs.map((m: { customer_id: string }) => m.customer_id)

    for (const cid of customerIds) {
      reactivationMap[campaignMonth].sent.add(cid)
    }

    for (const v of visits6m) {
      const vDate = new Date(v.created_at)
      if (customerIds.includes(v.customer_id) && vDate >= campaignDate && vDate <= sevenDaysLater) {
        reactivationMap[campaignMonth].returned.add(v.customer_id)
      }
    }
  }

  const reactivationRate: ReactivationData[] = Object.entries(reactivationMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => {
      const d = new Date(m + '-15')
      const label = d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
      const sent = v.sent.size
      const returned = v.returned.size
      return {
        month: label,
        sent,
        returned,
        rate: sent > 0 ? Math.round((returned / sent) * 100) : 0,
      }
    })

  // --- ROI ESTIMATE ---
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentMonthReactivation = reactivationMap[currentMonth]
  const reactivatedThisMonth = currentMonthReactivation ? currentMonthReactivation.returned.size : 0
  const avgTicketStr = settingsData?.[0]?.value ?? '35000'
  const avgTicket = parseFloat(avgTicketStr) || 35000
  const roiEstimate: ROIEstimate = {
    reactivatedThisMonth,
    avgTicket,
    estimatedROI: reactivatedThisMonth * avgTicket,
  }

  return {
    summary: {
      totalCustomers: customers.length,
      visitsToday: todayVisits.qr + todayVisits.delivery,
      deliveriesToday: todayVisits.delivery,
      qrToday: todayVisits.qr,
      newCustomersToday: newToday,
      newCustomersWeek: newWeek,
      frequentCustomers: customers.filter((c) => c.total_visits >= 3).length,
      birthdaysToday: birthdayData?.length ?? 0,
    },
    visitsPerDay,
    newCustomersPerDay,
    customerTiers,
    atRiskGroups,
    topCustomers,
    heatmap,
    acquisitionByMonth,
    reactivationRate,
    roiEstimate,
  }
}
