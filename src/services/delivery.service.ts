/**
 * Domicilios — de un mensaje de WhatsApp a un cliente, una visita y unos puntos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FASE 2 DE §25: ESTO YA NO PASA POR n8n
 * ─────────────────────────────────────────────────────────────────────────────
 * Hasta el 2026-09-03 `twilio-incoming` y `webhook/zernio` reenviaban el mensaje del
 * operador a `N8N_DOMICILIOS_WEBHOOK_URL`; n8n llamaba a OpenAI, parseaba y hacía
 * `POST /api/webhook/delivery` de vuelta contra nosotros. Ahora las dos rutas llaman a
 * `processDeliveryMessage()` de este archivo y no sale ni una petición HTTP del proceso
 * salvo la de OpenAI. Ver `docs/features/delivery-webhook.md`.
 *
 * `registerDeliveryOrder()` es la lógica que ANTES vivía dentro de
 * `src/app/api/webhook/delivery/route.ts`. Se movió aquí sin cambiarle el
 * comportamiento: **el endpoint HTTP sigue existiendo y sigue funcionando igual**, para
 * que el workflow de n8n no se rompa mientras el dueño apaga el VPS a mano.
 *
 * ⚠️ `service_role` NO aísla nada: la app corre con la llave de servicio y el RLS no
 * evalúa. Cada query de este archivo lleva su `.eq('tenant_id', …)` escrito a mano.
 * ⚠️ La 00030 nunca se aplicó: `customers.tenant_id` y otras 17 columnas conservan el
 * DEFAULT puente que manda a Sushi Service todo INSERT que lo omita. Todo lo que
 * escribe este archivo pasa `tenantId` explícito (ver `docs/03-security.md`).
 */

import { createClient } from '@supabase/supabase-js'
import { validatePhone } from '@/lib/validators/phone'
import {
  findCustomerByPhone,
  createCustomer,
  incrementVisit,
  updateCustomerCityIfNull,
  updateCustomerBirthdayIfNull,
} from '@/services/customer.service'
import { createVisit } from '@/services/visit.service'
import { awardVisitPoints, awardWelcomeBonus } from '@/services/points.service'
import {
  evaluateNewTier,
  getNextTier,
  buildTiersRoadmap,
  updateCustomerTier,
} from '@/services/reward-tiers.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { syncGoogleContact } from '@/services/google-contacts-sync.service'
import { resolveDirectLocation, type LocationResolution } from '@/lib/location-resolver'
import {
  DeliveryExtractionError,
  extractDeliveryOrder,
  type DeliveryCompletion,
  type DeliveryExtractionReason,
  type ParsedDeliveryOrder,
} from '@/services/delivery-ai.service'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

/**
 * Checks if a phone number is an authorized sender (mesero).
 * The phone comes from Twilio in format "whatsapp:+573001234567".
 */
export async function isAuthorizedNumber(twilioFrom: string, tenantId: string): Promise<boolean> {
  const cleaned = extractPhoneFromTwilio(twilioFrom)
  if (!cleaned) return false

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('authorized_numbers')
    .select('id')
    .eq('phone', cleaned)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('[Delivery] Error verificando número autorizado:', error.message)
    return false
  }

  return !!data
}

/**
 * Extracts a Colombian phone from Twilio's "whatsapp:+57XXXXXXXXXX" format.
 * Returns the 10-digit number or null.
 */
export function extractPhoneFromTwilio(twilioPhone: string): string | null {
  const match = twilioPhone.match(/\+57(\d{10})/)
  if (match) {
    const { valid, cleaned } = validatePhone(match[1])
    return valid ? cleaned : null
  }
  return null
}

/**
 * Extracts a Colombian phone number from the message body.
 * Tries multiple patterns:
 * 1. Explicit 10-digit number starting with 3
 * 2. Number with country code +57
 * 3. Number with spaces/separators
 */
