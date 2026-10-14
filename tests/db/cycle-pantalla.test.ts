/**
 * La pantalla del ciclo, los datos (fase 2 parte A, 2026-10-14) — contra Postgres de verdad.
 *
 * Las rutas REALES (`/api/dashboard/cycle/overview`, `/projection`, `/customers`, `/hoy-no`) y el
 * cron real de reactivación, sobre la base embebida con todas las migraciones, a través de
 * `tests/setup/supabase-sobre-pg.ts`. Falsos solo: la sesión del panel (quién mira), la
 * pregunta a Twilio de si «Regalo que vence» está aprobada y el envío por WhatsApp (el cron no
 * envía). La sesión es el JWT: `app_metadata.tenant_id` y, para el operador, `role`.
 *
 * Qué se fija (el prompt §6, parte A): los conteos por caja con un ciclo armado a mano, nuevos
 * contra ya volvieron, «hoy entran», el retorno con y sin mensaje, la segunda visita con días
 * distintos, el aislamiento entre marcas y por sede, que un fallo de base da 500 (nunca «0»),
 * las tarjetas «Para hoy», la proyección, la lista paginada y «Hoy no» de punta a punta (la
 * ruta lo escribe y el cron lo respeta).
 *
 * LA BASE ES COMPARTIDA con los demás archivos de `tests/db/`: cada prueba crea sus marcas y el
 * cron se llama con `?tenant=`. Las que dependen de la fecha (las tarjetas) llaman al servicio
 * con un `ahora` fijo y arman los datos alrededor de ese día.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'
import { bogotaDay } from '@/lib/cycle-engine'
import { diaQuePospone, instanteEnBogota, isoDeDia, HOY_NO_CLAVES } from '@/lib/cycle-touch'
import { fechasEspecialesEntre } from '@/constants/fechas-especiales'
import type { CycleOverview, CycleProjection, ListaDelCiclo } from '@/services/cycle-overview.service'

const h = vi.hoisted(() => ({
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
  /** La tabla cuya lectura falla (un timeout del pooler), o `null`. */
  falla: null as null | string,
  aprobadaEnTwilio: false,
  preguntasATwilio: [] as string[],
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
vi.mock('@/services/twilio-catalog.service', () => ({
  isTwilioTemplateApproved: async (_tenant: unknown, sid: string) => {
    h.preguntasATwilio.push(sid)
    return h.aprobadaEnTwilio
  },
}))
vi.mock('@/services/whatsapp.service', () => ({ sendTemplateMessage: vi.fn(async () => ({ sid: 'SM1', status: 'sent' })) }))
vi.mock('@/lib/validators/cron', () => ({ validateCronSecret: () => true }))

// ═══════════════════════════════════════════════════════════════
// Las marcas, los clientes, quién mira
// ═══════════════════════════════════════════════════════════════

const db = () => getPool()
const hoyReal = () => bogotaDay(new Date())

interface Marca extends TestTenant {
  pequeno: string
  fuerte: string
}
const creadas: Marca[] = []
const usuarios: string[] = []

let telefono = 0
const nuevoTelefono = () => `32${String(process.pid % 1000).padStart(3, '0')}${String(++telefono).padStart(5, '0')}`

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
    domicilio?: boolean
    pequeno?: boolean
    fuerte?: boolean
    /** Desde cuándo vio el cron la marca encendida (por defecto, hace 120 días). */
    encendidoDesde?: Date
    nombre?: string
  } = {}
): Promise<Marca> {
  const t = await createTestTenant()
  await db().query(`UPDATE tenants SET name = $2, config = $3::jsonb WHERE id = $1`, [
    t.id,
    opts.nombre ?? `Marca de prueba ${t.slug}`,
    JSON.stringify({ has_delivery_webhook: opts.domicilio ?? false }),
  ])
  const premio = async (titulo: string) =>
    (await db().query<{ id: string }>(`INSERT INTO campaign_rewards (tenant_id, title) VALUES ($1, $2) RETURNING id`, [t.id, titulo]))
      .rows[0].id
  const marca: Marca = { ...t, pequeno: await premio('Postre del chef'), fuerte: await premio('Rollo gratis') }
  creadas.push(marca)

  const base: Record<string, string> = {
    cycle_enabled: opts.encendido ? 'true' : 'false',
    cycle_rhythm: 'restaurant', // 14 · 28 · 42 · 60 · 80
    cycle_holdout_pct: '0',
    cycle_send_slot: 'dinner',
    reactivation_no_reward_template_sid: 'HX_SUAVE',
    reactivation_aggressive_template_sid: 'HX_INSISTENTE',
    gift_expiring_template_sid: 'HX_REGALO',
    campaign_presencial_to_domicilio_template_sid: 'HX_A_CASA',
    campaign_domicilio_to_presencial_template_sid: 'HX_AL_LOCAL',
  }
  if (opts.pequeno !== false) base.cycle_small_reward_ids = marca.pequeno
  if (opts.fuerte !== false) base.cycle_strong_reward_id = marca.fuerte
  if (opts.encendido) base.cycle_enabled_at = (opts.encendidoDesde ?? new Date(Date.now() - 120 * 86_400_000)).toISOString()
  for (const [k, v] of Object.entries(base)) await ajuste(marca, k, v)
  return marca
}

