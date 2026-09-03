import { createClient } from '@supabase/supabase-js'
import type { PointTransaction, PointTransactionSource } from '@/types/database.types'
import {
  DEFAULT_POINTS_PER_VISIT_MIN,
  DEFAULT_POINTS_PER_VISIT_MAX,
  DEFAULT_WELCOME_BONUS_POINTS,
  DEFAULT_WELCOME_BONUS_POINTS_MAX,
  DEFAULT_POINTS_SHORTFALL_MIN,
  DEFAULT_POINTS_SHORTFALL_MAX,
  DEFAULT_EVENT_BONUS_POINTS,
} from '@/constants/rewards'
import {
  generateSmartVisitPoints,
  generateWelcomeBonusPoints,
  sanitizeConfig,
  type PointsEngineConfig,
} from '@/lib/points-engine'
import { getAllTiers } from '@/services/reward-tiers.service'
import { getMultipleSettings, isPointsSystemEnabled } from '@/services/settings.service'

// El algoritmo vive en @/lib/points-engine (puro, sin I/O) para que el calibrador del
// dashboard pueda simularlo en el navegador con el MISMO código que corre aquí.
// Se re-exporta para no romper a quien lo importe desde este servicio.
export { generateSmartVisitPoints, generateWelcomeBonusPoints } from '@/lib/points-engine'
export type { PointsEngineConfig } from '@/lib/points-engine'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

/**
 * Lee los settings de puntos configurados por el admin, con fallback a defaults.
 *
 * `shortfall_min` / `shortfall_max` se leen aquí desde el Bloque 2. Antes el dashboard los
 * guardaba y el servicio los ignoraba: el dueño configuraba el "casi lo logro" y no pasaba
 * nada (hallazgo 3.3 de la auditoría de julio 2026).
 */
export async function getPointsConfig(tenantId: string): Promise<PointsEngineConfig & { eventBonus: number }> {
  const settings = await getMultipleSettings([
    'points_per_visit_min',
    'points_per_visit_max',
    'welcome_bonus_points_min',
    'welcome_bonus_points_max',
    'shortfall_min',
    'shortfall_max',
    'event_bonus_points',
  ], tenantId)

  const config = sanitizeConfig({
    visitMin: parseInt(settings.points_per_visit_min ?? String(DEFAULT_POINTS_PER_VISIT_MIN), 10),
    visitMax: parseInt(settings.points_per_visit_max ?? String(DEFAULT_POINTS_PER_VISIT_MAX), 10),
    welcomeMin: parseInt(settings.welcome_bonus_points_min ?? String(DEFAULT_WELCOME_BONUS_POINTS), 10),
    welcomeMax: parseInt(settings.welcome_bonus_points_max ?? String(DEFAULT_WELCOME_BONUS_POINTS_MAX), 10),
    shortfallMin: parseInt(settings.shortfall_min ?? String(DEFAULT_POINTS_SHORTFALL_MIN), 10),
    shortfallMax: parseInt(settings.shortfall_max ?? String(DEFAULT_POINTS_SHORTFALL_MAX), 10),
  })

  return {
    ...config,
    eventBonus: parseInt(settings.event_bonus_points ?? String(DEFAULT_EVENT_BONUS_POINTS), 10),
  }
}

/**
 * Otorga puntos a un cliente y registra la transacción.
 * Retorna los puntos otorgados y el nuevo balance.
 */
