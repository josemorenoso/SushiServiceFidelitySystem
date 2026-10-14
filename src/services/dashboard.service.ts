import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Customer, Reward } from '@/types/database.types'
import { POWER_RANKS, TOP_CUSTOMERS_LIMIT, deriveCycleBands, deriveRiskLevels, getCustomerRank } from '@/constants/rankings'
import { normalizeReactivationDays } from '@/constants/rewards'
import { getMultipleSettings } from '@/services/settings.service'
import { logDbFailure, type DbErrorLike } from '@/lib/db-failure'
import { leerTodo } from '@/lib/leer-todo'
import { getUnscopedServiceClient } from '@/lib/supabase/unscoped'
import { applyLocationFilter, locationMatches, type LocationScope } from '@/lib/location-scope'
import {
  SIN_SEDE,
  type DashboardAnalytics,
  type DashboardAnalyticsOrigin,
  type DailyVisits,
  type DailyNewCustomers,
  type TierCount,
  type RiskGroup,
  type RankedCustomer,
  type HeatmapCell,
  type AcquisitionChannel,
  type ReactivationData,
  type ROIEstimate,
  type ResumenDeSedes,
  type ResumenDeUnaSede,
} from '@/types/analytics.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

/**
 * Multi-sede F7, §8.4: partido en `{ brand, location }` — mezclar numerador de
 * sede con denominador de marca deja de compilar. `brand` sale de `customers`
 * (de la marca para siempre); `location` sale de `visits` (tiene `location_id`).
 */
export interface DashboardMetricsBrand {
  totalCustomers: number
  birthdaysToday: number
  inactiveCustomers: number
  recentCustomers: Customer[]
}

export interface DashboardMetricsLocation {
  visitsToday: number
  visitsThisWeek: number
}

export interface DashboardMetrics {
  brand: DashboardMetricsBrand
  location: DashboardMetricsLocation
}

