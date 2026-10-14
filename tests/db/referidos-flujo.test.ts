/**
 * Referidos — el flujo entero con las rutas REALES contra Postgres (2026-10-15).
 *
 * `POST /api/check-in` (registro y escaneo del mesero), `GET /api/referral/me` (la tarjeta de quien
 * invita), `GET /api/referral/{código}` (la landing del amigo) y `POST /api/reward-redeem` (el canje),
 * con `resolveHostContext()` de verdad: la marca y la sede salen del host, como en producción. Se
 * falsean solo el WhatsApp, Meta, Google Contacts, el límite de tasa y el token del QR.
 *
 * Lo que se fija:
 *   · El registro con código deja al amigo PENDIENTE del mesero (0 visitas) con su regalo en la
 *     tarjeta; quien invita no gana nada todavía.
 *   · El premio de quien invita sale SOLO cuando el mesero valida la primera visita del amigo, con
 *     la sede de esa visita, y UNA vez aunque lleguen cuatro escaneos a la vez.
 *   · No cuentan: auto-referencia, teléfono que ya es cliente, teléfono ya referido.
 *   · El tope del mes y el vencimiento.
 *   · Una marca con referidos apagados no cambia en nada; el código de la marca A no sirve en la B.
 *   · Una marca de dos sedes (como Tepuy) y una de una: el enlace y el registro funcionan; el premio
 *     se canjea en cualquier sede.
 *   · Un fallo de base es 500, no «apagado».
 *
 * Código: `src/services/referral.service.ts` · `src/app/api/check-in/route.ts` · `src/app/api/referral/**`
 * Doc: `docs/features/referral-program.md`
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'

const h = vi.hoisted(() => ({
  /** La tabla cuya lectura falla (un timeout del pooler), o `null`. */
  falla: null as null | string,
  whatsapps: [] as string[],
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
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }))
vi.mock('@/lib/meta-conversions-server', () => ({ sendConversionEvent: async () => {} }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
  getClientIp: () => '203.0.113.9',
}))
vi.mock('@/lib/utils/qrcode', () => ({
  verifyCustomerQRToken: async () => ({}),
  generateCustomerQRToken: async () => 'qr',
}))
vi.mock('@/services/google-contacts-sync.service', () => ({ syncGoogleContact: async () => {} }))
vi.mock('@/services/imported-contacts.service', () => ({ markConverted: async () => null }))
vi.mock('@/services/twilio-catalog.service', () => ({ isTwilioTemplateApproved: async () => true }))
vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: async (tel: string) => {
    h.whatsapps.push(tel)
    return { sid: `SM${h.whatsapps.length}`, status: 'sent' }
  },
}))

const db = () => getPool()
const SUF = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let tel = 0
const nuevoTelefono = () => `31${String(process.pid % 1000).padStart(3, '0')}${String(++tel).padStart(5, '0')}`

// ═══════════════════════════════════════════════════════════════
// Marcas, sedes, meseros, clientes
// ═══════════════════════════════════════════════════════════════

interface Marca extends TestTenant {
  dominio: string
  sedes: Record<string, { id: string; dominio: string | null; mesero: string; aparato: string }>
  premios: Record<string, string>
}
const creadas: Marca[] = []

