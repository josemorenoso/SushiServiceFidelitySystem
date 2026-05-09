export const VISIT_MILESTONES = [3, 5, 7] as const

export const REACTIVATION_DAYS = 21

/** Mínimo de días entre mensajes de marketing por cliente (aplica a todos los canales) */
export const FREQUENCY_CAP_DAYS = 7

/** Zona de recuperación: clientes en este rango están reservados para el cron de reactivación.
 *  Las campañas manuales los excluyen automáticamente para no interrumpir el flujo personalizado. */
export const RECOVERY_ZONE_START_DAYS = 18
export const RECOVERY_ZONE_END_DAYS = 25

export const VISIT_SOURCES = {
  QR: 'qr',
  DELIVERY: 'delivery',
} as const
