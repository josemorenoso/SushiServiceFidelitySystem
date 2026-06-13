/**
 * Redemption Service — Tracking de redención física de premios.
 *
 * Registra cuándo un cliente reclama FÍSICAMENTE su premio en el local
 * (el mesero entrega la bebida/plato). Permite cuadrar con el POS, analizar
 * turnos por hora y prevenir redenciones duplicadas.
 *
 * Ref: docs/features/redemption-tracking.md
 */

import { createClient } from '@supabase/supabase-js'
import type { RewardRedemption, RedemptionSource } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

// ═══════════════════════════════════════════════════════════════
// Registro de redención
// ═══════════════════════════════════════════════════════════════

export interface RecordRedemptionParams {
  customerId: string
  mysteryBoxResultId?: string | null
  tierId: string
  prizeTitle: string
  source?: RedemptionSource
  redeemedByStaffId?: string | null
  tableNumber?: number | null
  notes?: string | null
  posReference?: string | null
}

export type RecordRedemptionResult =
  | { ok: true; redemption: RewardRedemption }
  | { ok: false; error: string; code: 'already_redeemed' | 'db_error' | 'invalid_result' }

/**
 * Registra una redención física. El trigger de DB marca el mystery_box_results
 * como `redeemed=true`. El índice único parcial previene duplicados a nivel de DB.
 */
