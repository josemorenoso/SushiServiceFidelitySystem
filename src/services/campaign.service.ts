import { createClient } from '@supabase/supabase-js'
import type { Customer, Campaign, CampaignMessage, RestaurantEvent } from '@/types/database.types'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { leerTodo } from '@/lib/leer-todo'
import {
  REACTIVATION_DAYS,
  FREQUENCY_CAP_DAYS,
  BIRTHDAY_LEAD_DAYS,
  BIRTHDAY_DEDUPE_DAYS,
  MAX_INTENTOS_FALLIDOS_POR_TOQUE,
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
 *
 * Los crons la llaman en un `finally` (fase 0.bis, R2): si la corrida aborta a mitad, a
 * los que YA recibieron mensaje igual se les marca, y una campaña manual no les escribe
 * dentro de los 7 días. Por eso no lanza (un `throw` dentro del `finally` taparía el error
 * que abortó la corrida); su propio fallo queda en el log con `logDbFailure`.
 */
export async function updateCustomerLastCampaignAt(customerIds: string[]): Promise<void> {
  if (customerIds.length === 0) return
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('customers')
    .update({ last_campaign_at: new Date().toISOString() })
    .in('id', customerIds)
  if (error) {
    logDbFailure({
      scope: 'Campaign',
      reason: 'last_campaign_at_error',
      error,
      context: { clientes: customerIds.length },
    })
  }
}

/**
 * Los `campaign_messages.status` que significan «el mensaje SALIÓ». El CHECK de la 00004
 * admite `pending | sent | delivered | failed`; hoy el código solo escribe `sent` y
 * `failed` (las confirmaciones de entrega van a `message_logs`), pero `delivered` también
 * salió, así que cuenta.
 */
export const ESTADOS_QUE_SALIERON = ['sent', 'delivered'] as const

/**
 * ¿Le SALIÓ a este cliente un mensaje de campaña de este tipo en los últimos `withinDays` días?
 *
 * Solo cuentan los que salieron (`ESTADOS_QUE_SALIERON`). Hasta el 2026-10-08 contaba
 * cualquier fila, y los crons graban los fallidos con `sent_at` (N3): un envío FALLIDO
 * callaba 30 días la reactivación y 360 el cumpleaños sin que nadie lo supiera. Ahora un
 * fallo se reintenta en la corrida siguiente.
 *
 * Un fallo de base LANZA: devolver `false` era mandarle el mensaje otra vez a quien ya lo
 * recibió (es el dedupe del cumpleaños y del toque suave).
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
    .in('status', [...ESTADOS_QUE_SALIERON])
    .gte('sent_at', since)
    .limit(1)

  if (error) {
    logDbFailure({
      scope: 'Campaign',
      reason: 'dedupe_reciente_error',
      error,
      context: { customer_id: customerId, tipo: campaignType },
    })
    throw new Error(`No se pudo comprobar si el cliente ya recibió "${campaignType}": ${error.message}`)
  }

  return (data?.length ?? 0) > 0
}

/**
 * ¿Ya le salió a este cliente el toque INSISTENTE desde su última visita? (N4, 2026-10-08)
 *
 * El insistente sale como máximo UNA vez mientras el cliente no vuelva. Antes se repetía
 * cada ~30 días para siempre (con premio y recordatorio: dos mensajes al mes a un cliente
 * perdido).
 *
 * CÓMO SE DISTINGUE DEL SUAVE: los dos son `campaigns.type = 'reactivation'` y
 * `message_type = 'reactivation'`, así que el tipo no alcanza. Lo que los separa es CUÁNDO
 * salieron: el cron solo le manda el insistente a quien lleva MÁS de `aggressiveDays` sin
 * venir, y el suave a quien lleva menos. Así que un mensaje de reactivación que salió
 * después de `last_visit_at + aggressiveDays` es un insistente. Preguntar solo
 * «¿hay alguno después de la última visita?» contaría también el suave, y el insistente no
 * saldría nunca.
 *
 * `campaigns.source = 'reactivation'` deja fuera el recordatorio de premio, que también es
 * `type = 'reactivation'` (con `source = 'reward_reminder'`).
 *
 * Si la marca sube `aggressiveDays` después de un envío, un insistente viejo puede quedar
 * por debajo del umbral nuevo y salir UNO más: es el borde aceptado (sin columna nueva no
 * hay otra marca del toque; el ciclo de la fase 1 la trae).
 */
export async function yaRecibioElInsistente(
  customerId: string,
  lastVisitAt: string,
  aggressiveDays: number
): Promise<boolean> {
  const supabase = getServiceClient()
  const umbral = new Date(new Date(lastVisitAt).getTime() + aggressiveDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('campaign_messages')
    .select('id, campaigns!inner(type, source)')
    .eq('customer_id', customerId)
    .eq('campaigns.type', 'reactivation')
    .eq('campaigns.source', 'reactivation')
    .in('status', [...ESTADOS_QUE_SALIERON])
    .gt('sent_at', umbral)
    .limit(1)

  if (error) {
    logDbFailure({
      scope: 'Campaign',
      reason: 'insistente_previo_error',
      error,
      context: { customer_id: customerId },
    })
    throw new Error(`No se pudo comprobar si el cliente ya recibió el insistente: ${error.message}`)
  }

  return (data?.length ?? 0) > 0
}

// ═══════════════════════════════════════════════════════════
// TOPE DE REINTENTOS (ciclo fase 0.bis, 2026-10-10)
// ═══════════════════════════════════════════════════════════
// Desde la fase 0 un fallido ya no cuenta como enviado y se reintenta en la corrida
// siguiente. Estas cuatro funciones le ponen el techo: MAX_INTENTOS_FALLIDOS_POR_TOQUE por
// toque. Cuentan CUALQUIER fallo (no dependen de la causa) y también los viejos, de antes
// de este arreglo. Mismo patrón que `yaRecibioElInsistente()`: un fallo de base LANZA,
// porque devolver `false` sería volver a intentar a ciegas.

/** ¿Llegó este cliente al techo de fallidos de un toque desde `desde`? */
async function agotoLosIntentos(params: {
  customerId: string
  tipo: 'reactivation' | 'birthday'
  /** `campaigns.source`. Sin él cuenta todo el tipo (cumpleaños: su source es el tipo). */
  source?: string
  desde: string
  toque: string
}): Promise<boolean> {
  const supabase = getServiceClient()

  let query = supabase
    .from('campaign_messages')
    .select('id, campaigns!inner(type, source)')
    .eq('customer_id', params.customerId)
    .eq('campaigns.type', params.tipo)
  if (params.source) query = query.eq('campaigns.source', params.source)

  // Basta con leer hasta el techo: más filas no cambian la respuesta.
  const { data, error } = await query
    .eq('status', 'failed')
    .gte('sent_at', params.desde)
    .limit(MAX_INTENTOS_FALLIDOS_POR_TOQUE)

  if (error) {
    logDbFailure({
      scope: 'Campaign',
      reason: 'tope_de_reintentos_error',
      error,
      context: { customer_id: params.customerId, toque: params.toque },
    })
    throw new Error(`No se pudo contar los intentos fallidos del ${params.toque}: ${error.message}`)
  }

  return (data?.length ?? 0) >= MAX_INTENTOS_FALLIDOS_POR_TOQUE
}

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * ¿Ya falló el toque SUAVE `MAX_INTENTOS_FALLIDOS_POR_TOQUE` veces en este ciclo?
 *
 * El suave sale a quien lleva más de `softDays` sin venir, así que sus intentos caen
 * después de `last_visit_at + softDays`. Mientras el cliente está en la zona del suave
 * todavía no pasó el umbral del insistente: todo fallido de reactivación desde ahí es del
 * suave. Si el cliente vuelve, `last_visit_at` se mueve y la cuenta empieza de cero.
 */
export async function agotoLosIntentosDelSuave(
  customerId: string,
  lastVisitAt: string,
  softDays: number
): Promise<boolean> {
  return agotoLosIntentos({
    customerId,
    tipo: 'reactivation',
    source: 'reactivation',
    desde: new Date(new Date(lastVisitAt).getTime() + softDays * DIA_MS).toISOString(),
    toque: 'suave',
  })
}

/**
 * ¿Ya falló el INSISTENTE `MAX_INTENTOS_FALLIDOS_POR_TOQUE` veces en este ciclo?
 *
 * Mismo umbral que `yaRecibioElInsistente()`: un mensaje de reactivación posterior a
 * `last_visit_at + aggressiveDays` es un insistente. `source = 'reactivation'` deja fuera
 * el recordatorio de premio. No se intenta más hasta que el cliente vuelva.
 */
export async function agotoLosIntentosDelInsistente(
  customerId: string,
  lastVisitAt: string,
  aggressiveDays: number
): Promise<boolean> {
  return agotoLosIntentos({
    customerId,
    tipo: 'reactivation',
    source: 'reactivation',
    desde: new Date(new Date(lastVisitAt).getTime() + aggressiveDays * DIA_MS).toISOString(),
    toque: 'insistente',
  })
}

/**
 * ¿Ya falló el saludo de ESTE cumpleaños `MAX_INTENTOS_FALLIDOS_POR_TOQUE` veces?
 *
 * La ventana de este cumpleaños es la misma de la dedup (`BIRTHDAY_DEDUPE_DAYS`): mira
 * hacia atrás lo bastante para ver los intentos de este año y no alcanza los del año
 * pasado. Con `BIRTHDAY_LEAD_DAYS = 2` el cron solo ve al cliente tres días, así que hoy el
 * techo casi nunca se toca: es la guarda para el día que la anticipación crezca.
 */
export async function agotoLosIntentosDelCumpleanos(customerId: string): Promise<boolean> {
  return agotoLosIntentos({
    customerId,
    tipo: 'birthday',
    desde: new Date(Date.now() - BIRTHDAY_DEDUPE_DAYS * DIA_MS).toISOString(),
    toque: 'cumpleaños',
  })
}

/**
 * ¿Ya falló el RECORDATORIO de este premio `MAX_INTENTOS_FALLIDOS_POR_TOQUE` veces?
 *
 * El recordatorio se reintenta cada día mientras el premio esté dentro de su ventana de
 * aviso (`reward_reminder_days_before`), así que con una ventana larga podía fallar una
 * vez por día. `desde` es el comienzo de esa ventana (`expires_at - daysBefore`).
 * `campaign_messages` no guarda el premio, así que la cuenta es por cliente dentro de esa
 * ventana: con dos premios venciendo a la vez, sus fallos se suman.
 */
export async function agotoLosIntentosDelRecordatorio(customerId: string, desde: string): Promise<boolean> {
  return agotoLosIntentos({
    customerId,
    tipo: 'reactivation',
    source: 'reward_reminder',
    desde,
    toque: 'recordatorio de premio',
  })
}

// ═══════════════════════════════════════════════════════════
// LA CAUSA REAL DEL FALLO (ciclo fase 0.bis, R5)
// ═══════════════════════════════════════════════════════════

/** Por qué proveedor sale un envío de cron (los crons no fuerzan `options.provider`). */
export function proveedorDelEnvio(tenant: { messaging_provider?: string | null }): 'twilio' | 'zernio' {
  return tenant.messaging_provider === 'zernio' ? 'zernio' : 'twilio'
}

/** Lo que cabe en `campaign_messages.error_message` sin volverlo un volcado. */
const LARGO_MAXIMO_DE_LA_CAUSA = 500

/**
 * La causa REAL de un envío que no salió, para `campaign_messages.error_message`.
 *
 * `sendTemplateMessage()` devuelve `null` para TODO modo de fallo (sin credenciales, opt-out,
 * cupo de la línea, error del proveedor con su código…) y los crons grababan siempre
 * «Twilio no configurado o error de envío», también en las marcas de Zernio. La causa sí
 * queda en `message_logs` (`error_code`, `error_message`) cuando el envío lleva
 * `logContext`, y los crons lo pasan siempre: se lee de ahí la fila fallida más reciente de
 * ese cliente y esa plantilla. Así no se toca el contrato de `sendTemplateMessage()`.
 *
 * `desde` es un instante tomado ANTES del envío; se resta un minuto porque `created_at`
 * lo pone el reloj de la base, no el de la función.
 *
 * NO lanza: la causa es diagnóstico, y abortar la corrida por no poder leerla perdería la
 * fila del fallo, que es lo que alimenta el tope de reintentos. Un error de base queda en
 * el log (`logDbFailure`) y en el propio texto.
 */
export async function causaDelFallo(params: {
  tenantId: string
  customerId: string
  plantilla: string
  proveedor: 'twilio' | 'zernio'
  desde: string
}): Promise<string> {
  const supabase = getServiceClient()
  const desde = new Date(new Date(params.desde).getTime() - 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('message_logs')
    .select('error_code, error_message, created_at')
    .eq('tenant_id', params.tenantId)
    .eq('customer_id', params.customerId)
    .eq('template_sid', params.plantilla)
    .eq('status', 'failed')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    logDbFailure({
      scope: 'Campaign',
      reason: 'causa_del_fallo_error',
      error,
      context: { tenant_id: params.tenantId, customer_id: params.customerId },
    })
    return `${params.proveedor} · no se pudo leer la causa (${error.message})`.slice(0, LARGO_MAXIMO_DE_LA_CAUSA)
  }

  const fila = (data ?? [])[0] as { error_code: string | null; error_message: string | null } | undefined
  if (!fila) return `${params.proveedor} · el envío falló sin dejar causa en message_logs`

  const partes = [params.proveedor, fila.error_code, fila.error_message].filter((p): p is string => !!p)
  return partes.join(' · ').slice(0, LARGO_MAXIMO_DE_LA_CAUSA)
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
