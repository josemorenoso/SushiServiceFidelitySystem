/**
 * Wallet Service — billetera prepagada por tenant (COP).
 *
 * El ledger vive en `tenant_wallet_transactions`: las entradas (topup) son
 * positivas, los consumos (debit, insertados por el trigger de la 00033) son
 * negativos. El saldo es SUM(amount_cop) — la función SQL
 * tenant_wallet_balance_cop() ya lo calcula. Los "mensajes disponibles" se
 * derivan del saldo y la tarifa; nunca se almacenan (spec W-D1).
 *
 * Este servicio NO inserta débitos: eso lo hace el trigger de Postgres, en la
 * misma transacción que el message_log, para que jamás diverjan (spec W-D2).
 * Aquí solo se registran ENTRADAS (recargas/ajustes) y se LEE el estado.
 *
 * Ref: docs/features/wallet-billing.md
 *      docs/superpowers/specs/2026-07-13-wallet-billing-design.md
 */

import { createClient } from '@supabase/supabase-js'
import { DEFAULT_PRICE_PER_MESSAGE_COP } from '@/constants/wallet'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export type WalletTxnType = 'topup' | 'adjustment' | 'refund' | 'debit'
export type WalletTxnSource = 'manual' | 'wompi' | 'system'

export interface WalletTransaction {
  id: string
  tenant_id: string
  type: WalletTxnType
  amount_cop: number
  unit_price_cop: number | null
  quantity: number | null
  message_log_id: string | null
  source: WalletTxnSource | null
  external_ref: string | null
  notes: string | null
  created_by: string
  created_at: string
}

/** Saldo COP actual del tenant (suma del ledger). Puede ser negativo. */
export async function getBalanceCop(tenantId: string): Promise<number> {
  const db = getServiceClient()
  const { data, error } = await db.rpc('tenant_wallet_balance_cop', { p_tenant_id: tenantId })
  if (error) {
    console.error('[Wallet] getBalanceCop:', error.message)
    return 0
  }
  return Number(data ?? 0)
}

/** Tarifa del tenant (COP/mensaje). Fallback al default si la fila no existe. */
export async function getPricePerMessage(tenantId: string): Promise<number> {
  const db = getServiceClient()
  const { data } = await db
    .from('tenants')
    .select('price_per_message_cop')
    .eq('id', tenantId)
    .single()
  const n = Number(data?.price_per_message_cop)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRICE_PER_MESSAGE_COP
}

/** Mensajes que el tenant todavía puede enviar (saldo ÷ tarifa, piso 0). */
export async function getMessagesAvailable(tenantId: string): Promise<number> {
  const db = getServiceClient()
  const { data, error } = await db.rpc('tenant_messages_available', { p_tenant_id: tenantId })
  if (error) {
    // Fallback si la RPC no existe aún (migración sin aplicar): calcular en código.
    const [balance, price] = await Promise.all([
      getBalanceCop(tenantId),
      getPricePerMessage(tenantId),
    ])
    return Math.max(0, Math.floor(balance / price))
  }
  return Number(data ?? 0)
}

export interface BulkSendCheck {
  ok: boolean
  balanceCop: number
  pricePerMessage: number
  messagesAvailable: number
  needed: number
  /** COP que faltan para cubrir el envío. 0 si alcanza. */
  shortfallCop: number
}

/**
 * ¿Alcanza el saldo para un envío masivo de `count` mensajes? (spec W-D6).
 * Se llama ANTES de disparar campañas y Golden Bullet. Los transaccionales
 * (bienvenida, check-in, premio) NO llaman esto: siempre salen.
 */
export async function canSendBulk(tenantId: string, count: number): Promise<BulkSendCheck> {
  const [balanceCop, pricePerMessage] = await Promise.all([
    getBalanceCop(tenantId),
    getPricePerMessage(tenantId),
  ])
  const messagesAvailable = Math.max(0, Math.floor(balanceCop / pricePerMessage))
  const neededCop = count * pricePerMessage
  const shortfallCop = Math.max(0, neededCop - balanceCop)
  return {
    ok: count <= messagesAvailable,
    balanceCop,
    pricePerMessage,
    messagesAvailable,
    needed: count,
    shortfallCop,
  }
}

export interface RecordTopupParams {
  tenantId: string
  amountCop: number
  source: WalletTxnSource
  createdBy: string
  type?: Extract<WalletTxnType, 'topup' | 'adjustment' | 'refund'>
  externalRef?: string | null
  notes?: string | null
}

export interface RecordTopupResult {
  ok: boolean
  transaction?: WalletTransaction
  /** 'duplicate' si el external_ref ya existía (idempotencia). */
  error?: 'duplicate' | 'db_error'
  message?: string
}

/**
 * Registra una ENTRADA de saldo (recarga manual, ajuste, reembolso o pago Wompi)
 * y limpia el anti-spam del aviso de saldo bajo para poder volver a avisar.
 * Idempotente por (source, external_ref): un pago no se acredita dos veces.
 */
