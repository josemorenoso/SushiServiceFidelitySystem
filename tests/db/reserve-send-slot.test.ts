/**
 * `reserve_send_slot()` — la reserva atómica de cupo.
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.2 y §9
 * Migración: supabase/migrations/00037_send_governance.sql:322-398
 *
 * La primera prueba de este archivo es la que el spec §9 llama textualmente
 * «la prueba más importante del spec». Todo lo demás aquí son las invariantes
 * que la rodean.
 */

import { describe, it, expect, afterAll, afterEach } from 'vitest'
import {
  getPool,
  closePool,
  createTestTenant,
  dropTestTenant,
  reserveSlot,
  lineBudget,
  phoneAt,
  type TestTenant,
} from '../setup/db'

describe('reserve_send_slot()', () => {
  const creados: string[] = []

  async function tenant(...args: Parameters<typeof createTestTenant>): Promise<TestTenant> {
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

  // ─────────────────────────────────────────────────────────────
  // LA PRUEBA MÁS IMPORTANTE DEL SPEC (§9)
  // ─────────────────────────────────────────────────────────────
  describe('concurrencia', () => {
    it('20 llamadas en paralelo con presupuesto 10 conceden EXACTAMENTE 10', async () => {
      // limite 20, piso 10, tope 50% → reserva 10 → presupuesto de campaña 10.
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })

      expect((await lineBudget(t.id)).campaign_budget).toBe(10)

      // 20 teléfonos DISTINTOS: si fueran el mismo, 19 saldrían gratis por la
      // regla de destinatarios únicos y la prueba no mediría el límite.
      const resultados = await Promise.all(
        Array.from({ length: 20 }, (_, i) => reserveSlot(t.id, phoneAt(i), 'campaign'))
      )

      const concedidas = resultados.filter((r) => r.granted)
      expect(concedidas).toHaveLength(10)

      // Y las 10 denegadas lo dicen por el motivo correcto.
      const denegadas = resultados.filter((r) => !r.granted)
      expect(denegadas).toHaveLength(10)
      expect(new Set(denegadas.map((r) => r.reason))).toEqual(new Set(['campaign_budget_exhausted']))

      // La verdad está en la tabla, no solo en lo que devolvió la función.
      const { rows } = await getPool().query<{ n: string }>(
        `SELECT COUNT(DISTINCT phone) AS n FROM send_reservations
          WHERE tenant_id = $1 AND released_at IS NULL
            AND reserved_at > now() - interval '24 hours'`,
        [t.id]
      )
      expect(Number(rows[0].n)).toBe(10)
    })

    /**
     * CONTROL NEGATIVO — sin esto, la prueba de arriba no demuestra nada.
     *
     * Si el driver, el pool o el planificador estuvieran serializando las 20
     * llamadas por su cuenta, «exactamente 10» saldría igual aunque el advisory
     * lock no existiera. Esta prueba crea una copia de la función SIN
     * `pg_advisory_xact_lock` y exige que SE PASE del límite: es la evidencia de
     * que el escenario es realmente concurrente y de que el lock es lo único
     * que impide sobrepasarse.
     *
     * Si esta prueba empieza a fallar, la de arriba deja de ser válida.
     */
    it('CONTROL: la misma carga SIN el advisory lock se pasa del límite', async () => {
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })
      const db = getPool()

      // Copia fiel de reserve_send_slot() para el caso 'campaign', pero sin el
      // lock y con una pausa que ensancha la ventana de carrera.
      await db.query(`
        CREATE OR REPLACE FUNCTION reserve_sin_lock(p_tenant uuid, p_phone text)
        RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $fn$
        DECLARE v_budget jsonb; v_id uuid;
        BEGIN
          v_budget := line_budget(p_tenant);
          PERFORM pg_sleep(0.05);
          IF (v_budget->>'used_24h')::integer >= (v_budget->>'campaign_budget')::integer THEN
            RETURN jsonb_build_object('granted', false);
          END IF;
          INSERT INTO send_reservations (tenant_id, phone, message_class)
          VALUES (p_tenant, p_phone, 'campaign') RETURNING id INTO v_id;
          RETURN jsonb_build_object('granted', true);
        END; $fn$;
      `)

      try {
        const resultados = await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            db.query<{ r: { granted: boolean } }>('SELECT reserve_sin_lock($1,$2) AS r', [t.id, phoneAt(i)])
          )
        )
        const concedidas = resultados.filter((r) => r.rows[0].r.granted).length
        expect(concedidas).toBeGreaterThan(10)
      } finally {
        await db.query('DROP FUNCTION IF EXISTS reserve_sin_lock(uuid, text)')
      }
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Regla §2.1: Meta cuenta DESTINATARIOS ÚNICOS
  // ─────────────────────────────────────────────────────────────
  describe('destinatarios únicos', () => {
    it('un segundo envío al mismo teléfono dentro de 24h es gratis y no consume cupo', async () => {
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })

      const primera = await reserveSlot(t.id, phoneAt(1), 'campaign')
      expect(primera.granted).toBe(true)
      expect(primera.free).toBeFalsy()

      const segunda = await reserveSlot(t.id, phoneAt(1), 'campaign')
      expect(segunda.granted).toBe(true)
      expect(segunda.free).toBe(true)

      // Tres mensajes al mismo teléfono consumen UN cupo, no tres.
      expect((await lineBudget(t.id)).used_24h).toBe(1)
    })

    it('20 mensajes al MISMO teléfono con presupuesto 10 pasan todos', async () => {
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })
      const resultados = await Promise.all(
        Array.from({ length: 20 }, () => reserveSlot(t.id, phoneAt(7), 'campaign'))
      )
      expect(resultados.filter((r) => r.granted)).toHaveLength(20)
      expect((await lineBudget(t.id)).used_24h).toBe(1)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Regla §2.1: la ventana es RODANTE, no por día calendario
  // ─────────────────────────────────────────────────────────────
  describe('ventana rodante de 24h', () => {
    it('una reserva de hace 25h no cuenta; una de hace 23h sí', async () => {
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })
      const db = getPool()

      await db.query(
        `INSERT INTO send_reservations (tenant_id, phone, message_class, reserved_at)
         VALUES ($1, $2, 'campaign', now() - interval '25 hours'),
                ($1, $3, 'campaign', now() - interval '23 hours')`,
        [t.id, phoneAt(100), phoneAt(101)]
      )

      expect((await lineBudget(t.id)).used_24h).toBe(1)

      // El teléfono de hace 25h ya no está "vivo": vuelve a consumir cupo.
      const r = await reserveSlot(t.id, phoneAt(100), 'campaign')
      expect(r.granted).toBe(true)
      expect(r.free).toBeFalsy()
    })

    it('una reserva liberada deja de contar', async () => {
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })
      const db = getPool()

      const r = await reserveSlot(t.id, phoneAt(200), 'campaign')
      expect((await lineBudget(t.id)).used_24h).toBe(1)

      await db.query('SELECT release_send_slot($1, NULL)', [r.reservation_id])
      expect((await lineBudget(t.id)).used_24h).toBe(0)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Regla §3.1: la reserva transaccional existe para esto
  // ─────────────────────────────────────────────────────────────
  describe('reserva transaccional', () => {
    it('lo transaccional puede consumir la reserva; una campaña no', async () => {
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })

      // Agotar el presupuesto de campaña (10 de 20).
      for (let i = 0; i < 10; i++) {
        expect((await reserveSlot(t.id, phoneAt(i), 'campaign')).granted).toBe(true)
      }

      const campana = await reserveSlot(t.id, phoneAt(50), 'campaign')
      expect(campana.granted).toBe(false)
      expect(campana.reason).toBe('campaign_budget_exhausted')

      // La bienvenida de quien se registre esta tarde SÍ sale: es exactamente
      // el escenario por el que existe la reserva (spec §2, punto 2).
      const transaccional = await reserveSlot(t.id, phoneAt(51), 'transactional')
      expect(transaccional.granted).toBe(true)
    })

    it('agotado el límite entero, ni lo transaccional pasa', async () => {
      const t = await tenant({ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 })
      for (let i = 0; i < 20; i++) {
        expect((await reserveSlot(t.id, phoneAt(i), 'transactional')).granted).toBe(true)
      }
      const r = await reserveSlot(t.id, phoneAt(999), 'transactional')
      expect(r.granted).toBe(false)
      expect(r.reason).toBe('budget_exhausted')
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Regla §3.5: frenos por salud de línea
  // ─────────────────────────────────────────────────────────────
  describe('frenos de línea', () => {
    it("line_status='frozen' bloquea campañas y deja pasar lo transaccional", async () => {
      const t = await tenant({ messagingDailyLimit: 250, lineStatus: 'frozen' })

      const campana = await reserveSlot(t.id, phoneAt(1), 'campaign')
      expect(campana.granted).toBe(false)
      expect(campana.reason).toBe('line_frozen')

      const transaccional = await reserveSlot(t.id, phoneAt(2), 'transactional')
      expect(transaccional.granted).toBe(true)
    })

    it("line_status='throttled' deja el presupuesto de campaña a la mitad", async () => {
      const t = await tenant({
        messagingDailyLimit: 20,
        reserveFloor: 10,
        reserveMaxPct: 50,
        lineStatus: 'throttled',
      })
      const b = await lineBudget(t.id)
      expect(b.campaign_budget).toBe(5) // floor(10 * 0.5)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Regresión obligatoria (§9): los 4 tenants Twilio previos a 00037
  // ─────────────────────────────────────────────────────────────
  describe('límite desconocido (tenants anteriores a 00037)', () => {
    it('con messaging_daily_limit NULL se contabiliza pero NO se bloquea nada', async () => {
      const t = await tenant({ messagingDailyLimit: null })

      const b = await lineBudget(t.id)
      expect(b.enforced).toBe(false)
      expect(b.limit).toBeNull()
      expect(b.campaign_budget).toBeNull()

      // 300 destinatarios muy por encima del default de 250: ninguno se frena.
      const resultados = await Promise.all(
        Array.from({ length: 300 }, (_, i) => reserveSlot(t.id, phoneAt(i), 'campaign'))
      )
      expect(resultados.every((r) => r.granted)).toBe(true)
      expect(resultados.every((r) => r.enforced === false)).toBe(true)

      // Pero el consumo SÍ queda medido — que es el dato con el que después se
      // elige el límite real de esa línea.
      expect((await lineBudget(t.id)).used_24h).toBe(300)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Validación de entrada
  // ─────────────────────────────────────────────────────────────
  describe('validación', () => {
    it('rechaza una clase inválida', async () => {
      const t = await tenant()
      await expect(
        // @ts-expect-error — se prueba a propósito una clase fuera del tipo
        reserveSlot(t.id, phoneAt(1), 'promocional')
      ).rejects.toThrow(/clase_invalida/)
    })

    it('rechaza un teléfono vacío', async () => {
      const t = await tenant()
      await expect(reserveSlot(t.id, '   ', 'campaign')).rejects.toThrow(/telefono_vacio/)
    })

    it('rechaza un tenant inexistente', async () => {
      await expect(
        reserveSlot('00000000-0000-0000-0000-000000000000', phoneAt(1), 'campaign')
      ).rejects.toThrow(/tenant_no_encontrado/)
    })
  })
})
