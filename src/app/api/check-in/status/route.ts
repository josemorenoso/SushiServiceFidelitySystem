import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone } from '@/services/customer.service'
import { getNextTier, getAllTiers } from '@/services/reward-tiers.service'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json(
        { error: 'Se requiere phone' },
        { status: 400 }
      )
    }

    const { valid, cleaned } = validatePhone(phone)
    if (!valid) {
      return NextResponse.json(
        { error: 'Teléfono inválido' },
        { status: 400 }
      )
    }

    const customer = await findCustomerByPhone(cleaned)
    if (!customer) {
      return NextResponse.json({ found: false })
    }

    const supabase = getServiceClient()

    // Buscar la visita más reciente registrada por un mesero (últimos 30 minutos)
    // Solo source='staff_scan' — las visitas de bienvenida (source='qr') no deben activar el polling
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: visits } = await supabase
      .from('visits')
      .select('id, created_at, source, table_number')
      .eq('customer_id', customer.id)
      .eq('source', 'staff_scan')
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)

    const recentVisit = visits && visits.length > 0 ? visits[0] : null

    // Buscar transacción de puntos de esa visita.
    // La tabla point_transactions usa `reference_id` (id de la visita) y `source`
    // ('visit_staff' | 'visit_qr' | 'visit_delivery'), NO 'visit_id'/'type'.
    let pointsAwarded = 0
    if (recentVisit) {
      const { data: tx } = await supabase
        .from('point_transactions')
        .select('points')
        .eq('reference_id', recentVisit.id)
        .in('source', ['visit_staff', 'visit_qr', 'visit_delivery'])
        .order('created_at', { ascending: false })
        .limit(1)
      if (tx && tx.length > 0) pointsAwarded = tx[0].points
    }

    // Evaluar tier
    const totalPoints = customer.total_points ?? 0
    const nextTierInfo = await getNextTier(totalPoints)

    // Obtener todos los tiers (activos, ordenados asc) para el roadmap
    const allTiers = await getAllTiers()

    // ─── Detectar tier desbloqueado NO reclamado ───
    // El cruce de tier ocurre en el request del mesero (POST /api/check-in), pero la
    // elección de premio sucede en el celular del cliente vía este polling.
    // Buscamos el tier de mayor umbral que el cliente ya superó y para el que aún NO
    // existe un mystery_box_results (no reclamado). Esto también auto-recupera unlocks
    // que se hayan perdido en visitas anteriores.
    let tierUnlocked: {
      id: string
      name: string
      safe_reward: string
      mystery_box_enabled: boolean
      mystery_prizes: unknown
      is_black: boolean
    } | null = null

    const qualifiedTiers = allTiers.filter((t) => totalPoints >= t.point_threshold)
    if (qualifiedTiers.length > 0) {
      const { data: claimed } = await supabase
        .from('mystery_box_results')
        .select('tier_id')
        .eq('customer_id', customer.id)
      const claimedTierIds = new Set((claimed ?? []).map((r) => r.tier_id))

      // De mayor a menor umbral, el primero no reclamado
      const unclaimed = [...qualifiedTiers].reverse().find((t) => !claimedTierIds.has(t.id))
      if (unclaimed) {
        tierUnlocked = {
          id: unclaimed.id,
          name: unclaimed.tier_name,
          safe_reward: unclaimed.safe_reward_title,
          mystery_box_enabled: unclaimed.mystery_box_enabled,
          mystery_prizes: unclaimed.mystery_prizes,
          is_black: unclaimed.is_black,
        }
      }
    }

    return NextResponse.json({
      found: true,
      hasRecentVisit: !!recentVisit,
      customer: {
        name: customer.name || 'Cliente',
        total_visits: customer.total_visits ?? 0,
        total_points: totalPoints,
      },
      points_awarded: pointsAwarded,
      tier_unlocked: tierUnlocked,
      next_tier: nextTierInfo ? {
        name: nextTierInfo.tier.tier_name,
        points_remaining: nextTierInfo.pointsRemaining,
        threshold: nextTierInfo.tier.point_threshold,
      } : null,
      tiers: allTiers,
    })
  } catch (error) {
    console.error('[CheckInStatus] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    )
  }
}
