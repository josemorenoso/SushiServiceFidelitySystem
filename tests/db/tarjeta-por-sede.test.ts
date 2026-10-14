/**
 * Sedes separadas, parte 2: la tarjeta de cada sede (2026-10-14) — contra Postgres de verdad.
 *
 * La base embebida con TODAS las migraciones (la 00074 incluida) y el código real: la tarjeta
 * pública tal como la arma el layout (`getBrandingForHost()`, con el host de la petición), las
 * rutas del panel que la guardan (`PUT /api/dashboard/locations/[id]/card`, `PUT tenant-config`)
 * y las que la leen (`GET /api/dashboard/locations`). Se falsea solo la sesión del panel y el host.
 *
 * Lo que pidió el dueño (prompt `docs/prompts/2026-10-14-sedes-separadas.md` §6, parte 2):
 *   · con la tarjeta compartida, una marca de 1 sede se ve igual que hoy, y la sede muestra SU
 *     dirección aunque la tarjeta sea la de la marca;
 *   · con tarjetas separadas, el host de Laureles ve la de Laureles y el de Envigado la suya; el
 *     dominio general de la marca, la de la marca; la otra marca, nunca nada de esta;
 *   · la whitelist (en la base y en la ruta) rechaza lo de fuera;
 *   · quien no tiene permiso recibe 403 y no se escribe nada.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'

const h = vi.hoisted(() => ({
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
  host: '',
  /** Un timeout del pooler en la escritura (`rpc`). */
  rpcFalla: false,
}))

vi.mock('@supabase/supabase-js', async () => {
  const m = await import('../setup/supabase-sobre-pg')
  return {
    createClient: () => {
      const c = m.clienteDePrueba()
      return {
        from: (t: string) => c.from(t),
        rpc: (fn: string, args: Record<string, unknown>) =>
          h.rpcFalla
            ? Promise.resolve({
                data: null,
                error: { code: '57014', message: 'canceling statement due to statement timeout', details: null, hint: null },
                count: null,
                status: 500,
                statusText: 'Internal Server Error',
              })
            : c.rpc(fn, args),
      }
    },
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.usuario }, error: null }) } }),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: h.host }) }))

const db = () => getPool()
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const creadas: TestTenant[] = []
const usuarios: string[] = []

async function marca(dominio: string, config: Record<string, unknown>): Promise<TestTenant> {
  const t = await createTestTenant()
  creadas.push(t)
  await db().query(`UPDATE tenants SET domain = $2, config = jsonb_deep_merge(COALESCE(config, '{}'::jsonb), $3::jsonb) WHERE id = $1`, [
    t.id,
    dominio,
    JSON.stringify(config),
  ])
  return t
}

async function sede(t: TestTenant, nombre: string, dominio: string, principal: boolean, config: Record<string, unknown> = {}): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, domain, is_primary, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [t.id, nombre, `s-${Math.random().toString(36).slice(2, 10)}`, dominio, principal]
  )
  const id = rows[0].id
  if (Object.keys(config).length > 0) {
    await db().query(`SELECT merge_location_config_deep($1, $2, $3::jsonb)`, [t.id, id, JSON.stringify(config)])
  }
  return id
}

async function configDeSede(id: string): Promise<Record<string, unknown>> {
  const { rows } = await db().query<{ config: Record<string, unknown> }>(`SELECT config FROM restaurant_locations WHERE id = $1`, [id])
  return rows[0].config
}

async function configDeMarca(t: TestTenant): Promise<Record<string, unknown>> {
  const { rows } = await db().query<{ config: Record<string, unknown> }>(`SELECT config FROM tenants WHERE id = $1`, [t.id])
  return rows[0].config
}

async function ponerModo(t: TestTenant, modo: string | null): Promise<void> {
  await db().query(
    modo === null
      ? `UPDATE tenants SET config = config #- '{card,mode}' WHERE id = $1`
      : `UPDATE tenants SET config = jsonb_deep_merge(config, jsonb_build_object('card', jsonb_build_object('mode', $2::text))) WHERE id = $1`,
    modo === null ? [t.id] : [t.id, modo]
  )
}

