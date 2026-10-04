import { createClient } from '@supabase/supabase-js'
import type { Customer, Campaign, CampaignMessage, RestaurantEvent } from '@/types/database.types'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { leerTodo } from '@/lib/leer-todo'
import {
  REACTIVATION_DAYS,
  FREQUENCY_CAP_DAYS,
  BIRTHDAY_LEAD_DAYS,
  MONTHLY_CAP_SOURCES,
  MONTHLY_MARKETING_CAP,
  DEFAULT_RECOVERY_ZONE,
  type RecoveryZone,
} from '@/constants/rewards'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

/** Con qué plantilla y con cuánta anticipación saluda el cron de cumpleaños a UNA marca. */
export interface PlantillaDeCumpleanos {
  /** El puntero (ContentSid de Twilio o nombre de Zernio) que se manda. */
  sid: string
  /** Hasta cuántos días antes del cumpleaños entra el cliente en la ventana. */
  diasDeAnticipacion: number
  /** `se_acerca` = `birthday_upcoming_template_sid`; `el_dia` = `birthday_template_sid`. */
  cual: 'se_acerca' | 'el_dia'
}

/**
 * Qué plantilla de cumpleaños usa una marca HOY. PURA: la regla entera, probable sin red.
 *
 * El saludo pasó a salir dos días antes (dueño, 2026-09-24), pero el texto aprobado dice
 * «¡Feliz cumpleaños!» y no se puede reescribir: la redacción nueva es OTRA plantilla
 * (`birthday_upcoming`, 2026-10-04). Mientras una marca no la tenga APROBADA, sigue como
 * siempre: el texto viejo, el día mismo. El día que Meta la aprueba, la marca se cambia
 * sola. Así nadie recibe «¡Feliz cumpleaños!» dos días antes.
 *
 * `nuevaAprobada` la decide quien llama: en Zernio el puntero solo existe aprobado
 * (`promoteVersion()` y el AIOS solo escriben aprobadas); en Twilio el panel lo escribe al
 * CREAR la plantilla, así que hay que preguntarle a Twilio. Ante la duda, `false`: mandar
 * la vieja el día mismo es lo que la marca ya hacía.
 */
export function elegirPlantillaDeCumpleanos(input: {
  nueva: string | null
  nuevaAprobada: boolean
  vieja: string | null
}): PlantillaDeCumpleanos | null {
  if (input.nueva && input.nuevaAprobada) {
    return { sid: input.nueva, diasDeAnticipacion: BIRTHDAY_LEAD_DAYS, cual: 'se_acerca' }
  }
  if (input.vieja) return { sid: input.vieja, diasDeAnticipacion: 0, cual: 'el_dia' }
  return null
}

/**
 * Los «MM-DD» que caen entre hoy y `diasDeAnticipacion` días después, ambos incluidos.
 * PURA. `setDate` con un número mayor al último del mes rueda solo al mes (y al año)
 * siguiente, así que el 29 de febrero aparece únicamente en los años bisiestos.
 */
export function diasDeLaVentanaDeCumpleanos(hoy: Date, diasDeAnticipacion: number): Set<string> {
  const dias = new Set<string>()
  for (let d = 0; d <= diasDeAnticipacion; d++) {
    const fecha = new Date(hoy)
    fecha.setDate(hoy.getDate() + d)
    dias.add(`${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`)
  }
  return dias
}

/**
 * Los clientes que cumplen años entre HOY y `diasDeAnticipacion` días después.
 *
 * POR QUÉ UNA VENTANA Y NO UN DÍA EXACTO
 * ──────────────────────────────────────
 * Con un día exacto (hoy + 2), el día que una marca pasa de la plantilla vieja (el día
 * mismo) a la nueva (dos días antes) se queda sin saludo quien cumple mañana o pasado:
 * su «hoy + 2» ya pasó y el «el día mismo» ya no corre. Con la ventana, ese día entran
 * los tres y el saludo sale una vez a cada uno; los días siguientes cada cliente entra a
 * la ventana dos días antes y la dedup (`BIRTHDAY_DEDUPE_DAYS`) impide repetirlo. De
 * paso, si el cron no corre un día, al siguiente igual saluda (tarde, pero no nunca).
 * Con `diasDeAnticipacion = 0` es exactamente el comportamiento de siempre.
 *
 * Solo se compara mes y día: el año de nacimiento no interviene. Pagina de a 1.000
 * (`leerTodo()`): PostgREST corta ahí en silencio y una marca grande perdía cumpleañeros.
 */
