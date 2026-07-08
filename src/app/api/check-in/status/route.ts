import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone } from '@/services/customer.service'
import { getNextTier, getAllTiers } from '@/services/reward-tiers.service'
import { getPendingReward } from '@/services/redemption.service'
import { rateLimit } from '@/lib/rate-limit'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getTenantByDomain } from '@/lib/tenant'

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

    // ─── RESOLVER TENANT POR DOMINIO ───
    const host = request.headers.get('host')
    const tenant = await getTenantByDomain(host)
    if (!tenant) {
      return NextResponse.json(
        { error: 'Restaurante no reconocido' },
        { status: 404 }
      )
    }

    // ─── RATE LIMITING por TELÉFONO (anti-enumeración) ───
    // Endpoint público que devuelve nombre/puntos/visitas por número. El celular
    // del cliente lo consulta cada 5s (~12/min) esperando al mesero, así que 40/min
    // le sobra. Limitamos por teléfono (no por IP) para NO afectar a varios clientes
    // que comparten el WiFi del local o el NAT del operador móvil.
    // (auditoría 18-Junio, ME-05/AL-08).
    const rl = rateLimit(`checkin-status:${cleaned}`, 40, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes', retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    const customer = await findCustomerByPhone(cleaned, tenant.id)
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
    //
    // ANTI-RACE (bug prod): el POST /api/check-in crea la VISITA antes de escribir
    // la transacción de puntos. Si este polling detecta la visita en ese hueco de
    // milisegundos (ensanchado por las queries .eq('tenant_id') + RLS del multitenant),
    // devolvería points_awarded=0 y el cliente saltaría a "0 puntos ganados" con el
    // valor congelado. Por eso NO señalamos hasRecentVisit hasta que la transacción
    // ya exista (pointsReady). Ver `docs/features/staff-qr-scan.md` — Bug 6.
    let pointsAwarded = 0
    let pointsReady = false
    if (recentVisit) {
      const { data: tx } = await supabase
        .from('point_transactions')
        .select('points')
        .eq('reference_id', recentVisit.id)
        .in('source', ['visit_staff', 'visit_qr', 'visit_delivery'])
        .order('created_at', { ascending: false })
        .limit(1)
      if (tx && tx.length > 0) {
        pointsAwarded = tx[0].points
        pointsReady = true
      }
    }

    // El cliente transiciona a la pantalla de éxito con `hasRecentVisit`. No lo
    // activamos hasta que los puntos estén escritos (pointsReady), con un fallback
    // por antigüedad de la visita (>8s) como red de seguridad: si el sistema de
    // puntos está apagado o el insert falló de verdad, igual dejamos avanzar al
    // cliente en vez de dejarlo atrapado en el QR para siempre.
    const visitAgeMs = recentVisit
      ? Date.now() - new Date(recentVisit.created_at).getTime()
      : 0
    const visitReady = !!recentVisit && (pointsReady || visitAgeMs > 8000)

    // Evaluar tier
    const totalPoints = customer.total_points ?? 0
    const nextTierInfo = await getNextTier(totalPoints, tenant.id)

    // Obtener todos los tiers (activos, ordenados asc) para el roadmap
    const allTiers = await getAllTiers(tenant.id)

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

    // ─── Premio pendiente de entrega física (Feature A — redemption tracking) ───
    // Si el cliente ya eligió premio (mystery_box_results) pero el mesero aún no lo
    // entregó (redeemed=false), lo exponemos para que la pantalla del mesero muestre
    // la alerta "CLIENTE TIENE PREMIO PENDIENTE".
    const pendingReward = await getPendingReward(customer.id, tenant.id)

    return NextResponse.json({
      found: true,
      hasRecentVisit: visitReady,
      customer: {
        id: customer.id,
        name: customer.name || 'Cliente',
        total_visits: customer.total_visits ?? 0,
        total_points: totalPoints,
      },
      points_awarded: pointsAwarded,
      tier_unlocked: tierUnlocked,
      pending_reward: pendingReward,
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
