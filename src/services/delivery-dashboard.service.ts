/**
 * Delivery Dashboard Service — lo que el apartado de Domicilios LEE.
 *
 * §18.d (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`) + §24.3-B. Doc de la feature:
 * `docs/features/delivery-dashboard.md`.
 *
 * ESTE ARCHIVO ES SOLO LECTURA. No escribe una fila. El intake de domicilios
 * (`delivery.service.ts`, los tres webhooks) no se toca: su contrato lo usa n8n y el
 * único embudo por el que se pierde un pedido sigue siendo `logDeliveryIntakeFailure()`.
 *
 * LAS DOS REGLAS QUE MANDAN ACÁ
 * ─────────────────────────────
 * 1. **Todo `SELECT` lleva `tenant_id` escrito a mano.** El `service_role` se salta el
 *    RLS por definición: el aislamiento entre marcas en este camino ES ese `.eq()`.
 *
 * 2. **`supabase-js` no lanza.** Un fallo vuelve como `{ data: null, error }`, y ese
 *    `null` es idéntico al de «no hay pedidos». En esta pantalla concreta esa confusión
 *    pintaría **«0 domicilios»** cuando lo que pasó es que la base no contestó — que es
 *    exactamente el fallo silencioso que el apartado vino a matar. Por eso ninguna
 *    función de acá devuelve una lista vacía ante un error: devuelven `{ ok: false }` y
 *    la ruta responde 503. Una pantalla que no pudo leer tiene que DECIRLO.
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure, type DbErrorLike } from '@/lib/db-failure'
import { applyLocationFilter, type LocationScope } from '@/lib/location-scope'
import { APP_TIMEZONE, APP_UTC_OFFSET } from '@/lib/timezone'
import {
  assessDeliverySilence,
  SILENCE_WINDOW_DAYS,
  type DeliveryDayBucket,
  type SilenceAssessment,
} from '@/lib/delivery-silence'
import { explainDeliveryFailure, type DeliveryFailureExplanation } from '@/lib/delivery-reasons'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

/** Ninguna lectura de este módulo devuelve «vacío» cuando lo que hubo fue un fallo. */
export type ReadResult<T> = { ok: true; data: T } | { ok: false; error: string }

// ═══════════════════════════════════════════════════════════════
// Fechas — SIEMPRE en hora de Bogotá, nunca en la del navegador
// ═══════════════════════════════════════════════════════════════

/** El día calendario de Bogotá al que pertenece un instante. `YYYY-MM-DD`. */
export function bogotaDate(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  // `en-CA` da `YYYY-MM-DD`; el `timeZone` es lo que impide que a las 8pm en Colombia
  // el servidor (que corre en UTC) cuente el pedido como del día siguiente.
  return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

/** El instante en que empieza ese día calendario en Bogotá, como ISO. */
export function bogotaStartOfDayISO(date: string): string {
  return new Date(`${date}T00:00:00${APP_UTC_OFFSET}`).toISOString()
}

/** El instante en que TERMINA ese día calendario en Bogotá, como ISO. */
export function bogotaEndOfDayISO(date: string): string {
  return new Date(`${date}T23:59:59.999${APP_UTC_OFFSET}`).toISOString()
}

/** `YYYY-MM-DD` de N días antes que `date`. */
export function bogotaDateMinus(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d - days))
  return shifted.toISOString().slice(0, 10)
}

// ═══════════════════════════════════════════════════════════════
// Bloque 1 — el canal: a qué número se manda el cuadro
// ═══════════════════════════════════════════════════════════════

export interface DeliveryChannel {
  tenantName: string
  provider: 'twilio' | 'zernio'
  /**
   * El número al que el operador manda el cuadro, listo para mostrar y copiar
   * (`+573001234567`). `null` = la marca no tiene número configurado todavía.
   *
   * Bajo coexistencia **cada marca recibe en SU número**: ya no hay uno solo que el
   * dueño pueda explicar de memoria para 25 restaurantes. Es el requisito que destapó
   * la coexistencia (§18.d, actualización del 2026-09-06).
   */
  receivingNumber: string | null
  /** `tenants.config.has_delivery_webhook`. `false` NO esconde el apartado. */
  hasDeliveryWebhook: boolean
}

