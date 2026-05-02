export interface AnalyticsSummary {
  totalCustomers: number
  visitsToday: number
  deliveriesToday: number
  qrToday: number
  newCustomersToday: number
  newCustomersWeek: number
  frequentCustomers: number
  birthdaysToday: number
}

export interface DailyVisits {
  date: string
  qr: number
  delivery: number
  total: number
}

export interface DailyNewCustomers {
  date: string
  count: number
  cumulative: number
}

export interface TierCount {
  rank: string
  count: number
  emoji: string
  gradient: string
  percentage: number
}

export interface RiskGroup {
  level: string
  count: number
  color: string
  description: string
  daysRange: string
  customers: RiskCustomer[]
}

export interface RiskCustomer {
  id: string
  name: string
  phone: string
  daysInactive: number
  total_visits: number
}

export interface RankedCustomer {
  id: string
  name: string
  phone: string
  total_visits: number
  rank: string
  emoji: string
  gradient: string
  position: number
}

export interface HeatmapCell {
  day: number
  hour: number
  dayLabel: string
  hourLabel: string
  count: number
}

export interface AcquisitionChannel {
  month: string
  qr: number
  delivery: number
}

export interface ReactivationData {
  month: string
  sent: number
  returned: number
  rate: number
}

export interface ROIEstimate {
  reactivatedThisMonth: number
  avgTicket: number
  estimatedROI: number
}

export interface DashboardAnalytics {
  summary: AnalyticsSummary
  visitsPerDay: DailyVisits[]
  newCustomersPerDay: DailyNewCustomers[]
  customerTiers: TierCount[]
  atRiskGroups: RiskGroup[]
  topCustomers: RankedCustomer[]
  heatmap: HeatmapCell[]
  acquisitionByMonth: AcquisitionChannel[]
  reactivationRate: ReactivationData[]
  roiEstimate: ROIEstimate
}

export interface DemoCustomer {
  name: string
  phone: string
  total_visits: number
  last_visit_at: string
  created_at: string
  birthday: string | null
  source_pct_qr?: number
}
