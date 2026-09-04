import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireLocationScope, applyLocationFilter } from '@/lib/location-scope'

/**
 * Devuelve la eficiencia de cada campaña ejecutada en los últimos N días
 * con atribución de 7 días (un cliente que visita dentro de 7 días de recibir
 * el mensaje cuenta como conversión atribuida).
 *
 * Respuesta por campaña:
 * - total_sent         mensajes enviados exitosamente
 * - attributed_visits  clientes únicos que visitaron en ventana 7d post-mensaje
 * - conversion_rate    % (attributed_visits / total_sent)
 * - estimated_revenue  attributed_visits * avg_ticket (desde admin_settings)
 */

const ATTRIBUTION_WINDOW_DAYS = 7
const LOOKBACK_DAYS_DEFAULT = 90

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(request: Request) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }
  const { scope } = scopeResult

  const url = new URL(request.url)
  const allTime = url.searchParams.get('all') === 'true'
  const lookbackDays = allTime ? 0 : Math.min(
    parseInt(url.searchParams.get('days') || String(LOOKBACK_DAYS_DEFAULT)) || LOOKBACK_DAYS_DEFAULT,
    3650
  )

  const db = getServiceClient()
  const since = allTime
    ? '2000-01-01T00:00:00.000Z'
    : new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  // 1) Campañas ejecutadas en el rango. Multi-sede F7 (§8.4): `campaigns.location_id`
  // la deja SIEMPRE NULL birthday/reactivation/manual hoy (deuda #12, es F6) — con
  // `role='brand'` esto no cambia nada; un futuro `role='location'` vería la lista
  // vacía hasta que F6 la llene.
  const campaignsBase = db
    .from('campaigns')
    .select('id, name, type, executed_at, total_sent, status')
    .eq('tenant_id', scope.tenantId)
    .not('executed_at', 'is', null)
    .gte('executed_at', since)
  const { data: campaigns, error: campErr } = await applyLocationFilter(campaignsBase, scope, 'location_id').order(
    'executed_at',
    { ascending: false }
  )

  if (campErr) {
    console.error('[Efficiency] Error fetching campaigns:', campErr)
    return NextResponse.json({ error: 'Error obteniendo campañas' }, { status: 500 })
  }

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ campaigns: [], summary: emptySummary() })
  }

  // 2) Mensajes "sent" de esas campañas
  const campaignIds = campaigns.map((c) => c.id)
  const { data: messages } = await db
    .from('campaign_messages')
    .select('campaign_id, customer_id, sent_at, status')
    .in('campaign_id', campaignIds)
    .eq('tenant_id', scope.tenantId)
    .eq('status', 'sent')
    .not('sent_at', 'is', null)

  // 3) Todas las visitas del rango + ventana de atribución
  const visitsSince = new Date(
    new Date(since).getTime() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data: visits } = await db
    .from('visits')
    .select('customer_id, created_at, amount')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', visitsSince)

  // 4) Ticket promedio para estimación de revenue
  const { data: settingsRow } = await db
    .from('admin_settings')
    .select('value')
    .eq('key', 'avg_ticket')
    .eq('tenant_id', scope.tenantId)
    .single()
  const avgTicket = parseFloat(settingsRow?.value || '35000') || 35000

  // 5) Indexar visitas por customer_id para lookup rápido
  const visitsByCustomer = new Map<string, { created_at: string; amount: number | null }[]>()
  for (const v of visits ?? []) {
    const arr = visitsByCustomer.get(v.customer_id) || []
    arr.push({ created_at: v.created_at, amount: v.amount })
    visitsByCustomer.set(v.customer_id, arr)
  }

  // 6) Para cada campaña, calcular atribución
  const attribMs = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const messagesByCampaign = new Map<string, { customer_id: string; sent_at: string }[]>()
  for (const m of messages ?? []) {
    if (!m.sent_at) continue
    const arr = messagesByCampaign.get(m.campaign_id) || []
    arr.push({ customer_id: m.customer_id, sent_at: m.sent_at })
    messagesByCampaign.set(m.campaign_id, arr)
  }

  const results = campaigns.map((c) => {
    const msgs = messagesByCampaign.get(c.id) || []
    const totalSent = msgs.length
    const attributedCustomers = new Set<string>()
    let attributedRevenueExact = 0
    let attributedWithAmount = 0

    for (const m of msgs) {
      const sentAtMs = new Date(m.sent_at).getTime()
      const windowEnd = sentAtMs + attribMs
      const customerVisits = visitsByCustomer.get(m.customer_id) || []
      for (const v of customerVisits) {
        const visitMs = new Date(v.created_at).getTime()
        if (visitMs >= sentAtMs && visitMs <= windowEnd) {
          attributedCustomers.add(m.customer_id)
          if (v.amount != null) {
            attributedRevenueExact += v.amount
            attributedWithAmount++
          }
          break // atribuir una sola visita por mensaje
        }
      }
    }

    const attributedVisits = attributedCustomers.size
    const conversionRate = totalSent > 0 ? (attributedVisits / totalSent) * 100 : 0
    // Si hay amounts reales, usar mezcla; si no, usar avgTicket para estimación
    const estimatedRevenue =
      attributedRevenueExact + (attributedVisits - attributedWithAmount) * avgTicket

    return {
      id: c.id,
      name: c.name,
      type: c.type as 'manual' | 'birthday' | 'reactivation',
      executed_at: c.executed_at,
      total_sent: totalSent,
      attributed_visits: attributedVisits,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      estimated_revenue: Math.round(estimatedRevenue),
    }
  })

  // 7) Resumen agregado
  const totalSentAll = results.reduce((s, r) => s + r.total_sent, 0)
  const totalAttrAll = results.reduce((s, r) => s + r.attributed_visits, 0)
  const totalRevAll = results.reduce((s, r) => s + r.estimated_revenue, 0)
  const summary = {
    campaigns_count: results.length,
    total_sent: totalSentAll,
    total_attributed: totalAttrAll,
    overall_conversion_rate:
      totalSentAll > 0 ? Math.round((totalAttrAll / totalSentAll) * 1000) / 10 : 0,
    total_revenue: totalRevAll,
    avg_ticket: avgTicket,
    attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
    lookback_days: allTime ? null : lookbackDays,
    all_time: allTime,
  }

  return NextResponse.json({ campaigns: results, summary })
}

function emptySummary() {
  return {
    campaigns_count: 0,
    total_sent: 0,
    total_attributed: 0,
    overall_conversion_rate: 0,
    total_revenue: 0,
    avg_ticket: 35000,
    attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
    lookback_days: LOOKBACK_DAYS_DEFAULT,
  }
}