export async function findBirthdayCustomers(
  tenantId: string,
  diasDeAnticipacion: number = BIRTHDAY_LEAD_DAYS
): Promise<Customer[]> {
  const supabase = getServiceClient()
  const ventana = diasDeLaVentanaDeCumpleanos(new Date(), diasDeAnticipacion)

  const { data, error } = await leerTodo<Customer>((desde, hasta) =>
    supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('birthday', 'is', null)
      .eq('accepts_marketing', true)
      .is('whatsapp_opt_out_at', null)
      .order('id', { ascending: true })
      .range(desde, hasta)
  )

  if (error) {
    throw new Error(`Error buscando cumpleañeros: ${error.message}`)
  }

  // birthday se guarda como date (YYYY-MM-DD); el mes y el día se filtran en JS
  return data.filter((c) => typeof c.birthday === 'string' && ventana.has(c.birthday.slice(5, 10)))
}

/**
 * Finds customers inactive for more than `reactivationDays` (default REACTIVATION_DAYS),
 * respecting the global frequency cap (last_campaign_at).
 * El valor configurable viene de admin_settings via getReactivationDaysConfig().
 */
export async function findInactiveCustomers(tenantId: string, reactivationDays: number = REACTIVATION_DAYS): Promise<Customer[]> {
  const supabase = getServiceClient()
  const cutoffDate = new Date(Date.now() - reactivationDays * 24 * 60 * 60 * 1000).toISOString()
  const campaignCapDate = new Date(Date.now() - FREQUENCY_CAP_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .lt('last_visit_at', cutoffDate)
    .not('last_visit_at', 'is', null)
    .eq('accepts_marketing', true)
    .is('whatsapp_opt_out_at', null)
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
/**
 * `source` se separa de `type` cuando una campaña pertenece a la familia de otra pero debe
 * contarse aparte: el recordatorio de vencimiento de premio es `type='reactivation'` (es del
 * mismo linaje) pero `source='reward_reminder'`, que es lo que lee MONTHLY_CAP_SOURCES.
 * El CHECK de `campaigns.type` no acepta 'reward_reminder'; el de `source` sí (migración 00031).
 */
export async function getOrCreateTodayCampaign(
  type: 'birthday' | 'reactivation',
  messageTemplate: string,
  tenantId: string,
  source?: string
): Promise<Campaign> {
  const supabase = getServiceClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const effectiveSource = source ?? type
  // El nombre lleva el source, no el type: si no, el recordatorio del día reutilizaría la
  // campaña de reactivación de ese mismo día y sus mensajes se contarían bajo el source
  // equivocado.
  const name = `${effectiveSource}_${todayStr}`

  // Esta lectura ES el dedupe: si ya existe la campaña de HOY se reutiliza en vez de
  // crear otra. Ante un fallo de base `existing` llegaba `null`, el cron concluía "hoy
  // todavía no se ha corrido" y creaba una campaña nueva — con lo que el mismo cliente
  // recibe el mensaje de cumpleaños o de reactivación DOS VECES el mismo día. Eso no es
  // solo molesto: se come el frequency cap y le cuesta calidad a la línea con Meta.
  const { data: existing, error: existingError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('name', name)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (isDbFailure(existingError)) {
    logDbFailure({
      scope: 'Campaign',
      reason: 'dedupe_lookup_error',
      error: existingError,
      context: { tenant_id: tenantId, name },
    })
    throw new Error(`No se pudo comprobar si la campaña "${name}" ya existía: ${existingError.message}`)
  }

  if (existing) return existing

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      type,
      source: effectiveSource,
      status: 'running',
      message_template: messageTemplate,
      executed_at: today.toISOString(),
      tenant_id: tenantId,
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
  tenantId: string
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
      tenant_id: params.tenantId,
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
// GUARDAS DE DEMANDA REUTILIZABLES
// ═══════════════════════════════════════════════════════════
// Estas dos reglas estaban copiadas inline en tres sitios con implementaciones
// distintas (JS en campaigns/manual, SQL `.or()` en campaigns/estimate, SQL en
// findInactiveCustomers). Con la cola de goteo hacía falta una CUARTA copia —
// el drenador tiene que re-evaluarlas en el momento del envío, no del encolado
// (spec §3.4) — así que se extraen aquí para que no puedan divergir más.
//
// Ver docs/features/send-governance.md.

/**
 * Frequency cap: ¿pasó ya el mínimo de días desde la última campaña?
 *
 * Un cliente sin `last_campaign_at` nunca ha recibido nada: pasa.
 */
export function passesFrequencyCap(
  lastCampaignAt: string | null | undefined,
  days: number = FREQUENCY_CAP_DAYS,
  now: Date = new Date()
): boolean {
  if (!lastCampaignAt) return true
  const corte = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  return lastCampaignAt < corte
}

/**
 * Recovery Zone: los clientes dentro de la ventana reservada al cron de
 * reactivación personalizado; las campañas manuales no los tocan.
 *
 * La ventana NO es fija: se deriva de los días de reactivación que el tenant
 * configuró en Ajustes (`getRecoveryZoneConfig(tenantId)`). Quien filtra por
 * tenant DEBE pasarla — el default de `DEFAULT_RECOVERY_ZONE` (18-25) es solo
 * para llamadas sin tenant a mano, y protege de más pero no de menos.
 *
 * Un cliente sin `last_visit_at` NO está en la zona (mismo criterio que
 * campaigns/manual, que lo deja pasar).
 */
export function isInRecoveryZone(
  lastVisitAt: string | null | undefined,
  zone: RecoveryZone = DEFAULT_RECOVERY_ZONE,
  now: Date = new Date()
): boolean {
  if (!lastVisitAt) return false
  const cerca = new Date(now.getTime() - zone.startDays * 24 * 60 * 60 * 1000).toISOString()
  const lejos = new Date(now.getTime() - zone.endDays * 24 * 60 * 60 * 1000).toISOString()
  return lastVisitAt < cerca && lastVisitAt >= lejos
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
export async function getActiveBlackouts(tenantId: string, refDate: Date = new Date()): Promise<RestaurantEvent[]> {
  const supabase = getServiceClient()
  const today = refDate.toISOString().split('T')[0]

  // Pull only future-or-today events that haven't been sent/cancelled
  const { data, error } = await supabase
    .from('restaurant_events')
    .select('*')
    .eq('tenant_id', tenantId)
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

// ═══════════════════════════════════════════════════════════
// CAMPAÑA DE CALENDARIO (auto-dispatch desde evento)
// ═══════════════════════════════════════════════════════════

/**
 * Creates a campaign row for a calendar event auto-dispatch.
 * Uses source='calendar' so it counts toward the monthly marketing cap.
 */
export async function createCalendarCampaign(params: {
  name: string
  templateSid: string
  tenantId: string
  mediaUrl?: string | null
  mediaType?: 'image' | 'video' | null
  filters?: Record<string, unknown>
}): Promise<Campaign> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: params.name,
      type: 'manual',
      source: 'calendar',
      status: 'running',
      message_template: `template:${params.templateSid}`,
      filters: params.filters ?? {},
      media_url: params.mediaUrl ?? null,
      media_type: params.mediaType ?? null,
      executed_at: new Date().toISOString(),
      tenant_id: params.tenantId,
    })
    .select()
    .single()

  if (error) throw new Error(`Error creando campaña de calendario: ${error.message}`)
  return data as Campaign
}