/**
 * Normaliza el número receptor para mostrarlo.
 *
 * `twilio_whatsapp_number` se guarda **tal como llega en el `To` de Twilio**
 * (`whatsapp:+14155238886`) porque `getTenantByWhatsappNumber()` lo compara con `.eq()`
 * contra ese valor crudo. Ese prefijo es de Twilio, no del número: enseñárselo al dueño
 * lo llevaría a marcarlo con el `whatsapp:` incluido. `zernio_phone_number` ya viene en
 * E.164 con `+`.
 */
export function formatReceivingNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const limpio = raw.replace(/^whatsapp:/i, '').trim()
  if (!limpio) return null
  return limpio.startsWith('+') ? limpio : `+${limpio.replace(/^\+*/, '')}`
}

export function buildDeliveryChannel(tenant: Tenant): DeliveryChannel {
  const provider = tenant.messaging_provider ?? 'twilio'
  const raw = provider === 'zernio' ? tenant.zernio_phone_number : tenant.twilio_whatsapp_number
  return {
    tenantName: tenant.name,
    provider,
    receivingNumber: formatReceivingNumber(raw),
    // Ausente se lee como `true`: los tenants que ya reciben domicilios no tienen la
    // clave puesta y decirles «no está activo» sería mentirles sobre algo que funciona.
    hasDeliveryWebhook: tenant.config?.has_delivery_webhook !== false,
  }
}

// ═══════════════════════════════════════════════════════════════
// Bloque 2 — los domicilios que SÍ entraron
// ═══════════════════════════════════════════════════════════════

export interface DeliveryOrderRow {
  id: string
  created_at: string
  customer_id: string
  customer_name: string | null
  customer_phone: string | null
  address: string | null
  payment_method: string | null
  /** Pesos colombianos reales. Un pedido SÍ tiene precio (lo que no lo tiene es un premio). */
  amount: number | null
  raw_message: string | null
  /** `null` = **sede desconocida**, y se muestra como «Sin sede». NUNCA se backfillea. */
  location_id: string | null
  location_name: string | null
  /**
   * `true` = esta visita es la PRIMERA de ese cliente en toda la marca.
   *
   * Ojo con la lectura: si el cliente ya había hecho un check-in por QR, su primer
   * domicilio sale como RECURRENTE — y es correcto, porque nuevo lo es *para la marca*,
   * no *para el canal*. `null` = no se pudo calcular (la consulta auxiliar falló); se
   * muestra sin insignia en vez de afirmar «recurrente» por defecto.
   */
  is_new_customer: boolean | null
  /**
   * El operador que mandó el cuadro, si se puede derivar. Hoy **siempre `null`**:
   * `visits` no guarda el remitente. Se deja en el contrato porque la pantalla ya tiene
   * la columna y el día que exista la columna no hay que tocar la interfaz. Ver
   * `docs/features/delivery-dashboard.md` § "Lo que esta pantalla NO puede decir".
   */
  operator_phone: string | null
}

export interface DeliveryOrdersPage {
  orders: DeliveryOrderRow[]
  total: number
  page: number
  limit: number
}

export interface DeliveryOrderFilters {
  /** ISO. Inclusive. */
  from?: string
  /** ISO. Inclusive. */
  to?: string
  page?: number
  limit?: number
}

interface VisitRow {
  id: string
  created_at: string
  customer_id: string
  address: string | null
  payment_method: string | null
  amount: number | null
  raw_message: string | null
  location_id: string | null
  customers: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
}

