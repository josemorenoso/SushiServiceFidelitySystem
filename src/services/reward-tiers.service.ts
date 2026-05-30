import { createClient } from '@supabase/supabase-js'
import type { RewardTier } from '@/types/database.types'
import { getTierEmoji } from '@/lib/tier-emojis'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

/**
 * Obtiene todos los reward tiers activos, ordenados por sort_order.
 */
export async function getAllTiers(): Promise<RewardTier[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('reward_tiers')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`Error obteniendo tiers: ${error.message}`)
  }

  return data ?? []
}

/**
 * Obtiene un tier por ID.
 */
export async function getTierById(tierId: string): Promise<RewardTier | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('reward_tiers')
    .select('*')
    .eq('id', tierId)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error obteniendo tier: ${error.message}`)
  }

  return data
}

/**
 * Evalúa si el cliente acaba de alcanzar un nuevo tier.
 * Retorna el tier alcanzado o null si no cruzó ningún umbral nuevo.
 *
 * Lógica: busca el tier con point_threshold más alto que el cliente
 * ha superado AHORA pero que NO había superado con sus puntos anteriores.
 */
export async function evaluateNewTier(
  previousPoints: number,
  currentPoints: number
): Promise<RewardTier | null> {
  const tiers = await getAllTiers()
  if (tiers.length === 0) return null

  // Tiers cuyos umbrales cruza por primera vez
  const newlyReached = tiers.filter(
    (t) => currentPoints >= t.point_threshold && previousPoints < t.point_threshold
  )

  if (newlyReached.length === 0) return null

  // Retorna el de mayor umbral (tier más alto alcanzado en esta visita)
  return newlyReached[newlyReached.length - 1]
}

/**
 * Obtiene el próximo tier que el cliente debe alcanzar.
 */
export async function getNextTier(currentPoints: number): Promise<{
  tier: RewardTier
  pointsRemaining: number
} | null> {
  const tiers = await getAllTiers()
  const next = tiers.find((t) => t.point_threshold > currentPoints)

  if (!next) return null

  return {
    tier: next,
    pointsRemaining: next.point_threshold - currentPoints,
  }
}

/**
 * Obtiene el tier actual del cliente (el más alto que ya alcanzó).
 */
export async function getCurrentTier(currentPoints: number): Promise<RewardTier | null> {
  const tiers = await getAllTiers()
  const reached = tiers.filter((t) => currentPoints >= t.point_threshold)

  if (reached.length === 0) return null

  return reached[reached.length - 1]
}

/**
 * Genera el roadmap de tiers para mostrar al cliente.
 * Formato ejemplo:
 *   🥉 Bronce (150 pts) → Bebida gratis ✅
 *   🥈 Plata (350 pts) → Postre gratis — te faltan 80 pts
 *   🥇 Oro (600 pts) → Plato fuerte gratis
 *   🖤 BLACK (1000 pts) → Experiencia Chef
 */
export async function buildTiersRoadmap(currentPoints: number): Promise<string> {
  const tiers = await getAllTiers()
  if (tiers.length === 0) return '🌟 ¡Seguí sumando puntos para desbloquear premios!'

  const lines: string[] = []
  let foundNext = false

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const emoji = getTierEmoji(i, t.is_black)
    const reached = currentPoints >= t.point_threshold

    if (reached) {
      lines.push(`${emoji} ${t.tier_name} (${t.point_threshold} pts) → ${t.safe_reward_title} ✅`)
    } else if (!foundNext) {
      const remaining = t.point_threshold - currentPoints
      lines.push(`${emoji} ${t.tier_name} (${t.point_threshold} pts) → ${t.safe_reward_title} — te faltan ${remaining} pts 🔥`)
      foundNext = true
    } else {
      lines.push(`${emoji} ${t.tier_name} (${t.point_threshold} pts) → ${t.safe_reward_title}`)
    }
  }

  return lines.join('\n')
}

/**
 * Actualiza el tier actual del cliente en la tabla customers.
 */
export async function updateCustomerTier(customerId: string, tierName: string): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('customers')
    .update({ current_tier: tierName })
    .eq('id', customerId)

  if (error) {
    console.error(`[RewardTiers] Error actualizando tier: ${error.message}`)
  }
}
