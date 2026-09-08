import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { matchesProvisionSecret, parseTenantAdminBody } from '@/lib/aios-provision'
import { setUserScope } from '@/lib/dashboard-users'

/**
 * POST /api/aios/tenant-admin — crear el usuario admin de una marca desde el AIOS.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * El AIOS da de alta la marca entera (`aios_provision_tenant`) pero **no puede crear el
 * usuario con el que el cliente entra**: su rol Postgres `aios_constelarys` (migración
 * `00035`, v2 endurecida) no toca `auth.users` a propósito. Hasta hoy ese era un paso
 * manual copiado a mano en el SQL Editor por cada alta — 25 veces antes del 2026-09-10,
 * y cada una con la oportunidad de pegarle el `tenant_id` equivocado a un usuario.
 *
 * Este endpoint es el cruce ESTRECHO de ese límite: la service key sigue viviendo donde
 * ya vivía (acá, en el producto), el AIOS solo guarda un secreto compartido, y la
 * creación pasa por la API oficial de GoTrue (`auth.admin.createUser`) en vez de escribir
 * a mano las filas internas de `auth.users`/`auth.identities`.
 *
 * LO QUE ESTE ENDPOINT NO HACE NUNCA
 * ──────────────────────────────────
 *  - **No otorga `role: 'super_admin'`.** Ese rol es el del operador de Cada1 y ve TODAS
 *    las marcas (`src/lib/admin.ts`). El cuerpo ni siquiera tiene un campo para pedirlo:
 *    el `app_metadata` que se escribe es `{ tenant_id }` y nada más.
 *  - **No le cambia la marca a un usuario que ya tiene otra.** Reatribuir un usuario de
 *    la marca A a la marca B es exactamente el principio que no se negocia; ante ese
 *    caso responde 409 y no toca nada.
 *  - **No cambia contraseñas por accidente.** Si el correo ya existe, la contraseña que
 *    mandó el AIOS se ignora (y se dice en la respuesta) — salvo que el cuerpo traiga
 *    `reset_password: true`, que es una decisión EXPLÍCITA del operador y no un efecto
 *    secundario del alta. Ese interruptor existe porque hasta el 2026-09-08 NADIE podía
 *    cambiar una contraseña en ningún lado: el AIOS remitía a "olvidé mi contraseña" y
 *    ese flujo **no existe** en el producto, así que la única salida era entrar al
 *    Supabase a mano. Con 25 altas encima, esa era la fricción.
 *
 * CONTRATO
 * ────────
 *   Header : `x-aios-secret: <AIOS_ADMIN_PROVISION_SECRET>`  (comparación timing-safe)
 *   Body   : { tenant_slug, email, password,
 *              reset_password?: boolean,          // pisar la clave de un usuario que ya existe
 *              scope_role?: 'brand' | 'location', // alcance en dashboard_user_locations
 *              location_ids?: string[] }          // las sedes, si scope_role = 'location'
 *   200    : { ok, created, user_id, tenant_id, tenant_slug, login_url,
 *              scope_row_created, active_locations, warnings[] }
 *   401    : secreto ausente o incorrecto · 404 : slug inexistente
 *   409    : el correo ya existe y pertenece a otra marca (o es el super-admin)
 *   503    : `AIOS_ADMIN_PROVISION_SECRET` sin configurar (fail-closed)
 *
 * Ver `docs/features/alta-usuario-admin.md`.
 */

export const dynamic = 'force-dynamic'

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/**
 * Secreto compartido con el AIOS. Sin él configurado NO se atiende nada: un endpoint que
 * crea usuarios con marca no puede tener un modo "abierto por defecto".
 */
function checkSecret(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.AIOS_ADMIN_PROVISION_SECRET
  if (!secret) {
    console.warn('[aios/tenant-admin] AIOS_ADMIN_PROVISION_SECRET no configurado — rechazando')
    return {
      ok: false,
      status: 503,
      error: 'Alta de usuarios deshabilitada: falta AIOS_ADMIN_PROVISION_SECRET en el producto.',
    }
  }
  if (!matchesProvisionSecret(secret, req.headers.get('x-aios-secret'))) {
    return { ok: false, status: 401, error: 'No autorizado.' }
  }
  return { ok: true }
}

/**
 * Buscar un usuario por correo. La API admin de GoTrue (auth-js 2.102) solo pagina, no
 * filtra por correo, así que se recorre. `auth.users` de este despliegue son los admins
 * de las marcas (decenas): los meseros viven en `staff_users` con PIN y los clientes son
 * filas de `customers`, ninguno de los dos tiene cuenta de Auth.
 */
