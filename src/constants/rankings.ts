import { FREQUENCY_CAP_DAYS, normalizeReactivationDays, deriveRecoveryZone } from '@/constants/rewards'

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

/** Una banda de días sin venir. `maxDays = Infinity` es la última, abierta. */
export interface CycleBand {
  name: 'Reciente' | 'Ventana' | 'Recuperación' | 'Perdido'
  minDays: number
  maxDays: number
  color: string
  bg: string
  text: string
  description: string
}

/**
 * UNA SOLA ESCALA DE DÍAS (ciclo, fase 0 — 2026-10-08).
 *
 * Hasta hoy el dueño veía tres relojes: las burbujas (7-10 / 11-15 / 16-21 / 22+, fijas), la
 * tira «Ciclo de recuperación» de Campañas (derivada de sus días) y el cron (21 y 25). Ahora
 * las bandas salen de los días de reactivación de la marca, con las MISMAS funciones que el
 * cron (`normalizeReactivationDays()` → `deriveRecoveryZone()`):
 *
 *   Reciente      0 … FREQUENCY_CAP_DAYS-1
 *   Ventana       FREQUENCY_CAP_DAYS … start-1   (lo que se le puede mandar a mano)
 *   Recuperación  start … end                    (reservada al cron: suave e insistente)
 *   Perdido       end+1 …
 *
 * Con los defaults (21 / 25): 0-6 · 7-17 · 18-25 · 26+, lo mismo que muestra la tira.
 * La lee la tira, el panel (`getFullAnalytics()`), el demo y el estimador de la burbuja.
 *
 * Con un suave muy temprano (≤ 10) la zona arranca en el cap y la Ventana queda vacía:
 * no se devuelve (una burbuja de «7-6 días» no significa nada).
 *
 * ⚠️ El motor del ciclo (fase 1A, 2026-10-11) la va a REEMPLAZAR por `bandsFromConfig()`
 * (`src/lib/cycle-engine.ts`): las cajas por etapa con los días del ritmo de la marca.
 * Hasta la fase 2 (la pantalla) esta sigue siendo la escala de las pantallas de hoy, con
 * los días viejos de reactivación. No se borra antes.
 */
export function deriveCycleBands(
  rawSoft?: string | number | null,
  rawAggressive?: string | number | null
): CycleBand[] {
  const { softDays, aggressiveDays } = normalizeReactivationDays(rawSoft, rawAggressive)
  const zone = deriveRecoveryZone(softDays, aggressiveDays)
  const bands: CycleBand[] = [
    { name: 'Reciente', minDays: 0, maxDays: FREQUENCY_CAP_DAYS - 1, color: '#16A34A', bg: 'bg-green-100', text: 'text-green-800', description: 'Vinieron hace poco: no reciben marketing' },
    { name: 'Ventana', minDays: FREQUENCY_CAP_DAYS, maxDays: zone.startDays - 1, color: '#EAB308', bg: 'bg-yellow-100', text: 'text-yellow-800', description: 'Aquí sí les puedes escribir tú, con una campaña manual' },
    { name: 'Recuperación', minDays: zone.startDays, maxDays: zone.endDays, color: '#F97316', bg: 'bg-orange-100', text: 'text-orange-800', description: `Los atiende la reactivación automática (suave al día ${softDays}; insistente al día ${aggressiveDays}, una sola vez): las campañas manuales no les llegan` },
    { name: 'Perdido', minDays: zone.endDays + 1, maxDays: Infinity, color: '#991B1B', bg: 'bg-red-200', text: 'text-red-900', description: 'Ya pasaron por la reactivación automática: oferta fuerte o se pierden' },
  ]
  return bands.filter((b) => b.minDays <= b.maxDays)
}

/**
 * Las bandas de RIESGO (las burbujas): todas menos «Reciente». Mismos parámetros que
 * `deriveCycleBands()`; sin parámetros, los defaults de la marca.
 */
export function deriveRiskLevels(
  rawSoft?: string | number | null,
  rawAggressive?: string | number | null
): CycleBand[] {
  return deriveCycleBands(rawSoft, rawAggressive).filter((b) => b.name !== 'Reciente')
}

/** Las bandas de riesgo con los días por defecto (21 / 25). Para lo que no tiene marca a mano (el demo). */
export const RISK_LEVELS: readonly CycleBand[] = deriveRiskLevels()

/** La banda de riesgo de `daysInactive`; `undefined` si todavía es «Reciente». */
export function getRiskLevel(daysInactive: number, levels: readonly CycleBand[] = RISK_LEVELS) {
  return levels.find((r) => daysInactive >= r.minDays && daysInactive <= r.maxDays)
}
