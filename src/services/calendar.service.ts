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
  blackout_days?: number
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
  blackout_days?: number
  status?: EventStatus
}

// ═══════════════════════════════════════════════════════════
// CRUD básico
// ═══════════════════════════════════════════════════════════

export async function createEvent(input: CreateEventInput): Promise<RestaurantEvent> {
  const supabase = getServiceClient()

  // Validaciones mínimas que la DB no captura
  if (input.send_mode === 'auto' && !input.scheduled_send_at) {
    throw new Error('scheduled_send_at es obligatorio cuando send_mode=auto')
  }
  if (input.scheduled_send_at) {
    const sendAt = new Date(input.scheduled_send_at)
    const eventDate = new Date(`${input.event_date}T23:59:59Z`)
    if (sendAt.getTime() > eventDate.getTime()) {
      throw new Error('scheduled_send_at no puede ser posterior a event_date')
    }
  }
  if (input.media_url && !input.media_type) {
    throw new Error('media_type es obligatorio cuando se provee media_url')
  }

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
      content_sid: null,
      blackout_days: input.blackout_days ?? 5,
      status: initialStatus,
    })
    .select()
    .single()

  if (error) throw new Error(`Error creando evento: ${error.message}`)
  return data as RestaurantEvent
}

export async function listEvents(
  fromDate: string,
  toDate: string
): Promise<RestaurantEvent[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('restaurant_events')
    .select('*')
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

export async function updateEvent(
  id: string,
  patch: UpdateEventInput
): Promise<RestaurantEvent> {
  const supabase = getServiceClient()

  const updatePayload: Record<string, unknown> = { ...patch }
  if (patch.filters !== undefined) {
    updatePayload.filters = patch.filters as Record<string, unknown>
  }

  // Si cambia a send_mode='auto' o se actualiza scheduled_send_at, alinear status
  if (
    (patch.send_mode === 'auto' && patch.scheduled_send_at) ||
    (patch.scheduled_send_at && patch.send_mode === undefined)
  ) {
    updatePayload.status = patch.status ?? 'scheduled'
  }

  const { data, error } = await supabase
    .from('restaurant_events')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Error actualizando evento: ${error.message}`)
  return data as RestaurantEvent
}

export async function cancelEvent(id: string): Promise<RestaurantEvent> {
  return updateEvent(id, { status: 'cancelled' })
}

// ═══════════════════════════════════════════════════════════
// Helpers de audiencia (puros, no envían)
// ═══════════════════════════════════════════════════════════

/**
 * Aplica los filtros JSONB del evento sobre la tabla customers y devuelve
 * los candidatos que aceptan marketing. Útil para previsualizar audiencia
 * antes de programar un envío.
 */
export async function findCustomersForEvent(filters: EventFilters): Promise<Customer[]> {
  const supabase = getServiceClient()

  let query = supabase
    .from('customers')
    .select('*')
    .eq('accepts_marketing', true)

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
  excluded_monthly_cap: number
  campaign_id: string | null
}

/**
 * Executes a scheduled auto-event: resolves template, filters audience,
 * sends messages, records campaign, and marks event as sent/failed.
 *
 * Idempotent: marks event as 'sent' before sending to prevent double-dispatch.
 * If the send phase fails, status is rolled back to 'failed'.
 *
 * Requires admin_settings keys: event_template_image_sid | event_template_video_sid
 */
export async function executeAutoEvent(eventId: string): Promise<ExecuteAutoEventResult> {
  const supabase = getServiceClient()

  const event = await getEvent(eventId)
  if (!event) throw new Error(`Evento ${eventId} no encontrado`)
  if (event.status !== 'scheduled') {
    throw new Error(`Evento ${eventId} no está en estado scheduled (actual: ${event.status})`)
  }

  // Idempotency: claim the event before doing any work
  const { error: claimError } = await supabase
    .from('restaurant_events')
    .update({ status: 'sent' })
    .eq('id', eventId)
    .eq('status', 'scheduled') // guard against race condition
  if (claimError) throw new Error(`No se pudo reclamar evento ${eventId}: ${claimError.message}`)

  try {
    // Resolve template SID from admin_settings
    const settings = await getMultipleSettings([
      'event_template_image_sid',
      'event_template_video_sid',
    ])
    const templateSid = event.media_type === 'video'
      ? (settings.event_template_video_sid ?? null)
      : (settings.event_template_image_sid ?? null)

    if (!templateSid) {
      throw new Error(
        `No hay plantilla configurada para media_type='${event.media_type ?? 'image'}'. ` +
        'Agrega event_template_image_sid / event_template_video_sid en Dashboard → Ajustes.'
      )
    }

    // Build audience
    const candidates = await findCustomersForEvent(event.filters as EventFilters)
    const { eligible, excluded } = await filterByMonthlyCap(candidates)

    // Create campaign record
    const campaign = await createCalendarCampaign({
      name: `calendar_${eventId}_${new Date().toISOString().split('T')[0]}`,
      templateSid,
      mediaUrl: event.media_url,
      mediaType: event.media_type,
      filters: event.filters as Record<string, unknown>,
    })

    const brandName = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'El Restaurante'
    const eventDate = formatEventDate(event.event_date)
    const cta = event.description?.trim() || '¡Te esperamos!'
    const mediaUrl = event.media_url ?? ''

    let sent = 0
    let failed = 0
    const sentCustomerIds: string[] = []

    for (const customer of eligible) {
      const variables: Record<string, string> = {
        '1': customer.name,
        '2': brandName,
        '3': event.title,
        '4': eventDate,
        '5': cta,
        '6': mediaUrl,
      }

      const result = await sendTemplateMessage(customer.phone, templateSid, variables)
      await recordCampaignMessage({
        campaignId: campaign.id,
        customerId: customer.id,
        status: result ? 'sent' : 'failed',
        twilioSid: result?.sid ?? null,
        errorMessage: result ? null : 'Twilio error o número no configurado',
      })

      if (result) {
        sent++
        sentCustomerIds.push(customer.id)
      } else {
        failed++
      }
    }

    await finalizeCampaign(campaign.id, sent)
    await updateCustomerLastCampaignAt(sentCustomerIds)

    // Link campaign to event
    await supabase
      .from('restaurant_events')
      .update({ campaign_id: campaign.id })
      .eq('id', eventId)

    return { sent, failed, excluded_monthly_cap: excluded.length, campaign_id: campaign.id }
  } catch (err) {
    // Roll back to 'failed' so admin can inspect and retry
    await supabase.from('restaurant_events').update({ status: 'failed' }).eq('id', eventId)
    throw err
  }
}
