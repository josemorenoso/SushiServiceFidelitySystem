import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  findInactiveCustomers,
  getOrCreateTodayCampaign,
  hasRecentCampaignMessage,
  recordCampaignMessage,
  finalizeCampaign,
  updateCustomerLastCampaignAt,
} from '@/services/campaign.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings, getReactivationDaysConfig } from '@/services/settings.service'
import { getRewardById, getNextReward, getRewardTitle, buildRewardsRoadmap } from '@/services/reward.service'
import { filterByMonthlyCap } from '@/services/campaign.service'
import { getNextTier, buildTiersRoadmap } from '@/services/reward-tiers.service'
import { getTenantBySlug, getActiveTenants } from '@/lib/tenant'
import type { Tenant } from '@/types/tenant.types'

interface TenantCronResult {
  tenant_slug: string
  ok: boolean
  campaign_id: string | null
  sent: number
  failed: number
  aggressive_sent: number
  total_inactive_customers: number
  reactivation_soft_days?: number
  reactivation_aggressive_days?: number
  error?: string
}

async function processTenant(tenant: Tenant): Promise<TenantCronResult> {
    // Tres modos:
    //   - reactivation_with_reward_template_sid + reactivation_reward_id → 6b "vuelve y gana X"
    //   - reactivation_no_reward_template_sid → 6a "te echamos de menos"
    //   - reactivation_template_sid (legacy) → fallback compat con instalaciones previas
    const settings = await getMultipleSettings([
      'reactivation_with_reward_template_sid',
      'reactivation_no_reward_template_sid',
      'reactivation_reward_id',
      'reactivation_template_sid', // legacy
      'reactivation_aggressive_template_sid', // 25d+ agresiva con puntos
      'reactivation_aggressive_reward_id',    // recompensa especial opcional para {{4}}
    ], tenant.id)

    const withRewardSid = settings.reactivation_with_reward_template_sid
    const noRewardSid = settings.reactivation_no_reward_template_sid
    const legacySid = settings.reactivation_template_sid
    const rewardId = settings.reactivation_reward_id

    // Settings de recompensa agresiva
    const aggressiveRewardId = settings.reactivation_aggressive_reward_id
    let aggressiveRewardTitle: string | null = null
    if (aggressiveRewardId) {
      const aggressiveReward = await getRewardById(aggressiveRewardId)
      if (aggressiveReward) aggressiveRewardTitle = aggressiveReward.title
    }

    // Decidir qué modo usar
    let mode: 'with_reward' | 'no_reward' | 'legacy' | null = null
    let templateSid: string | null = null
    let fixedRewardTitle: string | null = null

    if (withRewardSid && rewardId) {
      const reward = await getRewardById(rewardId)
      if (reward) {
        mode = 'with_reward'
        templateSid = withRewardSid
        fixedRewardTitle = reward.title
      }
    }
    if (!mode && noRewardSid) {
      mode = 'no_reward'
      templateSid = noRewardSid
    }
    if (!mode && legacySid) {
      mode = 'legacy'
      templateSid = legacySid
    }

    if (!mode || !templateSid) {
      console.warn(`[Cron Reactivation] (${tenant.slug}) No hay plantilla configurada. Configura reactivation_with_reward_template_sid + reactivation_reward_id, o reactivation_no_reward_template_sid en Dashboard > Ajustes.`)
      return {
        tenant_slug: tenant.slug,
        ok: false,
        campaign_id: null,
        sent: 0,
        failed: 0,
        aggressive_sent: 0,
        total_inactive_customers: 0,
        error: 'No hay plantilla de reactivación configurada. Ve a Dashboard > Ajustes.',
      }
    }

    // Días de reactivación configurables (Settings > Reactivación)
    const { softDays, aggressiveDays } = await getReactivationDaysConfig(tenant.id)

    const customers = await findInactiveCustomers(tenant.id, softDays)

    if (customers.length === 0) {
      return {
        tenant_slug: tenant.slug,
        ok: true,
        campaign_id: null,
        sent: 0,
        failed: 0,
        total_inactive_customers: 0,
        aggressive_sent: 0,
      }
    }

    // Separar clientes en dos grupos: suave (softDays) y agresivo (aggressiveDays+)
    const aggressiveCutoff = new Date(
      Date.now() - aggressiveDays * 24 * 60 * 60 * 1000
    ).toISOString()
    const softCustomers = customers.filter(
      (c) => c.last_visit_at && c.last_visit_at >= aggressiveCutoff
    )
    const aggressiveCustomers = customers.filter(
      (c) => c.last_visit_at && c.last_visit_at < aggressiveCutoff
    )

    // Plantilla agresiva (aggressiveDays+)
    const aggressiveSid = settings.reactivation_aggressive_template_sid

    const campaign = await getOrCreateTodayCampaign('reactivation', `template:${templateSid}|mode:${mode}`, tenant.id)
    let sent = 0
    let failed = 0
    let aggressiveSent = 0
    const sentCustomerIds: string[] = []

    // Aplicar cap mensual a clientes suaves
    const { eligible: softEligible, excluded: softExcludedCap } = await filterByMonthlyCap(softCustomers)

    // ─── PASS 1: Clientes suaves (softDays) ───
    for (const customer of softEligible) {
      const alreadySent = await hasRecentCampaignMessage(customer.id, 'reactivation', 30)
      if (alreadySent) continue

      try {
        // Variables según el modo:
        //   with_reward: {{1}}=name, {{2}}=fixedRewardTitle, {{3}}=roadmap
        //   no_reward:   {{1}}=name, {{2}}=puntos actuales, {{3}}=premio próximo
        //   legacy:      {{1}}=name, {{2}}=visits, {{3}}=rewardTitle (compat)
        const tiersRoadmap = await buildTiersRoadmap(customer.total_points ?? 0, tenant.id)
        const nextTier = await getNextTier(customer.total_points ?? 0, tenant.id)
        let variables: Record<string, string>
        if (mode === 'with_reward') {
          variables = { '1': customer.name, '2': fixedRewardTitle ?? 'más beneficios', '3': tiersRoadmap }
        } else if (mode === 'no_reward') {
          variables = {
            '1': customer.name,
            '2': String(customer.total_points ?? 0),
            '3': nextTier ? nextTier.tier.safe_reward_title : 'más beneficios',
          }
        } else {
          // legacy: replica el comportamiento previo con título del próximo premio del cliente
          const next = await getNextReward(customer.total_visits, tenant.id)
          variables = {
            '1': customer.name,
            '2': String(customer.total_visits),
            '3': getRewardTitle(next),
          }
        }

        const result = await sendTemplateMessage(customer.phone, templateSid, variables, tenant, undefined, { customerId: customer.id, messageType: 'reactivation' })

        await recordCampaignMessage({
          campaignId: campaign.id,
          customerId: customer.id,
          status: result ? 'sent' : 'failed',
          tenantId: tenant.id,
          twilioSid: result?.sid ?? null,
          errorMessage: result ? null : 'Twilio no configurado o error de envío',
        })

        if (result) {
          sent++
          sentCustomerIds.push(customer.id)
        } else {
          failed++
        }
      } catch (error) {
        failed++
        await recordCampaignMessage({
          campaignId: campaign.id,
          customerId: customer.id,
          status: 'failed',
          tenantId: tenant.id,
          errorMessage: error instanceof Error ? error.message : 'Error desconocido',
        })
      }
    }

    // Aplicar cap mensual a clientes agresivos
    const { eligible: aggressiveEligible, excluded: aggressiveExcludedCap } = await filterByMonthlyCap(aggressiveCustomers)

    // ─── PASS 2: Clientes agresivos (aggressiveDays+) ───
    if (aggressiveSid && aggressiveEligible.length > 0) {
      for (const customer of aggressiveEligible) {
        const alreadySent = await hasRecentCampaignMessage(customer.id, 'reactivation', 30)
        if (alreadySent) continue

        try {
          const tiersRoadmap = await buildTiersRoadmap(customer.total_points ?? 0, tenant.id)
          const nextTier = await getNextTier(customer.total_points ?? 0, tenant.id)
          const nextTierName = nextTier ? nextTier.tier.safe_reward_title : 'premios exclusivos'

          const aggressiveVars: Record<string, string> = {
            '1': customer.name,
            '2': String(customer.total_points ?? 0),
            '3': nextTierName,
          }
          // Si hay recompensa especial configurada para agresiva, añadir como {{4}}
          if (aggressiveRewardTitle) {
            aggressiveVars['4'] = aggressiveRewardTitle
          }

          const result = await sendTemplateMessage(customer.phone, aggressiveSid, aggressiveVars, tenant, undefined, { customerId: customer.id, messageType: 'reactivation' })

          await recordCampaignMessage({
            campaignId: campaign.id,
            customerId: customer.id,
            status: result ? 'sent' : 'failed',
            tenantId: tenant.id,
            twilioSid: result?.sid ?? null,
            errorMessage: result ? null : 'Twilio no configurado o error de envío',
          })

          if (result) {
            aggressiveSent++
            sent++
            sentCustomerIds.push(customer.id)
          } else {
            failed++
          }
        } catch (error) {
          failed++
          await recordCampaignMessage({
            campaignId: campaign.id,
            customerId: customer.id,
            status: 'failed',
            tenantId: tenant.id,
            errorMessage: error instanceof Error ? error.message : 'Error desconocido',
          })
        }
      }
    }

    await updateCustomerLastCampaignAt(sentCustomerIds)
    await finalizeCampaign(campaign.id, sent)

    return {
      tenant_slug: tenant.slug,
      ok: true,
      campaign_id: campaign.id,
      sent,
      failed,
      aggressive_sent: aggressiveSent,
      total_inactive_customers: customers.length,
      reactivation_soft_days: softDays,
      reactivation_aggressive_days: aggressiveDays,
    }
}

