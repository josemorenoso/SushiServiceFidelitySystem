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

/** Un reclamo tal como quedó sellado en `mystery_box_results` (00059 §2). */
export interface ReclamoDeNivel {
  claimed_tier_key: string | null
  claimed_threshold: number | null
}

/** Lo mínimo que hay que saber de un nivel para decidir si ya se reclamó. */
export interface NivelReclamable {
  tier_key?: string | null
  point_threshold: number
}

/**
 * De los niveles que el cliente YA superó, devuelve el de mayor umbral que
 * todavía **no reclamó** — o `undefined` si los reclamó todos.
 *
 * POR QUÉ ESTA FUNCIÓN EXISTE (el regalo masivo de premios)
 * ─────────────────────────────────────────────────────────
 * Hasta la 00059 el «ya reclamé» se llevaba por `tier_id`, o sea por el id de la
 * FILA. Y los niveles propios de una sede son COPIAS con ids nuevos: apretar
 * «Darle premios propios a esta sede» le devolvía a los 542 clientes de la marca
 * todos sus niveles «sin reclamar» en esa sede. Un regalo masivo a un botón de
 * distancia (auditoría adversarial 2026-09-09, ESTADO.md §3 punto 0.GAMMA).
 *
 * Un nivel no ES su fila. La fila es dónde vive (marca o sede); el nivel —«el
 * escalón de los 150 puntos de esta marca»— sobrevive a la copia. Un nivel está
 * reclamado si coincide **cualquiera** de las dos claves selladas en el reclamo:
 *
 *   · `tier_key` — la identidad del nivel dentro de la marca, que la copia
 *     HEREDA. Es lo que cierra el regalo por copiado, y además es lo que hace
 *     que editar un umbral no vuelva a ofrecer premio a quien ya lo reclamó.
 *   · `point_threshold` — el umbral cruzado. Cierra el otro camino: crear a mano
 *     los niveles de la sede, sin pasar por «copiar», estrena `tier_key`.
 *
 * En OR y no en AND a propósito: es estrictamente más conservador que cualquiera
 * de las dos solas, y equivocarse hacia «no hay premio» es recuperable (el
 * cliente vuelve a consultar); equivocarse hacia «tomá otro premio» le cuesta
 * plata al restaurante y no se deshace.
 *
 * ORDEN: recibe los niveles superados **en el orden de la escalera** (el de
 * `getAllTiers`, `sort_order` ascendente) y devuelve el ÚLTIMO sin reclamar, que
 * es el de mayor umbral. Es literalmente lo que hacía el `.reverse().find()` que
 * vivía dentro de `/api/check-in/status`.
 *
 * PURA a propósito: es la regla entera del premio que se ofrece, probable sin base.
 */
