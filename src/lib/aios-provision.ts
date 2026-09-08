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
 * campo `role`**. El `app_metadata` que escribe la ruta es `{ tenant_id }` y nada
 * más, así que ningún cuerpo — venga de donde venga — puede pedir `super_admin`,
 * el rol que ve TODAS las marcas (`src/lib/admin.ts`).
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

  if (!tenantSlug) return { ok: false, error: 'Falta tenant_slug.' }
  // El slug entra en un `.eq()` parametrizado, así que esto no es defensa contra
  // inyección: es que un slug con espacios o mayúsculas NO es el slug de nadie y
  // conviene decirlo antes de ir a la base.
  if (!/^[a-z0-9-]+$/.test(tenantSlug)) return { ok: false, error: 'tenant_slug inválido.' }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Correo inválido.' }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` }
  }

  return { ok: true, body: { tenantSlug, email, password } }
}