async function marca(nombre: string, sedes: Array<{ nombre: string; dominio: string | null }>): Promise<Marca> {
  const t = await createTestTenant()
  const dominio = `${nombre}-${SUF}.test`
  await db().query(`UPDATE tenants SET domain = $2, name = $3 WHERE id = $1`, [t.id, dominio, `Marca ${nombre}`])
  const m: Marca = { ...t, dominio, sedes: {}, premios: {} }
  let orden = 0
  for (const s of sedes) {
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO restaurant_locations (tenant_id, name, slug, domain, is_primary, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
      [t.id, s.nombre, `s-${Math.random().toString(36).slice(2, 10)}`, s.dominio, orden === 0, orden]
    )
    const sedeId = rows[0].id
    const { rows: mesero } = await db().query<{ id: string }>(
      `INSERT INTO staff_users (tenant_id, name, phone, role, location_id) VALUES ($1, $2, $3, 'waiter', $4) RETURNING id`,
      [t.id, `Mesero ${s.nombre}`, nuevoTelefono(), sedeId]
    )
    const fp = `fp-${Math.random().toString(36).slice(2)}`
    await db().query(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint, device_name, is_trusted, location_id) VALUES ($1, $2, 'Tablet', true, $3)`,
      [t.id, fp, sedeId]
    )
    m.sedes[s.nombre] = { id: sedeId, dominio: s.dominio, mesero: mesero[0].id, aparato: fp }
    orden++
  }
  creadas.push(m)
  return m
}

async function premio(m: Marca, titulo: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO campaign_rewards (tenant_id, title) VALUES ($1, $2) RETURNING id`,
    [m.id, titulo]
  )
  m.premios[titulo] = rows[0].id
  return rows[0].id
}

async function ajustes(m: Marca, valores: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(valores)) {
    await db().query(
      `INSERT INTO admin_settings (key, value, tenant_id) VALUES ($1, $2, $3)
       ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value`,
      [key, value, m.id]
    )
  }
}

/** Encendido: quien invita gana «Rollo gratis», el amigo «Postre de bienvenida». */
async function encender(m: Marca, extra: Record<string, string> = {}): Promise<void> {
  const rollo = m.premios['Rollo gratis'] ?? (await premio(m, 'Rollo gratis'))
  const postre = m.premios['Postre de bienvenida'] ?? (await premio(m, 'Postre de bienvenida'))
  await ajustes(m, {
    referral_enabled: 'true',
    referral_referrer_reward_type: 'reward',
    referral_referrer_reward_id: rollo,
    referral_referred_reward_type: 'reward',
    referral_referred_reward_id: postre,
    referral_monthly_cap: '10',
    referral_pending_expiry_days: '30',
    ...extra,
  })
}

/** Un cliente que ya vino (quien invita). */
async function clienteExistente(m: Marca, nombre: string, sedeId: string | null = null): Promise<{ id: string; phone: string }> {
  const phone = nuevoTelefono()
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_visits, last_visit_at, last_visit_location_id, origin_location_id)
     VALUES ($1, $2, $3, 3, now() - interval '3 days', $4, $4) RETURNING id`,
    [m.id, phone, nombre, sedeId]
  )
  return { id: rows[0].id, phone }
}

// ═══════════════════════════════════════════════════════════════
// Las rutas
// ═══════════════════════════════════════════════════════════════

async function checkIn(host: string, cuerpo: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import('@/app/api/check-in/route')
  const res = await POST(
    new Request(`https://${host}/api/check-in`, {
      method: 'POST',
      headers: { host, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }) as never
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const registrar = (host: string, phone: string, name: string, code?: string) =>
  checkIn(host, { action: 'register', phone, name, ...(code ? { referral_code: code } : {}) })

const escanear = (host: string, phone: string, mesero: string) =>
  checkIn(host, { action: 'checkin', phone, source: 'staff_scan', registered_by_staff_id: mesero })

interface Me {
  activo: boolean
  codigo: string
  enlace: string
  gana: string
  regalo_del_amigo: string | null
  mensaje: string
  whatsapp_url: string
  invitados: Array<{ nombre: string; estado: string; gano: boolean }>
}
async function me(host: string, phone: string): Promise<{ status: number; body: Me }> {
  const { GET } = await import('@/app/api/referral/me/route')
  const res = await GET(new Request(`https://${host}/api/referral/me?phone=${phone}`, { headers: { host } }) as never)
  return { status: res.status, body: (await res.json()) as Me }
}

