import 'server-only'

import crypto from 'crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Los usuarios del PANEL de una marca: quién entra, con qué alcance y cómo se
 * les da o se les quita el acceso.
 *
 * DE DÓNDE SALE
 * ─────────────
 * El dueño, 2026-09-08: *"necesito poder agregar super usuarios y
 * administradores desde el AIOS y también desde configuración desde el
 * dashboard"*. Hasta hoy no había ninguna de las dos: el único camino era el
 * alta inicial del AIOS (`/api/aios/tenant-admin`), que crea UN usuario por
 * marca, no le da alcance de sede salvo el de marca, y **nunca cambia una
 * contraseña**. Un restaurante con tres locales no podía darle a cada
 * encargado su acceso, y un cliente que perdía la clave dependía de que
 * alguien entrara al Supabase a mano.
 *
 * LOS DOS ROLES, Y POR QUÉ NO HAY UN TERCERO
 * ──────────────────────────────────────────
 *   · **Super usuario** (`role='brand'`)   → ve y edita TODAS las sedes.
 *   · **Administrador** (`role='location'`) → ve y edita SOLO las suyas.
 *
 * No son un concepto nuevo: son exactamente los dos valores que
 * `dashboard_user_locations.role` acepta desde la 00045, con su CHECK, sus dos
 * índices únicos parciales y su FK compuesta `(location_id, tenant_id)`. Lo que
 * faltaba nunca fue el modelo — faltaba una pantalla que escribiera esa tabla.
 *
 * ⚠️ **`super_admin` NO ES UNO DE ESTOS.** Ese es el rol del operador de Cada1 y
 * ve las 25 marcas (`src/lib/admin.ts`). Vive en `app_metadata.role`, no en esta
 * tabla, y ninguna función de este archivo lo escribe ni lo puede escribir: el
 * «super usuario» del que habla el cliente es el dueño de SU marca.
 *
 * Ref: docs/features/multi-sede.md §7.3 · migración 00045
 */

/** Alcance de un usuario del panel. Espejo de `dashboard_user_locations.role`. */
export type DashboardRole = 'brand' | 'location'

export interface DashboardUser {
  id: string
  email: string
  /** `brand` = super usuario de la marca · `location` = administrador de sede(s). */
  role: DashboardRole
  /** Las sedes de un `location`. Vacío para `brand` (las ve todas por definición). */
  locationIds: string[]
  /**
   * `true` cuando NO tiene fila en `dashboard_user_locations`. Con una sola sede
   * eso es legítimo y significa alcance de marca (el fail-safe del §5.1); con
   * dos o más es lo que le hace responder **403** al panel, así que el panel lo
   * marca en vez de dejar que el cliente lo descubra entrando.
   */
  sinAlcanceExplicito: boolean
  createdAt: string | null
  lastSignInAt: string | null
}

/**
 * Contraseña inicial. Sin caracteres ambiguos (l/1/I, O/0) porque esto se dicta
 * por teléfono o se pega en un WhatsApp: una `l` confundida con un `1` es una
 * llamada de soporte. 20 caracteres de este alfabeto son ~114 bits.
 *
 * Mismo alfabeto y mismo criterio que `generatePassword()` del AIOS
 * (`Level 2.0/aios-constelarys/src/lib/product-auth.ts`): las dos contraseñas
 * que puede recibir un cliente se leen igual por teléfono.
 */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassword(length = 20): string {
  // `randomInt` es uniforme (rechaza el sesgo del módulo); `randomBytes()%n` no.
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)]
  return out
}

/** Mínimo de una contraseña escrita a mano. Por debajo no se acepta. */
export const MIN_PASSWORD_LENGTH = 12

/**
 * Busca un usuario por correo recorriendo la API admin de GoTrue.
 *
 * `listUsers` (auth-js 2.102) solo PAGINA, no filtra por correo. Recorrer es
 * aceptable acá porque `auth.users` de este despliegue son los admins de las
 * marcas —decenas—: los meseros viven en `staff_users` con PIN y los clientes
 * son filas de `customers`, y ninguno de los dos tiene cuenta de Auth.
 */
export async function findUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ error: Error | null; user: User | null }> {
  const objetivo = email.trim().toLowerCase()
  const PER_PAGE = 200
  const MAX_PAGES = 25 // 5.000 usuarios; muy por encima de lo que este despliegue tiene
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) return { error, user: null }
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === objetivo)
    if (hit) return { error: null, user: hit }
    if (data.users.length < PER_PAGE) break
  }
  return { error: null, user: null }
}

/**
 * Todos los usuarios de Auth que pertenecen a una marca, con su alcance ya
 * resuelto contra `dashboard_user_locations`.
 *
 * El filtro es `app_metadata.tenant_id`, que es la MISMA fuente que lee
 * `requireTenantId()` para decidir de quién es una petición: si el panel listara
 * por otro criterio, podría enseñar un usuario que en realidad no entra, o —peor—
 * callarse uno que sí.
 *
 * ⚠️ El `super_admin` de Cada1 se EXCLUYE de la lista. No es de esta marca (ve
 * todas), y enseñárselo al cliente en su pantalla de accesos invitaría a que
 * intentara borrarlo.
 */
