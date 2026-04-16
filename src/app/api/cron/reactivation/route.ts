import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  findInactiveCustomers,
  getOrCreateTodayCampaign,
  hasRecentCampaignMessage,
  recordCampaignMessage,
  finalizeCampaign,
} from '@/services/campaign.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getSettingValue } from '@/services/settings.service'
import { getNextReward, buildRewardHint } from '@/services/reward.service'

async function handleCron() {
  try {
    const templateSid = await getSettingValue('reactivation_template_sid')

    if (!templateSid) {
      console.warn('[Cron Reactivation] No hay plantilla configurada para reactivación. Configúrala en Dashboard > Ajustes.')
      return NextResponse.json({
        ok: false,
        error: 'No hay plantilla de reactivación configurada. Ve a Dashboard > Ajustes y selecciona una plantilla aprobada.',
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

    const campaign = await getOrCreateTodayCampaign('reactivation', `template:${templateSid}`)
    let sent = 0
    let failed = 0

    for (const customer of customers) {
      const alreadySent = await hasRecentCampaignMessage(customer.id, 'reactivation', 30)
      if (alreadySent) continue

      try {
        const nextReward = await getNextReward(customer.total_visits)
        const rewardHint = buildRewardHint(customer.total_visits, nextReward)

        const result = await sendTemplateMessage(customer.phone, templateSid, {
          '1': customer.name,
          '2': String(customer.total_visits),
          '3': rewardHint,
        })

        await recordCampaignMessage({
          campaignId: campaign.id,
          customerId: customer.id,
          status: result ? 'sent' : 'failed',
          twilioSid: result?.sid ?? null,
          errorMessage: result ? null : 'Twilio no configurado o error de envío',
        })

        if (result) sent++
        else failed++
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
