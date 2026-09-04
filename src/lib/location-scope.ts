import { createClient as createSSRClient } from '@/lib/supabase/server'
import { getUnscopedServiceClient } from '@/lib/supabase/unscoped'
import {
  LOCATION_QUERY_PARAM,
  LOCATION_ALL,
  LOCATION_UNKNOWN,
  type LocationRole,
  type LocationSelection,
  type LocationOption,
  type LocationScopeView,
} from '@/lib/location-scope-shared'

// Reexportados desde `location-scope-shared.ts` para que el código de servidor
// los siga importando de este único módulo — SOLO `LocationScopeContext.tsx`
// ('use client') tiene que importar del archivo compartido directamente, para
// no arrastrar `next/headers` al bundle del navegador (ver el comentario de
// cabecera de `location-scope-shared.ts`).
export {
  LOCATION_QUERY_PARAM,
  LOCATION_ALL,
  LOCATION_UNKNOWN,
  type LocationRole,
  type LocationSelection,
  type LocationOption,
  type LocationScopeView,
}

/**
 * `LocationScope` — el alcance de sede del usuario del panel, como TIPO OPACO.
 *
 * Multi-sede F7 · D10 · `docs/superpowers/specs/2026-09-02-multisede-design.md`
 * §5.1 (el fail-safe), §5.2 (dónde se hace cumplir) y §8.4 (el selector).
 * Migración: `supabase/migrations/00045_permisos_por_sede.sql`.
 *
 * LA IDEA, EN UNA FRASE
 * ─────────────────────
 * Las firmas de los servicios pasan de `(tenantId: string)` a `(scope: LocationScope)`,
 * y **la ruta que se olvide del filtro NO COMPILA**. Tres redes, en orden de fuerza:
 *
 *   1. el compilador          — impide el olvido ANTES de escribirlo,
 *   2. `getUnscopedServiceClient()` — el escape se ve en el import,
 *   3. un test de allowlist   — lo detecta DESPUÉS, y solo si alguien lo mantiene.
 *
 * Un test solo no basta. El tipo lo impide antes.
 *
 * POR QUÉ ESO IMPORTA MÁS QUE EL RLS AQUÍ
 * ───────────────────────────────────────
 * En toda la app hay **una sola** lectura de datos por el camino autenticado
 * (`src/app/api/dashboard/twilio-metrics/route.ts:217`); las otras 55 corren con
 * `service_role`, que se salta el RLS por definición. Las policies RESTRICTIVE de
 * la 00045 son una red barata y hay que decirlo: no aíslan el camino real.
 *
 * POR QUÉ EL TIPO ES OPACO
 * ────────────────────────
 * `LOCATION_SCOPE` es un `unique symbol` con valor real en tiempo de ejecución,
 * **creado aquí y no exportado**. Ningún otro módulo tiene el valor del símbolo, así
 * que ningún otro módulo puede escribir esa propiedad — y por tanto no puede
 * fabricar un `LocationScope` con un objeto literal ni con un `as`. (Un `declare
 * const ...: unique symbol` NO sirve para esto: es una declaración ambiental sin
 * valor real, y usarla como clave computada revienta en tiempo de ejecución con
 * "LOCATION_SCOPE is not defined" — hay que ser un `Symbol()` de verdad.)
 *
 * Un `{ ...scope }` SÍ conserva la marca al copiarla (el spread también copia
 * claves de símbolo), así que un valor ya fabricado se puede transformar; lo que
 * queda cerrado es CREARLO desde cero. La única fábrica es `requireLocationScope()`,
 * que resuelve el alcance SIEMPRE EN EL SERVIDOR contra `dashboard_user_locations`
 * — nunca contra lo que mande el navegador.
 */
const LOCATION_SCOPE: unique symbol = Symbol('LocationScope')

export interface LocationScope {
  /** Marca de opacidad. No se puede escribir desde fuera de este módulo. */
  readonly [LOCATION_SCOPE]: true

  readonly tenantId: string
  readonly role: LocationRole

  /**
   * Las sedes que este usuario PUEDE ver, pase lo que pase. Para `role='brand'`
   * son todas las activas de la marca. Es lo que dibuja el selector, no lo que
   * filtra la consulta: para eso está `locationIds`.
   */
  readonly allowedLocationIds: readonly string[]

  /**
   * ¿Este usuario puede ver el cubo *"Sin sede"* (`location_id IS NULL`)?
   * Solo la marca. Un `role='location'` **nunca** ve esas filas — §5.1.
   */
  readonly canSeeUnassigned: boolean

  /** Qué pidió esta petición. */
  readonly selection: LocationSelection

