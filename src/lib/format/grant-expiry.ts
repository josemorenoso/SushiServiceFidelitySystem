/**
 * Formato de la cuenta regresiva de vencimiento de un premio (`reward_grants.expires_at`).
 *
 * Antes vivía copiado en tres componentes (banner del cliente, lista del mesero, modal de
 * reseña). Un solo sitio: si la redacción o la regla de días cambia, cambia en todos.
 */

/** "vence en 3 días" (minúsculas, sin fecha). `null` si el premio no vence. */
export function expiryLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  if (days <= 0) return 'vence hoy'
  if (days === 1) return 'vence mañana'
  return `vence en ${days} días`
}

/** "Vence en 3 días · 18 de julio" (capitalizado, con fecha absoluta). `null` si no vence. */
export function expiryLabelWithDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const expires = new Date(iso)
  const days = Math.ceil((expires.getTime() - Date.now()) / 86400000)
  const date = expires.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
  if (days <= 0) return `Vence hoy · ${date}`
  if (days === 1) return `Vence mañana · ${date}`
  return `Vence en ${days} días · ${date}`
}
