/**
 * Referidos — la base (00075), contra Postgres real (2026-10-15).
 *
 * Lo que la base garantiza sola, sin que el código tenga que acordarse:
 *   1. Un referido de la marca A no puede nombrar a un cliente de la marca B (FK compuesta
 *      sobre `customers (id, tenant_id)`, que esta migración crea).
 *   2. Un teléfono se refiere UNA vez por marca; nadie se refiere a sí mismo; el código es
 *      único por marca (el mismo código en otra marca es otro).
 *   3. `completar_referido()` completa UNA vez: seis llamadas simultáneas → una «completado»,
 *      cinco «ya_resuelto». Y dos transacciones intercaladas a mano muestran POR QUÉ: la segunda
 *      espera la fila del primero.
 *   4. El tope del mes cuenta solo los premiados del mes en Bogotá, y no se pasa aunque dos
 *      amigos del mismo referidor se validen a la vez (el candado por referidor).
 *   5. Vencido: pasó `expires_at` → `expired`, y nadie gana.
 *   6. `reward_grants`: dos premios de referido ACTIVOS para la misma persona (dos amigos) sí;
 *      dos del MISMO referido para la misma persona, no. Las demás fuentes siguen con su regla.
 *
 * Código: `supabase/migrations/00075_referidos.sql` · Doc: `docs/features/referral-program.md`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'

const db = () => getPool()
let marca: TestTenant
let otraMarca: TestTenant

let seq = 0
function telefono(): string {
  seq += 1
  return `32${String(process.pid % 1000).padStart(3, '0')}${String(seq).padStart(5, '0')}`
}

async function cliente(t: TestTenant, nombre = 'Ana'): Promise<{ id: string; phone: string }> {
  const phone = telefono()
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_visits) VALUES ($1, $2, $3, 0) RETURNING id`,
    [t.id, phone, nombre]
  )
  return { id: rows[0].id, phone }
}

/** Un referido pendiente: `referidor` trajo a `amigo`. `creado`/`vence` en SQL relativo a now(). */
async function referido(
  t: TestTenant,
  referidor: { id: string },
  amigo: { id: string; phone: string },
  opts: { creado?: string; vence?: string } = {}
): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO referrals (tenant_id, referrer_customer_id, referred_customer_id, referred_phone, code, created_at, expires_at)
     VALUES ($1, $2, $3, $4, 'ABC234', now() + $5::interval, now() + $6::interval)
     RETURNING id`,
    [t.id, referidor.id, amigo.id, amigo.phone, opts.creado ?? '0 days', opts.vence ?? '30 days']
  )
  return rows[0].id
}

interface Resultado {
  resultado: 'sin_referido' | 'ya_resuelto' | 'vencido' | 'completado' | 'tope'
  referral_id?: string
  referrer_customer_id?: string
  referrer_rewarded?: boolean
  status?: string
}

async function completar(
  t: TestTenant,
  amigoId: string,
  tope: number | null = 10,
  premiar = true
): Promise<Resultado> {
  const { rows } = await db().query<{ r: Resultado }>(
    'SELECT completar_referido($1, $2, $3, $4) AS r',
    [t.id, amigoId, tope, premiar]
  )
  return rows[0].r
}

async function codigoDeError(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'sin-codigo'
  }
}

beforeAll(async () => {
  marca = await createTestTenant()
  otraMarca = await createTestTenant()
})

afterAll(async () => {
  for (const t of [marca, otraMarca]) {
    await db().query('DELETE FROM reward_grants WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM referrals WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM referral_codes WHERE tenant_id = $1', [t.id])
    await dropTestTenant(t.id)
  }
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// 1-2. Las tablas
// ═══════════════════════════════════════════════════════════════

describe('00075 — un dato de la marca A no nombra a un cliente de la marca B', () => {
  it('existe customers_id_tenant_key (el soporte de las FK compuestas)', async () => {
    const { rows } = await db().query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'customers_id_tenant_key' AND conrelid = 'public.customers'::regclass`
    )
    expect(rows).toHaveLength(1)
  })

  it('un referido de la marca A con un amigo de la marca B: 23503', async () => {
    const referidor = await cliente(marca)
    const ajeno = await cliente(otraMarca)
    expect(await codigoDeError(referido(marca, referidor, ajeno))).toBe('23503')
  })

  it('un código de la marca A para un cliente de la marca B: 23503', async () => {
    const ajeno = await cliente(otraMarca)
    expect(
      await codigoDeError(
        db().query(`INSERT INTO referral_codes (tenant_id, customer_id, code) VALUES ($1, $2, 'QWE234')`, [marca.id, ajeno.id])
      )
    ).toBe('23503')
  })
})

