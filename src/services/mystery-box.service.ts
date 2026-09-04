import { createClient } from '@supabase/supabase-js'
import type {
  RewardTier,
  MysteryPrize,
  MysteryBoxResult,
  MysteryBoxChoice,
  MysteryBoxGlobalCap,
} from '@/types/database.types'
import { DEFAULT_PITY_TIMER_THRESHOLD } from '@/constants/rewards'
import { getMultipleSettings } from '@/services/settings.service'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

// ═══════════════════════════════════════════════════════════════
// Pity Timer
// ═══════════════════════════════════════════════════════════════

/**
 * Determina si el cliente tiene el Pity Timer activo (Golden Box).
 * Se activa cuando ha recibido N veces seguidas el premio del tier más bajo.
 */
export async function isPityTimerActive(customerId: string, tenantId: string): Promise<boolean> {
  const supabase = getServiceClient()

  const { data: customer, error } = await supabase
    .from('customers')
    .select('mystery_box_low_streak')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Devolver `false` ante un fallo le quita al cliente la Golden Box que ya se había
  // ganado por acumular premios bajos, sin dejar rastro. Se registra; la dirección del
  // fallback se mantiene (no regalar una Golden Box que quizá no corresponde).
  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'MysteryBox',
      reason: 'pity_streak_lookup_error',
      error,
      context: { tenant_id: tenantId, customer_id: customerId },
    })
    return false
  }

  if (!customer) return false

  const settings = await getMultipleSettings(['pity_timer_threshold'], tenantId)
  const threshold = parseInt(
    settings.pity_timer_threshold ?? String(DEFAULT_PITY_TIMER_THRESHOLD),
    10
  )

  return customer.mystery_box_low_streak >= threshold
}

/**
 * Actualiza el streak de premios bajos del cliente.
 * Si ganó el premio del tier más bajo (index 0), incrementa.
 * Si ganó algo mejor, resetea a 0.
 */
