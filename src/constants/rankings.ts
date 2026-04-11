export const POWER_RANKS = [
  { name: 'Diamante', minVisits: 25, emoji: '�', gradient: 'from-cyan-300 to-blue-600', bg: 'bg-cyan-50', border: 'border-cyan-400', text: 'text-cyan-700', glow: 'shadow-cyan-400/50' },
  { name: 'Platino', minVisits: 18, emoji: '⚜️', gradient: 'from-slate-300 to-slate-600', bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-700', glow: 'shadow-slate-400/50' },
  { name: 'Oro', minVisits: 12, emoji: '🥇', gradient: 'from-yellow-400 to-amber-600', bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', glow: 'shadow-yellow-400/50' },
  { name: 'Plata', minVisits: 7, emoji: '🥈', gradient: 'from-gray-300 to-gray-500', bg: 'bg-gray-50', border: 'border-gray-400', text: 'text-gray-600', glow: 'shadow-gray-400/50' },
  { name: 'Bronce', minVisits: 3, emoji: '🥉', gradient: 'from-orange-400 to-amber-700', bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700', glow: 'shadow-orange-400/50' },
  { name: 'Nuevo', minVisits: 1, emoji: '✨', gradient: 'from-emerald-400 to-green-600', bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-600', glow: 'shadow-emerald-300/50' },
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
