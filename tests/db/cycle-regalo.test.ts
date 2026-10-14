/**
 * «Mandar un regalo» y «incluir dormidos» (fase 2 del ciclo, parte C, 2026-10-14) contra
 * Postgres de verdad: la ruta REAL (`/api/dashboard/cycle/gift`), el drenador REAL
 * (`/api/cron/queue-drain`) y el cron REAL (`/api/cron/reactivation`), con todas las migraciones
 * (la 00073 incluida) a través de `tests/setup/supabase-sobre-pg.ts`.
 *
 * LO QUE SE FIJA (y falla contra el código anterior: la ruta no existía, el drenador no sabía
 * del regalo de un envío que no es un toque, y el ciclo solo miraba los regalos `reactivation`):
 *   · El regalo se otorga AL ENVIAR, no al programar, con la fecha límite calculada AL ENVIAR
 *     según la regla del dueño (domingo, 3/7/14 días) y en la variable de SU plantilla.
 *   · El mismo adaptador que el ciclo: «Regalo que vence» aprobada, o la insistente.
 *   · Un regalo vivo por cliente: no se programa, no sale si al enviar ya tiene uno, y el ciclo
 *     no le apila el suyo encima al del dueño.
 *   · «Escribirlo y queda»: un regalo escrito a mano entra al catálogo.
 *   · Cuenta como manual: `campaigns.source = 'manual'`, suma a la fatiga.
 *   · No pasa por la Recovery Zone del camino viejo.
 *   · Escribir es de la marca (403 a un administrador de sede); un fallo de base es 500.
 *   · «Incluir a los dormidos» (00073) se guarda y decide la audiencia del evento.
 *
 * Falsos solo: el envío por WhatsApp (graba lo que se mandó), la pregunta a Twilio de si
 * «Regalo que vence» está aprobada y el saldo de la billetera (siempre alcanza).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'
import { bogotaDay, expiresOnSunday } from '@/lib/cycle-engine'
import { formatGiftDeadline, instanteEnBogota, venceSegunRegla } from '@/lib/cycle-touch'
import type { ResultadoDelRegalo, VistaPreviaDelRegalo } from '@/services/cycle-gift.service'
import type { CycleOverview } from '@/services/cycle-overview.service'

type Vista = VistaPreviaDelRegalo & { error?: string }
type Programado = Partial<Extract<ResultadoDelRegalo, { ok: true }>> & { error?: string }

const h = vi.hoisted(() => ({
  envios: [] as Array<{ telefono: string; plantilla: string; variables: Record<string, string>; tenantId: string }>,
  aprobadaEnTwilio: true,
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
  falla: null as null | string,
  misMarcas: new Set<string>(),
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
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.usuario }, error: null }) } }),
}))
vi.mock('@/lib/validators/cron', () => ({ validateCronSecret: () => true }))
vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: vi.fn(
    async (telefono: string, plantilla: string, variables: Record<string, string>, tenant: { id: string }) => {
      h.envios.push({ telefono, plantilla, variables, tenantId: tenant.id })
      return { sid: `SM${h.envios.length}`, status: 'sent' }
    }
  ),
}))
vi.mock('@/services/twilio-catalog.service', () => ({
  isTwilioTemplateApproved: async () => h.aprobadaEnTwilio,
}))
vi.mock('@/services/wallet.service', async (original) => {
  const real = await original<typeof import('@/services/wallet.service')>()
  return {
    ...real,
    canSendBulk: async (_tenant: string, n: number) => ({ ok: true, balanceCop: 0, pricePerMessage: 0, messagesAvailable: n, needed: n, shortfallCop: 0 }),
  }
})
// El drenador es global: se acota a las marcas de ESTE archivo (como `cycle-envios.test.ts`).
vi.mock('@/services/send-queue.service', async (original) => {
  const real = await original<typeof import('@/services/send-queue.service')>()
  const { getPool: pool } = await import('../setup/db')
  const mias = () => [...h.misMarcas]
  return {
    ...real,
    getPendingTenants: async () => (await real.getPendingTenants()).filter((t) => h.misMarcas.has(t.tenant_id)),
    expireQueue: async () => {
      const { rowCount } = await pool().query(
        `UPDATE send_queue SET status = 'expired', last_error = 'expires_at vencido antes de encontrar cupo'
          WHERE status = 'queued' AND expires_at IS NOT NULL AND expires_at <= now() AND tenant_id = ANY($1)`,
        [mias()]
      )
      return rowCount ?? 0
    },
    getFinishedCampaigns: async () => {
      const ids = await real.getFinishedCampaigns()
      const { rows } = await pool().query<{ id: string }>('SELECT id FROM campaigns WHERE id = ANY($1) AND tenant_id = ANY($2)', [ids, mias()])
      return rows.map((r) => r.id)
    },
    pruneSendGovernance: async () => {},
  }
})

// ═══════════════════════════════════════════════════════════════
// Marcas, clientes, quién mira
// ═══════════════════════════════════════════════════════════════

const db = () => getPool()
const hoy = () => bogotaDay(new Date())

interface Marca extends TestTenant {
  pequeno: string
  fuerte: string
}
const creadas: Marca[] = []
const usuarios: string[] = []

let telefono = 0
const nuevoTelefono = () => `33${String(process.pid % 1000).padStart(3, '0')}${String(++telefono).padStart(5, '0')}`

async function ajuste(t: TestTenant, key: string, value: string) {
  await db().query(
    `INSERT INTO admin_settings (key, value, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value`,
    [key, value, t.id]
  )
}

async function nuevaMarca(opts: { encendido?: boolean } = {}): Promise<Marca> {
  const t = await createTestTenant()
  h.misMarcas.add(t.id)
  await db().query(`UPDATE tenants SET config = $2::jsonb WHERE id = $1`, [t.id, JSON.stringify({ has_delivery_webhook: true, brand_name: 'Sushi Prueba' })])
  const premio = async (titulo: string) =>
    (await db().query<{ id: string }>(`INSERT INTO campaign_rewards (tenant_id, title) VALUES ($1, $2) RETURNING id`, [t.id, titulo])).rows[0].id
  const marca: Marca = { ...t, pequeno: await premio('Postre del chef'), fuerte: await premio('Rollo gratis') }
  creadas.push(marca)
  const base: Record<string, string> = {
    cycle_enabled: opts.encendido === false ? 'false' : 'true',
    cycle_enabled_at: new Date(Date.now() - 200 * 86_400_000).toISOString(),
    cycle_rhythm: 'restaurant', // 14 · 28 · 42 · 60 · 80
    cycle_holdout_pct: '0',
    cycle_send_slot: 'dinner',
    cycle_small_reward_ids: marca.pequeno,
    cycle_strong_reward_id: marca.fuerte,
    reactivation_no_reward_template_sid: 'HX_SUAVE',
    reactivation_aggressive_template_sid: 'HX_INSISTENTE',
    gift_expiring_template_sid: 'HX_REGALO',
    campaign_presencial_to_domicilio_template_sid: 'HX_A_CASA',
    campaign_domicilio_to_presencial_template_sid: 'HX_AL_LOCAL',
  }
  for (const [k, v] of Object.entries(base)) await ajuste(marca, k, v)
  return marca
}

/** Un cliente cuyo ciclo empezó hace `dias` días de Bogotá. */
async function nuevoCliente(
  t: TestTenant,
  opts: { dias: number; estado?: 'activo' | 'dormido' | 'archivado'; ultimaCampana?: Date } = { dias: 0 }
): Promise<string> {
  const inicio = instanteEnBogota(hoy() - opts.dias, 12)
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_visits, total_points, source_channels, last_visit_at,
        cycle_started_at, cycle_state, dormant_since, last_campaign_at)
     VALUES ($1, $2, 'Juanita', 1, 90, 'qr', $3, $3, $4, $5, $6) RETURNING id`,
    [t.id, nuevoTelefono(), inicio, opts.estado ?? 'activo', opts.estado && opts.estado !== 'activo' ? inicio : null, opts.ultimaCampana ?? null]
  )
  return rows[0].id
}

async function usuarioDelPanel(t: TestTenant, rol: 'brand' | 'location', sede: string | null = null): Promise<void> {
  const meta = { tenant_id: t.id }
  const { rows } = await db().query<{ id: string }>(`INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`, [JSON.stringify(meta)])
  usuarios.push(rows[0].id)
  await db().query(`INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role) VALUES ($1, $2, $3, $4)`, [rows[0].id, t.id, sede, rol])
  h.usuario = { id: rows[0].id, app_metadata: meta }
}

async function sede(t: TestTenant, nombre: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, is_active) VALUES ($1, $2, $3, false, true) RETURNING id`,
    [t.id, nombre, `sede-${Math.random().toString(36).slice(2, 10)}`]
  )
  return rows[0].id
}

