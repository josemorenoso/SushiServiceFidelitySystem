/**
 * Arreglos chicos del 15-10, grupo 1 · Permisos (`docs/prompts/2026-10-15-arreglos-chicos.md`).
 *
 * Las rutas REALES sobre la base embebida con todas las migraciones
 * (`tests/setup/supabase-sobre-pg.ts`), como `tests/db/sede-operador.test.ts`. Falsa solo la
 * sesión del panel (el JWT con `app_metadata`).
 *
 *   · SEDE-MESEROS: `GET/POST/PATCH/DELETE /api/dashboard/staff` y `/staff/device` usaban
 *     `requireTenantId()`: un administrador de sede listaba y editaba los meseros y aparatos de
 *     la OTRA sede de su marca. Ahora ve su sede + los rotativos y toca solo lo de su sede; la
 *     marca y el operador, igual que antes.
 *   · N13: el PIN del supervisor (`POST /api/staff/device/register`) no tenía límite de
 *     intentos, y cada fallo decía si el celular existía.
 *   · OPERADOR-BASE-CAIDA: con la base caída, `exigirAlcanceDeMarca()` dejaba escribir al
 *     operador de Cada1. Ahora es 500 para todos.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'

const h = vi.hoisted(() => ({
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
  /** La tabla cuya lectura falla (un timeout del pooler), o `null`. */
  falla: null as null | string,
}))

vi.mock('@supabase/supabase-js', async () => {
  const m = await import('../setup/supabase-sobre-pg')
  const consultaQueFalla = () => {
    const respuesta = {
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout', details: null, hint: null },
      count: null,
      status: 500,
      statusText: 'Internal Server Error',
    }
    const q: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order', 'range', 'limit', 'like', 'ilike', 'match', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete']) {
      q[k] = () => q
    }
    q.then = (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(respuesta).then(ok, mal)
    return q
  }
  return {
    createClient: () => {
      const c = m.clienteDePrueba()
      return { from: (t: string) => (h.falla === t ? consultaQueFalla() : c.from(t)), rpc: c.rpc }
    },
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.usuario }, error: null }) },
  }),
}))

const db = () => getPool()
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const OPERADOR_ID = '00000000-0000-4000-8000-0000000000ae'

const creadas: TestTenant[] = []
const usuarios: string[] = []
let tel = 0
const nuevoTelefono = () => `31${String(process.pid % 1000).padStart(3, '0')}${String(++tel).padStart(5, '0')}`

async function marca(dominio: string): Promise<TestTenant> {
  const t = await createTestTenant()
  creadas.push(t)
  await db().query(`UPDATE tenants SET domain = $2 WHERE id = $1`, [t.id, dominio])
  return t
}

async function sede(t: TestTenant, nombre: string, principal = false): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, sort_order, is_active)
     VALUES ($1, $2, $3, $4, 0, true) RETURNING id`,
    [t.id, nombre, `s-${Math.random().toString(36).slice(2, 10)}`, principal]
  )
  return rows[0].id
}

/** `tenant_id` EXPLÍCITO siempre (el DEFAULT puente de la 00028 mandaría la fila a otra marca). */
async function mesero(
  t: TestTenant,
  nombre: string,
  opts: { sede?: string | null; rota?: boolean; phone?: string | null; role?: string; pin?: string } = {}
): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO staff_users (tenant_id, name, phone, role, location_id, works_any_location, pin)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      t.id,
      nombre,
      opts.phone ?? null,
      opts.role ?? 'waiter',
      opts.sede ?? null,
      opts.rota ?? false,
      opts.pin ? await bcrypt.hash(opts.pin, 4) : null,
    ]
  )
  return rows[0].id
}

async function aparato(t: TestTenant, sedeId: string | null, confiable = true): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO staff_devices (tenant_id, device_fingerprint, device_name, is_trusted, location_id)
     VALUES ($1, $2, 'Tablet', $3, $4) RETURNING id`,
    [t.id, `fp-${Math.random().toString(36).slice(2)}`, confiable, sedeId]
  )
  return rows[0].id
}

function operador(t: TestTenant): void {
  h.usuario = { id: OPERADOR_ID, app_metadata: { tenant_id: t.id, role: 'super_admin' } }
}

async function usuarioDelPanel(t: TestTenant, rol: 'brand' | 'location', sedeId: string | null = null): Promise<void> {
  const meta = { tenant_id: t.id }
  const { rows } = await db().query<{ id: string }>(`INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`, [
    JSON.stringify(meta),
  ])
  usuarios.push(rows[0].id)
  await db().query(
    `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role) VALUES ($1, $2, $3, $4)`,
    [rows[0].id, t.id, sedeId, rol]
  )
  h.usuario = { id: rows[0].id, app_metadata: meta }
}

