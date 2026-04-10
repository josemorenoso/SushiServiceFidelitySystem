export const POWER_RANKS = [
  { name: 'Leyenda', minVisits: 25, emoji: '👑', gradient: 'from-yellow-400 to-amber-600', bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', glow: 'shadow-yellow-400/50' },
  { name: 'Dios', minVisits: 20, emoji: '⚡', gradient: 'from-purple-500 to-violet-700', bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-700', glow: 'shadow-purple-400/50' },
  { name: 'Maestro', minVisits: 12, emoji: '🔥', gradient: 'from-blue-500 to-indigo-700', bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', glow: 'shadow-blue-400/50' },
  { name: 'Guerrero', minVisits: 7, emoji: '⚔️', gradient: 'from-emerald-500 to-green-700', bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', glow: 'shadow-emerald-400/50' },
  { name: 'Aprendiz', minVisits: 3, emoji: '📚', gradient: 'from-orange-400 to-amber-600', bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700', glow: 'shadow-orange-400/50' },
  { name: 'Novato', minVisits: 1, emoji: '🌱', gradient: 'from-gray-400 to-gray-600', bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-600', glow: 'shadow-gray-300/50' },
] as const

export const RISK_LEVELS = [
  { name: 'Alerta', minDays: 7, maxDays: 10, color: '#EAB308', bg: 'bg-yellow-100', text: 'text-yellow-800', description: 'Pueden volver solos con un empujón' },
  { name: 'En riesgo', minDays: 11, maxDays: 15, color: '#F97316', bg: 'bg-orange-100', text: 'text-orange-800', description: 'Necesitan un recordatorio directo' },
  { name: 'Crítico', minDays: 16, maxDays: 21, color: '#EF4444', bg: 'bg-red-100', text: 'text-red-800', description: 'Urge campaña de rescate' },
  { name: 'Perdido', minDays: 22, maxDays: Infinity, color: '#991B1B', bg: 'bg-red-200', text: 'text-red-900', description: 'Oferta agresiva o se pierden' },
] as const

export function getCustomerRank(totalVisits: number) {
  return POWER_RANKS.find((r) => totalVisits >= r.minVisits) ?? POWER_RANKS[POWER_RANKS.length - 1]
}

export function getRiskLevel(daysInactive: number) {
  return RISK_LEVELS.find((r) => daysInactive >= r.minDays && daysInactive <= r.maxDays) ?? RISK_LEVELS[RISK_LEVELS.length - 1]
}
