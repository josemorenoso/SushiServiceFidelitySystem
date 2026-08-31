/**
 * Utilidades compartidas por las pruebas que hablan con Postgres.
 *
 * Cada prueba crea su PROPIO tenant desechable y lo borra al terminar. No se
 * comparte estado entre pruebas: `send_reservations`, `send_queue`,
 * `line_health_snapshots` y `consent_events` tienen
 * `ON DELETE CASCADE` sobre `tenants(id)` (00037:107, :128, :167, :184), así
 * que borrar el tenant limpia todo su rastro de una sola vez.
 */

import { Pool } from 'pg'
import { inject } from 'vitest'

let pool: Pool | null = null

/** Pool compartido. `max` alto a propósito: las pruebas de concurrencia
 *  necesitan que 20 llamadas simultáneas tengan 20 conexiones de verdad, no
 *  una cola de 5 que las serialice y haga pasar la prueba por la razón
 *  equivocada. */
export function getPool(): Pool {
  if (!pool) {
    const { connectionString } = inject('postgres')
    pool = new Pool({ connectionString, max: 30 })
  }
  return pool
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = null
}

export interface TestTenantOptions {
  /** `tenants.messaging_daily_limit`. `null` = límite desconocido (el estado de
   *  los tenants anteriores a 00037: se contabiliza pero no se bloquea). */
  messagingDailyLimit?: number | null
  /** `admin_settings.transactional_reserve_floor` (default del producto: 70). */
  reserveFloor?: number
  /** `admin_settings.reserve_max_pct` (default del producto: 50). */
  reserveMaxPct?: number
  /** `admin_settings.reserve_safety_factor` (default del producto: 1.3). */
  reserveSafetyFactor?: number
  lineStatus?: 'active' | 'throttled' | 'frozen'
  qualityRating?: 'green' | 'yellow' | 'red' | 'unknown'
  messagingProvider?: 'twilio' | 'zernio'
}

export interface TestTenant {
  id: string
  slug: string
}

/**
 * Crea un tenant desechable.
 *
 * Sobre calibrar el presupuesto: con un tenant nuevo no hay `message_logs`, así
 * que el p95 transaccional es 0 (COALESCE de 00037:272) y la fórmula de
 * 00037:285-289 se reduce a
 *
 *     reserva            = LEAST(reserveFloor, floor(limite * reserveMaxPct/100))
 *     presupuesto_campana = limite - reserva
 *
 * Para obtener un presupuesto de campaña de exactamente 10 basta con
 * `{ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 }`.
 */
export async function createTestTenant(opts: TestTenantOptions = {}): Promise<TestTenant> {
  const {
    messagingDailyLimit = 250,
    reserveFloor,
    reserveMaxPct,
    reserveSafetyFactor,
    lineStatus = 'active',
    qualityRating = 'unknown',
    messagingProvider = 'twilio',
  } = opts

  const db = getPool()
  // `slug` es UNIQUE; el sufijo aleatorio evita choques entre archivos de prueba
  // que corren en procesos distintos (pool: 'forks').
  const slug = `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, messaging_daily_limit, line_status, quality_rating, messaging_provider)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [slug, `Tenant de prueba ${slug}`, messagingDailyLimit, lineStatus, qualityRating, messagingProvider]
  )
  const id = rows[0].id

  const settings: Array<[string, string]> = []
  if (reserveFloor !== undefined) settings.push(['transactional_reserve_floor', String(reserveFloor)])
  if (reserveMaxPct !== undefined) settings.push(['reserve_max_pct', String(reserveMaxPct)])
  if (reserveSafetyFactor !== undefined) settings.push(['reserve_safety_factor', String(reserveSafetyFactor)])

  for (const [key, value] of settings) {
    await db.query(
      `INSERT INTO admin_settings (key, value, tenant_id) VALUES ($1, $2, $3)
       ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value`,
      [key, value, id]
    )
  }

  return { id, slug }
}

/** Borra el tenant. El CASCADE de 00037 arrastra reservas, cola, snapshots y consentimientos. */
export async function dropTestTenant(tenantId: string): Promise<void> {
  const db = getPool()
  // admin_settings y las 18 tablas de 00025 usan ON DELETE RESTRICT, así que
  // hay que vaciar a mano lo que hayamos sembrado antes de borrar el tenant.
  //
  // ORDEN OBLIGATORIO: tenant_wallet_transactions va PRIMERO. Insertar un
  // message_log con twilio_sid no nulo dispara `debit_wallet_on_message_sent()`
  // (trigger de 00033:125-129), que crea una fila de débito referenciando ese
  // log. Borrar el tenant sin limpiarla antes falla con el RESTRICT de
  // tenant_wallet_transactions_tenant_id_fkey — que es justamente lo que pasó
  // la primera vez que corrió esta suite.
  await db.query('DELETE FROM tenant_wallet_transactions WHERE tenant_id = $1', [tenantId])
  await db.query('DELETE FROM send_reservations          WHERE tenant_id = $1', [tenantId])
  await db.query('DELETE FROM send_queue                 WHERE tenant_id = $1', [tenantId])
  await db.query('DELETE FROM admin_settings             WHERE tenant_id = $1', [tenantId])
  await db.query('DELETE FROM message_logs               WHERE tenant_id = $1', [tenantId])
  await db.query('DELETE FROM campaigns                  WHERE tenant_id = $1', [tenantId])
  await db.query('DELETE FROM customers                  WHERE tenant_id = $1', [tenantId])
  await db.query('DELETE FROM tenants                    WHERE id = $1', [tenantId])
}

export interface ReservationResult {
  granted: boolean
  free?: boolean
  enforced?: boolean
  reservation_id?: string
  reason?: string
}

/** Llama `reserve_send_slot()` en su PROPIA conexión, tal como lo hace cada RPC
 *  de supabase-js en producción (una transacción por llamada). */
export async function reserveSlot(
  tenantId: string,
  phone: string,
  messageClass: 'transactional' | 'campaign'
): Promise<ReservationResult> {
  const db = getPool()
  const { rows } = await db.query<{ reserve_send_slot: ReservationResult }>(
    'SELECT reserve_send_slot($1, $2, $3)',
    [tenantId, phone, messageClass]
  )
  return rows[0].reserve_send_slot
}

export interface LineBudget {
  enforced: boolean
  limit: number | null
  used_24h: number
  reserve: number | null
  campaign_budget: number | null
  campaign_available: number | null
  transactional_available: number | null
  quality_rating: string
  line_status: string
}

export async function lineBudget(tenantId: string): Promise<LineBudget> {
  const db = getPool()
  const { rows } = await db.query<{ line_budget: LineBudget }>('SELECT line_budget($1)', [tenantId])
  return rows[0].line_budget
}

/** Teléfonos distintos y estables por índice. Meta cuenta destinatarios ÚNICOS,
 *  así que la diferencia entre "20 teléfonos" y "1 teléfono 20 veces" es
 *  justamente lo que varias pruebas miden. */
export function phoneAt(i: number): string {
  return `+5730${String(i).padStart(8, '0')}`
}
