/**
 * Motor de puntos — cálculo PURO, sin I/O.
 *
 * Lo importan dos consumidores que no pueden compartir código de servidor:
 *   1. `src/services/points.service.ts` (producción, en el servidor).
 *   2. `src/components/dashboard/PointsCalibrator.tsx` (simulación, en el navegador).
 *
 * Por eso este módulo NO puede importar nada de Supabase ni tocar la red: el componente
 * de cliente arrastraría el SDK entero al bundle del navegador.
 *
 * El simulador del dashboard NO es una copia del algoritmo: llama a las mismas funciones
 * que producción, inyectando `rng = () => 0.5` para volverlas determinísticas (el "cliente
 * mediano"). Si el algoritmo cambia, la tabla que ve el dueño cambia con él.
 *
 * Ref: docs/superpowers/specs/2026-07-12-points-calibrator-design.md
 */

import {
  DEFAULT_POINTS_SHORTFALL_MIN,
  DEFAULT_POINTS_SHORTFALL_MAX,
  MINIMUM_VISIBLE_POINTS,
  CALIBRATOR_WELCOME_FACTOR,
  CALIBRATOR_VISIT_SPREAD,
  CALIBRATOR_WELCOME_SPREAD,
  CALIBRATOR_MIN_VISITS,
  CALIBRATOR_MAX_VISITS,
  CALIBRATOR_MAX_SIMULATED_VISITS,
} from '@/constants/rewards'

/** Los seis números que definen el comportamiento del sistema de puntos. */
export interface PointsEngineConfig {
  visitMin: number
  visitMax: number
  welcomeMin: number
  welcomeMax: number
  shortfallMin: number
  shortfallMax: number
}

/** Fuente de azar inyectable. Devuelve [0, 1). Default: Math.random. */
export type Rng = () => number

// ═══════════════════════════════════════════════════════════════
// Saneamiento
// ═══════════════════════════════════════════════════════════════

/**
 * Los valores llegan de `admin_settings`, una tabla key-value de strings que el dueño edita
 * a mano. Una config corrupta (invertida, negativa, NaN) no puede reventar un check-in ni
 * otorgar puntos negativos: se cae a algo válido.
 */
export function sanitizeConfig(cfg: PointsEngineConfig): PointsEngineConfig {
  const positive = (n: number, fallback: number): number =>
    Number.isFinite(n) && n > 0 ? Math.round(n) : fallback

  const visitMin = positive(cfg.visitMin, MINIMUM_VISIBLE_POINTS)
  const visitMax = Math.max(positive(cfg.visitMax, MINIMUM_VISIBLE_POINTS), visitMin)

  const welcomeMin = Math.max(positive(cfg.welcomeMin, 0), 0)
  const welcomeMax = Math.max(positive(cfg.welcomeMax, 0), welcomeMin)

  const shortfallMin = positive(cfg.shortfallMin, DEFAULT_POINTS_SHORTFALL_MIN)
  const shortfallMax = Math.max(positive(cfg.shortfallMax, DEFAULT_POINTS_SHORTFALL_MAX), shortfallMin)

  return { visitMin, visitMax, welcomeMin, welcomeMax, shortfallMin, shortfallMax }
}

// ═══════════════════════════════════════════════════════════════
// El algoritmo (producción)
// ═══════════════════════════════════════════════════════════════

/**
 * Puntos aleatorios con distribución triangular (sesgo hacia el centro del rango).
 * Con `rng` fijo en 0.5 devuelve exactamente el promedio del rango — es lo que hace
 * determinística la simulación sin duplicar el algoritmo.
 */
function randomTriangular(min: number, max: number, rng: Rng): number {
  const u = rng()
  const avg = (min + max) / 2
  if (u < 0.5) {
    return Math.round(min + Math.sqrt(u * 2) * (avg - min))
  }
  return Math.round(max - Math.sqrt((1 - u) * 2) * (max - avg))
}

/**
 * Algoritmo inteligente de puntos por visita.
 *
 * El near-miss es RELATIVO a la distancia al umbral, no a un número de visitas: por eso el
 * sistema se autoajusta a cualquier configuración de puntos sin tocar la mecánica.
 *
 * CASO 1 — Lejos: ni con el máximo cruza → puntos generosos, el cliente se emociona.
 * CASO 2 — Podría cruzar: se LIMITA para dejarlo `shortfall` puntos corto → "casi lo logras".
 * CASO 3 — Ya está dentro de la banda del shortfall: se le garantiza cruzar → PREMIO.
 *
 * @param currentPoints - Puntos del cliente ANTES de esta visita.
 * @param nextThreshold - Umbral del próximo tier.
 * @param config        - Los seis números del sistema (se sanean aquí dentro).
 * @param rng           - Fuente de azar. Inyectable para simular. Default: Math.random.
 */