export async function getDashboardMetrics(scope: LocationScope): Promise<DashboardMetrics> {
  const supabase = getUnscopedServiceClient()
  const tenantId = scope.tenantId
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  // N3-bis (fase 0.bis): «inactivo» = ya le toca el toque suave de ESTA marca, el mismo corte
  // que usa el cron (`findInactiveCustomers()`), con el mismo normalizador que la escala
  // única. Antes era 21 fijo; con los días por defecto sigue siendo 21. (No es un borde de
  // banda de `deriveCycleBands()`: el suave cae DENTRO de Recuperación.)
  const ajustes = await getMultipleSettings(['reactivation_soft_days', 'reactivation_aggressive_days'], tenantId)
  const { softDays } = normalizeReactivationDays(ajustes.reactivation_soft_days, ajustes.reactivation_aggressive_days)
  const inactiveCutoff = new Date(now.getTime() - softDays * 24 * 60 * 60 * 1000).toISOString()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  // La base se asigna a un `const` antes de `applyLocationFilter()` — evita el
  // TS2589 "Type instantiation is excessively deep" que sale de encadenar todo
  // en una sola expresión (ver el mismo comentario en review.service.ts).
  const visitsTodayBase = supabase.from('visits').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStr)
  const visitsTodayQuery = applyLocationFilter(visitsTodayBase, scope, 'location_id')
  const visitsWeekBase = supabase.from('visits').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', weekAgo)
  const visitsWeekQuery = applyLocationFilter(visitsWeekBase, scope, 'location_id')

  const [
    { count: totalCustomers },
    { count: visitsToday },
    { count: visitsThisWeek },
    lecturaCumples,
    { count: inactiveCustomers },
    { data: recentCustomers },
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    visitsTodayQuery,
    visitsWeekQuery,
    // `birthday` es `date` y LIKE no existe para `date` (42883): la consulta que había acá
    // fallaba SIEMPRE y, como el error no se miraba, «cumpleaños hoy» daba 0 desde el
    // principio. Se leen las fechas (paginado: puede pasar de mil) y se cuenta en memoria.
    leerTodo<{ birthday: string }>((desde, hasta) =>
      supabase
        .from('customers')
        .select('birthday')
        .eq('tenant_id', tenantId)
        .not('birthday', 'is', null)
        .order('id', { ascending: true })
        .range(desde, hasta)
    ),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).lt('last_visit_at', inactiveCutoff).not('last_visit_at', 'is', null),
    supabase.from('customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5),
  ])

  // Un fallo acá deja el log y cuenta 0, como el resto de esta función: es un número de
  // tarjeta, no vale tumbar el panel (eso es lo que hizo la analítica el 2026-10-04).
  if (lecturaCumples.error) {
    logDbFailure({
      scope: 'DashboardMetrics',
      reason: 'cumpleanos_hoy',
      error: lecturaCumples.error,
      context: { tenant: tenantId },
    })
  }
  const birthdaysToday = lecturaCumples.error
    ? 0
    : lecturaCumples.data.filter((c) => typeof c.birthday === 'string' && c.birthday.slice(5, 10) === `${month}-${day}`)
        .length

  return {
    brand: {
      totalCustomers: totalCustomers ?? 0,
      birthdaysToday,
      inactiveCustomers: inactiveCustomers ?? 0,
      recentCustomers: recentCustomers ?? [],
    },
    location: {
      visitsToday: visitsToday ?? 0,
      visitsThisWeek: visitsThisWeek ?? 0,
    },
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
    // N3-bis (fase 0.bis): los cortes salen de la escala única de la marca
    // (`deriveCycleBands()`): «Activos» = antes de la banda Recuperación, «Recuperación» = la
    // banda que atiende el cron, «Perdidos» = después. Antes eran 18/25 fijos y una marca con
    // días propios veía otro reloj que el de Campañas. Con los días por defecto: 18 y 25.
    const ajustes = await getMultipleSettings(['reactivation_soft_days', 'reactivation_aggressive_days'], tenantId)
    const recuperacion = deriveCycleBands(ajustes.reactivation_soft_days, ajustes.reactivation_aggressive_days).find(
      (b) => b.name === 'Recuperación'
    )!
    const activeCutoff = new Date(now.getTime() - recuperacion.minDays * 24 * 60 * 60 * 1000).toISOString()
    const lostCutoff   = new Date(now.getTime() - recuperacion.maxDays * 24 * 60 * 60 * 1000).toISOString()
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

// ─── Lecturas de la analítica (ESCALA-4, 2026-10-04) ───────────────────────────
//
// PostgREST corta TODA respuesta en 1.000 filas, en silencio. `getFullAnalytics()` leía clientes,
// visitas de 6 meses y mensajes de campaña sin `.range()` y sin mirar `error`: en una marca que
// pasara de mil filas en cualquiera de ellas salían mal el total de clientes, el mapa de calor
// día × hora y la tasa de reactivación, y un fallo de base se veía como «cero». Ahora todo lo que
// puede pasar de mil pagina con `leerTodo()` y todo `error` se vuelve un fallo visible.

/** Lo que la analítica lee de `visits`. */
interface VisitaLeida {
  id: string
  customer_id: string
  source: string
  created_at: string
  location_id: string | null
}

/** Lo que la analítica lee de `campaigns`. */
interface CampanaLeida {
  id: string
  type: string
  executed_at: string | null
}

/** Lo único que la tasa de reactivación necesita de `campaign_messages`. */
interface MensajeLeido {
  campaign_id: string
  customer_id: string
}

/**
 * Cuántos ids de campaña van en un `.in()`. Viajan en la URL del GET de PostgREST (36 caracteres
 * cada uno). Con una campaña de reactivación por día serían ~180 en seis meses, unos 6.700
 * caracteres en una sola URL, y el tope del gateway no es algo que este código controle ni haya
 * medido. En lotes de 100 son ~3.700.
 */
const CAMPANAS_POR_CONSULTA = 100

/**
 * Convierte la respuesta de una lectura en sus filas, o en un fallo VISIBLE.
 *
 * ⚠️ `supabase-js` no lanza: un error vuelve como `{ data: null, error }` y `leerTodo()` devuelve
 * `[]` más el `error`. Quien solo lea `data` ve «cero filas», que es exactamente lo que ve un
 * restaurante recién abierto. Aquí el error se registra con contexto (`[Analytics][FALLO]`) y se
 * lanza: `/api/dashboard/analytics` lo contesta con un 500 en vez de pintar un panel en ceros.
 */
function exigirLectura<T>(
  lectura: { data: T[]; error: DbErrorLike | null },
  razon: string,
  tenantId: string
): T[] {
  if (lectura.error) {
    logDbFailure({ scope: 'Analytics', reason: razon, error: lectura.error, context: { tenant: tenantId } })
    throw new Error(`Error leyendo la analítica (${razon}): ${lectura.error.message}`)
  }
  return lectura.data
}

/**
 * TODAS las visitas de la marca desde `desdeStr`. Ordenadas por `created_at, id`: ninguna de las
 * dos cambia, así que una visita nueva a mitad de la lectura cae al final y no mueve las páginas
 * ya leídas; y `id` desempata las que comparten instante (un domicilio y un QR en el mismo
 * segundo), que sin él se pisarían entre páginas.
 */
function leerVisitas(supabase: SupabaseClient, tenantId: string, desdeStr: string) {
  return leerTodo<VisitaLeida>((desde, hasta) =>
    supabase
      .from('visits')
      .select('id, customer_id, source, created_at, location_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', desdeStr)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, hasta)
  )
}