/** Un cliente cuyo ciclo empezó hace `dias` días de Bogotá contados desde `hoy`. */
async function nuevoCliente(
  t: TestTenant,
  opts: {
    hoy?: number
    dias?: number
    estado?: 'activo' | 'dormido' | 'archivado'
    dormidoHace?: number
    visitas?: number
    ritmo?: string
    acepta?: boolean
    salir?: boolean
    nombre?: string
  } = {}
): Promise<string> {
  const hoy = opts.hoy ?? hoyReal()
  const inicio = instanteEnBogota(hoy - (opts.dias ?? 0), 12)
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers
       (tenant_id, phone, name, total_visits, total_points, last_visit_at, cycle_started_at, cycle_state,
        dormant_since, cycle_rhythm, accepts_marketing, whatsapp_opt_out_at)
     VALUES ($1, $2, $3, $4, 90, $5, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      t.id,
      nuevoTelefono(),
      opts.nombre ?? 'Juanita',
      opts.visitas ?? 1,
      inicio,
      opts.estado ?? 'activo',
      opts.dormidoHace !== undefined ? instanteEnBogota(hoy - opts.dormidoHace, 12) : null,
      opts.ritmo ?? null,
      opts.acepta ?? true,
      opts.salir ? new Date() : null,
    ]
  )
  return rows[0].id
}

async function visita(t: TestTenant, customerId: string, dia: number, minuto = 0): Promise<void> {
  await db().query(`INSERT INTO visits (tenant_id, customer_id, source, created_at) VALUES ($1, $2, 'qr', $3)`, [
    t.id,
    customerId,
    instanteEnBogota(dia, 12, minuto),
  ])
}

async function toque(
  t: TestTenant,
  customerId: string,
  opts: { cycleNo: number; stage: string; status: 'sent' | 'holdout'; due: Date; volvio?: Date | null; sent?: Date | null }
): Promise<void> {
  await db().query(
    `INSERT INTO customer_cycle_touches (tenant_id, customer_id, cycle_no, stage, seq, status, holdout, due_at, sent_at, returned_at)
     VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9)`,
    [t.id, customerId, opts.cycleNo, opts.stage, opts.status, opts.status === 'holdout', opts.due, opts.sent ?? null, opts.volvio ?? null]
  )
}

async function evento(
  t: TestTenant,
  opts: { fecha: string; envio?: Date | null; modo?: 'auto' | 'remind'; foto?: string | null; estado?: string; blackout?: number; titulo?: string }
): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO restaurant_events (tenant_id, title, event_date, event_type, send_mode, scheduled_send_at, media_url, status, blackout_days)
     VALUES ($1, $2, $3, 'promo', $4, $5, $6, $7, $8) RETURNING id`,
    [
      t.id,
      opts.titulo ?? 'Noche de sushi',
      opts.fecha,
      opts.modo ?? 'auto',
      opts.envio ?? null,
      opts.foto ?? null,
      opts.estado ?? 'scheduled',
      opts.blackout ?? 5,
    ]
  )
  return rows[0].id
}

/** Quién mira: el dueño de la marca (una sede o ninguna: alcance de marca). */
function comoDueno(t: TestTenant): void {
  h.usuario = { id: '00000000-0000-4000-8000-0000000000aa', app_metadata: { tenant_id: t.id } }
}

async function usuarioDelPanel(t: TestTenant, rol?: 'brand' | 'location', sede?: string | null, operador = false): Promise<void> {
  const meta: Record<string, unknown> = { tenant_id: t.id, ...(operador ? { role: 'super_admin' } : {}) }
  const { rows } = await db().query<{ id: string }>(`INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`, [JSON.stringify(meta)])
  const id = rows[0].id
  usuarios.push(id)
  if (rol) {
    await db().query(`INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role) VALUES ($1, $2, $3, $4)`, [
      id,
      t.id,
      sede ?? null,
      rol,
    ])
  }
  h.usuario = { id, app_metadata: meta }
}

async function sede(t: TestTenant, nombre: string, principal = false): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [t.id, nombre, `sede-${Math.random().toString(36).slice(2, 10)}`, principal]
  )
  return rows[0].id
}

const URL_BASE = 'https://marca.constelarys.com/api/dashboard/cycle'

/** El cuerpo con la forma del éxito; en un 500 solo trae `error` (y las pruebas lo miran así). */
type ConError<T> = T & { error?: string }
type Portada = ConError<CycleOverview & { permisos: { aprobar: boolean; interruptor: boolean } | null }>
type RespuestaDeHoyNo = { ok?: boolean; tarjeta?: string; pospuesto?: string; mensaje?: string; error?: string }

async function pedir<T>(req: Promise<Response>): Promise<{ status: number; body: T }> {
  const res = await req
  return { status: res.status, body: (await res.json()) as T }
}

async function overview(query = '') {
  const { GET } = await import('@/app/api/dashboard/cycle/overview/route')
  return pedir<Portada>(GET(new Request(`${URL_BASE}/overview${query}`)))
}

async function proyeccion(query = '') {
  const { GET } = await import('@/app/api/dashboard/cycle/projection/route')
  return pedir<ConError<CycleProjection>>(GET(new Request(`${URL_BASE}/projection${query}`)))
}

async function lista(query: string) {
  const { GET } = await import('@/app/api/dashboard/cycle/customers/route')
  return pedir<ConError<ListaDelCiclo>>(GET(new Request(`${URL_BASE}/customers${query}`)))
}

async function hoyNo(cuerpo: unknown) {
  const { POST } = await import('@/app/api/dashboard/cycle/hoy-no/route')
  return pedir<RespuestaDeHoyNo>(
    POST(new Request(`${URL_BASE}/hoy-no`, { method: 'POST', body: JSON.stringify(cuerpo), headers: { 'content-type': 'application/json' } }))
  )
}

async function correrCron(t: TestTenant): Promise<Record<string, unknown>> {
  const { GET } = await import('@/app/api/cron/reactivation/route')
  const res = await GET(new Request(`https://x/api/cron/reactivation?tenant=${t.slug}`) as never)
  return (await res.json()) as Record<string, unknown>
}

