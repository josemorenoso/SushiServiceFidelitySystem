import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { FREQUENCY_CAP_DAYS } from '@/constants/rewards'
import { getRecoveryZoneConfig } from '@/services/settings.service'

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

    const tenantId = await requireTenantId()
    const db = getServiceClient()

    // La ventana reservada al cron sale de los días que este tenant configuró en
    // Ajustes; con los defaults (21/25) son los 18-25 de siempre.
    const zone = await getRecoveryZoneConfig(tenantId)

    const capCutoff = daysAgo(FREQUENCY_CAP_DAYS)
    const activeStart = daysAgo(zone.startDays)       // inicio de la zona
    const recoveryEnd = daysAgo(zone.startDays)       // inicio de la zona
    const recoveryStart = daysAgo(zone.endDays)       // fin de la zona
    const lostCutoff = daysAgo(zone.endDays)          // fin de la zona

    const getBase = () => db.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).or('accepts_marketing.is.null,accepts_marketing.eq.true')

    // Activos: visitaron después del inicio de la zona (fuera de recovery zone)
    const [{ count: activeCount }, { count: recoveryCount }, { count: lostCount }, { count: capCount }] =
      await Promise.all([
        getBase()
          .gte('last_visit_at', activeStart)
          .or(`last_campaign_at.is.null,last_campaign_at.lt.${capCutoff}`),

        // Recovery zone: dentro de la ventana reservada al cron
        getBase()
          .lt('last_visit_at', recoveryEnd)
          .gte('last_visit_at', recoveryStart),

        // Perdidos: pasado el fin de la zona (disponibles para campaña agresiva)
        getBase()
          .or(`last_visit_at.is.null,last_visit_at.lt.${lostCutoff}`)
          .or(`last_campaign_at.is.null,last_campaign_at.lt.${capCutoff}`),

        // En cap: contactados en los últimos 7d (no pueden recibir nada)
        getBase().gte('last_campaign_at', capCutoff),
      ])

    return NextResponse.json({
      active: activeCount ?? 0,        // antes de la zona: disponibles para campaña manual
      recovery: recoveryCount ?? 0,    // dentro de la zona: reservados para cron reactivación
      lost: lostCount ?? 0,            // pasada la zona: disponibles para oferta agresiva
      inCap: capCount ?? 0,            // <7d contactados: en espera
    })
  } catch (error) {
    console.error('[CampaignSegments]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
