/**
 * «Para qué se usa cada premio» — la lógica PURA de los selectores de Recompensas › Premios
 * para regalar (S-1, 2026-10-13).
 *
 * POR QUÉ ESTÁ APARTE DE LA PANTALLA
 * ──────────────────────────────────
 * Los tres selectores (regalo fuerte, regalo pequeño, premio por reseña) eligen un premio del
 * catálogo `campaign_rewards` y lo guardan en `admin_settings` por `PUT /api/dashboard/settings`.
 * Lo que merece prueba no es el dibujo sino tres decisiones, y ninguna necesita React ni base:
 *
 *   1. ¿Qué dice el selector cuando la clave apunta a un premio retirado o que ya no está en el
 *      catálogo de la marca? Dice «elige otro» — nunca se queda vacío como si no hubiera premio.
 *   2. ¿Cómo se lee y se reescribe `cycle_small_reward_ids` (una LISTA en un texto) cuando el
 *      selector edita solo el primero? Con el MISMO analizador que `normalizeCycleSettings()`.
 *   3. ¿Cómo se dice cuánto dura un premio que vence («vence a los 7 días», «vence el domingo»)?
 *
 * No toca `cycle-engine.ts` (la lógica del ciclo es de la fase 2): `idsDeLista()` replica su
 * `listaDeIds()` privado y `tests/unit/recompensas-un-solo-lugar.test.ts` fija que dan lo mismo.
 */

/** Lo que un selector necesita saber de un premio del catálogo. */
export interface PremioDelCatalogo {
  id: string
  title: string
  is_active: boolean
}

export type EstadoDelSelector =
  /** La clave está vacía: no hay premio elegido (y eso es una decisión válida). */
  | { tipo: 'sin_premio' }
  /** La clave apunta a un premio del catálogo de la marca que sigue activo. */
  | { tipo: 'activo'; premio: PremioDelCatalogo }
  /**
   * La clave apunta a un premio RETIRADO, o a un id que no está en el catálogo de ESTA marca
   * (borrado, o de otra marca). El mensaje es el mismo; el selector no puede mostrarse vacío,
   * porque «vacío» quiere decir «sin premio» y acá hay uno elegido que ya no sirve.
   */
  | { tipo: 'no_disponible'; id: string }

export const AVISO_PREMIO_NO_DISPONIBLE = 'Este premio ya no está activo: elige otro.'

/** El estado de un selector, a partir de lo guardado y del catálogo completo (activos y retirados). */
export function estadoDelSelector(
  idGuardado: string | null | undefined,
  catalogo: readonly PremioDelCatalogo[]
): EstadoDelSelector {
  const id = idGuardado?.trim() ?? ''
  if (!id) return { tipo: 'sin_premio' }
  const premio = catalogo.find((p) => p.id === id)
  if (premio?.is_active) return { tipo: 'activo', premio }
  return { tipo: 'no_disponible', id }
}

/**
 * Los ids de una lista guardada como texto: separados por coma, o un arreglo JSON si el texto
 * empieza por `[`. Es la misma lectura de `normalizeCycleSettings()` para `cycle_small_reward_ids`.
 */
export function idsDeLista(valor: string | null | undefined): string[] {
  const texto = valor?.trim()
  if (!texto) return []
  let partes: unknown[] = texto.split(',')
  if (texto.startsWith('[')) {
    try {
      const json: unknown = JSON.parse(texto)
      partes = Array.isArray(json) ? json : []
    } catch {
      partes = []
    }
  }
  return partes.map((p) => String(p).trim()).filter(Boolean)
}

/**
 * El valor de `cycle_small_reward_ids` después de elegir `nuevoId` como PRIMER regalo pequeño.
 *
 *   · `nuevoId` vacío («sin regalo pequeño») vacía la lista entera: dejar los demás haría que
 *     el segundo pasara a ser «el pequeño» sin que nadie lo eligiera.
 *   · Si la lista ya tenía varios (se escribió a mano), el resto se conserva, sin repetir.
 *
 * Se escribe separado por comas, que `normalizeCycleSettings()` lee igual que un arreglo JSON.
 */
export function conPrimerRegaloPequeno(valorActual: string | null | undefined, nuevoId: string): string {
  const id = nuevoId.trim()
  if (!id) return ''
  const resto = idsDeLista(valorActual).slice(1).filter((x) => x !== id)
  return [id, ...resto].join(',')
}

/** Una ventana en días escrita en un campo: entero de 1 en adelante, o `null` si no sirve. */
export function ventanaEnDias(texto: string | null | undefined): number | null {
  const n = Number.parseInt(texto ?? '', 10)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/**
 * Cuánto dura un premio, dicho como lo diría el dueño. El ciclo de recuperación vence SIEMPRE el
 * domingo (`expiresOnSunday()`); el camino de siempre vence a los N días de enviado.
 */
export function textoDeVigencia(vence: { dias: number } | 'domingo'): string {
  if (vence === 'domingo') return 'vence el domingo'
  if (vence.dias === 1) return 'vence al día siguiente'
  return `vence a los ${vence.dias} días`
}

/**
 * ¿El ciclo de recuperación tiene un regalo fuerte PROPIO, distinto del que elige este selector?
 *
 * `normalizeCycleSettings()` usa `cycle_strong_reward_id` y, si está vacío, cae a
 * `aggressive_reward_id`: el selector «Regalo fuerte» escribe este último para que sea UNA sola
 * elección para los dos caminos. Si alguien dejó puesto el propio del ciclo (a mano, por SQL), el
 * selector ya no manda sobre el ciclo y la pantalla tiene que decirlo.
 */
export function cicloTieneFuerteAparte(ajustes: Readonly<Record<string, string | undefined>>): boolean {
  const propio = ajustes.cycle_strong_reward_id?.trim() ?? ''
  if (!propio) return false
  return propio !== (ajustes.aggressive_reward_id?.trim() ?? '')
}
