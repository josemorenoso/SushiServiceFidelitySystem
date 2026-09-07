/** @deprecated Milestones legacy — el nuevo sistema usa reward_tiers con point_threshold. */
export const VISIT_MILESTONES = [3, 5, 7] as const

export const REACTIVATION_DAYS = 21

/** Días de inactividad para reactivación agresiva (segundo toque). */
export const REACTIVATION_AGGRESSIVE_DAYS = 25

/** Mínimo de días entre mensajes de marketing por cliente (aplica a todos los canales) */
export const FREQUENCY_CAP_DAYS = 7

/** Días que la Recovery Zone abre ANTES del toque suave.
 *
 *  El margen existe porque el cron corre una vez al día: sin él, un cliente que
 *  cae en el día del toque suave podría recibir una campaña manual esa misma
 *  mañana y el toque suave por la tarde. Tres días de colchón lo evitan. */
export const RECOVERY_ZONE_LEAD_DAYS = 3

/** Zona de recuperación: clientes en este rango están reservados para el cron de reactivación.
 *  Las campañas manuales los excluyen automáticamente para no interrumpir el flujo personalizado.
 *
 *  Se DERIVA de los días de reactivación configurados por tenant en `admin_settings`
 *  (`reactivation_soft_days` / `reactivation_aggressive_days`) vía `deriveRecoveryZone()`.
 *  Si el tenant baja el toque suave a 15, la zona baja con él — si no, los días 15-17
 *  quedarían desprotegidos y una campaña manual pisaría el mensaje del cron.
 *
 *  Estas dos constantes son solo el FALLBACK con los defaults (21 / 25). No se usan
 *  para decidir a quién se le manda: para eso está `getRecoveryZoneConfig(tenantId)`. */
export const RECOVERY_ZONE_START_DAYS = 18
export const RECOVERY_ZONE_END_DAYS = 25

export interface RecoveryZone {
  startDays: number
  endDays: number
}

/** La zona por defecto, para llamadas sin tenant a mano. */
export const DEFAULT_RECOVERY_ZONE: RecoveryZone = {
  startDays: RECOVERY_ZONE_START_DAYS,
  endDays: RECOVERY_ZONE_END_DAYS,
}

/**
 * Deriva la ventana reservada al cron a partir de los días de reactivación del tenant.
 *
 * Con los defaults (21 / 25) devuelve exactamente 18-25: la derivación no cambia
 * el comportamiento de ningún tenant que no haya tocado sus días.
 *
 * `startDays` nunca baja de `FREQUENCY_CAP_DAYS`: por debajo del cap el cliente ya
 * está protegido por otra regla y la "ventana manual" desaparecería.
 * `endDays` nunca queda por debajo de `startDays` (zona vacía).
 */
/**
 * Normaliza los valores crudos de `admin_settings` a los días efectivos.
 *
 * Vive acá y no en `settings.service.ts` porque la tarjeta del ciclo de
 * recuperación (cliente) tiene que llegar al MISMO número que el cron
 * (servidor). Con dos copias de la regla, la pantalla terminaría anunciando un
 * día distinto del que se envía.
 */
export function normalizeReactivationDays(
  rawSoft: string | number | undefined | null,
  rawAggressive: string | number | undefined | null
): { softDays: number; aggressiveDays: number } {
  const parsePositive = (value: string | number | undefined | null, fallback: number): number => {
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? n : fallback
  }

  const softDays = parsePositive(rawSoft, REACTIVATION_DAYS)
  let aggressiveDays = parsePositive(rawAggressive, REACTIVATION_AGGRESSIVE_DAYS)

  // La agresiva siempre debe ser posterior a la suave.
  if (aggressiveDays <= softDays) {
    aggressiveDays = softDays + 4
  }

  return { softDays, aggressiveDays }
}

export function deriveRecoveryZone(softDays: number, aggressiveDays: number): RecoveryZone {
  const startDays = Math.max(FREQUENCY_CAP_DAYS, softDays - RECOVERY_ZONE_LEAD_DAYS)
  const endDays = Math.max(aggressiveDays, startDays)
  return { startDays, endDays }
}

/** Máximo de mensajes de marketing que puede recibir un cliente en el mes en curso.
 *  Cuenta: manual + calendar + reactivation.
 *  NO cuenta: birthday (prioridad absoluta) ni utility templates que reaccionan al scan. */
export const MONTHLY_MARKETING_CAP = 3

/** Sources de campaign que consumen cupo del MONTHLY_MARKETING_CAP.
 *
 *  `reward_reminder` (el aviso de "tu premio vence en N días") SÍ consume cupo: es
 *  marketing. Pero está EXENTO del FREQUENCY_CAP_DAYS de 7 días — si no, con ventanas de
 *  premio de 5-7 días (las que generan urgencia real) el recordatorio no se enviaría nunca.
 *  Ref: docs/features/reward-grants.md, decisión D5. */
export const MONTHLY_CAP_SOURCES = ['manual', 'calendar', 'reactivation', 'reward_reminder'] as const

// ═══════════════════════════════════════════════════════════════
// Premios otorgados (reward_grants, migración 00031)
// ═══════════════════════════════════════════════════════════════

/** Días de ventana del premio de reactivación agresiva, desde el envío.
 *
 *  Es un reloj INDEPENDIENTE de REACTIVATION_AGGRESSIVE_DAYS: subir la reactivación
 *  agresiva de 25 a 45 días no toca la ventana del premio. Configurable por tenant en
 *  `admin_settings.aggressive_reward_window_days`. */
