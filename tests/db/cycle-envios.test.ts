/**
 * Ciclo de recuperación, fase 1B — el cron que decide y encola y el drenador que envía y
 * otorga, contra Postgres de verdad (2026-10-13).
 *
 * CÓMO SE PRUEBA
 * ──────────────
 * Las rutas REALES (`/api/cron/reactivation` y `/api/cron/queue-drain`) y sus servicios
 * reales, sobre la base embebida con todas las migraciones (la 00071 incluida), a través de
 * `tests/setup/supabase-sobre-pg.ts`: el UNIQUE del toque, el trigger que lleva cada desenlace
 * de la cola al toque, la fatiga, el índice de «un regalo activo» y los CHECK son los de
 * producción. Falsos solo: el envío por WhatsApp (graba lo que se mandó y nunca sale nada) y
 * la pregunta a Twilio de si «Regalo que vence» está aprobada.
 *
 * LA BASE ES COMPARTIDA con los demás archivos de `tests/db/` (corren en paralelo). Por eso:
 * el cron se llama siempre con `?tenant=` (sin él recorrería las marcas de otros archivos), y
 * el drenador —que es global— se acota a las marcas de ESTE archivo: `getPendingTenants()`,
 * el vencimiento (el UPDATE de `expire_send_queue()` acotado a estas marcas; llamar a la
 * función de verdad vencería items de `send-queue.test.ts` en medio de sus pruebas) y el cierre
 * de campañas. La poda no corre.
 *
 * Contra el código anterior (`9f6f093`): ver la entrada del 2026-10-13 en `CHANGELOG.md`.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'
import { bogotaDay, expiresOnSunday } from '@/lib/cycle-engine'
import { instanteEnBogota, nextSendSlot, queueExpiry, formatGiftDeadline } from '@/lib/cycle-touch'

const h = vi.hoisted(() => ({
  envios: [] as Array<{ telefono: string; plantilla: string; variables: Record<string, string>; tenantId: string }>,
  estado: { fallaElEnvio: false, aprobadaEnTwilio: true },
  preguntasATwilio: [] as string[],
  misMarcas: new Set<string>(),
}))

vi.mock('@supabase/supabase-js', async () => {
  const m = await import('../setup/supabase-sobre-pg')
  return { createClient: () => m.clienteDePrueba() }
})
// `@/lib/tenant` importa el cliente SSR (cookies): fuera del alcance de estas pruebas.
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/validators/cron', () => ({ validateCronSecret: () => true }))
vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: vi.fn(
    async (telefono: string, plantilla: string, variables: Record<string, string>, tenant: { id: string }) => {
      h.envios.push({ telefono, plantilla, variables, tenantId: tenant.id })
      return h.estado.fallaElEnvio ? null : { sid: `SM${h.envios.length}`, status: 'sent' }
    }
  ),
}))
vi.mock('@/services/twilio-catalog.service', () => ({
  isTwilioTemplateApproved: async (_tenant: unknown, sid: string) => {
    h.preguntasATwilio.push(sid)
    return h.estado.aprobadaEnTwilio
  },
}))
vi.mock('@/services/send-queue.service', async (original) => {
  const real = await original<typeof import('@/services/send-queue.service')>()
  const { getPool: pool } = await import('../setup/db')
  const mias = () => [...h.misMarcas]
  return {
    ...real,
    getPendingTenants: async () => (await real.getPendingTenants()).filter((t) => h.misMarcas.has(t.tenant_id)),
    // El UPDATE de `expire_send_queue()` (00038) tal cual, acotado a las marcas de este archivo.
    expireQueue: async () => {
      const { rowCount } = await pool().query(
        `UPDATE send_queue
            SET status = 'expired', last_error = 'expires_at vencido antes de encontrar cupo'
          WHERE status = 'queued' AND expires_at IS NOT NULL AND expires_at <= now()
            AND tenant_id = ANY($1)`,
        [mias()]
      )
      return rowCount ?? 0
    },
    getFinishedCampaigns: async () => {
      const ids = await real.getFinishedCampaigns()
      const { rows } = await pool().query<{ id: string }>(
        'SELECT id FROM campaigns WHERE id = ANY($1) AND tenant_id = ANY($2)',
        [ids, mias()]
      )
      return rows.map((r) => r.id)
    },
    pruneSendGovernance: async () => {},
  }
})

// ═══════════════════════════════════════════════════════════════
// Las marcas, los clientes y las corridas
// ═══════════════════════════════════════════════════════════════

const DIA = 24 * 60 * 60 * 1000
const db = () => getPool()
const hoy = () => bogotaDay(new Date())

interface Marca extends TestTenant {
  pequeno: string
  fuerte: string
}
const creadas: Marca[] = []

let telefono = 0
/** 10 dígitos, como los guarda el registro (el opt-out compara así). */
const nuevoTelefono = () => `31${String(process.pid % 1000).padStart(3, '0')}${String(++telefono).padStart(5, '0')}`

async function ajuste(t: TestTenant, key: string, value: string): Promise<void> {
  await db().query(
    `INSERT INTO admin_settings (key, value, tenant_id) VALUES ($1, $2, $3)
     ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value`,
    [key, value, t.id]
  )
}

async function nuevaMarca(
  opts: {
    encendido?: boolean
    proveedor?: 'twilio' | 'zernio'
    demo?: boolean
    domicilio?: boolean
    ajustes?: Record<string, string>
  } = {}
): Promise<Marca> {
  const t = await createTestTenant({ messagingProvider: opts.proveedor ?? 'twilio' })
  h.misMarcas.add(t.id)
  await db().query(`UPDATE tenants SET is_demo = $2, config = $3::jsonb WHERE id = $1`, [
    t.id,
    opts.demo ?? false,
    JSON.stringify({ has_delivery_webhook: opts.domicilio ?? true }),
  ])
  const premio = async (titulo: string) =>
    (
      await db().query<{ id: string }>(
        `INSERT INTO campaign_rewards (tenant_id, title) VALUES ($1, $2) RETURNING id`,
        [t.id, titulo]
      )
    ).rows[0].id
  const marca: Marca = { ...t, pequeno: await premio('½ rollo gratis'), fuerte: await premio('Rollo gratis') }
  creadas.push(marca)

  const base: Record<string, string> = {
    cycle_enabled: opts.encendido === false ? 'false' : 'true',
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
    ...opts.ajustes,
  }
  for (const [k, v] of Object.entries(base)) await ajuste(marca, k, v)
  return marca
}