const caja = (body: Portada, key: string) => body.cajas.find((c) => c.key === key)!

async function limpiar(t: TestTenant): Promise<void> {
  await db().query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_events WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM send_queue WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM customer_cycle_touches WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM reward_grants WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM visits WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
  await db().query('DELETE FROM campaign_rewards WHERE tenant_id = $1', [t.id]).catch(() => undefined)
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
})

beforeEach(() => {
  h.usuario = null
  h.falla = null
  h.aprobadaEnTwilio = false
  h.preguntasATwilio.length = 0
})

afterAll(async () => {
  for (const m of creadas) await limpiar(m)
  for (const u of usuarios) await db().query('DELETE FROM auth.users WHERE id = $1', [u])
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// 1. Las cajas, con un ciclo armado a mano
// ═══════════════════════════════════════════════════════════════

describe('las cajas: un ciclo armado a mano, contado con el motor', () => {
  it('cada cliente en su caja, nuevos contra ya volvieron, «hoy entran», dormidos y los que no reciben', async () => {
    const t = await nuevaMarca() // restaurante, SIN domicilio: no hay «Le mostramos lo otro»
    await nuevoCliente(t, { dias: 0, visitas: 1 }) // Recién vino, nuevo, entra hoy
    await nuevoCliente(t, { dias: 5, visitas: 3 }) // Recién vino, ya volvió
    await nuevoCliente(t, { dias: 14, visitas: 1 }) // Le recordamos, entra hoy
    await nuevoCliente(t, { dias: 20, visitas: 2 }) // Le recordamos, ya volvió
    await nuevoCliente(t, { dias: 7, visitas: 3, ritmo: 'cafe' }) // ritmo PROPIO cafetería: día 7 = Le recordamos, entra hoy
    await nuevoCliente(t, { dias: 28, visitas: 1 }) // Le regalamos algo, entra hoy
    await nuevoCliente(t, { dias: 42, visitas: 1 }) // sin domicilio: sigue en Le regalamos algo
    await nuevoCliente(t, { dias: 61, visitas: 4 }) // Rescate (entró ayer)
    await nuevoCliente(t, { dias: 100, visitas: 1 }) // Despedida, sin tope
    await nuevoCliente(t, { estado: 'dormido', dormidoHace: 10, visitas: 1 })
    await nuevoCliente(t, { estado: 'dormido', dormidoHace: 0, visitas: 1 }) // se durmió hoy
    await nuevoCliente(t, { estado: 'archivado', dormidoHace: 200, visitas: 5 })
    await nuevoCliente(t, { dias: 30, acepta: false }) // fuera del ciclo
    await nuevoCliente(t, { dias: 30, salir: true }) // pidió SALIR
    comoDueno(t)

    const { status, body } = await overview()
    expect(status).toBe(200)
    expect(body.cajas.map((c: { key: string }) => c.key)).toEqual(['reciente', 't1', 't2', 't4', 't5'])
    expect(caja(body, 'reciente')).toMatchObject({ desde: 0, hasta: 13, total: 2, nuevos: 1, ya_volvieron: 1, hoy_entran: 1, retorno: null })
    expect(caja(body, 't1')).toMatchObject({ etiqueta: 'Le recordamos', desde: 14, hasta: 27, total: 3, nuevos: 1, ya_volvieron: 2, hoy_entran: 2 })
    expect(caja(body, 't2')).toMatchObject({ desde: 28, hasta: 59, total: 2, nuevos: 2, hoy_entran: 1, regalo: 'Postre del chef' })
    expect(caja(body, 't4')).toMatchObject({ etiqueta: 'Rescate', total: 1, nuevos: 0, ya_volvieron: 1, hoy_entran: 0, regalo: 'Rollo gratis' })
    expect(caja(body, 't5')).toMatchObject({ desde: 80, hasta: null, total: 1, nuevos: 1 })
    expect(body.dormidos).toMatchObject({ total: 3, nuevos: 2, ya_volvieron: 1, sin_toques_hace_6_meses: 1, hoy_entran: 1 })
    expect(body.no_reciben_mensajes).toBe(2)
    expect(body.numeros).toMatchObject({ en_el_ciclo: 9, dormidos: 3 })
    expect(body.ritmo).toMatchObject({ marca: 'restaurant', etiqueta: 'Cada mes', origen: 'dueno', dias: [14, 28, 42, 60, 80], con_ritmo_propio: 1 })
    expect(body.ciclo).toMatchObject({ encendido: false, encendido_desde: null, hora: '16:30', grupo_de_control_pct: 0 })
    // Sin toques todavía: el retorno dice «sin datos», no «0 %».
    expect(caja(body, 't2').retorno).toEqual({
      con_mensaje: { toques: 0, volvieron: 0, pct: null },
      sin_mensaje: { toques: 0, volvieron: 0, pct: null },
    })
    // Ciclo apagado: ninguna tarjeta de lo automático.
    expect(body.para_hoy!.map((x) => x.tipo)).not.toContain('trimestral')
  })

  it('con domicilio existe «Le mostramos lo otro» y el día 42 cae ahí', async () => {
    const t = await nuevaMarca({ domicilio: true })
    await nuevoCliente(t, { dias: 42 })
    comoDueno(t)
    const { body } = await overview()
    expect(body.cajas.map((c: { key: string }) => c.key)).toEqual(['reciente', 't1', 't2', 't3', 't4', 't5'])
    expect(caja(body, 't3')).toMatchObject({ etiqueta: 'Le mostramos lo otro', total: 1, hoy_entran: 1 })
  })

  it('?mini=1 (el panel principal): las mismas cajas, sin tarjetas, sin primer uso y sin preguntarle a Twilio', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 14 })
    await nuevoCliente(t, { estado: 'dormido', dormidoHace: 3 })
    comoDueno(t)
    const { status, body } = await overview('?mini=1')
    expect(status).toBe(200)
    expect(body.mini).toBe(true)
    expect(caja(body, 't1')).toMatchObject({ total: 1, retorno: null, regalo: null })
    expect(body.dormidos.total).toBe(1)
    expect(body).toMatchObject({ para_hoy: null, primer_uso: null, segunda_visita: null, permisos: null })
    expect(h.preguntasATwilio).toEqual([])
  })

  it('el primer uso: los dos regalos y «Regalo que vence» con la MISMA pregunta que el cron', async () => {
    const t = await nuevaMarca({ fuerte: false })
    comoDueno(t)
    h.aprobadaEnTwilio = false
    let { body } = await overview()
    expect(body.primer_uso).toEqual({
      regalo_pequeno: { listo: true, titulo: 'Postre del chef', elegido_inactivo: false },
      regalo_fuerte: { listo: false, titulo: null, elegido_inactivo: false },
      plantilla_regalo: { estado: 'pendiente' },
      listos: 1,
      total: 3,
    })
    expect(h.preguntasATwilio).toEqual(['HX_REGALO'])

    h.aprobadaEnTwilio = true
    await db().query('UPDATE campaign_rewards SET is_active = false WHERE id = $1', [t.pequeno])
    ;({ body } = await overview())
    expect(body.primer_uso).toMatchObject({
      regalo_pequeno: { listo: false, elegido_inactivo: true },
      plantilla_regalo: { estado: 'aprobada' },
      listos: 1,
    })

    await db().query(`DELETE FROM admin_settings WHERE tenant_id = $1 AND key = 'gift_expiring_template_sid'`, [t.id])
    ;({ body } = await overview())
    expect(body.primer_uso!.plantilla_regalo.estado).toBe('sin_plantilla')
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. El retorno con mensaje y sin mensaje, y la segunda visita
// ═══════════════════════════════════════════════════════════════

describe('el retorno a 14 días, con mensaje contra sin mensaje', () => {
  it('cuenta las ventanas cerradas de los últimos 30 días; «volvieron por un mensaje» son los regresos reales', async () => {
    const t = await nuevaMarca()
    const c = await nuevoCliente(t, { dias: 3 })
    const hace = (d: number) => new Date(Date.now() - d * 86_400_000)
    await toque(t, c, { cycleNo: 11, stage: 't2', status: 'sent', due: hace(20), sent: hace(20), volvio: hace(15) })
    await toque(t, c, { cycleNo: 12, stage: 't2', status: 'sent', due: hace(20), sent: hace(20) })
    await toque(t, c, { cycleNo: 13, stage: 't2', status: 'holdout', due: hace(25), volvio: hace(20) })
    await toque(t, c, { cycleNo: 14, stage: 't2', status: 'holdout', due: hace(25) })
    await toque(t, c, { cycleNo: 15, stage: 't2', status: 'holdout', due: hace(25) })
    await toque(t, c, { cycleNo: 16, stage: 't2', status: 'sent', due: hace(5), sent: hace(5), volvio: hace(1) }) // ventana abierta
    await toque(t, c, { cycleNo: 17, stage: 't4', status: 'sent', due: hace(50), sent: hace(50), volvio: hace(45) }) // fuera del período
    comoDueno(t)

    const { body } = await overview()
    expect(caja(body, 't2').retorno).toEqual({
      con_mensaje: { toques: 2, volvieron: 1, pct: 50 },
      sin_mensaje: { toques: 3, volvieron: 1, pct: 33.3 },
    })
    expect(caja(body, 't4').retorno!.con_mensaje).toEqual({ toques: 0, volvieron: 0, pct: null })
    expect(body.numeros.volvieron_por_mensaje).toEqual({ clientes: 2, con_mensaje_pct: 50, sin_mensaje_pct: 33.3 })
  })
})

describe('la segunda visita (A12): días con visita, no `cycle_no`', () => {
  it('de los nuevos de la cohorte, los que volvieron OTRO día dentro de 60', async () => {
    const t = await nuevaMarca()
    const hoy = hoyReal()
    const s1 = await nuevoCliente(t, { dias: 80 })
    await visita(t, s1, hoy - 100)
    await visita(t, s1, hoy - 80) // volvió a los 20 días
    const s2 = await nuevoCliente(t, { dias: 100 })
    await visita(t, s2, hoy - 100)
    await visita(t, s2, hoy - 100, 5) // dos escaneos el mismo día: NO es segunda visita
    const s3 = await nuevoCliente(t, { dias: 5 })
    await visita(t, s3, hoy - 70)
    await visita(t, s3, hoy - 5) // a los 65 días: fuera de la ventana
    const s4 = await nuevoCliente(t, { dias: 100 })
    await visita(t, s4, hoy - 200) // su primera visita es anterior a la cohorte
    await visita(t, s4, hoy - 100)
    const s5 = await nuevoCliente(t, { dias: 30 })
    await visita(t, s5, hoy - 30) // su ventana todavía no cerró
    const s6 = await nuevoCliente(t, { dias: 60 })
    await visita(t, s6, hoy - 120)
    await visita(t, s6, hoy - 60) // a los 60 días justos: cuenta
    comoDueno(t)

    const { body } = await overview()
    expect(body.segunda_visita).toEqual({
      ventana_dias: 60,
      desde: isoDeDia(hoy - 149),
      hasta: isoDeDia(hoy - 60),
      clientes: 4,
      volvieron: 2,
      pct: 50,
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Aislamiento entre marcas y por sede
// ═══════════════════════════════════════════════════════════════

describe('un dato de la marca A jamás se ve en la marca B', () => {
  it('cajas, lista, proyección y retorno solo cuentan lo de la marca de la sesión', async () => {
    const a = await nuevaMarca()
    const b = await nuevaMarca()
    const deA = [await nuevoCliente(a, { dias: 15 }), await nuevoCliente(a, { dias: 16 })]
    const deB: string[] = []
    for (let i = 0; i < 5; i++) deB.push(await nuevoCliente(b, { dias: 15 }))
    await nuevoCliente(b, { estado: 'dormido', dormidoHace: 20 })
    const hace = (d: number) => new Date(Date.now() - d * 86_400_000)
    await toque(b, deB[0], { cycleNo: 9, stage: 't1', status: 'sent', due: hace(20), sent: hace(20), volvio: hace(18) })

    comoDueno(a)
    const { body } = await overview()
    expect(caja(body, 't1').total).toBe(2)
    expect(body.dormidos.total).toBe(0)
    expect(caja(body, 't1').retorno!.con_mensaje.toques).toBe(0)
    expect(body.numeros.volvieron_por_mensaje!.clientes).toBe(0)

    const l = await lista('?stage=t1')
    expect(l.body.total).toBe(2)
    expect(l.body.clientes.map((c: { id: string }) => c.id).sort()).toEqual([...deA].sort())

    const hoy = hoyReal()
    const p = await proyeccion(`?from=${isoDeDia(hoy)}&to=${isoDeDia(hoy + 20)}`)
    const t2 = p.body.dias.find((d) => d.fecha === isoDeDia(hoy + 13))! // día 28 de los de A: entran a t2
    expect(t2.entran).toEqual([{ etapa: 't2', etiqueta: 'Le regalamos algo', total: 1, nuevos: 1 }])
    const todos = p.body.dias.flatMap((d) => d.entran.map((e) => e.total))
    expect(todos.reduce((x, y) => x + y, 0)).toBe(2)

    comoDueno(b)
    expect(caja((await overview()).body, 't1').total).toBe(5)
  })
})

describe('el alcance de sede: el ciclo se LEE de la marca; lo de la marca lo ESCRIBE solo un super usuario', () => {
  it('un administrador de sede ve las mismas cajas, pero «Hoy no» le da 403 y no escribe nada', async () => {
    const t = await nuevaMarca({ encendido: true })
    const s1 = await sede(t, 'Laureles', true)
    await sede(t, 'Envigado')
    await nuevoCliente(t, { dias: 15 })
    await nuevoCliente(t, { estado: 'dormido', dormidoHace: 3 })

    await usuarioDelPanel(t, 'location', s1)
    const deSede = await overview()
    expect(deSede.status).toBe(200)
    expect(caja(deSede.body, 't1').total).toBe(1)
    expect(deSede.body.permisos).toEqual({ aprobar: false, interruptor: false })
    const negado = await hoyNo({ tarjeta: 'trimestral' })
    expect(negado.status).toBe(403)
    expect(negado.body.error).toMatch(/super usuario/)
    const { rows: nada } = await db().query(`SELECT 1 FROM admin_settings WHERE tenant_id = $1 AND key = $2`, [t.id, HOY_NO_CLAVES.trimestral])
    expect(nada).toHaveLength(0)

    await usuarioDelPanel(t, 'brand', null)
    const deMarca = await overview()
    expect(deMarca.body.permisos).toEqual({ aprobar: true, interruptor: false })
    expect(caja(deMarca.body, 't1').total).toBe(1)
    const si = await hoyNo({ tarjeta: 'trimestral' })
    expect(si.status).toBe(200)
    expect(si.body).toMatchObject({ ok: true, tarjeta: 'trimestral', pospuesto: diaQuePospone(new Date()) })
    const { rows } = await db().query<{ value: string; tenant_id: string }>(
      `SELECT value, tenant_id FROM admin_settings WHERE key = $1 AND tenant_id = $2`,
      [HOY_NO_CLAVES.trimestral, t.id]
    )
    expect(rows).toEqual([{ value: diaQuePospone(new Date()), tenant_id: t.id }])
  })

  it('el interruptor del ciclo lo ve solo el operador de Cada1', async () => {
    const t = await nuevaMarca()
    await sede(t, 'Laureles', true)
    await sede(t, 'Envigado')
    await usuarioDelPanel(t, undefined, null, true)
    const { body } = await overview()
    expect(body.permisos).toEqual({ aprobar: true, interruptor: true })
  })

  it('«Hoy no» con una tarjeta que no existe es 400', async () => {
    const t = await nuevaMarca()
    comoDueno(t)
    expect((await hoyNo({ tarjeta: 'rescate' })).status).toBe(400)
    expect((await hoyNo({})).status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Un fallo de base es 500: nunca «0 clientes»
// ═══════════════════════════════════════════════════════════════

describe('un fallo de base da 500 con un mensaje para el dueño, nunca un cero', () => {
  it.each([
    ['customers', 'overview'],
    ['customer_cycle_touches', 'overview'],
    ['visits', 'overview'],
    ['admin_settings', 'overview'],
    ['customers', 'projection'],
    ['restaurant_events', 'projection'],
    ['customers', 'customers'],
    ['customer_cycle_touches', 'customers'],
  ])('si falla «%s», %s contesta 500 sin números', async (tabla, ruta) => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 15 })
    const c = await nuevoCliente(t, { dias: 16 })
    await toque(t, c, { cycleNo: 3, stage: 't1', status: 'sent', due: new Date(), sent: new Date() })
    comoDueno(t)
    h.falla = tabla
    const r = ruta === 'overview' ? await overview() : ruta === 'projection' ? await proyeccion() : await lista('?stage=t1')
    expect(r.status).toBe(500)
    expect(r.body.error).toMatch(/No pudimos leer/)
    expect(r.body).not.toHaveProperty('cajas')
    expect(r.body).not.toHaveProperty('clientes')
    expect(r.body).not.toHaveProperty('dias')
  })

  it('la versión mini no lee los toques: si fallan, las cajas igual salen', async () => {
    const t = await nuevaMarca()
    await nuevoCliente(t, { dias: 15 })
    comoDueno(t)
    h.falla = 'customer_cycle_touches'
    const r = await overview('?mini=1')
    expect(r.status).toBe(200)
    expect(caja(r.body, 't1').total).toBe(1)
  })

  it('«Hoy no» que no se pudo guardar es 500 (la pantalla no puede decir «listo»)', async () => {
    const t = await nuevaMarca()
    comoDueno(t)
    h.falla = 'admin_settings'
    const r = await hoyNo({ tarjeta: 'trimestral' })
    expect(r.status).toBe(500)
    expect(r.body.error).toMatch(/No pudimos guardar/)
  })

  it('sin sesión, 401', async () => {
    h.usuario = null
    expect((await overview()).status).toBe(401)
    expect((await proyeccion()).status).toBe(401)
    expect((await lista('?stage=t1')).status).toBe(401)
    expect((await hoyNo({ tarjeta: 'trimestral' })).status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. «Para hoy» (con un día fijo: las fechas especiales dependen del calendario)
// ═══════════════════════════════════════════════════════════════

describe('«Para hoy»: tarjetas armadas, ordenadas por lo que mueven, máximo tres', () => {
  // Domingo 4 de octubre de 2026, mediodía de Bogotá: la corrida del cron es hoy a las 15:00.
  const AHORA = new Date('2026-10-04T17:00:00Z')
  const HOY = bogotaDay(AHORA)

  async function servicio(t: Marca) {
    const { getTenantById } = await import('@/lib/tenant')
    const { getCycleOverview } = await import('@/services/cycle-overview.service')
    const tenant = await getTenantById(t.id)
    return getCycleOverview(tenant!, { ahora: AHORA })
  }

  it('trimestral, evento sin foto y rescate sin regalo fuerte; la fecha especial queda cuarta y no sale', async () => {
    const t = await nuevaMarca({ encendido: true, fuerte: false, encendidoDesde: new Date(AHORA.getTime() - 120 * 86_400_000) })
    await nuevoCliente(t, { hoy: HOY, estado: 'dormido', dormidoHace: 90 }) // su primer trimestral, hoy
    await nuevoCliente(t, { hoy: HOY, dias: 57 }) // entra al rescate en 3 días
    for (let i = 0; i < 3; i++) await nuevoCliente(t, { hoy: HOY, dias: 2 })
    const ev = await evento(t, { fecha: isoDeDia(HOY + 5), envio: instanteEnBogota(HOY + 4, 16, 30) })

    const o = await servicio(t)
    expect(o.para_hoy!.map((x) => x.tipo)).toEqual(['evento_sin_foto', 'trimestral', 'rescate_sin_regalo'])
    const [sinFoto, trimestral, rescate] = o.para_hoy!
    expect(sinFoto).toMatchObject({
      id: `evento_sin_foto:${ev}`,
      evento_id: ev,
      clientes: 5,
      dias: 4,
      acciones: ['subir_foto'],
      texto: '«Noche de sushi» (viernes 9 de octubre) todavía no tiene foto. Sin foto no sale.',
    })
    expect(trimestral).toMatchObject({
      id: 'trimestral',
      clientes: 1,
      dias: 0,
      regalo: 'Postre del chef',
      pospuesto: false,
      acciones: ['ok', 'cambiar_regalo', 'hoy_no'],
      texto: '1 dormido recibe su toque trimestral hoy a las 4:30 pm con Postre del chef.',
    })
    expect(rescate).toMatchObject({
      clientes: 1,
      dias: 3,
      acciones: ['elegir_regalo'],
      texto: '1 cliente llega al rescate esta semana y no hay regalo fuerte elegido.',
    })
    // El próximo evento, con su audiencia y la foto que falta.
    expect(o.numeros.proximo_evento).toMatchObject({ id: ev, titulo: 'Noche de sushi', dias: 5, invitados: 5, sin_foto: true })
  })

  it('«Hoy no»: la tarjeta queda pospuesta un día, sin el botón, y sale mañana', async () => {
    const t = await nuevaMarca({ encendido: true, encendidoDesde: new Date(AHORA.getTime() - 120 * 86_400_000) })
    await nuevoCliente(t, { hoy: HOY, estado: 'dormido', dormidoHace: 90 })
    const { anotarHoyNo } = await import('@/services/cycle.service')
    expect(await anotarHoyNo(t.id, 'trimestral', AHORA)).toBe('2026-10-04')

    const tarjeta = (await servicio(t)).para_hoy!.find((x) => x.tipo === 'trimestral')!
    expect(tarjeta).toMatchObject({
      pospuesto: true,
      dias: 1,
      acciones: ['ok', 'cambiar_regalo'],
      texto: 'Pospuesto un día: 1 dormido recibe su toque trimestral mañana a las 4:30 pm con Postre del chef.',
    })
  })

  it('la fecha especial más cercana sin evento: «Halloween es en 27 días»; con un evento esa semana, no se sugiere', async () => {
    const t = await nuevaMarca({ encendido: true })
    await nuevoCliente(t, { hoy: HOY, dias: 3 })
    await nuevoCliente(t, { hoy: HOY, dias: 4 })
    let o = await servicio(t)
    expect(o.para_hoy).toEqual([
      {
        id: 'fecha:halloween:2026-10-31',
        tipo: 'fecha_especial',
        texto: 'Halloween es en 27 días. ¿Creamos el evento?',
        clientes: 2,
        dias: 27,
        acciones: ['crear_evento'],
        fecha: '2026-10-31',
        nombre: 'Halloween',
      },
    ])
    await evento(t, { fecha: '2026-10-30', modo: 'remind', estado: 'planned', titulo: 'Fiesta de disfraces' })
    o = await servicio(t)
    expect(o.para_hoy).toEqual([])
  })

  it('cupo de sobra y «Le regalamos algo» sin regalo pequeño: la tarjeta lo dice con los números', async () => {
    const t = await nuevaMarca({ encendido: true, pequeno: false })
    await nuevoCliente(t, { hoy: HOY, dias: 30 })
    await nuevoCliente(t, { hoy: HOY, dias: 31 })
    const o = await servicio(t)
    const cupo = o.para_hoy!.find((x) => x.tipo === 'cupo_sin_regalo')!
    expect(cupo.texto).toMatch(/^Hoy sobran \d+ del cupo y hay 2 en «Le regalamos algo» sin regalo configurado\.$/)
    expect(cupo).toMatchObject({ clientes: 2, dias: 0, acciones: ['elegir_regalo'] })
  })

  it('con el ciclo APAGADO no hay tarjetas de lo automático (nada sale solo)', async () => {
    const t = await nuevaMarca({ encendido: false, fuerte: false, pequeno: false })
    await nuevoCliente(t, { hoy: HOY, estado: 'dormido', dormidoHace: 90 })
    await nuevoCliente(t, { hoy: HOY, dias: 57 })
    await nuevoCliente(t, { hoy: HOY, dias: 30 })
    const tipos = (await servicio(t)).para_hoy!.map((x) => x.tipo)
    expect(tipos).not.toContain('trimestral')
    expect(tipos).not.toContain('rescate_sin_regalo')
    expect(tipos).not.toContain('cupo_sin_regalo')
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. «Hoy no» de punta a punta: el cron lo respeta
// ═══════════════════════════════════════════════════════════════

describe('el cron respeta «Hoy no»', () => {
  it('el día pospuesto no crea ni encola el trimestral; al otro día (la clave vieja) sale', async () => {
    const t = await nuevaMarca({ encendido: true })
    const dormido = await nuevoCliente(t, { estado: 'dormido', dormidoHace: 90 })
    await ajuste(t, HOY_NO_CLAVES.trimestral, isoDeDia(hoyReal()))

    let r = await correrCron(t)
    expect(r).toMatchObject({ ciclo: true, saltados: { hoy_no: 1 }, por_etapa: { heartbeat: 0 } })
    const { rows: ninguno } = await db().query('SELECT 1 FROM customer_cycle_touches WHERE customer_id = $1', [dormido])
    expect(ninguno).toHaveLength(0)

    // Un «Hoy no» de ayer ya no frena nada: es un día, no para siempre.
    await ajuste(t, HOY_NO_CLAVES.trimestral, isoDeDia(hoyReal() - 1))
    r = await correrCron(t)
    expect(r).toMatchObject({ saltados: { hoy_no: 0 }, por_etapa: { heartbeat: 1 } })
    const { rows } = await db().query<{ stage: string; status: string }>(
      'SELECT stage, status FROM customer_cycle_touches WHERE customer_id = $1',
      [dormido]
    )
    expect(rows).toEqual([{ stage: 'heartbeat', status: 'queued' }])
  })

  it('«Hoy no» del trimestral no frena los demás toques del ciclo', async () => {
    const t = await nuevaMarca({ encendido: true })
    await nuevoCliente(t, { dias: 14 })
    await ajuste(t, HOY_NO_CLAVES.trimestral, isoDeDia(hoyReal()))
    const r = await correrCron(t)
    expect(r).toMatchObject({ por_etapa: { t1: 1 }, saltados: { hoy_no: 0 } })
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. La proyección y la lista
// ═══════════════════════════════════════════════════════════════

describe('la proyección: por día, quién entra a cada toque, los eventos y lo reservado', () => {
  it('aritmética sobre el inicio del ciclo con los días del ritmo; el trimestral de los dormidos; el blackout', async () => {
    const t = await nuevaMarca({ encendido: true })
    const hoy = hoyReal()
    await nuevoCliente(t, { dias: 10, visitas: 1 }) // t1 en +4, t2 en +18
    await nuevoCliente(t, { dias: 10, visitas: 3 }) // igual, ya volvió
    await nuevoCliente(t, { estado: 'dormido', dormidoHace: 80 }) // trimestral en +10
    const ev = await evento(t, { fecha: isoDeDia(hoy + 20), blackout: 5, foto: 'https://x/y.jpg' })
    comoDueno(t)

    const { status, body } = await proyeccion(`?from=${isoDeDia(hoy - 2)}&to=${isoDeDia(hoy + 25)}`)
    expect(status).toBe(200)
    expect(body).toMatchObject({ desde: isoDeDia(hoy - 2), hasta: isoDeDia(hoy + 25), hoy: isoDeDia(hoy), encendido: true })
    expect(body.dias).toHaveLength(28)
    const dia = (n: number) => body.dias.find((d) => d.fecha === isoDeDia(hoy + n))!
    expect(dia(4).entran).toEqual([{ etapa: 't1', etiqueta: 'Le recordamos', total: 2, nuevos: 1 }])
    expect(dia(18).entran).toEqual([{ etapa: 't2', etiqueta: 'Le regalamos algo', total: 2, nuevos: 1 }])
    expect(dia(10).entran).toEqual([{ etapa: 'heartbeat', etiqueta: 'Toque trimestral', total: 1, nuevos: 1 }])
    expect(dia(-2).entran).toEqual([]) // el pasado no se proyecta
    for (const n of [15, 16, 17, 18, 19]) expect(dia(n).reservado_para).toEqual([ev])
    expect(dia(14).reservado_para).toEqual([])
    expect(dia(20)).toMatchObject({ eventos: [ev], reservado_para: [] })
    expect(body.eventos).toEqual([
      { id: ev, titulo: 'Noche de sushi', fecha: isoDeDia(hoy + 20), estado: 'scheduled', sin_foto: false, reservado_desde: isoDeDia(hoy + 15) },
    ])
    // Las fechas especiales del rango, del catálogo.
    const esperadas = fechasEspecialesEntre(isoDeDia(hoy - 2), isoDeDia(hoy + 25), { businessType: 'restaurant', rubro: null })
    expect(body.dias.flatMap((d) => d.fechas_especiales)).toEqual(esperadas)
  })

  it('valida el rango: formato, orden y máximo 93 días', async () => {
    const t = await nuevaMarca()
    comoDueno(t)
    expect((await proyeccion('?from=2026-10-01&to=2026-09-01')).status).toBe(400)
    expect((await proyeccion('?from=01-10-2026&to=2026-10-31')).status).toBe(400)
    expect((await proyeccion('?from=2026-02-30&to=2026-03-10')).status).toBe(400)
    expect((await proyeccion('?from=2026-10-01&to=2027-01-02')).status).toBe(400) // 94 días
    expect((await proyeccion('?from=2026-10-01&to=2027-01-01')).status).toBe(200) // 93: el máximo
    const sinRango = await proyeccion()
    expect(sinRango.status).toBe(200)
    expect(sinRango.body.dias).toHaveLength(31)
  })
})

describe('la lista: tocar una caja abre quiénes', () => {
  it('por caja, paginada, con el último toque y si volvió', async () => {
    const t = await nuevaMarca()
    const hace = (d: number) => new Date(Date.now() - d * 86_400_000)
    const ana = await nuevoCliente(t, { dias: 27, visitas: 1, nombre: 'Ana' })
    const beto = await nuevoCliente(t, { dias: 20, visitas: 4, nombre: 'Beto' })
    const caro = await nuevoCliente(t, { dias: 14, visitas: 2, nombre: 'Caro' })
    await toque(t, beto, { cycleNo: 1, stage: 't2', status: 'sent', due: hace(60), sent: hace(60), volvio: hace(55) })
    await toque(t, beto, { cycleNo: 1, stage: 't1', status: 'holdout', due: hace(70) })
    comoDueno(t)

    const r = await lista('?stage=t1&limit=2')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ total: 3, nuevos: 1, ya_volvieron: 2, pagina: 1, por_pagina: 2 })
    // Los más cerca de la próxima etapa primero.
    expect(r.body.clientes.map((c: { id: string }) => c.id)).toEqual([ana, beto])
    expect(r.body.clientes[0]).toMatchObject({ nombre: 'Ana', visitas: 1, puntos: 90, nuevo: true, dias_sin_venir: 27, caja: 't1', ultimo_toque: null })
    expect(r.body.clientes[1].ultimo_toque).toMatchObject({ etapa: 't2', etiqueta: 'Le regalamos algo', con_mensaje: true, volvio: true })
    expect(r.body.clientes[1]).not.toHaveProperty('phone')

    const p2 = await lista('?stage=t1&limit=2&page=2')
    expect(p2.body.clientes.map((c: { id: string }) => c.id)).toEqual([caro])
  })

  it('dormidos (los que ya no reciben nada, al final), por días sin venir y por fecha de entrada', async () => {
    const t = await nuevaMarca()
    const hoy = hoyReal()
    const archivado = await nuevoCliente(t, { estado: 'archivado', dormidoHace: 300, visitas: 6 })
    const dormido = await nuevoCliente(t, { estado: 'dormido', dormidoHace: 80 })
    const diez = await nuevoCliente(t, { dias: 10 })
    comoDueno(t)

    const d = await lista('?state=dormido')
    expect(d.body.clientes.map((c: { id: string; archivado: boolean }) => [c.id, c.archivado])).toEqual([
      [dormido, false],
      [archivado, true],
    ])
    expect((await lista('?day=10')).body.clientes.map((c: { id: string }) => c.id)).toEqual([diez])

    const f = await lista(`?fecha=${isoDeDia(hoy + 4)}`)
    expect(f.body.clientes).toEqual([expect.objectContaining({ id: diez, entra_a: 't1' })])
    const fh = await lista(`?fecha=${isoDeDia(hoy + 10)}&stage=heartbeat`)
    expect(fh.body.clientes).toEqual([expect.objectContaining({ id: dormido, entra_a: 'heartbeat' })])
  })

  it('pide UN filtro válido', async () => {
    const t = await nuevaMarca()
    comoDueno(t)
    for (const q of ['', '?stage=t9', '?stage=t1&day=3', '?state=activo', '?day=-1', '?fecha=ayer', '?stage=t1&limit=0', '?fecha=2026-10-14&stage=reciente']) {
      expect((await lista(q)).status, q).toBe(400)
    }
  })
})