describe('00075 — las reglas del referido en la base', () => {
  it('un teléfono se refiere una sola vez por marca', async () => {
    const a = await cliente(marca)
    const b = await cliente(marca)
    const amigo = await cliente(marca)
    await referido(marca, a, amigo)
    // Otro referidor, el mismo amigo (mismo teléfono): no entra.
    expect(await codigoDeError(referido(marca, b, amigo))).toBe('23505')
  })

  it('nadie se refiere a sí mismo', async () => {
    const a = await cliente(marca)
    expect(await codigoDeError(referido(marca, a, a))).toBe('23514')
  })

  it('el código es único por marca, y el mismo código en otra marca es otro', async () => {
    const a = await cliente(marca)
    const b = await cliente(marca)
    const c = await cliente(otraMarca)
    await db().query(`INSERT INTO referral_codes (tenant_id, customer_id, code) VALUES ($1, $2, 'ZZZ777')`, [marca.id, a.id])
    expect(
      await codigoDeError(
        db().query(`INSERT INTO referral_codes (tenant_id, customer_id, code) VALUES ($1, $2, 'ZZZ777')`, [marca.id, b.id])
      )
    ).toBe('23505')
    await db().query(`INSERT INTO referral_codes (tenant_id, customer_id, code) VALUES ($1, $2, 'ZZZ777')`, [otraMarca.id, c.id])
  })

  it('un código con letras que se confunden (O, I, 0, 1) no entra', async () => {
    const a = await cliente(marca)
    expect(
      await codigoDeError(
        db().query(`INSERT INTO referral_codes (tenant_id, customer_id, code) VALUES ($1, $2, 'OI0123')`, [marca.id, a.id])
      )
    ).toBe('23514')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. completar_referido(): una sola vez
// ═══════════════════════════════════════════════════════════════

describe('completar_referido() — pendiente → completado, una sola vez', () => {
  it('un cliente que no llegó por un referido: sin_referido, y no escribe nada', async () => {
    const solo = await cliente(marca)
    expect((await completar(marca, solo.id)).resultado).toBe('sin_referido')
  })

  it('el código de la marca A no completa nada en la marca B', async () => {
    const referidor = await cliente(marca)
    const amigo = await cliente(marca)
    await referido(marca, referidor, amigo)
    expect((await completar(otraMarca, amigo.id)).resultado).toBe('sin_referido')
    const { rows } = await db().query(`SELECT status FROM referrals WHERE referred_customer_id = $1`, [amigo.id])
    expect(rows[0].status).toBe('pending')
  })

  it('seis escaneos simultáneos del mismo amigo: UNO completa y premia, cinco ven «ya_resuelto»', async () => {
    const referidor = await cliente(marca)
    const amigo = await cliente(marca)
    const id = await referido(marca, referidor, amigo)

    const r = await Promise.all(Array.from({ length: 6 }, () => completar(marca, amigo.id)))

    const completados = r.filter((x) => x.resultado === 'completado')
    expect(completados).toHaveLength(1)
    expect(completados[0]).toMatchObject({ referral_id: id, referrer_customer_id: referidor.id, referrer_rewarded: true })
    expect(r.filter((x) => x.resultado === 'ya_resuelto')).toHaveLength(5)

    const { rows } = await db().query(`SELECT status, referrer_rewarded, completed_at FROM referrals WHERE id = $1`, [id])
    expect(rows[0]).toMatchObject({ status: 'completed', referrer_rewarded: true })
    expect(rows[0].completed_at).not.toBeNull()
  })

  it('por qué: con la primera transacción abierta, la segunda ESPERA, y al confirmar ve «ya_resuelto»', async () => {
    const referidor = await cliente(marca)
    const amigo = await cliente(marca)
    await referido(marca, referidor, amigo)

    const c1 = await db().connect()
    const c2 = await db().connect()
    try {
      await c1.query('BEGIN')
      const { rows: r1 } = await c1.query<{ r: Resultado }>('SELECT completar_referido($1, $2, 10, true) AS r', [marca.id, amigo.id])
      expect(r1[0].r.resultado).toBe('completado')

      let segundaTermino = false
      const segunda = c2
        .query<{ r: Resultado }>('SELECT completar_referido($1, $2, 10, true) AS r', [marca.id, amigo.id])
        .then((x) => {
          segundaTermino = true
          return x.rows[0].r
        })
      await new Promise((ok) => setTimeout(ok, 300))
      expect(segundaTermino).toBe(false) // espera la fila

      await c1.query('COMMIT')
      expect((await segunda).resultado).toBe('ya_resuelto')
    } finally {
      await c1.query('ROLLBACK').catch(() => {})
      c1.release()
      c2.release()
    }
  })

  it('sin premio para quien invita (la marca eligió «nada»): completa, sin premiar', async () => {
    const referidor = await cliente(marca)
    const amigo = await cliente(marca)
    await referido(marca, referidor, amigo)
    const r = await completar(marca, amigo.id, 10, false)
    expect(r).toMatchObject({ resultado: 'completado', referrer_rewarded: false })
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. El tope del mes
// ═══════════════════════════════════════════════════════════════

describe('completar_referido() — el tope del mes', () => {
  it('tope 2: el tercer amigo del mes completa, pero quien invita ya no gana («tope»)', async () => {
    const referidor = await cliente(marca)
    const amigos = [await cliente(marca), await cliente(marca), await cliente(marca)]
    for (const a of amigos) await referido(marca, referidor, a)

    const r = []
    for (const a of amigos) r.push(await completar(marca, a.id, 2))

    expect(r.map((x) => x.resultado)).toEqual(['completado', 'completado', 'tope'])
    expect(r.map((x) => x.referrer_rewarded)).toEqual([true, true, false])
    const { rows } = await db().query(
      `SELECT count(*)::int AS n FROM referrals WHERE referrer_customer_id = $1 AND status = 'completed'`,
      [referidor.id]
    )
    expect(rows[0].n).toBe(3)
  })

  it('tope 1 y cuatro amigos del mismo referidor validados A LA VEZ: gana UNO', async () => {
    const referidor = await cliente(marca)
    const amigos = await Promise.all(Array.from({ length: 4 }, () => cliente(marca)))
    for (const a of amigos) await referido(marca, referidor, a)

    const r = await Promise.all(amigos.map((a) => completar(marca, a.id, 1)))

    expect(r.filter((x) => x.referrer_rewarded === true)).toHaveLength(1)
    expect(r.filter((x) => x.resultado === 'tope')).toHaveLength(3)
  })

  it('los premiados del mes PASADO no cuentan', async () => {
    const referidor = await cliente(marca)
    const viejo = await cliente(marca)
    const nuevo = await cliente(marca)
    // Un amigo premiado hace 40 días (el mes pasado en cualquier día del mes).
    await db().query(
      `INSERT INTO referrals (tenant_id, referrer_customer_id, referred_customer_id, referred_phone, code,
                             status, referrer_rewarded, created_at, expires_at, completed_at)
       VALUES ($1, $2, $3, $4, 'ABC234', 'completed', true, now() - interval '45 days', now() - interval '15 days', now() - interval '40 days')`,
      [marca.id, referidor.id, viejo.id, viejo.phone]
    )
    await referido(marca, referidor, nuevo)
    expect(await completar(marca, nuevo.id, 1)).toMatchObject({ resultado: 'completado', referrer_rewarded: true })
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. El vencimiento
// ═══════════════════════════════════════════════════════════════

describe('completar_referido() — vencido', () => {
  it('el amigo viene después de expires_at: queda «expired» y nadie gana', async () => {
    const referidor = await cliente(marca)
    const amigo = await cliente(marca)
    const id = await referido(marca, referidor, amigo, { creado: '-31 days', vence: '-1 day' })

    expect((await completar(marca, amigo.id)).resultado).toBe('vencido')
    const { rows } = await db().query(`SELECT status, referrer_rewarded, expired_at FROM referrals WHERE id = $1`, [id])
    expect(rows[0]).toMatchObject({ status: 'expired', referrer_rewarded: false })
    expect(rows[0].expired_at).not.toBeNull()
    // Y otro escaneo después tampoco lo revive.
    expect((await completar(marca, amigo.id)).resultado).toBe('ya_resuelto')
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. reward_grants
// ═══════════════════════════════════════════════════════════════

async function grant(t: TestTenant, clienteId: string, source: string, referralId: string | null) {
  return db().query(
    `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, referral_id)
     VALUES ($1, $2, 'campaign_prize', $3, 'Postre', $4)`,
    [t.id, clienteId, source, referralId]
  )
}

describe('reward_grants — la fuente referral y el freno de «una vez»', () => {
  it('quien trae a dos amigos tiene DOS premios activos (el índice viejo lo impedía)', async () => {
    const referidor = await cliente(marca)
    const a1 = await cliente(marca)
    const a2 = await cliente(marca)
    const r1 = await referido(marca, referidor, a1)
    const r2 = await referido(marca, referidor, a2)
    await grant(marca, referidor.id, 'referral', r1)
    await grant(marca, referidor.id, 'referral', r2)
    const { rows } = await db().query(
      `SELECT count(*)::int AS n FROM reward_grants WHERE customer_id = $1 AND status = 'active'`,
      [referidor.id]
    )
    expect(rows[0].n).toBe(2)
  })

  it('dos premios del MISMO referido para la misma persona: 23505', async () => {
    const referidor = await cliente(marca)
    const amigo = await cliente(marca)
    const r = await referido(marca, referidor, amigo)
    await grant(marca, referidor.id, 'referral', r)
    expect(await codigoDeError(grant(marca, referidor.id, 'referral', r))).toBe('23505')
    // El regalo del amigo es OTRA persona del mismo referido: entra.
    await grant(marca, amigo.id, 'referral', r)
  })

  it('las demás fuentes siguen con su regla: dos invitaciones activas a la vez, no', async () => {
    const c = await cliente(marca)
    await grant(marca, c.id, 'invite', null)
    expect(await codigoDeError(grant(marca, c.id, 'invite', null))).toBe('23505')
  })

  it('una fuente inventada no entra al CHECK', async () => {
    const c = await cliente(marca)
    expect(await codigoDeError(grant(marca, c.id, 'regalito', null))).toBe('23514')
  })
})

describe('permisos', () => {
  it('completar_referido() no la ejecutan anon ni authenticated', async () => {
    const { rows } = await db().query<{ anon: boolean; auth: boolean }>(
      `SELECT has_function_privilege('anon', 'completar_referido(uuid, uuid, integer, boolean)', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', 'completar_referido(uuid, uuid, integer, boolean)', 'EXECUTE') AS auth`
    )
    expect(rows[0]).toEqual({ anon: false, auth: false })
  })
})
