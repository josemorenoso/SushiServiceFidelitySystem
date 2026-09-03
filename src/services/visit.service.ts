import { createClient } from '@supabase/supabase-js'
import type { Visit } from '@/types/database.types'
import type { LocationResolution } from '@/lib/location-resolver'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

export async function createVisit(params: {
  customerId: string
  source: 'qr' | 'delivery' | 'staff_scan'
  tenantId: string
  notes?: string
  address?: string
  paymentMethod?: string
  amount?: number
  rawMessage?: string
  tableNumber?: number | null
  registeredByStaffId?: string | null
  /**
   * Sede + procedencia + conflicto, tal como los resolvió `@/lib/location-resolver`
   * (multi-sede F3, columnas de la migración 00043).
   *
   * Omitirlo deja la visita con `location_id = NULL`, que significa **sede desconocida**
   * y se MUESTRA como el cubo "Sin sede": nunca se reparte ni se esconde.
   */
  location?: LocationResolution | null
}): Promise<Visit> {
  const supabase = getServiceClient()
  const insertPayload: Record<string, unknown> = {
    customer_id: params.customerId,
    source: params.source,
    tenant_id: params.tenantId,
    notes: params.notes ?? null,
    address: params.address ?? null,
    payment_method: params.paymentMethod ?? null,
    amount: params.amount ?? null,
    raw_message: params.rawMessage ?? null,
  }
  // Only include table_number if present (requires migration 00009)
  if (params.tableNumber != null) {
    insertPayload.table_number = params.tableNumber
  }
  // Only include registered_by_staff_id if present (requires migration 00015)
  if (params.registeredByStaffId != null) {
    insertPayload.registered_by_staff_id = params.registeredByStaffId
  }

  // ─── Sede (multi-sede F3, migración 00043) ───
  // La pareja `location_id` + `location_source` va COMPLETA o no va: lo exige el CHECK
  // `visits_location_pareja_check`. Si llegara media pareja, se descarta la sede entera en
  // vez de dejar que el INSERT muera con 23514 dentro del `catch` best-effort del check-in
  // y la visita se pierda por un dato de atribución.
  if (params.location?.locationId && params.location.source) {
    insertPayload.location_id = params.location.locationId
    insertPayload.location_source = params.location.source
  }
  // TRI-ESTADO: solo se escribe cuando de verdad se evaluó. `null` significa "no se evaluó",
  // y `false` afirmaría "verificado, sin conflicto" sobre algo que nadie verificó.
  if (params.location?.conflict !== null && params.location?.conflict !== undefined) {
    insertPayload.location_conflict = params.location.conflict
  }

  const { data, error } = await supabase
    .from('visits')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    throw new Error(`Error registrando visita: ${error.message}`)
  }

  return data
}

export async function getRecentVisit(customerId: string, withinMinutes: number = 60): Promise<boolean> {
  const supabase = getServiceClient()
  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('visits')
    .select('id')
    .eq('customer_id', customerId)
    .gte('created_at', since)
    .limit(1)

  if (error) {
    throw new Error(`Error verificando visita reciente: ${error.message}`)
  }

  return (data?.length ?? 0) > 0
}
