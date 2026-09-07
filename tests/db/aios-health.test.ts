/**
 * `aios_health()` — la superficie de lectura del tablero de salud del AIOS.
 *
 * Migración: supabase/migrations/00053_salud_por_cliente.sql
 * Pedido: §24-A de docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md
 *
 * Lo que estas pruebas fijan, en orden de importancia:
 *
 *   1. **Aislamiento.** Un semáforo que suma los domicilios de la marca A a la
 *      marca B es peor que no tener semáforo: miente con autoridad. Es el
 *      principio que no se negocia del proyecto, aplicado a un panel.
 *   2. **Cero es cero, no es NULL.** Una marca sin datos tiene que devolver
 *      contadores en 0. Si devolviera NULL, el AIOS no podría distinguir «no
 *      pasó nada» de «no se pudo leer», que son los dos colores que más
 *      importa no confundir (gris ≠ verde).
 *   3. Las ventanas (24 h / 7 d / 28 d) cuentan lo que dicen contar.
 *   4. `queue_due` no llama atasco a un mensaje programado para mañana.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'

interface TenantHealth {
  slug: string
  name: string
  is_active: boolean
  is_demo: boolean
  messaging_provider: string
  line_status: string
  quality_rating: string
  line_used_24h: number
  line_campaign_available: number | null
  deliveries_24h: number
  deliveries_7d: number
  deliveries_28d: number
  last_delivery_at: string | null
  active_days_28d: number
  failures_24h: number
  failures_7d: number
  last_failure_at: string | null
  last_failure_reason: string | null
  checkins_24h: number
  checkins_7d: number
  last_checkin_at: string | null
  messages_24h: number
  messages_failed_24h: number
  messages_7d: number
  messages_failed_7d: number
  last_message_at: string | null
  queue_due: number
  queue_oldest_due_at: string | null
  queue_failed_24h: number
}

interface Health {
  captured_at: string
  crons: {
    birthday_last_at: string | null
    reactivation_last_at: string | null
    reward_reminder_last_at: string | null
    calendar_event_last_at: string | null
    queue_drain_last_at: string | null
  }
  tenants: TenantHealth[]
}

async function health(slug?: string): Promise<Health> {
  const { rows } = await getPool().query<{ aios_health: Health }>('SELECT aios_health($1)', [
    slug ?? null,
  ])
  return rows[0].aios_health
}

/** La marca `slug` dentro de una lectura global. */
function only(h: Health, slug: string): TenantHealth {
  const row = h.tenants.find((t) => t.slug === slug)
  if (!row) throw new Error(`aios_health() no devolvió la marca ${slug}`)
  return row
}

