/**
 * La cola de goteo — funciones SQL del Bloque 2.
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.4 y §9
 * Migración: 00038_send_queue_drain.sql
 *
 * Aquí se prueba la CAPA SQL (encolar, reclamar, vencer, round-robin). La
 * lógica de negocio del drenador —re-evaluar guardas, efectos posteriores—
 * vive en la ruta y necesita el cliente de Supabase y el proveedor de
 * mensajería, así que no se cubre desde aquí.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, phoneAt } from '../setup/db'

interface FilaCola {
  id: string
  phone: string
  status: string
  priority: number
  attempts: number
  claimed_at: string | null
  message_type: string
}

/** Encola vía la función SQL real, igual que hace enqueueSendBatch(). */
async function encolar(
  items: Array<{
    tenantId: string
    phone: string
    messageType?: string
    priority?: number
    campaignId?: string | null
    expiresAt?: string | null
    notBefore?: string | null
  }>
): Promise<number> {
  const payload = items.map((i) => ({
    tenant_id: i.tenantId,
    phone: i.phone,
    message_type: i.messageType ?? 'manual',
    priority: i.priority ?? 3,
    template_sid: 'HX_test',
    variables: {},
    campaign_id: i.campaignId ?? null,
    expires_at: i.expiresAt ?? null,
    not_before: i.notBefore ?? null,
  }))
  const { rows } = await getPool().query<{ enqueue_send_queue: number }>(
    'SELECT enqueue_send_queue($1::jsonb)',
    [JSON.stringify(payload)]
  )
  return rows[0].enqueue_send_queue
}

async function reclamar(tenantId: string, limite: number): Promise<FilaCola[]> {
  const { rows } = await getPool().query<FilaCola>('SELECT * FROM claim_send_queue($1, $2)', [
    tenantId,
    limite,
  ])
  return rows
}