const URL_DEL_REGALO = 'https://marca.constelarys.com/api/dashboard/cycle/gift'

async function pedirVistaPrevia(cuando = 'hoy') {
  const { GET } = await import('@/app/api/dashboard/cycle/gift/route')
  const res = await GET(new Request(`${URL_DEL_REGALO}?cuando=${cuando}`))
  return { status: res.status, body: (await res.json()) as Vista }
}

async function mandar(cuerpo: unknown) {
  const { POST } = await import('@/app/api/dashboard/cycle/gift/route')
  const res = await POST(
    new Request(URL_DEL_REGALO, { method: 'POST', body: JSON.stringify(cuerpo), headers: { 'content-type': 'application/json' } })
  )
  return { status: res.status, body: (await res.json()) as Programado }
}

/** Llegó la hora de la marca: lo encolado de esta marca ya se puede enviar, y corre el drenador. */
async function drenar(t: TestTenant) {
  await db().query(`UPDATE send_queue SET not_before = now() - interval '1 minute' WHERE tenant_id = $1 AND status = 'queued'`, [t.id])
  const { GET } = await import('@/app/api/cron/queue-drain/route')
  const res = await GET(new Request('https://x/api/cron/queue-drain') as never)
  return (await res.json()) as Record<string, unknown>
}

