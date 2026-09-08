/**
 * POST /api/dashboard/users/[id]/password — ponerle una contraseña nueva a un
 * usuario de la marca.
 *
 * POR QUÉ EXISTE, Y POR QUÉ ERA URGENTE
 * ─────────────────────────────────────
 * Hasta hoy **nadie** podía cambiar una contraseña. `/api/aios/tenant-admin`
 * dice explícitamente que no lo hace, y la tarjeta del AIOS remite a *"olvidé mi
 * contraseña en su propio panel"* — un flujo que **no existe**: no hay un solo
 * `resetPasswordForEmail` en el producto y `/login` no tiene enlace de
 * recuperación. O sea: un cliente que perdía la clave solo se recuperaba si
 * alguien entraba al Supabase a mano. Con 25 altas encima, esa era la fricción.
 *
 * Esto lo resuelve por el lado que NO depende de nada más: el super usuario de
 * la marca le pone una contraseña nueva a quien la perdió y se la dicta. No hace
 * falta que el SMTP de Supabase esté configurado ni que el correo llegue.
 *
 * ⚠️ El autoservicio («olvidé mi contraseña» en `/login`) sigue faltando y es lo
 *    que de verdad saca a un humano del medio. Va aparte porque depende del SMTP
 *    del proyecto de Supabase, que es una incógnita que no se descubre el día del
 *    despliegue. Está anotado en `ESTADO.md` §3.
 *
 * QUÉ NO PUEDE
 * ────────────
 *   · Cambiarle la contraseña a alguien de OTRA marca (403) ni al `super_admin`
 *     de Cada1 — `listTenantUsers()` no lo devuelve, así que no está en la lista.
 *   · Cambiársela a sí mismo. No por seguridad: porque el resultado se enseña
 *     una vez en pantalla y la sesión viva se queda como está, así que es la
 *     forma más rápida de que alguien se confunda y crea que se quedó afuera.
 *     Para eso está cerrar sesión y usar la contraseña nueva que le dé otro.
 *
 * Ref: docs/features/multi-sede.md §7.3
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireLocationScope } from '@/lib/location-scope'
import { generatePassword, listTenantUsers, MIN_PASSWORD_LENGTH } from '@/lib/dashboard-users'

export const dynamic = 'force-dynamic'

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Usuario no válido' }, { status: 400 })

    const ssr = await createClient()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const scopeResult = await requireLocationScope(request)
    if (!scopeResult.ok) {
      return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
    }
    if (scopeResult.scope.role !== 'brand') {
      return NextResponse.json(
        { error: 'Solo un super usuario puede cambiar contraseñas de la marca.' },
        { status: 403 }
      )
    }

    if (id === user.id) {
      return NextResponse.json(
        { error: 'Para cambiar tu propia contraseña, pedísela a otro super usuario de la marca.' },
        { status: 409 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const escrita = typeof body.password === 'string' ? body.password : ''
    if (escrita && escrita.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.` },
        { status: 400 }
      )
    }
    const password = escrita || generatePassword()

    const supabase = getServiceClient()

    // La comprobación de pertenencia es la lista de la marca, no una consulta a
    // `auth.users` por id: `listTenantUsers()` ya filtra por
    // `app_metadata.tenant_id` y excluye al super_admin de Cada1, así que un
    // usuario que no está en esa lista NO es de esta marca, punto.
    const { users, error: listError } = await listTenantUsers(supabase, scopeResult.scope.tenantId)
    if (listError) {
      console.error('[DashboardUsers] No se pudo listar para verificar:', listError.message)
      return NextResponse.json({ error: 'No se pudo verificar el usuario' }, { status: 500 })
    }
    const objetivo = users.find((u) => u.id === id)
    if (!objetivo) return NextResponse.json({ error: 'Ese usuario no es de tu marca.' }, { status: 403 })

    const { error: updateError } = await supabase.auth.admin.updateUserById(id, { password })
    if (updateError) {
      console.error('[DashboardUsers] updateUserById falló:', updateError.message)
      return NextResponse.json(
        { error: `No se pudo cambiar la contraseña: ${updateError.message}` },
        { status: 502 }
      )
    }

    // Se devuelve UNA vez y no se guarda en ningún lado. La pantalla la enseña
    // con un botón de copiar y avisa de que no se vuelve a mostrar.
    return NextResponse.json({ ok: true, user_id: id, email: objetivo.email, password })
  } catch (error) {
    console.error('[DashboardUsers] Error:', error)
    return NextResponse.json({ error: 'No se pudo cambiar la contraseña' }, { status: 500 })
  }
}