export function generateSmartVisitPoints(
  currentPoints: number,
  nextThreshold: number,
  config: PointsEngineConfig,
  rng: Rng = Math.random
): number {
  const cfg = sanitizeConfig(config)
  const remaining = nextThreshold - currentPoints

  // CASO 1: Lejos del umbral — ni con el máximo llega → dar puntos altos (emocionante)
  if (remaining > cfg.visitMax) {
    return randomTriangular(cfg.visitMin, cfg.visitMax, rng)
  }

  // CASO 2: Podría cruzar con esta visita — LIMITAR para dejarlo corto
  if (remaining > cfg.shortfallMax) {
    const shortfall = cfg.shortfallMin +
      Math.floor(rng() * (cfg.shortfallMax - cfg.shortfallMin + 1))
    let target = remaining - shortfall
    // Piso: no dar menos de MINIMUM_VISIBLE_POINTS (para no verse sospechoso)
    target = Math.max(target, MINIMUM_VISIBLE_POINTS)
    // Techo: no exceder el máximo por visita
    target = Math.min(target, cfg.visitMax)
    return target
  }

  // CASO 3: Ya está dentro de la banda del shortfall (viene de una visita limitadora)
  // → Dar suficiente para cruzar, pero con variación emocionante
  const minToCross = Math.max(remaining, MINIMUM_VISIBLE_POINTS)
  return randomTriangular(minToCross, Math.max(cfg.visitMax, minToCross), rng)
}

/**
 * Bono de bienvenida (Endowed Progress Effect). Se otorga UNA sola vez, en el registro.
 *
 * Ojo: la visita 1 de un cliente nuevo otorga ESTO, no puntos de visita. Es la palanca
 * dominante del sistema — con el default de 75-90 sobre un umbral de 150, más de la mitad
 * del premio se regala antes de que el cliente vuelva una sola vez.
 */
export function generateWelcomeBonusPoints(config: PointsEngineConfig, rng: Rng = Math.random): number {
  const cfg = sanitizeConfig(config)
  if (cfg.welcomeMax <= 0) return 0
  return cfg.welcomeMin + Math.floor(rng() * (cfg.welcomeMax - cfg.welcomeMin + 1))
}

// ═══════════════════════════════════════════════════════════════
// Simulación (dashboard)
// ═══════════════════════════════════════════════════════════════

export interface SimulatedVisit {
  visit: number
  points: number
  /** Puntos totales DESPUÉS de esta visita. */
  accumulated: number
  /** Puntos que le faltan al umbral DESPUÉS de esta visita. 0 si ya cruzó. */
  remaining: number
  /** Visita 1: otorga el bono de bienvenida, no puntos de visita. */
  isWelcome: boolean
  /** Quedó corto pero dentro de la banda del shortfall → "te faltan N, casi lo logras". */
  isNearMiss: boolean
  /** Cruzó el umbral → 🎁 PREMIO. */
  isReward: boolean
}

/** El "cliente mediano": el azar fijado en el centro de cada rango. */
const MEDIAN_RNG: Rng = () => 0.5

/**
 * Recorre el camino completo de un cliente nuevo hasta que gana su primer premio.
 * Corta en cuanto cruza el umbral, o al llegar a `maxVisits` si nunca lo cruza.
 */
export function simulateJourney(
  config: PointsEngineConfig,
  threshold: number,
  opts?: { maxVisits?: number; rng?: Rng }
): SimulatedVisit[] {
  const cfg = sanitizeConfig(config)
  const rng = opts?.rng ?? MEDIAN_RNG
  const maxVisits = opts?.maxVisits ?? CALIBRATOR_MAX_SIMULATED_VISITS

  if (!Number.isFinite(threshold) || threshold <= 0) return []

  const journey: SimulatedVisit[] = []
  let accumulated = 0

  for (let visit = 1; visit <= maxVisits; visit++) {
    const isWelcome = visit === 1
    const points = isWelcome
      ? generateWelcomeBonusPoints(cfg, rng)
      : generateSmartVisitPoints(accumulated, threshold, cfg, rng)

    accumulated += points
    const isReward = accumulated >= threshold
    const remaining = isReward ? 0 : threshold - accumulated

    journey.push({
      visit,
      points,
      accumulated,
      remaining,
      isWelcome,
      isNearMiss: !isReward && remaining <= cfg.shortfallMax,
      isReward,
    })

    if (isReward) break
  }

  return journey
}

/** Con esta config, ¿en qué visita cae el premio? `null` si no cae dentro del horizonte simulado. */
export function deriveRewardVisit(config: PointsEngineConfig, threshold: number): number | null {
  const journey = simulateJourney(config, threshold)
  return journey.find((v) => v.isReward)?.visit ?? null
}