export async function awardPoints(params: {
  customerId: string
  points: number
  source: PointTransactionSource
  tenantId: string
  referenceId?: string | null
  /**
   * Sede donde se generó el punto (`point_transactions.location_id`, migración 00043).
   * Multi-sede F3. Los puntos siguen siendo de la MARCA: esta columna ATRIBUYE, no separa
   * saldos — `customers.total_points` no se toca.
   */
  locationId?: string | null
}): Promise<{ pointsAwarded: number; newBalance: number }> {
  const supabase = getServiceClient()

  // Atomic: update customer total_points + insert transaction
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('total_points')
    .eq('id', params.customerId)
    .single()

  if (custErr || !customer) {
    throw new Error(`Error obteniendo puntos del cliente: ${custErr?.message}`)
  }

  // Feature flag: si el admin apagó el sistema de puntos, no se otorga nada.
  // Se devuelve el balance actual sin modificar (auditoría 18-Junio, CR-07/CR-02).
  if (!(await isPointsSystemEnabled(params.tenantId))) {
    return { pointsAwarded: 0, newBalance: customer.total_points }
  }

  const newBalance = customer.total_points + params.points

  // Update customer points
  const { error: updateErr } = await supabase
    .from('customers')
    .update({
      total_points: newBalance,
      last_points_awarded_at: new Date().toISOString(),
    })
    .eq('id', params.customerId)

  if (updateErr) {
    throw new Error(`Error actualizando puntos: ${updateErr.message}`)
  }

  // Record transaction
  const { error: txErr } = await supabase
    .from('point_transactions')
    .insert({
      customer_id: params.customerId,
      points: params.points,
      source: params.source,
      tenant_id: params.tenantId,
      reference_id: params.referenceId ?? null,
      balance_after: newBalance,
      location_id: params.locationId ?? null,
    })

  if (txErr) {
    console.error(`[Points] Error registrando transacción: ${txErr.message}`)
  }

  return { pointsAwarded: params.points, newBalance }
}

/**
 * Otorga puntos inteligentes por una visita (QR o delivery).
 *
 * Ojo: NO corre en el registro. La primera visita de un cliente nuevo otorga el bono de
 * bienvenida (`awardWelcomeBonus`), no puntos de visita. Esto corre de la 2ª visita en
 * adelante — salvo en modo `staff_verified` con la primera visita no libre, donde el
 * escaneo del mesero es la primera vez que se otorgan puntos.
 */
export async function awardVisitPoints(
  customerId: string,
  visitId: string,
  source: 'qr' | 'delivery' | 'staff_scan',
  tenantId: string,
  /** Sede de la visita que genera el punto (multi-sede F3). `null` = sede desconocida. */
  locationId?: string | null
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const supabase = getServiceClient()
  const config = await getPointsConfig(tenantId)

  // Obtener puntos actuales del cliente
  const { data: customer } = await supabase
    .from('customers')
    .select('total_points')
    .eq('id', customerId)
    .single()

  const currentPoints = customer?.total_points ?? 0

  // Encontrar el próximo umbral de tier
  const tiers = await getAllTiers(tenantId)
  const nextTier = tiers.find((t) => t.point_threshold > currentPoints)
  const nextThreshold = nextTier?.point_threshold ?? 150

  const points = generateSmartVisitPoints(currentPoints, nextThreshold, config)
  const txSourceMap: Record<string, PointTransactionSource> = {
    qr: 'visit_qr',
    delivery: 'visit_delivery',
    staff_scan: 'visit_staff',
  }
  const txSource: PointTransactionSource = txSourceMap[source] ?? 'visit_qr'

  return awardPoints({
    customerId,
    points,
    source: txSource,
    tenantId,
    referenceId: visitId,
    locationId,
  })
}

/**
 * Otorga puntos de bienvenida al registrarse (Endowed Progress Effect).
 *
 * Es la primera visita del cliente y la palanca más fuerte del sistema: con el default de
 * 75-90 sobre un umbral de 150, más de la mitad del premio se regala antes de que vuelva.
 * Por eso el calibrador lo ajusta junto con los puntos por visita.
 */
export async function awardWelcomeBonus(
  customerId: string,
  tenantId: string,
  /** Sede donde se registró el cliente (multi-sede F3). `null` = sede desconocida. */
  locationId?: string | null
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const config = await getPointsConfig(tenantId)
  const bonus = generateWelcomeBonusPoints(config)

  if (bonus <= 0) {
    return { pointsAwarded: 0, newBalance: 0 }
  }

  return awardPoints({
    customerId,
    points: bonus,
    source: 'welcome_bonus',
    tenantId,
    locationId,
  })
}

/**
 * Obtiene el historial de transacciones de puntos de un cliente.
 */
export async function getPointHistory(
  customerId: string,
  limit: number = 10
): Promise<PointTransaction[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(`[Points] Error obteniendo historial: ${error.message}`)
    return []
  }

  return data ?? []
}