/**
 * Los mensajes de ESAS campañas y de ninguna otra. Antes se traía `campaign_messages` entero de
 * la marca (cada difusión del Golden Bullet, cada cumpleaños) para quedarse en JS con los pocos
 * de reactivación. Sin campañas no hay nada que preguntar: cero idas.
 */
async function leerMensajesDeCampanas(
  supabase: SupabaseClient,
  tenantId: string,
  campaignIds: string[]
): Promise<{ data: MensajeLeido[]; error: DbErrorLike | null }> {
  const lotes: string[][] = []
  for (let i = 0; i < campaignIds.length; i += CAMPANAS_POR_CONSULTA) {
    lotes.push(campaignIds.slice(i, i + CAMPANAS_POR_CONSULTA))
  }
  const lecturas = await Promise.all(
    lotes.map((lote) =>
      leerTodo<MensajeLeido>((desde, hasta) =>
        supabase
          .from('campaign_messages')
          .select('campaign_id, customer_id')
          .eq('tenant_id', tenantId)
          .in('campaign_id', lote)
          .order('id', { ascending: true })
          .range(desde, hasta)
      )
    )
  )
  return { data: lecturas.flatMap((l) => l.data), error: lecturas.find((l) => l.error)?.error ?? null }
}

// ─── Lo de cada sede (sedes separadas, parte 1, 2026-10-14) ────────────────────
//
// El dueño, mirando Tepuy: con Envigado elegido el panel decía «40 clientes» y con Laureles
// también 40. Las métricas de `customers` eran de la marca sin decirlo. Ahora, con una sede
// elegida, esas cuentas se recortan por DÓNDE SE REGISTRÓ cada cliente
// (`customers.origin_location_id`, D2, que el check-in llena desde F3) — atribución para el
// reporte; el cliente no se mueve ni se parte. Y con «toda la marca», «Tus sedes» pone debajo
// de los totales lo de cada sede.

/** Las fechas que comparten todas las cuentas de clientes de UNA corrida de la analítica. */
interface VentanasDeClientes {
  /** Claves 'AAAA-MM-DD' de los últimos 30 días, de la más vieja a hoy. */
  dias30: string[]
  hoy: string
  hace30: Date
  haceUnaSemana: Date
  /** 'MM-DD' de hoy: los cumpleaños. */
  mesDia: string
  /** Claves 'AAAA-MM' de los últimos 6 meses, del más viejo al actual. */
  meses6: string[]
}

