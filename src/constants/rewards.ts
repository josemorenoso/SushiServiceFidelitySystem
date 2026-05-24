export const VISIT_MILESTONES = [3, 5, 7] as const

export const REACTIVATION_DAYS = 21

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

/** Sources de campaign que consumen cupo del MONTHLY_MARKETING_CAP. */
export const MONTHLY_CAP_SOURCES = ['manual', 'calendar', 'reactivation'] as const

/** Días antes de un evento del calendario en los que se bloquean campañas manuales
 *  conflictivas para reservar cupo del cap mensual. */
export const DEFAULT_PRE_EVENT_BLACKOUT_DAYS = 5

export const VISIT_SOURCES = {
  QR: 'qr',
  DELIVERY: 'delivery',
} as const
