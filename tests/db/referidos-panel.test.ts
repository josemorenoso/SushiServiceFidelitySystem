/**
 * Recompensas › Referidos — `GET/PUT /api/dashboard/referrals` contra Postgres real (2026-10-15).
 *
 * La sesión del panel es la de verdad (`auth.users` + `dashboard_user_locations`, el alcance lo
 * decide `requireLocationScope()`); solo se falsea `getUser()`.
 *
 *   · Guardar rechaza un premio de OTRA marca (y uno retirado), y no escribe nada.
 *   · Guardar exige alcance de marca: un administrador de sede recibe 403.
 *   · Lo guardado es lo que el check-in lee (las diez claves, de una vez).
 *   · `PUT /api/dashboard/settings` no deja escribir una clave `referral_*` por la puerta de atrás.
 *   · Los números son conteos y cuadran con la base; un fallo de base es 500, no «0».
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'

const h = vi.hoisted(() => ({
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
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
    for (const k of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete']) {
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
const PANEL = 'https://panel.constelarys.com'
const creadas: TestTenant[] = []
const usuarios: string[] = []
let tel = 0
const nuevoTelefono = () => `31${String(process.pid % 1000).padStart(3, '0')}${String(++tel).padStart(5, '0')}`

async function marca(): Promise<TestTenant> {
  const t = await createTestTenant()
  creadas.push(t)
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
async function premio(t: TestTenant, titulo: string, activo = true): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO campaign_rewards (tenant_id, title, is_active) VALUES ($1, $2, $3) RETURNING id`,
    [t.id, titulo, activo]
  )
  return rows[0].id
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
async function cliente(t: TestTenant, nombre: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_visits) VALUES ($1, $2, $3, 1) RETURNING id`,
    [t.id, nuevoTelefono(), nombre]
  )
  return rows[0].id
}
async function ajustesGuardados(t: TestTenant): Promise<Record<string, string>> {
  const { rows } = await db().query<{ key: string; value: string }>(
    `SELECT key, value FROM admin_settings WHERE tenant_id = $1 AND key LIKE 'referral_%'`,
    [t.id]
  )
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

async function leer(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import('@/app/api/dashboard/referrals/route')
  const res = await GET()
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}
async function guardar(cuerpo: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const { PUT } = await import('@/app/api/dashboard/referrals/route')
  const res = await PUT(
    new Request(`${PANEL}/api/dashboard/referrals`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }) as never
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

let A: TestTenant
let B: TestTenant
let premioA: string
let retiradoA: string
let premioB: string
let sedeA2: string

const valido = () => ({
  enabled: true,
  premioDeQuienInvita: { tipo: 'reward', rewardId: premioA },
  premioDelAmigo: { tipo: 'points', puntos: 50 },
  topeAlMes: 5,
  diasDeVencimiento: 20,
  mensaje: 'Ven con {nombre}: {enlace}',
})

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  A = await marca()
  B = await marca()
  await sede(A, 'Centro', true)
  sedeA2 = await sede(A, 'Norte')
  premioA = await premio(A, 'Rollo gratis')
  retiradoA = await premio(A, 'Postre viejo', false)
  premioB = await premio(B, 'Premio de la otra marca')
})

afterAll(async () => {
  for (const t of creadas) {
    await db().query('DELETE FROM reward_grants WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM referrals WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM customers WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM campaign_rewards WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
    await dropTestTenant(t.id)
  }
  for (const u of usuarios) await db().query('DELETE FROM auth.users WHERE id = $1', [u])
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

beforeEach(async () => {
  h.falla = null
  await usuarioDelPanel(A, 'brand')
  await db().query(`DELETE FROM admin_settings WHERE tenant_id = $1 AND key LIKE 'referral_%'`, [A.id])
})

describe('PUT /api/dashboard/referrals — guardar el programa', () => {
  it('nace apagado: el GET de una marca sin nada guardado dice apagado, con los defaults', async () => {
    const r = await leer()
    expect(r.status).toBe(200)
    expect(r.body.ajustes).toMatchObject({ enabled: false, topeAlMes: 10, diasDeVencimiento: 30 })
  })

  it('guarda las diez claves de una vez, y lo que se lee es lo guardado', async () => {
    const r = await guardar(valido())
    expect(r.status).toBe(200)
    const g = await ajustesGuardados(A)
    expect(Object.keys(g)).toHaveLength(10)
    expect(g).toMatchObject({
      referral_enabled: 'true',
      referral_referrer_reward_type: 'reward',
      referral_referrer_reward_id: premioA,
      referral_referred_reward_type: 'points',
      referral_referred_reward_points: '50',
      referral_monthly_cap: '5',
      referral_pending_expiry_days: '20',
    })
    expect((await leer()).body.ajustes).toMatchObject({ enabled: true, topeAlMes: 5, diasDeVencimiento: 20 })
  })

  it('un premio de OTRA marca: 400 y no escribe nada', async () => {
    const r = await guardar({ ...valido(), premioDeQuienInvita: { tipo: 'reward', rewardId: premioB } })
    expect(r.status).toBe(400)
    expect(String(r.body.error)).toMatch(/catálogo activo de tu marca/)
    expect(await ajustesGuardados(A)).toEqual({})
  })

  it('un premio retirado del catálogo: 400', async () => {
    const r = await guardar({ ...valido(), premioDelAmigo: { tipo: 'reward', rewardId: retiradoA } })
    expect(r.status).toBe(400)
    expect(await ajustesGuardados(A)).toEqual({})
  })

  it('encender sin premio para quien invita: 400', async () => {
    const r = await guardar({ ...valido(), premioDeQuienInvita: { tipo: 'none' } })
    expect(r.status).toBe(400)
  })

  it('un administrador de SEDE no lo cambia: 403, y no escribe', async () => {
    await usuarioDelPanel(A, 'location', sedeA2)
    const r = await guardar(valido())
    expect(r.status).toBe(403)
    expect(await ajustesGuardados(A)).toEqual({})
    // …pero lo ve.
    expect((await leer()).status).toBe(200)
  })

  it('PUT /api/dashboard/settings no deja escribir una clave de referidos (ni con un premio de otra marca)', async () => {
    const { PUT } = await import('@/app/api/dashboard/settings/route')
    const res = await PUT(
      new Request(`${PANEL}/api/dashboard/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'referral_referrer_reward_id', value: premioB }),
      }) as never
    )
    expect(res.status).toBe(400)
    expect(await ajustesGuardados(A)).toEqual({})
  })
})

describe('GET /api/dashboard/referrals — los números', () => {
  it('cuentan lo que hay en la base: registrados, vinieron, pendientes, vencidos, premios y los que más traen', async () => {
    const ana = await cliente(A, 'Ana Ruiz')
    const beto = await cliente(A, 'Beto Gil')
    const amigos = await Promise.all(['C1', 'C2', 'C3', 'C4'].map((n) => cliente(A, n)))
    const ins = async (ref: string, amigo: string, extra: string) =>
      (
        await db().query<{ id: string }>(
          `INSERT INTO referrals (tenant_id, referrer_customer_id, referred_customer_id, referred_phone, code,
                                  status, referrer_rewarded, created_at, expires_at, completed_at, expired_at)
           SELECT $1, $2, $3, c.phone, 'ABC234', ${extra} FROM customers c WHERE c.id = $3 RETURNING id`,
          [A.id, ref, amigo]
        )
      ).rows[0].id
    const r1 = await ins(ana, amigos[0], `'completed', true, now() - interval '2 days', now() + interval '28 days', now(), NULL`)
    await ins(ana, amigos[1], `'completed', false, now() - interval '2 days', now() + interval '28 days', now(), NULL`)
    await ins(ana, amigos[2], `'pending', false, now() - interval '1 day', now() + interval '29 days', NULL, NULL`)
    // Pendiente pasado de fecha: cuenta como vencido (y queda marcado al leer).
    await ins(beto, amigos[3], `'pending', false, now() - interval '40 days', now() - interval '10 days', NULL, NULL`)
    // El premio de Ana, entregado; el regalo del amigo, entregado.
    await db().query(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, referral_id, status, redeemed_at)
       VALUES ($1, $2, 'campaign_prize', 'referral', 'Rollo', $4, 'redeemed', now()),
              ($1, $3, 'campaign_prize', 'referral', 'Postre', $4, 'redeemed', now())`,
      [A.id, ana, amigos[0], r1]
    )

    const r = await leer()
    expect(r.status).toBe(200)
    expect(r.body.numeros).toEqual({
      registrados: 4,
      vinieron: 2,
      pendientes: 1,
      vencidos: 1,
      premiosGanados: 1,
      premiosEntregados: 1,
      regalosEntregados: 1,
      top: [
        { nombre: 'Ana Ruiz', vinieron: 2, registrados: 3 },
        { nombre: 'Beto Gil', vinieron: 0, registrados: 1 },
      ],
    })
    // Nada en pesos.
    expect(JSON.stringify(r.body)).not.toMatch(/\$|COP|pesos|ticket/i)
    const { rows } = await db().query(`SELECT status FROM referrals WHERE referrer_customer_id = $1`, [beto])
    expect(rows[0].status).toBe('expired')
  })

  it('un fallo de base es 500 con el porqué, nunca «0 referidos»', async () => {
    h.falla = 'referrals'
    const r = await leer()
    expect(r.status).toBe(500)
    expect(r.body).not.toHaveProperty('numeros')
    expect(String(r.body.error)).toMatch(/No pudimos leer/)
  })

  it('sin sesión: 401', async () => {
    h.usuario = null
    expect((await leer()).status).toBe(401)
  })
})