async function landing(host: string, code: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import('@/app/api/referral/[code]/route')
  const res = await GET(new Request(`https://${host}/api/referral/${code}`, { headers: { host } }) as never, {
    params: Promise.resolve({ code }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// ═══════════════════════════════════════════════════════════════
// Lo que quedó en la base
// ═══════════════════════════════════════════════════════════════

async function filaCliente(m: Marca, phone: string) {
  const { rows } = await db().query(
    `SELECT id, total_visits, total_points, origin_location_id FROM customers WHERE tenant_id = $1 AND phone = $2`,
    [m.id, phone]
  )
  return rows[0] as { id: string; total_visits: number; total_points: number; origin_location_id: string | null } | undefined
}

async function referidosDe(m: Marca, referrerId: string) {
  const { rows } = await db().query(
    `SELECT id, referred_customer_id, status, referrer_rewarded, expires_at FROM referrals
      WHERE tenant_id = $1 AND referrer_customer_id = $2 ORDER BY created_at`,
    [m.id, referrerId]
  )
  return rows as Array<{ id: string; referred_customer_id: string; status: string; referrer_rewarded: boolean; expires_at: Date }>
}

async function premiosDe(customerId: string) {
  const { rows } = await db().query(
    `SELECT id, source, prize_title, status, referral_id, granted_location_id, expires_at
       FROM reward_grants WHERE customer_id = $1 ORDER BY granted_at`,
    [customerId]
  )
  return rows as Array<{
    id: string
    source: string
    prize_title: string
    status: string
    referral_id: string | null
    granted_location_id: string | null
    expires_at: Date | null
  }>
}

// ═══════════════════════════════════════════════════════════════

let A: Marca // una sede, referidos encendidos
let B: Marca // otra marca, encendida
let T: Marca // dos sedes, como Tepuy
let OFF: Marca // apagada (como nacen todas)

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  A = await marca('refa', [{ nombre: 'Centro', dominio: null }])
  B = await marca('refb', [{ nombre: 'Norte', dominio: null }])
  T = await marca('reft', [
    { nombre: 'Envigado', dominio: `env-${SUF}.test` },
    { nombre: 'Laureles', dominio: `lau-${SUF}.test` },
  ])
  OFF = await marca('refoff', [{ nombre: 'Unica', dominio: null }])
  await encender(A)
  await encender(B)
  await encender(T)
  await premio(OFF, 'Rollo gratis')
})

afterAll(async () => {
  for (const m of creadas) {
    await db().query('DELETE FROM reward_redemptions WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM reward_grants WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM point_transactions WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM visits WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM referrals WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM referral_codes WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM message_logs WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM customers WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM campaign_rewards WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM staff_devices WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM staff_users WHERE tenant_id = $1', [m.id])
    await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [m.id])
    await dropTestTenant(m.id)
  }
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

beforeEach(() => {
  h.falla = null
  h.whatsapps.length = 0
})

// ═══════════════════════════════════════════════════════════════
// El camino feliz: registro → pendiente → el mesero valida → los dos ganan
// ═══════════════════════════════════════════════════════════════

describe('el registro con código y la primera visita', () => {
  it('el registro deja al amigo PENDIENTE del mesero con su regalo en la tarjeta; quien invita aún no gana', async () => {
    const ana = await clienteExistente(A, 'Ana María Ruiz', A.sedes.Centro.id)
    const tarjeta = await me(A.dominio, ana.phone)
    expect(tarjeta.status).toBe(200)
    expect(tarjeta.body).toMatchObject({ activo: true, gana: 'Rollo gratis', regalo_del_amigo: 'Postre de bienvenida' })
    expect(tarjeta.body.enlace).toBe(`https://${A.dominio}/r/${tarjeta.body.codigo}`)
    expect(tarjeta.body.mensaje).toContain('Ana')
    expect(tarjeta.body.mensaje).toContain(tarjeta.body.enlace)
    expect(tarjeta.body.whatsapp_url.startsWith('https://wa.me/?text=')).toBe(true)

    // La landing del amigo: el primer nombre y el regalo, nada más.
    const l = await landing(A.dominio, tarjeta.body.codigo.toLowerCase())
    expect(l).toEqual({
      status: 200,
      body: { codigo: tarjeta.body.codigo, nombre: 'Ana', beneficio: 'Postre de bienvenida', dias: 30 },
    })

    const telAmigo = nuevoTelefono()
    const r = await registrar(A.dominio, telAmigo, 'Beto', tarjeta.body.codigo)
    expect(r.status).toBe(201)
    expect(r.body.message).toBe('registered_pending_scan')
    expect(r.body.referral_gift).toEqual({ tipo: 'reward', texto: 'Postre de bienvenida' })

    const amigo = (await filaCliente(A, telAmigo))!
    expect(amigo.total_visits).toBe(0) // la visita #1 la cuenta el mesero
    expect(amigo.origin_location_id).toBe(A.sedes.Centro.id)

    const [ref] = await referidosDe(A, ana.id)
    expect(ref).toMatchObject({ referred_customer_id: amigo.id, status: 'pending', referrer_rewarded: false })
    const dias = (new Date(ref.expires_at).getTime() - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThanOrEqual(30)

    const [regalo] = await premiosDe(amigo.id)
    expect(regalo).toMatchObject({
      source: 'referral',
      prize_title: 'Postre de bienvenida',
      status: 'active',
      referral_id: ref.id,
      granted_location_id: A.sedes.Centro.id,
    })
    expect(await premiosDe(ana.id)).toEqual([]) // quien invita: nada todavía

    // ── El mesero valida la primera visita ──
    const e = await escanear(A.dominio, telAmigo, A.sedes.Centro.mesero)
    expect(e.status).toBe(200)
    expect(e.body.referral_completed).toBe(true)

    expect((await filaCliente(A, telAmigo))!.total_visits).toBe(1)
    const [despues] = await referidosDe(A, ana.id)
    expect(despues).toMatchObject({ status: 'completed', referrer_rewarded: true })
    const premiosDeAna = await premiosDe(ana.id)
    expect(premiosDeAna).toHaveLength(1)
    expect(premiosDeAna[0]).toMatchObject({
      source: 'referral',
      prize_title: 'Rollo gratis',
      status: 'active',
      referral_id: ref.id,
      granted_location_id: A.sedes.Centro.id,
    })

    // Un segundo escaneo (otra visita) no vuelve a premiar.
    await escanear(A.dominio, telAmigo, A.sedes.Centro.mesero)
    expect(await premiosDe(ana.id)).toHaveLength(1)

    // La tarjeta de Ana lo dice.
    const otraVez = await me(A.dominio, ana.phone)
    expect(otraVez.body.invitados).toEqual([expect.objectContaining({ nombre: 'Beto', estado: 'completed', gano: true })])
  })

  it('cuatro escaneos A LA VEZ de la primera visita del amigo: quien invita gana UNA vez', async () => {
    const ana = await clienteExistente(A, 'Carla')
    const { body } = await me(A.dominio, ana.phone)
    const telAmigo = nuevoTelefono()
    await registrar(A.dominio, telAmigo, 'Dani', body.codigo)

    const r = await Promise.all(Array.from({ length: 4 }, () => escanear(A.dominio, telAmigo, A.sedes.Centro.mesero)))
    expect(r.filter((x) => x.body.referral_completed === true)).toHaveLength(1)

    expect(await premiosDe(ana.id)).toHaveLength(1)
    const [ref] = await referidosDe(A, ana.id)
    expect(ref.status).toBe('completed')
  })
})

// ═══════════════════════════════════════════════════════════════
// El mesero: los dos premios en su lista, con el badge REFERIDO
// ═══════════════════════════════════════════════════════════════

describe('la lista del mesero', () => {
  async function pendientes(m: Marca, sede: string) {
    const { GET } = await import('@/app/api/staff/pending-rewards/route')
    const res = await GET(
      new Request(`https://${m.dominio}/api/staff/pending-rewards`, {
        headers: { host: m.dominio, 'x-device-token': m.sedes[sede].aparato },
      }) as never
    )
    return ((await res.json()) as { grants: Array<{ customer_id: string; source: string; prize_title: string }> }).grants
  }

  it('el regalo del amigo al escanearlo, y el premio de quien invita cuando él viene: los dos como «referral»', async () => {
    const ana = await clienteExistente(A, 'Gabriela')
    const telAmigo = nuevoTelefono()
    await registrar(A.dominio, telAmigo, 'Héctor', (await me(A.dominio, ana.phone)).body.codigo)
    await escanear(A.dominio, telAmigo, A.sedes.Centro.mesero)
    const amigo = (await filaCliente(A, telAmigo))!

    const lista = await pendientes(A, 'Centro')
    expect(lista).toContainEqual(expect.objectContaining({ customer_id: amigo.id, source: 'referral', prize_title: 'Postre de bienvenida' }))
    // Ana todavía no vino hoy: su premio existe pero no estorba la pantalla del mesero.
    expect(lista.find((g) => g.customer_id === ana.id)).toBeUndefined()

    await escanear(A.dominio, ana.phone, A.sedes.Centro.mesero)
    expect(await pendientes(A, 'Centro')).toContainEqual(
      expect.objectContaining({ customer_id: ana.id, source: 'referral', prize_title: 'Rollo gratis' })
    )
  })

  it('las dos pantallas del mesero le ponen «REFERIDO» a esa fuente', async () => {
    const fs = await import('node:fs')
    const lista = fs.readFileSync('src/components/features/staff/PendingRewardsList.tsx', 'utf8')
    const alerta = fs.readFileSync('src/components/features/staff/RewardAlert.tsx', 'utf8')
    expect(lista).toMatch(/referral:\s*\{\s*label:\s*'REFERIDO'/)
    expect(alerta).toContain('REFERIDO')
  })
})

// ═══════════════════════════════════════════════════════════════
// Lo que no cuenta
// ═══════════════════════════════════════════════════════════════

describe('lo que no cuenta como referido', () => {
  it('auto-referencia: quien invita abre su propio enlace y no pasa nada', async () => {
    const ana = await clienteExistente(A, 'Elena')
    const { body } = await me(A.dominio, ana.phone)
    const l = await checkIn(A.dominio, { action: 'lookup', phone: ana.phone, referral_code: body.codigo })
    expect(l.body).toMatchObject({ found: true, referral_status: 'ya_cliente' })
    expect(await premiosDe(ana.id)).toEqual([])

    const { prepararReferido } = await import('@/services/referral.service')
    expect(await prepararReferido({ codigo: body.codigo, tenantId: A.id, phone: ana.phone })).toEqual({
      ok: false,
      motivo: 'auto_referencia',
    })
  })

  it('un teléfono que ya es cliente de la marca: ni premio ni referido (y registrarlo da 409)', async () => {
    const ana = await clienteExistente(A, 'Fabio')
    const yaCliente = await clienteExistente(A, 'Gina')
    const { body } = await me(A.dominio, ana.phone)

    const l = await checkIn(A.dominio, { action: 'lookup', phone: yaCliente.phone, referral_code: body.codigo })
    expect(l.body).toMatchObject({ found: true, referral_status: 'ya_cliente' })
    expect((await registrar(A.dominio, yaCliente.phone, 'Gina', body.codigo)).status).toBe(409)

    expect(await referidosDe(A, ana.id)).toEqual([])
    expect(await premiosDe(yaCliente.id)).toEqual([])
  })

  it('un teléfono ya referido en la marca no se refiere otra vez', async () => {
    const ana = await clienteExistente(A, 'Hugo')
    const otro = await clienteExistente(A, 'Iris')
    const telAmigo = nuevoTelefono()
    await registrar(A.dominio, telAmigo, 'Juan', (await me(A.dominio, ana.phone)).body.codigo)

    const { prepararReferido } = await import('@/services/referral.service')
    const codigoDeIris = (await me(A.dominio, otro.phone)).body.codigo
    expect(await prepararReferido({ codigo: codigoDeIris, tenantId: A.id, phone: telAmigo })).toEqual({
      ok: false,
      motivo: 'telefono_ya_referido',
    })
    expect(await referidosDe(A, otro.id)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// Tope y vencimiento
// ═══════════════════════════════════════════════════════════════

describe('el tope del mes y el vencimiento', () => {
  it('tope 1: el segundo amigo que viene en el mes completa, pero quien invita no gana otra vez', async () => {
    await ajustes(A, { referral_monthly_cap: '1' })
    try {
      const ana = await clienteExistente(A, 'Karen')
      const { body } = await me(A.dominio, ana.phone)
      const t1 = nuevoTelefono()
      const t2 = nuevoTelefono()
      await registrar(A.dominio, t1, 'Leo', body.codigo)
      await registrar(A.dominio, t2, 'Mia', body.codigo)
      await escanear(A.dominio, t1, A.sedes.Centro.mesero)
      await escanear(A.dominio, t2, A.sedes.Centro.mesero)

      const refs = await referidosDe(A, ana.id)
      expect(refs.map((r) => [r.status, r.referrer_rewarded])).toEqual([
        ['completed', true],
        ['completed', false],
      ])
      expect(await premiosDe(ana.id)).toHaveLength(1)
      // El regalo del amigo no depende del tope: los dos tienen el suyo.
      expect(await premiosDe((await filaCliente(A, t2))!.id)).toHaveLength(1)
    } finally {
      await ajustes(A, { referral_monthly_cap: '10' })
    }
  })

  it('un amigo que viene después de los 30 días: el referido vence y nadie gana', async () => {
    const ana = await clienteExistente(A, 'Nora')
    const { body } = await me(A.dominio, ana.phone)
    const tel1 = nuevoTelefono()
    await registrar(A.dominio, tel1, 'Oscar', body.codigo)
    await db().query(
      `UPDATE referrals SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
        WHERE referrer_customer_id = $1`,
      [ana.id]
    )

    // Antes de que venga, la tarjeta ya lo muestra vencido (y la base queda marcada al leer).
    expect((await me(A.dominio, ana.phone)).body.invitados).toEqual([expect.objectContaining({ estado: 'expired' })])
    expect((await referidosDe(A, ana.id))[0].status).toBe('expired')

    await escanear(A.dominio, tel1, A.sedes.Centro.mesero)
    expect((await referidosDe(A, ana.id))[0]).toMatchObject({ status: 'expired', referrer_rewarded: false })
    expect(await premiosDe(ana.id)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// Apagado y aislamiento entre marcas
// ═══════════════════════════════════════════════════════════════

describe('una marca con referidos apagados no cambia en nada', () => {
  it('el registro con un código es el registro de siempre (la visita #1 cuenta como cualquier otra)', async () => {
    const dueno = await clienteExistente(OFF, 'Pablo')
    await db().query(`INSERT INTO referral_codes (tenant_id, customer_id, code) VALUES ($1, $2, 'PQR234')`, [OFF.id, dueno.id])

    const conCodigo = await registrar(OFF.dominio, nuevoTelefono(), 'Quique', 'PQR234')
    const sinCodigo = await registrar(OFF.dominio, nuevoTelefono(), 'Rosa')
    expect(conCodigo.status).toBe(sinCodigo.status)
    expect(conCodigo.body.message).toBe(sinCodigo.body.message)
    expect(Object.keys(conCodigo.body).sort()).toEqual(Object.keys(sinCodigo.body).sort())
    expect(conCodigo.body).not.toHaveProperty('referral_gift')

    const { rows } = await db().query(`SELECT count(*)::int AS n FROM referrals WHERE tenant_id = $1`, [OFF.id])
    expect(rows[0].n).toBe(0)
  })

  it('la tarjeta no ofrece el botón y la landing es la de siempre', async () => {
    const c = await clienteExistente(OFF, 'Sara')
    expect((await me(OFF.dominio, c.phone)).body).toEqual({ activo: false })
    expect((await landing(OFF.dominio, 'PQR234')).status).toBe(404)
    // Y la tarjeta no le creó un código a nadie.
    const { rows } = await db().query(`SELECT count(*)::int AS n FROM referral_codes WHERE customer_id = $1`, [c.id])
    expect(rows[0].n).toBe(0)
  })

  it('el escaneo del mesero no tiene nada de referidos', async () => {
    const c = await clienteExistente(OFF, 'Tomás')
    const e = await escanear(OFF.dominio, c.phone, OFF.sedes.Unica.mesero)
    expect(e.status).toBe(200)
    expect(e.body).not.toHaveProperty('referral_completed')
  })
})

describe('el código de la marca A no sirve en la marca B', () => {
  it('ni en la landing ni en el registro', async () => {
    const ana = await clienteExistente(A, 'Úrsula')
    const { body } = await me(A.dominio, ana.phone)

    expect((await landing(B.dominio, body.codigo)).status).toBe(404)
    const telAmigo = nuevoTelefono()
    const r = await registrar(B.dominio, telAmigo, 'Vale', body.codigo)
    expect(r.status).toBe(201)
    expect(r.body.message).toBe('welcome') // el registro normal de B, sin pendiente
    expect(r.body).not.toHaveProperty('referral_gift')

    expect(await referidosDe(A, ana.id)).toEqual([])
    const { rows } = await db().query(`SELECT count(*)::int AS n FROM referrals WHERE tenant_id = $1`, [B.id])
    expect(rows[0].n).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Dos sedes (Tepuy) y el canje en cualquier sede
// ═══════════════════════════════════════════════════════════════

describe('una marca de dos sedes', () => {
  it('desde la raíz, el enlace sale con el dominio de la sede donde vino quien invita; ahí el registro funciona', async () => {
    const ana = await clienteExistente(T, 'Wendy', T.sedes.Laureles.id)
    const tarjeta = await me(T.dominio, ana.phone)
    expect(tarjeta.body.enlace).toBe(`https://lau-${SUF}.test/r/${tarjeta.body.codigo}`)

    // En la raíz el registro pide sede (D21); la landing conserva el código al mandarlo a la sede.
    const enRaiz = await registrar(T.dominio, nuevoTelefono(), 'Ximena', tarjeta.body.codigo)
    expect(enRaiz.status).toBe(409)
    expect(enRaiz.body.locations).toHaveLength(2)

    const telAmigo = nuevoTelefono()
    const r = await registrar(`lau-${SUF}.test`, telAmigo, 'Yesid', tarjeta.body.codigo)
    expect(r.body.message).toBe('registered_pending_scan')
    const amigo = (await filaCliente(T, telAmigo))!
    expect(amigo.origin_location_id).toBe(T.sedes.Laureles.id)
    expect((await premiosDe(amigo.id))[0].granted_location_id).toBe(T.sedes.Laureles.id)

    // Viene a ENVIGADO: el premio de quien invita queda con la sede de ESA visita.
    await escanear(`env-${SUF}.test`, telAmigo, T.sedes.Envigado.mesero)
    const [premioDeAna] = await premiosDe(ana.id)
    expect(premioDeAna).toMatchObject({ source: 'referral', granted_location_id: T.sedes.Envigado.id })

    // ── Y lo canjea en LAURELES: el premio es de la marca, se entrega en cualquier sede ──
    const { POST } = await import('@/app/api/reward-redeem/route')
    const host = `lau-${SUF}.test`
    const res = await POST(
      new Request(`https://${host}/api/reward-redeem`, {
        method: 'POST',
        headers: { host, 'content-type': 'application/json', 'x-device-token': T.sedes.Laureles.aparato },
        body: JSON.stringify({
          customer_id: ana.id,
          grant_id: premioDeAna.id,
          prize_title: 'Rollo gratis',
          source: 'campaign_reward',
          redeemed_by_staff_id: T.sedes.Laureles.mesero,
        }),
      }) as never
    )
    expect(res.status).toBe(201)
    expect((await premiosDe(ana.id))[0].status).toBe('redeemed')
    const { rows } = await db().query(`SELECT redeemed_location_id FROM reward_redemptions WHERE grant_id = $1`, [premioDeAna.id])
    expect(rows[0].redeemed_location_id).toBe(T.sedes.Laureles.id)
  })

  it('quien invita sin sede conocida: el enlace sale con la raíz (la landing pregunta)', async () => {
    const ana = await clienteExistente(T, 'Zoe', null)
    expect((await me(T.dominio, ana.phone)).body.enlace.startsWith(`https://${T.dominio}/r/`)).toBe(true)
  })

  it('una marca de una sede: el enlace es su dominio de siempre', async () => {
    const ana = await clienteExistente(B, 'Alba', B.sedes.Norte.id)
    expect((await me(B.dominio, ana.phone)).body.enlace.startsWith(`https://${B.dominio}/r/`)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// Puntos en vez de premio
// ═══════════════════════════════════════════════════════════════

describe('puntos en vez de premio del catálogo', () => {
  it('quien invita y el amigo reciben sus puntos al validar el mesero, una vez', async () => {
    await ajustes(B, {
      referral_referrer_reward_type: 'points',
      referral_referrer_reward_points: '120',
      referral_referred_reward_type: 'points',
      referral_referred_reward_points: '40',
    })
    try {
      const ana = await clienteExistente(B, 'Bruno')
      const antes = (await filaCliente(B, ana.phone))!.total_points
      const { body } = await me(B.dominio, ana.phone)
      expect(body.gana).toBe('120 puntos')

      const telAmigo = nuevoTelefono()
      const r = await registrar(B.dominio, telAmigo, 'Celia', body.codigo)
      expect(r.body.referral_gift).toEqual({ tipo: 'points', texto: '40 puntos' })
      // Puntos desde el sofá, no: nada hasta que venga.
      expect((await filaCliente(B, telAmigo))!.total_points).toBe(0)

      await Promise.all([escanear(B.dominio, telAmigo, B.sedes.Norte.mesero), escanear(B.dominio, telAmigo, B.sedes.Norte.mesero)])

      expect((await filaCliente(B, ana.phone))!.total_points).toBe(antes + 120)
      const { rows } = await db().query(
        `SELECT customer_id, points, location_id FROM point_transactions WHERE tenant_id = $1 AND source = 'referral' ORDER BY points`,
        [B.id]
      )
      expect(rows).toHaveLength(2)
      expect(rows.map((x) => x.points)).toEqual([40, 120])
      expect(rows.every((x) => x.location_id === B.sedes.Norte.id)).toBe(true)
    } finally {
      await encender(B)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// Un fallo de base
// ═══════════════════════════════════════════════════════════════

describe('un fallo de base es 500, no «apagado»', () => {
  it('la tarjeta de quien invita', async () => {
    const ana = await clienteExistente(A, 'Dora')
    h.falla = 'referral_codes'
    const r = await me(A.dominio, ana.phone)
    expect(r.status).toBe(500)
    expect(r.body).not.toHaveProperty('activo')
  })

  it('la landing del amigo', async () => {
    h.falla = 'admin_settings'
    expect((await landing(A.dominio, 'ABC234')).status).toBe(500)
  })

  it('el registro con código: si la base no deja saber si cuenta, se registra como uno normal y NO se pierde', async () => {
    const ana = await clienteExistente(A, 'Eva')
    const { body } = await me(A.dominio, ana.phone)
    h.falla = 'referral_codes'
    const telAmigo = nuevoTelefono()
    const r = await registrar(A.dominio, telAmigo, 'Fede', body.codigo)
    expect(r.status).toBe(201)
    expect(await filaCliente(A, telAmigo)).toBeDefined()
  })
})
