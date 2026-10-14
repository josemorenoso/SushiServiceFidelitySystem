/**
 * La whitelist de `restaurant_locations.config` — qué puede tocar una SEDE.
 *
 * ⚠️ **ESPEJO DE `location_config_es_valida()`** (migración 00058 §1). Se
 * cambian los dos lados o ninguno; `tests/unit/location-config-paths.test.ts`
 * lo vigila. El CHECK de la base es el que manda: la app corre con
 * `service_role` en 55 archivos y ese rol se salta el RLS, así que una
 * whitelist que viviera solo acá sería una sugerencia.
 *
 * NO ES UNA LISTA NUEVA: es un SUBCONJUNTO de `EDITABLE_PATHS`
 * (`tenant-config-paths.ts`), elegido por nombre. Las validaciones son
 * literalmente las mismas funciones, así que el `google_maps_url` de una sede no
 * puede aceptar nada que el de la marca rechace, ni al revés.
 *
 * QUÉ BAJA A LA SEDE Y QUÉ NO (§7.1 del spec, ampliado por el dueño 2026-09-08)
 * ───────────────────────────────────────────────────────────────────────────
 * El criterio no es *"qué podría variar"* sino *"qué es coherente con lo que el
 * cliente ya ve"*. La tarjeta muestra puntos y sellos que son **de la marca**:
 * un cliente que juntó 8 sellos comiendo en Laureles y abre su tarjeta parado en
 * Envigado tiene que ver el mismo nombre y el mismo logo, porque sus 8 sellos
 * siguen ahí. Si la identidad cambiara con la sede, **la tarjeta mentiría**.
 *
 * Lo que sí baja es todo lo que responde *"dónde estoy y cómo me contactás"*,
 * que es lo único que de verdad distingue dos locales de la misma marca — y es
 * exactamente el problema que lo destapó: las dos sedes de una marca mandaban a
 * reseñar la MISMA ficha de Google, así que la ficha de la segunda nacía muerta.
 *
 * CÓMO SE COMBINA: `location.config` se mezcla **encima** de `tenants.config`
 * (`resolveBranding()`, `src/lib/branding.ts`). Una clave ausente o vacía en la
 * sede hereda la de la marca, así que una sede recién creada —`config = {}`— se
 * comporta bit a bit como hoy.
 */

import { pickEditablePaths, buildPatchFrom, projectPaths, type EditablePath } from './tenant-config-paths'
import type { BuildPatchResult } from './tenant-config-paths'

/**
 * Las rutas que una sede puede sobrescribir, en el orden en que se dibujan.
 *
 * Cada nombre TIENE que existir en `EDITABLE_PATHS`: `pickEditablePaths()` lanza
 * al importar el módulo si alguno no existe, para que un renombrado se note al
 * arrancar y no el día que un restaurante no puede guardar su dirección.
 */
export const LOCATION_EDITABLE_PATH_NAMES = [
  // Dónde te mando
  'google_maps_url',
  'card.google_profile_url',
  'card.address',
  'card.hours',

  // Cómo te contacto
  'whatsapp_link',
  'delivery_phone',
  'card.contact_phone',
  'card.contact_email',

  // Las redes del local
  'instagram_url',
  'card.facebook_url',
  'card.tiktok_url',
  'card.website_url',
] as const

/**
 * LA TARJETA DE LA SEDE (sedes separadas, parte 2, dueño 2026-10-14): *«si escojo una sede u
 * otra, cuando voy a modificar la tarjeta sale la misma para las dos, incoherente, a menos que
 * haya un botón que diga "tarjetas separadas"»*.
 *
 * Con «Una tarjeta para cada sede» (`tenants.config.card.mode = 'per_location'`), cada sede
 * puede tener además SU sello, SU decoración, SU descripción y SUS políticas. Con «La misma
 * tarjeta para todas las sedes» (lo de siempre) estas claves de la sede se guardan pero NO se
 * muestran: volver a separarlas no obliga a rehacerlas (`mergeLocationOverConfig()`).
 *
 * POR QUÉ ESTAS CUATRO Y NO EL NOMBRE, EL LOGO NI LOS COLORES. Siguen siendo de la marca por la
 * razón de arriba: los puntos y los sellos del cliente son de la marca, y una tarjeta con otro
 * nombre u otro logo en la sede de al lado mentiría. Lo que cambia entre dos locales de la misma
 * marca es cómo se presenta cada uno, no quién es.
 *
 * Es una lista APARTE de la ficha a propósito: la ficha la edita «Mis sedes»
 * (`PATCH /api/dashboard/locations/[id]`, que también abre un administrador de su sede) y la
 * tarjeta la edita «Tarjeta principal» (`PUT /api/dashboard/locations/[id]/card`, solo con
 * alcance de marca, como el resto de la tarjeta desde SEG-3). Si estuvieran en la misma lista,
 * la ficha dejaría escribir la tarjeta por la puerta de al lado.
 */