// ═══════════════════════════════════════════════════════════════
// Calibración
// ═══════════════════════════════════════════════════════════════

export interface CalibrationResult {
  /** ¿Se encontró una config que aterriza el premio EXACTAMENTE en la visita pedida? */
  achieved: boolean
  /** La config propuesta. Si `!achieved`, la de la meta alcanzable más cercana. */
  config: PointsEngineConfig
  journey: SimulatedVisit[]
  /** Metas que SÍ tienen solución con este umbral. Para el mensaje de "no es posible". */
  achievableVisits: number[]
}

/**
 * Deriva los seis números a partir de un único grado de libertad: el promedio de puntos por visita.
 *
 * El bono de bienvenida se mantiene proporcionalmente más generoso que una visita normal
 * (`CALIBRATOR_WELCOME_FACTOR`): es lo que conserva el Endowed Progress Effect a cualquier escala.
 * El shortfall NO se toca — es del dueño.
 */
function configFromVisitAverage(
  avg: number,
  shortfall: Pick<PointsEngineConfig, 'shortfallMin' | 'shortfallMax'>
): PointsEngineConfig {
  const welcomeAvg = avg * CALIBRATOR_WELCOME_FACTOR
  return sanitizeConfig({
    visitMin: Math.round(avg * (1 - CALIBRATOR_VISIT_SPREAD)),
    visitMax: Math.round(avg * (1 + CALIBRATOR_VISIT_SPREAD)),
    welcomeMin: Math.round(welcomeAvg * (1 - CALIBRATOR_WELCOME_SPREAD)),
    welcomeMax: Math.round(welcomeAvg * (1 + CALIBRATOR_WELCOME_SPREAD)),
    shortfallMin: shortfall.shortfallMin,
    shortfallMax: shortfall.shortfallMax,
  })
}

/**
 * El buscador: qué configuración aterriza el premio EXACTAMENTE en `targetVisits`.
 *
 * No despeja una fórmula — la fórmula cerrada falla por una visita cuando el cliente aterriza
 * dentro de la banda del shortfall y el algoritmo le inserta un "casi lo logro" extra. Así que
 * barre candidatos, SIMULA cada uno con el algoritmo real, y se queda con el que acierta.
 *
 * Efecto secundario que es en realidad el punto: la tabla que ve el dueño no puede mentirle,
 * porque es el resultado de correr el mismo código que corre en producción.
 */
export function calibrate(
  threshold: number,
  targetVisits: number,
  shortfall: Pick<PointsEngineConfig, 'shortfallMin' | 'shortfallMax'>
): CalibrationResult {
  /** Promedio de puntos por visita → visita en la que cae el premio. */
  const candidatesByVisit = new Map<number, number[]>()

  for (let avg = MINIMUM_VISIBLE_POINTS; avg <= Math.max(threshold, MINIMUM_VISIBLE_POINTS); avg++) {
    const cfg = configFromVisitAverage(avg, shortfall)
    const rewardVisit = deriveRewardVisit(cfg, threshold)
    if (rewardVisit === null) continue
    if (rewardVisit < CALIBRATOR_MIN_VISITS || rewardVisit > CALIBRATOR_MAX_VISITS) continue

    const bucket = candidatesByVisit.get(rewardVisit)
    if (bucket) bucket.push(avg)
    else candidatesByVisit.set(rewardVisit, [avg])
  }

  const achievableVisits = [...candidatesByVisit.keys()].sort((a, b) => a - b)

  // La meta pedida, o la alcanzable más cercana.
  const resolved = candidatesByVisit.has(targetVisits)
    ? targetVisits
    : achievableVisits.reduce<number | null>(
        (best, v) =>
          best === null || Math.abs(v - targetVisits) < Math.abs(best - targetVisits) ? v : best,
        null
      )

  if (resolved === null) {
    // Umbral degenerado (p.ej. tan bajo que el bono ya lo cruza). Devolvemos algo coherente.
    const fallback = configFromVisitAverage(MINIMUM_VISIBLE_POINTS, shortfall)
    return {
      achieved: false,
      config: fallback,
      journey: simulateJourney(fallback, threshold),
      achievableVisits: [],
    }
  }

  // La mediana de la banda que funciona, no su borde: así una edición manual pequeña
  // en Ajustes avanzados no tumba la promesa.
  const candidates = candidatesByVisit.get(resolved) ?? []
  const chosenAvg = candidates[Math.floor(candidates.length / 2)]
  const config = configFromVisitAverage(chosenAvg, shortfall)

  return {
    achieved: resolved === targetVisits,
    config,
    journey: simulateJourney(config, threshold),
    achievableVisits,
  }
}
