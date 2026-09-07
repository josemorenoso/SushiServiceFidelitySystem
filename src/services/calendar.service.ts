/**
 * Calendar Service — Eventos operativos del restaurante
 *
 * CRUD de eventos + filtrado de audiencia + dispatch de auto-envío.
 *
 * Estados de evento:
 *   - 'planned'    → creado, sin send_mode=auto o sin scheduled_send_at
 *   - 'scheduled'  → send_mode=auto + scheduled_send_at definido (cron lo dispara)
 *   - 'sent'       → enviado exitosamente por executeAutoEvent
 *   - 'failed'     → ejecutado pero falló (se puede inspeccionar + reintentar)
 *   - 'cancelled'  → cancelado por admin
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure } from '@/lib/db-failure'
import type {
  RestaurantEvent,
  EventType,
  EventSendMode,
  EventStatus,
  EventMediaType,
  Customer,
} from '@/types/database.types'
import { getMultipleSettings } from '@/services/settings.service'
import {
  createCalendarCampaign,
  recordCampaignMessage,
  finalizeCampaign,
  updateCustomerLastCampaignAt,
  filterByMonthlyCap,
} from '@/services/campaign.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getLineBudget } from '@/services/line-budget.service'
import { enqueueSendBatch, type EnqueueItem } from '@/services/send-queue.service'
import { getTenantById } from '@/lib/tenant'
import { appEndOfDay } from '@/lib/timezone'
import { EVENT_MEDIA_BUCKET, eventMediaPathFromPublicUrl, getEventMediaBaseUrl } from '@/lib/twilio/media'
import { listZernioTemplates } from '@/lib/zernio/messaging'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

// ═══════════════════════════════════════════════════════════
// Tipos públicos del servicio
// ═══════════════════════════════════════════════════════════

export interface EventFilters {
  city?: string
  minVisits?: number
  maxVisits?: number
  minAge?: number
  maxAge?: number
  source?: 'all' | 'qr_only' | 'delivery_only'
}

export interface CreateEventInput {
  title: string
  description?: string | null
  event_date: string                // YYYY-MM-DD
  event_time?: string | null
  event_type: EventType
  send_mode?: EventSendMode         // default 'remind'
  scheduled_send_at?: string | null
  filters?: EventFilters
  media_url?: string | null
  media_type?: EventMediaType | null
  /** Enlace opcional que se agrega al final del CTA de la invitación (00050). */
  link_url?: string | null
  blackout_days?: number
}

/** Tope de la columna `restaurant_events.link_url` (CHECK de la 00050). */
const MAX_LINK_LENGTH = 500

/**
 * Valida y normaliza el enlace opcional del evento. PURA: no toca red ni base.
 *
 * Devuelve `null` para "sin link" (cadena vacía incluida) y lanza con un mensaje
 * que el admin pueda leer si el valor no sirve.
 *
 * POR QUÉ ES TAN ESTRICTA CON LOS ESPACIOS
 * ────────────────────────────────────────
 * El link no viaja solo: se compone dentro de `{{5}}`, que es una VARIABLE de la
 * plantilla aprobada. Twilio rechaza con 21656 las variables con saltos de línea,
 * y ese rechazo no es de un cliente: la invitación sale rota (o no sale) para la
 * audiencia ENTERA del evento. Un `trim()` silencioso tampoco alcanza — un espacio
 * en el medio parte la URL y el cliente recibe un link muerto. Mejor fallar acá,
 * con el evento todavía en el dashboard y un humano mirando.
 */
export function normalizeEventLink(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const link = raw.trim()
  if (link.length === 0) return null

  if (!/^https?:\/\//i.test(link)) {
    throw new Error('El enlace debe empezar con http:// o https:// (ej. https://tucarta.com/festival)')
  }
  if (/\s/.test(link)) {
    throw new Error('El enlace no puede llevar espacios ni saltos de línea')
  }
  if (link.length > MAX_LINK_LENGTH) {
    throw new Error(`El enlace no puede pasar de ${MAX_LINK_LENGTH} caracteres`)
  }
  return link
}

/**
 * Arma el CTA que viaja en `{{5}}` de la plantilla del evento.
 *
 * El link se ANEXA al texto en vez de ocupar una variable propia: el contrato
 * {{1}}..{{6}} está aprobado por Meta y un {{7}} obligaría a crear y re-aprobar
 * una plantilla por cada una de las 25 marcas (24-72h cada una). WhatsApp
 * clicquea igual una URL que va en el cuerpo del mensaje.
 *
 * Exportada y pura para poder probar el texto exacto sin enviar nada.
 */
