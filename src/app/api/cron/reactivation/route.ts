import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  findInactiveCustomers,
  getOrCreateTodayCampaign,
  hasRecentCampaignMessage,
  recordCampaignMessage,
  finalizeCampaign,
} from '@/services/campaign.service'
import { sendReactivationMessage, sendTemplateMessage } from '@/services/whatsapp.service'
import { createClient } from '@supabase/supabase-js'

const REACTIVATION_FALLBACK = '¡Hola {{name}}! 👋 Te extrañamos en el restaurante. Ha pasado un tiempo desde tu última visita. ¡Vuelve pronto y sigue acumulando premios! Tu próxima visita te acerca más a una recompensa especial. 🌟'

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

    const templateSid = await getSettingValue('reactivation_template_sid')
    const useTemplate = !!templateSid

    const campaign = await getOrCreateTodayCampaign('reactivation', useTemplate ? `template:${templateSid}` : REACTIVATION_FALLBACK)
    let sent = 0
    let failed = 0

    for (const customer of customers) {
      const alreadySent = await hasRecentCampaignMessage(customer.id, 'reactivation', 30)
      if (alreadySent) continue

      try {
        let result
        if (useTemplate && templateSid) {
          result = await sendTemplateMessage(customer.phone, templateSid, { '1': customer.name })
        } else {
          result = await sendReactivationMessage(customer.phone, customer.name, REACTIVATION_FALLBACK)
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
      total_inactive_customers: customers.length,
      mode: useTemplate ? 'template' : 'free-text',
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
