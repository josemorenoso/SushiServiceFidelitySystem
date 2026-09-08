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

const LOCATION_EDITABLE_PATHS: EditablePath[] = pickEditablePaths(LOCATION_EDITABLE_PATH_NAMES)

const BY_PATH: ReadonlyMap<string, EditablePath> = new Map(
  LOCATION_EDITABLE_PATHS.map((p) => [p.path, p])
)

/**
 * Las claves de PRIMER NIVEL que el CHECK de la base acepta.
 *
 * Se deriva de las rutas de arriba en vez de escribirse a mano: si mañana entra
 * `card.whatsapp_business`, esta lista se entera sola y el test que la compara
 * contra `location_config_es_valida()` avisa de que falta el otro lado.
 */
export const LOCATION_CONFIG_TOP_LEVEL_KEYS: readonly string[] = [
  ...new Set(LOCATION_EDITABLE_PATH_NAMES.map((p) => p.split('.')[0])),
]

/** Las claves permitidas dentro de `card`. Mismo criterio que la de arriba. */
export const LOCATION_CONFIG_CARD_KEYS: readonly string[] = [
  ...new Set(
    LOCATION_EDITABLE_PATH_NAMES.filter((p) => p.startsWith('card.')).map((p) => p.split('.')[1])
  ),
]

export function isLocationEditablePath(path: string): boolean {
  return BY_PATH.has(path)
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
