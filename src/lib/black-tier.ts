/**
 * Lógica del nivel Black — una sola definición, en un solo sitio.
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §17, textual del dueño: *"la pantalla negra de
 * clientes VIP tiene que quedar dentro del apartado de clientes y esta lógica
 * tiene que estar bien definida"*. §17.2 pide que la tarjeta del cliente en su
 * celular se ponga negra y dorada al entrar a Black.
 *
 * ⚠️ HOY CONVIVEN DOS NOCIONES DE "BLACK" EN EL PRODUCTO, y son distintas:
 *
 *   1. **Por VISITAS** — `POWER_RANKS` (`src/constants/rankings.ts`) llama Black a
 *      quien tiene 10+ visitas. Es lo que usan el ranking del dashboard,
 *      `BlackTierSection` y el preset `black_exclusive` de campañas manuales.
 *   2. **Por PUNTOS** — `reward_tiers.is_black` marca UNO de los niveles de premios
 *      del tenant (la API garantiza que solo haya uno). Se alcanza cruzando su
 *      `point_threshold`.
 *
 * La tarjeta pública usa la **segunda**, por puntos, y no por capricho: la tarjeta
 * enseña la escalera de premios por puntos. Si se pintara de negro por visitas, un
 * cliente con 10 visitas y pocos puntos vería una tarjeta Black encima de una lista
 * que le dice que el nivel Black sigue bloqueado (🔒). La tarjeta quedaría
 * contradiciéndose sola.
 *
 * Cuál de las dos manda a nivel de producto es la **pregunta 17.b, abierta**
 * (*"¿El umbral de Black se define por visitas, por puntos, o por cualquiera de los
 * dos?"*). Por eso la regla vive aquí sola: cuando el dueño la responda, se cambia
 * esta función y nada más. NO se tocó el umbral de 10 visitas de
 * `ManualCampaigns.tsx` — §17.4 sigue congelado a propósito.
 */

/** Lo mínimo que necesita saberse de un nivel para resolver si es el Black. */
export interface BlackTierCandidate {
  point_threshold: number
  is_black: boolean
}

/** El nivel marcado como Black del tenant, o `null` si no hay ninguno configurado. */
export function findBlackTier<T extends BlackTierCandidate>(tiers: readonly T[]): T | null {
  return tiers.find((t) => t.is_black) ?? null
}

/**
 * ¿El cliente ya entró a Black?
 *
 * Requiere que el tenant tenga un nivel marcado `is_black` y que el cliente haya
 * cruzado su umbral de puntos. Sin nivel Black configurado, nadie es Black.
 */
export function isBlackMember(
  tiers: readonly BlackTierCandidate[],
  totalPoints: number
): boolean {
  const blackTier = findBlackTier(tiers)
  return blackTier !== null && totalPoints >= blackTier.point_threshold
}