  /**
   * Las sedes que ESTA petición debe leer.
   * `null` = «sin filtro por id», que solo ocurre con `role='brand'` + `all`:
   * ahí el conjunto permitido es *todo* lo de la marca, incluido el cubo NULL, y
   * añadir un `.in(...)` con la lista de sedes activas ESCONDERÍA las filas NULL.
   */
  readonly locationIds: readonly string[] | null

  /** ¿Esta petición incluye las filas con `location_id IS NULL`? */
  readonly includesUnassigned: boolean
}

/** El resultado de resolver el alcance. Nunca lanza: la ruta responde el código. */
export type LocationScopeResult =
  | { ok: true; scope: LocationScope; locations: LocationOption[] }
  | { ok: false; status: 401 | 403 | 500; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PermissionRow {
  location_id: string | null
  role: string
}

/**
 * Fabrica el único `LocationScope` posible. Privada a propósito: es lo que hace
 * que el tipo sea opaco.
 */
function buildScope(params: {
  tenantId: string
  role: LocationRole
  allowedLocationIds: readonly string[]
  canSeeUnassigned: boolean
  selection: LocationSelection
  locationIds: readonly string[] | null
  includesUnassigned: boolean
}): LocationScope {
  return {
    [LOCATION_SCOPE]: true,
    tenantId: params.tenantId,
    role: params.role,
    allowedLocationIds: params.allowedLocationIds,
    canSeeUnassigned: params.canSeeUnassigned,
    selection: params.selection,
    locationIds: params.locationIds,
    includesUnassigned: params.includesUnassigned,
  }
}

/**
 * Decide el alcance a partir del permiso y de lo que pidió la petición. PURA: sin
 * I/O, sin `Date`, sin red — así el fail-safe del §5.1 se prueba entero sin base.
 *
 * Las cuatro filas de la tabla del §5.1 viven aquí y en `can_see_location()`
 * (00045). Están escritas dos veces a propósito —una en SQL para el RLS, otra en
 * TypeScript para el camino `service_role`— porque son dos motores distintos; el
 * test `tests/db/multisede-permisos.test.ts` comprueba que dicen lo mismo.
 */
export function decideLocationScope(params: {
  tenantId: string
  /** Filas de `dashboard_user_locations` de este usuario en esta marca. */
  permissions: readonly PermissionRow[]
  /** Sedes ACTIVAS de la marca. El umbral del fail-safe se mide sobre esto. */
  activeLocationIds: readonly string[]
  /** El valor crudo de `?location_id=`. `null`/ausente = `all`. */
  requested: string | null
}): { ok: true; scope: LocationScope } | { ok: false; status: 403; error: string } {
  const { tenantId, permissions, activeLocationIds, requested } = params

  const esMarca = permissions.some((p) => p.role === 'brand')
  const sedesDelUsuario = permissions
    .filter((p) => p.role === 'location' && p.location_id !== null)
    .map((p) => p.location_id as string)

  let role: LocationRole
  let allowed: string[]
  let canSeeUnassigned: boolean

  if (permissions.length === 0) {
    // Filas 1 y 2 del §5.1. La ausencia de fila solo es AMBIGUA con ≥2 sedes: con
    // una sola, "la marca" y "mi sede" son el mismo conjunto de filas, y un
    // fail-safe absoluto dejaría fuera a los admins de los 4 tenants vivos el día
    // del despliegue.
    if (activeLocationIds.length >= 2) {
      return {
        ok: false,
        status: 403,
        error:
          'Tu usuario no tiene sede asignada y esta marca tiene varias sedes. ' +
          'Pídele al administrador que te asigne el alcance (marca o sede).',
      }
    }
    role = 'brand'
    allowed = [...activeLocationIds]
    canSeeUnassigned = true
  } else if (esMarca) {
    // Fila 3: todas las sedes + el cubo "Sin sede".
    role = 'brand'
    allowed = [...activeLocationIds]
    canSeeUnassigned = true
  } else {
    // Fila 4: solo esas sedes, NUNCA las filas con `location_id IS NULL`.
    //
    // Se intersecta con las ACTIVAS: un permiso sobre una sede desactivada no
    // resucita la sede. Si al intersectar no queda ninguna, el usuario tiene
    // permisos pero ninguno sirve → 403 explícito, jamás un fail-open.
    const activas = new Set(activeLocationIds)
    allowed = [...new Set(sedesDelUsuario)].filter((id) => activas.has(id))
    canSeeUnassigned = false
    role = 'location'

    if (allowed.length === 0) {
      return {
        ok: false,
        status: 403,
        error:
          'Tu usuario solo tiene permiso sobre sedes que ya no están activas. ' +
          'Pídele al administrador que te reasigne.',
      }
    }
  }

  // ─── Lo que pidió la petición, colapsado al conjunto permitido ───
  //
  // "Todas" significa «todas las que ESTE usuario puede ver», no «toda la marca».
  // Si la ausencia del parámetro significara "toda la marca", cada ruta que
  // olvidara el scope filtraría de más — que es exactamente el modo de fallo que
  // el §8.4 quiere evitar.
  const pedido = requested === null || requested === '' ? LOCATION_ALL : requested

  if (pedido === LOCATION_ALL) {
    return {
      ok: true,
      scope: buildScope({
        tenantId,
        role,
        allowedLocationIds: allowed,
        canSeeUnassigned,
        selection: 'all',
        // `null` solo para la marca: es lo único que incluye el cubo NULL sin
        // enumerar sedes. Para un usuario de sede, "todas" es su lista y punto.
        locationIds: role === 'brand' ? null : allowed,
        includesUnassigned: role === 'brand',
      }),
    }
  }

  if (pedido === LOCATION_UNKNOWN) {
    if (!canSeeUnassigned) {
      return {
        ok: false,
        status: 403,
        error: 'Tu usuario es de una sede: el cubo «Sin sede» es de la marca.',
      }
    }
    return {
      ok: true,
      scope: buildScope({
        tenantId,
        role,
        allowedLocationIds: allowed,
        canSeeUnassigned,
        selection: 'unknown',
        locationIds: [],
        includesUnassigned: true,
      }),
    }
  }

  if (!UUID_RE.test(pedido)) {
    return { ok: false, status: 403, error: 'Sede no válida.' }
  }

  if (!allowed.includes(pedido)) {
    // Mismo mensaje para "no existe", "es de otra marca" y "no tienes permiso": la
    // diferencia le diría a un usuario de sede qué sedes existen en la marca.
    return { ok: false, status: 403, error: 'No tienes permiso sobre esa sede.' }
  }

  return {
    ok: true,
    scope: buildScope({
      tenantId,
      role,
      allowedLocationIds: allowed,
      canSeeUnassigned,
      selection: 'one',
      locationIds: [pedido],
      includesUnassigned: false,
    }),
  }
}

/**
 * LA ÚNICA FÁBRICA. Resuelve marca + usuario + alcance **siempre en el servidor**.
 *
 * Lee el `?location_id=` de la petición, pero nunca confía en él: solo se usa para
 * ELEGIR dentro de lo que `dashboard_user_locations` ya permitía.
 *
 * FALLA CERRADO, SIEMPRE
 * ──────────────────────
 * `supabase-js` no lanza: devuelve `{ data, error }`. Descartar el `error` haría
 * que un fallo de base fuera indistinguible de "no hay filas" — y aquí esa
 * confusión es un fail-OPEN: cero sedes activas parece «≤1 sede» y el fail-safe
 * deja ver la marca entera. Por eso cada `error` de este archivo se comprueba y se
 * convierte en un 500, nunca en una lista vacía.
 */
export async function requireLocationScope(request: Request): Promise<LocationScopeResult> {
  const ssr = await createSSRClient()
  const { data: userData, error: userError } = await ssr.auth.getUser()

  if (userError) {
    console.error('[LocationScope] No se pudo leer la sesión:', userError.message)
    return { ok: false, status: 500, error: 'No se pudo verificar la sesión.' }
  }

  const user = userData.user
  if (!user) {
    return { ok: false, status: 401, error: 'No autorizado' }
  }

  const tenantId = typeof user.app_metadata?.tenant_id === 'string' ? user.app_metadata.tenant_id : null
  if (!tenantId) {
    // Mismo caso que el `throw` de `requireTenantId()`, con código en vez de 500
    // genérico: el admin no ha vuelto a entrar desde la migración multitenant.
    return {
      ok: false,
      status: 403,
      error: 'Tu sesión no trae la marca. Cierra sesión y vuelve a entrar.',
    }
  }

  const supabase = getUnscopedServiceClient()

  const [permisos, sedes] = await Promise.all([
    supabase
      .from('dashboard_user_locations')
      .select('location_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId),
    // El `.eq('tenant_id', …)` no es decorativo: `service_role` no aísla nada.
    supabase
      .from('restaurant_locations')
      .select('id, name, slug, is_primary')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  if (permisos.error) {
    console.error('[LocationScope] No se pudieron leer los permisos de sede:', permisos.error.message)
    return { ok: false, status: 500, error: 'No se pudo resolver el alcance de sede.' }
  }
  if (sedes.error) {
    console.error('[LocationScope] No se pudieron leer las sedes:', sedes.error.message)
    return { ok: false, status: 500, error: 'No se pudo resolver el alcance de sede.' }
  }

  const activas = (sedes.data ?? []) as LocationOption[]
  const requested = new URL(request.url).searchParams.get(LOCATION_QUERY_PARAM)

  const decision = decideLocationScope({
    tenantId,
    permissions: (permisos.data ?? []) as PermissionRow[],
    activeLocationIds: activas.map((s) => s.id),
    requested,
  })

  if (!decision.ok) return decision

  // El selector solo puede ofrecer lo que el alcance permite. Recortar acá y no en
  // el navegador es lo que hace que "resuelto SIEMPRE en el servidor" sea cierto.
  const visibles = activas.filter((s) => decision.scope.allowedLocationIds.includes(s.id))

  return { ok: true, scope: decision.scope, locations: visibles }
}

/** Lo que el panel necesita para dibujar el selector, derivado del alcance ya resuelto. */
export function toScopeView(scope: LocationScope, locations: LocationOption[]): LocationScopeView {
  return {
    role: scope.role,
    selection: scope.selection,
    selectedLocationId: scope.selection === 'one' ? (scope.locationIds?.[0] ?? null) : null,
    // *"Todas las sedes"* solo se dibuja si el usuario es de marca (§8.4).
    canSeeAll: scope.role === 'brand',
    canSeeUnassigned: scope.canSeeUnassigned,
    locations,
  }
}

/**
 * El mínimo de PostgREST que hace falta para filtrar. Estructural a propósito:
 * encaja con cualquier `PostgrestFilterBuilder` sin importar sus 6 genéricos y sin
 * un solo `any` (Mandamiento IX).
 *
 * `this` en vez de un parámetro `<T>` explícito a propósito: `T extends
 * LocationFilterable<T>` obliga a TypeScript a unificar el builder de
 * supabase-js (ya profundamente genérico) contra sí mismo dentro de OTRO
 * genérico, y en algunos servicios eso revienta con "Type instantiation is
 * excessively deep and possibly infinite" (TS2589). Un tipo `this` no fuerza esa
 * unificación — cada método sigue devolviendo el tipo concreto del builder real.
 */
export interface LocationFilterable {
  eq(column: string, value: string): this
  in(column: string, values: string[]): this
  is(column: string, value: null): this
}

/**
 * Aplica el alcance a una consulta de supabase-js.
 *
 * `column` es el nombre de la columna de sede de ESA tabla, que no siempre se llama
 * `location_id`: `reward_grants` usa `granted_location_id` y `reward_redemptions`
 * usa `redeemed_location_id` — son dos sedes distintas (dónde se ganó y dónde se
 * entregó) y cruzarlas es la matriz origen→destino de D12, que es **F6**.
 *
 * Las cuatro formas, y por qué:
 *   · marca + "todas"  → **sin filtro**. Un `.in(...)` con las sedes activas
 *     escondería el cubo *"Sin sede"*, que es el histórico entero de los 4 tenants
 *     vivos.
 *   · marca + "Sin sede" → `.is(col, null)`.
 *   · una sede concreta  → `.eq(col, id)`.
 *   · usuario de sede + "todas" → `.in(col, sus sedes)`, que NUNCA trae los NULL.
 */
export function applyLocationFilter<T extends LocationFilterable>(
  query: T,
  scope: LocationScope,
  column: string
): T {
  const { locationIds, includesUnassigned } = scope

  if (locationIds === null) return query
  if (locationIds.length === 0 && includesUnassigned) return query.is(column, null)
  if (locationIds.length === 1 && !includesUnassigned) return query.eq(column, locationIds[0])
  return query.in(column, [...locationIds])
}

/**
 * La misma decisión que `applyLocationFilter()`, pero en memoria.
 *
 * Existe para las funciones que ya cargan el conjunto entero y necesitan las DOS
 * vistas de la misma lectura —la de marca y la de sede— sin pagar una consulta más.
 * `getFullAnalytics()` es el caso: el heatmap es de la sede, pero el ROI del Golden
 * Bullet es de la MARCA para siempre (§8.4), y partirlo en dos SELECT duplicaría la
 * lectura más pesada del panel.
 */
export function locationMatches(scope: LocationScope, locationId: string | null | undefined): boolean {
  if (locationId === null || locationId === undefined) return scope.includesUnassigned
  if (scope.locationIds === null) return true
  return scope.locationIds.includes(locationId)
}

/**
 * La sede a la que ESTA petición atribuiría una escritura, o `null` si el alcance
 * no señala una sola. Solo con `selection === 'one'` hay una respuesta sin adivinar.
 *
 * ⚠️ F7 **no abre escrituras de atribución nuevas**: llenar `campaigns.location_id`,
 *    `message_logs.location_id` de campañas o las dos columnas de premios son las
 *    deudas #12 y #13 de `docs/features/multi-sede.md`, y son F5/F6. Esto está aquí
 *    para que esas fases no tengan que reinventar la pregunta.
 */
export function scopeWriteLocationId(scope: LocationScope): string | null {
  return scope.selection === 'one' ? (scope.locationIds?.[0] ?? null) : null
}