/** Quién mira el panel: un usuario con su fila de alcance (marca o sede). */
async function usuarioDelPanel(t: TestTenant, rol: 'brand' | 'location', sedeId: string | null = null): Promise<void> {
  const meta = { tenant_id: t.id }
  const { rows } = await db().query<{ id: string }>(`INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`, [
    JSON.stringify(meta),
  ])
  usuarios.push(rows[0].id)
  await db().query(
    `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [rows[0].id, t.id, sedeId, rol]
  )
  h.usuario = { id: rows[0].id, app_metadata: meta }
}

/** La tarjeta que ve el cliente en ese host: el MISMO camino que el layout raíz. */
async function tarjetaEn(host: string) {
  h.host = host
  const { getBrandingForHost } = await import('@/lib/branding-server')
  return getBrandingForHost()
}

async function guardarTarjetaDeSede(id: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const { PUT } = await import('@/app/api/dashboard/locations/[id]/card/route')
  const req = new Request(`https://panel.constelarys.com/api/dashboard/locations/${id}/card`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await PUT(req as never, { params: Promise.resolve({ id }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function guardarConfigDeMarca(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const { PUT } = await import('@/app/api/dashboard/tenant-config/route')
  const req = new Request('https://panel.constelarys.com/api/dashboard/tenant-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await PUT(req as never)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// La marca A (Tepuy, dos sedes) y la marca B (una sede).
let A: TestTenant
let B: TestTenant
let ENV: string
let LAU: string
let SEDE_B: string
const dominioA = `tepuy-${SUFIJO}.test`
const dominioEnv = `env-${SUFIJO}.test`
const dominioLau = `lau-${SUFIJO}.test`
const dominioB = `otra-${SUFIJO}.test`

const MARCA_A = {
  brand_name: 'Tepuy',
  branding: { primary: '#0a7c4a', logo_url: 'https://cdn.test/tepuy.png' },
  card: { stamp_icon: 'star', motif: 'ondas', description: 'De la marca', policies: 'Políticas de la marca', address: 'Dirección de la marca' },
}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')

  A = await marca(dominioA, MARCA_A)
  ENV = await sede(A, 'Tepuy Envigado', dominioEnv, true, { card: { address: 'Calle 30 #40, Envigado' } })
  LAU = await sede(A, 'Tepuy Laureles', dominioLau, false, { card: { address: 'Carrera 73 C3-5, Laureles', hours: 'L-D 12-22' } })

  B = await marca(dominioB, { brand_name: 'Otra marca', card: { stamp_icon: 'coffee', description: 'La marca B' } })
  SEDE_B = await sede(B, 'Sede de B', `otra-sede-${SUFIJO}.test`, true, { card: { address: 'Dirección de B' } })
})

beforeEach(async () => {
  h.usuario = null
  h.host = ''
  h.rpcFalla = false
  // Cada prueba arranca con la tarjeta compartida y sin tarjeta propia en ninguna sede.
  await ponerModo(A, null)
  for (const id of [ENV, LAU]) {
    await db().query(
      `UPDATE restaurant_locations SET config = config #- '{card,stamp_icon}' #- '{card,motif}' #- '{card,description}' #- '{card,policies}' WHERE id = $1`,
      [id]
    )
  }
})

afterAll(async () => {
  for (const t of creadas) {
    await db().query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
    await dropTestTenant(t.id)
  }
  for (const id of usuarios) await db().query('DELETE FROM auth.users WHERE id = $1', [id])
  await cerrarClienteDePrueba()
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// La base (00074)
// ═══════════════════════════════════════════════════════════════

describe('la 00074: la base acepta la tarjeta de una sede y nada de la marca', () => {
  it('el sello, la decoración, la descripción y las políticas de una sede se guardan', async () => {
    const { rows } = await db().query<{ c: Record<string, unknown> }>(`SELECT merge_location_config_deep($1, $2, $3::jsonb) AS c`, [
      A.id,
      LAU,
      JSON.stringify({ card: { stamp_icon: 'pizza', motif: 'hojas', description: 'Terraza', policies: 'Sin reservas' } }),
    ])
    expect(rows[0].c.card).toMatchObject({ stamp_icon: 'pizza', motif: 'hojas', description: 'Terraza', policies: 'Sin reservas' })
    // La ficha que ya tenía sigue ahí (merge profundo).
    expect((rows[0].c.card as Record<string, unknown>).address).toBe('Carrera 73 C3-5, Laureles')
  })

  it('el modo, el logo, los colores y el nombre de la marca no entran a una sede (23514)', async () => {
    for (const prohibido of [
      { card: { mode: 'per_location' } },
      { card: { logo_url: 'https://x.test/l.png' } },
      { branding: { primary: '#000000' } },
      { brand_name: 'Otra' },
    ]) {
      await expect(
        db().query(`SELECT merge_location_config_deep($1, $2, $3::jsonb)`, [A.id, LAU, JSON.stringify(prohibido)])
      ).rejects.toMatchObject({ code: '23514' })
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// La tarjeta pública
// ═══════════════════════════════════════════════════════════════

describe('la tarjeta pública toma la sede del QR', () => {
  it('con la tarjeta COMPARTIDA: la de la marca, con la dirección de cada sede', async () => {
    await db().query(`SELECT merge_location_config_deep($1, $2, $3::jsonb)`, [A.id, LAU, JSON.stringify({ card: { stamp_icon: 'pizza' } })])

    const enLaureles = await tarjetaEn(dominioLau)
    expect(enLaureles.name).toBe('Tepuy')
    expect(enLaureles.card.stampIcon).toBe('star') // lo guardado de la sede no se muestra
    expect(enLaureles.card.description).toBe('De la marca')
    expect(enLaureles.card.address).toBe('Carrera 73 C3-5, Laureles')
    expect(enLaureles.card.hours).toBe('L-D 12-22')

    const enEnvigado = await tarjetaEn(dominioEnv)
    expect(enEnvigado.card.stampIcon).toBe('star')
    expect(enEnvigado.card.address).toBe('Calle 30 #40, Envigado')
  })

  it('con UNA TARJETA POR SEDE: Laureles ve la de Laureles, Envigado la suya, el enlace general la de la marca', async () => {
    await ponerModo(A, 'per_location')
    await db().query(`SELECT merge_location_config_deep($1, $2, $3::jsonb)`, [
      A.id,
      LAU,
      JSON.stringify({ card: { stamp_icon: 'pizza', description: 'Laureles: terraza y música' } }),
    ])
    await db().query(`SELECT merge_location_config_deep($1, $2, $3::jsonb)`, [
      A.id,
      ENV,
      JSON.stringify({ card: { motif: 'hojas', policies: 'Envigado: sin reservas' } }),
    ])

    const lau = await tarjetaEn(dominioLau)
    expect(lau.card).toMatchObject({
      stampIcon: 'pizza',
      motif: 'ondas', // no la cambió: la de la marca
      description: 'Laureles: terraza y música',
      policies: 'Políticas de la marca',
      address: 'Carrera 73 C3-5, Laureles',
    })
    // La identidad sigue siendo de la marca: los puntos del cliente son de la marca.
    expect(lau.name).toBe('Tepuy')
    expect(lau.logoUrl).toBe('https://cdn.test/tepuy.png')
    expect(lau.primary).toBe('#0a7c4a')

    const env = await tarjetaEn(dominioEnv)
    expect(env.card).toMatchObject({
      stampIcon: 'star',
      motif: 'hojas',
      description: 'De la marca',
      policies: 'Envigado: sin reservas',
      address: 'Calle 30 #40, Envigado',
    })

    // El dominio general de una marca de dos sedes no sabe en cuál está el cliente: la de la marca.
    const general = await tarjetaEn(dominioA)
    expect(general.card).toMatchObject({ stampIcon: 'star', motif: 'ondas', description: 'De la marca', address: 'Dirección de la marca' })
  })

  it('una marca de UNA sede se ve como siempre, y nunca ve nada de la otra marca', async () => {
    await ponerModo(A, 'per_location')
    await db().query(`SELECT merge_location_config_deep($1, $2, $3::jsonb)`, [A.id, LAU, JSON.stringify({ card: { stamp_icon: 'pizza' } })])

    const enB = await tarjetaEn(dominioB)
    expect(enB.name).toBe('Otra marca')
    expect(enB.card.stampIcon).toBe('coffee')
    expect(enB.card.description).toBe('La marca B')
    expect(enB.card.address).toBe('Dirección de B') // su única sede, por el dominio raíz (sede única implícita)
    expect(JSON.stringify(enB)).not.toContain('Tepuy')
    expect(JSON.stringify(enB)).not.toContain('Laureles')
  })
})

// ═══════════════════════════════════════════════════════════════
// Quién guarda
// ═══════════════════════════════════════════════════════════════

describe('PUT /api/dashboard/locations/[id]/card — quién guarda la tarjeta de una sede', () => {
  it('un super usuario de la marca la guarda; lo que no es de la tarjeta se ignora', async () => {
    await usuarioDelPanel(A, 'brand')
    const r = await guardarTarjetaDeSede(LAU, {
      'card.stamp_icon': 'pizza',
      'card.description': 'Laureles',
      'card.address': 'NO SE ESCRIBE POR ACÁ',
      'branding.primary': '#000000',
    })
    expect(r.status).toBe(200)
    expect(r.body.paths).toEqual(['card.stamp_icon', 'card.description'])
    const c = (await configDeSede(LAU)).card as Record<string, unknown>
    expect(c.stamp_icon).toBe('pizza')
    expect(c.description).toBe('Laureles')
    expect(c.address).toBe('Carrera 73 C3-5, Laureles')
    expect(await configDeSede(LAU)).not.toHaveProperty('branding')
  })

  it('un administrador de sede recibe 403, también en SU sede, y no se escribe nada', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const antes = await configDeSede(LAU)
    const r = await guardarTarjetaDeSede(LAU, { 'card.stamp_icon': 'gem' })
    expect(r.status).toBe(403)
    expect(String(r.body.error)).toContain('super usuario')
    expect(await configDeSede(LAU)).toEqual(antes)
  })

  it('la sede de OTRA marca: 403 y la otra marca queda intacta', async () => {
    await usuarioDelPanel(A, 'brand')
    const antes = await configDeSede(SEDE_B)
    const r = await guardarTarjetaDeSede(SEDE_B, { 'card.stamp_icon': 'gem' })
    expect(r.status).toBe(403)
    expect(await configDeSede(SEDE_B)).toEqual(antes)
  })

  it('un dibujo fuera de la lista: 400 y nada escrito; sin sesión, 401; la base caída, 500', async () => {
    await usuarioDelPanel(A, 'brand')
    const antes = await configDeSede(LAU)
    expect((await guardarTarjetaDeSede(LAU, { 'card.stamp_icon': '<svg onload=alert(1)>' })).status).toBe(400)
    expect(await configDeSede(LAU)).toEqual(antes)

    h.rpcFalla = true
    expect((await guardarTarjetaDeSede(LAU, { 'card.stamp_icon': 'gem' })).status).toBe(500)
    h.rpcFalla = false

    h.usuario = null
    expect((await guardarTarjetaDeSede(LAU, { 'card.stamp_icon': 'gem' })).status).toBe(401)
    expect(await configDeSede(LAU)).toEqual(antes)
  })

  it('«Mis sedes» (la ficha) no deja escribir la tarjeta por la puerta de al lado', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const { PATCH } = await import('@/app/api/dashboard/locations/[id]/route')
    const req = new Request(`https://panel.constelarys.com/api/dashboard/locations/${LAU}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { 'card.stamp_icon': 'gem', 'card.hours': 'L-S 12-23' } }),
    })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: LAU }) })
    expect(res.status).toBe(200)
    const c = (await configDeSede(LAU)).card as Record<string, unknown>
    expect(c.hours).toBe('L-S 12-23')
    expect(c.stamp_icon).toBeUndefined()
    await db().query(`SELECT merge_location_config_deep($1, $2, '{"card":{"hours":"L-D 12-22"}}'::jsonb)`, [A.id, LAU])
  })
})

describe('la elección se guarda en la marca, y la pantalla lee cada sede', () => {
  it('un super usuario elige «Una tarjeta para cada sede» sin borrar nada de la tarjeta de la marca', async () => {
    await usuarioDelPanel(A, 'brand')
    const r = await guardarConfigDeMarca({ 'card.mode': 'per_location' })
    expect(r.status).toBe(200)
    const card = (await configDeMarca(A)).card as Record<string, unknown>
    expect(card.mode).toBe('per_location')
    expect(card.stamp_icon).toBe('star')
    expect(card.description).toBe('De la marca')
  })

  it('un administrador de sede no la cambia (403)', async () => {
    await usuarioDelPanel(A, 'location', ENV)
    expect((await guardarConfigDeMarca({ 'card.mode': 'per_location' })).status).toBe(403)
    expect(((await configDeMarca(A)).card as Record<string, unknown>).mode).toBeUndefined()
  })

  it('«Tarjeta principal» guarda con el sello de siempre (antes: 400 en toda marca sin sello elegido)', async () => {
    await usuarioDelPanel(A, 'brand')
    const r = await guardarConfigDeMarca({ 'card.stamp_icon': '', 'card.motif': '', 'card.description': 'De la marca' })
    expect(r.status).toBe(200)
    const card = (await configDeMarca(A)).card as Record<string, unknown>
    expect(card.stamp_icon).toBe('')
    expect(card.motif).toBe('')
    // Vuelve a como estaba para las demás pruebas.
    await db().query(`UPDATE tenants SET config = jsonb_deep_merge(config, $2::jsonb) WHERE id = $1`, [A.id, JSON.stringify({ card: MARCA_A.card })])
  })

  it('GET /api/dashboard/locations trae la tarjeta de cada sede, aparte de su ficha', async () => {
    await usuarioDelPanel(A, 'brand')
    await db().query(`SELECT merge_location_config_deep($1, $2, $3::jsonb)`, [A.id, LAU, JSON.stringify({ card: { stamp_icon: 'pizza' } })])
    const { GET } = await import('@/app/api/dashboard/locations/route')
    const res = await GET(new Request('https://panel.constelarys.com/api/dashboard/locations'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { locations: Array<{ id: string; card: Record<string, unknown>; config: Record<string, unknown> }> }
    const lau = body.locations.find((l) => l.id === LAU)!
    expect(lau.card['card.stamp_icon']).toBe('pizza')
    expect(lau.config['card.address']).toBe('Carrera 73 C3-5, Laureles')
    expect(lau.config).not.toHaveProperty('card.stamp_icon')
    expect(body.locations.map((l) => l.id)).not.toContain(SEDE_B)
  })
})
