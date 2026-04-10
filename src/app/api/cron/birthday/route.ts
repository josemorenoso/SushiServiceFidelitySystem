import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  findBirthdayCustomers,
  getOrCreateTodayCampaign,
  hasRecentCampaignMessage,
  recordCampaignMessage,
  finalizeCampaign,
} from '@/services/campaign.service'
import { sendBirthdayMessage } from '@/services/whatsapp.service'

const BIRTHDAY_TEMPLATE = '¡Feliz cumpleaños {{name}}! 🎂🎉 De parte de todo nuestro equipo, te deseamos un día increíble. Pasa por el restaurante y reclama tu sorpresa de cumpleaños. ¡Te esperamos!'

async function handleCron() {
  try {
    const customers = await findBirthdayCustomers()

    if (customers.length === 0) {
      return NextResponse.json({
        ok: true,
        campaign_id: null,
        sent: 0,
        failed: 0,
        total_birthday_customers: 0,
      })
    }

    const campaign = await getOrCreateTodayCampaign('birthday', BIRTHDAY_TEMPLATE)
    let sent = 0
    let failed = 0

    for (const customer of customers) {
      const alreadySent = await hasRecentCampaignMessage(customer.id, 'birthday', 365)
      if (alreadySent) continue

      try {
        const result = await sendBirthdayMessage(customer.phone, customer.name, BIRTHDAY_TEMPLATE)

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
      total_birthday_customers: customers.length,
    })
  } catch (error) {
    console.error('[Cron Birthday] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Error ejecutando cron de cumpleaños' },
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
