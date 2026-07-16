/**
 * Porcentaje entero, seguro ante denominador cero.
 *
 * Extraído para que las tasas del sistema (redención, click-through del funnel de reseñas,
 * etc.) se calculen en un solo sitio y no diverjan copia a copia.
 */

/** `part / whole` como porcentaje entero redondeado. Devuelve 0 si `whole` es 0. */
export function percentInt(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}
