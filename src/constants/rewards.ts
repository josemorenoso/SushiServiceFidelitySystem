/** @deprecated Milestones legacy — el nuevo sistema usa reward_tiers con point_threshold. */
export const VISIT_MILESTONES = [3, 5, 7] as const

export const REACTIVATION_DAYS = 21

/** Días de inactividad para reactivación agresiva (segundo toque). */
export const REACTIVATION_AGGRESSIVE_DAYS = 25

/** Mínimo de días entre mensajes de marketing por cliente (aplica a todos los canales) */
export const FREQUENCY_CAP_DAYS = 7

/** Zona de recuperación: clientes en este rango están reservados para el cron de reactivación.
 *  Las campañas manuales los excluyen automáticamente para no interrumpir el flujo personalizado. */
export const RECOVERY_ZONE_START_DAYS = 18
export const RECOVERY_ZONE_END_DAYS = 25

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
