import { createClient } from '@supabase/supabase-js'
import type { Customer, Reward } from '@/types/database.types'
import { POWER_RANKS, RISK_LEVELS, getCustomerRank } from '@/constants/rankings'
import type {
  DashboardAnalytics,
  DailyVisits,
  DailyNewCustomers,
  TierCount,
  RiskGroup,
  RankedCustomer,
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

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
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
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('visits').select('*', { count: 'exact', head: true }).gte('created_at', todayStr),
    supabase.from('visits').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabase.from('customers').select('id').not('birthday', 'is', null).like('birthday', `%-${month}-${day}`),
    supabase.from('customers').select('*', { count: 'exact', head: true }).lt('last_visit_at', inactiveCutoff).not('last_visit_at', 'is', null),
    supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(5),
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
}): Promise<{ customers: Customer[]; total: number }> {
  const supabase = getServiceClient()
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase.from('customers').select('*', { count: 'exact' })

  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,phone.ilike.%${params.search}%`)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(`Error obteniendo clientes: ${error.message}`)
  }

  return { customers: data ?? [], total: count ?? 0 }
}

export async function getRewards(): Promise<Reward[]> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('rewards')
    .select('*')
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

export async function getFullAnalytics(): Promise<DashboardAnalytics> {
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

  const [
    { data: allCustomers },
    { data: recentVisits },
    { data: birthdayData },
  ] = await Promise.all([
    supabase.from('customers').select('*').order('total_visits', { ascending: false }),
    supabase.from('visits').select('id, customer_id, source, created_at').gte('created_at', thirtyDaysAgoStr),
    supabase.from('customers').select('id').not('birthday', 'is', null).like('birthday', `%-${month}-${day}`),
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

  const topCustomers: RankedCustomer[] = customers.slice(0, 20).map((c, i) => {
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
  }
}