export function buildEventCta(
  description: string | null | undefined,
  linkUrl: string | null | undefined
): string {
  const texto = description?.trim() || '¡Te esperamos!'
  const link = linkUrl?.trim()
  return link ? `${texto} 👉 ${link}` : texto
}

export interface UpdateEventInput {
  title?: string
  description?: string | null
  event_date?: string
  event_time?: string | null
  event_type?: EventType
  send_mode?: EventSendMode
  scheduled_send_at?: string | null
  filters?: EventFilters
  media_url?: string | null
  media_type?: EventMediaType | null
  link_url?: string | null
  blackout_days?: number
  status?: EventStatus
}

// ═══════════════════════════════════════════════════════════
// CRUD básico
// ═══════════════════════════════════════════════════════════

export async function createEvent(input: CreateEventInput, tenantId: string): Promise<RestaurantEvent> {
  const supabase = getServiceClient()

  // Validaciones mínimas que la DB no captura
  if (input.send_mode === 'auto' && !input.scheduled_send_at) {
    throw new Error('scheduled_send_at es obligatorio cuando send_mode=auto')
  }
  if (input.scheduled_send_at) {
    const sendAt = new Date(input.scheduled_send_at)
    // Fin del día del evento en hora Colombia (UTC-5), no UTC: con 23:59:59Z un envío
    // programado el mismo día del evento después de las 6:59pm local se rechazaba.
    const eventDate = appEndOfDay(input.event_date)
    if (sendAt.getTime() > eventDate.getTime()) {
      throw new Error('scheduled_send_at no puede ser posterior a event_date')
    }
  }
  if (input.media_url && !input.media_type) {
    throw new Error('media_type es obligatorio cuando se provee media_url')
  }
  const linkUrl = normalizeEventLink(input.link_url)

  const initialStatus: EventStatus = input.send_mode === 'auto' && input.scheduled_send_at
    ? 'scheduled'
    : 'planned'

  const { data, error } = await supabase
    .from('restaurant_events')
    .insert({
      title: input.title,
      description: input.description ?? null,
      event_date: input.event_date,
      event_time: input.event_time ?? null,
      event_type: input.event_type,
      send_mode: input.send_mode ?? 'remind',
      scheduled_send_at: input.scheduled_send_at ?? null,
      filters: (input.filters ?? {}) as Record<string, unknown>,
      media_url: input.media_url ?? null,
      media_type: input.media_type ?? null,
      link_url: linkUrl,
      content_sid: null,
      blackout_days: input.blackout_days ?? 5,
      status: initialStatus,
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (error) throw new Error(`Error creando evento: ${error.message}`)
  return data as RestaurantEvent
}

export async function listEvents(
  fromDate: string,
  toDate: string,
  tenantId: string
): Promise<RestaurantEvent[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('restaurant_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('event_date', fromDate)
    .lte('event_date', toDate)
    .order('event_date', { ascending: true })

  if (error) throw new Error(`Error listando eventos: ${error.message}`)
  return (data ?? []) as RestaurantEvent[]
}

export async function getEvent(id: string): Promise<RestaurantEvent | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('restaurant_events')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Error obteniendo evento: ${error.message}`)
  return (data as RestaurantEvent) ?? null
}

/** Estados desde los que ya no se recalcula nada: el evento cerró su ciclo. */
const TERMINAL_STATUSES: EventStatus[] = ['sent', 'cancelled']

export async function updateEvent(
  id: string,
  patch: UpdateEventInput,
  tenantId: string
): Promise<RestaurantEvent> {
  const supabase = getServiceClient()

  const updatePayload: Record<string, unknown> = { ...patch }
  if (patch.filters !== undefined) {
    updatePayload.filters = patch.filters as Record<string, unknown>
  }
  // Mismo saneo que al crear: un link con espacios no se guarda, porque el que
  // lo pagaría es el envío entero (ver normalizeEventLink).
  if (patch.link_url !== undefined) {
    updatePayload.link_url = normalizeEventLink(patch.link_url)
  }

  // Realineación de status. La invariante es simple: un evento está 'scheduled'
  // si y solo si quedará en auto-envío CON fecha; en cualquier otro caso vuelve a
  // 'planned'. La versión anterior solo cubría el caso de activar auto junto con la
  // fecha en el mismo PATCH, así que dejaba dos estados inconsistentes:
  //   - auto → remind: el evento seguía 'scheduled' y el cron lo enviaba igual.
  //   - activar auto sin fecha: quedaba 'planned' y no salía nunca.
  const touchesDispatch = patch.send_mode !== undefined || patch.scheduled_send_at !== undefined
  if (touchesDispatch && patch.status === undefined) {
    const current = await getEvent(id)
    if (current && current.tenant_id === tenantId && !TERMINAL_STATUSES.includes(current.status)) {
      const nextSendMode = patch.send_mode ?? current.send_mode
      const nextSendAt = patch.scheduled_send_at !== undefined
        ? patch.scheduled_send_at
        : current.scheduled_send_at
      updatePayload.status = nextSendMode === 'auto' && nextSendAt ? 'scheduled' : 'planned'
    }
  }

  const { data, error } = await supabase
    .from('restaurant_events')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw new Error(`Error actualizando evento: ${error.message}`)
  return data as RestaurantEvent
}

export async function cancelEvent(id: string, tenantId: string): Promise<RestaurantEvent> {
  return updateEvent(id, { status: 'cancelled' }, tenantId)
}

/**
 * Deja cualquier evento vivo en el único estado que `executeAutoEvent` acepta
 * (`send_mode='auto'` + `status='scheduled'`) para poder enviarlo bajo demanda.
 *
 * Existe porque el modo por defecto del dialog es "Solo recordarme", que nace
 * `send_mode='remind'` + `status='planned'`: sin esto, un evento creado por el
 * camino por defecto no se podía enviar desde NINGÚN punto de la aplicación —
 * ni cron (filtra por auto+scheduled), ni "Enviar ahora" (exigía auto), ni el
 * drawer (solo editaba título y descripción). Era un callejón sin salida y la
 * razón principal de que el calendario "no hiciera nada".
 *
 * `scheduled_send_at` se reescribe a ahora: el envío es inmediato, la fecha
 * planeada deja de aplicar y así queda el registro real de cuándo salió.
 */
export async function armEventForDispatch(id: string, tenantId: string): Promise<RestaurantEvent> {
  const event = await getEvent(id)
  if (!event || event.tenant_id !== tenantId) {
    throw new Error('Evento no encontrado')
  }
  if (event.status === 'sent') {
    throw new Error('Este evento ya se envió. Duplícalo si quieres volver a invitar.')
  }
  if (event.status === 'cancelled') {
    throw new Error('Este evento está cancelado. Créalo de nuevo si quieres enviarlo.')
  }

  return updateEvent(
    id,
    {
      send_mode: 'auto',
      scheduled_send_at: new Date().toISOString(),
      status: 'scheduled',
    },
    tenantId
  )
}

// ═══════════════════════════════════════════════════════════
// Helpers de audiencia (puros, no envían)
// ═══════════════════════════════════════════════════════════

/**
 * Aplica los filtros JSONB del evento sobre la tabla customers y devuelve
 * los candidatos que aceptan marketing. Útil para previsualizar audiencia
 * antes de programar un envío.
 */
export async function findCustomersForEvent(filters: EventFilters, tenantId: string): Promise<Customer[]> {
  const supabase = getServiceClient()

  let query = supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('accepts_marketing', true)
    .is('whatsapp_opt_out_at', null)

  if (filters.city) query = query.ilike('city', `%${filters.city}%`)
  if (typeof filters.minVisits === 'number') query = query.gte('total_visits', filters.minVisits)
  if (typeof filters.maxVisits === 'number') query = query.lte('total_visits', filters.maxVisits)
  if (filters.source && filters.source !== 'all') {
    if (filters.source === 'qr_only') query = query.eq('source_channels', 'qr')
    else if (filters.source === 'delivery_only') query = query.eq('source_channels', 'delivery')
  }
  if (typeof filters.minAge === 'number') {
    const maxBirthday = new Date()
    maxBirthday.setFullYear(maxBirthday.getFullYear() - filters.minAge)
    query = query.lte('birthday', maxBirthday.toISOString().split('T')[0])
  }
  if (typeof filters.maxAge === 'number') {
    const minBirthday = new Date()
    minBirthday.setFullYear(minBirthday.getFullYear() - filters.maxAge - 1)
    query = query.gte('birthday', minBirthday.toISOString().split('T')[0])
  }

  const { data, error } = await query
  if (error) throw new Error(`Error filtrando clientes del evento: ${error.message}`)
  return (data ?? []) as Customer[]
}

/**
 * Lista los eventos con send_mode='auto' que están listos para disparo
 * (status='scheduled' y scheduled_send_at <= now). Útil para el cron del
 * calendario cuando se implemente el path de envío.
 */
export async function findDueAutoEvents(refDate: Date = new Date()): Promise<RestaurantEvent[]> {
  const supabase = getServiceClient()
  const nowISO = refDate.toISOString()
  const { data, error } = await supabase
    .from('restaurant_events')
    .select('*')
    .eq('send_mode', 'auto')
    .eq('status', 'scheduled')
    .lte('scheduled_send_at', nowISO)
    .order('scheduled_send_at', { ascending: true })

  if (error) throw new Error(`Error buscando eventos due: ${error.message}`)
  return (data ?? []) as RestaurantEvent[]
}

// ═══════════════════════════════════════════════════════════
// DISPATCH DE AUTO-ENVÍO
// ═══════════════════════════════════════════════════════════

function formatEventDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

export interface ExecuteAutoEventResult {
  sent: number
  failed: number
  /** Encolados en `send_queue` para gotear en los próximos días (Bloque 2). */
  queued: number
  excluded_monthly_cap: number
  campaign_id: string | null
}

/**
 * Lo mínimo de supabase-js que necesita `claimScheduledEvent()`.
 *
 * Se declara aparte —en vez de pedir un `SupabaseClient` entero— para que la prueba de
 * carrera pueda ejecutar ESTA MISMA función contra un Postgres real, con conexiones de
 * verdad peleando por la fila (`tests/db/calendar-claim.test.ts`). Un mock probaría el mock.
 */
export interface EventClaimClient {
  from(table: string): {
    update(patch: { status: string }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: string): PromiseLike<{
            data: Array<{ id: string }> | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
}

/**
 * Reclama un evento para despacharlo: lo pasa de 'scheduled' a 'sent' y responde si
 * ESTA llamada fue la que ganó.
 *
 * POR QUÉ NO ALCANZA CON MIRAR `error`
 * ────────────────────────────────────
 * El `UPDATE … WHERE id=$1 AND status='scheduled'` es atómico, así que de dos llamadas
 * concurrentes solo UNA toca una fila. Pero la otra **tampoco da error**: Postgres
 * considera un éxito perfecto actualizar cero filas. Hasta hoy el código solo revisaba
 * `error`, así que las dos seguían adelante y **el evento se despachaba dos veces** —
 * cada cliente recibía la invitación por duplicado.
 *
 * El conteo de filas es la ÚNICA señal que distingue al ganador. `calendar-dispatch`
 * corre cada 15 minutos y no tolera el doble disparo (a diferencia de `queue-drain`,
 * que sí, vía `FOR UPDATE SKIP LOCKED` — ver docs/features/send-governance.md).
 *
 * Devuelve `false` si otra corrida se lo llevó. Lanza solo si la base falló de verdad.
 */
export async function claimScheduledEvent(
  supabase: EventClaimClient,
  eventId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('restaurant_events')
    .update({ status: 'sent' })
    .eq('id', eventId)
    .eq('status', 'scheduled')
    .select('id')

  if (error) throw new Error(`No se pudo reclamar evento ${eventId}: ${error.message}`)
  return (data?.length ?? 0) === 1
}

/**
 * Verifica que la plantilla del evento sirva para media dinámica ANTES de
 * enviar. Provider-aware (migración 00036): para tenants Zernio valida contra
 * `listZernioTemplates()` que la plantilla exista y esté `APPROVED`; para
 * Twilio (sin cambios) valida además que la media no sea fija, contra la
 * Content API. Detecta configuraciones que en producción harían daño silencioso:
 *
 *   1. (Solo Twilio) Plantilla con media FIJA (sin `{{...}}` en la URL): todos
 *      los clientes recibirían la imagen de muestra aprobada, no el flyer del evento.
 *   2. Plantilla no aprobada/rechazada por Meta: el envío fallaría uno a uno.
 *
 * Errores de red o credenciales se tratan como no-concluyentes (fail-open):
 * el envío continúa y fallará con su propio error si algo está mal.
 */
async function assertEventTemplateUsable(
  templateSid: string,
  tenant: {
    is_demo?: boolean
    twilio_subaccount_sid: string | null
    twilio_subaccount_auth_token: string | null
    messaging_provider?: 'twilio' | 'zernio'
    zernio_account_id?: string | null
  }
): Promise<void> {
  if (tenant.is_demo) return

  if (tenant.messaging_provider === 'zernio') {
    // Sin cuenta configurada no hay nada que listar aquí — sendTemplateMessage()
    // ya bloquea el envío con 'zernio_not_configured' (invariante de seguridad,
    // ver whatsapp.service.ts). No duplicamos ese error aquí, fail-open.
    if (!tenant.zernio_account_id) return
    try {
      const { templates } = await listZernioTemplates(tenant.zernio_account_id)
      const match = templates.find((t) => t.name === templateSid)
      if (!match) {
        throw new Error(
          `La plantilla '${templateSid}' no existe en la cuenta Zernio de este tenant. ` +
          'Revisa event_template_image_sid / event_template_video_sid en Ajustes.'
        )
      }
      if (match.status !== 'APPROVED') {
        throw new Error(
          `La plantilla '${templateSid}' no está aprobada por Meta (status: ${match.status}). ` +
          'Espera la aprobación o configura otra plantilla en Ajustes.'
        )
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('no existe en la cuenta Zernio') || err.message.includes('no está aprobada por Meta'))) {
        throw err
      }
      console.warn(`[Calendar] Verificación de plantilla Zernio '${templateSid}' no concluyente (${err instanceof Error ? err.message : err}) — continuando`)
    }
    return
  }

  // Camino Twilio — SIN CAMBIOS.
  const accountSid = tenant.twilio_subaccount_sid ?? process.env.TWILIO_ACCOUNT_SID
  const authToken = tenant.twilio_subaccount_auth_token ?? process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return

  const auth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  let definition: { types?: Record<string, { media?: string[] }> } | null = null
  let approval: { whatsapp?: { status?: string; rejection_reason?: string } } | null = null

  try {
    const [defRes, apprRes] = await Promise.all([
      fetch(`https://content.twilio.com/v1/Content/${templateSid}`, { headers: { Authorization: auth } }),
      fetch(`https://content.twilio.com/v1/Content/${templateSid}/ApprovalRequests`, { headers: { Authorization: auth } }),
    ])
    if (defRes.status === 404) {
      throw new Error(
        `La plantilla ${templateSid} no existe en la cuenta Twilio de este tenant. ` +
        'Revisa event_template_image_sid / event_template_video_sid en Ajustes.'
      )
    }
    if (defRes.ok) definition = await defRes.json()
    if (apprRes.ok) approval = await apprRes.json()
  } catch (err) {
    if (err instanceof Error && err.message.includes('no existe en la cuenta Twilio')) throw err
    console.warn(`[Calendar] Verificación de plantilla ${templateSid} no concluyente (${err instanceof Error ? err.message : err}) — continuando`)
    return
  }

  if (definition) {
    const media = definition.types?.['twilio/media']?.media
    if (!media || media.length === 0) {
      throw new Error(
        `La plantilla ${templateSid} no es de tipo twilio/media: no puede llevar el flyer del evento. ` +
        'Crea la plantilla correcta con scripts/twilio-create-media-templates.mjs y actualiza Ajustes.'
      )
    }
    if (!media.some((u) => u.includes('{{'))) {
      throw new Error(
        `La plantilla ${templateSid} tiene la media FIJA (sin variable {{6}}): todos los clientes ` +
        'recibirían la imagen de muestra en vez del flyer de este evento. Crea la plantilla dinámica ' +
        'con scripts/twilio-create-media-templates.mjs y pon su SID en Ajustes.'
      )
    }
  }

  const waStatus = approval?.whatsapp?.status?.toLowerCase()
  if (waStatus && waStatus !== 'approved') {
    const reason = approval?.whatsapp?.rejection_reason
    throw new Error(
      `La plantilla ${templateSid} no está aprobada por Meta (status: ${waStatus}${reason ? ` — ${reason}` : ''}). ` +
      'Espera la aprobación o configura otra plantilla en Ajustes.'
    )
  }
}

