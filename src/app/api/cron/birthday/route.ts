import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  findBirthdayCustomers,
  getOrCreateTodayCampaign,
  hasRecentCampaignMessage,
  recordCampaignMessage,
  finalizeCampaign,
} from '@/services/campaign.service'
import { sendBirthdayMessage, sendTemplateMessage } from '@/services/whatsapp.service'
import { createClient } from '@supabase/supabase-js'

const BIRTHDAY_FALLBACK = '¡Feliz cumpleaños {{name}}! 🎂🎉 De parte de todo nuestro equipo, te deseamos un día increíble. Pasa por el restaurante y reclama tu sorpresa de cumpleaños. ¡Te esperamos!'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

async function getSettingValue(key: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase.from('admin_settings').select('value').eq('key', key).single()
  return data?.value ?? null
}

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

    const templateSid = await getSettingValue('birthday_template_sid')
    const useTemplate = !!templateSid

    const campaign = await getOrCreateTodayCampaign('birthday', useTemplate ? `template:${templateSid}` : BIRTHDAY_FALLBACK)
    let sent = 0
    let failed = 0

    for (const customer of customers) {
      const alreadySent = await hasRecentCampaignMessage(customer.id, 'birthday', 365)
      if (alreadySent) continue

      try {
        let result
        if (useTemplate && templateSid) {
          result = await sendTemplateMessage(customer.phone, templateSid, { '1': customer.name })
        } else {
          result = await sendBirthdayMessage(customer.phone, customer.name, BIRTHDAY_FALLBACK)
        }

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
      mode: useTemplate ? 'template' : 'free-text',
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
