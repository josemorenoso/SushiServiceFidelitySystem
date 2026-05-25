import { createClient } from '@supabase/supabase-js'
import type { PointTransaction, PointTransactionSource } from '@/types/database.types'
import {
  DEFAULT_POINTS_PER_VISIT_MIN,
  DEFAULT_POINTS_PER_VISIT_MAX,
  DEFAULT_WELCOME_BONUS_POINTS,
  DEFAULT_POINTS_SHORTFALL_MIN,
  DEFAULT_POINTS_SHORTFALL_MAX,
  MINIMUM_VISIBLE_POINTS,
} from '@/constants/rewards'
import { getAllTiers } from '@/services/reward-tiers.service'
import { getMultipleSettings } from '@/services/settings.service'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

/**
 * Genera puntos aleatorios con distribución triangular (sesgo hacia el centro).
 * Usado internamente cuando no hay lógica de limitación.
 */
function randomTriangular(min: number, max: number): number {
  const u = Math.random()
  const avg = (min + max) / 2
  if (u < 0.5) {
    return Math.round(min + Math.sqrt(u * 2) * (avg - min))
  }
  return Math.round(max - Math.sqrt((1 - u) * 2) * (max - avg))
}

/**
 * Algoritmo inteligente de puntos.
 *
 * REGLA CORE: El cliente SIEMPRE necesita mínimo 3 visitas para alcanzar un tier.
 *
 * Visita 1 (lejos): 60-90 pts → crea ilusión de que 2 visitas bastan.
 * Visita 2 (podría cruzar): se limita para dejar al cliente 5-30 pts corto.
 * Visita 3+ (ya cerca): cualquier cantidad cruza el umbral → PREMIO.
 *
 * @param currentPoints - Puntos actuales del cliente ANTES de esta visita.
 * @param nextThreshold - Umbral del próximo tier a alcanzar.
 * @param min - Mínimo general por visita (default 60).
 * @param max - Máximo general por visita (default 90).
 */
export function generateSmartVisitPoints(
  currentPoints: number,
  nextThreshold: number,
  min: number,
  max: number
): number {
  const remaining = nextThreshold - currentPoints

  // CASO 1: Lejos del umbral — ni con máximo llega → dar puntos altos (emocionante)
  if (remaining > max) {
    return randomTriangular(min, max)
  }

  // CASO 2: Podría cruzar con esta visita — LIMITAR para dejar 5-30 corto
  if (remaining > DEFAULT_POINTS_SHORTFALL_MAX) {
    // Queremos que tras esta visita quede entre (threshold - SHORTFALL_MAX) y (threshold - SHORTFALL_MIN)
    const shortfall = DEFAULT_POINTS_SHORTFALL_MIN +
      Math.floor(Math.random() * (DEFAULT_POINTS_SHORTFALL_MAX - DEFAULT_POINTS_SHORTFALL_MIN + 1))
    let target = remaining - shortfall
    // Piso: no dar menos de MINIMUM_VISIBLE_POINTS (para no verse sospechoso)
    target = Math.max(target, MINIMUM_VISIBLE_POINTS)
    // Techo: no exceder max
    target = Math.min(target, max)
    return target
  }

  // CASO 3: Ya está a 30 o menos del umbral (viene de una visita limitadora)
  // → Dar suficiente para cruzar, pero con variación emocionante
  const minToCross = Math.max(remaining, MINIMUM_VISIBLE_POINTS)
  return randomTriangular(minToCross, max)
}

/** @deprecated Usa generateSmartVisitPoints en su lugar. Conservado para tests. */
export function generateVisitPoints(min: number, max: number): number {
  return randomTriangular(min, max)
}

/**
 * Lee los settings de puntos configurados por el admin, con fallback a defaults.
 */
export async function getPointsConfig(): Promise<{
  min: number
  max: number
  welcomeBonus: number
  eventBonus: number
}> {
  const settings = await getMultipleSettings([
    'points_per_visit_min',
    'points_per_visit_max',
    'welcome_bonus_points',
    'event_bonus_points',
  ])

  return {
    min: parseInt(settings.points_per_visit_min ?? String(DEFAULT_POINTS_PER_VISIT_MIN), 10),
    max: parseInt(settings.points_per_visit_max ?? String(DEFAULT_POINTS_PER_VISIT_MAX), 10),
    welcomeBonus: parseInt(settings.welcome_bonus_points ?? String(DEFAULT_WELCOME_BONUS_POINTS), 10),
    eventBonus: parseInt(settings.event_bonus_points ?? '25', 10),
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
  referenceId?: string | null
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
      reference_id: params.referenceId ?? null,
      balance_after: newBalance,
    })

  if (txErr) {
    console.error(`[Points] Error registrando transacción: ${txErr.message}`)
  }

  return { pointsAwarded: params.points, newBalance }
}

/**
 * Otorga puntos inteligentes por una visita (QR o delivery).
 * Usa generateSmartVisitPoints para limitar la 2da visita y garantizar la 3ra.
 */
export async function awardVisitPoints(
  customerId: string,
  visitId: string,
  source: 'qr' | 'delivery'
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const supabase = getServiceClient()
  const config = await getPointsConfig()

  // Obtener puntos actuales del cliente
  const { data: customer } = await supabase
    .from('customers')
    .select('total_points')
    .eq('id', customerId)
    .single()

  const currentPoints = customer?.total_points ?? 0

  // Encontrar el próximo umbral de tier
  const tiers = await getAllTiers()
  const nextTier = tiers.find((t) => t.point_threshold > currentPoints)
  const nextThreshold = nextTier?.point_threshold ?? 150

  const points = generateSmartVisitPoints(currentPoints, nextThreshold, config.min, config.max)
  const txSource: PointTransactionSource = source === 'qr' ? 'visit_qr' : 'visit_delivery'

  return awardPoints({
    customerId,
    points,
    source: txSource,
    referenceId: visitId,
  })
}

/**
 * Otorga puntos de bienvenida al registrarse.
 */
export async function awardWelcomeBonus(customerId: string): Promise<{ pointsAwarded: number; newBalance: number }> {
  const config = await getPointsConfig()
  if (config.welcomeBonus <= 0) {
    return { pointsAwarded: 0, newBalance: 0 }
  }

  return awardPoints({
    customerId,
    points: config.welcomeBonus,
    source: 'welcome_bonus',
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