export function extractClientPhoneFromMessage(body: string): string | null {
  if (!body) return null

  const cleaned = body.replace(/[\n\r]/g, ' ')

  // Pattern 1: +57 followed by 10 digits
  const withCountryCode = cleaned.match(/\+57\s*(3\d{9})/)
  if (withCountryCode) {
    return withCountryCode[1]
  }

  // Pattern 2: 10-digit Colombian mobile (standalone)
  const standalone = cleaned.match(/(?:^|\s|:)(3\d{9})(?:\s|$|,|\.|\)|-)/m)
  if (standalone) {
    return standalone[1]
  }

  // Pattern 3: 10 digits with separators (e.g. 300-123-4567, 300 123 4567)
  const withSeparators = cleaned.match(/(?:^|\s)(3\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4})(?:\s|$|,|\.|\))/m)
  if (withSeparators) {
    const digits = withSeparators[1].replace(/[\s\-.]/g, '')
    const { valid } = validatePhone(digits)
    if (valid) return digits
  }

  // Pattern 4: any 10 digits starting with 3 found anywhere
  const anyMatch = cleaned.match(/(3\d{9})/)
  if (anyMatch) {
    return anyMatch[1]
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// SEDE DEL PEDIDO (D9, spec de multi-sede §3.4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sede del pedido de domicilio a partir del **celular del operador**.
 *
 * Es una señal autenticada: la firma de Twilio (o la HMAC de Zernio) se valida antes de
 * llegar aquí y el número no lo elige el cliente.
 *
 * ⚠️ **Desde la Fase 2 este camino casi nunca se usa.** Las dos rutas de webhook ya
 * consultan `authorized_numbers` para decidir si el remitente es un operador autorizado;
 * ahora traen `location_id` en ese mismo `SELECT` y se lo pasan hecho a
 * `registerDeliveryOrder()`. La sede sale **gratis**, sin una segunda consulta. Esta
 * función queda para el único llamador que solo tiene el número suelto: el endpoint HTTP
 * `/api/webhook/delivery`, que sigue vivo para n8n mientras el VPS no se apague.
 *
 * Falla blando: si no se puede resolver, el pedido se registra igual con sede
 * desconocida. Un domicilio sin atribuir es un dato menos; un domicilio perdido es un
 * cliente menos.
 */
export async function resolveDeliveryLocation(
  remitente: string | null | undefined,
  tenantId: string
): Promise<LocationResolution> {
  const phone = (remitente ?? '').replace(/\D/g, '').slice(-10)
  if (phone.length !== 10) return resolveDirectLocation(null, 'authorized_number')

  try {
    const { data, error } = await getServiceClient()
      .from('authorized_numbers')
      .select('location_id')
      .eq('phone', phone)
      // El aislamiento por marca no lo da el RLS (la app corre con service_role): es este
      // filtro escrito a mano. Sin él, el operador de OTRA marca resolvería sede aquí.
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error('[Delivery] No se pudo resolver la sede del operador:', error.message)
      return resolveDirectLocation(null, 'authorized_number')
    }
    return resolveDirectLocation((data?.location_id as string | null) ?? null, 'authorized_number')
  } catch (err) {
    console.error(
      '[Delivery] Excepción resolviendo la sede del operador:',
      err instanceof Error ? err.message : err
    )
    return resolveDirectLocation(null, 'authorized_number')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DEL PEDIDO — la lógica que antes vivía dentro del route handler
// ═══════════════════════════════════════════════════════════════════════════

/** Fecha `DD/MM/AAAA` → `AAAA-MM-DD`, o `null` si no cuadra. */
function parseBirthday(raw: string | null | undefined): string | null {
  if (!raw) return null
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return null
  const [day, month, year] = parts.map((p) => parseInt(p, 10))
  if (!day || !month || !year) return null
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  if (year < 1900 || year > new Date().getFullYear()) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function sendDeliveryTemplate(
  templateSid: string | undefined,
  templateType: string,
  phone: string,
  variables: Record<string, string>,
  customerId: string | null,
  tenant: Tenant,
  /** Sede a la que se imputa el mensaje (D4, multi-sede F3). */
  locationId?: string | null
): Promise<void> {
  if (!templateSid) {
    console.warn(`[Delivery] No hay plantilla configurada para "${templateType}" — mensaje NO enviado.`)
    return
  }
  try {
    // logContext para que el envío quede trazado en message_logs (auditoría 18-Junio, CR-03).
    await sendTemplateMessage(phone, templateSid, variables, tenant, {
      customerId,
      messageType: templateType,
      locationId: locationId ?? null,
    })
  } catch (err) {
    console.error(`[Delivery] Error enviando plantilla ${templateType}:`, err)
  }
}

/** Los datos del pedido que necesita el registro. Superset de `ParsedDeliveryOrder`. */
export interface DeliveryOrderInput {
  nombre_cliente?: string | null
  celular: string
  direccion?: string | null
  metodo_pago?: string | null
  monto_total?: number | null
  raw_message?: string | null
  ciudad?: string | null
  /** `DD/MM/AAAA`. Nunca lo manda el flujo de WhatsApp; lo acepta el endpoint HTTP. */
  birthday?: string | null
}

export interface RegisterDeliveryOrderInput {
  tenant: Tenant
  order: DeliveryOrderInput
  /**
   * Sede YA resuelta (las rutas de webhook la traen de su propio `SELECT` sobre
   * `authorized_numbers`). Si no viene, se resuelve desde `remitente`.
   */
  location?: LocationResolution
  /** Celular del operador. Solo se usa si `location` no viene resuelta. */
  remitente?: string | null
}

export interface RegisterDeliveryOrderResult {
  isNew: boolean
  action: 'created' | 'updated'
  customerId: string
  customerName: string
  customerPhone: string
  totalVisits: number
  totalPoints: number
  pointsAwarded: number
  tierUnlocked: { name: string; safeReward: string } | null
}

/** El celular no pasó `^3\d{9}$`. Es lo único que corta el registro. */
export class DeliveryRegistrationError extends Error {
  readonly celular: string
  constructor(celular: string) {
    super('Celular inválido')
    this.name = 'DeliveryRegistrationError'
    this.celular = celular
  }
}

/**
 * Crea o actualiza el cliente, registra la visita, otorga puntos, evalúa tiers y manda
 * la plantilla de WhatsApp que corresponda.
 *
 * Es exactamente lo que hacía `POST /api/webhook/delivery` antes de la Fase 2, movido a
 * un servicio para que las dos rutas de webhook lo llamen **directo, sin dar la vuelta
 * por HTTP** (§25.8). El endpoint sigue existiendo y llama aquí.
 *
 * @throws {DeliveryRegistrationError} si el celular del cliente no es válido.
 */
export async function registerDeliveryOrder({
  tenant,
  order,
  location,
  remitente,
}: RegisterDeliveryOrderInput): Promise<RegisterDeliveryOrderResult> {
  const { valid, cleaned } = validatePhone(order.celular ?? '')
  if (!valid) {
    throw new DeliveryRegistrationError(order.celular ?? '')
  }

  const customerName = order.nombre_cliente?.trim() || 'Cliente Domicilio'
  const deliveryLocation = location ?? (await resolveDeliveryLocation(remitente, tenant.id))
  const parsedBirthday = parseBirthday(order.birthday)
  const ciudad = order.ciudad ?? null

  let customer = await findCustomerByPhone(cleaned, tenant.id)
  let isNew = false
  let action: 'created' | 'updated' = 'updated'

  if (!customer) {
    customer = await createCustomer({
      phone: cleaned,
      name: customerName,
      birthday: parsedBirthday,
      city: ciudad,
      tenantId: tenant.id,
      source: 'delivery',
      originLocationId: deliveryLocation.locationId,
    })
    isNew = true
    action = 'created'
  } else {
    customer = await incrementVisit(
      customer.id,
      customer.total_visits,
      'delivery',
      deliveryLocation.locationId
    )
    if (ciudad && !customer.city) {
      await updateCustomerCityIfNull(customer.id, ciudad)
    }
    if (parsedBirthday && !customer.birthday) {
      await updateCustomerBirthdayIfNull(customer.id, parsedBirthday)
    }
  }

  const visit = await createVisit({
    customerId: customer.id,
    source: 'delivery',
    tenantId: tenant.id,
    notes: order.metodo_pago ? `Pago: ${order.metodo_pago}` : undefined,
    address: order.direccion ?? undefined,
    paymentMethod: order.metodo_pago ?? undefined,
    amount: order.monto_total ?? undefined,
    rawMessage: order.raw_message ?? undefined,
    location: deliveryLocation,
  })

  const settings = await getMultipleSettings(
    [
      'welcome_template_sid',
      'points_earned_far_template_sid',
      'points_earned_near_template_sid',
      'tier_unlocked_template_sid',
    ],
    tenant.id
  )

  // Puntos de bienvenida para nuevos clientes
  let welcomePoints = { pointsAwarded: 0, newBalance: 0 }
  if (isNew) {
    try {
      welcomePoints = await awardWelcomeBonus(customer.id, tenant.id, deliveryLocation.locationId)
    } catch (err) {
      console.error('[Delivery] Error otorgando puntos de bienvenida:', err)
    }
  }

  // Para clientes existentes: otorgar puntos por visita y evaluar tiers
  let pointsResult = { pointsAwarded: welcomePoints.pointsAwarded, newBalance: welcomePoints.newBalance }
  let newTier = null
  let nextTierInfo = null
  let tiersRoadmapText = '🌟 ¡Seguí sumando puntos para desbloquear premios!'

  if (!isNew) {
    const previousPoints = customer.total_points ?? 0
    try {
      pointsResult = await awardVisitPoints(
        customer.id,
        visit.id,
        'delivery',
        tenant.id,
        deliveryLocation.locationId
      )
      console.log(
        `[Delivery] Puntos otorgados: +${pointsResult.pointsAwarded} → balance=${pointsResult.newBalance} (prev=${previousPoints})`
      )
    } catch (err) {
      console.error('[Delivery] ERROR otorgando puntos (se usa fallback 0):', err)
      pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
    }

    try {
      newTier = await evaluateNewTier(previousPoints, pointsResult.newBalance, tenant.id)
      if (newTier) {
        await updateCustomerTier(customer.id, newTier.tier_name)
      }
      nextTierInfo = await getNextTier(pointsResult.newBalance, tenant.id)
    } catch (err) {
      console.error('[Delivery] ERROR evaluando tiers (se continúa sin tiers):', err)
    }
  }

  try {
    tiersRoadmapText = await buildTiersRoadmap(pointsResult.newBalance, tenant.id)
  } catch (err) {
    console.error('[Delivery] Error generando tiers roadmap:', err)
  }

  if (isNew) {
    await sendDeliveryTemplate(
      settings.welcome_template_sid,
      'welcome',
      cleaned,
      {
        '1': customer.name,
        '2': String(pointsResult.newBalance),
        '3': tiersRoadmapText,
      },
      customer.id,
      tenant,
      deliveryLocation.locationId
    )
  } else if (newTier) {
    await sendDeliveryTemplate(
      settings.tier_unlocked_template_sid,
      'tier_unlocked',
      cleaned,
      {
        '1': customer.name,
        '2': newTier.tier_name,
        '3': newTier.safe_reward_title,
        '4': tiersRoadmapText,
      },
      customer.id,
      tenant,
      deliveryLocation.locationId
    )
  } else {
    const isNearTier = nextTierInfo && nextTierInfo.pointsRemaining <= 30
    const targetSid = isNearTier
      ? settings.points_earned_near_template_sid
      : settings.points_earned_far_template_sid
    if (targetSid) {
      await sendDeliveryTemplate(
        targetSid,
        isNearTier ? 'points_earned_near' : 'points_earned_far',
        cleaned,
        {
          '1': customer.name,
          '2': String(pointsResult.pointsAwarded),
          '3': String(pointsResult.newBalance),
          '4': isNearTier ? nextTierInfo!.tier.safe_reward_title : tiersRoadmapText,
        },
        customer.id,
        tenant,
        deliveryLocation.locationId
      )
    } else {
      console.warn(
        '[Delivery] No hay plantilla de puntos configurada (points_earned_near/far_template_sid). Mensaje WhatsApp NO enviado.'
      )
    }
  }

  // Google Contacts sync (awaited — Vercel mata fire-and-forget).
  // Sigue siendo un webhook a n8n (W3) y hace no-op si falta la variable: la Fase 3 está
  // diferida por decisión del dueño (§25.7, respuesta 1).
  try {
    await syncGoogleContact({
      phone: cleaned,
      name: customer.name,
      address: order.direccion ?? null,
      totalVisits: customer.total_visits,
      source: 'delivery',
      action,
    })
  } catch (err) {
    console.error('[Delivery] Error sync Google Contacts:', err)
  }

  return {
    isNew,
    action,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalVisits: customer.total_visits,
    totalPoints: pointsResult.newBalance,
    pointsAwarded: pointsResult.pointsAwarded,
    tierUnlocked: newTier ? { name: newTier.tier_name, safeReward: newTier.safe_reward_title } : null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTAKE COMPLETO — lo que antes hacía el workflow entero de n8n
// ═══════════════════════════════════════════════════════════════════════════

/** Motivos de extracción, más los que aportan el registro y la puerta de entrada. */
export type DeliveryIntakeReason =
  | DeliveryExtractionReason
  | 'celular_invalido_registro'
  | 'registro_fallido'
  /**
   * La consulta a `authorized_numbers` falló, así que **no se sabe** si el remitente era un
   * operador. Lo reporta la ruta, no este servicio: pasa antes de llegar aquí.
   *
   * ⚠️ Es el motivo más traicionero de todos, y por eso tiene nombre propio: supabase-js
   * **no lanza** — un error vuelve como `{ data: null, error }`. Quien solo lea `data` ve
   * `null` y no puede distinguir *«no es un operador»* de *«la base no contestó»*, así que
   * el pedido se cae por el camino del cliente normal y desaparece sin una línea de log.
   */
  | 'remitente_no_verificable'

export type DeliveryIntakeResult =
  | { ok: true; order: ParsedDeliveryOrder; registration: RegisterDeliveryOrderResult }
  | { ok: false; reason: DeliveryIntakeReason; detail: string }

/**
 * EL ÚNICO EMBUDO POR EL QUE SE PIERDE UN DOMICILIO.
 *
 * Todo pedido que no llega a la base pasa por aquí con su motivo REAL, el tenant, el
 * operador y el mensaje original recortado. Hoy el destino es el log de Vercel — que es
 * la superficie de observabilidad que dejó la Fase 1 (§25.6) — y **no** una tabla:
 * `§24-B` («apartado de domicilios» + alarma de silencio) es trabajo aparte y lleva su
 * propia migración. Cuando esa tabla exista, el `INSERT` va aquí dentro y en ningún otro
 * sitio: por eso esto es una función y no un `console.error` suelto en cada `catch`.
 *
 * El prefijo `[Delivery][FALLO]` es estable a propósito: es sobre lo que se monta una
 * alerta de log en Vercel sin tocar código.
 *
 * Se exporta para que las dos rutas de webhook reporten por aquí el único fallo que ocurre
 * ANTES de llamar a `processDeliveryMessage()`: `remitente_no_verificable`.
 */
export function logDeliveryIntakeFailure(args: {
  tenant: Tenant
  operatorPhone: string | null
  reason: DeliveryIntakeReason
  detail: string
  rawMessage: string
}): void {
  console.error(
    `[Delivery][FALLO] reason=${args.reason} tenant=${args.tenant.slug} operador=${args.operatorPhone ?? 'desconocido'} detalle="${args.detail}" mensaje="${args.rawMessage.slice(0, 300)}"`
  )
}

export interface ProcessDeliveryMessageInput {
  tenant: Tenant
  /** El cuadro del pedido tal como lo escribió el operador. */
  rawMessage: string
  /** Celular del operador, 10 dígitos. Solo para trazabilidad y para resolver la sede. */
  operatorPhone: string | null
  /**
   * `authorized_numbers.location_id` del operador, que la ruta ya trajo en su propio
   * `SELECT`. `undefined` = no se consultó y hay que resolverlo; `null` = se consultó y
   * el operador no tiene sede asignada.
   */
  operatorLocationId?: string | null
  /** Costura de pruebas: sustituye la llamada a OpenAI. */
  complete?: DeliveryCompletion
}

/**
 * Mensaje de WhatsApp del operador → cliente, visita y puntos. Todo dentro del producto.
 *
 * Réplica de la cadena completa de `n8n/domicilios_whatsapp_v4.json`, menos el nodo de
 * Google Contacts (que sigue siendo un webhook a n8n desde `registerDeliveryOrder()`) y
 * menos el salto HTTP de vuelta a `/api/webhook/delivery`.
 *
 * **Nunca lanza.** Devuelve un resultado discriminado y deja registrado el motivo real;
 * quien llama decide qué le contesta al operador.
 */
export async function processDeliveryMessage({
  tenant,
  rawMessage,
  operatorPhone,
  operatorLocationId,
  complete,
}: ProcessDeliveryMessageInput): Promise<DeliveryIntakeResult> {
  const fallar = (reason: DeliveryIntakeReason, detail: string): DeliveryIntakeResult => {
    logDeliveryIntakeFailure({ tenant, operatorPhone, reason, detail, rawMessage })
    return { ok: false, reason, detail }
  }

  let order: ParsedDeliveryOrder
  try {
    order = await extractDeliveryOrder({
      message: rawMessage,
      cityHint: tenant.config?.delivery_default_city ?? null,
      complete,
    })
  } catch (err) {
    if (err instanceof DeliveryExtractionError) {
      return fallar(err.reason, err.detail)
    }
    return fallar('ia_error', err instanceof Error ? err.message : String(err))
  }

  // La sede ya viene resuelta cuando la ruta consultó `authorized_numbers` (que es
  // siempre, porque es el mismo SELECT que decide si el remitente está autorizado).
  const location =
    operatorLocationId === undefined
      ? undefined
      : resolveDirectLocation(operatorLocationId, 'authorized_number')

  try {
    const registration = await registerDeliveryOrder({
      tenant,
      order: { ...order, raw_message: rawMessage },
      location,
      remitente: operatorPhone,
    })
    console.log(
      `[Delivery] ${registration.action} ${registration.customerPhone} (tenant=${tenant.slug}, sede=${location?.locationId ?? 'desconocida'}) visita #${registration.totalVisits}`
    )
    return { ok: true, order, registration }
  } catch (err) {
    if (err instanceof DeliveryRegistrationError) {
      return fallar(
        'celular_invalido_registro',
        `El celular "${err.celular}" pasó la IA pero no validatePhone()`
      )
    }
    return fallar('registro_fallido', err instanceof Error ? err.message : String(err))
  }
}