describe('cola de goteo (SQL)', () => {
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

  // ─────────────────────────────────────────────────────────────
  describe('encolado idempotente', () => {
    it('encola un lote y devuelve cuántos entraron', async () => {
      const t = await tenant()
      const n = await encolar(
        Array.from({ length: 25 }, (_, i) => ({ tenantId: t.id, phone: phoneAt(i) }))
      )
      expect(n).toBe(25)
    })

    it('el índice único impide encolar dos veces el mismo teléfono en la misma campaña', async () => {
      const t = await tenant()
      const db = getPool()
      const {
        rows: [c],
      } = await db.query<{ id: string }>(
        `INSERT INTO campaigns (name, type, message_template, tenant_id, status)
         VALUES ('Campaña de prueba', 'manual', 'HX_test', $1, 'running') RETURNING id`,
        [t.id]
      )

      expect(await encolar([{ tenantId: t.id, phone: phoneAt(1), campaignId: c.id }])).toBe(1)
      // El segundo intento no entra, y NO lanza: encolar dos veces es idempotente.
      expect(await encolar([{ tenantId: t.id, phone: phoneAt(1), campaignId: c.id }])).toBe(0)
    })

    /**
     * Este es el hueco que 00038 vino a tapar. El índice de 00037 era
     * `(tenant_id, phone, campaign_id)`, y en Postgres dos NULL nunca colisionan
     * en un índice único — así que los items encolados por un cron (sin
     * campaign_id) NO tenían anti-duplicado: dos corridas del mismo cron
     * encolaban el mismo teléfono dos veces.
     */
    it('el anti-duplicado TAMBIÉN cubre items sin campaña (campaign_id NULL)', async () => {
      const t = await tenant()
      expect(await encolar([{ tenantId: t.id, phone: phoneAt(2), messageType: 'birthday' }])).toBe(1)
      expect(await encolar([{ tenantId: t.id, phone: phoneAt(2), messageType: 'birthday' }])).toBe(0)
    })

    it('pero sí deja coexistir dos tipos de mensaje distintos para el mismo teléfono', async () => {
      const t = await tenant()
      // Un cliente puede tener a la vez en cola su cumpleaños y una campaña
      // manual: son mensajes distintos.
      expect(await encolar([{ tenantId: t.id, phone: phoneAt(3), messageType: 'birthday' }])).toBe(1)
      expect(await encolar([{ tenantId: t.id, phone: phoneAt(3), messageType: 'manual' }])).toBe(1)
    })

    it('cancelar libera el hueco para volver a encolar', async () => {
      const t = await tenant()
      await encolar([{ tenantId: t.id, phone: phoneAt(4), messageType: 'manual' }])
      expect(await encolar([{ tenantId: t.id, phone: phoneAt(4), messageType: 'manual' }])).toBe(0)

      // El índice único es parcial (WHERE status='queued'), así que sacar el
      // item de 'queued' libera la combinación.
      await getPool().query(
        `UPDATE send_queue SET status='cancelled' WHERE tenant_id=$1 AND phone=$2`,
        [t.id, phoneAt(4)]
      )
      expect(await encolar([{ tenantId: t.id, phone: phoneAt(4), messageType: 'manual' }])).toBe(1)
    })

    it('un array vacío no hace nada', async () => {
      expect(await encolar([])).toBe(0)
    })
  })

  // ─────────────────────────────────────────────────────────────
  describe('reclamo (claim)', () => {
    it('respeta el orden (priority, not_before, enqueued_at)', async () => {
      const t = await tenant()
      await encolar([
        { tenantId: t.id, phone: phoneAt(10), messageType: 'manual', priority: 3 },
        { tenantId: t.id, phone: phoneAt(11), messageType: 'birthday', priority: 1 },
        { tenantId: t.id, phone: phoneAt(12), messageType: 'reactivation', priority: 2 },
      ])

      const reclamados = await reclamar(t.id, 3)
      expect(reclamados.map((r) => r.priority)).toEqual([1, 2, 3])
    })

    it('incrementa attempts y marca claimed_at', async () => {
      const t = await tenant()
      await encolar([{ tenantId: t.id, phone: phoneAt(20) }])

      const [item] = await reclamar(t.id, 1)
      expect(item.attempts).toBe(1)
      expect(item.claimed_at).not.toBeNull()
    })

    it('no vuelve a entregar un item ya reclamado (arriendo vivo)', async () => {
      const t = await tenant()
      await encolar([{ tenantId: t.id, phone: phoneAt(21) }])

      expect(await reclamar(t.id, 10)).toHaveLength(1)
      // Sigue en 'queued', pero su arriendo está vivo: no se re-entrega.
      expect(await reclamar(t.id, 10)).toHaveLength(0)
    })

    it('un arriendo vencido se vuelve a tomar (drenador caído a mitad)', async () => {
      const t = await tenant()
      await encolar([{ tenantId: t.id, phone: phoneAt(22) }])
      await reclamar(t.id, 1)

      await getPool().query(
        `UPDATE send_queue SET claimed_at = now() - interval '20 minutes' WHERE tenant_id = $1`,
        [t.id]
      )

      const otravez = await reclamar(t.id, 1)
      expect(otravez).toHaveLength(1)
      expect(otravez[0].attempts).toBe(2)
    })

    it('no entrega items con not_before en el futuro', async () => {
      const t = await tenant()
      await encolar([
        {
          tenantId: t.id,
          phone: phoneAt(23),
          notBefore: new Date(Date.now() + 3_600_000).toISOString(),
        },
      ])
      expect(await reclamar(t.id, 10)).toHaveLength(0)
    })

    it('con limit 0 o negativo no entrega nada', async () => {
      const t = await tenant()
      await encolar([{ tenantId: t.id, phone: phoneAt(24) }])
      expect(await reclamar(t.id, 0)).toHaveLength(0)
      expect(await reclamar(t.id, -5)).toHaveLength(0)
    })

    /**
     * Dos drenadores simultáneos —n8n reintentando tras un timeout, o una
     * corrida lenta solapándose con la siguiente— NO deben enviar el mismo
     * mensaje dos veces. Lo garantiza FOR UPDATE SKIP LOCKED.
     */
    it('dos reclamos CONCURRENTES se reparten la cola sin solaparse', async () => {
      const t = await tenant()
      await encolar(Array.from({ length: 20 }, (_, i) => ({ tenantId: t.id, phone: phoneAt(30 + i) })))

      const [a, b] = await Promise.all([reclamar(t.id, 10), reclamar(t.id, 10)])

      const ids = [...a.map((r) => r.id), ...b.map((r) => r.id)]
      expect(ids).toHaveLength(20)
      // Ningún id repetido entre las dos tandas.
      expect(new Set(ids).size).toBe(20)
    })

    it('no se lleva items de otro tenant', async () => {
      const a = await tenant()
      const b = await tenant()
      await encolar([{ tenantId: a.id, phone: phoneAt(40) }])
      await encolar([{ tenantId: b.id, phone: phoneAt(41) }])

      const deA = await reclamar(a.id, 10)
      expect(deA).toHaveLength(1)
      expect(deA[0].phone).toBe(phoneAt(40))
    })
  })

  // ─────────────────────────────────────────────────────────────
  describe('vencimiento', () => {
    it('un item vencido pasa a expired y nunca se entrega', async () => {
      const t = await tenant()
      await encolar([
        {
          tenantId: t.id,
          phone: phoneAt(50),
          messageType: 'birthday',
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ])

      const { rows } = await getPool().query<{ expire_send_queue: number }>(
        'SELECT expire_send_queue()'
      )
      expect(rows[0].expire_send_queue).toBeGreaterThanOrEqual(1)

      expect(await reclamar(t.id, 10)).toHaveLength(0)

      const { rows: estado } = await getPool().query<{ status: string }>(
        'SELECT status FROM send_queue WHERE tenant_id = $1',
        [t.id]
      )
      expect(estado[0].status).toBe('expired')
    })

    it('un item con expires_at futuro NO se vence', async () => {
      const t = await tenant()
      await encolar([
        {
          tenantId: t.id,
          phone: phoneAt(51),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ])
      await getPool().query('SELECT expire_send_queue()')
      expect(await reclamar(t.id, 10)).toHaveLength(1)
    })

    it('un item sin expires_at nunca se vence', async () => {
      const t = await tenant()
      await encolar([{ tenantId: t.id, phone: phoneAt(52) }])
      await getPool().query('SELECT expire_send_queue()')
      expect(await reclamar(t.id, 10)).toHaveLength(1)
    })
  })

  // ─────────────────────────────────────────────────────────────
  describe('round-robin entre tenants', () => {
    /**
     * Spec §9: «dos tenants, uno con 5.000 en cola, el otro con 10 → el segundo
     * drena el mismo día». La función devuelve los tenants ordenados de forma
     * que el pequeño no quede detrás del grande.
     */
    it('un tenant con cola gigante no deja al pequeño fuera de la lista', async () => {
      const grande = await tenant()
      const chico = await tenant()

      await encolar(
        Array.from({ length: 200 }, (_, i) => ({ tenantId: grande.id, phone: phoneAt(60 + i) }))
      )
      await encolar(
        Array.from({ length: 5 }, (_, i) => ({ tenantId: chico.id, phone: phoneAt(500 + i) }))
      )

      const { rows } = await getPool().query<{ tenant_id: string; queued: number }>(
        'SELECT * FROM send_queue_pending_tenants()'
      )
      const ids = rows.map((r) => r.tenant_id)
      expect(ids).toContain(grande.id)
      expect(ids).toContain(chico.id)

      // A igual prioridad, el de cola más corta va primero.
      expect(ids.indexOf(chico.id)).toBeLessThan(ids.indexOf(grande.id))
    })

    it('la prioridad manda por encima del tamaño de la cola', async () => {
      const conUrgente = await tenant()
      const soloManual = await tenant()

      // Cola grande, pero urgente (P1).
      await encolar(
        Array.from({ length: 50 }, (_, i) => ({
          tenantId: conUrgente.id,
          phone: phoneAt(700 + i),
          messageType: 'birthday',
          priority: 1,
        }))
      )
      // Cola chica, pero postponible (P3).
      await encolar([{ tenantId: soloManual.id, phone: phoneAt(800), priority: 3 }])

      const { rows } = await getPool().query<{ tenant_id: string }>(
        'SELECT * FROM send_queue_pending_tenants()'
      )
      const ids = rows.map((r) => r.tenant_id)
      expect(ids.indexOf(conUrgente.id)).toBeLessThan(ids.indexOf(soloManual.id))
    })

    it('un tenant inactivo no aparece', async () => {
      const t = await tenant()
      await encolar([{ tenantId: t.id, phone: phoneAt(900) }])
      await getPool().query('UPDATE tenants SET is_active = false WHERE id = $1', [t.id])

      const { rows } = await getPool().query<{ tenant_id: string }>(
        'SELECT * FROM send_queue_pending_tenants()'
      )
      expect(rows.map((r) => r.tenant_id)).not.toContain(t.id)
    })
  })

  // ─────────────────────────────────────────────────────────────
  describe('profundidad de cola', () => {
    it('desglosa por estado', async () => {
      const t = await tenant()
      await encolar(
        Array.from({ length: 6 }, (_, i) => ({
          tenantId: t.id,
          phone: phoneAt(1000 + i),
          messageType: `tipo_${i}`,
        }))
      )
      await getPool().query(
        `UPDATE send_queue SET status='sent'      WHERE tenant_id=$1 AND phone=$2`,
        [t.id, phoneAt(1000)]
      )
      await getPool().query(
        `UPDATE send_queue SET status='failed'    WHERE tenant_id=$1 AND phone=$2`,
        [t.id, phoneAt(1001)]
      )
      await getPool().query(
        `UPDATE send_queue SET status='cancelled' WHERE tenant_id=$1 AND phone=$2`,
        [t.id, phoneAt(1002)]
      )

      const { rows } = await getPool().query<{ send_queue_depth: Record<string, number> }>(
        'SELECT send_queue_depth($1)',
        [t.id]
      )
      const d = rows[0].send_queue_depth
      expect(d.queued).toBe(3)
      expect(d.sent).toBe(1)
      expect(d.failed).toBe(1)
      expect(d.cancelled).toBe(1)
    })
  })
})