/** Un cliente cuyo ciclo empezó hace `dias` días de Bogotá (la última visita, al mediodía). */
async function nuevoCliente(
  t: TestTenant,
  opts: {
    dias: number
    estado?: 'activo' | 'dormido'
    dormidoHace?: number
    visitas?: number
    canales?: 'qr' | 'delivery' | 'both'
    ultimaCampana?: Date
    heartbeats?: number
  }
): Promise<string> {
  const inicio = instanteEnBogota(hoy() - opts.dias, 12)
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers
       (tenant_id, phone, name, total_visits, total_points, source_channels, last_visit_at,
        cycle_started_at, cycle_state, dormant_since, last_campaign_at, heartbeats_sent)
     VALUES ($1, $2, 'Juanita', $3, 90, $4, $5, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      t.id,
      nuevoTelefono(),
      opts.visitas ?? 1,
      opts.canales ?? 'qr',
      inicio,
      opts.estado ?? 'activo',
      opts.dormidoHace !== undefined ? instanteEnBogota(hoy() - opts.dormidoHace, 12) : null,
      opts.ultimaCampana ?? null,
      opts.heartbeats ?? 0,
    ]
  )
  return rows[0].id
}

async function correrCron(t: TestTenant, extra = ''): Promise<Record<string, unknown>> {
  const { GET } = await import('@/app/api/cron/reactivation/route')
  const res = await GET(new Request(`https://x/api/cron/reactivation?tenant=${t.slug}${extra}`) as never)
  return (await res.json()) as Record<string, unknown>
}

/** Llegó la hora de la marca: lo encolado de esta marca ya se puede enviar, y corre el drenador. */
async function drenar(t: TestTenant): Promise<Record<string, unknown>> {
  await db().query(
    `UPDATE send_queue SET not_before = now() - interval '1 minute' WHERE tenant_id = $1 AND status = 'queued'`,
    [t.id]
  )
  const { GET } = await import('@/app/api/cron/queue-drain/route')
  const res = await GET(new Request('https://x/api/cron/queue-drain') as never)
  return (await res.json()) as Record<string, unknown>
}

interface FilaToque {
  id: string
  customer_id: string
  stage: string
  seq: number
  status: string
  holdout: boolean
  attempts: number
  due_at: Date
  sent_at: Date | null
  reason: string | null
  reward_id: string | null
  gift_size: string | null
  template_key: string | null
  campaign_message_id: string | null
  grant_id: string | null
}

async function toques(t: TestTenant, customerId?: string): Promise<FilaToque[]> {
  const { rows } = await db().query<FilaToque>(
    `SELECT * FROM customer_cycle_touches WHERE tenant_id = $1 AND ($2::uuid IS NULL OR customer_id = $2)
      ORDER BY customer_id, stage, seq`,
    [t.id, customerId ?? null]
  )
  return rows
}

interface FilaCola {
  id: string
  customer_id: string
  status: string
  template_sid: string
  variables: Record<string, string>
  not_before: Date
  expires_at: Date
  message_type: string
  location_id: string | null
  cycle_touch_id: string | null
  campaign_id: string | null
  last_error: string | null
}

async function cola(t: TestTenant): Promise<FilaCola[]> {
  const { rows } = await db().query<FilaCola>('SELECT * FROM send_queue WHERE tenant_id = $1 ORDER BY enqueued_at', [t.id])
  return rows
}

async function cliente(id: string) {
  const { rows } = await db().query<{
    cycle_no: number
    cycle_state: string
    dormant_since: Date | null
    heartbeats_sent: number
    strong_offer_last_at: Date | null
    cycle_touches: number
  }>('SELECT cycle_no, cycle_state, dormant_since, heartbeats_sent, strong_offer_last_at, cycle_touches FROM customers WHERE id = $1', [id])
  return rows[0]
}

async function limpiar(t: TestTenant): Promise<void> {
  await db().query('DELETE FROM restaurant_events WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM send_queue WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM customer_cycle_touches WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM reward_grants WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
  h.misMarcas.delete(t.id)
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
})

beforeEach(() => {
  h.envios.length = 0
  h.preguntasATwilio.length = 0
  h.estado.fallaElEnvio = false
  h.estado.aprobadaEnTwilio = true
})

