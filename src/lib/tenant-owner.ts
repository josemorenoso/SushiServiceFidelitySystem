import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

/**
 * ¿Quién puede APRETAR los botones de Conexiones?
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * Conexiones es la única pantalla del panel donde un clic **gasta plata** (comprar una
 * línea) o **cambia por qué número sale el WhatsApp de la marca**. El panel hoy solo
 * distingue dos cosas: admin de tenant y super-admin (`src/lib/admin.ts`). Con eso,
 * cualquier encargado con usuario podría conectar una WABA o comprar un número.
 *
 * La decisión del dueño (2026-09-06, §11.4 del diseño) es: **todos VEN, solo el dueño
 * ACTÚA**. Ver por qué número sale su WhatsApp es la mitad del valor del apartado y el
 * encargado lo necesita cuando algo falla; cambiar el estado, no.
 *
 * No hace falta ni tabla ni rol nuevo: la columna `tenants.owner_email` existe desde la
 * 00033 y hasta hoy **no la leía ni una línea del producto**. Solo la escribe el
 * super-admin en el alta, igual que `price_per_message_cop`, y **no vive en
 * `tenants.config`** — que es público y lo edita el propio tenant.
 *
 * FAIL-CLOSED, NUNCA FAIL-OPEN
 * ────────────────────────────
 * - `owner_email IS NULL` ⇒ **nadie es dueño**. Solo el super-admin actúa, y la pantalla
 *   lo dice con todas sus letras («falta registrar al dueño de este negocio»). No
 *   estranda a nadie: el alta la hace el operador de todos modos.
 * - Un **fallo de base** también cierra la puerta. Es la trampa de `supabase-js`: sin
 *   destructurar `error`, un timeout del pooler devolvería `data = null`,
 *   indistinguible de «este tenant no tiene dueño» — y ahí la diferencia entre las dos
 *   lecturas es quién puede gastar dinero.
 *
 * ⚠️ `owner_email` NO es la cuenta de Meta. Son dos identidades que no se tocan: esta se
 * compara contra el email con el que la persona **entra al panel** (Supabase Auth); la de
 * Meta solo vive en el popup del Embedded Signup y nunca llega hasta acá. → diseño §5.
 */

export interface TenantOwnerCheck {
  /** ¿Puede ejecutar acciones que cambian estado o gastan? */
  canAct: boolean
  /** El super-admin (operador de Cada1) siempre puede: es quien paga. */
  isSuperAdmin: boolean
  /** El email de la sesión coincide con `tenants.owner_email`. */
  isOwner: boolean
  /**
   * ¿El tenant tiene dueño registrado? `false` = `owner_email IS NULL`, y la pantalla
   * tiene que DECIRLO en vez de mostrar botones que van a fallar.
   */
  ownerRegistered: boolean
  /** Por qué no puede actuar. `null` cuando sí puede. */
  reason: 'sin_sesion' | 'sin_dueno_registrado' | 'no_es_el_dueno' | 'fallo_de_lectura' | null
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * La comparación, aislada y pura para poder probarla sin base ni sesión.
 *
 * `lower(trim(...))`: el email del JWT llega tal cual lo tecleó la persona al registrarse
 * y `owner_email` tal cual lo pegó el operador en el alta — un espacio al final o una
 * mayúscula bastarían para dejar al dueño fuera de sus propios botones, y la causa sería
 * invisible en pantalla.
 */
export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (!na || !nb) return false
  return na === nb
}

/**
 * ¿El usuario de la sesión puede actuar sobre las conexiones de ESTE tenant?
 *
 * El `tenantId` lo resuelve el llamador **de la sesión** (`requireTenantId()`), jamás de
 * un parámetro de la petición: si viniera del cliente, un admin de la marca A pediría los
 * botones de la marca B.
 */
export async function isTenantOwner(tenantId: string): Promise<TenantOwnerCheck> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { canAct: false, isSuperAdmin: false, isOwner: false, ownerRegistered: false, reason: 'sin_sesion' }
  }

  const superAdmin = user.app_metadata?.role === 'super_admin'

  const service = getServiceClient()
  const { data, error } = await service
    .from('tenants')
    .select('owner_email')
    .eq('id', tenantId)
    .maybeSingle()

  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'owner_email_read_error',
      error,
      context: { tenant_id: tenantId },
    })
    // Fail-closed incluso para el super-admin: si no sabemos de quién es el negocio,
    // nadie compra una línea a nombre de nadie.
    return { canAct: false, isSuperAdmin: superAdmin, isOwner: false, ownerRegistered: false, reason: 'fallo_de_lectura' }
  }

  const ownerEmail = data?.owner_email ?? null
  const ownerRegistered = !!(ownerEmail && ownerEmail.trim())
  const isOwner = emailsMatch(user.email, ownerEmail)

  if (superAdmin) {
    return { canAct: true, isSuperAdmin: true, isOwner, ownerRegistered, reason: null }
  }
  if (!ownerRegistered) {
    return { canAct: false, isSuperAdmin: false, isOwner: false, ownerRegistered: false, reason: 'sin_dueno_registrado' }
  }
  if (!isOwner) {
    return { canAct: false, isSuperAdmin: false, isOwner: false, ownerRegistered: true, reason: 'no_es_el_dueno' }
  }
  return { canAct: true, isSuperAdmin: false, isOwner: true, ownerRegistered: true, reason: null }
}

/** El 403 que corresponde a cada motivo, en el idioma del cliente. */
export function ownerDenialMessage(reason: TenantOwnerCheck['reason']): string {
  switch (reason) {
    case 'sin_dueno_registrado':
      return 'Para conectar WhatsApp falta registrar al dueño de este negocio — lo hace tu asesor.'
    case 'no_es_el_dueno':
      return 'Solo el dueño registrado de este negocio puede cambiar las conexiones.'
    case 'fallo_de_lectura':
      return 'No se pudo verificar quién es el dueño de este negocio. Intenta de nuevo en un momento.'
    default:
      return 'No autorizado'
  }
}
