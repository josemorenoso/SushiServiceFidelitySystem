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

    // Buscar transacción de puntos de esa visita
    let pointsAwarded = 0
    if (recentVisit) {
      const { data: tx } = await supabase
        .from('point_transactions')
        .select('points')
        .eq('visit_id', recentVisit.id)
        .eq('type', 'visit')
        .single()
      if (tx) pointsAwarded = tx.points
    }

    // Evaluar tier
    const totalPoints = customer.total_points ?? 0
    const nextTierInfo = await getNextTier(totalPoints)

    // Obtener todos los tiers para el roadmap
    const allTiers = await getAllTiers()

    return NextResponse.json({
      found: true,
      hasRecentVisit: !!recentVisit,
      customer: {
        name: customer.name || 'Cliente',
        total_visits: customer.total_visits ?? 0,
        total_points: totalPoints,
      },
      points_awarded: pointsAwarded,
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