/**
 * Para cada cliente de la lista, el instante de su PRIMERA visita en la marca (de
 * cualquier canal). Es lo que decide NUEVO vs RECURRENTE sin heurísticas de reloj.
 *
 * Acotada por construcción: como mucho `ids.length` clientes (una página) por sus visitas.
 * Devuelve `null` si la consulta falla — y entonces la insignia NO se pinta, en vez de
 * pintarse mal.
 */
async function fetchFirstVisitAt(
  ids: readonly string[],
  tenantId: string
): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map()

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('visits')
    .select('customer_id, created_at')
    // Sin alcance de sede A PROPÓSITO: «es su primera visita en la marca» es una
    // pregunta de MARCA. Filtrar por sede acá haría que el mismo cliente saliera
    // «nuevo» en cada sede donde pidiera, que es justo lo que D2 evita al no partir
    // `customers`. El `tenant_id` sigue estando, que es lo que aísla.
    .eq('tenant_id', tenantId)
    .in('customer_id', [...ids])

  if (error) {
    logDbFailure({
      scope: 'DeliveryDashboard',
      reason: 'primera_visita_error',
      error,
      context: { tenant_id: tenantId, clientes: ids.length },
    })
    return null
  }

  const primeras = new Map<string, string>()
  for (const row of (data ?? []) as { customer_id: string; created_at: string }[]) {
    const actual = primeras.get(row.customer_id)
    if (actual === undefined || row.created_at < actual) {
      primeras.set(row.customer_id, row.created_at)
    }
  }
  return primeras
}

/** Nombre de cada sede de la marca, INCLUIDAS las inactivas: una visita vieja apunta ahí. */
async function fetchLocationNames(tenantId: string): Promise<Map<string, string>> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('restaurant_locations')
    .select('id, name')
    .eq('tenant_id', tenantId)

  if (error) {
    // Que no se sepa el NOMBRE de la sede no invalida el pedido. Se registra y la
    // columna cae a «Sin sede» / el id: degradar acá es correcto, callarlo no.
    logDbFailure({
      scope: 'DeliveryDashboard',
      reason: 'sedes_error',
      error,
      context: { tenant_id: tenantId },
    })
    return new Map()
  }

  return new Map((data ?? []).map((l) => [l.id as string, l.name as string]))
}

export async function getDeliveryOrders(
  filters: DeliveryOrderFilters,
  scope: LocationScope
): Promise<ReadResult<DeliveryOrdersPage>> {
  const supabase = getServiceClient()
  const page = filters.page && filters.page > 0 ? filters.page : 1
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 25
  const fromIdx = (page - 1) * limit

  // La base se asigna a un `const` antes de `applyLocationFilter()`: el mismo TS2589 que
  // documenta `getRedemptions()` en redemption.service.ts.
  const baseQuery = supabase
    .from('visits')
    .select(
      'id, created_at, customer_id, address, payment_method, amount, raw_message, location_id, customers(name, phone)',
      { count: 'exact' }
    )
    .eq('tenant_id', scope.tenantId)
    .eq('source', 'delivery')

  let query = applyLocationFilter(baseQuery, scope, 'location_id').order('created_at', {
    ascending: false,
  })

  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)

  const { data, error, count } = await query.range(fromIdx, fromIdx + limit - 1)

  if (error) {
    logDbFailure({
      scope: 'DeliveryDashboard',
      reason: 'listado_error',
      error,
      context: { tenant_id: scope.tenantId, page, limit },
    })
    return { ok: false, error: 'No se pudieron leer los domicilios.' }
  }

  const rows = (data ?? []) as unknown as VisitRow[]
  const ids = [...new Set(rows.map((r) => r.customer_id))]

  const [primeras, sedes] = await Promise.all([
    fetchFirstVisitAt(ids, scope.tenantId),
    fetchLocationNames(scope.tenantId),
  ])

  const orders: DeliveryOrderRow[] = rows.map((row) => {
    // supabase-js devuelve los joins embebidos como objeto (uno-a-uno) o como array.
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
    const primera = primeras?.get(row.customer_id)

    return {
      id: row.id,
      created_at: row.created_at,
      customer_id: row.customer_id,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      address: row.address,
      payment_method: row.payment_method,
      amount: row.amount,
      raw_message: row.raw_message,
      location_id: row.location_id,
      location_name: row.location_id ? (sedes.get(row.location_id) ?? null) : null,
      is_new_customer: primeras === null ? null : primera === row.created_at,
      operator_phone: null,
    }
  })

  return { ok: true, data: { orders, total: count ?? 0, page, limit } }
}