/** Un comensal desechable: `visits` exige `customer_id`. */
async function crearCliente(tenantId: string, phone: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name) VALUES ($1, $2, 'Comensal de prueba') RETURNING id`,
    [tenantId, phone]
  )
  return rows[0].id
}

async function visita(
  tenantId: string,
  customerId: string,
  source: 'qr' | 'delivery' | 'staff_scan',
  haceHoras: number
): Promise<void> {
  await getPool().query(
    `INSERT INTO visits (tenant_id, customer_id, source, created_at)
     VALUES ($1, $2, $3, now() - ($4 || ' hours')::interval)`,
    [tenantId, customerId, source, String(haceHoras)]
  )
}

async function fallo(tenantId: string, reason: string, haceHoras: number): Promise<void> {
  await getPool().query(
    `INSERT INTO delivery_intake_failures (tenant_id, operator_phone, reason, detail, raw_message, created_at)
     VALUES ($1, '3001234567', $2, 'detalle de prueba', 'cuadro del pedido', now() - ($3 || ' hours')::interval)`,
    [tenantId, reason, String(haceHoras)]
  )
}

async function mensaje(
  tenantId: string,
  status: 'sent' | 'delivered' | 'failed' | 'undelivered',
  haceHoras: number,
  messageType = 'checkin'
): Promise<void> {
  // `twilio_sid` NULL a propósito: con SID no nulo salta el trigger de débito de
  // la billetera (00033) y esta prueba no mide eso.
  await getPool().query(
    `INSERT INTO message_logs (tenant_id, phone, message_type, status, created_at)
     VALUES ($1, '+573001234567', $2, $3, now() - ($4 || ' hours')::interval)`,
    [tenantId, messageType, status, String(haceHoras)]
  )
}

describe('aios_health()', () => {
  const creados: string[] = []

  async function tenant(...args: Parameters<typeof createTestTenant>) {
    const t = await createTestTenant(...args)
    creados.push(t.id)
    return t
  }

  afterEach(async () => {
    while (creados.length) await dropTestTenant(creados.pop()!)
  })
  afterAll(async () => {
    await closePool()
  })

  it('una marca sin nada devuelve CEROS, no NULLs', async () => {
    // El AIOS pinta gris cuando no puede leer y verde cuando leyó y no hay
    // problema. Si esta función devolviera NULL por «no hubo filas», las dos
    // situaciones llegarían idénticas y el panel mentiría en el caso que más
    // importa: el de la marca recién dada de alta.
    const t = await tenant()
    const h = only(await health(t.slug), t.slug)

    expect(h.deliveries_24h).toBe(0)
    expect(h.deliveries_7d).toBe(0)
    expect(h.deliveries_28d).toBe(0)
    expect(h.active_days_28d).toBe(0)
    expect(h.failures_24h).toBe(0)
    expect(h.failures_7d).toBe(0)
    expect(h.checkins_24h).toBe(0)
    expect(h.messages_24h).toBe(0)
    expect(h.messages_failed_24h).toBe(0)
    expect(h.queue_due).toBe(0)
    expect(h.queue_failed_24h).toBe(0)

    // Y las marcas de tiempo sí son NULL: «nunca pasó» no es una fecha.
    expect(h.last_delivery_at).toBeNull()
    expect(h.last_failure_at).toBeNull()
    expect(h.last_checkin_at).toBeNull()
  })

  it('los domicilios de OTRA marca no se cuentan acá', async () => {
    // El principio que no se negocia del proyecto, aplicado al panel.
    const mia = await tenant()
    const ajena = await tenant()

    const cliente = await crearCliente(ajena.id, '+573009999001')
    await visita(ajena.id, cliente, 'delivery', 1)
    await visita(ajena.id, cliente, 'delivery', 2)
    await fallo(ajena.id, 'ia_error', 1)
    await mensaje(ajena.id, 'failed', 1)

    const h = only(await health(mia.slug), mia.slug)
    expect(h.deliveries_24h).toBe(0)
    expect(h.deliveries_28d).toBe(0)
    expect(h.failures_24h).toBe(0)
    expect(h.messages_24h).toBe(0)

    // Y la marca ajena sí los ve, para que la prueba no pase por estar vacía.
    const ajenaH = only(await health(ajena.slug), ajena.slug)
    expect(ajenaH.deliveries_24h).toBe(2)
    expect(ajenaH.failures_24h).toBe(1)
    expect(ajenaH.messages_failed_24h).toBe(1)
  })

  it('cada ventana cuenta lo suyo y active_days_28d cuenta DÍAS, no pedidos', async () => {
    const t = await tenant()
    const cliente = await crearCliente(t.id, '+573009999002')

    // Dos pedidos hoy (mismo día), uno hace 3 días, uno hace 10 días, uno hace 40.
    await visita(t.id, cliente, 'delivery', 1)
    await visita(t.id, cliente, 'delivery', 2)
    await visita(t.id, cliente, 'delivery', 24 * 3)
    await visita(t.id, cliente, 'delivery', 24 * 10)
    await visita(t.id, cliente, 'delivery', 24 * 40)

    const h = only(await health(t.slug), t.slug)
    expect(h.deliveries_24h).toBe(2)
    expect(h.deliveries_7d).toBe(3)
    expect(h.deliveries_28d).toBe(4) // el de hace 40 días queda fuera
    // 3 días distintos con pedido: hoy, hace 3 y hace 10. Es la línea base
    // contra la que el AIOS mide el silencio de ESTA marca y no de otra.
    expect(h.active_days_28d).toBe(3)
    expect(h.last_delivery_at).not.toBeNull()
  })

  it('el check-in por QR y el escáner del mesero cuentan como vida del local; el domicilio no', async () => {
    const t = await tenant()
    const cliente = await crearCliente(t.id, '+573009999003')

    await visita(t.id, cliente, 'qr', 1)
    await visita(t.id, cliente, 'staff_scan', 2)
    await visita(t.id, cliente, 'delivery', 3)

    const h = only(await health(t.slug), t.slug)
    expect(h.checkins_24h).toBe(2)
    expect(h.deliveries_24h).toBe(1)
  })

  it('`undelivered` cuenta como fallo igual que `failed`', async () => {
    // Twilio manda `undelivered` cuando el destinatario no tiene WhatsApp. Para
    // el dueño es exactamente lo mismo que `failed`: el mensaje no llegó.
    const t = await tenant()
    await mensaje(t.id, 'sent', 1)
    await mensaje(t.id, 'delivered', 2)
    await mensaje(t.id, 'failed', 3)
    await mensaje(t.id, 'undelivered', 4)

    const h = only(await health(t.slug), t.slug)
    expect(h.messages_24h).toBe(4)
    expect(h.messages_failed_24h).toBe(2)
  })

  it('el último motivo de fallo es el MÁS RECIENTE', async () => {
    const t = await tenant()
    await fallo(t.id, 'ia_error', 20)
    await fallo(t.id, 'remitente_no_verificable', 1)

    const h = only(await health(t.slug), t.slug)
    expect(h.failures_24h).toBe(2)
    expect(h.last_failure_reason).toBe('remitente_no_verificable')
  })

  it('queue_due ignora lo programado para el futuro: eso no es un atasco', async () => {
    const t = await tenant()
    const db = getPool()

    // Uno vencido (debió salir hace 2 h), uno programado para dentro de 5 h.
    await db.query(
      `INSERT INTO send_queue (tenant_id, phone, priority, message_type, template_sid, status, not_before)
       VALUES ($1, '+573001110001', 2, 'reactivation', 'HX_test', 'queued', now() - interval '2 hours'),
              ($1, '+573001110002', 2, 'reactivation', 'HX_test', 'queued', now() + interval '5 hours')`,
      [t.id]
    )

    const h = only(await health(t.slug), t.slug)
    expect(h.queue_due).toBe(1)
    expect(h.queue_oldest_due_at).not.toBeNull()
  })

  it('con p_slug devuelve UNA marca; sin él, todas', async () => {
    const a = await tenant()
    const b = await tenant()

    const sola = await health(a.slug)
    expect(sola.tenants).toHaveLength(1)
    expect(sola.tenants[0].slug).toBe(a.slug)

    const todas = await health()
    const slugs = todas.tenants.map((t) => t.slug)
    expect(slugs).toContain(a.slug)
    expect(slugs).toContain(b.slug)
  })

  it('trae la salud de la línea sin que el AIOS tenga que llamar a aios_line_health()', async () => {
    const t = await tenant({
      messagingDailyLimit: 250,
      lineStatus: 'throttled',
      qualityRating: 'yellow',
      messagingProvider: 'zernio',
    })

    const h = only(await health(t.slug), t.slug)
    expect(h.line_status).toBe('throttled')
    expect(h.quality_rating).toBe('yellow')
    expect(h.messaging_provider).toBe('zernio')
    // 250 - 70 de reserva = 180, y `throttled` lo parte por la mitad
    // (00037:292, freno del §3.5) → 90. Que el freno llegue hasta acá es el
    // punto: el AIOS ve el cupo REAL, no el teórico.
    expect(h.line_campaign_available).toBe(90)
  })

  it('las señales de los crons son GLOBALES, no por marca', async () => {
    // Un cron de Vercel corre una vez para TODAS las marcas. Preguntarle a un
    // tenant «¿corrió el de cumpleaños?» daría falsos rojos cada día en que esa
    // marca no tuviera cumpleañeros.
    const t = await tenant()
    await mensaje(t.id, 'sent', 3, 'birthday')

    const h = await health()
    expect(h.crons.birthday_last_at).not.toBeNull()
    expect(h.captured_at).toBeTruthy()

    // Y el objeto existe aunque no haya corrido nada de un tipo: la clave está,
    // con NULL dentro. El AIOS pinta gris con eso, no se rompe.
    expect(h.crons).toHaveProperty('reward_reminder_last_at')
    expect(h.crons).toHaveProperty('queue_drain_last_at')
  })
})
