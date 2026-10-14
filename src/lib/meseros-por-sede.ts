import type { LocationScope } from '@/lib/location-scope'

/**
 * Meseros QR y sus aparatos, por sede (SEDE-MESEROS, 2026-10-15).
 *
 * `GET/PATCH/DELETE /api/dashboard/staff` y `/staff/device` autenticaban con
 * `requireTenantId()`, que solo mira que el JWT traiga una marca: un administrador
 * de UNA sede (`role='location'`) listaba, editaba y borraba los meseros y los
 * aparatos de la OTRA sede de su marca. No cruzaba marcas, pero sí sedes.
 *
 * Lo que decide acá, PURO (sin base) para que se pruebe entero:
 *   · Un usuario de marca —y el operador de Cada1, que `requireLocationScope()` ya
 *     resuelve como marca— sigue como siempre: toda la marca, «Sin sede» incluido.
 *   · Un administrador de sede ve los meseros de SUS sedes y los ROTATIVOS (salen en
 *     el escáner de su sede, así que tiene que verlos), y los aparatos de sus sedes.
 *     Nunca el «Sin sede» (`location_id` NULL sin la bandera): es el cubo de la marca
 *     (fila 4 del §5.1), igual que en el resto del panel.
 *   · Escribe solo sobre los meseros y aparatos de sus sedes, y solo hacia sus sedes.
 *     Un rotativo trabaja en TODAS las sedes de la marca: cambiarlo, o volver rotativo
 *     a alguien, es de la marca (decisión tomada sin el dueño, anotada en
 *     `docs/PENDIENTES.md` §8 D; revertible).
 */

export type AlcanceDeMeseros =
  | { readonly esMarca: true }
  | { readonly esMarca: false; readonly sedes: readonly string[] }

export function alcanceDeMeseros(scope: LocationScope): AlcanceDeMeseros {
  return scope.role === 'brand' ? { esMarca: true } : { esMarca: false, sedes: scope.allowedLocationIds }
}

export interface MeseroConSede {
  location_id: string | null
  works_any_location: boolean | null
}

/** ¿Este alcance VE a este mesero en la lista? */
export function veAlMesero(alcance: AlcanceDeMeseros, mesero: MeseroConSede): boolean {
  if (alcance.esMarca) return true
  if (mesero.works_any_location === true) return true
  return mesero.location_id !== null && alcance.sedes.includes(mesero.location_id)
}

/**
 * ¿Puede CAMBIAR o BORRAR a este mesero? Devuelve `undefined` si puede, o el código
 * y el mensaje que lee en su pantalla.
 *
 * Lo que no ve sale como 404 —«no existe» y «es de la otra sede» dicen lo mismo, como en
 * `decideLocationScope()`—; el rotativo, que sí ve, sale como 403 con el porqué.
 */
export function porQueNoPuedeTocarAlMesero(
  alcance: AlcanceDeMeseros,
  mesero: MeseroConSede
): { status: 403 | 404; message: string } | undefined {
  if (alcance.esMarca) return undefined
  if (mesero.works_any_location === true) {
    return {
      status: 403,
      message: 'Este mesero rota entre todas las sedes de la marca: lo cambia un super usuario de la marca.',
    }
  }
  if (mesero.location_id !== null && alcance.sedes.includes(mesero.location_id)) return undefined
  return { status: 404, message: 'Mesero no encontrado' }
}

/**
 * ¿Puede mandar a un mesero a ESTA sede (al crearlo o al editarlo)? `undefined` = sí.
 * `location_id` ausente = no se toca; `null` = «sin sede».
 */
export function porQueNoPuedeAsignarSede(
  alcance: AlcanceDeMeseros,
  destino: { location_id?: string | null; works_any_location?: boolean }
): string | undefined {
  if (alcance.esMarca) return undefined
  if (destino.works_any_location === true) {
    return 'Un mesero que rota entre sedes trabaja en todas las sedes de la marca: lo marca un super usuario de la marca.'
  }
  if (destino.location_id === undefined) return undefined
  if (destino.location_id === null) {
    return 'Elige una de tus sedes: un mesero sin sede no aparece en el escáner de tu sede.'
  }
  if (!alcance.sedes.includes(destino.location_id)) {
    return 'Solo puedes asignar meseros a tu sede.'
  }
  return undefined
}

/** ¿Este alcance ve (y puede revocar o borrar) este aparato? Un aparato sin sede es de la marca. */
export function veAlAparato(alcance: AlcanceDeMeseros, aparato: { location_id: string | null }): boolean {
  if (alcance.esMarca) return true
  return aparato.location_id !== null && alcance.sedes.includes(aparato.location_id)
}
