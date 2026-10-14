/**
 * Arreglos chicos del 15-10, grupo 3 · Mensajes (`docs/prompts/2026-10-15-arreglos-chicos.md`).
 *
 * El código REAL sobre la base embebida con todas las migraciones
 * (`tests/setup/supabase-sobre-pg.ts`), `sendTemplateMessage()` incluido: las marcas de prueba no
 * tienen credenciales de Twilio ni cuenta de Zernio, así que cada intento deja su fila `failed` en
 * `message_logs` con el `logContext` que recibió (tipo, plantilla, cliente, sede). Es lo que se
 * mira. Falso solo: la sesión del panel y la pregunta a Twilio «¿esta plantilla está aprobada?».
 *
 *   · PL-2: el check-in manual del panel (`check-in-override`) y el registro de un domicilio
 *     (`registerDeliveryOrder()`) mandaban «Nivel desbloqueado» sin preguntar si Meta ya la
 *     aprobó. Ahora preguntan, y sin aprobar cae al mensaje de puntos (como el check-in, PL-2-a).
 *   · N-OVERRIDE-LOG: `check-in-override` mandaba sin `logContext`: ni fila en `message_logs` ni
 *     clase transaccional (gastaba cupo de campañas como `manual`).
 *   · N-SEDE-ENVIO: el envío inmediato del calendario (`executeAutoEvent()`) conocía la sede del
 *     evento y no la pasaba. (El drenador y la caja misteriosa: `cycle-envios.test.ts` y
 *     `mystery-box-carrera.test.ts`.)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'

const h = vi.hoisted(() => ({
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
  /** Los SID que Twilio da por aprobados. */
  aprobadas: new Set<string>(),
  preguntasATwilio: [] as string[],
}))

vi.mock('@supabase/supabase-js', async () => {
  const m = await import('../setup/supabase-sobre-pg')
  return { createClient: () => m.clienteDePrueba() }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.usuario }, error: null }) } }),
}))
vi.mock('@/services/twilio-catalog.service', () => ({
  isTwilioTemplateApproved: async (_tenant: unknown, sid: string) => {
    h.preguntasATwilio.push(sid)
    return h.aprobadas.has(sid)
  },
}))

const db = () => getPool()
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const creadas: TestTenant[] = []
let tel = 0
const nuevoTelefono = () => `30${String(process.pid % 1000).padStart(3, '0')}${String(++tel).padStart(5, '0')}`

const NIVEL = 'HX_NIVEL'
const LEJOS = 'HX_PUNTOS_LEJOS'
const CERCA = 'HX_PUNTOS_CERCA'

async function ajuste(t: TestTenant, key: string, value: string): Promise<void> {
  await db().query(
    `INSERT INTO admin_settings (key, value, tenant_id) VALUES ($1, $2, $3)
     ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value`,
    [key, value, t.id]
  )
}

/** Una marca Twilio (sin credenciales) con un nivel a 1 punto y las tres plantillas de puntos. */
async function marcaConNivel(proveedor: 'twilio' | 'zernio' = 'twilio'): Promise<TestTenant> {
  const t = await createTestTenant({ messagingProvider: proveedor })
  creadas.push(t)
  await db().query(
    `INSERT INTO reward_tiers (tenant_id, location_id, tier_name, point_threshold, safe_reward_title, sort_order, is_active, tier_key)
     VALUES ($1, NULL, 'Bronce', 1, 'Postre de la casa', 1, true, gen_random_uuid())`,
    [t.id]
  )
  await ajuste(t, 'points_per_visit_min', '20')
  await ajuste(t, 'points_per_visit_max', '20')
  await ajuste(t, 'tier_unlocked_template_sid', NIVEL)
  await ajuste(t, 'points_earned_far_template_sid', LEJOS)
  await ajuste(t, 'points_earned_near_template_sid', CERCA)
  return t
}