async function updateLowStreak(customerId: string, prizeIndex: number): Promise<void> {
  const supabase = getServiceClient()

  if (prizeIndex === 0) {
    // Incrementar streak.
    //
    // Leer-modificar-escribir sobre un valor que puede venir de un fallo: con `data = null`
    // el `?? 0` escribía 1 y BORRABA el streak real. Un cliente que llevaba 4 premios bajos
    // seguidos volvía a empezar de cero y su Golden Box se alejaba, en silencio. Ante un
    // fallo no se escribe nada: dejar el contador como está es siempre mejor que pisarlo.
    const { data, error } = await supabase
      .from('customers')
      .select('mystery_box_low_streak')
      .eq('id', customerId)
      .maybeSingle()

    if (isDbFailure(error)) {
      logDbFailure({
        scope: 'MysteryBox',
        reason: 'low_streak_lookup_error',
        error,
        context: { customer_id: customerId },
      })
      return
    }

    const { error: upError } = await supabase
      .from('customers')
      .update({ mystery_box_low_streak: (data?.mystery_box_low_streak ?? 0) + 1 })
      .eq('id', customerId)
    if (upError) {
      logDbFailure({
        scope: 'MysteryBox',
        reason: 'low_streak_increment_error',
        error: upError,
        context: { customer_id: customerId },
      })
    }
  } else {
    // Resetear streak (ganó algo mejor)
    const { error: upError } = await supabase
      .from('customers')
      .update({ mystery_box_low_streak: 0 })
      .eq('id', customerId)
    if (upError) {
      logDbFailure({
        scope: 'MysteryBox',
        reason: 'low_streak_reset_error',
        error: upError,
        context: { customer_id: customerId },
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Global Caps
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica y resetea los global caps cuyo período expiró.
 */
async function refreshGlobalCaps(tierId: string): Promise<MysteryBoxGlobalCap[]> {
  const supabase = getServiceClient()
  const now = new Date()

  const { data: caps, error } = await supabase
    .from('mystery_box_global_caps')
    .select('*')
    .eq('tier_id', tierId)

  if (error || !caps) return []

  for (const cap of caps) {
    const periodStart = new Date(cap.period_start)
    let shouldReset = false

    if (cap.period === 'week') {
      const weekMs = 7 * 24 * 60 * 60 * 1000
      shouldReset = now.getTime() - periodStart.getTime() >= weekMs
    } else if (cap.period === 'month') {
      shouldReset =
        now.getMonth() !== periodStart.getMonth() ||
        now.getFullYear() !== periodStart.getFullYear()
    }
    // 'total' never resets

    if (shouldReset) {
      const { error: resetError } = await supabase
        .from('mystery_box_global_caps')
        .update({ current_count: 0, period_start: now.toISOString() })
        .eq('id', cap.id)

      // Si el reinicio no se persiste, el objeto en memoria dice 0 y la base sigue en el
      // tope: este cliente recibe el premio limitado y el siguiente vuelve a encontrarlo
      // agotado. Se registra en vez de mutar como si hubiera funcionado.
      if (resetError) {
        logDbFailure({
          scope: 'MysteryBox',
          reason: 'global_cap_reset_error',
          error: resetError,
          context: { cap_id: cap.id, tier_id: tierId },
        })
        continue
      }

      cap.current_count = 0
      cap.period_start = now.toISOString()
    }
  }

  return caps
}

/**
 * Ajusta las probabilidades de los premios según los global caps.
 * Si un premio alcanzó su cap, redistribuye su probabilidad al tier inferior.
 */
export function adjustProbabilitiesForCaps(
  prizes: MysteryPrize[],
  caps: MysteryBoxGlobalCap[]
): MysteryPrize[] {
  if (caps.length === 0) return prizes

  const adjusted = prizes.map((p) => ({ ...p }))

  for (const cap of caps) {
    if (cap.current_count >= cap.max_per_period) {
      // Este premio está capeado — redistribuir su probabilidad
      const cappedIdx = adjusted.findIndex((p) => p.title === cap.prize_title)
      if (cappedIdx === -1) continue

      const cappedProb = adjusted[cappedIdx].probability
      adjusted[cappedIdx].probability = 0

      // Redistribuir al premio inmediato inferior (o al primero si es el más bajo)
      const redistributeIdx = cappedIdx > 0 ? cappedIdx - 1 : 0
      if (redistributeIdx !== cappedIdx) {
        adjusted[redistributeIdx].probability += cappedProb
      }
    }
  }

  return adjusted.filter((p) => p.probability > 0)
}

/**
 * Incrementa el global cap counter de un premio específico.
 */
async function incrementGlobalCap(tierId: string, prizeTitle: string): Promise<void> {
  const supabase = getServiceClient()

  const { data: cap, error } = await supabase
    .from('mystery_box_global_caps')
    .select('id, current_count')
    .eq('tier_id', tierId)
    .eq('prize_title', prizeTitle)
    .maybeSingle()

  // Este contador es el que impide regalar más unidades de un premio de las que el
  // restaurante puso. Si la lectura o el incremento fallan en silencio, el tope no se
  // mueve y el premio se puede entregar indefinidamente.
  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'MysteryBox',
      reason: 'global_cap_lookup_error',
      error,
      context: { tier_id: tierId, prize: prizeTitle },
    })
    return
  }

  if (cap) {
    const { error: upError } = await supabase
      .from('mystery_box_global_caps')
      .update({ current_count: cap.current_count + 1 })
      .eq('id', cap.id)
    if (upError) {
      logDbFailure({
        scope: 'MysteryBox',
        reason: 'global_cap_increment_error',
        error: upError,
        context: { cap_id: cap.id, tier_id: tierId, prize: prizeTitle },
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Mystery Box Resolution
// ═══════════════════════════════════════════════════════════════

/**
 * Selecciona un premio basado en probabilidades ponderadas.
 */
export function selectPrize(prizes: MysteryPrize[]): { prize: MysteryPrize; index: number } {
  const totalProb = prizes.reduce((sum, p) => sum + p.probability, 0)
  let random = Math.random() * totalProb
  
  for (let i = 0; i < prizes.length; i++) {
    random -= prizes[i].probability
    if (random <= 0) {
      return { prize: prizes[i], index: i }
    }
  }

  // Fallback al último
  return { prize: prizes[prizes.length - 1], index: prizes.length - 1 }
}

/**
 * Aplica Golden Box: elimina el prize del tier más bajo (index 0).
 * Redistribuye su probabilidad proporcionalmente entre los demás.
 */
export function applyGoldenBox(prizes: MysteryPrize[]): MysteryPrize[] {
  if (prizes.length <= 1) return prizes

  const lowest = prizes[0]
  const rest = prizes.slice(1)
  const totalRestProb = rest.reduce((sum, p) => sum + p.probability, 0)

  // Redistribuir proporcional
  return rest.map((p) => ({
    ...p,
    probability: Math.round(p.probability + (lowest.probability * p.probability) / totalRestProb),
  }))
}

export interface MysteryBoxResolveResult {
  /** id del registro en mystery_box_results — necesario para vincular la redención física */
  resultId: string | null
  choice: MysteryBoxChoice
  prizeTitle: string
  prizeEmoji: string
  prizeIndex: number
  wasGolden: boolean
  allPrizes: MysteryPrize[]
  effectivePrizes: MysteryPrize[]
}

/**
 * Resuelve el resultado de la Mystery Box o del premio safe.
 * Registra el resultado en la DB, actualiza streaks y caps.
 */
export async function resolveMysteryBox(params: {
  customerId: string
  tier: RewardTier
  choice: MysteryBoxChoice
  tenantId: string
}): Promise<MysteryBoxResolveResult> {
  const supabase = getServiceClient()
  const { customerId, tier, choice, tenantId } = params

  // Si eligió safe
  if (choice === 'safe') {
    // Registrar en mystery_box_results
    // ⚠️ Esta fila ES el registro de que el cliente reclamó su premio. `/api/check-in/status`
    // la usa para decidir qué tier sigue "sin reclamar": si el INSERT falla en silencio, el
    // cliente ve su premio en pantalla, nadie lo anota, y en el siguiente sondeo el mismo
    // tier vuelve a aparecer como disponible. Doble premio, sin una línea de log.
    const { data: inserted, error: insertError } = await supabase
      .from('mystery_box_results')
      .insert({
        customer_id: customerId,
        tier_id: tier.id,
        tenant_id: tenantId,
        choice: 'safe',
        prize_title: tier.safe_reward_title,
        prize_tier_index: -1,
        was_golden: false,
      })
      .select('id')
      .single()

    if (insertError) {
      logDbFailure({
        scope: 'MysteryBox',
        reason: 'result_insert_error_safe',
        error: insertError,
        context: { tenant_id: tenantId, customer_id: customerId, tier_id: tier.id },
      })
      throw new Error(`No se pudo registrar el premio elegido: ${insertError.message}`)
    }

    return {
      resultId: inserted?.id ?? null,
      choice: 'safe',
      prizeTitle: tier.safe_reward_title,
      prizeEmoji: '🎁',
      prizeIndex: -1,
      wasGolden: false,
      allPrizes: tier.mystery_prizes,
      effectivePrizes: tier.mystery_prizes,
    }
  }

  // Mystery box flow
  const isGolden = await isPityTimerActive(customerId, tenantId)
  let effectivePrizes = [...tier.mystery_prizes]

  // Aplicar Golden Box si corresponde
  if (isGolden && effectivePrizes.length > 1) {
    effectivePrizes = applyGoldenBox(effectivePrizes)
  }

  // Verificar global caps
  const caps = await refreshGlobalCaps(tier.id)
  if (caps.length > 0) {
    effectivePrizes = adjustProbabilitiesForCaps(effectivePrizes, caps)
  }

  // Seleccionar premio
  const { prize, index } = selectPrize(effectivePrizes)

  // Encontrar el índice real en el array original (para pity timer)
  const originalIndex = tier.mystery_prizes.findIndex((p) => p.title === prize.title)

  // Registrar resultado
  // Mismo caso que el INSERT de "safe": sin esta fila el premio no existe para el sistema
  // y el tier se vuelve a ofrecer. Se lanza ANTES de tocar el streak y los caps, para no
  // dejar los contadores movidos por un premio que no quedó registrado.
  const { data: insertedMystery, error: insertMysteryError } = await supabase
    .from('mystery_box_results')
    .insert({
      customer_id: customerId,
      tier_id: tier.id,
      tenant_id: tenantId,
      choice: 'mystery',
      prize_title: prize.title,
      prize_tier_index: originalIndex,
      was_golden: isGolden,
    })
    .select('id')
    .single()

  if (insertMysteryError) {
    logDbFailure({
      scope: 'MysteryBox',
      reason: 'result_insert_error_mystery',
      error: insertMysteryError,
      context: { tenant_id: tenantId, customer_id: customerId, tier_id: tier.id, prize: prize.title },
    })
    throw new Error(`No se pudo registrar el premio de la Mystery Box: ${insertMysteryError.message}`)
  }

  // Actualizar pity timer streak
  await updateLowStreak(customerId, originalIndex)

  // Si fue golden box, resetear streak (ya se usó el pity timer)
  if (isGolden) {
    const { error: goldenResetError } = await supabase
      .from('customers')
      .update({ mystery_box_low_streak: 0 })
      .eq('id', customerId)
    if (goldenResetError) {
      logDbFailure({
        scope: 'MysteryBox',
        reason: 'golden_streak_reset_error',
        error: goldenResetError,
        context: { customer_id: customerId },
      })
    }
  }

  // Incrementar global cap si aplica
  await incrementGlobalCap(tier.id, prize.title)

  return {
    resultId: insertedMystery?.id ?? null,
    choice: 'mystery',
    prizeTitle: prize.title,
    prizeEmoji: prize.emoji,
    prizeIndex: index,
    wasGolden: isGolden,
    allPrizes: tier.mystery_prizes,
    effectivePrizes,
  }
}

/**
 * Genera texto de near-miss para el resultado de la mystery box.
 * Siempre referencia el premio más alto que NO se ganó.
 */
export function generateNearMissText(
  wonPrize: MysteryPrize,
  allPrizes: MysteryPrize[]
): string | null {
  // Encontrar el premio más alto (último en el array, mayor index = mejor)
  const topPrize = allPrizes[allPrizes.length - 1]

  if (topPrize.title === wonPrize.title) {
    // Ganó el mejor — no hay near-miss, es victoria
    return null
  }

  return `Estuviste a un pelo de ${topPrize.emoji} ${topPrize.title}`
}

/**
 * Obtiene los últimos resultados de mystery box de un cliente.
 */
export async function getRecentResults(
  customerId: string,
  limit: number = 5
): Promise<MysteryBoxResult[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('mystery_box_results')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(`[MysteryBox] Error obteniendo resultados: ${error.message}`)
    return []
  }

  return data ?? []
}