afterAll(async () => {
  for (const m of creadas) await limpiar(m)
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// 1. Apagado: el código de hoy
// ═══════════════════════════════════════════════════════════════

describe('con el ciclo APAGADO la marca hace exactamente lo de hoy', () => {
  it('suave e insistente salen al momento por el camino viejo; ni toques ni cola; la fecha de encendido se borra', async () => {
    const t = await nuevaMarca({ encendido: false, ajustes: { cycle_enabled_at: '2026-01-01T00:00:00.000Z' } })
    const suave = await nuevoCliente(t, { dias: 22 })
    const insistente = await nuevoCliente(t, { dias: 30 })

    const r = await correrCron(t)

    expect(r).not.toHaveProperty('ciclo')
    expect(r).toMatchObject({ ok: true, sent: 2, aggressive_sent: 1, total_inactive_customers: 2 })
    expect(h.envios.map((e) => e.plantilla).sort()).toEqual(['HX_INSISTENTE', 'HX_SUAVE'])
    expect(await toques(t)).toEqual([])
    expect(await cola(t)).toEqual([])
    const { rows } = await db().query(
      `SELECT cm.customer_id FROM campaign_messages cm WHERE cm.tenant_id = $1 AND cm.status = 'sent'`,
      [t.id]
    )
    expect(rows.map((x) => x.customer_id).sort()).toEqual([suave, insistente].sort())
    const { rows: fecha } = await db().query(
      `SELECT 1 FROM admin_settings WHERE tenant_id = $1 AND key = 'cycle_enabled_at'`,
      [t.id]
    )
    expect(fecha).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Encendido: decide y encola, un toque por etapa
// ═══════════════════════════════════════════════════════════════

describe('con el ciclo ENCENDIDO el cron decide y encola (no envía)', () => {
  it('anota el encendido; cada etapa a la hora de la marca; un toque por etapa aunque corra dos veces a la vez y una tercera', async () => {
    const t = await nuevaMarca()
    const ids = {
      t1: await nuevoCliente(t, { dias: 14 }),
      t2: await nuevoCliente(t, { dias: 28 }),
      t3: await nuevoCliente(t, { dias: 42 }),
      t4: await nuevoCliente(t, { dias: 60 }),
      t5: await nuevoCliente(t, { dias: 80 }),
    }

    const [a, b] = await Promise.all([correrCron(t), correrCron(t)])
    h.preguntasATwilio.length = 0
    const c = await correrCron(t)

    expect(h.envios).toEqual([]) // nada sale desde el cron
    for (const r of [a, b]) expect(r).toMatchObject({ ok: true, ciclo: true, sent: 0 })
    expect(h.preguntasATwilio.length).toBeLessThanOrEqual(1) // una vez por corrida, a lo sumo
    expect(c).toMatchObject({ saltados: { en_curso: 5 } })

    const filas = await toques(t)
    expect(filas).toHaveLength(5)
    const porCliente = new Map(filas.map((f) => [f.customer_id, f]))
    expect(porCliente.get(ids.t1)).toMatchObject({ stage: 't1', status: 'queued', template_key: 'reactivation_no_reward', gift_size: null })
    expect(porCliente.get(ids.t2)).toMatchObject({ stage: 't2', status: 'queued', template_key: 'gift_expiring', gift_size: 'small', reward_id: t.pequeno })
    expect(porCliente.get(ids.t3)).toMatchObject({ stage: 't3', status: 'queued', template_key: 'campaign_presencial_to_domicilio' })
    expect(porCliente.get(ids.t4)).toMatchObject({ stage: 't4', status: 'queued', template_key: 'gift_expiring', gift_size: 'strong', reward_id: t.fuerte })
    expect(porCliente.get(ids.t5)).toMatchObject({ stage: 't5', status: 'queued', template_key: 'reactivation_aggressive', gift_size: null })

    const items = await cola(t)
    expect(items).toHaveLength(5)
    const slot = nextSendSlot(new Date(), 'dinner')
    for (const item of items) {
      const tq = filas.find((f) => f.id === item.cycle_touch_id)!
      expect(tq.customer_id).toBe(item.customer_id)
      expect(item).toMatchObject({ status: 'queued', message_type: 'reactivation', location_id: null })
      expect(item.not_before.toISOString()).toBe(slot.toISOString())
      expect(item.expires_at.toISOString()).toBe(queueExpiry(slot).toISOString())
      // El `due_at` del toque es la hora real del envío (H5), lo puso el trigger de la cola.
      expect(tq.due_at.toISOString()).toBe(slot.toISOString())
    }
    // La fecha NO va al encolar: {{3}} de «Regalo que vence» lo pone el drenador.
    const delT2 = items.find((i) => i.customer_id === ids.t2)!
    expect(delT2.template_sid).toBe('HX_REGALO')
    expect(delT2.variables).toMatchObject({ '1': 'Juanita', '2': '½ rollo gratis' })
    expect(delT2.variables).not.toHaveProperty('3')

    const { rows: enc } = await db().query(`SELECT value FROM admin_settings WHERE tenant_id = $1 AND key = 'cycle_enabled_at'`, [t.id])
    expect(enc).toHaveLength(1)
    const { rows: camp } = await db().query(`SELECT source, status FROM campaigns WHERE tenant_id = $1`, [t.id])
    expect(camp).toEqual([{ source: 'reactivation', status: 'running' }])
  })

  it('nada atrasado el día del encendido, y quien pasó la despedida se duerme sin mensaje', async () => {
    const t = await nuevaMarca()
    const entreDos = await nuevoCliente(t, { dias: 30 }) // t2 fue el día 28: espera el t3
    const pasado = await nuevoCliente(t, { dias: 85 }) // la despedida fue el día 80
    const alDia = await nuevoCliente(t, { dias: 28 })

    const r = await correrCron(t)

    expect(r).toMatchObject({ saltados: { atrasado: 1 }, dormidos_por_encendido: 1, por_etapa: { t2: 1 } })
    expect((await toques(t)).map((f) => f.customer_id)).toEqual([alDia])
    expect(await toques(t, entreDos)).toEqual([])
    expect(await cliente(pasado)).toMatchObject({ cycle_state: 'dormido' })
    expect((await cliente(pasado)).dormant_since).not.toBeNull()
    expect((await cola(t)).map((i) => i.customer_id)).toEqual([alDia])
  })

  it('un evento de su audiencia en blackout pospone el toque al día siguiente del evento', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    const evento = new Date((hoy() + 3) * DIA).toISOString().slice(0, 10)
    await db().query(
      `INSERT INTO restaurant_events (tenant_id, title, event_date, event_type, status, blackout_days)
       VALUES ($1, 'Noche de sushi', $2, 'promo', 'planned', 5)`,
      [t.id, evento]
    )

    const r = await correrCron(t)

    expect(r).toMatchObject({ pospuestos: { evento: 1 } })
    const [tq] = await toques(t, c)
    expect(tq).toMatchObject({ stage: 't2', status: 'deferred' })
    expect(tq.due_at.toISOString()).toBe(instanteEnBogota(hoy() + 4).toISOString())
    expect(await cola(t)).toEqual([])
  })

  it('el grupo de control queda con su fila y su hora, sin cola y sin campaña vacía', async () => {
    const t = await nuevaMarca({ ajustes: { cycle_holdout_pct: '100' } })
    const c = await nuevoCliente(t, { dias: 28 })

    const r = await correrCron(t)

    expect(r).toMatchObject({ en_control: 1, campaign_id: null })
    const [tq] = await toques(t, c)
    expect(tq).toMatchObject({ status: 'holdout', holdout: true, template_key: 'gift_expiring', gift_size: 'small' })
    expect(tq.due_at.toISOString()).toBe(nextSendSlot(new Date(), 'dinner').toISOString())
    expect(await cola(t)).toEqual([])
    const { rows } = await db().query('SELECT 1 FROM campaigns WHERE tenant_id = $1', [t.id])
    expect(rows).toHaveLength(0)
  })

  it('el cap de 7 días y el tope del mes posponen, cada uno con su fecha', async () => {
    const t = await nuevaMarca()
    const hace2 = new Date(Date.now() - 2 * DIA)
    const reciente = await nuevoCliente(t, { dias: 28, ultimaCampana: hace2 })
    const alTope = await nuevoCliente(t, { dias: 28 })
    const { rows: [manual] } = await db().query<{ id: string }>(
      `INSERT INTO campaigns (name, type, source, message_template, status, tenant_id)
       VALUES ('manual de prueba', 'manual', 'manual', 'HX', 'completed', $1) RETURNING id`,
      [t.id]
    )
    for (let i = 0; i < 3; i++) {
      await db().query(
        `INSERT INTO campaign_messages (campaign_id, customer_id, status, tenant_id, sent_at) VALUES ($1, $2, 'sent', $3, now())`,
        [manual.id, alTope, t.id]
      )
    }

    const r = await correrCron(t)

    expect(r).toMatchObject({ pospuestos: { siete_dias: 1, tope_mes: 1 } })
    const [a] = await toques(t, reciente)
    expect(a.status).toBe('deferred')
    expect(a.due_at.getTime()).toBe(hace2.getTime() + 7 * DIA)
    const [b] = await toques(t, alTope)
    expect(b.status).toBe('deferred')
    const { getMonthBoundaries } = await import('@/services/campaign.service')
    expect(b.due_at.toISOString()).toBe(getMonthBoundaries(new Date()).nextMonthISO)
    expect(await cola(t)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. El adaptador según la marca
// ═══════════════════════════════════════════════════════════════

describe('el adaptador: «Regalo que vence» solo si está aprobada en esa marca', () => {
  it('Twilio sin aprobar → la insistente con el regalo en {{4}} (y se pregunta una vez)', async () => {
    h.estado.aprobadaEnTwilio = false
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await nuevoCliente(t, { dias: 60 })

    await correrCron(t)

    expect(h.preguntasATwilio).toEqual(['HX_REGALO'])
    const item = (await cola(t)).find((i) => i.customer_id === c)!
    expect(item.template_sid).toBe('HX_INSISTENTE')
    expect(item.variables).toMatchObject({ '4': '½ rollo gratis' })
    expect(item.variables).not.toHaveProperty('5')
    expect((await toques(t, c))[0]).toMatchObject({ template_key: 'reactivation_aggressive', gift_size: 'small' })
  })

  it('Zernio y la marca demo usan «Regalo que vence» sin preguntarle a Twilio', async () => {
    h.estado.aprobadaEnTwilio = false
    const zernio = await nuevaMarca({ proveedor: 'zernio' })
    const demo = await nuevaMarca({ demo: true })
    await nuevoCliente(zernio, { dias: 28 })
    await nuevoCliente(demo, { dias: 28 })

    await correrCron(zernio)
    await correrCron(demo)

    expect(h.preguntasATwilio).toEqual([])
    expect((await cola(zernio))[0].template_sid).toBe('HX_REGALO')
    expect((await cola(demo))[0].template_sid).toBe('HX_REGALO')
  })

  it('sin regalo configurado el toque sale igual, con la insistente y sin {{4}}; sin plantilla, no se crea y se cuenta', async () => {
    const t = await nuevaMarca({ ajustes: { cycle_small_reward_ids: '', cycle_strong_reward_id: '' } })
    await db().query(`DELETE FROM admin_settings WHERE tenant_id = $1 AND key = 'reactivation_no_reward_template_sid'`, [t.id])
    const conRegaloPrevisto = await nuevoCliente(t, { dias: 28 })
    const t1 = await nuevoCliente(t, { dias: 14 })

    const r = await correrCron(t)

    expect(r).toMatchObject({ saltados: { sin_plantilla: { t1: 1 } } })
    expect(await toques(t, t1)).toEqual([])
    const item = (await cola(t)).find((i) => i.customer_id === conRegaloPrevisto)!
    expect(item.template_sid).toBe('HX_INSISTENTE')
    expect(Object.keys(item.variables).sort()).toEqual(['1', '2', '3'])
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. ?dry=1
// ═══════════════════════════════════════════════════════════════

describe('?dry=1: las mismas decisiones, cero escrituras', () => {
  async function foto(t: TestTenant) {
    const q = async (sql: string) => (await db().query(sql, [t.id])).rows
    return {
      toques: await q('SELECT * FROM customer_cycle_touches WHERE tenant_id = $1 ORDER BY id'),
      cola: await q('SELECT * FROM send_queue WHERE tenant_id = $1 ORDER BY id'),
      ajustes: await q('SELECT key, value FROM admin_settings WHERE tenant_id = $1 ORDER BY key'),
      campanas: await q('SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY id'),
      regalos: await q('SELECT * FROM reward_grants WHERE tenant_id = $1 ORDER BY id'),
      clientes: await q('SELECT * FROM customers WHERE tenant_id = $1 ORDER BY id'),
    }
  }

  it('cuenta por etapa, control, pospuestos, dormidos por encendido y ejemplos, sin escribir ni enviar nada', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 14 })
    await nuevoCliente(t, { dias: 28 })
    await nuevoCliente(t, { dias: 85 })
    await nuevoCliente(t, { dias: 28, ultimaCampana: new Date(Date.now() - DIA) })
    await db().query(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status, expires_at)
       SELECT $1, id, 'campaign_prize', 'reactivation', 'viejo', 'active', now() - interval '1 day'
         FROM customers WHERE tenant_id = $1 LIMIT 1`,
      [t.id]
    )
    const antes = await foto(t)

    const r = await correrCron(t, '&dry=1')

    expect(await foto(t)).toEqual(antes) // ni el regalo vencido se marca vencido
    expect(h.envios).toEqual([])
    expect(r).toMatchObject({
      ciclo: true,
      dry: true,
      encendido: true,
      por_etapa: { t1: 1, t2: 1 },
      pospuestos: { siete_dias: 1 },
      dormidos_por_encendido: 1,
      encolados_en_la_cola: 0,
    })
    expect((r.ejemplos as unknown[]).length).toBe(3)
    expect((r.ejemplos as Array<{ decision: string }>)[0].decision).toBe('encolar')
  })

  it('en una marca APAGADA simula el ciclo como si se encendiera hoy, sin encenderla', async () => {
    const t = await nuevaMarca({ encendido: false })
    await nuevoCliente(t, { dias: 28 })
    const antes = await foto(t)

    const r = await correrCron(t, '&dry=1')

    expect(r).toMatchObject({ ciclo: true, dry: true, encendido: false, por_etapa: { t2: 1 } })
    expect(await foto(t)).toEqual(antes)
    expect(h.envios).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. El drenador: envía, otorga y escribe el toque
// ═══════════════════════════════════════════════════════════════

describe('el drenador envía el toque, pone la fecha y otorga el regalo solo si salió', () => {
  it('t2: «Regalo que vence» con la fecha de HOY en {{3}}; el pequeño, con ese vencimiento y sin recordatorio; el toque sent con su mensaje y su regalo', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)

    const r = await drenar(t)
    const vence = expiresOnSunday(new Date())

    expect(r).toMatchObject({ ok: true, sent: 1 })
    expect(h.envios).toHaveLength(1)
    expect(h.envios[0]).toMatchObject({ plantilla: 'HX_REGALO', variables: { '1': 'Juanita', '2': '½ rollo gratis', '3': formatGiftDeadline(vence) } })

    const { rows: [grant] } = await db().query(
      `SELECT id, expires_at, skip_reminder, campaign_reward_id, prize_title, source, status FROM reward_grants WHERE customer_id = $1`,
      [c]
    )
    expect(grant).toMatchObject({ skip_reminder: true, campaign_reward_id: t.pequeno, prize_title: '½ rollo gratis', source: 'reactivation', status: 'active' })
    expect(grant.expires_at.toISOString()).toBe(vence.toISOString())

    const [tq] = await toques(t, c)
    expect(tq).toMatchObject({ status: 'sent', grant_id: grant.id })
    expect(tq.sent_at).not.toBeNull()
    const { rows: [msg] } = await db().query(`SELECT id, status FROM campaign_messages WHERE id = $1`, [tq.campaign_message_id])
    expect(msg).toMatchObject({ status: 'sent' })
    // La fatiga lo contó (trigger de la 00070) y la campaña del día se cerró al vaciarse la cola.
    expect((await cliente(c)).cycle_touches).toBe(1)
    const { rows: camp } = await db().query(`SELECT status, total_sent FROM campaigns WHERE tenant_id = $1`, [t.id])
    expect(camp).toEqual([{ status: 'completed', total_sent: 1 }])
  })

  it('t4 con la insistente: regalo en {{4}} y fecha en {{5}}; el fuerte lleva recordatorio y mueve el cooldown', async () => {
    h.estado.aprobadaEnTwilio = false
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 60 })
    await correrCron(t)

    await drenar(t)
    const vence = expiresOnSunday(new Date())

    expect(h.envios[0]).toMatchObject({ plantilla: 'HX_INSISTENTE', variables: { '4': 'Rollo gratis', '5': formatGiftDeadline(vence) } })
    const { rows: [grant] } = await db().query(`SELECT skip_reminder, expires_at FROM reward_grants WHERE customer_id = $1`, [c])
    expect(grant.skip_reminder).toBe(false)
    expect(grant.expires_at.toISOString()).toBe(vence.toISOString())
    expect((await cliente(c)).strong_offer_last_at).not.toBeNull()
  })

  it('si el envío falla NO se otorga nada; a los 3 intentos de la cola el toque queda failed (+1); el cron lo reintenta y a los 3 se rinde', async () => {
    h.estado.fallaElEnvio = true
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })

    for (let intento = 1; intento <= 3; intento++) {
      const r = await correrCron(t)
      expect(r).toMatchObject({ encolados_en_la_cola: 1 })
      await drenar(t)
      expect((await toques(t, c))[0]).toMatchObject({ status: 'queued' }) // reintentable: sigue en cola
      await drenar(t)
      await drenar(t)
      const [tq] = await toques(t, c)
      expect(tq).toMatchObject({ status: 'failed', attempts: intento })
      expect(tq.reason).toMatch(/La cola se rindió/)
    }

    const r = await correrCron(t)
    expect(r).toMatchObject({ encolados_en_la_cola: 0 })
    expect(await cola(t)).toHaveLength(3)
    const { rows } = await db().query('SELECT 1 FROM reward_grants WHERE customer_id = $1', [c])
    expect(rows).toHaveLength(0)
  })

  it('un duplicate_active a pesar de la guarda (carrera) deja el toque sent sin regalo, con log, y no se reintenta', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)
    const [item] = await cola(t)
    const [tq] = await toques(t, c)
    // La carrera: entre la guarda del drenador y el otorgamiento, otro camino le dio un regalo.
    await db().query(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status, expires_at)
       VALUES ($1, $2, 'campaign_prize', 'reactivation', 'De otra vía', 'active', now() + interval '3 days')`,
      [t.id, c]
    )
    await db().query(`UPDATE send_queue SET status = 'sent', sent_at = now() WHERE id = $1`, [item.id]) // salió
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { completarToquesEnviados } = await import('@/services/cycle.service')

    await completarToquesEnviados(t.id, [
      {
        item: { ...item, sent_at: null } as never,
        toque: { id: tq.id, customer_id: c, cycle_no: 1, stage: 't2', seq: 1, status: 'queued', gift_size: 'small', reward_id: t.pequeno, template_key: 'gift_expiring' },
        variables: { ...item.variables, '3': 'domingo 18 de octubre' },
        vence: expiresOnSunday(new Date()),
        campaignMessageId: null,
        heartbeatsSent: 0,
      },
    ])

    expect((await toques(t, c))[0]).toMatchObject({ status: 'sent', grant_id: null })
    const { rows } = await db().query(`SELECT prize_title FROM reward_grants WHERE customer_id = $1`, [c])
    expect(rows).toEqual([{ prize_title: 'De otra vía' }])
    expect(aviso.mock.calls.map((x) => String(x[0])).join('\n')).toMatch(/carrera/)
    aviso.mockRestore()
    // Y el cron no lo vuelve a intentar.
    expect(await correrCron(t)).toMatchObject({ encolados_en_la_cola: 0 })
  })

  it('la despedida (t5) sale sin regalo y duerme al cliente', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 80 })
    await correrCron(t)

    await drenar(t)

    expect(h.envios[0].plantilla).toBe('HX_INSISTENTE')
    expect(Object.keys(h.envios[0].variables).sort()).toEqual(['1', '2', '3'])
    expect(await cliente(c)).toMatchObject({ cycle_state: 'dormido' })
    expect((await toques(t, c))[0]).toMatchObject({ status: 'sent', grant_id: null })
  })

  it('el trimestral: el 1 con el pequeño, el 2 con el fuerte, y a los 90 días del segundo, archivado', async () => {
    const t = await nuevaMarca()
    const uno = await nuevoCliente(t, { dias: 200, estado: 'dormido', dormidoHace: 90 })
    const dos = await nuevoCliente(t, { dias: 290, estado: 'dormido', dormidoHace: 180, heartbeats: 1 })
    const archivo = await nuevoCliente(t, { dias: 380, estado: 'dormido', dormidoHace: 270, heartbeats: 2 })
    const latido = (customerId: string, seq: number, enviadoHace: number) =>
      db().query(
        `INSERT INTO customer_cycle_touches (tenant_id, customer_id, cycle_no, stage, seq, status, due_at, sent_at)
         VALUES ($1, $2, 1, 'heartbeat', $3, 'sent', now() - make_interval(days => $4), now() - make_interval(days => $4))`,
        [t.id, customerId, seq, enviadoHace]
      )
    await latido(dos, 1, 90)
    await latido(archivo, 1, 180)
    await latido(archivo, 2, 90)

    const r = await correrCron(t)
    expect(r).toMatchObject({ por_etapa: { heartbeat: 2 }, archivados: 1 })
    expect(await cliente(archivo)).toMatchObject({ cycle_state: 'archivado' })

    await drenar(t)

    const g = async (id: string) =>
      (await db().query(`SELECT skip_reminder, campaign_reward_id FROM reward_grants WHERE customer_id = $1`, [id])).rows[0]
    expect(await g(uno)).toEqual({ skip_reminder: true, campaign_reward_id: t.pequeno })
    expect(await g(dos)).toEqual({ skip_reminder: false, campaign_reward_id: t.fuerte })
    expect(await cliente(uno)).toMatchObject({ heartbeats_sent: 1, cycle_state: 'dormido' })
    expect(await cliente(dos)).toMatchObject({ heartbeats_sent: 2 })
    expect((await cliente(dos)).strong_offer_last_at).not.toBeNull()
  })
})

describe('el drenador: todo desenlace escribe el toque (H6)', () => {
  it('el cliente volvió antes del envío → item y toque cancelados, nada sale', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)
    await db().query('UPDATE customers SET last_visit_at = now() WHERE id = $1', [c]) // la visita (trigger: ciclo 2)

    await drenar(t)

    expect(h.envios).toEqual([])
    expect((await cola(t))[0].status).toBe('cancelled')
    const [tq] = await toques(t, c)
    expect(tq.status).toBe('cancelled')
    expect(tq.reason).toMatch(/volvió/)
  })

  it('la marca apagó el ciclo → lo que estaba en cola ya no sale', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)
    await ajuste(t, 'cycle_enabled', 'false')

    await drenar(t)

    expect(h.envios).toEqual([])
    expect((await toques(t, c))[0]).toMatchObject({ status: 'cancelled' })
  })

  it('con un regalo de reactivación vivo, el toque con regalo no sale ni cuenta: queda deferred hasta el día siguiente a que venza', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    const vence = new Date(Date.now() + 3 * DIA)
    await db().query(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status, expires_at)
       VALUES ($1, $2, 'campaign_prize', 'reactivation', 'Postre', 'active', $3)`,
      [t.id, c, vence]
    )
    await correrCron(t)

    await drenar(t)

    expect(h.envios).toEqual([])
    const [tq] = await toques(t, c)
    expect(tq.status).toBe('deferred')
    expect(tq.due_at.toISOString()).toBe(instanteEnBogota(bogotaDay(vence) + 1).toISOString())
    expect((await cliente(c)).cycle_touches).toBe(0)
  })

  it('el cap de 7 días en el drenador pospone el toque (no lo pierde)', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)
    const otra = new Date()
    await db().query('UPDATE customers SET last_campaign_at = $2 WHERE id = $1', [c, otra])

    await drenar(t)

    const [tq] = await toques(t, c)
    expect(tq.status).toBe('deferred')
    expect(tq.due_at.getTime()).toBe(otra.getTime() + 7 * DIA)
  })

  it('un item que vence en la cola deja el toque failed (+1), no queued', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)
    await db().query(`UPDATE send_queue SET expires_at = now() - interval '1 second' WHERE tenant_id = $1`, [t.id])

    await drenar(t)

    expect((await cola(t))[0].status).toBe('expired')
    const [tq] = await toques(t, c)
    expect(tq).toMatchObject({ status: 'failed', attempts: 1 })
    expect(tq.reason).toMatch(/Venció en la cola/)
  })

  it('expire_send_queue() vence con un UPDATE de status: el trigger de la 00071 lo ve', async () => {
    const { rows } = await db().query<{ src: string }>(
      `SELECT prosrc AS src FROM pg_proc WHERE proname = 'expire_send_queue'`
    )
    expect(rows[0].src).toMatch(/UPDATE send_queue\s+SET status = 'expired'/)
    const { rows: trig } = await db().query(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.send_queue'::regclass AND tgname LIKE 'on_send_queue_%_cycle' ORDER BY 1`
    )
    expect(trig.map((x) => x.tgname)).toEqual(['on_send_queue_insert_cycle', 'on_send_queue_status_cycle'])
  })

  it('cancelar desde el panel deja el toque cancelled, no queued', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)
    const [item] = await cola(t)
    const { cancelQueueItemForTenant } = await import('@/services/send-queue.service')
    const { decideLocationScope } = await import('@/lib/location-scope')
    const alcance = decideLocationScope({ tenantId: t.id, permissions: [], activeLocationIds: [], requested: null })
    if (!alcance.ok) throw new Error('alcance')

    await expect(cancelQueueItemForTenant(alcance.scope, item.id)).resolves.toEqual({ cancelled: true })

    const [tq] = await toques(t, c)
    expect(tq).toMatchObject({ status: 'cancelled', reason: 'Cancelado desde el dashboard' })
  })

  it('un opt-out mientras esperaba → toque cancelled', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 28 })
    await correrCron(t)
    await db().query('UPDATE customers SET whatsapp_opt_out_at = now() WHERE id = $1', [c])

    await drenar(t)

    expect((await toques(t, c))[0]).toMatchObject({ status: 'cancelled' })
    expect(h.envios).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. H2, N-MES y la migración
