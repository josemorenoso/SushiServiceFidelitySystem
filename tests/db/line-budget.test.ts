/**
 * `line_budget()` — el cálculo del presupuesto derivado.
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.1
 * Migración: supabase/migrations/00037_send_governance.sql:207-311
 *
 *     reserva             = LEAST( GREATEST(piso, ceil(p95 * factor)),
 *                                  floor(limite * max_pct / 100) )
 *     presupuesto_campana = limite - reserva
 *
 * La razón de que la reserva no sea un porcentaje fijo está en el spec: a
 * 250/día reservar el 28 % es correcto; a 10.000/día reservar 2.800 para
 * transaccional sería absurdo. Estas pruebas fijan ese comportamiento.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, lineBudget, phoneAt } from '../setup/db'

describe('line_budget()', () => {
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

  it('sin historial usa el piso: 250 - 70 = 180 de campaña libre', async () => {
    // El caso que el spec §3.1 pone como resultado esperado con los defaults
    // del producto para un tenant nuevo.
    const t = await tenant({ messagingDailyLimit: 250, reserveFloor: 70, reserveMaxPct: 50 })
    const b = await lineBudget(t.id)

    expect(b.enforced).toBe(true)
    expect(b.limit).toBe(250)
    expect(b.reserve).toBe(70)
    expect(b.campaign_budget).toBe(180)
    expect(b.campaign_available).toBe(180)
    expect(b.transactional_available).toBe(250)
  })

  it('los defaults de la propia función (sin admin_settings) también dan 180', async () => {
    // Un tenant recién creado NO tiene filas en admin_settings. Los COALESCE de
    // 00037:263-269 tienen que sostener el mismo resultado.
    const t = await tenant({ messagingDailyLimit: 250 })
    const b = await lineBudget(t.id)
    expect(b.reserve).toBe(70)
    expect(b.campaign_budget).toBe(180)
  })

  it('un p95 transaccional alto sube la reserva por encima del piso', async () => {
    const t = await tenant({ messagingDailyLimit: 1000, reserveFloor: 70, reserveMaxPct: 50 })
    const db = getPool()

    // 14 días con 100 destinatarios transaccionales distintos cada uno.
    // p95 = 100 → reserva = ceil(100 * 1.3) = 130, que gana al piso de 70.
    const filas: string[] = []
    const params: unknown[] = [t.id]
    let n = 1
    for (let dia = 1; dia <= 14; dia++) {
      for (let i = 0; i < 100; i++) {
        filas.push(`($1, $${++n}, 'welcome', 'sent', 'SM_test', now() - interval '${dia} days')`)
        params.push(phoneAt(dia * 1000 + i))
      }
    }
    await db.query(
      `INSERT INTO message_logs (tenant_id, phone, message_type, status, twilio_sid, created_at)
       VALUES ${filas.join(',')}`,
      params
    )

    const b = await lineBudget(t.id)
    expect(b.reserve).toBe(130)
    expect(b.campaign_budget).toBe(870)
  })

  it('el tope del 50% impide que un pico transaccional mate todas las campañas', async () => {
    const t = await tenant({ messagingDailyLimit: 100, reserveFloor: 70, reserveMaxPct: 50 })
    const db = getPool()

    // 14 días de 200 transaccionales: p95 * 1.3 = 260, muy por encima del límite.
    const filas: string[] = []
    const params: unknown[] = [t.id]
    let n = 1
    for (let dia = 1; dia <= 14; dia++) {
      for (let i = 0; i < 200; i++) {
        filas.push(`($1, $${++n}, 'checkin', 'sent', 'SM_test', now() - interval '${dia} days')`)
        params.push(phoneAt(dia * 5000 + i))
      }
    }
    await db.query(
      `INSERT INTO message_logs (tenant_id, phone, message_type, status, twilio_sid, created_at)
       VALUES ${filas.join(',')}`,
      params
    )

    const b = await lineBudget(t.id)
    expect(b.reserve).toBe(50) // floor(100 * 50 / 100), no 260
    expect(b.campaign_budget).toBe(50)
  })

  it('los mensajes de campaña NO cuentan para el p95 transaccional', async () => {
    const t = await tenant({ messagingDailyLimit: 1000, reserveFloor: 70, reserveMaxPct: 50 })
    const db = getPool()

    const filas: string[] = []
    const params: unknown[] = [t.id]
    let n = 1
    for (let dia = 1; dia <= 14; dia++) {
      for (let i = 0; i < 300; i++) {
        // 'manual' es campaña (message_class_map, 00037:97)
        filas.push(`($1, $${++n}, 'manual', 'sent', 'SM_test', now() - interval '${dia} days')`)
        params.push(phoneAt(dia * 9000 + i))
      }
    }
    await db.query(
      `INSERT INTO message_logs (tenant_id, phone, message_type, status, twilio_sid, created_at)
       VALUES ${filas.join(',')}`,
      params
    )

    // p95 transaccional sigue siendo 0 → gana el piso.
    expect((await lineBudget(t.id)).reserve).toBe(70)
  })

  it('un envío que el proveedor nunca aceptó (twilio_sid NULL) no infla el p95', async () => {
    const t = await tenant({ messagingDailyLimit: 1000, reserveFloor: 70, reserveMaxPct: 50 })
    const db = getPool()

    const filas: string[] = []
    const params: unknown[] = [t.id]
    let n = 1
    for (let dia = 1; dia <= 14; dia++) {
      for (let i = 0; i < 300; i++) {
        filas.push(`($1, $${++n}, 'welcome', 'failed', NULL, now() - interval '${dia} days')`)
        params.push(phoneAt(dia * 7000 + i))
      }
    }
    await db.query(
      `INSERT INTO message_logs (tenant_id, phone, message_type, status, twilio_sid, created_at)
       VALUES ${filas.join(',')}`,
      params
    )

    expect((await lineBudget(t.id)).reserve).toBe(70)
  })

  it('lanza si el tenant no existe', async () => {
    await expect(lineBudget('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      /tenant_no_encontrado/
    )
  })
})
