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
import { getMultipleSettings } from '@/services/settings.service'
import { getRewardById, getNextReward, getRewardTitle } from '@/services/reward.service'

async function handleCron() {
  try {
    // Tres modos:
    //   - reactivation_with_reward_template_sid + reactivation_reward_id → 6b "vuelve y gana X"
    //   - reactivation_no_reward_template_sid → 6a "te echamos de menos"
    //   - reactivation_template_sid (legacy) → fallback compat con instalaciones previas
    const settings = await getMultipleSettings([
      'reactivation_with_reward_template_sid',
      'reactivation_no_reward_template_sid',
      'reactivation_reward_id',
      'reactivation_template_sid', // legacy
    ])

    const withRewardSid = settings.reactivation_with_reward_template_sid
    const noRewardSid = settings.reactivation_no_reward_template_sid
    const legacySid = settings.reactivation_template_sid
    const rewardId = settings.reactivation_reward_id

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
      console.warn('[Cron Reactivation] No hay plantilla configurada. Configura reactivation_with_reward_template_sid + reactivation_reward_id, o reactivation_no_reward_template_sid en Dashboard > Ajustes.')
      return NextResponse.json({
        ok: false,
        error: 'No hay plantilla de reactivación configurada. Ve a Dashboard > Ajustes.',
        sent: 0,
      })
    }

    const customers = await findInactiveCustomers()

    if (customers.length === 0) {
      return NextResponse.json({
        ok: true,
        campaign_id: null,
        sent: 0,
        failed: 0,
        total_inactive_customers: 0,
      })
    }

    const campaign = await getOrCreateTodayCampaign('reactivation', `template:${templateSid}|mode:${mode}`)
    let sent = 0
    let failed = 0
    const sentCustomerIds: string[] = []

    for (const customer of customers) {
      const alreadySent = await hasRecentCampaignMessage(customer.id, 'reactivation', 30)
      if (alreadySent) continue

      try {
        // Variables según el modo:
        //   with_reward: {{1}}=name, {{3}}=fixedRewardTitle (plantilla 6b)
        //   no_reward:   {{1}}=name (plantilla 6a)
        //   legacy:      {{1}}=name, {{2}}=visits, {{3}}=rewardTitle (compat)
        let variables: Record<string, string>
        if (mode === 'with_reward') {
          variables = { '1': customer.name, '3': fixedRewardTitle ?? 'más beneficios' }
        } else if (mode === 'no_reward') {
          variables = { '1': customer.name }
        } else {
          // legacy: replica el comportamiento previo con título del próximo premio del cliente
          const next = await getNextReward(customer.total_visits)
          variables = {
            '1': customer.name,
            '2': String(customer.total_visits),
            '3': getRewardTitle(next),
          }
        }

        const result = await sendTemplateMessage(customer.phone, templateSid, variables)

        await recordCampaignMessage({
          campaignId: campaign.id,
          customerId: customer.id,
          status: result ? 'sent' : 'failed',
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
          errorMessage: error instanceof Error ? error.message : 'Error desconocido',
        })
      }
    }

    await updateCustomerLastCampaignAt(sentCustomerIds)
    await finalizeCampaign(campaign.id, sent)

    return NextResponse.json({
      ok: true,
      campaign_id: campaign.id,
      sent,
      failed,
      total_inactive_customers: customers.length,
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
  return handleCron()
}

export async function POST(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return handleCron()
}