export function elegirNivelSinReclamar<T extends NivelReclamable>(
  nivelesSuperados: readonly T[],
  reclamos: readonly ReclamoDeNivel[]
): T | undefined {
  const clavesReclamadas = new Set<string>()
  const umbralesReclamados = new Set<number>()
  for (const r of reclamos) {
    if (r.claimed_tier_key) clavesReclamadas.add(r.claimed_tier_key)
    if (typeof r.claimed_threshold === 'number') umbralesReclamados.add(r.claimed_threshold)
  }

  for (let i = nivelesSuperados.length - 1; i >= 0; i--) {
    const nivel = nivelesSuperados[i]
    const reclamado =
      (!!nivel.tier_key && clavesReclamadas.has(nivel.tier_key)) ||
      umbralesReclamados.has(nivel.point_threshold)
    if (!reclamado) return nivel
  }

  return undefined
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
 *
 * `locationId` es OPCIONAL y su ausencia significa «los de la MARCA» (00058).
 * Es lo que hace que este cambio sea compatible hacia atrás con sus llamadores:
 * el que todavía no conoce su sede recibe exactamente lo de antes.
 */
export async function evaluateNewTier(
  previousPoints: number,
  currentPoints: number,
  tenantId: string,
  locationId?: string | null
): Promise<RewardTier | null> {
  const tiers = await getAllTiers(tenantId, locationId)
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
 *
 * `locationId` es OPCIONAL y su ausencia significa «los de la MARCA» (00058).
 * Es lo que hace que este cambio sea compatible hacia atrás con sus llamadores:
 * el que todavía no conoce su sede recibe exactamente lo de antes.
 */
export async function getNextTier(
  currentPoints: number,
  tenantId: string,
  locationId?: string | null
): Promise<{
  tier: RewardTier
  pointsRemaining: number
} | null> {
  const tiers = await getAllTiers(tenantId, locationId)
  const next = tiers.find((t) => t.point_threshold > currentPoints)

  if (!next) return null

  return {
    tier: next,
    pointsRemaining: next.point_threshold - currentPoints,
  }
}

/**
 * Obtiene el tier actual del cliente (el más alto que ya alcanzó).
 *
 * `locationId` es OPCIONAL y su ausencia significa «los de la MARCA» (00058).
 * Es lo que hace que este cambio sea compatible hacia atrás con sus llamadores:
 * el que todavía no conoce su sede recibe exactamente lo de antes.
 */
export async function getCurrentTier(
  currentPoints: number,
  tenantId: string,
  locationId?: string | null
): Promise<RewardTier | null> {
  const tiers = await getAllTiers(tenantId, locationId)
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
 *
 * `locationId` es OPCIONAL y su ausencia significa «los de la MARCA» (00058).
 * Es lo que hace que este cambio sea compatible hacia atrás con sus llamadores:
 * el que todavía no conoce su sede recibe exactamente lo de antes.
 */
export async function buildTiersRoadmap(
  currentPoints: number,
  tenantId: string,
  locationId?: string | null
): Promise<string> {
  const tiers = await getAllTiers(tenantId, locationId)
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
 * Escribe `customers.current_tier` — **el nivel es de la MARCA**.
 *
 * LA DECISIÓN Y SU PORQUÉ (2026-09-09, salida «b» del punto 0.GAMMA)
 * ─────────────────────────────────────────────────────────────────
 * `current_tier` es UNA sola columna y hasta hoy la escribía el nombre del nivel
 * que el cliente acababa de cruzar **en la sede donde estaba**. Con escaleras
 * distintas por sede eso queda incoherente y, peor, puede RETROCEDER de nombre
 * mientras el cliente SUBE de puntos: cruza «Oro» en Laureles (600 pts) y a la
 * semana cruza «Plata» en Envigado, que allá vale 700 — y la tarjeta lo degrada.
 *
 * Las dos salidas posibles eran dejar de persistirlo y derivarlo siempre, o
 * declarar que el nivel es de la marca. Se elige la segunda:
 *
 *   · **Es lo que el producto ya dice.** Un negocio con varios locales es UNA
 *     marca que comparte clientes y puntos (AIOS v1.6.0/v1.9.0, `site_model`).
 *     `total_points` es uno solo para todas las sedes; el nivel que sale de esos
 *     puntos también tiene que ser uno solo, o la tarjeta del cliente diría una
 *     cosa distinta según por qué puerta entró.
 *   · **Dejar de persistirlo rompe algo que no es mío.** `/api/dashboard/reward-tiers`
 *     (DELETE) cuenta clientes por `current_tier = tier_name` para decidir entre
 *     desactivar y BORRAR de verdad un nivel. Con la columna vacía ese conteo da
 *     cero, el borrado duro se habilita y el `ON DELETE CASCADE` de `tier_id`
 *     (00013:69) se lleva por delante los `mystery_box_results` — que es la
 *     prueba de qué premios se entregaron.
 *
 * Lo que la sede SÍ sigue gobernando es qué premio se ofrece y con qué umbral:
 * eso es `getAllTiers(tenantId, locationId)` y no cambia. Lo único de la marca
 * es cómo se LLAMA el nivel del cliente.
 *
 * `tierName` (el nivel de la sede, que es lo que el llamador acaba de calcular)
 * queda como respaldo para dos casos en los que no hay respuesta de marca: que
 * la marca no tenga ningún nivel propio —todos viven en sedes— o que la base
 * falle al derivarlo. Antes que dejar la columna quieta, se escribe lo que se
 * sabe.
 */
export async function updateCustomerTier(customerId: string, tierName: string): Promise<void> {
  const supabase = getServiceClient()

  let nombre = tierName
  try {
    const { data: cliente, error: clienteError } = await supabase
      .from('customers')
      .select('tenant_id, total_points')
      .eq('id', customerId)
      .maybeSingle()

    if (clienteError) {
      console.error(
        `[RewardTiers] No se pudo leer el cliente para derivar su nivel de marca: ${clienteError.message}`
      )
    } else if (cliente?.tenant_id) {
      const deLaMarca = await getCurrentTier(cliente.total_points ?? 0, cliente.tenant_id)
      if (deLaMarca) nombre = deLaMarca.tier_name
    }
  } catch (e) {
    console.error('[RewardTiers] Error derivando el nivel de marca:', e)
  }

  const { error } = await supabase
    .from('customers')
    .update({ current_tier: nombre })
    .eq('id', customerId)

  if (error) {
    console.error(`[RewardTiers] Error actualizando tier: ${error.message}`)
  }
}
