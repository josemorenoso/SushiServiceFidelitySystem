/**
 * La tarjeta de cada sede, en el panel — sedes separadas, parte 2 (2026-10-14). PURO: sin React,
 * sin red. Lo que decide «Tarjeta principal» (qué tarjeta se está editando, qué dice la pantalla,
 * qué copia «Copiar la de…») vive acá para poder probarse sin dibujar la página.
 *
 * El dueño, mirando Tepuy: *«Si escojo una sede u otra, cuando voy a modificar la tarjeta sale la
 * misma para las dos, incoherente, a menos que haya un botón que diga "tarjetas separadas"»*.
 *
 * EL MODELO, EN TRES LÍNEAS
 *   · «La misma tarjeta para todas las sedes» (default, `card.mode` ausente o `shared`): se edita
 *     la de la marca y el selector de sede no finge cambiarla.
 *   · «Una tarjeta para cada sede» (`per_location`): con una sede elegida se edita la de esa sede
 *     (sello, decoración, descripción, políticas); con «Toda la marca», la de la marca, que es la
 *     que ve quien abre el enlace general y la base de cada sede en lo que no cambió.
 *   · El nombre, el logo y los colores son de la marca en los dos casos. La dirección, el horario,
 *     los teléfonos y las redes son de cada sede en los dos casos («Mis sedes»).
 *
 * Vocabulario de pantalla: «sede», «toda la marca», «las dos sedes». Nunca «location» ni «mode».
 */

import { CARD_MODE_PER_LOCATION, type CardMode } from './tenant-config-paths'
import { contarSedes } from './panel-sedes'

/** Las cuatro cosas de la tarjeta que una sede puede tener propias. `''` = la toma de la marca. */
export interface CamposDeTarjeta {
  stamp_icon: string
  motif: string
  description: string
  policies: string
}

export const CLAVES_DE_TARJETA: readonly (keyof CamposDeTarjeta)[] = ['stamp_icon', 'motif', 'description', 'policies']

export const TARJETA_VACIA: CamposDeTarjeta = { stamp_icon: '', motif: '', description: '', policies: '' }

/** El modo guardado en `tenants.config.card.mode`, con lo de siempre si no hay nada. */
export function modoDeTarjeta(guardado: unknown): CardMode {
  return guardado === CARD_MODE_PER_LOCATION ? 'per_location' : 'shared'
}

export interface SedeDeTarjeta {
  id: string
  name: string
  is_active?: boolean
}

/** Qué tarjeta está editando la pantalla. */
export type QueSeEdita =
  /** Marca de 0 o 1 sede: la pantalla de siempre, sin una palabra de sedes. */
  | { tipo: 'marca'; motivo: 'una-sede' }
  /** 2+ sedes con la misma tarjeta: la de la marca, que muestran todas. */
  | { tipo: 'marca'; motivo: 'compartida' }
  /** 2+ sedes con una tarjeta cada una y «Toda la marca» elegida: la de la marca, la base. */
  | { tipo: 'marca'; motivo: 'base' }
  /** 2+ sedes con una tarjeta cada una y una sede elegida: la de esa sede. */
  | { tipo: 'sede'; id: string; nombre: string }

/**
 * La regla entera de qué se edita. `seleccion` es la del selector del encabezado (`all` o el id de
 * una sede); `sedes` son las que este usuario ve (un administrador de sede, solo las suyas).
 */
export function queSeEdita(args: {
  multiSede: boolean
  modo: CardMode
  seleccion: string
  rol: 'brand' | 'location' | null
  sedes: readonly SedeDeTarjeta[]
}): QueSeEdita {
  if (!args.multiSede) return { tipo: 'marca', motivo: 'una-sede' }
  if (args.modo !== 'per_location') return { tipo: 'marca', motivo: 'compartida' }
  const elegida = args.sedes.find((s) => s.id === args.seleccion)
  if (elegida) return { tipo: 'sede', id: elegida.id, nombre: elegida.name }
  // Un administrador de UNA sede no tiene selector: su sede es la única que hay para él.
  if (args.rol === 'location' && args.sedes.length === 1) {
    return { tipo: 'sede', id: args.sedes[0].id, nombre: args.sedes[0].name }
  }
  return { tipo: 'marca', motivo: 'base' }
}

/** «Las dos sedes» / «las 3 sedes»: como lo dice el dueño. */
export function lasSedes(n: number): string {
  return n === 2 ? 'las dos sedes' : `las ${contarSedes(n)}`
}