// ═══════════════════════════════════════════════════════════════

describe('H2: el regalo pequeño vence sin recordatorio', () => {
  it('findGrantsDueForReminder() no devuelve los skip_reminder', async () => {
    const t = await nuevaMarca()
    const conAviso = await nuevoCliente(t, { dias: 100 })
    const sinAviso = await nuevoCliente(t, { dias: 100 })
    for (const [id, skip] of [[conAviso, false], [sinAviso, true]] as const) {
      await db().query(
        `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status, expires_at, skip_reminder, granted_at)
         VALUES ($1, $2, 'campaign_prize', 'reactivation', 'Premio', 'active', now() + interval '1 day', $3, now() - interval '1 day')`,
        [t.id, id, skip]
      )
    }
    const { findGrantsDueForReminder } = await import('@/services/reward-grant.service')
    expect((await findGrantsDueForReminder(t.id, 2)).map((g) => g.customer_id)).toEqual([conAviso])
  })
})

describe('N-MES: el tope de 3 al mes cuenta por mes de Bogotá', () => {
  it('tres mensajes el último día del mes anterior a las 23:00 de Bogotá no cuentan; tres del día 1 sí', async () => {
    const t = await nuevaMarca()
    const anterior = await nuevoCliente(t, { dias: 100 })
    const este = await nuevoCliente(t, { dias: 100 })
    const { getMonthBoundaries, getCustomersAtMonthlyCap } = await import('@/services/campaign.service')
    const inicio = new Date(getMonthBoundaries(new Date()).startISO).getTime()
    const { rows: [camp] } = await db().query<{ id: string }>(
      `INSERT INTO campaigns (name, type, source, message_template, status, tenant_id)
       VALUES ('m', 'manual', 'manual', 'HX', 'completed', $1) RETURNING id`,
      [t.id]
    )
    for (const [id, cuando] of [[anterior, inicio - 60 * 60 * 1000], [este, inicio + 60 * 60 * 1000]] as const) {
      for (let i = 0; i < 3; i++) {
        await db().query(
          `INSERT INTO campaign_messages (campaign_id, customer_id, status, tenant_id, sent_at) VALUES ($1, $2, 'sent', $3, $4)`,
          [camp.id, id, t.id, new Date(cuando)]
        )
      }
    }
    expect([...(await getCustomersAtMonthlyCap([anterior, este]))]).toEqual([este])
  })
})

