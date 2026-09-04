import { createClient } from '@supabase/supabase-js'
import type { Customer } from '@/types/database.types'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

export async function findCustomerByPhone(phone: string, tenantId: string): Promise<Customer | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error buscando cliente: ${error.message}`)
  }

  return data
}

export async function createCustomer(params: {
  phone: string
  name: string
  birthday: string | null
  city: string | null
  tenantId: string
  source?: 'qr' | 'delivery'
  accepts_marketing?: boolean
  /** false cuando la primera visita debe validarla un mesero (checkin_first_visit_free='false') */
  countFirstVisit?: boolean
  /**
   * Sede donde se registró (D2 / `customers.origin_location_id`, migración 00043).
   * `null` = sede desconocida. Multi-sede F3.
   */
  originLocationId?: string | null
}): Promise<Customer> {
  const supabase = getServiceClient()
  const countFirst = params.countFirstVisit ?? true
  const { data, error } = await supabase
    .from('customers')
    .insert({
      phone: params.phone,
      name: params.name,
      birthday: params.birthday,
      city: params.city,
      // ⚠️ `tenant_id` EXPLÍCITO, siempre. La 00030 nunca se aplicó: la columna todavía
      // tiene un DEFAULT puente que apunta a Sushi Service, así que un INSERT que lo
      // omita se va callado al tenant equivocado.
      tenant_id: params.tenantId,
      total_visits: countFirst ? 1 : 0,
      last_visit_at: countFirst ? new Date().toISOString() : null,
      source_channels: params.source ?? 'qr',
      accepts_marketing: params.accepts_marketing ?? true,
      origin_location_id: params.originLocationId ?? null,
      // La primera visita ocurre donde se registró, así que la "sede de casa" nace igual
      // que el origen. Se recalcula en cada `incrementVisit()`.
      last_visit_location_id: countFirst ? params.originLocationId ?? null : null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Error creando cliente: ${error.message}`)
  }

  return data
}

export async function incrementVisit(
  customerId: string,
  currentVisits: number,
  source?: 'qr' | 'delivery' | 'staff_scan',
  /**
   * Sede de ESTA visita (multi-sede F3). Refresca el caché
   * `customers.last_visit_location_id` = "su sede de casa".
   *
   * `null`/omitido NO borra el valor anterior: una visita cuya sede no se pudo resolver es
   * "sede desconocida", y pisar con NULL la última sede conocida degradaría el dato en
   * silencio — justo lo que el §6.1 del spec necesita para atribuir un mensaje.
   */
  locationId?: string | null
): Promise<Customer> {
  const supabase = getServiceClient()
  const newVisits = currentVisits + 1

  // If source provided, update source_channels accordingly
  const updateData: Record<string, unknown> = {
    total_visits: newVisits,
    last_visit_at: new Date().toISOString(),
  }

  if (locationId) {
    updateData.last_visit_location_id = locationId
  }

  if (source) {
    // Fetch current source_channels to determine if we need to upgrade to 'both'.
    //
    // Con un fallo de base `current` llegaba `null` y el valor actual se asumía `'qr'`. A
    // un cliente que ya era `'both'` se le reescribía el canal y se pierde para siempre la
    // señal de que también pide a domicilio — un dato que la segmentación de campañas usa.
    const { data: current, error: currentError } = await supabase
      .from('customers')
      .select('source_channels')
      .eq('id', customerId)
      .maybeSingle()

    if (isDbFailure(currentError)) {
      logDbFailure({
        scope: 'Customer',
        reason: 'source_channels_lookup_error',
        error: currentError,
        context: { customer_id: customerId },
      })
      throw new Error(`No se pudo leer el canal de origen del cliente: ${currentError.message}`)
    }

    const currentSource = current?.source_channels ?? 'qr'
    if (currentSource !== 'both' && currentSource !== source) {
      updateData.source_channels = 'both'
    } else if (currentSource !== 'both') {
      updateData.source_channels = source
    }
  }

  const { data, error } = await supabase
    .from('customers')
    .update(updateData)
    .eq('id', customerId)
    .select()
    .single()

  if (error) {
    throw new Error(`Error actualizando visitas: ${error.message}`)
  }

  return data
}