async function correrCron(t: TestTenant) {
  const { GET } = await import('@/app/api/cron/reactivation/route')
  const res = await GET(new Request(`https://x/api/cron/reactivation?tenant=${t.slug}`) as never)
  return (await res.json()) as Record<string, unknown>
}

async function regalos(t: TestTenant) {
  const { rows } = await db().query<{
    customer_id: string
    source: string
    status: string
    expires_at: Date | null
    skip_reminder: boolean
    campaign_reward_id: string | null
    prize_title: string
    campaign_id: string | null
  }>(`SELECT * FROM reward_grants WHERE tenant_id = $1 ORDER BY granted_at`, [t.id])
  return rows
}

async function cola(t: TestTenant) {
  const { rows } = await db().query<{
    customer_id: string
    status: string
    template_sid: string
    variables: Record<string, string>
    message_type: string
    campaign_id: string
    location_id: string | null
    last_error: string | null
  }>(`SELECT * FROM send_queue WHERE tenant_id = $1 ORDER BY enqueued_at`, [t.id])
  return rows
}

async function limpiar(t: TestTenant) {
  await db().query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_events WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM send_queue WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM customer_cycle_touches WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM reward_grants WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
  await db().query('DELETE FROM campaign_rewards WHERE tenant_id = $1', [t.id]).catch(() => undefined)
  h.misMarcas.delete(t.id)
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
})

beforeEach(() => {
  h.envios.length = 0
  h.aprobadaEnTwilio = true
  h.falla = null
})

