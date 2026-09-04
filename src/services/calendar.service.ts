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
import { getTenantById } from '@/lib/tenant'
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
    const eventDate = new Date(`${input.event_date}T23:59:59-05:00`)
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
  excluded_monthly_cap: number
  campaign_id: string | null
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

  const tenant = await getTenantById(event.tenant_id)
  if (!tenant) throw new Error(`Tenant ${event.tenant_id} no encontrado para evento ${eventId}`)

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
    const cta = event.description?.trim() || '¡Te esperamos!'

    // Zernio: la media viaja en `options.headerMediaUrl` con la URL pública
    // COMPLETA (no el path suelto que exige la plantilla twilio/media). Twilio
    // sigue exactamente igual — variable {{6}} = el path dentro del bucket.
    const isZernio = tenant.messaging_provider === 'zernio'
    const zernioHeaderMediaUrl = `${getEventMediaBaseUrl()}/${mediaPath}`

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
      }
      if (!isZernio) {
        variables['6'] = mediaPath
      }

      // `keepAllVariables`: el reintento por 21665 suelta la variable más alta
      // primero — aquí {{6}} = el path del flyer. Sin ella la plantilla media
      // sale rota para toda la audiencia; mejor fallar con el error visible.
      // (Zernio no tiene ese reintento — ver whatsapp.service.ts.)
      const result = await sendTemplateMessage(
        customer.phone,
        templateSid,
        variables,
        tenant,
        { customerId: customer.id, messageType: 'calendar_event' },
        isZernio
          ? { headerMediaUrl: zernioHeaderMediaUrl, headerMediaType: event.media_type ?? 'image' }
          : { keepAllVariables: true }
      )
      await recordCampaignMessage({
        campaignId: campaign.id,
        customerId: customer.id,
        status: result ? 'sent' : 'failed',
        tenantId: tenant.id,
        twilioSid: result?.sid ?? null,
        // F2 (post-review): texto neutral de proveedor — desde v2.10.0 este envío
        // puede ser Zernio, no solo Twilio (el detalle real del proveedor ya queda
        // registrado en message_logs por sendTemplateMessage()).
        errorMessage: result ? null : 'Envío fallido o número no configurado (detalle del proveedor en message_logs)',
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

    return { sent, failed, excluded_monthly_cap: excluded.length, campaign_id: campaign.id }
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