async function cliente(t: TestTenant, puntos: number): Promise<{ id: string; phone: string }> {
  const phone = nuevoTelefono()
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_points, total_visits)
     VALUES ($1, $2, 'Ana', $3, 1) RETURNING id`,
    [t.id, phone, puntos]
  )
  return { id: rows[0].id, phone }
}

interface FilaDeLog {
  message_type: string
  template_sid: string | null
  customer_id: string | null
  location_id: string | null
  status: string
}
async function logs(t: TestTenant): Promise<FilaDeLog[]> {
  const { rows } = await db().query<FilaDeLog>(
    `SELECT message_type, template_sid, customer_id, location_id, status FROM message_logs
      WHERE tenant_id = $1 ORDER BY created_at`,
    [t.id]
  )
  return rows
}

async function override(t: TestTenant, phone: string): Promise<number> {
  h.usuario = { id: '00000000-0000-4000-8000-0000000000cc', app_metadata: { tenant_id: t.id } }
  const { POST } = await import('@/app/api/dashboard/check-in-override/route')
  const res = await POST(
    new Request('https://panel.constelarys.com/api/dashboard/check-in-override', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, reason: 'prueba' }),
    }) as never
  )
  return res.status
}

async function limpiar(t: TestTenant): Promise<void> {
  for (const tabla of [
    'send_queue',
    'campaign_messages',
    'restaurant_events',
    'customer_cycle_touches',
    'point_transactions',
    'visits',
  ]) {
    await db().query(`DELETE FROM ${tabla} WHERE tenant_id = $1`, [t.id])
  }
  await db().query('DELETE FROM message_logs WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM campaigns WHERE tenant_id = $1', [t.id])
  await db().query('UPDATE customers SET origin_location_id = NULL, last_visit_location_id = NULL WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM customers WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM reward_tiers WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
})

beforeEach(() => {
  h.usuario = null
  h.aprobadas.clear()
  h.preguntasATwilio.length = 0
})

afterAll(async () => {
  for (const t of creadas) await limpiar(t)
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// PL-2 + N-OVERRIDE-LOG — el check-in manual del panel
// ═══════════════════════════════════════════════════════════════

describe('check-in manual del panel: pregunta si «Nivel desbloqueado» está aprobada y deja rastro', () => {
  it('cruza de nivel con la plantilla en revisión: sale el mensaje de PUNTOS, registrado como transaccional', async () => {
    const t = await marcaConNivel()
    const c = await cliente(t, 0)
    expect(await override(t, c.phone)).toBe(200)
    expect(h.preguntasATwilio).toEqual([NIVEL])
    const filas = await logs(t)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ customer_id: c.id, location_id: null })
    expect(filas[0].template_sid).not.toBe(NIVEL)
    expect([LEJOS, CERCA]).toContain(filas[0].template_sid)
    expect(['points_earned_far', 'points_earned_near']).toContain(filas[0].message_type)
  })

  it('aprobada: sale «Nivel desbloqueado», con su fila `tier_unlocked`', async () => {
    const t = await marcaConNivel()
    const c = await cliente(t, 0)
    h.aprobadas.add(NIVEL)
    expect(await override(t, c.phone)).toBe(200)
    expect(await logs(t)).toEqual([
      expect.objectContaining({ message_type: 'tier_unlocked', template_sid: NIVEL, customer_id: c.id, location_id: null }),
    ])
  })

  it('sin cruzar de nivel no le pregunta nada a Twilio, y el mensaje de puntos también deja su fila', async () => {
    const t = await marcaConNivel()
    const c = await cliente(t, 500)
    expect(await override(t, c.phone)).toBe(200)
    expect(h.preguntasATwilio).toEqual([])
    const filas = await logs(t)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ message_type: 'points_earned_far', template_sid: LEJOS, customer_id: c.id })
  })

  it('una marca Zernio no le pregunta a Twilio (su puntero solo existe aprobado)', async () => {
    const t = await marcaConNivel('zernio')
    const c = await cliente(t, 0)
    expect(await override(t, c.phone)).toBe(200)
    expect(h.preguntasATwilio).toEqual([])
    expect((await logs(t))[0]).toMatchObject({ message_type: 'tier_unlocked', template_sid: NIVEL })
  })
})

// ═══════════════════════════════════════════════════════════════
// PL-2 — el registro de un domicilio
// ═══════════════════════════════════════════════════════════════

describe('un domicilio que cruza de nivel: «Nivel desbloqueado» solo si está aprobada', () => {
  async function domicilio(t: TestTenant, phone: string) {
    const { registerDeliveryOrder } = await import('@/services/delivery.service')
    const { data: tenant } = await (await import('../setup/supabase-sobre-pg'))
      .clienteDePrueba()
      .from('tenants')
      .select('*')
      .eq('id', t.id)
      .single()
    return registerDeliveryOrder({
      tenant: tenant as never,
      order: { celular: phone, nombre_cliente: 'Ana', direccion: 'Calle 1', metodo_pago: 'efectivo', monto_total: 30 },
      location: { locationId: null, source: null, conflict: null } as never,
    })
  }

  it('en revisión: el cliente recibe el de PUNTOS, no un «Nivel desbloqueado» que Meta rechazaría', async () => {
    const t = await marcaConNivel()
    const c = await cliente(t, 0)
    const r = await domicilio(t, c.phone)
    expect(r.tierUnlocked).not.toBeNull()
    expect(h.preguntasATwilio).toEqual([NIVEL])
    const filas = await logs(t)
    expect(filas).toHaveLength(1)
    expect([LEJOS, CERCA]).toContain(filas[0].template_sid)
  })

  it('aprobada: «Nivel desbloqueado», como siempre', async () => {
    const t = await marcaConNivel()
    const c = await cliente(t, 0)
    h.aprobadas.add(NIVEL)
    await domicilio(t, c.phone)
    expect(await logs(t)).toEqual([expect.objectContaining({ message_type: 'tier_unlocked', template_sid: NIVEL })])
  })
})

// ═══════════════════════════════════════════════════════════════
// N-SEDE-ENVIO — el envío inmediato del calendario
// ═══════════════════════════════════════════════════════════════

describe('el calendario deja la sede del evento en `message_logs` (y NULL para un evento de marca)', () => {
  async function eventoListo(t: TestTenant, sedeId: string | null): Promise<string> {
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO restaurant_events
         (tenant_id, title, event_date, event_type, send_mode, status, media_url, media_type, audience_scope, location_id)
       VALUES ($1, 'Noche de sushi', (now() AT TIME ZONE 'America/Bogota')::date + 3, 'promo', 'auto', 'scheduled',
               'http://localhost:54321/storage/v1/object/public/event-media/flyer.jpg', 'image', $2, $3)
       RETURNING id`,
      [t.id, sedeId ? 'location' : 'brand', sedeId]
    )
    return rows[0].id
  }

  it('evento de Laureles → la fila lleva Laureles; evento de la marca → NULL', async () => {
    // Zernio sin cuenta: `assertEventTemplateUsable()` no tiene a quién preguntar y el envío
    // falla en `sendViaZernio()` dejando su fila con el `logContext` que recibió.
    const t = await marcaConNivel('zernio')
    await ajuste(t, 'event_template_image_sid', 'evento_con_imagen')
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO restaurant_locations (tenant_id, name, slug, domain, is_primary, sort_order, is_active)
       VALUES ($1, 'Laureles', $2, $3, true, 0, true) RETURNING id`,
      [t.id, `lau-${SUFIJO}`, `lau-${SUFIJO}.test`]
    )
    const LAU = rows[0].id
    const c = await cliente(t, 10)

    const { executeAutoEvent } = await import('@/services/calendar.service')
    await executeAutoEvent(await eventoListo(t, LAU))
    let filas = (await logs(t)).filter((f) => f.message_type === 'calendar_event')
    expect(filas).toEqual([expect.objectContaining({ customer_id: c.id, location_id: LAU })])

    await db().query('DELETE FROM message_logs WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM send_queue WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM campaign_messages WHERE tenant_id = $1', [t.id])
    await db().query('UPDATE customers SET last_campaign_at = NULL WHERE tenant_id = $1', [t.id])
    await executeAutoEvent(await eventoListo(t, null))
    filas = (await logs(t)).filter((f) => f.message_type === 'calendar_event')
    expect(filas).toEqual([expect.objectContaining({ customer_id: c.id, location_id: null })])
  })
})