afterAll(async () => {
  for (const m of creadas) await limpiar(m)
  if (usuarios.length > 0) await db().query('DELETE FROM auth.users WHERE id = ANY($1)', [usuarios])
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

const casiIgual = (a: Date | string | null, b: Date) => {
  expect(a).not.toBeNull()
  expect(Math.abs(new Date(a as Date).getTime() - b.getTime())).toBeLessThan(1000)
}

// ═══════════════════════════════════════════════════════════════
// 1. Se otorga y se fecha AL ENVIAR
// ═══════════════════════════════════════════════════════════════

describe('el regalo se otorga AL ENVIAR, no al programar', () => {
  it('programar encola sin otorgar nada ni poner fecha; el drenador pone «vence el domingo» y SOLO ENTONCES otorga', async () => {
    const t = await nuevaMarca()
    const a = await nuevoCliente(t, { dias: 62 })
    const b = await nuevoCliente(t, { dias: 65 })
    await usuarioDelPanel(t, 'brand')

    const r = await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't4', cuando: 'hoy' })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, programados: 2, plantilla: 'gift_expiring', vence: 'domingo' })
    expect(r.body.mensaje).toContain('Cada regalo se entrega cuando a esa persona le llega el mensaje')

    // Programado: ni un regalo todavía, y la cola sin la fecha.
    expect(await regalos(t)).toEqual([])
    const enCola = await cola(t)
    expect(enCola).toHaveLength(2)
    for (const i of enCola) {
      expect(i).toMatchObject({ status: 'queued', message_type: 'manual', template_sid: 'HX_REGALO', location_id: null })
      expect(i.variables).toMatchObject({ '1': 'Juanita', '2': 'Postre del chef' })
      expect(i.variables['3']).toBeUndefined()
    }
    const { rows: campanas } = await db().query<{ source: string; type: string; filters: { regalo?: unknown } }>(
      'SELECT source, type, filters FROM campaigns WHERE id = $1',
      [enCola[0].campaign_id]
    )
    expect(campanas[0]).toMatchObject({ source: 'manual', type: 'manual' })
    expect(campanas[0].filters.regalo).toEqual({ reward_id: t.pequeno, titulo: 'Postre del chef', vence: 'domingo', plantilla: 'gift_expiring' })

    // Sale: la fecha se calcula AHORA, y el regalo queda con ESE vencimiento.
    await drenar(t)
    const ahora = new Date()
    expect(h.envios.filter((e) => e.tenantId === t.id)).toHaveLength(2)
    for (const e of h.envios) expect(e.variables['3']).toBe(formatGiftDeadline(expiresOnSunday(ahora)))
    const otorgados = await regalos(t)
    expect(otorgados.map((g) => g.customer_id).sort()).toEqual([a, b].sort())
    for (const g of otorgados) {
      expect(g).toMatchObject({ source: 'manual', status: 'active', skip_reminder: true, campaign_reward_id: t.pequeno, prize_title: 'Postre del chef' })
      casiIgual(g.expires_at, expiresOnSunday(ahora))
    }
    // Cuenta como manual: suma a la fatiga del ciclo.
    const { rows } = await db().query<{ cycle_touches: number }>('SELECT cycle_touches FROM customers WHERE id = $1', [a])
    expect(rows[0].cycle_touches).toBe(1)
  })

  it('con «Regalo que vence» sin aprobar sale la insistente: el regalo en {{4}}, la fecha («en 7 días») en {{5}}', async () => {
    const t = await nuevaMarca()
    h.aprobadaEnTwilio = false
    await nuevoCliente(t, { dias: 30 }) // Le regalamos algo
    await usuarioDelPanel(t, 'brand')

    const r = await mandar({ regalo: { id: t.fuerte }, vence: '7', audiencia: 't2', cuando: 'hoy' })
    expect(r.body).toMatchObject({ ok: true, programados: 1, plantilla: 'reactivation_aggressive' })
    expect((await cola(t))[0]).toMatchObject({ template_sid: 'HX_INSISTENTE', variables: { '1': 'Juanita', '4': 'Rollo gratis' } })

    await drenar(t)
    const ahora = new Date()
    expect(h.envios.at(-1)!.variables['5']).toBe(formatGiftDeadline(venceSegunRegla('7', ahora)))
    casiIgual((await regalos(t))[0].expires_at, venceSegunRegla('7', ahora))
  })

  it('«escribirlo y queda»: un regalo escrito a mano entra al catálogo y la segunda vez se reusa', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 62 })
    await usuarioDelPanel(t, 'brand')

    const primero = await mandar({ regalo: { titulo: '  Café de la casa ' }, vence: '3', audiencia: 't4', cuando: 'hoy' })
    expect(primero.body.regalo).toMatchObject({ titulo: 'Café de la casa', nuevo: true })
    const { rows } = await db().query<{ id: string }>(`SELECT id FROM campaign_rewards WHERE tenant_id = $1 AND title = 'Café de la casa'`, [t.id])
    expect(rows).toHaveLength(1)
    expect(primero.body.regalo?.id).toBe(rows[0].id)

    // El cliente ya tiene uno programado y todavía no vivo: el segundo reusa el mismo premio.
    await db().query(`DELETE FROM send_queue WHERE tenant_id = $1`, [t.id])
    const segundo = await mandar({ regalo: { titulo: 'café de la casa' }, vence: '3', audiencia: 't4', cuando: 'hoy' })
    expect(segundo.body.regalo).toMatchObject({ id: rows[0].id, nuevo: false })
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Un regalo vivo por cliente
// ═══════════════════════════════════════════════════════════════