/**
 * Normaliza un teléfono a 10 dígitos (formato de customers.phone: 3XXXXXXXXX).
 * Acepta entradas como "whatsapp:+573001234567", "+57 300 123 4567", etc.
 */
function normalizeToTenDigits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/**
 * Marca al cliente como opt-out de WhatsApp (respondió SALIR/STOP/BAJA o
 * Twilio lo rechazó por 21610/63016). También apaga accepts_marketing para
 * que las campañas dejen de incluirlo. Best-effort: no lanza.
 * Auditoría 12-Julio (tarea 8).
 */
export async function setWhatsappOptOut(phone: string, tenantId: string): Promise<void> {
  try {
    const supabase = getServiceClient()
    const normalized = normalizeToTenDigits(phone)
    const { error } = await supabase
      .from('customers')
      .update({ whatsapp_opt_out_at: new Date().toISOString(), accepts_marketing: false })
      .eq('phone', normalized)
      .eq('tenant_id', tenantId)
    if (error) console.error('[OptOut] No se pudo marcar opt-out:', error.message)
  } catch (err) {
    console.error('[OptOut] Excepción marcando opt-out:', err instanceof Error ? err.message : err)
  }
}

/**
 * Limpia el opt-out de WhatsApp (cliente respondió ALTA/START/ACEPTO) y
 * reactiva accepts_marketing. Best-effort: no lanza.
 */
export async function clearWhatsappOptOut(phone: string, tenantId: string): Promise<void> {
  try {
    const supabase = getServiceClient()
    const normalized = normalizeToTenDigits(phone)
    const { error } = await supabase
      .from('customers')
      .update({ whatsapp_opt_out_at: null, accepts_marketing: true })
      .eq('phone', normalized)
      .eq('tenant_id', tenantId)
    if (error) console.error('[OptOut] No se pudo limpiar opt-out:', error.message)
  } catch (err) {
    console.error('[OptOut] Excepción limpiando opt-out:', err instanceof Error ? err.message : err)
  }
}

/**
 * Devuelve true si el teléfono tiene un opt-out de WhatsApp activo.
 * Se consulta antes de cada envío para no malgastar mensajes ni generar
 * errores 21610. Si la consulta falla, devuelve false (no bloquear envíos
 * por un error de DB transitorio).
 */
export async function isPhoneOptedOut(phone: string, tenantId: string): Promise<boolean> {
  try {
    const supabase = getServiceClient()
    const normalized = normalizeToTenDigits(phone)
    const { data, error } = await supabase
      .from('customers')
      .select('whatsapp_opt_out_at')
      .eq('phone', normalized)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error) {
      console.error('[OptOut] Error consultando opt-out (se permite el envío):', error.message)
      return false
    }
    return !!data?.whatsapp_opt_out_at
  } catch (err) {
    console.error('[OptOut] Excepción consultando opt-out (se permite el envío):', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Las dos de abajo son enriquecimiento oportunista (el pedido de domicilio trae ciudad o
 * cumpleaños y se rellena si faltaba). Que fallen no debe tumbar el pedido, así que NO
 * lanzan — pero hasta hoy descartaban el resultado entero y un fallo era invisible.
 */
export async function updateCustomerCityIfNull(customerId: string, city: string): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('customers')
    .update({ city })
    .eq('id', customerId)
    .is('city', null)
  if (error) {
    logDbFailure({
      scope: 'Customer',
      reason: 'city_backfill_error',
      error,
      context: { customer_id: customerId },
    })
  }
}

export async function updateCustomerBirthdayIfNull(customerId: string, birthday: string): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('customers')
    .update({ birthday })
    .eq('id', customerId)
    .is('birthday', null)
  if (error) {
    logDbFailure({
      scope: 'Customer',
      reason: 'birthday_backfill_error',
      error,
      context: { customer_id: customerId },
    })
  }
}
