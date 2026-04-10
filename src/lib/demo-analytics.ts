import { POWER_RANKS, RISK_LEVELS, getCustomerRank } from '@/constants/rankings'
import type {
  DashboardAnalytics,
  DemoCustomer,
  DailyVisits,
  DailyNewCustomers,
  TierCount,
  RiskGroup,
  RankedCustomer,
} from '@/types/analytics.types'

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function computeDemoAnalytics(customers: DemoCustomer[]): DashboardAnalytics {
  const now = new Date()
  const todayStr = formatDate(now)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  const visitsMap: Record<string, { qr: number; delivery: number }> = {}
  const newCustMap: Record<string, number> = {}

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = formatDate(d)
    visitsMap[key] = { qr: 0, delivery: 0 }
    newCustMap[key] = 0
  }

  let visitsToday = 0
  let deliveriesToday = 0
  let qrToday = 0
  let newCustomersToday = 0
  let newCustomersWeek = 0
  let frequentCustomers = 0
  let birthdaysToday = 0

  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  for (const c of customers) {
    const createdDate = c.created_at.split('T')[0]
    if (newCustMap[createdDate] !== undefined) {
      newCustMap[createdDate]++
    }
    if (createdDate === todayStr) newCustomersToday++
    if (new Date(c.created_at) >= weekAgo) newCustomersWeek++
    if (c.total_visits >= 3) frequentCustomers++
    if (c.birthday && c.birthday.includes(`-${month}-${day}`)) birthdaysToday++

    const qrPct = c.source_pct_qr ?? 0.6
    const totalV = c.total_visits
    const createdAt = new Date(c.created_at)
    const lastVisit = new Date(c.last_visit_at)
    const span = Math.max(daysBetween(createdAt, lastVisit), 1)

    for (let v = 0; v < totalV; v++) {
      const visitDate = new Date(createdAt.getTime() + (span / totalV) * v * (1000 * 60 * 60 * 24))
      const vKey = formatDate(visitDate)
      if (visitsMap[vKey]) {
        const isQr = Math.random() < qrPct
        if (isQr) visitsMap[vKey].qr++
        else visitsMap[vKey].delivery++
        if (vKey === todayStr) {
          visitsToday++
          if (isQr) qrToday++
          else deliveriesToday++
        }
      }
    }
  }

  const visitsPerDay: DailyVisits[] = Object.entries(visitsMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, qr: v.qr, delivery: v.delivery, total: v.qr + v.delivery }))

  let cumulative = customers.filter((c) => new Date(c.created_at) < new Date(Object.keys(newCustMap).sort()[0])).length
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

  const riskBuckets: Record<string, { name: string; phone: string; daysInactive: number; total_visits: number }[]> = {}
  for (const level of RISK_LEVELS) riskBuckets[level.name] = []
  for (const c of customers) {
    const inactive = daysBetween(new Date(c.last_visit_at), now)
    if (inactive >= 7) {
      const level = RISK_LEVELS.find((r) => inactive >= r.minDays && inactive <= r.maxDays)
      if (level) {
        riskBuckets[level.name].push({
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
    customers: riskBuckets[r.name].slice(0, 10).map((c, i) => ({ ...c, id: `demo-${r.name}-${i}` })),
  }))

  const sorted = [...customers].sort((a, b) => b.total_visits - a.total_visits)
  const topCustomers: RankedCustomer[] = sorted.slice(0, 20).map((c, i) => {
    const rank = getCustomerRank(c.total_visits)
    return {
      id: `demo-top-${i}`,
      name: c.name,
      phone: c.phone,
      total_visits: c.total_visits,
      rank: rank.name,
      emoji: rank.emoji,
      gradient: rank.gradient,
      position: i + 1,
    }
  })

  return {
    summary: {
      totalCustomers: customers.length,
      visitsToday,
      deliveriesToday,
      qrToday,
      newCustomersToday,
      newCustomersWeek,
      frequentCustomers,
      birthdaysToday,
    },
    visitsPerDay,
    newCustomersPerDay,
    customerTiers,
    atRiskGroups,
    topCustomers,
  }
}
