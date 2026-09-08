/**
 * PATCH / DELETE /api/dashboard/users/[id] — cambiarle el alcance a un usuario
 * del panel, o quitarle el acceso.
 *
 * Solo un **super usuario** (`role='brand'`) entra acá; el porqué está en
 * `../route.ts`.
 *
 * LAS DOS REGLAS QUE NO SE PUEDEN SALTAR
 * ──────────────────────────────────────
 *   1. **Nadie se toca a sí mismo.** Ni se baja de rol ni se borra. Un dueño que
 *      se baja a administrador de una sede se queda sin poder crear usuarios,
 *      sin poder editar las otras sedes y sin forma de deshacerlo desde el
 *      panel: la única salida sería llamarnos.
 *   2. **La marca no se queda sin super usuarios.** Es la misma llamada de
 *      soporte, con un paso más: bajar al último equivale a cerrar la puerta
 *      desde afuera. Se cuenta ANTES de escribir.
 *
 * Ref: docs/features/multi-sede.md §7.3
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireLocationScope } from '@/lib/location-scope'
import { contarSuperUsuarios, listTenantUsers, setUserScope, type DashboardRole } from '@/lib/dashboard-users'

export const dynamic = 'force-dynamic'

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Alcance de marca + QUIÉN está pidiendo. El `userId` propio hace falta para la
 * regla 1 y `requireLocationScope()` no lo expone (su trabajo es el alcance, no
 * la identidad), así que se lee de la sesión igual que en el resto del panel.
 */
async function requireBrandActor(request: NextRequest) {
  const ssr = await createClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) {
    return { ok: false as const, res: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return { ok: false as const, res: NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status }) }
  }
  if (scopeResult.scope.role !== 'brand') {
    return {
      ok: false as const,
      res: NextResponse.json(
        { error: 'Solo un super usuario puede administrar los accesos de la marca.' },
        { status: 403 }
      ),
    }
  }
  return { ok: true as const, scope: scopeResult.scope, actorId: user.id }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Usuario no válido' }, { status: 400 })

    const guard = await requireBrandActor(request)
    if (!guard.ok) return guard.res
    const { scope, actorId } = guard

    if (id === actorId) {
      return NextResponse.json(
        { error: 'No podés cambiarte el alcance a vos mismo. Pedíselo a otro super usuario de la marca.' },
        { status: 409 }
      )
    }

    const body = (await request.json()) as Record<string, unknown>
    const role: DashboardRole = body.role === 'location' ? 'location' : 'brand'
    const locationIds = Array.isArray(body.location_ids)
      ? body.location_ids.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
      : []

    if (role === 'location') {
      if (locationIds.length === 0) {
        return NextResponse.json(
          { error: 'Un administrador tiene que quedar asignado al menos a una sede.' },
          { status: 400 }
        )
      }
      const ajena = locationIds.find((l) => !scope.allowedLocationIds.includes(l))
      if (ajena) return NextResponse.json({ error: 'Esa sede no es de tu marca.' }, { status: 403 })
    }

    const supabase = getServiceClient()
    const { users, error: listError } = await listTenantUsers(supabase, scope.tenantId)
    if (listError) {
      console.error('[DashboardUsers] No se pudo listar para verificar:', listError.message)
      return NextResponse.json({ error: 'No se pudo verificar el cambio' }, { status: 500 })
    }

    const objetivo = users.find((u) => u.id === id)
    // Mismo mensaje para "no existe" y "es de otra marca": la diferencia diría
    // si un correo ajeno tiene cuenta en el producto.
    if (!objetivo) return NextResponse.json({ error: 'Ese usuario no es de tu marca.' }, { status: 403 })

    // Regla 2: bajar al último super usuario deja la marca sin administrador.
    if (objetivo.role === 'brand' && role === 'location' && contarSuperUsuarios(users, id) === 0) {
      return NextResponse.json(
        { error: 'Es el único super usuario de la marca. Nombrá otro antes de bajarle el alcance a una sede.' },
        { status: 409 }
      )
    }

    const { error: scopeError } = await setUserScope(supabase, {
      userId: id,
      tenantId: scope.tenantId,
      role,
      locationIds,
    })
    if (scopeError) {
      console.error('[DashboardUsers] No se pudo escribir el alcance:', scopeError.message)
      return NextResponse.json(
        { error: 'No se pudo guardar el alcance. Volvé a intentarlo: mientras tanto ese usuario puede estar sin acceso.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, user_id: id, role })
  } catch (error) {
    console.error('[DashboardUsers] Error:', error)
    return NextResponse.json({ error: 'No se pudo guardar el acceso' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Usuario no válido' }, { status: 400 })

    const guard = await requireBrandActor(request)
    if (!guard.ok) return guard.res
    const { scope, actorId } = guard

    if (id === actorId) {
      return NextResponse.json({ error: 'No podés quitarte el acceso a vos mismo.' }, { status: 409 })
    }

    const supabase = getServiceClient()
    const { users, error: listError } = await listTenantUsers(supabase, scope.tenantId)
    if (listError) {
      console.error('[DashboardUsers] No se pudo listar para verificar:', listError.message)
      return NextResponse.json({ error: 'No se pudo verificar el cambio' }, { status: 500 })
    }

    const objetivo = users.find((u) => u.id === id)
    if (!objetivo) return NextResponse.json({ error: 'Ese usuario no es de tu marca.' }, { status: 403 })

    if (objetivo.role === 'brand' && contarSuperUsuarios(users, id) === 0) {
      return NextResponse.json(
        { error: 'Es el único super usuario de la marca: si lo quitás, nadie puede administrarla.' },
        { status: 409 }
      )
    }

    // Se borra el usuario de Auth, no solo sus filas de alcance. Un usuario del
    // panel existe ÚNICAMENTE para entrar a esta marca: dejarlo vivo sin alcance
    // sería una cuenta que sigue pudiendo iniciar sesión —y con una sola sede el
    // fail-safe del §5.1 le devolvería la marca entera—. `ON DELETE CASCADE` de
    // `dashboard_user_locations` (00045) se lleva sus filas.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(id)
    if (deleteError) {
      console.error('[DashboardUsers] deleteUser falló:', deleteError.message)
      return NextResponse.json({ error: `No se pudo quitar el acceso: ${deleteError.message}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true, user_id: id })
  } catch (error) {
    console.error('[DashboardUsers] Error:', error)
    return NextResponse.json({ error: 'No se pudo quitar el acceso' }, { status: 500 })
  }
}
