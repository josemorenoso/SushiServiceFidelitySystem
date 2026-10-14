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
  visitorsLast30d: number
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
  /**
   * Clientes DISTINTOS con al menos una visita en el alcance en los últimos 30 días
   * («Vinieron a esta sede»). Un cliente que va a las dos sedes cuenta en las dos: por eso
   * la suma de las sedes puede pasar del total de la marca, y la pantalla lo dice.
   */
  visitorsLast30d: number
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
 *
 * Sedes separadas, parte 1 (2026-10-14, dueño: «cada número en su lugar»): se suman
 * `origin` (lo de `customers` recortado por dónde se REGISTRÓ el cliente) y `sedes`
 * («Tus sedes», con toda la marca elegida). `brand` NO cambia: sigue siendo la marca entera,
 * y la pantalla con una sede elegida la muestra bajo «De toda la marca», nunca como de la sede.
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

/**
 * Las métricas de `customers` RECORTADAS por la sede donde cada cliente se REGISTRÓ
 * (`customers.origin_location_id`, D2; sedes separadas, parte 1, 2026-10-14).
 *
 * No mueve ni parte a ningún cliente: lo que el cliente HACE (puntos, premios, niveles) sigue
 * siendo de la marca. Es atribución para el reporte: «los clientes que trajo esta sede». Sale
 * de la MISMA función que `brand` (`resumirClientes()`), así que las sedes más «sin sede»
 * suman exactamente la marca.
 *
 * `null` cuando la petición ya es la marca entera (marca + «todas»): ahí el recorte da lo
 * mismo que `brand` y no se manda dos veces.
 */
export interface DashboardAnalyticsOrigin {
  summary: AnalyticsSummaryBrand
  newCustomersPerDay: DailyNewCustomers[]
  customerTiers: TierCount[]
  acquisitionByMonth: AcquisitionChannel[]
}

/** La clave de la fila «Sin sede» (`location_id` NULL) en `ResumenDeSedes.visitasPorDia`. */
export const SIN_SEDE = 'sin_sede'

/** Una tarjeta de «Tus sedes». `locationId` NULL = la fila «Sin sede». Conteos, nunca pesos (D7). */
export interface ResumenDeUnaSede {
  locationId: string | null
  nombre: string
  /** `false` para una sede cerrada que todavía tiene datos (se muestra para que los números cuadren). */
  activa: boolean
  /** Se registraron ahí (`origin_location_id`), desde siempre. */
  clientesQueTrajo: number
  /** De esos, los que se registraron este mes. */
  clientesQueTrajoEsteMes: number
  /** Clientes distintos con visita ahí en 30 días. */
  clientesQueVinieron: number
  /** Visitas ahí en 30 días. */
  visitas: number
  /** Premios entregados ahí en 30 días (`reward_redemptions.redeemed_location_id`). */
  premiosEntregados: number
}

/** Un día del gráfico «Visitas por día, cada sede». `porSede[locationId | SIN_SEDE]`. */
export interface VisitasDelDiaPorSede {
  date: string
  porSede: Record<string, number>
}

/**
 * «Tus sedes»: lo de cada sede, debajo de los totales de la marca (sedes separadas, parte 1).
 * Solo viene con marca + «toda la marca» y 2+ sedes activas; en cualquier otro caso es `null`.
 */
export interface ResumenDeSedes {
  /** Una por sede activa (en el orden del selector) y las cerradas que todavía tienen datos. */
  sedes: ResumenDeUnaSede[]
  /** Lo que no sabe de qué sede es. `null` si no hay nada: entonces la fila no aparece. */
  sinSede: ResumenDeUnaSede | null
  /** Clientes que vinieron a 2+ sedes en 30 días: se cuentan en cada una, no se reparten. */
  clientesEnVariasSedes: number
  /** 30 días, una serie por sede (y «sin sede» solo si tiene visitas). */
  visitasPorDia: VisitasDelDiaPorSede[]
}

export interface DashboardAnalytics {
  brand: DashboardAnalyticsBrand
  location: DashboardAnalyticsLocation
  origin: DashboardAnalyticsOrigin | null
  sedes: ResumenDeSedes | null
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