function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Los dos botones de la elección, con lo que cada uno significa. */
export function opcionesDeTarjeta(sedes: number): Array<{ modo: CardMode; titulo: string; detalle: string }> {
  return [
    {
      modo: 'shared',
      titulo: 'La misma tarjeta para todas las sedes',
      detalle: `Lo de siempre: ${lasSedes(sedes)} con la misma, cada una con su dirección, su horario, sus teléfonos y sus redes.`,
    },
    {
      modo: 'per_location',
      titulo: 'Una tarjeta para cada sede',
      detalle: 'Cada sede con su sello, su decoración, su descripción y sus políticas. El nombre, el logo y los colores siguen siendo de la marca.',
    },
  ]
}

/**
 * La línea de arriba de la pantalla, según qué se edita. `null` = no se dice nada (una sola sede).
 * `soloLectura`: quien mira no la puede guardar (un administrador de sede), así que no «edita».
 */
export function fraseDeLaTarjeta(que: QueSeEdita, sedes: number, soloLectura = false): string | null {
  if (que.tipo === 'sede') {
    return soloLectura
      ? `Esta es la tarjeta de ${que.nombre}: la ven los clientes que escanean el QR de esa sede.`
      : `Estás editando la tarjeta de ${que.nombre}: la ven los clientes que escanean el QR de esa sede.`
  }
  if (que.motivo === 'compartida') {
    return `${mayuscula(lasSedes(sedes))} muestran esta tarjeta.`
  }
  if (que.motivo === 'base') {
    return 'Esta es la tarjeta de la marca: la ve quien abre el enlace general de la marca, y cada sede la usa en lo que no cambió. Elegí una sede arriba para editar la suya.'
  }
  return null
}

/** Lo que la tarjeta de una sede muestra de verdad: lo suyo, y lo de la marca donde no puso nada. */
export function tarjetaEfectiva(marca: CamposDeTarjeta, sede: CamposDeTarjeta): CamposDeTarjeta {
  const out = { ...TARJETA_VACIA }
  for (const k of CLAVES_DE_TARJETA) out[k] = sede[k].trim() !== '' ? sede[k] : marca[k]
  return out
}

/** ¿La sede puso algo propio, o usa la de la marca entera? */
export function tieneTarjetaPropia(sede: CamposDeTarjeta): boolean {
  return CLAVES_DE_TARJETA.some((k) => sede[k].trim() !== '')
}

/**
 * «Copiar la de {otra sede}»: lo que esa sede tiene PROPIO, tal cual. Donde la otra usa lo de la
 * marca, la copia también lo usa (sigue a la marca si la marca cambia). Así las dos quedan
 * mostrando exactamente lo mismo, sin congelar a escondidas un texto de la marca.
 */
export function copiarTarjeta(de: CamposDeTarjeta): CamposDeTarjeta {
  return { ...TARJETA_VACIA, ...de }
}

/** La tarjeta guardada de una sede (la forma plana de `GET /api/dashboard/locations`) a campos. */
export function camposDesdeRutas(rutas: Record<string, unknown> | null | undefined): CamposDeTarjeta {
  const out = { ...TARJETA_VACIA }
  for (const k of CLAVES_DE_TARJETA) {
    const v = rutas?.[`card.${k}`]
    if (typeof v === 'string') out[k] = v
  }
  return out
}

/**
 * Rutas planas (`{"card.address": "Cra 70"}`) a la forma anidada de un `config`
 * (`{card: {address: "Cra 70"}}`), para darle a `resolveBranding()` la sede tal como la va a
 * resolver el producto. Lo vacío no viaja: en la sede, vacío es «lo toma de la marca».
 */
export function anidarRutas(rutas: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [ruta, valor] of Object.entries(rutas)) {
    if (typeof valor !== 'string' || valor.trim() === '') continue
    const [espacio, clave] = ruta.split('.')
    if (clave === undefined) {
      out[espacio] = valor
    } else {
      const dentro = (out[espacio] as Record<string, unknown> | undefined) ?? {}
      dentro[clave] = valor
      out[espacio] = dentro
    }
  }
  return out
}

/** Los campos al cuerpo plano del `PUT /api/dashboard/locations/[id]/card`. */
export function rutasDesdeCampos(campos: CamposDeTarjeta): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of CLAVES_DE_TARJETA) out[`card.${k}`] = campos[k]
  return out
}