async function findUserByEmail(supabase: SupabaseClient, email: string) {
  const PER_PAGE = 200
  const MAX_PAGES = 25 // 5.000 usuarios; muy por encima de lo que este despliegue tiene
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) return { error, user: null }
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email)
    if (hit) return { error: null, user: hit }
    if (data.users.length < PER_PAGE) break
  }
  return { error: null, user: null }
}

export async function POST(req: NextRequest) {
  const auth = checkSecret(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }
  const parsed = parseTenantAdminBody(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { tenantSlug: tenant_slug, email, password, resetPassword, scopeRole, locationIds } =
    parsed.body

  let supabase: SupabaseClient
  try {
    supabase = getServiceClient()
  } catch {
    return NextResponse.json({ error: 'Supabase no configurado en el producto.' }, { status: 503 })
  }

  // ─── 1. La marca ───────────────────────────────────────────────────────────
  // Sin filtrar por is_active: una marca recién dada de alta suele estar apagada, y el
  // cliente puede (y debe) poder entrar a revisar sus números antes de encenderla.
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug, name, domain')
    .eq('slug', tenant_slug)
    .maybeSingle()

  if (isDbFailure(tenantError)) {
    logDbFailure({ scope: 'AiosTenantAdmin', reason: 'tenant_read_error', error: tenantError, context: { tenant_slug } })
    return NextResponse.json({ error: 'No se pudo leer la marca.' }, { status: 502 })
  }
  if (!tenant) {
    return NextResponse.json({ error: `No existe ninguna marca con slug "${tenant_slug}".` }, { status: 404 })
  }
  const tenantId = tenant.id as string
  const warnings: string[] = []

  // ─── 2. El usuario ─────────────────────────────────────────────────────────
  let userId: string
  let created: boolean

  const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // sin esto no puede iniciar sesión hasta confirmar el correo
    app_metadata: { tenant_id: tenantId }, // el JWT que leen requireTenantId() y las RLS
  })

  if (!createError && createdUser?.user) {
    userId = createdUser.user.id
    created = true
  } else {
    // El único error que se recupera es "ese correo ya existe": cualquier otro se propaga.
    const code = (createError as { code?: string } | null)?.code ?? ''
    const message = createError?.message ?? ''
    const yaExiste = code === 'email_exists' || /already (been )?registered|already exists/i.test(message)
    if (!yaExiste) {
      console.error('[aios/tenant-admin] createUser falló', { tenant_slug, code, message })
      return NextResponse.json({ error: `No se pudo crear el usuario: ${message}` }, { status: 502 })
    }

    const found = await findUserByEmail(supabase, email)
    if (found.error || !found.user) {
      console.error('[aios/tenant-admin] correo existente que no se pudo ubicar', { email, error: found.error?.message })
      return NextResponse.json(
        { error: 'Ese correo ya tiene usuario, pero no se pudo ubicar para revisarlo. Resolvelo en Supabase → Authentication.' },
        { status: 409 },
      )
    }

    const existing = found.user
    const meta = (existing.app_metadata ?? {}) as Record<string, unknown>
    const suTenant = typeof meta.tenant_id === 'string' ? meta.tenant_id : null

    if (meta.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Ese correo es el del super-admin de Cada1. No se le asigna una marca desde acá.' },
        { status: 409 },
      )
    }
    if (suTenant && suTenant !== tenantId) {
      // Reatribuir un usuario de una marca a otra es la línea que no se cruza.
      return NextResponse.json(
        { error: 'Ese correo ya es el admin de OTRA marca. Usá un correo distinto para esta.' },
        { status: 409 },
      )
    }

    if (!suTenant) {
      // Usuario huérfano (existe pero sin marca): completarlo es justo lo que falta.
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        app_metadata: { ...meta, tenant_id: tenantId },
      })
      if (updateError) {
        console.error('[aios/tenant-admin] updateUserById falló', { email, message: updateError.message })
        return NextResponse.json({ error: `No se pudo asignarle la marca: ${updateError.message}` }, { status: 502 })
      }
      warnings.push('El correo ya tenía usuario sin marca: se le asignó esta. La contraseña que se generó acá NO se aplicó — sigue siendo la que ya tenía.')
    } else if (!resetPassword) {
      warnings.push('Ese usuario ya existía y ya era el admin de esta marca. No se cambió nada, ni la contraseña.')
    }

    // El reset va DESPUÉS de las tres negativas de arriba (super-admin, marca
    // ajena, huérfano): pisar una contraseña es lo último que se hace y solo
    // sobre un usuario que ya se comprobó que es de ESTA marca.
    if (resetPassword) {
      const { error: passwordError } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
      })
      if (passwordError) {
        console.error('[aios/tenant-admin] reset de contraseña falló', { email, message: passwordError.message })
        return NextResponse.json(
          { error: `No se pudo cambiar la contraseña: ${passwordError.message}` },
          { status: 502 },
        )
      }
      // Se pisa el aviso de "no se cambió nada": ahora sí se cambió, y decir las
      // dos cosas a la vez es peor que no decir ninguna.
      warnings.length = 0
      warnings.push('Ese usuario ya existía: se le puso la contraseña NUEVA que aparece abajo. La anterior dejó de servir.')
    }

    userId = existing.id
    created = false
  }

  // ─── 3. Alcance de sedes ───────────────────────────────────────────────────
  // Con una sola sede activa, decideLocationScope() le da alcance de marca sin fila
  // (src/lib/location-scope.ts). Con dos o más, la ausencia de fila es AMBIGUA y el panel
  // responde 403: ahí la fila 'brand' no es un extra, es lo que evita el 403 del primer día.
  let scopeRowCreated = false
  let activeLocations = 0

  const { data: locations, error: locError } = await supabase
    .from('restaurant_locations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  // ─── 3.bis. El alcance PEDIDO explícitamente ────────────────────────────────
  // Cuando el AIOS manda `scope_role`, esa es la respuesta y no hay nada que
  // deducir: reemplaza el alcance del usuario tal cual. Es lo que permite dar de
  // alta a un encargado de UNA sede desde el AIOS, y no solo al dueño.
  //
  // Va ANTES del bloque automático de abajo y lo cortocircuita: si el operador
  // dijo «este es administrador de Envigado», crearle además una fila de marca
  // sería justo lo contrario de lo que pidió.
  if (scopeRole) {
    const sedesValidas = new Set((locations ?? []).map((l) => l.id as string))
    const ajena = locationIds.find((id) => !sedesValidas.has(id))
    if (scopeRole === 'location' && ajena) {
      return NextResponse.json(
        { error: 'Alguna de las sedes indicadas no es de esta marca (o no está activa).' },
        { status: 409 },
      )
    }

    const { error: scopeError } = await setUserScope(supabase, {
      userId,
      tenantId,
      role: scopeRole,
      locationIds,
    })
    if (scopeError) {
      logDbFailure({ scope: 'AiosTenantAdmin', reason: 'scope_write_error', error: scopeError, context: { tenant_slug, user_id: userId } })
      warnings.push('El usuario quedó creado pero SIN alcance de sedes: el panel le va a responder 403 hasta que se le asigne uno.')
    } else {
      scopeRowCreated = true
    }

    return NextResponse.json({
      ok: true,
      created,
      user_id: userId,
      tenant_id: tenantId,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      login_url: typeof tenant.domain === 'string' && tenant.domain ? `https://${tenant.domain}/login` : null,
      scope_row_created: scopeRowCreated,
      active_locations: (locations ?? []).length,
      scope_role: scopeRole,
      warnings,
    })
  }

  if (isDbFailure(locError)) {
    logDbFailure({ scope: 'AiosTenantAdmin', reason: 'locations_read_error', error: locError, context: { tenant_slug } })
    warnings.push('No se pudieron contar las sedes: si la marca tiene dos o más, hay que darle alcance de marca a mano o el panel le responderá 403.')
  } else {
    activeLocations = locations?.length ?? 0
    if (activeLocations >= 2) {
      const { data: existingScope, error: scopeReadError } = await supabase
        .from('dashboard_user_locations')
        .select('id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .limit(1)

      if (isDbFailure(scopeReadError)) {
        logDbFailure({ scope: 'AiosTenantAdmin', reason: 'scope_read_error', error: scopeReadError, context: { tenant_slug } })
        warnings.push('No se pudo revisar el alcance de sedes. Revisá dashboard_user_locations a mano.')
      } else if (!existingScope || existingScope.length === 0) {
        const { error: scopeError } = await supabase
          .from('dashboard_user_locations')
          .insert({ user_id: userId, tenant_id: tenantId, location_id: null, role: 'brand' })
        if (scopeError) {
          logDbFailure({ scope: 'AiosTenantAdmin', reason: 'scope_insert_error', error: scopeError, context: { tenant_slug, user_id: userId } })
          warnings.push('El usuario quedó creado pero SIN alcance de sedes, y la marca tiene varias: el panel le va a responder 403 hasta que se le agregue la fila.')
        } else {
          scopeRowCreated = true
        }
      }
    }
  }

  const domain = typeof tenant.domain === 'string' && tenant.domain ? tenant.domain : null

  return NextResponse.json({
    ok: true,
    created,
    user_id: userId,
    tenant_id: tenantId,
    tenant_slug: tenant.slug,
    tenant_name: tenant.name,
    login_url: domain ? `https://${domain}/login` : null,
    scope_row_created: scopeRowCreated,
    active_locations: activeLocations,
    warnings,
  })
}
