import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { matchesProvisionSecret, parseTenantDeleteBody } from '@/lib/aios-provision'

/**
 * POST /api/aios/tenant-delete — borrar una marca ENTERA desde el AIOS.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * El AIOS puede crear una marca (`aios_provision_tenant`) pero no podía deshacerla:
 * «Borrar» allá solo borraba SU fila y el tenant se quedaba en el producto para
 * siempre, con su slug, su subdominio y sus 4 reward_tiers. Dos marcas de prueba
 * del 2026-09-11 lo destaparon.
 *
 * Es la hermana de `tenant-admin`: misma llave (`x-aios-secret`), misma razón de
 * ser (el rol `aios_constelarys` no llega a `auth.users`, y los usuarios del panel
 * de esa marca viven ahí). El borrado tiene DOS mitades y esta ruta las hace en
 * orden:
 *
 *   1. Los usuarios de Auth cuyo `app_metadata.tenant_id` es el de la marca,
 *      por la API de GoTrue (`auth.admin.deleteUser`). Nunca el super-admin.
 *   2. Todo lo demás, con `aios_delete_tenant(slug, dry_run)` (migración 00064):
 *      toda tabla con `tenant_id` y la fila de `tenants`, en UNA transacción.
 *
 * Si (1) falla a medias, (2) no corre: la marca sigue existiendo y la ruta se
 * puede repetir. Si (2) falla, los usuarios ya no están — pero sin marca no
 * entraban a nada, y crearlos de nuevo es un click en el AIOS.
 *
 * CANDADOS (los de la función, más los del cuerpo)
 *   · `dry_run` es el default: devuelve el inventario sin tocar nada. Borrar
 *     exige `dry_run: false` Y `confirm_slug` igual al slug (`parseTenantDeleteBody`).
 *   · La función se niega sobre el tenant puente de la 00028 y sobre marcas con
 *     más de 100 clientes: esas no se borran con un botón.
 *
 * CONTRATO
 *   Header : `x-aios-secret: <AIOS_ADMIN_PROVISION_SECRET>`
 *   Body   : { tenant_slug, dry_run?: boolean, confirm_slug?: string }
 *   200    : { ok, dry_run, tenant_slug, tenant_name, customers, rows: {tabla: n},
 *              total_rows, users: [{id, email}], users_deleted, warnings[] }
 *   401    : secreto ausente o incorrecto · 404 : slug inexistente
 *   409    : la función se negó (puente, demasiado grande, borrado incompleto)
 *   503    : secreto sin configurar en el producto, o la 00064 sin aplicar
 */

export const dynamic = 'force-dynamic'

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/** Los usuarios del panel de ESA marca. El super-admin nunca entra en la lista. */
async function listTenantUsers(supabase: SupabaseClient, tenantId: string) {
  const PER_PAGE = 200
  const MAX_PAGES = 25
  const users: Array<{ id: string; email: string | null }> = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) return { error, users: null }
    for (const u of data.users) {
      const meta = (u.app_metadata ?? {}) as Record<string, unknown>
      if (meta.role === 'super_admin') continue
      if (meta.tenant_id === tenantId) users.push({ id: u.id, email: u.email ?? null })
    }
    if (data.users.length < PER_PAGE) break
  }
  return { error: null, users }
}

type DeleteResult = {
  dry_run: boolean
  tenant_id: string
  slug: string
  name: string
  customers: number
  rows: Record<string, number>
  total_rows: number
}