describe('la migración 00071', () => {
  let t: Marca
  let c: string
  beforeAll(async () => {
    t = await nuevaMarca()
    c = await nuevoCliente(t, { dias: 28 })
  })

  const insertarToque = (extra: Record<string, unknown>) => {
    const cols = { tenant_id: t.id, customer_id: c, cycle_no: 1, stage: 't2', seq: 1, status: 'pending', ...extra }
    const keys = Object.keys(cols)
    return db().query<{ id: string }>(
      `INSERT INTO customer_cycle_touches (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(cols)
    )
  }

  it('el estado admite cancelled y los CHECK nuevos rechazan lo que no es', async () => {
    const { rows } = await insertarToque({ status: 'cancelled', seq: 11 })
    expect(rows).toHaveLength(1)
    await expect(insertarToque({ status: 'enviado', seq: 12 })).rejects.toMatchObject({ code: '23514' })
    await expect(insertarToque({ gift_size: 'mediano', seq: 13 })).rejects.toMatchObject({ code: '23514' })
    await expect(insertarToque({ template_key: 'otra', seq: 14 })).rejects.toMatchObject({ code: '23514' })
    await expect(insertarToque({ attempts: -1, seq: 15 })).rejects.toMatchObject({ code: '23514' })
    // Los del grupo de control de la 00070 siguen: un holdout no se cancela ni se encola.
    await expect(insertarToque({ holdout: true, status: 'cancelled', seq: 16 })).rejects.toMatchObject({ code: '23514' })
  })

  it('las FK: un regalo que no existe no entra; borrar el premio o el toque deja NULL', async () => {
    await expect(insertarToque({ reward_id: '00000000-0000-4000-8000-000000000000', seq: 21 })).rejects.toMatchObject({ code: '23503' })
    const { rows: [premio] } = await db().query<{ id: string }>(`INSERT INTO campaign_rewards (tenant_id, title) VALUES ($1, 'Efímero') RETURNING id`, [t.id])
    const { rows: [tq] } = await insertarToque({ reward_id: premio.id, gift_size: 'small', seq: 22 })
    await db().query('DELETE FROM campaign_rewards WHERE id = $1', [premio.id])
    const { rows: [despues] } = await db().query('SELECT reward_id, gift_size FROM customer_cycle_touches WHERE id = $1', [tq.id])
    expect(despues).toEqual({ reward_id: null, gift_size: 'small' })

    await expect(
      db().query(
        `INSERT INTO send_queue (tenant_id, phone, priority, message_type, template_sid, cycle_touch_id)
         VALUES ($1, '3000000000', 2, 'reactivation', 'HX', '00000000-0000-4000-8000-000000000000')`,
        [t.id]
      )
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('enqueue_send_queue() guarda cycle_touch_id, sigue siendo UNA función, y el trigger pasa el toque a queued', async () => {
    const { rows: [tq] } = await insertarToque({ seq: 31 })
    const notBefore = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { rows } = await db().query<{ n: number }>('SELECT enqueue_send_queue($1::jsonb) AS n', [
      JSON.stringify([
        { tenant_id: t.id, phone: '3000000031', customer_id: c, priority: 2, message_type: 'reactivation', template_sid: 'HX', not_before: notBefore, cycle_touch_id: tq.id },
      ]),
    ])
    expect(rows[0].n).toBe(1)
    const { rows: [item] } = await db().query('SELECT cycle_touch_id FROM send_queue WHERE cycle_touch_id = $1', [tq.id])
    expect(item.cycle_touch_id).toBe(tq.id)
    const { rows: [despues] } = await db().query('SELECT status, due_at FROM customer_cycle_touches WHERE id = $1', [tq.id])
    expect(despues.status).toBe('queued')
    expect(despues.due_at.toISOString()).toBe(notBefore)
    const { rows: sobrecargas } = await db().query(`SELECT 1 FROM pg_proc WHERE proname = 'enqueue_send_queue'`)
    expect(sobrecargas).toHaveLength(1)
    await db().query('DELETE FROM send_queue WHERE cycle_touch_id = $1', [tq.id])
  })

  it('el trigger no toca el toque de OTRA marca aunque un item lo nombre', async () => {
    const otra = await nuevaMarca()
    const { rows: [tq] } = await insertarToque({ seq: 41, status: 'queued' })
    const { rows: [item] } = await db().query<{ id: string }>(
      `INSERT INTO send_queue (tenant_id, phone, priority, message_type, template_sid, cycle_touch_id)
       VALUES ($1, '3000000041', 2, 'reactivation', 'HX', $2) RETURNING id`,
      [otra.id, tq.id]
    )
    await db().query(`UPDATE send_queue SET status = 'cancelled', last_error = 'ajeno' WHERE id = $1`, [item.id])
    const { rows: [despues] } = await db().query('SELECT status FROM customer_cycle_touches WHERE id = $1', [tq.id])
    expect(despues.status).toBe('queued')
    await db().query('DELETE FROM send_queue WHERE id = $1', [item.id])
  })

  it('la reconciliación recoge lo que el trigger no escribió: vencido → failed; sin item → pending', async () => {
    const { rows: [vencido] } = await insertarToque({ seq: 51, status: 'queued' })
    const { rows: [huerfano] } = await insertarToque({ seq: 52, status: 'queued' })
    const cliente = await getPool().connect()
    try {
      await cliente.query('BEGIN')
      // Como si el trigger hubiera fallado: el item cambia de estado sin que el toque se entere.
      await cliente.query("SET LOCAL session_replication_role = 'replica'")
      await cliente.query(
        `INSERT INTO send_queue (tenant_id, phone, priority, message_type, template_sid, cycle_touch_id, status, expires_at)
         VALUES ($1, '3000000051', 2, 'reactivation', 'HX', $2, 'expired', now())`,
        [t.id, vencido.id]
      )
      await cliente.query('COMMIT')
    } finally {
      cliente.release()
    }

    const { rows } = await db().query<{ n: number }>('SELECT cycle_reconcile_touches($1) AS n', [t.id])
    expect(rows[0].n).toBeGreaterThanOrEqual(2)
    const estado = async (id: string) => (await db().query('SELECT status, attempts FROM customer_cycle_touches WHERE id = $1', [id])).rows[0]
    expect(await estado(vencido.id)).toEqual({ status: 'failed', attempts: 1 })
    expect(await estado(huerfano.id)).toEqual({ status: 'pending', attempts: 0 })
    await db().query('DELETE FROM send_queue WHERE cycle_touch_id = $1', [vencido.id])
  })

  it('RLS por marca sigue en pie con las columnas nuevas, y nada nuevo es ejecutable por la anon key', async () => {
    const { rows: politicas } = await db().query(
      `SELECT policyname FROM pg_policies WHERE tablename = 'customer_cycle_touches' ORDER BY 1`
    )
    expect(politicas.map((p) => p.policyname)).toEqual(['sede_visible_customer_cycle_touches', 'tenant_all_customer_cycle_touches'])
    const cli = await getPool().connect()
    try {
      await cli.query('BEGIN')
      await cli.query('SET LOCAL ROLE authenticated')
      await cli.query('SELECT set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', app_metadata: { tenant_id: '00000000-0000-4000-8000-000000000999' } }),
      ])
      const { rows } = await cli.query('SELECT count(*)::int AS n FROM customer_cycle_touches WHERE tenant_id = $1', [t.id])
      expect(rows[0].n).toBe(0)
    } finally {
      await cli.query('ROLLBACK').catch(() => {})
      cli.release()
    }
    for (const fn of ['cycle_reconcile_touches(uuid)', 'cycle_on_send_queue_change()', 'enqueue_send_queue(jsonb)']) {
      const { rows } = await db().query(
        `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon, has_function_privilege('authenticated', $1, 'EXECUTE') AS auth`,
        [fn]
      )
      expect(rows[0], fn).toEqual({ anon: false, auth: false })
    }
  })
})