/**
 * Lo que sale de un conjunto de clientes: el resumen, los niveles, los nuevos por día y la
 * adquisición por mes. UNA función para la marca y para el recorte por sede: la regla es la
 * misma por construcción, así que las sedes más «sin sede» suman exactamente la marca.
 */
function resumirClientes(customers: Customer[], v: VentanasDeClientes): DashboardAnalyticsOrigin {
  const newCustMap: Record<string, number> = {}
  for (const key of v.dias30) newCustMap[key] = 0
  for (const c of customers) {
    const cDate = c.created_at.split('T')[0]
    if (newCustMap[cDate] !== undefined) newCustMap[cDate]++
  }

  const olderCustomers = customers.filter((c) => new Date(c.created_at) < v.hace30).length
  let cumulative = olderCustomers
  const newCustomersPerDay: DailyNewCustomers[] = v.dias30.map((date) => {
    cumulative += newCustMap[date]
    return { date, count: newCustMap[date], cumulative }
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

  // --- ACQUISITION CHANNEL BY MONTH (últimos 6 meses) ---
  const acqMap: Record<string, { qr: number; delivery: number }> = {}
  for (const key of v.meses6) acqMap[key] = { qr: 0, delivery: 0 }
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
  const acquisitionByMonth: AcquisitionChannel[] = v.meses6.map((m) => {
    const d = new Date(m + '-15')
    const label = d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
    return { month: label, qr: acqMap[m].qr, delivery: acqMap[m].delivery }
  })

  return {
    summary: {
      totalCustomers: customers.length,
      newCustomersToday: newCustMap[v.hoy] ?? 0,
      newCustomersWeek: customers.filter((c) => new Date(c.created_at) >= v.haceUnaSemana).length,
      frequentCustomers: customers.filter((c) => c.total_visits >= 3).length,
      // `birthday` llega como 'AAAA-MM-DD' (columna `date`): hoy es quien coincide en mes y día.
      birthdaysToday: customers.filter((c) => typeof c.birthday === 'string' && c.birthday.slice(5, 10) === v.mesDia)
        .length,
    },
    newCustomersPerDay,
    customerTiers,
    acquisitionByMonth,
  }
}

/** Una sede de la marca como la lee «Tus sedes»: también las cerradas, por su historia. */
export interface SedeDeLaMarca {
  id: string
  name: string
  is_active: boolean
}

/**
 * «Tus sedes»: lo de cada sede en 30 días, más lo que no sabe de qué sede es. PURA.
 *
 * - **Clientes que trajo**: se registraron ahí (`origin_location_id`). Partición: cada cliente
 *   está en UNA sede o en «sin sede», así que la suma da el total de la marca.
 * - **Clientes que vinieron**: distintos, con visita ahí. NO es partición: quien fue a las dos
 *   sedes cuenta en las dos, y `clientesEnVariasSedes` dice cuántos son (se cuentan, no se
 *   reparten).
 * - **Premios entregados**: `reward_redemptions.redeemed_location_id`, la sede del mesero que
 *   entregó (lo escribe `recordRedemption()` desde esta misma parte; lo anterior queda «sin sede»).
 *
 * `location_id` NULL va a «sin sede» y se muestra: nunca se reparte ni se esconde. Una sede
 * cerrada con datos sale con su nombre, para que los números sigan cuadrando.
 */
export function resumirSedes(p: {
  sedes: readonly SedeDeLaMarca[]
  clientes: readonly Pick<Customer, 'origin_location_id' | 'created_at'>[]
  visitas30d: readonly { customer_id: string; location_id: string | null; created_at: string }[]
  premios30d: readonly { redeemed_location_id: string | null }[]
  dias30: readonly string[]
  /** 'AAAA-MM' en UTC, el mismo reloj que `created_at`. */
  mesActual: string
}): ResumenDeSedes {
  interface Cuenta {
    trajo: number
    esteMes: number
    vinieron: Set<string>
    visitas: number
    premios: number
  }
  const nueva = (): Cuenta => ({ trajo: 0, esteMes: 0, vinieron: new Set(), visitas: 0, premios: 0 })
  const cuentas = new Map<string, Cuenta>()
  const nombres = new Map<string, SedeDeLaMarca>()
  for (const s of p.sedes) {
    cuentas.set(s.id, nueva())
    nombres.set(s.id, s)
  }
  cuentas.set(SIN_SEDE, nueva())
  const de = (locationId: string | null): Cuenta => {
    const key = locationId ?? SIN_SEDE
    let c = cuentas.get(key)
    if (!c) {
      // No debería pasar: se leen TODAS las sedes de la marca, y la FK compuesta impide una
      // sede de otra marca. Si pasara, se muestra igual en vez de perder el dato.
      c = nueva()
      cuentas.set(key, c)
      nombres.set(key, { id: key, name: 'Otra sede', is_active: false })
    }
    return c
  }

  for (const c of p.clientes) {
    const cuenta = de(c.origin_location_id)
    cuenta.trajo++
    if (c.created_at.substring(0, 7) === p.mesActual) cuenta.esteMes++
  }

  const porDia = new Map<string, Map<string, number>>()
  for (const dia of p.dias30) porDia.set(dia, new Map())
  const sedesDelCliente = new Map<string, Set<string>>()
  for (const v of p.visitas30d) {
    const cuenta = de(v.location_id)
    cuenta.visitas++
    cuenta.vinieron.add(v.customer_id)
    const key = v.location_id ?? SIN_SEDE
    const delDia = porDia.get(v.created_at.split('T')[0])
    if (delDia) delDia.set(key, (delDia.get(key) ?? 0) + 1)
    if (v.location_id) {
      const suyas = sedesDelCliente.get(v.customer_id) ?? new Set<string>()
      suyas.add(v.location_id)
      sedesDelCliente.set(v.customer_id, suyas)
    }
  }

  for (const r of p.premios30d) de(r.redeemed_location_id).premios++

  const fila = (key: string, cuenta: Cuenta, nombre: string, activa: boolean): ResumenDeUnaSede => ({
    locationId: key === SIN_SEDE ? null : key,
    nombre,
    activa,
    clientesQueTrajo: cuenta.trajo,
    clientesQueTrajoEsteMes: cuenta.esteMes,
    clientesQueVinieron: cuenta.vinieron.size,
    visitas: cuenta.visitas,
    premiosEntregados: cuenta.premios,
  })
  const tieneDatos = (c: Cuenta) => c.trajo > 0 || c.visitas > 0 || c.premios > 0

  const sedes: ResumenDeUnaSede[] = []
  for (const [key, cuenta] of cuentas) {
    if (key === SIN_SEDE) continue
    const sede = nombres.get(key)!
    // Las activas salen siempre, aunque estén en cero (es justo lo que el dueño tiene que ver);
    // una cerrada, solo si todavía tiene datos.
    if (sede.is_active || tieneDatos(cuenta)) sedes.push(fila(key, cuenta, sede.name, sede.is_active))
  }
  const sinSedeCuenta = cuentas.get(SIN_SEDE)!
  const sinSede = tieneDatos(sinSedeCuenta) ? fila(SIN_SEDE, sinSedeCuenta, 'Sin sede', true) : null

  const series = [...sedes.map((s) => s.locationId as string), ...(sinSede && sinSede.visitas > 0 ? [SIN_SEDE] : [])]
  const visitasPorDia = p.dias30.map((date) => {
    const delDia = porDia.get(date)!
    const porSede: Record<string, number> = {}
    for (const key of series) porSede[key] = delDia.get(key) ?? 0
    return { date, porSede }
  })

  return {
    sedes,
    sinSede,
    clientesEnVariasSedes: [...sedesDelCliente.values()].filter((s) => s.size >= 2).length,
    visitasPorDia,
  }
}

/** ¿Esta petición lleva «Tus sedes»? Solo la marca, con «toda la marca», y con 2+ sedes activas. */
function llevaTusSedes(scope: LocationScope): boolean {
  return scope.role === 'brand' && scope.selection === 'all' && scope.brandActiveLocationCount >= 2
}

/**
 * Todas las sedes de la marca, también las cerradas (su historia sigue contando), en el orden del
 * selector. Pagina como toda lectura de la analítica (ESCALA-4), con `id` al final del orden.
 */
function leerSedesDeLaMarca(supabase: SupabaseClient, tenantId: string) {
  return leerTodo<SedeDeLaMarca>((desde, hasta) =>
    supabase
      .from('restaurant_locations')
      .select('id, name, is_active')
      .eq('tenant_id', tenantId)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, hasta)
  )
}

/** Los premios entregados desde `desdeStr`, con su sede. Pagina: pueden pasar de mil. */
function leerPremiosEntregados(supabase: SupabaseClient, tenantId: string, desdeStr: string) {
  return leerTodo<{ id: string; redeemed_location_id: string | null }>((desde, hasta) =>
    supabase
      .from('reward_redemptions')
      .select('id, redeemed_location_id')
      .eq('tenant_id', tenantId)
      .gte('redeemed_at', desdeStr)
      .order('redeemed_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, hasta)
  )
}

export async function getFullAnalytics(scope: LocationScope): Promise<DashboardAnalytics> {
  const supabase = getUnscopedServiceClient()
  const tenantId = scope.tenantId
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

  const dias30: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dias30.push(formatDate(d))
  }
  const meses6: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    meses6.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const ventanas: VentanasDeClientes = {
    dias30,
    hoy: todayStr,
    hace30: thirtyDaysAgo,
    haceUnaSemana: weekAgo,
    mesDia: `${month}-${day}`,
    meses6,
  }
  const conTusSedes = llevaTusSedes(scope)

  // Las lecturas van en paralelo entre sí; cada una pagina por dentro (ver `leerTodo()`).
  //
  // `customers` NO se ordena por `total_visits` en la base: esa columna cambia con cada check-in,
  // y uno a mitad de la lectura movería a un cliente de página (saldría dos veces o ninguna). Se
  // pagina por `created_at, id`, que no cambian, y se ordena por visitas enseguida, en memoria.
  //
  // Los cumpleaños de hoy NO son una lectura aparte: salen de `customers`, que ya se trae entera.
  // Hubo una (`.like('birthday', '%-MM-DD')`) y `birthday` es `date`: Postgres contesta 42883
  // («operator does not exist: date ~~ unknown»). Mientras el `error` se ignoraba daba 0 en
  // silencio; cuando se empezó a exigir, tumbó la analítica entera de todas las marcas (2026-10-04).
  //
  // «Tus sedes» suma dos lecturas, y SOLO cuando se dibuja (marca + toda la marca + 2+ sedes):
  // las sedes de la marca (también las cerradas) y los premios entregados en 30 días. Una marca
  // de una sede no paga ni una ida más.
  const [lecturaClientes, lecturaVisitas30d, lecturaVisitas6m, lecturaCampanas, lecturaAjustes, lecturaSedes, lecturaPremios] =
    await Promise.all([
      leerTodo<Customer>((desde, hasta) =>
        supabase
          .from('customers')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(desde, hasta)
      ),
      leerVisitas(supabase, tenantId, thirtyDaysAgoStr),
      leerVisitas(supabase, tenantId, sixMonthsAgoStr),
      leerTodo<CampanaLeida>((desde, hasta) =>
        supabase
          .from('campaigns')
          .select('id, type, executed_at')
          .eq('tenant_id', tenantId)
          .eq('type', 'reactivation')
          .not('executed_at', 'is', null)
          .order('id', { ascending: true })
          .range(desde, hasta)
      ),
      // Tres claves, una fila cada una (la clave es única por marca): no se pagina, pero su
      // `error` también se exige. Los días de reactivación arman las bandas de riesgo.
      supabase
        .from('admin_settings')
        .select('key, value')
        .eq('tenant_id', tenantId)
        .in('key', ['avg_ticket', 'reactivation_soft_days', 'reactivation_aggressive_days']),
      conTusSedes ? leerSedesDeLaMarca(supabase, tenantId) : Promise.resolve(null),
      conTusSedes ? leerPremiosEntregados(supabase, tenantId, thirtyDaysAgoStr) : Promise.resolve(null),
    ])

  const customers: Customer[] = exigirLectura(lecturaClientes, 'analitica_clientes', tenantId).sort(
    (a, b) => (b.total_visits ?? 0) - (a.total_visits ?? 0)
  )
  const recentVisits = exigirLectura(lecturaVisitas30d, 'analitica_visitas_30d', tenantId)
  const allVisits6m = exigirLectura(lecturaVisitas6m, 'analitica_visitas_6m', tenantId)
  const reactivationCampaigns = exigirLectura(lecturaCampanas, 'analitica_campanas', tenantId)
  const settingsData = exigirLectura(
    { data: lecturaAjustes.data ?? [], error: lecturaAjustes.error },
    'analitica_ajustes',
    tenantId
  )

  // `visits` (30 días) es de LA SEDE: se recorta al alcance de la petición antes
  // de construir el mapa diario. `reactivationRate` más abajo usa su propio
  // `visits6m` SIN recortar — el reloj de reactivación es de la marca (§8.2) — así
  // que las dos vistas de la misma tabla conviven sin pisarse.
  const visits = recentVisits.filter((v) => locationMatches(scope, v.location_id))

  const visitsMap: Record<string, { qr: number; delivery: number }> = {}
  for (const key of dias30) visitsMap[key] = { qr: 0, delivery: 0 }

  for (const v of visits) {
    const vDate = v.created_at.split('T')[0]
    if (visitsMap[vDate]) {
      if (v.source === 'delivery') visitsMap[vDate].delivery++
      else visitsMap[vDate].qr++
    }
  }

  const visitsPerDay: DailyVisits[] = dias30.map((date) => {
    const v = visitsMap[date]
    return { date, qr: v.qr, delivery: v.delivery, total: v.qr + v.delivery }
  })

  // Lo de `customers`, dos veces con la MISMA función: la marca entera, y el recorte por dónde se
  // registró cada cliente cuando la petición no es la marca entera (una sede, las sedes de un
  // administrador de sede, o el cubo «sin sede» que todavía se puede pedir por la URL).
  const deLaMarca = resumirClientes(customers, ventanas)
  const origin =
    scope.locationIds === null
      ? null
      : resumirClientes(
          customers.filter((c) => locationMatches(scope, c.origin_location_id)),
          ventanas
        )

  // Las burbujas usan la MISMA escala que la tira de Campañas y el cron: la derivan los días
  // de reactivación de esta marca (`deriveRiskLevels()`), no una tabla fija.
  const ajuste = (key: string) => settingsData.find((s) => s.key === key)?.value
  const riskLevels = deriveRiskLevels(ajuste('reactivation_soft_days'), ajuste('reactivation_aggressive_days'))
  const riskBuckets: Record<string, { id: string; name: string; phone: string; daysInactive: number; total_visits: number }[]> = {}
  for (const level of riskLevels) riskBuckets[level.name] = []
  for (const c of customers) {
    if (!c.last_visit_at) continue
    const inactive = daysBetween(new Date(c.last_visit_at), now)
    // «Reciente» no es una banda de riesgo: quien la cumple no cae en ninguna.
    const level = riskLevels.find((r) => inactive >= r.minDays && inactive <= r.maxDays)
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
  const atRiskGroups: RiskGroup[] = riskLevels.map((r) => ({
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

  // --- HEATMAP: Día × Hora de visitas (últimos 6 meses) ---
  const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const heatmapGrid: Record<string, number> = {}
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      heatmapGrid[`${d}-${h}`] = 0
    }
  }
  // El heatmap es de LA SEDE (igual que `visitsPerDay`); `reactivationRate` más
  // abajo relee `allVisits6m` SIN este recorte porque esa métrica es de la marca.
  for (const v of allVisits6m.filter((vv) => locationMatches(scope, vv.location_id))) {
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

  // --- REACTIVATION RATE (por mes, últimos 6 meses) ---
  const visits6m = allVisits6m

  const reactivationMap: Record<string, { sent: Set<string>; returned: Set<string> }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    reactivationMap[key] = { sent: new Set(), returned: new Set() }
  }

  // Solo cuentan las campañas cuyo mes está en el mapa (las demás se saltaban igual), así que solo
  // de ESAS se leen los mensajes. Antes se traía el `campaign_messages` entero de la marca.
  const campaigns6m = reactivationCampaigns.filter(
    (c): c is CampanaLeida & { executed_at: string } =>
      !!c.executed_at && reactivationMap[c.executed_at.substring(0, 7)] !== undefined
  )
  const messages6m = exigirLectura(
    await leerMensajesDeCampanas(
      supabase,
      tenantId,
      campaigns6m.map((c) => c.id)
    ),
    'analitica_mensajes',
    tenantId
  )

  // A quién se le escribió, por campaña. `Set` y no un arreglo con `includes()`: ahora que las
  // lecturas vienen completas, «cada visita × cada campaña × cada destinatario» ya no es un
  // cálculo de mil filas. La fecha de cada visita se parsea UNA vez, no una por campaña.
  const destinatarios = new Map<string, Set<string>>()
  for (const m of messages6m) {
    const de = destinatarios.get(m.campaign_id) ?? new Set<string>()
    de.add(m.customer_id)
    destinatarios.set(m.campaign_id, de)
  }
  const instantes = visits6m.map((v) => new Date(v.created_at).getTime())

  for (const campaign of campaigns6m) {
    const campaignMonth = campaign.executed_at.substring(0, 7)
    const campaignStart = new Date(campaign.executed_at).getTime()
    const sevenDaysLater = campaignStart + 7 * 24 * 60 * 60 * 1000

    const customerIds = destinatarios.get(campaign.id) ?? new Set<string>()
    for (const cid of customerIds) {
      reactivationMap[campaignMonth].sent.add(cid)
    }

    for (let i = 0; i < visits6m.length; i++) {
      if (customerIds.has(visits6m[i].customer_id) && instantes[i] >= campaignStart && instantes[i] <= sevenDaysLater) {
        reactivationMap[campaignMonth].returned.add(visits6m[i].customer_id)
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
  const avgTicketStr = ajuste('avg_ticket') ?? '35000'
  const avgTicket = parseFloat(avgTicketStr) || 35000
  const roiEstimate: ROIEstimate = {
    reactivatedThisMonth,
    avgTicket,
    estimatedROI: reactivatedThisMonth * avgTicket,
  }

  // --- TUS SEDES (solo marca + toda la marca + 2+ sedes) ---
  let sedes: ResumenDeSedes | null = null
  if (conTusSedes && lecturaSedes && lecturaPremios) {
    const sedesDeLaMarca = exigirLectura(lecturaSedes, 'analitica_sedes', tenantId)
    const premios = exigirLectura(lecturaPremios, 'analitica_premios_entregados', tenantId)
    sedes = resumirSedes({
      sedes: sedesDeLaMarca,
      clientes: customers,
      visitas30d: recentVisits,
      premios30d: premios,
      dias30,
      mesActual: now.toISOString().slice(0, 7),
    })
  }

  return {
    brand: {
      summary: deLaMarca.summary,
      newCustomersPerDay: deLaMarca.newCustomersPerDay,
      customerTiers: deLaMarca.customerTiers,
      atRiskGroups,
      topCustomers,
      acquisitionByMonth: deLaMarca.acquisitionByMonth,
      reactivationRate,
      roiEstimate,
    },
    location: {
      summary: {
        visitsToday: todayVisits.qr + todayVisits.delivery,
        deliveriesToday: todayVisits.delivery,
        qrToday: todayVisits.qr,
        visitorsLast30d: new Set(visits.map((v) => v.customer_id)).size,
      },
      visitsPerDay,
      heatmap,
    },
    origin,
    sedes,
  }
}