// ═══════════════════════════════════════════════════════════════
// Contadores + la alarma de silencio (§24.3-B)
// ═══════════════════════════════════════════════════════════════

export interface DeliverySummary {
  /** El día de Bogotá sobre el que se calculó todo. */
  today: string
  hoy: number
  ultimos7: number
  ultimos30: number
  /**
   * De los domicilios de los últimos 30 días, cuántos trajeron un cliente que la marca
   * no tenía: su PRIMERA visita en toda la marca fue ese domicilio.
   */
  clientesNuevos30: number
  /** `null` = no se pudo calcular (la consulta auxiliar falló). No se pinta un 0 falso. */
  clientesNuevos30Disponible: boolean
  silence: SilenceAssessment
}

/**
 * Los contadores y la alarma, de UNA lectura.
 *
 * Se leen los 30 días completos (`created_at`, `customer_id`) y se cuenta en memoria en
 * vez de disparar tres `count` distintos: son los mismos datos que ya hacen falta para
 * los cubos diarios de la alarma, y el volumen está acotado por la ventana. La 00053 crea
 * `idx_visits_tenant_source_fecha`, que es justo el índice de esta consulta.
 */
export async function getDeliverySummary(scope: LocationScope): Promise<ReadResult<DeliverySummary>> {
  const supabase = getServiceClient()

  const today = bogotaDate(new Date())
  // 30 días de contadores; la alarma solo mira los últimos SILENCE_WINDOW_DAYS de ellos.
  const desde = bogotaDateMinus(today, 29)
  const desdeISO = bogotaStartOfDayISO(desde)
  const hastaISO = bogotaEndOfDayISO(today)

  const baseQuery = supabase
    .from('visits')
    .select('created_at, customer_id')
    .eq('tenant_id', scope.tenantId)
    .eq('source', 'delivery')

  const query = applyLocationFilter(baseQuery, scope, 'location_id')
    .gte('created_at', desdeISO)
    .lte('created_at', hastaISO)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(20_000)

  if (error) {
    logDbFailure({
      scope: 'DeliveryDashboard',
      reason: 'resumen_error',
      error,
      context: { tenant_id: scope.tenantId, desde },
    })
    return { ok: false, error: 'No se pudieron leer los contadores de domicilios.' }
  }

  const rows = (data ?? []) as { created_at: string; customer_id: string }[]

  const limite7 = bogotaDateMinus(today, 6)
  const limiteVentana = bogotaDateMinus(today, SILENCE_WINDOW_DAYS - 1)

  const porDia = new Map<string, number>()
  let hoy = 0
  let ultimos7 = 0

  for (const row of rows) {
    const dia = bogotaDate(row.created_at)
    if (dia === today) hoy += 1
    if (dia >= limite7) ultimos7 += 1
    if (dia >= limiteVentana) porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }

  const days: DeliveryDayBucket[] = [...porDia.entries()].map(([date, count]) => ({ date, count }))

  // Clientes nuevos: se resuelve con la MISMA regla exacta que la insignia de la lista —
  // la primera visita del cliente en toda la marca es este domicilio.
  const ids = [...new Set(rows.map((r) => r.customer_id))]
  const primeras = await fetchFirstVisitAt(ids, scope.tenantId)

  let clientesNuevos30 = 0
  if (primeras !== null) {
    const yaContados = new Set<string>()
    for (const row of rows) {
      if (yaContados.has(row.customer_id)) continue
      if (primeras.get(row.customer_id) === row.created_at) {
        clientesNuevos30 += 1
        yaContados.add(row.customer_id)
      }
    }
  }

  return {
    ok: true,
    data: {
      today,
      hoy,
      ultimos7,
      ultimos30: rows.length,
      clientesNuevos30,
      clientesNuevos30Disponible: primeras !== null,
      silence: assessDeliverySilence({ days, today }),
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// Bloque 3 — los que NO entraron (§24-B, tabla de la 00053)
// ═══════════════════════════════════════════════════════════════

export interface DeliveryFailureRow {
  id: string
  created_at: string
  operator_phone: string | null
  detail: string
  raw_message: string
  explanation: DeliveryFailureExplanation
}

export interface DeliveryFailuresResult {
  /**
   * `false` = la tabla de la 00053 todavía no existe en esta base. **No es lo mismo que
   * «cero fallos»** y la pantalla lo dice con esas palabras: si acá se pintara un 0, esta
   * pantalla estaría cometiendo el mismo fallo silencioso que vino a matar.
   */
  available: boolean
  failures: DeliveryFailureRow[]
}

/**
 * Códigos de PostgREST/Postgres que significan «esa tabla no existe todavía», es decir,
 * la 00053 no se ha corrido en esta base.
 *
 * `42P01` es el `undefined_table` de Postgres; `PGRST205` es lo que devuelve PostgREST
 * cuando la tabla no está en su caché de esquema. Cualquier OTRO error es un fallo de
 * verdad y NO se disfraza de «falta la migración».
 */
const TABLA_AUSENTE = new Set(['42P01', 'PGRST205'])

function esTablaAusente(error: DbErrorLike | null): boolean {
  if (!error) return false
  if (error.code && TABLA_AUSENTE.has(error.code)) return true
  return /delivery_intake_failures/.test(error.message ?? '') && /does not exist|schema cache/i.test(error.message ?? '')
}

/**
 * Los últimos N pedidos que NO llegaron a la base, de ESTA marca.
 *
 * ⚠️ **Sin filtro de sede, y no es un olvido.** `delivery_intake_failures` no tiene
 * `location_id` a propósito (comentario de la 00053): el fallo más traicionero de todos,
 * `remitente_no_verificable`, ocurre justo cuando la consulta a `authorized_numbers`
 * falló — y ahí la sede es INCONOCIBLE por definición. Una columna que nace casi siempre
 * NULL es la deuda D13 otra vez. Consecuencia visible: esta lista es **de la marca
 * entera** aunque el selector tenga una sede elegida, y la pantalla lo dice.
 *
 * ⚠️ **Sin botón de reintentar.** Reprocesar un pedido vuelve a llamar (y a pagar)
 * OpenAI y es otro alcance; queda anotado como deuda en
 * `docs/features/delivery-dashboard.md`, no construido a medias.
 */
export async function getDeliveryFailures(
  scope: LocationScope,
  limit = 20
): Promise<ReadResult<DeliveryFailuresResult>> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('delivery_intake_failures')
    .select('id, created_at, operator_phone, reason, detail, raw_message')
    .eq('tenant_id', scope.tenantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))

  if (error) {
    if (esTablaAusente(error)) {
      return { ok: true, data: { available: false, failures: [] } }
    }
    logDbFailure({
      scope: 'DeliveryDashboard',
      reason: 'fallos_error',
      error,
      context: { tenant_id: scope.tenantId },
    })
    return { ok: false, error: 'No se pudieron leer los domicilios que no entraron.' }
  }

  const failures: DeliveryFailureRow[] = (
    (data ?? []) as {
      id: string
      created_at: string
      operator_phone: string | null
      reason: string
      detail: string
      raw_message: string
    }[]
  ).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    operator_phone: row.operator_phone,
    detail: row.detail,
    raw_message: row.raw_message,
    explanation: explainDeliveryFailure(row.reason),
  }))

  return { ok: true, data: { available: true, failures } }
}
