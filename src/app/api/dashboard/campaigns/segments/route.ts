import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  FREQUENCY_CAP_DAYS,
  RECOVERY_ZONE_START_DAYS,
  RECOVERY_ZONE_END_DAYS,
} from '@/constants/rewards'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const db = getServiceClient()

    const capCutoff = daysAgo(FREQUENCY_CAP_DAYS)
    const activeStart = daysAgo(RECOVERY_ZONE_START_DAYS)       // 18d ago
    const recoveryEnd = daysAgo(RECOVERY_ZONE_START_DAYS)       // 18d ago
    const recoveryStart = daysAgo(RECOVERY_ZONE_END_DAYS)       // 25d ago
    const lostCutoff = daysAgo(RECOVERY_ZONE_END_DAYS)          // 25d ago

    const base = db.from('customers').select('id', { count: 'exact', head: true }).eq('accepts_marketing', true)

    // Activos: visitaron hace menos de 18d (fuera de recovery zone)
    const [{ count: activeCount }, { count: recoveryCount }, { count: lostCount }, { count: capCount }] =
      await Promise.all([
        base
          .gte('last_visit_at', activeStart)
          .or(`last_campaign_at.is.null,last_campaign_at.lt.${capCutoff}`),

        // Recovery zone: entre 18 y 25d sin visitar
        base
          .lt('last_visit_at', recoveryEnd)
          .gte('last_visit_at', recoveryStart),

        // Perdidos: más de 25d sin visitar (disponibles para campaña agresiva)
        base
          .lt('last_visit_at', lostCutoff)
          .or(`last_campaign_at.is.null,last_campaign_at.lt.${capCutoff}`),

        // En cap: contactados en los últimos 7d (no pueden recibir nada)
        base.gte('last_campaign_at', capCutoff),
      ])

    return NextResponse.json({
      active: activeCount ?? 0,        // 0-18d: disponibles para campaña manual
      recovery: recoveryCount ?? 0,    // 18-25d: reservados para cron reactivación
      lost: lostCount ?? 0,            // 25+d: disponibles para oferta agresiva
      inCap: capCount ?? 0,            // <7d contactados: en espera
    })
  } catch (error) {
    console.error('[CampaignSegments]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
