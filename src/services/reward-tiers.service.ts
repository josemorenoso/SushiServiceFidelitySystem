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
 * Elige, de todas las filas de la marca, las que gobiernan en UNA sede.
 *
 * LA REGLA, EN UNA FRASE: una sede que definió al menos un nivel propio usa
 * **los suyos y solo los suyos**; una sede que no definió ninguno usa los de la
 * marca. `location_id IS NULL` es "de la marca" (00058 §3).
 *
 * POR QUÉ REEMPLAZA Y NO SE MEZCLA
 * ────────────────────────────────
 * La alternativa era mezclar —los de la marca, más los de la sede, con la sede
 * pisando los umbrales repetidos— y se descartó por dos motivos:
 *
 *   1. **Nadie puede explicárselo a un restaurantero.** «Tenés los niveles de la
 *      marca EXCEPTO los que redefiniste, y si borrás uno vuelve el de la marca»
 *      se entiende leyendo código, no mirando una pantalla. «Esta sede usa los
 *      premios de la marca» / «esta sede tiene los suyos» sí.
 *   2. Mezclar deja estados que no se pueden expresar: una sede que quiere tener
 *      MENOS niveles que la marca no podría decirlo nunca.
 *
 * PURA a propósito: es la regla entera, probable sin base.
 */
export function elegirFilasDeSede<T extends { location_id?: string | null }>(
  filas: readonly T[],
  locationId: string | null | undefined
): T[] {
  if (!locationId) return filas.filter((f) => !f.location_id)
  const propias = filas.filter((f) => f.location_id === locationId)
  return propias.length > 0 ? propias : filas.filter((f) => !f.location_id)
}

/**
 * Obtiene los reward tiers activos que gobiernan en una sede, ordenados por
 * sort_order.
 *
 * `locationId` es OPCIONAL y su ausencia significa «los de la marca», que es
 * exactamente el comportamiento anterior a la 00058: todas las filas que
 * existen hoy tienen `location_id` NULL, así que un llamador que todavía no
 * conoce su sede recibe bit a bit lo mismo que antes.
 *
 * ⚠️ El filtro se hace EN MEMORIA y no en la consulta, y no es por comodidad:
 * la regla es «¿esta sede definió ALGUNO?», que no se puede contestar mirando
 * una fila a la vez. Un `.or(location_id.is.null,location_id.eq.X)` traería las
 * dos familias mezcladas y el llamador tendría que volver a decidir — que es
 * justo lo que esta función existe para que no pase.
 */
export async function getAllTiers(
  tenantId: string,
  locationId?: string | null
): Promise<RewardTier[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('reward_tiers')
    .select('*')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`Error obteniendo tiers: ${error.message}`)
  }

  return elegirFilasDeSede(data ?? [], locationId)
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
  currentPoints: number,
  tenantId: string
): Promise<RewardTier | null> {
  const tiers = await getAllTiers(tenantId)
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
export async function getNextTier(currentPoints: number, tenantId: string): Promise<{
  tier: RewardTier
  pointsRemaining: number
} | null> {
  const tiers = await getAllTiers(tenantId)
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
export async function getCurrentTier(currentPoints: number, tenantId: string): Promise<RewardTier | null> {
  const tiers = await getAllTiers(tenantId)
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
export async function buildTiersRoadmap(currentPoints: number, tenantId: string): Promise<string> {
  const tiers = await getAllTiers(tenantId)
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
