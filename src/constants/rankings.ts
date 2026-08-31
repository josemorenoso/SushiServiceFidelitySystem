export const POWER_RANKS = [
  { name: 'Black', minVisits: 10, emoji: '\ud83d\udc51', gradient: 'from-neutral-900 to-neutral-700', bg: 'bg-neutral-950', border: 'border-neutral-600', text: 'text-neutral-100', glow: 'shadow-neutral-500/60', color: '#1a1a1a', labelColor: '#FFD700' },
  { name: 'Platino', minVisits: 7, emoji: '\u269c\ufe0f', gradient: 'from-slate-300 to-slate-600', bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-700', glow: 'shadow-slate-400/50', color: '#475569', labelColor: '#ffffff' },
  { name: 'Oro', minVisits: 4, emoji: '\ud83e\udd47', gradient: 'from-yellow-400 to-amber-600', bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', glow: 'shadow-yellow-400/50', color: '#D97706', labelColor: '#ffffff' },
  { name: 'Plata', minVisits: 0, emoji: '\ud83e\udd48', gradient: 'from-gray-300 to-gray-500', bg: 'bg-gray-50', border: 'border-gray-400', text: 'text-gray-600', glow: 'shadow-gray-400/50', color: '#6B7280', labelColor: '#ffffff' },
] as const

/**
 * Cuántos clientes entran en el resumen del dashboard (`topCustomers`).
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §14.2 — el dueño pidió bajarlo de 20 a 15:
 * *"Reducir el resumen de clientes a 15"*. Lo consumen `dashboard.service.ts`
 * (datos reales) y `demo-analytics.ts` (modo demo); tienen que decir lo mismo,
 * o el demo enseñaría un panel que el cliente nunca va a ver.
 */
export const TOP_CUSTOMERS_LIMIT = 15

export const LEVEL_THRESHOLDS = {
  plata: 1,
  oro: 4,
  platino: 7,
  black: 10,
} as const

export function getCustomerRank(totalVisits: number) {
  return POWER_RANKS.find((r) => totalVisits >= r.minVisits) ?? POWER_RANKS[POWER_RANKS.length - 1]
}

export const RISK_LEVELS = [
  { name: 'Alerta', minDays: 7, maxDays: 10, color: '#EAB308', bg: 'bg-yellow-100', text: 'text-yellow-800', description: 'Pueden volver solos con un empujón' },
  { name: 'En riesgo', minDays: 11, maxDays: 15, color: '#F97316', bg: 'bg-orange-100', text: 'text-orange-800', description: 'Necesitan un recordatorio directo' },
  { name: 'Crítico', minDays: 16, maxDays: 21, color: '#EF4444', bg: 'bg-red-100', text: 'text-red-800', description: 'Urge campaña de rescate' },
  { name: 'Perdido', minDays: 22, maxDays: Infinity, color: '#991B1B', bg: 'bg-red-200', text: 'text-red-900', description: 'Oferta agresiva o se pierden' },
] as const

export function getRiskLevel(daysInactive: number) {
  return RISK_LEVELS.find((r) => daysInactive >= r.minDays && daysInactive <= r.maxDays) ?? RISK_LEVELS[RISK_LEVELS.length - 1]
}
