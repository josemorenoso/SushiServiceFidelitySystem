/**
 * GET / POST /api/dashboard/users — los accesos al panel de UNA marca.
 *
 * El dueño, 2026-09-08: *"necesito poder agregar super usuarios y
 * administradores desde el AIOS y también desde configuración desde el
 * dashboard"*. Esta es la mitad del dashboard.
 *
 * QUIÉN PUEDE ENTRAR ACÁ
 * ──────────────────────
 * **Solo un super usuario** (`role='brand'`). Un administrador de sede que
 * pudiera crear usuarios podría crearse uno de marca y ascender solo: el límite
 * entre los dos roles dejaría de existir en el primer minuto. Se responde 403 y
 * se dice por qué.
 *
 * LO QUE NUNCA HACE
 * ─────────────────
 *   · **No otorga `super_admin`.** Ese es el operador de Cada1 y ve las 25
 *     marcas; vive en `app_metadata.role` y acá no se escribe nunca. El «super
 *     usuario» de esta pantalla es el dueño de SU marca y nada más.
 *   · **No toca un correo que ya es de otra marca** (409). Reatribuir un usuario
 *     de la marca A a la marca B es el principio que no se negocia.
 *   · **No cambia la contraseña de un usuario que ya existe.** Para eso está
 *     `POST /api/dashboard/users/[id]/password`, que es una acción aparte y
 *     deliberada.
 *
 * Ref: docs/features/multi-sede.md §7.3 · migración 00045
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireLocationScope } from '@/lib/location-scope'
import {
  contarSuperUsuarios,
  findUserByEmail,
  generatePassword,
  listTenantUsers,
  setUserScope,
  MIN_PASSWORD_LENGTH,
  type DashboardRole,
} from '@/lib/dashboard-users'

export const dynamic = 'force-dynamic'

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Alcance de marca, o el 403 explicado. Se repite en las tres rutas de usuarios
 * y por eso vive acá: que la comprobación esté escrita una sola vez es lo que
 * evita que una de las tres se olvide de hacerla.
 */