describe('un regalo vivo por cliente (spec §5)', () => {
  it('quien ya tiene uno no entra; el conteo vivo lo dice', async () => {
    const t = await nuevaMarca()
    const conRegalo = await nuevoCliente(t, { dias: 62 })
    await nuevoCliente(t, { dias: 64 })
    await db().query(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status, expires_at)
       VALUES ($1, $2, 'campaign_prize', 'reactivation', 'Rollo gratis', 'active', now() + interval '3 days')`,
      [t.id, conRegalo]
    )
    await usuarioDelPanel(t, 'brand')

    const vista = await pedirVistaPrevia()
    expect(vista.status).toBe(200)
    expect(vista.body.audiencias.find((a) => a.clave === 't4')).toMatchObject({
      total: 2,
      reciben: 1,
      no_reciben: { regalo_vivo: 1, siete_dias: 0, tope_mes: 0 },
    })
    const r = await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't4', cuando: 'hoy' })
    expect(r.body).toMatchObject({ programados: 1, no_reciben: { regalo_vivo: 1 } })
  })

  it('si al ENVIAR ya tiene uno, el item no sale (cancelado con el motivo) y no se otorga otro', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 62 })
    await usuarioDelPanel(t, 'brand')
    expect((await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't4', cuando: 'hoy' })).body.programados).toBe(1)
    // Entre programar y enviar le llegó otro (del dueño, por otro camino).
    await db().query(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status, expires_at)
       VALUES ($1, $2, 'campaign_prize', 'manual', 'Bebida gratis', 'active', now() + interval '3 days')`,
      [t.id, c]
    )
    await drenar(t)
    expect(h.envios.filter((e) => e.tenantId === t.id)).toEqual([])
    expect((await cola(t))[0]).toMatchObject({ status: 'cancelled', last_error: 'Ya tiene un regalo vivo: no se le manda otro' })
    expect((await regalos(t)).map((g) => g.prize_title)).toEqual(['Bebida gratis'])
  })

  it('el ciclo tampoco le apila el suyo encima al del dueño: el rescate se pospone', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 60 }) // entra HOY al rescate
    await db().query(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status, expires_at)
       VALUES ($1, $2, 'campaign_prize', 'manual', 'Postre del chef', 'active', now() + interval '4 days')`,
      [t.id, c]
    )
    await correrCron(t)
    await drenar(t)
    expect(h.envios.filter((e) => e.tenantId === t.id)).toEqual([])
    const { rows } = await db().query<{ stage: string; status: string; reason: string | null }>(
      'SELECT stage, status, reason FROM customer_cycle_touches WHERE tenant_id = $1',
      [t.id]
    )
    expect(rows).toEqual([{ stage: 't4', status: 'deferred', reason: 'Ya tiene un regalo vivo: este espera al día siguiente de que ese venza' }])
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Las reglas de siempre, y quién puede
// ═══════════════════════════════════════════════════════════════

describe('cuenta como un envío manual, pero no pasa por la Recovery Zone del camino viejo', () => {
  it('en una marca APAGADA, un cliente dentro de la zona reservada (día 20) recibe el regalo igual', async () => {
    const t = await nuevaMarca({ encendido: false })
    await nuevoCliente(t, { dias: 20 }) // «Le recordamos» del ritmo; zona del camino viejo: 18-25
    await usuarioDelPanel(t, 'brand')
    expect((await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't1', cuando: 'hoy' })).body.programados).toBe(1)
    await drenar(t)
    expect(h.envios.filter((e) => e.tenantId === t.id)).toHaveLength(1)
    expect((await cola(t))[0].status).toBe('sent')
  })

  it('quien recibió otro mensaje hace menos de 7 días queda fuera, y el conteo lo dice', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 62, ultimaCampana: new Date(Date.now() - 2 * 86_400_000) })
    await usuarioDelPanel(t, 'brand')
    const vista = await pedirVistaPrevia()
    expect(vista.body.audiencias.find((a) => a.clave === 't4')).toMatchObject({ reciben: 0, no_reciben: { siete_dias: 1 } })
    const r = await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't4', cuando: 'hoy' })
    expect(r.status).toBe(400)
    expect(r.body.error).toContain('recibieron otro mensaje hace menos de 7 días')
  })
})

describe('quién puede y qué pasa si la base falla', () => {
  it('el conteo de cada caja es el mismo número de la portada', async () => {
    const t = await nuevaMarca()
    for (const d of [2, 15, 30, 62, 63, 85]) await nuevoCliente(t, { dias: d })
    await nuevoCliente(t, { dias: 200, estado: 'dormido' })
    await usuarioDelPanel(t, 'brand')
    const { GET } = await import('@/app/api/dashboard/cycle/overview/route')
    const portada = (await (await GET(new Request('https://marca.constelarys.com/api/dashboard/cycle/overview'))).json()) as CycleOverview
    const vista = await pedirVistaPrevia()
    for (const c of portada.cajas) {
      expect(vista.body.audiencias.find((a) => a.clave === c.key)?.total, c.key).toBe(c.total)
    }
    expect(vista.body.audiencias.find((a) => a.clave === 'dormidos')?.total).toBe(portada.dormidos.total)
    // «Todos» son los del ciclo menos los que recién vinieron, más los dormidos.
    expect(vista.body.audiencias.find((a) => a.clave === 'todos')?.total).toBe(6)
    expect(vista.body.audiencias.find((a) => a.clave === 'reciente')).toMatchObject({ disponible: false })
  })

  it('un administrador de UNA sede recibe 403 al mandar (es de toda la marca) y nada se programa', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 62 })
    const s1 = await sede(t, 'Laureles')
    await sede(t, 'Envigado')
    await usuarioDelPanel(t, 'location', s1)
    const r = await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't4', cuando: 'hoy' })
    expect(r.status).toBe(403)
    expect(r.body.error).toContain('solo un super usuario puede mandarlo')
    expect(await cola(t)).toEqual([])
  })

  it('una fecha que ya pasó es 400 con el motivo; «Recién vino» no se ofrece', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 2 })
    await usuarioDelPanel(t, 'brand')
    expect((await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't4', cuando: '2020-01-01' })).body.error).toContain('no una que ya pasó')
    expect((await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 'reciente', cuando: 'hoy' })).body.error).toContain('vinieron hace poco')
  })

  it('un fallo de base es 500 con un mensaje, nunca un conteo de «0»', async () => {
    const t = await nuevaMarca()
    await usuarioDelPanel(t, 'brand')
    h.falla = 'customers'
    const vista = await pedirVistaPrevia()
    expect(vista.status).toBe(500)
    expect(vista.body).toEqual({ error: 'No pudimos preparar el regalo en este momento. Intenta de nuevo en un minuto.' })
    const r = await mandar({ regalo: { id: t.pequeno }, vence: 'domingo', audiencia: 't4', cuando: 'hoy' })
    expect(r.status).toBe(500)
    h.falla = null
    expect(await cola(t)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. «Incluir a los dormidos» (00073)
// ═══════════════════════════════════════════════════════════════

describe('«Incluir a los dormidos» (00073)', () => {
  it('se guarda al crear el evento y decide su audiencia con el ciclo encendido', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 10 })
    await nuevoCliente(t, { dias: 150, estado: 'dormido' })
    await nuevoCliente(t, { dias: 400, estado: 'archivado' })
    const { createEvent, audienciaDelEvento } = await import('@/services/calendar.service')
    const fecha = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

    const sinDormidos = await createEvent({ title: 'Noche de sushi', event_date: fecha, event_type: 'promo' }, t.id)
    expect(sinDormidos.include_dormant).toBe(false)
    expect(await audienciaDelEvento(sinDormidos, t.id)).toHaveLength(1)

    const conDormidos = await createEvent({ title: 'Festival', event_date: fecha, event_type: 'festival', include_dormant: true }, t.id)
    expect(conDormidos.include_dormant).toBe(true)
    expect(await audienciaDelEvento(conDormidos, t.id)).toHaveLength(3)

    // Con el ciclo apagado la casilla no cambia nada: les llega a todos.
    await ajuste(t, 'cycle_enabled', 'false')
    expect(await audienciaDelEvento(sinDormidos, t.id)).toHaveLength(3)
  })
})