export async function POST(req: NextRequest) {
  const secret = process.env.AIOS_ADMIN_PROVISION_SECRET
  if (!secret) {
    console.warn('[aios/tenant-delete] AIOS_ADMIN_PROVISION_SECRET no configurado — rechazando')
    return NextResponse.json(
      { error: 'Borrado deshabilitado: falta AIOS_ADMIN_PROVISION_SECRET en el producto.' },
      { status: 503 },
    )
  }
  if (!matchesProvisionSecret(secret, req.headers.get('x-aios-secret'))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }
  const parsed = parseTenantDeleteBody(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { tenantSlug, dryRun } = parsed.body

  let supabase: SupabaseClient
  try {
    supabase = getServiceClient()
  } catch {
    return NextResponse.json({ error: 'Supabase no configurado en el producto.' }, { status: 503 })
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', tenantSlug)
    .maybeSingle()
  if (isDbFailure(tenantError)) {
    logDbFailure({ scope: 'AiosTenantDelete', reason: 'tenant_read_error', error: tenantError, context: { tenant_slug: tenantSlug } })
    return NextResponse.json({ error: 'No se pudo leer la marca.' }, { status: 502 })
  }
  if (!tenant) {
    return NextResponse.json({ error: `No existe ninguna marca con slug "${tenantSlug}".` }, { status: 404 })
  }
  const tenantId = tenant.id as string
  const warnings: string[] = []

  const listed = await listTenantUsers(supabase, tenantId)
  if (listed.error || !listed.users) {
    console.error('[aios/tenant-delete] listUsers falló', { tenant_slug: tenantSlug, message: listed.error?.message })
    return NextResponse.json({ error: 'No se pudieron listar los usuarios del panel de esa marca.' }, { status: 502 })
  }
  const users = listed.users

  // ─── 1. Inventario SIEMPRE primero, borre o no ─────────────────────────────
  // Con dry_run la función no toca nada; sin él, igual se pide el inventario
  // antes de borrar usuarios: si la función se va a negar (puente, tamaño),
  // mejor enterarse con los usuarios todavía enteros.
  const inventory = await supabase.rpc('aios_delete_tenant', { p_slug: tenantSlug, p_dry_run: true })
  if (inventory.error) return refusal(inventory.error, tenantSlug)
  const preview = inventory.data as DeleteResult

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      customers: preview.customers,
      rows: preview.rows,
      total_rows: preview.total_rows,
      users,
      users_deleted: 0,
      warnings,
    })
  }

  // ─── 2. Los usuarios de Auth ───────────────────────────────────────────────
  let usersDeleted = 0
  for (const u of users) {
    const { error } = await supabase.auth.admin.deleteUser(u.id)
    if (error) {
      console.error('[aios/tenant-delete] deleteUser falló', { tenant_slug: tenantSlug, user_id: u.id, message: error.message })
      return NextResponse.json(
        {
          error: `No se pudo borrar el usuario ${u.email ?? u.id}: ${error.message}. La marca sigue entera; se puede reintentar.`,
          users_deleted: usersDeleted,
        },
        { status: 502 },
      )
    }
    usersDeleted += 1
  }

  // ─── 3. La marca, en una transacción ───────────────────────────────────────
  const deletion = await supabase.rpc('aios_delete_tenant', { p_slug: tenantSlug, p_dry_run: false })
  if (deletion.error) {
    if (usersDeleted > 0) {
      warnings.push(`Se borraron ${usersDeleted} usuario(s) del panel antes del fallo: hay que crearlos de nuevo si la marca se conserva.`)
    }
    return refusal(deletion.error, tenantSlug, warnings)
  }
  const result = deletion.data as DeleteResult

  return NextResponse.json({
    ok: true,
    dry_run: false,
    tenant_slug: tenant.slug,
    tenant_name: tenant.name,
    customers: result.customers,
    rows: result.rows,
    total_rows: result.total_rows,
    users,
    users_deleted: usersDeleted,
    warnings,
  })
}

/**
 * Las negativas con nombre de la función, en el idioma del operador. `42883`
 * (la función no existe) es «falta la 00064», no un 500.
 */
function refusal(
  error: { code?: string; message: string; details?: string | null },
  slug: string,
  warnings: string[] = [],
) {
  const detail = error.details ? ` ${error.details}` : ''
  if (error.code === '42883' || /aios_delete_tenant.*does not exist/i.test(error.message)) {
    return NextResponse.json(
      { error: 'Falta aplicar la migración 00064 en el Supabase del producto: aios_delete_tenant no existe todavía.', warnings },
      { status: 503 },
    )
  }
  switch (error.message) {
    case 'tenant_no_existe':
      return NextResponse.json({ error: `No existe ninguna marca con slug "${slug}".`, warnings }, { status: 404 })
    case 'tenant_puente':
    case 'tenant_demasiado_grande':
    case 'borrado_incompleto':
      return NextResponse.json({ error: `El producto se negó a borrar "${slug}".${detail}`, warnings }, { status: 409 })
    default:
      logDbFailure({ scope: 'AiosTenantDelete', reason: 'delete_error', error, context: { tenant_slug: slug } })
      return NextResponse.json({ error: `No se pudo borrar la marca: ${error.message}${detail}`, warnings }, { status: 502 })
  }
}