export async function recordTopup(params: RecordTopupParams): Promise<RecordTopupResult> {
  const { tenantId, amountCop, source, createdBy, type = 'topup', externalRef = null, notes = null } = params
  const db = getServiceClient()

  const { data, error } = await db
    .from('tenant_wallet_transactions')
    .insert({
      tenant_id: tenantId,
      type,
      amount_cop: amountCop,
      source,
      external_ref: externalRef,
      notes,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation → el external_ref ya se acreditó.
    if (error.code === '23505') {
      return { ok: false, error: 'duplicate', message: 'Este pago ya fue registrado.' }
    }
    console.error('[Wallet] recordTopup:', error.message)
    return { ok: false, error: 'db_error', message: error.message }
  }

  // Recargó → resetear el anti-spam del aviso (best-effort).
  await db
    .from('tenants')
    .update({ low_balance_notified_at: null })
    .eq('id', tenantId)

  return { ok: true, transaction: data as WalletTransaction }
}

/** Últimos movimientos del tenant (recargas y consumos), más recientes primero. */
export async function listTransactions(
  tenantId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<WalletTransaction[]> {
  const { limit = 20, offset = 0 } = opts
  const db = getServiceClient()
  const { data, error } = await db
    .from('tenant_wallet_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) {
    console.error('[Wallet] listTransactions:', error.message)
    return []
  }
  return (data ?? []) as WalletTransaction[]
}

/** COP consumidos por el tenant en el mes calendario actual (débitos). */
export async function getMonthSpendCop(tenantId: string): Promise<number> {
  const db = getServiceClient()
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const { data, error } = await db
    .from('tenant_wallet_transactions')
    .select('amount_cop')
    .eq('tenant_id', tenantId)
    .eq('type', 'debit')
    .gte('created_at', startOfMonth.toISOString())
  if (error) {
    console.error('[Wallet] getMonthSpendCop:', error.message)
    return 0
  }
  return (data ?? []).reduce((sum, r) => sum + Math.abs(Number(r.amount_cop)), 0)
}

export interface WalletSummary {
  balanceCop: number
  pricePerMessage: number
  messagesAvailable: number
  monthSpendCop: number
  transactions: WalletTransaction[]
}

/** Resumen para la tarjeta de billetera del tenant (un solo objeto). */
export async function getWalletSummary(tenantId: string): Promise<WalletSummary> {
  const [balanceCop, pricePerMessage, monthSpendCop, transactions] = await Promise.all([
    getBalanceCop(tenantId),
    getPricePerMessage(tenantId),
    getMonthSpendCop(tenantId),
    listTransactions(tenantId, { limit: 10 }),
  ])
  const messagesAvailable = Math.max(0, Math.floor(balanceCop / pricePerMessage))
  return { balanceCop, pricePerMessage, messagesAvailable, monthSpendCop, transactions }
}

export interface TenantWalletRow {
  tenantId: string
  name: string
  slug: string
  isActive: boolean
  pricePerMessage: number
  balanceCop: number
  messagesAvailable: number
  monthSpendCop: number
  lastTopupAt: string | null
}

/**
 * Estado de la billetera de TODOS los tenants — panel del super-admin.
 * Es donde el operador ve quién le debe y quién está por quedarse sin saldo.
 * N tenants ⇒ N lecturas de saldo; el número de tenants es pequeño (un puñado
 * de negocios), así que se mantiene simple.
 */
export async function listTenantWallets(): Promise<TenantWalletRow[]> {
  const db = getServiceClient()
  const { data: tenants, error } = await db
    .from('tenants')
    .select('id, name, slug, is_active, price_per_message_cop')
    .order('name', { ascending: true })
  if (error || !tenants) {
    console.error('[Wallet] listTenantWallets:', error?.message)
    return []
  }

  return Promise.all(
    tenants.map(async (t) => {
      const price = Number(t.price_per_message_cop) > 0
        ? Number(t.price_per_message_cop)
        : DEFAULT_PRICE_PER_MESSAGE_COP
      const [balanceCop, monthSpendCop, lastTopup] = await Promise.all([
        getBalanceCop(t.id),
        getMonthSpendCop(t.id),
        db
          .from('tenant_wallet_transactions')
          .select('created_at')
          .eq('tenant_id', t.id)
          .in('type', ['topup', 'adjustment', 'refund'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      return {
        tenantId: t.id,
        name: t.name,
        slug: t.slug,
        isActive: Boolean(t.is_active),
        pricePerMessage: price,
        balanceCop,
        messagesAvailable: Math.max(0, Math.floor(balanceCop / price)),
        monthSpendCop,
        lastTopupAt: (lastTopup.data?.created_at as string | undefined) ?? null,
      }
    })
  )
}