export async function listTenantUsers(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ error: Error | null; users: DashboardUser[] }> {
  const PER_PAGE = 200
  const MAX_PAGES = 25
  const deLaMarca: User[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) return { error, users: [] }
    for (const u of data.users) {
      const meta = (u.app_metadata ?? {}) as Record<string, unknown>
      if (meta.role === 'super_admin') continue
      if (meta.tenant_id === tenantId) deLaMarca.push(u)
    }
    if (data.users.length < PER_PAGE) break
  }

  const { data: filas, error: filasError } = await supabase
    .from('dashboard_user_locations')
    .select('user_id, location_id, role')
    .eq('tenant_id', tenantId)

  // Sin mirar el error, un fallo de base se leería como "ninguno tiene alcance
  // explícito", que es justo lo que el panel usa para avisar del 403: diría que
  // TODOS están mal configurados. Se propaga.
  if (filasError) return { error: filasError, users: [] }

  const porUsuario = new Map<string, { role: DashboardRole; locationIds: string[] }>()
  for (const f of filas ?? []) {
    const uid = f.user_id as string
    const rol = f.role as DashboardRole
    const actual = porUsuario.get(uid)
    if (!actual) {
      porUsuario.set(uid, {
        role: rol,
        locationIds: f.location_id ? [f.location_id as string] : [],
      })
      continue
    }
    // Una fila 'brand' gana sobre cualquier fila de sede: es lo mismo que decide
    // `decideLocationScope()` (`permissions.some(p => p.role === 'brand')`).
    if (rol === 'brand') actual.role = 'brand'
    if (f.location_id) actual.locationIds.push(f.location_id as string)
  }

  const users: DashboardUser[] = deLaMarca.map((u) => {
    const alcance = porUsuario.get(u.id)
    return {
      id: u.id,
      email: u.email ?? '',
      role: alcance?.role ?? 'brand',
      locationIds: alcance?.role === 'location' ? (alcance.locationIds ?? []) : [],
      sinAlcanceExplicito: alcance === undefined,
      createdAt: u.created_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
    }
  })

  users.sort((a, b) => a.email.localeCompare(b.email))
  return { error: null, users }
}

/**
 * Reescribe el alcance de un usuario: borra sus filas y pone las nuevas.
 *
 * Borrar-y-poner en vez de un upsert fino porque el alcance es un CONJUNTO, no
 * una lista de ajustes: pasar de «Laureles y Envigado» a «solo Envigado» tiene
 * que quitar una fila, y un upsert no quita nada. Como la tabla tiene dos únicos
 * parciales (uno para `brand`, otro para `(user, tenant, location)`), reinsertar
 * lo mismo es idempotente.
 *
 * NO es atómico: PostgREST no expone transacciones. Si el INSERT falla después
 * del DELETE, el usuario queda SIN filas — que con dos o más sedes significa 403
 * hasta que alguien lo arregle. Por eso el llamador informa el fallo con esas
 * palabras en vez de un "no se pudo guardar" genérico.
 */
export async function setUserScope(
  supabase: SupabaseClient,
  params: { userId: string; tenantId: string; role: DashboardRole; locationIds: readonly string[] }
): Promise<{ error: Error | null }> {
  const { userId, tenantId, role, locationIds } = params

  const { error: deleteError } = await supabase
    .from('dashboard_user_locations')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)

  if (deleteError) return { error: deleteError }

  const filas =
    role === 'brand'
      ? [{ user_id: userId, tenant_id: tenantId, location_id: null, role: 'brand' }]
      : [...new Set(locationIds)].map((location_id) => ({
          user_id: userId,
          tenant_id: tenantId,
          location_id,
          role: 'location',
        }))

  if (filas.length === 0) return { error: null }

  const { error: insertError } = await supabase.from('dashboard_user_locations').insert(filas)
  return { error: insertError }
}

/**
 * ¿Cuántos super usuarios ACTIVOS le quedan a la marca si se le quita el acceso
 * (o se le baja el rol) a `excluyendo`?
 *
 * Existe para una sola regla, y es la que evita la llamada de soporte más cara
 * de todas: **una marca no se puede quedar sin nadie que pueda administrarla.**
 * Un super usuario que se baja a sí mismo a administrador de una sede deja el
 * restaurante sin quien cree usuarios, sin quien edite las otras sedes y sin
 * forma de arreglarlo desde el panel.
 */
export function contarSuperUsuarios(users: readonly DashboardUser[], excluyendo?: string): number {
  return users.filter((u) => u.id !== excluyendo && u.role === 'brand').length
}
