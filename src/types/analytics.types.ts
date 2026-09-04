/**
 * El resumen MERGEADO — forma plana que consume `MetricsCards`. Se arma en el
 * componente de página juntando `DashboardAnalyticsBrand['summary']` +
 * `DashboardAnalyticsLocation['summary']` (multi-sede F7, §8.4): es el ÚNICO
 * punto donde numerador de sede y denominador de marca se tocan, y es a propósito
 * — una tarjeta de resumen es presentación, no una consulta.
 */
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

/** Las métricas que salen de `customers`: de la MARCA para siempre (§8.4 del
 *  spec de multi-sede). No por limitación — porque el dueño pidió que el cliente
 *  conserve su recorrido entre las dos sedes: un cliente que come en las dos no
 *  pertenece a ninguna. */
export interface AnalyticsSummaryBrand {
  totalCustomers: number
  newCustomersToday: number
  newCustomersWeek: number
  frequentCustomers: number
  birthdaysToday: number
}

/** Las métricas que salen de `visits`: sí se pueden partir por sede. */
export interface AnalyticsSummaryLocation {
  visitsToday: number
  deliveriesToday: number
  qrToday: number
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
  campaignAttractionRate?: number
  newFromCampaigns?: number
  campaignROI?: number
  retentionROI?: number
}

/**
 * Multi-sede F7, §8.4: el tipo de retorno de `getFullAnalytics()` se parte en
 * `{ brand, location }` para que mezclar numerador de sede con denominador de
 * marca deje de poder hacerse por descuido — no compila.
 *
 * `brand`: sale de `customers` (o de tablas sin `location_id`, como
 * `campaigns`/`campaign_messages` para `reactivationRate` — el reloj de
 * reactivación es de la marca, §8.2). Estable pase lo que pase con el selector.
 *
 * `location`: sale de `visits`, que sí tiene `location_id`. Cambia con el
 * `?location_id=` de la petición.
 */
export interface DashboardAnalyticsBrand {
  summary: AnalyticsSummaryBrand
  newCustomersPerDay: DailyNewCustomers[]
  customerTiers: TierCount[]
  atRiskGroups: RiskGroup[]
  topCustomers: RankedCustomer[]
  acquisitionByMonth: AcquisitionChannel[]
  reactivationRate: ReactivationData[]
  roiEstimate: ROIEstimate
}

export interface DashboardAnalyticsLocation {
  summary: AnalyticsSummaryLocation
  visitsPerDay: DailyVisits[]
  heatmap: HeatmapCell[]
}

export interface DashboardAnalytics {
  brand: DashboardAnalyticsBrand
  location: DashboardAnalyticsLocation
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
