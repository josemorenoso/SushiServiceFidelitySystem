/**
 * Calendar Service — Eventos operativos del restaurante
 *
 * Capa de datos del calendario: CRUD de eventos + helpers de filtrado de audiencia.
 *
 * NOTA DE ALCANCE: El path de envío (resolución de content_sid, llamada a
 * sendTemplateMessage, creación de campaigns) NO está cableado aún. Quedará
 * pendiente hasta que las plantillas Twilio tipo `twilio/media` estén
 * aprobadas por Meta y se conecten desde un módulo separado.
 *
 * Estados de evento soportados hoy:
 *   - 'planned'    → creado pero sin programar
 *   - 'scheduled'  → marcado con scheduled_send_at (cron lo recogerá luego)
 *   - 'cancelled'  → soft-deleted por admin
 *   - 'sent'       → reservado para cuando el path de envío exista
 *   - 'failed'     → reservado para cuando el path de envío exista
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
