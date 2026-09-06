import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const minVisits = searchParams.get('minVisits')
    const maxVisits = searchParams.get('maxVisits')
    const minAge = searchParams.get('minAge')
    const maxAge = searchParams.get('maxAge')
    const source = searchParams.get('source')
    const minDays = searchParams.get('minDays')
    const maxDays = searchParams.get('maxDays')

    const tenantId = await requireTenantId()
    const db = getServiceClient()
    let query = db.from('customers').select('id', { count: 'exact', head: true })
    query = query.eq('tenant_id', tenantId)
    query = query.eq('accepts_marketing', true)
    query = query.is('whatsapp_opt_out_at', null)

    if (city) {
      query = query.ilike('city', `%${city}%`)
    }
    if (minVisits) {
      query = query.gte('total_visits', parseInt(minVisits))
    }
    if (maxVisits) {
      query = query.lte('total_visits', parseInt(maxVisits))
    }
    if (minAge) {
      const maxBirthday = new Date()
      maxBirthday.setFullYear(maxBirthday.getFullYear() - parseInt(minAge))
      query = query.lte('birthday', maxBirthday.toISOString().split('T')[0])
    }
    if (maxAge) {
      const minBirthday = new Date()
      minBirthday.setFullYear(minBirthday.getFullYear() - parseInt(maxAge) - 1)
      query = query.gte('birthday', minBirthday.toISOString().split('T')[0])
    }

    // Días sin venir: minDays=N → última visita hace N días o más;
    // maxDays=M → última visita hace M días o menos (día M completo incluido).
    // Ambos excluyen clientes sin last_visit_at (no se puede medir su inactividad).
    if (minDays) {
      const cutoff = new Date(Date.now() - parseInt(minDays) * 24 * 60 * 60 * 1000).toISOString()
      query = query.lte('last_visit_at', cutoff)
    }
    if (maxDays) {
      const cutoff = new Date(Date.now() - (parseInt(maxDays) + 1) * 24 * 60 * 60 * 1000).toISOString()
      query = query.gt('last_visit_at', cutoff)
    }

    // Canal de origen: mismo criterio que manual/route.ts para que el estimado
    // coincida con lo que realmente se envía.
    if (source === 'qr_only') {
      query = query.eq('source_channels', 'qr')
    } else if (source === 'delivery_only') {
      query = query.eq('source_channels', 'delivery')
    }

    // Frequency cap: excluir clientes contactados en los últimos FREQUENCY_CAP_DAYS días
    const capCutoff = new Date(Date.now() - FREQUENCY_CAP_DAYS * 24 * 60 * 60 * 1000).toISOString()
    query = query.or(`last_campaign_at.is.null,last_campaign_at.lt.${capCutoff}`)

    // Recovery Zone: excluir clientes dentro de la ventana reservada al cron de
    // reactivación. La ventana sale de los días que este tenant configuró, la MISMA
    // que aplica manual/route.ts — si divergen, el estimado miente sobre el envío.
    // Keeper = NULL o fuera del rango.
    const zone = await getRecoveryZoneConfig(tenantId)
    const zoneCutoffNear = new Date(Date.now() - zone.startDays * 24 * 60 * 60 * 1000).toISOString()
    const zoneCutoffFar = new Date(Date.now() - zone.endDays * 24 * 60 * 60 * 1000).toISOString()
    query = query.or(`last_visit_at.is.null,last_visit_at.gte.${zoneCutoffNear},last_visit_at.lt.${zoneCutoffFar}`)

    const { count, error } = await query

    if (error) {
      console.error('[CampaignEstimate]', error)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (error) {
    console.error('[CampaignEstimate]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
