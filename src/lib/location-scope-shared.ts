/**
 * Multi-sede F7 (§8.4) — la parte de `location-scope.ts` que es segura para el
 * CLIENTE.
 *
 * `location-scope.ts` importa `@/lib/supabase/server`, que usa `next/headers` —
 * legal solo en Server Components / Route Handlers. `LocationScopeContext.tsx`
 * ('use client') necesita el nombre del query param y el tipo de la vista del
 * selector, y como Next.js empaqueta por ARCHIVO (no por export), importar
 * cualquier cosa de `location-scope.ts` desde un componente cliente arrastraba
 * `next/headers` al bundle del navegador y `next build` lo rechazaba.
 *
 * Este archivo no importa nada de I/O — ni de Supabase, ni de Next — a
 * propósito: es lo único de todo el módulo que un Client Component puede tocar.
 * `location-scope.ts` reexporta estos mismos símbolos para que el código de
 * servidor los siga importando de un solo sitio.
 */

/** El rol del usuario en la marca, tal cual `dashboard_user_locations.role`. */
export type LocationRole = 'brand' | 'location'

/**
 * Qué pidió ESTA petición en `?location_id=`, ya validado contra lo permitido.
 *   · `all`     — «todas las que este usuario puede ver» (también el valor por defecto).
 *   · `unknown` — solo el cubo *"Sin sede"* (`location_id IS NULL`).
 *   · `one`     — una sede concreta.
 */
export type LocationSelection = 'all' | 'unknown' | 'one'

/** Una sede tal como se le ofrece al selector del panel. */
export interface LocationOption {
  id: string
  name: string
  slug: string | null
  is_primary: boolean
}

/** Lo que el panel necesita saber para dibujar el selector. */
export interface LocationScopeView {
  role: LocationRole
  selection: LocationSelection
  selectedLocationId: string | null
  /** Solo la marca ve la opción *"Todas las sedes"* y el cubo *"Sin sede"*. */
  canSeeAll: boolean
  canSeeUnassigned: boolean
  locations: LocationOption[]
}

/** El nombre del parámetro. Uno solo, para que el cliente y el servidor no discrepen. */
export const LOCATION_QUERY_PARAM = 'location_id'

/** El valor que significa «todas las que puedo ver». */
export const LOCATION_ALL = 'all'

/** El valor que significa el cubo *"Sin sede"*. */
export const LOCATION_UNKNOWN = 'unknown'