/**
 * Despacha un evento programado: resuelve la plantilla, arma la audiencia, envía lo que
 * cabe en el presupuesto de hoy, **encola el resto**, y deja el evento en sent/failed.
 *
 * Idempotente: reclama el evento (`scheduled` → `sent`) ANTES de trabajar, y el reclamo
 * se decide por el CONTEO DE FILAS, no por la ausencia de error — ver
 * `claimScheduledEvent()`. Si la fase de envío falla, el estado vuelve a 'failed'.
 *
 * NO envía la audiencia entera de golpe: lo que excede el presupuesto de campaña del día
 * va a `send_queue` con prioridad P1 y gotea en `queue-drain`, igual que una campaña
 * manual. Por eso el resultado trae `queued` además de `sent`/`failed`, y la campaña
 * sigue `running` mientras quede cola.
 *
 * Requiere las claves de admin_settings: event_template_image_sid | event_template_video_sid
 */
export async function executeAutoEvent(eventId: string): Promise<ExecuteAutoEventResult> {
  const supabase = getServiceClient()

  const event = await getEvent(eventId)
  if (!event) throw new Error(`Evento ${eventId} no encontrado`)
  if (event.status !== 'scheduled') {
    throw new Error(`Evento ${eventId} no está en estado scheduled (actual: ${event.status})`)
  }

  const tenant = await getTenantById(event.tenant_id)
  if (!tenant) throw new Error(`Tenant ${event.tenant_id} no encontrado para evento ${eventId}`)

  // Idempotencia: reclamar el evento ANTES de hacer cualquier trabajo. Perder el reclamo
  // no es un fallo del evento —otra corrida lo está despachando ahora mismo—, así que se
  // sale sin tocar nada. Este bloque va FUERA del try de abajo a propósito: si estuviera
  // dentro, la corrida PERDEDORA dispararía el rollback a 'failed' y le rompería el
  // evento a la que sí está enviando.
  const ganado = await claimScheduledEvent(supabase, eventId)
  if (!ganado) {
    throw new Error(
      `Evento ${eventId} ya fue reclamado por otra ejecución concurrente: no se despacha dos veces`
    )
  }

  try {
    // Resolve template SID from admin_settings
    const settings = await getMultipleSettings([
      'event_template_image_sid',
      'event_template_video_sid',
    ], tenant.id)
    const templateSid = event.media_type === 'video'
      ? (settings.event_template_video_sid ?? null)
      : (settings.event_template_image_sid ?? null)

    if (!templateSid) {
      throw new Error(
        `No hay plantilla configurada para media_type='${event.media_type ?? 'image'}'. ` +
        'Agrega event_template_image_sid / event_template_video_sid en Dashboard → Ajustes.'
      )
    }

    // Guard v2.8.1: la plantilla debe ser twilio/media con {{6}} dinámico y estar
    // aprobada. Evita el desastre silencioso de enviar la imagen de muestra a todos.
    await assertEventTemplateUsable(templateSid, tenant)

    // La plantilla es `twilio/media`: su URL de media es `<bucket público>/{{6}}`,
    // así que {{6}} debe ser el PATH dentro del bucket, no la URL completa. Sin
    // media no hay nada que enviar por esta plantilla.
    //
    // Estas dos validaciones van ANTES de crear la campaña: cuando estaban después,
    // cada intento fallido dejaba una fila `campaigns` huérfana en estado pendiente
    // que ensuciaba las métricas y el cap mensual.
    if (!event.media_url) {
      throw new Error(
        'El evento no tiene media_url. Las plantillas de evento son twilio/media ' +
        'y requieren una imagen o video: súbelo desde el dashboard antes de enviar.'
      )
    }
    const mediaPath = eventMediaPathFromPublicUrl(event.media_url)
    if (!mediaPath) {
      throw new Error(
        `media_url no pertenece al bucket '${EVENT_MEDIA_BUCKET}' (${event.media_url}). ` +
        'La plantilla aprobada tiene el dominio fijo, así que solo puede servir archivos ' +
        'de ese bucket: vuelve a subir el archivo desde el dashboard.'
      )
    }

    // Build audience
    const candidates = await findCustomersForEvent(event.filters as EventFilters, tenant.id)
    const { eligible, excluded } = await filterByMonthlyCap(candidates)

    // Create campaign record
    const campaign = await createCalendarCampaign({
      name: `calendar_${eventId}_${new Date().toISOString().split('T')[0]}`,
      templateSid,
      tenantId: tenant.id,
      mediaUrl: event.media_url,
      mediaType: event.media_type,
      filters: event.filters as Record<string, unknown>,
    })

    const brandName = tenant.config?.brand_name ?? 'El Restaurante'
    const eventDate = formatEventDate(event.event_date)
    const cta = buildEventCta(event.description, event.link_url)

    // Zernio: la media viaja en `options.headerMediaUrl` con la URL pública
    // COMPLETA (no el path suelto que exige la plantilla twilio/media). Twilio
    // sigue exactamente igual — variable {{6}} = el path dentro del bucket.
    const isZernio = tenant.messaging_provider === 'zernio'
    const zernioHeaderMediaUrl = `${getEventMediaBaseUrl()}/${mediaPath}`

    /** Las variables de la plantilla para un cliente. Se arma en UN solo sitio para que
     *  el envío inmediato y el encolado no puedan divergir. */
    const variablesPara = (customer: Customer): Record<string, string> => {
      const variables: Record<string, string> = {
        '1': customer.name,
        '2': brandName,
        '3': event.title,
        '4': eventDate,
        '5': cta,
      }
      if (!isZernio) {
        variables['6'] = mediaPath
      }
      return variables
    }

    // ── Cuánto cabe HOY y cuánto gotea ──
    // Antes se intentaba enviar la audiencia entera y los que excedían el presupuesto de
    // campaña del día se marcaban `failed`: se PERDÍAN. Con 25 marcas, un festival con
    // audiencia grande dejaba gente sin invitación en silencio. Mismo reparto que la
    // campaña manual (`/api/dashboard/campaigns/manual`).
    let cabenHoy = eligible
    let aLaCola: Customer[] = []
    try {
      const linea = await getLineBudget(tenant.id)
      if (linea.lineStatus === 'frozen') {
        // Línea congelada por calidad: no sale ninguna campaña. Nada se pierde — espera a
        // que un humano la reactive (spec §3.5: no hay descongelamiento automático).
        cabenHoy = []
        aLaCola = eligible
      } else if (
        linea.enforced &&
        linea.campaignAvailable !== null &&
        eligible.length > linea.campaignAvailable
      ) {
        cabenHoy = eligible.slice(0, linea.campaignAvailable)
        aLaCola = eligible.slice(linea.campaignAvailable)
      }
      // `enforced: false` (tenants anteriores a 00037, sin límite conocido): se intenta
      // todo, como siempre. Un tope inventado les cortaría envíos que hoy salen bien.
    } catch (err) {
      // Sin presupuesto legible se sigue con el comportamiento de antes (intentarlo todo):
      // el choke-point vuelve a mirar el cupo en CADA envío y falla cerrado, así que por
      // esta rama no se puede pasar del límite.
      console.error(`[Calendar] No se pudo leer el presupuesto de línea de ${tenant.slug}:`, err)
    }

    let sent = 0
    let failed = 0
    const sentCustomerIds: string[] = []
    /** Los que se intentaron y no salieron. NO se dan por perdidos: van a la cola. */
    const reintentar: Customer[] = []

    for (const customer of cabenHoy) {
      // `keepAllVariables`: el reintento por 21665 suelta la variable más alta
      // primero — aquí {{6}} = el path del flyer. Sin ella la plantilla media
      // sale rota para toda la audiencia; mejor fallar con el error visible.
      // (Zernio no tiene ese reintento — ver whatsapp.service.ts.)
      const result = await sendTemplateMessage(
        customer.phone,
        templateSid,
        variablesPara(customer),
        tenant,
        { customerId: customer.id, messageType: 'calendar_event' },
        isZernio
          ? { headerMediaUrl: zernioHeaderMediaUrl, headerMediaType: event.media_type ?? 'image' }
          : { keepAllVariables: true }
      )

      if (result) {
        await recordCampaignMessage({
          campaignId: campaign.id,
          customerId: customer.id,
          status: 'sent',
          tenantId: tenant.id,
          twilioSid: result.sid,
          errorMessage: null,
        })
        sent++
        sentCustomerIds.push(customer.id)
      } else {
        // NO se marca `failed` todavía. `sendTemplateMessage()` devuelve `null` para TODOS
        // sus modos de fallo, y uno de ellos es que el cupo se agotó entre que se leyó el
        // presupuesto y que salió este envío (una bienvenida o un check-in pueden habérselo
        // comido). El drenador lo reintenta con backoff y se rinde a los 3 intentos, así
        // que un número realmente malo termina igual en `failed`, solo que unas horas más
        // tarde y dejando rastro en `send_queue`.
        reintentar.push(customer)
      }
    }

    await updateCustomerLastCampaignAt(sentCustomerIds)

    // ── El resto gotea por la misma cola que cualquier campaña ──
    // `expiresAt` = fin del día del evento en hora de Colombia: `calendar_event` es P1
    // («entregarla tarde no sirve de nada» — MESSAGE_CLASS_MAP). Una invitación que llega
    // el día después del festival no se manda: pasa a `expired` y queda el rastro.
    const aEncolar = [...aLaCola, ...reintentar]
    let queued = 0

    if (aEncolar.length > 0) {
      try {
        const items: EnqueueItem[] = aEncolar.map((customer) => ({
          tenantId: tenant.id,
          phone: customer.phone,
          customerId: customer.id,
          campaignId: campaign.id,
          messageType: 'calendar_event',
          templateSid,
          // Provider-aware, igual que el envío inmediato: para Twilio {{6}} es el PATH
          // dentro del bucket; para Zernio la media viaja aparte y {{6}} no existe. El
          // drenador reconstruye las OPCIONES según el proveedor actual del tenant
          // (`construirOpciones()`), pero las variables quedan congeladas aquí: un tenant
          // que migre de proveedor a mitad del goteo verá fallar lo que le quede en cola,
          // con el motivo en `send_queue.last_error`.
          variables: variablesPara(customer),
          // URL pública COMPLETA: es lo que el drenador le pasa a Zernio como
          // `headerMediaUrl`, y para Twilio solo necesita ser no-nula.
          mediaUrl: zernioHeaderMediaUrl,
          mediaType: event.media_type ?? 'image',
          expiresAt: appEndOfDay(event.event_date),
          // ⚠️ En `restaurant_events` un `location_id` NULL significa «evento de toda la
          // marca» (audience_scope='brand'), no «sede desconocida» — es la excepción del
          // modelo (00043). En `send_queue` NULL sí es «sede desconocida», y para un evento
          // de marca eso es exactamente lo correcto: no hay una sede que atribuir.
          locationId: event.location_id,
        }))
        queued = (await enqueueSendBatch(items)).enqueued
      } catch (err) {
        // El encolado falló: estos clientes no reciben nada y nadie los va a reintentar.
        // Se registran como `failed` con el motivo real — perderlos en silencio mientras
        // la respuesta promete «se envían solos» es el peor desenlace posible.
        const motivo = err instanceof Error ? err.message : 'Error desconocido al encolar'
        console.error(`[Calendar] No se pudo encolar el resto del evento ${eventId}:`, err)
        for (const customer of aEncolar) {
          failed++
          await recordCampaignMessage({
            campaignId: campaign.id,
            customerId: customer.id,
            status: 'failed',
            tenantId: tenant.id,
            twilioSid: null,
            errorMessage: `No se pudo encolar: ${motivo}`,
          })
        }
      }
    }

    // Una campaña con cola pendiente sigue `running`: marcarla `completed` mientras gotea
    // le miente al operador (spec §3.4). La cierra `queue-drain` cuando su cola queda
    // vacía, recalculando `total_sent` desde `campaign_messages`.
    if (queued === 0) {
      await finalizeCampaign(campaign.id, sent)
    }

    // Link campaign to event. Best-effort: los mensajes YA salieron, así que esto no
    // puede tumbar la respuesta — pero hasta hoy un fallo aquí dejaba el evento sin su
    // campaign_id sin que quedara una sola línea de log para repararlo a mano.
    const { error: linkError } = await supabase
      .from('restaurant_events')
      .update({ campaign_id: campaign.id })
      .eq('id', eventId)
    if (linkError) {
      logDbFailure({
        scope: 'Calendar',
        reason: 'link_campaign_error',
        error: linkError,
        context: { event_id: eventId, campaign_id: campaign.id },
      })
    }

    return { sent, failed, queued, excluded_monthly_cap: excluded.length, campaign_id: campaign.id }
  } catch (err) {
    // Roll back to 'failed' so admin can inspect and retry. Si ESTE update también
    // falla, el evento queda 'sent' sin haber enviado nada y sin forma de reintentarlo
    // desde el dashboard — de ahí el log: es la única pista que quedaría.
    const { error: rollbackError } = await supabase
      .from('restaurant_events')
      .update({ status: 'failed' })
      .eq('id', eventId)
    if (rollbackError) {
      logDbFailure({
        scope: 'Calendar',
        reason: 'rollback_to_failed_error',
        error: rollbackError,
        context: { event_id: eventId },
      })
    }
    throw err
  }
}