const PANEL = 'https://panel.constelarys.com'

interface Lista {
  staff: Array<{ id: string }>
  devices: Array<{ id: string }>
  error?: string
}
async function listar(): Promise<{ status: number; body: Lista }> {
  const { GET } = await import('@/app/api/dashboard/staff/route')
  const res = await GET(new Request(`${PANEL}/api/dashboard/staff`) as never)
  return { status: res.status, body: (await res.json()) as Lista }
}

async function verbo(
  metodo: 'POST' | 'PATCH' | 'DELETE',
  cuerpo?: Record<string, unknown>,
  query = ''
): Promise<{ status: number; body: Record<string, unknown> }> {
  const mod = await import('@/app/api/dashboard/staff/route')
  const req = new Request(`${PANEL}/api/dashboard/staff${query}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const res = await mod[metodo](req as never)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function aparatoVerbo(metodo: 'PATCH' | 'DELETE', id: string): Promise<number> {
  const mod = await import('@/app/api/dashboard/staff/device/route')
  const req =
    metodo === 'PATCH'
      ? new Request(`${PANEL}/api/dashboard/staff/device`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ device_id: id }),
        })
      : new Request(`${PANEL}/api/dashboard/staff/device?id=${id}`, { method: 'DELETE' })
  const res = await mod[metodo](req as never)
  return res.status
}

async function filaMesero(id: string): Promise<{ is_active: boolean; location_id: string | null } | undefined> {
  const { rows } = await db().query(`SELECT is_active, location_id FROM staff_users WHERE id = $1`, [id])
  return rows[0]
}

async function limpiar(t: TestTenant): Promise<void> {
  await db().query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM staff_devices WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM staff_users WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
}

// La marca A (dos sedes) y la marca B (una sede).
let A: TestTenant
let B: TestTenant
let ENV: string
let LAU: string
const m: Record<string, string> = {}
const d: Record<string, string> = {}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')

  A = await marca(`arreglos-a-${SUFIJO}.test`)
  ENV = await sede(A, 'Envigado', true)
  LAU = await sede(A, 'Laureles')
  B = await marca(`arreglos-b-${SUFIJO}.test`)
  const SB = await sede(B, 'Sede B', true)
  await mesero(B, 'De la marca B', { sede: SB })
  await aparato(B, SB)
})

beforeEach(async () => {
  h.usuario = null
  h.falla = null
  // Cada prueba arranca con el mismo parque de la marca A.
  await db().query('DELETE FROM staff_devices WHERE tenant_id = $1', [A.id])
  await db().query('DELETE FROM staff_users WHERE tenant_id = $1', [A.id])
  m.env = await mesero(A, 'Ana de Envigado', { sede: ENV })
  m.lau = await mesero(A, 'Luis de Laureles', { sede: LAU })
  m.rota = await mesero(A, 'Rita rotativa', { rota: true })
  m.sinSede = await mesero(A, 'Supervisor sin sede', { phone: nuevoTelefono(), role: 'supervisor' })
  d.env = await aparato(A, ENV)
  d.lau = await aparato(A, LAU)
  d.sinSede = await aparato(A, null)
})

afterAll(async () => {
  for (const t of creadas) await limpiar(t)
  for (const u of usuarios) await db().query('DELETE FROM auth.users WHERE id = $1', [u])
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id).sort()

// ═══════════════════════════════════════════════════════════════
// SEDE-MESEROS
// ═══════════════════════════════════════════════════════════════

describe('SEDE-MESEROS: un administrador de sede ve y toca solo su sede (+ los rotativos, que solo ve)', () => {
  it('la lista: los de Laureles y la rotativa; ni Envigado ni «Sin sede»; solo el aparato de Laureles', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const { status, body } = await listar()
    expect(status).toBe(200)
    expect(ids(body.staff)).toEqual([m.lau, m.rota].sort())
    expect(ids(body.devices)).toEqual([d.lau])
  })

  it('editar o desactivar al mesero de Envigado: 404 y la fila queda igual', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const r = await verbo('PATCH', { id: m.env, is_active: false })
    expect(r.status).toBe(404)
    expect(await filaMesero(m.env)).toMatchObject({ is_active: true, location_id: ENV })
  })

  it('a la rotativa la ve pero no la cambia: 403 con el porqué', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const r = await verbo('PATCH', { id: m.rota, is_active: false })
    expect(r.status).toBe(403)
    expect(String(r.body.message)).toMatch(/rota entre todas las sedes/)
    expect((await filaMesero(m.rota))!.is_active).toBe(true)
  })

  it('al de su sede sí: lo desactiva (200)', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const r = await verbo('PATCH', { id: m.lau, is_active: false })
    expect(r.status).toBe(200)
    expect((await filaMesero(m.lau))!.is_active).toBe(false)
  })

  it('no se lleva a su mesero a Envigado, ni lo deja sin sede, ni lo vuelve rotativo', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    expect((await verbo('PATCH', { id: m.lau, location_id: ENV })).status).toBe(403)
    expect((await verbo('PATCH', { id: m.lau, location_id: null })).status).toBe(403)
    expect((await verbo('PATCH', { id: m.lau, location_id: null, works_any_location: true })).status).toBe(403)
    expect(await filaMesero(m.lau)).toMatchObject({ location_id: LAU })
  })

  it('crear: en su sede sí (201); en Envigado, rotativo o sin sede, no (403)', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    expect((await verbo('POST', { name: 'Nuevo de Laureles', location_id: LAU })).status).toBe(201)
    expect((await verbo('POST', { name: 'Intruso', location_id: ENV })).status).toBe(403)
    expect((await verbo('POST', { name: 'Rotativo nuevo', works_any_location: true })).status).toBe(403)
    expect((await verbo('POST', { name: 'Sup', phone: nuevoTelefono(), role: 'supervisor' })).status).toBe(403)
    const { rows } = await db().query(`SELECT name FROM staff_users WHERE tenant_id = $1 AND name = ANY($2)`, [
      A.id,
      ['Intruso', 'Rotativo nuevo', 'Sup'],
    ])
    expect(rows).toEqual([])
  })

  it('borrar al de Envigado: 404 y sigue ahí', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    expect((await verbo('DELETE', undefined, `?id=${m.env}`)).status).toBe(404)
    expect(await filaMesero(m.env)).toBeDefined()
  })

  it('los aparatos: el de Envigado y el sin sede no los revoca ni los borra; el suyo sí', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    expect(await aparatoVerbo('PATCH', d.env)).toBe(404)
    expect(await aparatoVerbo('PATCH', d.sinSede)).toBe(404)
    await db().query(`UPDATE staff_devices SET is_trusted = false WHERE id = $1`, [d.env])
    expect(await aparatoVerbo('DELETE', d.env)).toBe(404)
    const { rows } = await db().query(`SELECT is_trusted FROM staff_devices WHERE id = ANY($1)`, [[d.env, d.sinSede]])
    expect(rows).toHaveLength(2)
    expect(await aparatoVerbo('PATCH', d.lau)).toBe(200)
    expect(await aparatoVerbo('DELETE', d.lau)).toBe(200)
  })
})

describe('SEDE-MESEROS: la marca y el operador, igual que antes', () => {
  it('un usuario de marca ve los cuatro y los tres aparatos, y edita al de cualquier sede', async () => {
    await usuarioDelPanel(A, 'brand')
    const { status, body } = await listar()
    expect(status).toBe(200)
    expect(ids(body.staff)).toEqual([m.env, m.lau, m.rota, m.sinSede].sort())
    expect(ids(body.devices)).toEqual([d.env, d.lau, d.sinSede].sort())
    expect((await verbo('PATCH', { id: m.env, location_id: LAU })).status).toBe(200)
    expect((await verbo('PATCH', { id: m.rota, is_active: false })).status).toBe(200)
  })

  it('el operador de Cada1, igual que la marca; y nada de la marca B aparece', async () => {
    operador(A)
    const { status, body } = await listar()
    expect(status).toBe(200)
    expect(ids(body.staff)).toEqual([m.env, m.lau, m.rota, m.sinSede].sort())
    expect(ids(body.devices)).toEqual([d.env, d.lau, d.sinSede].sort())
  })

  it('falla cerrado: sin sesión 401; si la base no contesta, 500 (no una lista vacía)', async () => {
    expect((await listar()).status).toBe(401)
    await usuarioDelPanel(A, 'location', LAU)
    h.falla = 'restaurant_locations'
    expect((await listar()).status).toBe(500)
  })
})

// ═══════════════════════════════════════════════════════════════
// N13 — el PIN del supervisor
// ═══════════════════════════════════════════════════════════════

describe('N13: el PIN del supervisor tiene límite de intentos y no delata celulares', () => {
  const HOST = () => `arreglos-a-${SUFIJO}.test`
  async function activar(phone: string, pin: string, ip: string) {
    const { POST } = await import('@/app/api/staff/device/register/route')
    const req = new Request(`https://${HOST()}/api/staff/device/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: HOST(), 'x-forwarded-for': ip },
      body: JSON.stringify({ phone, pin, device_fingerprint: `fp-${Math.random()}`, device_name: 'Caja', location_id: LAU }),
    })
    const res = await POST(req as never)
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, retry: res.headers.get('Retry-After') }
  }

  it('con el PIN bueno activa (200)', async () => {
    const phone = nuevoTelefono()
    await mesero(A, 'Sup bueno', { phone, role: 'supervisor', pin: '4321', sede: LAU })
    expect((await activar(phone, '4321', '10.0.0.1')).status).toBe(200)
  })

  it('cinco equivocaciones y la sexta es 429 en español, aunque traiga el PIN bueno', async () => {
    const phone = nuevoTelefono()
    await mesero(A, 'Sup bloqueado', { phone, role: 'supervisor', pin: '4321', sede: LAU })
    for (let i = 0; i < 5; i++) expect((await activar(phone, '0000', '10.0.0.2')).status).toBe(401)
    const r = await activar(phone, '4321', '10.0.0.2')
    expect(r.status).toBe(429)
    expect(String(r.body.message)).toMatch(/Demasiados intentos.*Espera \d+ minutos?/)
    expect(Number(r.retry)).toBeGreaterThan(0)
  })

  it('un celular que no existe contesta EXACTAMENTE lo mismo que un PIN equivocado, y también se bloquea', async () => {
    const existe = nuevoTelefono()
    await mesero(A, 'Sup existe', { phone: existe, role: 'supervisor', pin: '4321', sede: LAU })
    const conPinMalo = await activar(existe, '0000', '10.0.0.3')
    const noExiste = await activar(nuevoTelefono(), '0000', '10.0.0.4')
    expect(conPinMalo.status).toBe(401)
    expect(noExiste.status).toBe(401)
    expect(noExiste.body).toEqual(conPinMalo.body)

    const fantasma = nuevoTelefono()
    for (let i = 0; i < 5; i++) await activar(fantasma, '0000', '10.0.0.5')
    expect((await activar(fantasma, '0000', '10.0.0.5')).status).toBe(429)
  })

  it('un mesero (no supervisor) sin PIN contesta igual que un celular que no existe: el rol no se delata antes del PIN', async () => {
    const phone = nuevoTelefono()
    await mesero(A, 'Mesero con celular', { phone, sede: LAU })
    const r = await activar(phone, '0000', '10.0.0.6')
    const otro = await activar(nuevoTelefono(), '0000', '10.0.0.7')
    expect(r.status).toBe(401)
    expect(r.body).toEqual(otro.body)
  })

  it('por IP: probar muchos celulares desde el mismo lugar también se frena', async () => {
    let ultimo = 0
    for (let i = 0; i < 21; i++) ultimo = (await activar(nuevoTelefono(), '0000', '10.0.0.8')).status
    expect(ultimo).toBe(429)
  })
})