async function handleCron(request: NextRequest) {
  try {
    const slug = new URL(request.url).searchParams.get('tenant')

    // Con ?tenant= → un solo tenant (compat con llamadas existentes de n8n).
    if (slug) {
      const tenant = await getTenantBySlug(slug)
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 })
      }
      return NextResponse.json(await processTenant(tenant))
    }

    // Sin ?tenant= → recorre todos los tenants activos (onboarding sin tocar n8n).
    // allSettled: un tenant que falle no debe tumbar el procesamiento de los demás.
    const tenants = await getActiveTenants()
    const settled = await Promise.allSettled(tenants.map(processTenant))
    const results: TenantCronResult[] = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            tenant_slug: tenants[i].slug,
            ok: false,
            campaign_id: null,
            sent: 0,
            failed: 0,
            aggressive_sent: 0,
            total_inactive_customers: 0,
            error: r.reason instanceof Error ? r.reason.message : 'Error desconocido',
          }
    )

    return NextResponse.json({
      ok: true,
      tenants_processed: results.length,
      sent: results.reduce((acc, r) => acc + r.sent, 0),
      failed: results.reduce((acc, r) => acc + r.failed, 0),
      aggressive_sent: results.reduce((acc, r) => acc + r.aggressive_sent, 0),
      results,
    })
  } catch (error) {
    console.error('[Cron Reactivation] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Error ejecutando cron de reactivación' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return handleCron(request)
}

export async function POST(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return handleCron(request)
}
