import { createClient } from '@/lib/supabase/server'

/**
 * Helpers de autorización super-admin (el operador de Cada1, dueño de la
 * cuenta matriz). El rol vive en el JWT: app_metadata.role === 'super_admin',
 * el mismo que leen las políticas RLS (is_super_admin() en SQL).
 *
 * A diferencia de un admin de tenant (que ve solo SU negocio), el super-admin
 * ve y opera sobre TODOS los tenants: billeteras, recargas, saldo matriz Twilio.
 */

export interface AdminAuthResult {
  ok: boolean
  userId: string | null
  isSuperAdmin: boolean
}

/** ¿El usuario autenticado es super-admin? Server-side (lee el JWT por cookie). */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.app_metadata?.role === 'super_admin'
}

/**
 * Para rutas de API que EXIGEN super-admin. Devuelve el estado en vez de lanzar,
 * para que el caller responda 401/403 con el mensaje adecuado.
 */
export async function requireSuperAdmin(): Promise<AdminAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, userId: null, isSuperAdmin: false }
  }
  const superAdmin = user.app_metadata?.role === 'super_admin'
  return { ok: superAdmin, userId: user.id, isSuperAdmin: superAdmin }
}