export async function recordRedemption(
  params: RecordRedemptionParams
): Promise<RecordRedemptionResult> {
  const supabase = getServiceClient()

  // Si viene atado a un resultado de mystery box, validar que no esté ya redimido.
  if (params.mysteryBoxResultId) {
    const { data: mbr, error: mbrErr } = await supabase
      .from('mystery_box_results')
      .select('id, customer_id, prize_title, redeemed')
      .eq('id', params.mysteryBoxResultId)
      .maybeSingle()

    if (mbrErr) {
      return { ok: false, error: mbrErr.message, code: 'db_error' }
    }
    if (!mbr || mbr.customer_id !== params.customerId) {
      return { ok: false, error: 'El premio no pertenece a este cliente', code: 'invalid_result' }
    }
    if (mbr.redeemed) {
      return { ok: false, error: 'Este premio ya fue entregado', code: 'already_redeemed' }
    }
  }

  const { data, error } = await supabase
    .from('reward_redemptions')
    .insert({
      customer_id: params.customerId,
      mystery_box_result_id: params.mysteryBoxResultId ?? null,
      tier_id: params.tierId,
      prize_title: params.prizeTitle,
      source: params.source ?? 'mystery_box',
      redeemed_by_staff_id: params.redeemedByStaffId ?? null,
      table_number: params.tableNumber ?? null,
      notes: params.notes ?? null,
      pos_reference: params.posReference ?? null,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation → el premio ya se redimió (carrera entre dos meseros).
    if (error.code === '23505') {
      return { ok: false, error: 'Este premio ya fue entregado', code: 'already_redeemed' }
    }
    return { ok: false, error: error.message, code: 'db_error' }
  }

  return { ok: true, redemption: data as RewardRedemption }
}

// ═══════════════════════════════════════════════════════════════
// Premio pendiente (para alerta del mesero / polling del cliente)
// ═══════════════════════════════════════════════════════════════

export interface PendingReward {
  mystery_box_result_id: string
  tier_id: string
  prize_title: string
  choice: 'safe' | 'mystery'
  created_at: string
}

/**
 * Devuelve el premio NO redimido más reciente del cliente (si existe).
 * Se usa para alertar al mesero y para el polling del cliente.
 */
export async function getPendingReward(customerId: string): Promise<PendingReward | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('mystery_box_results')
    .select('id, tier_id, prize_title, choice, created_at')
    .eq('customer_id', customerId)
    .eq('redeemed', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null

  const r = data[0]
  return {
    mystery_box_result_id: r.id,
    tier_id: r.tier_id,
    prize_title: r.prize_title,
    choice: r.choice as 'safe' | 'mystery',
    created_at: r.created_at,
  }
}

export async function hasPendingReward(customerId: string): Promise<boolean> {
  return (await getPendingReward(customerId)) !== null
}

// ═══════════════════════════════════════════════════════════════
// Listado con filtros (dashboard admin)
// ═══════════════════════════════════════════════════════════════

export interface RedemptionFilters {
  from?: string
  to?: string
  staffId?: string
  tierId?: string
  prizeTitle?: string
  page?: number
  limit?: number
}

export interface RedemptionRow extends RewardRedemption {
  customer_name: string | null
  customer_phone: string | null
  staff_name: string | null
}

export interface RedemptionListResult {
  redemptions: RedemptionRow[]
  total: number
  page: number
  limit: number
}

export async function getRedemptions(filters: RedemptionFilters): Promise<RedemptionListResult> {
  const supabase = getServiceClient()
  const page = filters.page && filters.page > 0 ? filters.page : 1
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 25
  const fromIdx = (page - 1) * limit
  const toIdx = fromIdx + limit - 1

  let query = supabase
    .from('reward_redemptions')
    .select(
      'id, customer_id, mystery_box_result_id, tier_id, prize_title, source, redeemed_at, redeemed_by_staff_id, table_number, notes, pos_reference, created_at, customers(name, phone), staff_users(name)',
      { count: 'exact' }
    )
    .order('redeemed_at', { ascending: false })

  if (filters.from) query = query.gte('redeemed_at', filters.from)
  if (filters.to) query = query.lte('redeemed_at', filters.to)
  if (filters.staffId) query = query.eq('redeemed_by_staff_id', filters.staffId)
  if (filters.tierId) query = query.eq('tier_id', filters.tierId)
  if (filters.prizeTitle) query = query.eq('prize_title', filters.prizeTitle)

  const { data, error, count } = await query.range(fromIdx, toIdx)

  if (error) {
    throw new Error(`Error obteniendo redenciones: ${error.message}`)
  }

  const redemptions: RedemptionRow[] = (data ?? []).map((row) => {
    // Supabase devuelve joins embebidos como objeto (uno-a-uno) o array.
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
    const staff = Array.isArray(row.staff_users) ? row.staff_users[0] : row.staff_users
    return {
      id: row.id,
      customer_id: row.customer_id,
      mystery_box_result_id: row.mystery_box_result_id,
      tier_id: row.tier_id,
      prize_title: row.prize_title,
      source: row.source as RedemptionSource,
      redeemed_at: row.redeemed_at,
      redeemed_by_staff_id: row.redeemed_by_staff_id,
      table_number: row.table_number,
      notes: row.notes,
      pos_reference: row.pos_reference,
      created_at: row.created_at,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      staff_name: staff?.name ?? null,
    }
  })

  return { redemptions, total: count ?? 0, page, limit }
}

/**
 * Historial de redenciones de un cliente (para el Customer Detail Dialog).
 */
export async function getCustomerRedemptions(customerId: string): Promise<RewardRedemption[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*')
    .eq('customer_id', customerId)
    .order('redeemed_at', { ascending: false })

  if (error) {
    console.error('[Redemption] Error historial cliente:', error.message)
    return []
  }
  return (data ?? []) as RewardRedemption[]
}

// ═══════════════════════════════════════════════════════════════
// Resumen agrupado (cuadrar con POS)
// ═══════════════════════════════════════════════════════════════

export interface RedemptionSummary {
  total_redemptions: number
  by_prize: { prize_title: string; count: number }[]
  by_hour: { hour: number; count: number }[]
  by_staff: { staff_id: string | null; staff_name: string | null; count: number }[]
}

export async function getRedemptionSummary(params: {
  from?: string
  to?: string
}): Promise<RedemptionSummary> {
  const supabase = getServiceClient()

  let query = supabase
    .from('reward_redemptions')
    .select('prize_title, redeemed_at, redeemed_by_staff_id, staff_users(name)')

  if (params.from) query = query.gte('redeemed_at', params.from)
  if (params.to) query = query.lte('redeemed_at', params.to)

  const { data, error } = await query

  if (error) {
    throw new Error(`Error obteniendo resumen: ${error.message}`)
  }

  const rows = data ?? []
  const byPrize = new Map<string, number>()
  const byHour = new Map<number, number>()
  const byStaff = new Map<string, { name: string | null; count: number }>()

  for (const row of rows) {
    byPrize.set(row.prize_title, (byPrize.get(row.prize_title) ?? 0) + 1)

    const hour = new Date(row.redeemed_at).getHours()
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1)

    const staffKey = row.redeemed_by_staff_id ?? 'unassigned'
    const staff = Array.isArray(row.staff_users) ? row.staff_users[0] : row.staff_users
    const existing = byStaff.get(staffKey)
    byStaff.set(staffKey, {
      name: staff?.name ?? null,
      count: (existing?.count ?? 0) + 1,
    })
  }

  return {
    total_redemptions: rows.length,
    by_prize: [...byPrize.entries()]
      .map(([prize_title, count]) => ({ prize_title, count }))
      .sort((a, b) => b.count - a.count),
    by_hour: [...byHour.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour),
    by_staff: [...byStaff.entries()]
      .map(([staff_id, v]) => ({
        staff_id: staff_id === 'unassigned' ? null : staff_id,
        staff_name: v.name,
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count),
  }
}
