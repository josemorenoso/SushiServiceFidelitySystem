import crypto from 'crypto'

/**
 * Las dos decisiones PURAS de `POST /api/aios/tenant-admin`: quién entra y qué se
 * acepta. Viven acá, fuera del route handler, porque son lo único de esa ruta que
 * se puede ejercer sin una base de datos — y son justo lo que no puede aflojarse
 * sin que nadie se entere (`tests/unit/aios-provision.test.ts`).
 */

/** Mínimo de la contraseña inicial. El AIOS genera 20; esto es el piso. */
export const MIN_PASSWORD_LENGTH = 12

export interface TenantAdminBody {
  tenantSlug: string
  email: string
  password: string
  /**
   * `true` = si el correo YA existe en esta marca, ponerle la contraseña que
   * viene en `password` en vez de ignorarla.
   *
   * Es una decisión EXPLÍCITA y por eso es un campo aparte en vez de un cambio
   * de comportamiento del alta: pisarle la contraseña a alguien que ya entra es
   * exactamente lo que el alta se niega a hacer sola. Existe porque hasta hoy
   * NADIE podía cambiar una contraseña —el AIOS remite a "olvidé mi contraseña"
   * y ese flujo no existe en el producto—, así que la única salida era entrar al
   * Supabase a mano.
   */
  resetPassword: boolean
  /**
   * Alcance del usuario en `dashboard_user_locations` (00045):
   * `brand` = super usuario (todas las sedes) · `location` = administrador de
   * las sedes de `locationIds`.
   *
   * ⚠️ NO es un rol de Auth. Ver el comentario de `parseTenantAdminBody()`.
   */
  scopeRole: 'brand' | 'location' | null
  /** Las sedes de un `scopeRole = 'location'`. Vacío en cualquier otro caso. */
  locationIds: string[]
}

/**
 * ¿El secreto que llegó es el nuestro? Comparación en tiempo constante, igual que
 * `verifyZernioSignature`.
 *
 * Sin `expected` configurado devuelve **false**: una ruta que crea usuarios con
 * marca no puede tener un modo "abierta porque falta la variable".
 */
export function matchesProvisionSecret(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false
  const a = Buffer.from(expected, 'utf-8')
  const b = Buffer.from(received, 'utf-8')
  // timingSafeEqual exige el mismo largo. Comparar largos antes no filtra nada útil:
  // el largo de un secreto no es lo que se adivina byte a byte.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Valida el cuerpo del alta.
 *
 * Lo que NO tiene este parser es tan importante como lo que tiene: **no existe un
 * campo para el rol de Auth**. El `app_metadata` que escribe la ruta es
 * `{ tenant_id }` y nada más, así que ningún cuerpo — venga de donde venga —
 * puede pedir `super_admin`, el rol que ve TODAS las marcas (`src/lib/admin.ts`).
 *
 * `scope_role` SÍ existe, y no es lo mismo ni por asomo: vive en
 * `dashboard_user_locations` (00045), solo distingue «ve todas las sedes de SU
 * marca» de «ve estas sedes», y no puede sacar a nadie de su marca. Los nombres
 * se mantienen distintos a propósito para que nadie los confunda leyendo rápido.
 */
export function parseTenantAdminBody(
  raw: unknown,
): { ok: true; body: TenantAdminBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Cuerpo inválido.' }
  }
  const r = raw as Record<string, unknown>
  const tenantSlug = typeof r.tenant_slug === 'string' ? r.tenant_slug.trim() : ''
  const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : ''
  const password = typeof r.password === 'string' ? r.password : ''
  const resetPassword = r.reset_password === true
  const scopeRole =
    r.scope_role === 'brand' || r.scope_role === 'location' ? r.scope_role : null
  const locationIds = Array.isArray(r.location_ids)
    ? r.location_ids.filter(
        (v): v is string =>
          typeof v === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      )
    : []

  if (!tenantSlug) return { ok: false, error: 'Falta tenant_slug.' }
  // El slug entra en un `.eq()` parametrizado, así que esto no es defensa contra
  // inyección: es que un slug con espacios o mayúsculas NO es el slug de nadie y
  // conviene decirlo antes de ir a la base.
  if (!/^[a-z0-9-]+$/.test(tenantSlug)) return { ok: false, error: 'tenant_slug inválido.' }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Correo inválido.' }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` }
  }

  // Un administrador SIN sedes no tendría acceso a nada y el panel le
  // respondería 403 sin decir por qué: se corta acá, que es donde hay algo que
  // explicar.
  if (scopeRole === 'location' && locationIds.length === 0) {
    return { ok: false, error: 'Un administrador de sede necesita al menos una sede (location_ids).' }
  }

  return { ok: true, body: { tenantSlug, email, password, resetPassword, scopeRole, locationIds } }
}

// ─── Borrado de una marca (POST /api/aios/tenant-delete) ────────────────────

export interface TenantDeleteBody {
  tenantSlug: string
  /**
   * `true` = solo el inventario (qué se borraría, tabla por tabla, y cuántos
   * usuarios del panel). Es el default: borrar exige `dry_run: false` explícito
   * Y `confirm_slug` igual al slug, las dos cosas. Una ruta que borra una marca
   * no puede tener un cuerpo «vacío» que borre.
   */
  dryRun: boolean
}

/**
 * Valida el cuerpo del borrado. Dos candados a propósito, uno de forma y otro de
 * intención: `dry_run` tiene que ser exactamente `false` para borrar, y
 * `confirm_slug` tiene que repetir el slug letra por letra. Un cuerpo que trae
 * solo uno de los dos vuelve como `dry_run: true`, nunca como error — el
 * inventario es inofensivo y es lo que el operador quiere ver primero.
 */
export function parseTenantDeleteBody(
  raw: unknown,
): { ok: true; body: TenantDeleteBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Cuerpo inválido.' }
  }
  const r = raw as Record<string, unknown>
  const tenantSlug = typeof r.tenant_slug === 'string' ? r.tenant_slug.trim() : ''
  if (!tenantSlug) return { ok: false, error: 'Falta tenant_slug.' }
  if (!/^[a-z0-9-]+$/.test(tenantSlug)) return { ok: false, error: 'tenant_slug inválido.' }

  const confirmSlug = typeof r.confirm_slug === 'string' ? r.confirm_slug.trim() : ''
  const wantsDelete = r.dry_run === false && confirmSlug === tenantSlug
  return { ok: true, body: { tenantSlug, dryRun: !wantsDelete } }
}