export const DEFAULT_AGGRESSIVE_REWARD_WINDOW_DAYS = 7

/** Cuántos días antes del vencimiento se manda el recordatorio.
 *  Configurable por tenant en `admin_settings.reward_reminder_days_before`. */
export const DEFAULT_REWARD_REMINDER_DAYS_BEFORE = 2

/** Días antes de un evento del calendario en los que se bloquean campañas manuales
 *  conflictivas para reservar cupo del cap mensual. */
export const DEFAULT_PRE_EVENT_BLACKOUT_DAYS = 5

// ═══════════════════════════════════════════════════════════════
// Reseñas de Google (Bloque 3, migración 00032)
// ═══════════════════════════════════════════════════════════════

/** Días de ventana del premio por dejar reseña, desde el click al link.
 *
 *  El flujo esperado es que lo redima en la MISMA visita (el cliente está en el local
 *  cuando deja la reseña), pero si se va, el premio no debe quedar vivo para siempre
 *  inflando el contador de "activos". Configurable en `admin_settings.review_reward_window_days`. */
export const DEFAULT_REVIEW_REWARD_WINDOW_DAYS = 30

/** Ventana de deduplicación del evento `shown`.
 *
 *  Recargar la pantalla de éxito no debe contar como una segunda impresión: si lo hiciera,
 *  el denominador del funnel se infla y la tasa de conversión miente hacia abajo. */
export const REVIEW_SHOWN_DEDUPE_HOURS = 12

export const VISIT_SOURCES = {
  QR: 'qr',
  DELIVERY: 'delivery',
} as const

// ═══════════════════════════════════════════════════════════════
// Sistema de Puntos + Mystery Box (v1.0.0)
// ═══════════════════════════════════════════════════════════════

/** Rango default de puntos aleatorios por visita. Configurable vía admin_settings.
 *  Visita 1 siempre da 60-90 (alto, crea ilusión de que 2 visitas bastan).
 *  Visita 2 se limita automáticamente para dejar al cliente 5-30 pts corto del umbral.
 *  Visita 3 garantiza cruzar el umbral. */
export const DEFAULT_POINTS_PER_VISIT_MIN = 60
export const DEFAULT_POINTS_PER_VISIT_MAX = 90

/** Mínimo y máximo de puntos que le faltan al cliente tras la visita "limitadora".
 *  Ej: con SHORTFALL_MIN=5, SHORTFALL_MAX=30, tras la 2da visita el cliente
 *  queda entre 5 y 30 puntos por debajo del umbral → obliga 3ra visita. */
export const DEFAULT_POINTS_SHORTFALL_MIN = 5
export const DEFAULT_POINTS_SHORTFALL_MAX = 30

/** Mínimo de puntos que una visita puede dar (para no verse sospechoso). */
export const MINIMUM_VISIBLE_POINTS = 15

// ═══════════════════════════════════════════════════════════════
// Calibrador de puntos (Bloque 2)
// ═══════════════════════════════════════════════════════════════

/** Cuánto más generoso es el bono de bienvenida que una visita normal.
 *
 *  Reproduce los defaults actuales (bono ~82 sobre visitas ~75) y es lo que conserva el
 *  Endowed Progress Effect a cualquier escala: si el calibrador baja los puntos por visita,
 *  el bono baja con ellos pero sigue siendo el número más alto que el cliente ve. */
export const CALIBRATOR_WELCOME_FACTOR = 1.1

/** Amplitud del rango aleatorio alrededor del promedio, como fracción.
 *  0.2 sobre un promedio de 75 reproduce el 60-90 default. */
export const CALIBRATOR_VISIT_SPREAD = 0.2

/** Amplitud del rango del bono. 0.1 sobre un promedio de 82 reproduce el 75-90 default. */
export const CALIBRATOR_WELCOME_SPREAD = 0.1

/** Metas de visitas que el dueño puede pedir. Menos de 3 mata el near-miss; más de 10 es
 *  una fidelización que ningún cliente aguanta. */
export const CALIBRATOR_MIN_VISITS = 3
export const CALIBRATOR_MAX_VISITS = 10

/** Horizonte de la simulación. Si el premio no cae aquí dentro, la config es inservible. */
export const CALIBRATOR_MAX_SIMULATED_VISITS = 12

/** Puntos de bienvenida al registrarse — mínimo del rango (Endowed Progress Effect). */
export const DEFAULT_WELCOME_BONUS_POINTS = 75

/** Puntos de bienvenida al registrarse — máximo del rango. */
export const DEFAULT_WELCOME_BONUS_POINTS_MAX = 90

/** Puntos bonus por asistir a un evento del calendario. */
export const DEFAULT_EVENT_BONUS_POINTS = 25

/** Rachas consecutivas de premio bajo antes de activar Golden Box. */
export const DEFAULT_PITY_TIMER_THRESHOLD = 2

/** Sources válidos para point_transactions. */
export const POINT_SOURCES = {
  VISIT_QR: 'visit_qr',
  VISIT_DELIVERY: 'visit_delivery',
  EVENT_BONUS: 'event_bonus',
  CAMPAIGN_BONUS: 'campaign_bonus',
  WELCOME_BONUS: 'welcome_bonus',
  ADMIN_ADJUSTMENT: 'admin_adjustment',
} as const