async function requireBrandScope(request: NextRequest) {
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

export async function GET(request: NextRequest) {
  try {
    const guard = await requireBrandScope(request)
    if (!guard.ok) return guard.res

    const supabase = getServiceClient()
    const { users, error } = await listTenantUsers(supabase, guard.scope.tenantId)
    if (error) {
      console.error('[DashboardUsers] No se pudieron listar los usuarios:', error.message)
      return NextResponse.json({ error: 'No se pudieron leer los accesos' }, { status: 500 })
    }

    return NextResponse.json({ users, multiSede: guard.scope.brandActiveLocationCount >= 2 })
  } catch (error) {
    console.error('[DashboardUsers] Error:', error)
    return NextResponse.json({ error: 'No se pudieron leer los accesos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireBrandScope(request)
    if (!guard.ok) return guard.res
    const tenantId = guard.scope.tenantId

    const body = (await request.json()) as Record<string, unknown>

    const email = String(body.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Ese correo no parece válido.' }, { status: 400 })
    }

    const role = body.role === 'location' ? 'location' : ('brand' as DashboardRole)

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
      // Las sedes tienen que ser de ESTA marca. `allowedLocationIds` de un scope
      // de marca son exactamente sus sedes activas, así que la comprobación no
      // necesita otra consulta.
      const ajena = locationIds.find((id) => !guard.scope.allowedLocationIds.includes(id))
      if (ajena) {
        return NextResponse.json({ error: 'Esa sede no es de tu marca.' }, { status: 403 })
      }
    }

    // Contraseña: la que escriban, o una fuerte generada acá. Se devuelve UNA
    // vez y no se guarda en ningún lado — igual que el alta del AIOS.
    const escrita = typeof body.password === 'string' ? body.password : ''
    if (escrita && escrita.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.` },
        { status: 400 }
      )
    }
    const password = escrita || generatePassword()

    const supabase = getServiceClient()

    // ─── El usuario ───────────────────────────────────────────────────────────
    let userId: string
    let creado: boolean
    const avisos: string[] = []

    const { data: nuevo, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // sin esto no puede entrar hasta confirmar el correo
      app_metadata: { tenant_id: tenantId }, // lo que leen requireTenantId() y las RLS
    })

    if (!createError && nuevo?.user) {
      userId = nuevo.user.id
      creado = true
    } else {
      const code = (createError as { code?: string } | null)?.code ?? ''
      const message = createError?.message ?? ''
      const yaExiste = code === 'email_exists' || /already (been )?registered|already exists/i.test(message)
      if (!yaExiste) {
        console.error('[DashboardUsers] createUser falló:', message)
        return NextResponse.json({ error: `No se pudo crear el usuario: ${message}` }, { status: 502 })
      }

      const encontrado = await findUserByEmail(supabase, email)
      if (encontrado.error || !encontrado.user) {
        return NextResponse.json(
          { error: 'Ese correo ya tiene usuario pero no se pudo ubicar. Escribinos para revisarlo.' },
          { status: 409 }
        )
      }

      const meta = (encontrado.user.app_metadata ?? {}) as Record<string, unknown>
      if (meta.role === 'super_admin') {
        return NextResponse.json(
          { error: 'Ese correo es de un usuario interno de Cada1. Usá otro.' },
          { status: 409 }
        )
      }
      const suTenant = typeof meta.tenant_id === 'string' ? meta.tenant_id : null
      if (suTenant && suTenant !== tenantId) {
        return NextResponse.json(
          { error: 'Ese correo ya es usuario de otra marca. Usá un correo distinto.' },
          { status: 409 }
        )
      }
      if (!suTenant) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(encontrado.user.id, {
          app_metadata: { ...meta, tenant_id: tenantId },
        })
        if (updateError) {
          return NextResponse.json(
            { error: `No se pudo asignarle la marca: ${updateError.message}` },
            { status: 502 }
          )
        }
        avisos.push('Ese correo ya tenía usuario: se le dio acceso a esta marca, pero conserva la contraseña que ya tenía.')
      } else {
        avisos.push('Ese usuario ya tenía acceso a esta marca. Se le actualizó el alcance; la contraseña no se tocó.')
      }
      userId = encontrado.user.id
      creado = false
    }

    // ─── Las dos guardas que este POST no tenia ───────────────────────────────
    //
    // Este endpoint tambien REESCRIBE el alcance de un usuario que ya existe
    // (arriba, cuando el correo ya estaba en esta marca), asi que necesita
    // exactamente las mismas dos reglas que el PATCH — y no las tenia:
    //
    //   1. Nadie se toca a si mismo. Un super usuario que se manda su propio
    //      correo como «administrador de sede» se degrada solo, y despues no
    //      puede volver: administrar accesos es justo lo que acaba de perder.
    //   2. La marca no se queda sin super usuarios. Es la misma llamada de
    //      soporte, con un paso mas.
    if (!creado) {
      if (userId === guard.actorId && role === 'location') {
        return NextResponse.json(
          { error: 'No podés bajarte el alcance a vos mismo. Pedíselo a otro super usuario de la marca.' },
          { status: 409 }
        )
      }

      const { users, error: listError } = await listTenantUsers(supabase, tenantId)
      if (listError) {
        console.error('[DashboardUsers] No se pudo verificar el cambio:', listError.message)
        return NextResponse.json({ error: 'No se pudo verificar el cambio' }, { status: 500 })
      }
      const objetivo = users.find((u) => u.id === userId)
      if (objetivo?.role === 'brand' && role === 'location' && contarSuperUsuarios(users, userId) === 0) {
        return NextResponse.json(
          { error: 'Es el único super usuario de la marca. Nombrá otro antes de bajarle el alcance a una sede.' },
          { status: 409 }
        )
      }
    }

    // ─── El alcance ───────────────────────────────────────────────────────────
    const { error: scopeError } = await setUserScope(supabase, {
      userId,
      tenantId,
      role,
      locationIds,
    })
    if (scopeError) {
      console.error('[DashboardUsers] No se pudo escribir el alcance:', scopeError.message)
      return NextResponse.json(
        {
          error:
            'El usuario quedó creado pero SIN alcance de sedes, así que el panel le va a responder 403. Volvé a guardarlo desde la lista de accesos.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      created: creado,
      user_id: userId,
      email,
      role,
      // Solo cuando el usuario es NUEVO: si ya existía, esta contraseña no se
      // aplicó y enseñarla haría creer que sí.
      password: creado ? password : null,
      warnings: avisos,
    })
  } catch (error) {
    console.error('[DashboardUsers] Error:', error)
    return NextResponse.json({ error: 'No se pudo crear el acceso' }, { status: 500 })
  }
}