export const LOCATION_CARD_PATH_NAMES = [
  'card.stamp_icon',
  'card.motif',
  'card.description',
  'card.policies',
] as const

/** Las claves de `card` que son de la TARJETA de la sede (no de su ficha). Las lee el resolver. */
export const LOCATION_CARD_KEYS: readonly string[] = LOCATION_CARD_PATH_NAMES.map((p) => p.split('.')[1])

const LOCATION_EDITABLE_PATHS: EditablePath[] = pickEditablePaths(LOCATION_EDITABLE_PATH_NAMES)
const LOCATION_CARD_PATHS: EditablePath[] = pickEditablePaths(LOCATION_CARD_PATH_NAMES)

const BY_PATH: ReadonlyMap<string, EditablePath> = new Map(
  LOCATION_EDITABLE_PATHS.map((p) => [p.path, p])
)
const CARD_BY_PATH: ReadonlyMap<string, EditablePath> = new Map(
  LOCATION_CARD_PATHS.map((p) => [p.path, p])
)

/** Todo lo que el `config` de una sede puede llevar: su ficha y su tarjeta. Es lo que mira el CHECK. */
const TODAS_LAS_RUTAS_DE_SEDE: readonly string[] = [...LOCATION_EDITABLE_PATH_NAMES, ...LOCATION_CARD_PATH_NAMES]

/**
 * Las claves de PRIMER NIVEL que el CHECK de la base acepta.
 *
 * Se deriva de las rutas de arriba en vez de escribirse a mano: si mañana entra
 * `card.whatsapp_business`, esta lista se entera sola y el test que la compara
 * contra `location_config_es_valida()` avisa de que falta el otro lado.
 */
export const LOCATION_CONFIG_TOP_LEVEL_KEYS: readonly string[] = [
  ...new Set(TODAS_LAS_RUTAS_DE_SEDE.map((p) => p.split('.')[0])),
]

/** Las claves permitidas dentro de `card` (ficha + tarjeta). Mismo criterio que la de arriba. */
export const LOCATION_CONFIG_CARD_KEYS: readonly string[] = [
  ...new Set(
    TODAS_LAS_RUTAS_DE_SEDE.filter((p) => p.startsWith('card.')).map((p) => p.split('.')[1])
  ),
]

/** ¿Es de la FICHA de la sede (lo que edita «Mis sedes»)? La tarjeta de la sede NO entra acá. */
export function isLocationEditablePath(path: string): boolean {
  return BY_PATH.has(path)
}

/** ¿Es de la TARJETA de la sede (lo que edita «Tarjeta principal» con una sede elegida)? */
export function isLocationCardPath(path: string): boolean {
  return CARD_BY_PATH.has(path)
}

/**
 * Convierte el cuerpo plano del panel (`{"card.address": "Cra 43 #10-20"}`) en
 * el patch anidado que espera `merge_location_config_deep()`.
 *
 * Mismo contrato que `buildConfigPatch()` para la marca: una ruta que no está en
 * la whitelist se IGNORA en silencio (el panel manda lo que sabe mandar), pero
 * un valor MAL FORMADO corta con 400 y dice cuál.
 */
export function buildLocationConfigPatch(body: Record<string, unknown>): BuildPatchResult {
  return buildPatchFrom(BY_PATH, body)
}

/** Proyecta el `config` guardado de una sede a la forma plana que lee el panel. */
export function projectLocationEditablePaths(
  config: Record<string, unknown>
): Record<string, unknown> {
  return projectPaths(LOCATION_EDITABLE_PATH_NAMES, config)
}

/**
 * La tarjeta de la sede, del cuerpo plano del panel al patch anidado. Mismo contrato que
 * `buildLocationConfigPatch()` (lo ajeno se ignora, lo mal formado corta), y las MISMAS
 * validaciones que la tarjeta de la marca: el sello y la decoración son ids de las listas
 * cerradas de `card-extras.ts`, nunca un SVG (el `config` es público).
 */
export function buildLocationCardPatch(body: Record<string, unknown>): BuildPatchResult {
  return buildPatchFrom(CARD_BY_PATH, body)
}

/** Proyecta la tarjeta guardada de una sede a la forma plana que lee el panel. */
export function projectLocationCardPaths(config: Record<string, unknown>): Record<string, unknown> {
  return projectPaths(LOCATION_CARD_PATH_NAMES, config)
}