// ═══════════════════════════════════════════════════════════════
// OPERADOR-BASE-CAIDA
// ═══════════════════════════════════════════════════════════════

describe('OPERADOR-BASE-CAIDA: si el alcance no se puede leer, nadie escribe lo de la marca', () => {
  async function guardarAjuste(): Promise<number> {
    const { PUT } = await import('@/app/api/dashboard/settings/route')
    const req = new Request(`${PANEL}/api/dashboard/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'checkin_mode', value: 'qr_only' }),
    })
    return (await PUT(req as never)).status
  }

  it('el operador con la base caída: 500 y el ajuste no se escribe', async () => {
    await db().query(`DELETE FROM admin_settings WHERE tenant_id = $1 AND key = 'checkin_mode'`, [A.id])
    operador(A)
    h.falla = 'restaurant_locations'
    expect(await guardarAjuste()).toBe(500)
    const { rows } = await db().query(`SELECT 1 FROM admin_settings WHERE tenant_id = $1 AND key = 'checkin_mode'`, [A.id])
    expect(rows).toEqual([])
  })

  it('con la base bien, el operador sigue escribiendo (200)', async () => {
    operador(A)
    expect(await guardarAjuste()).toBe(200)
    await db().query(`DELETE FROM admin_settings WHERE tenant_id = $1 AND key = 'checkin_mode'`, [A.id])
  })
})
