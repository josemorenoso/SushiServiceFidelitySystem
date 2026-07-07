import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  findBirthdayCustomers,
  getOrCreateTodayCampaign,
  hasRecentCampaignMessage,
  recordCampaignMessage,
  finalizeCampaign,
  updateCustomerLastCampaignAt,
} from '@/services/campaign.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getSettingValue } from '@/services/settings.service'
import { buildTiersRoadmap } from '@/services/reward-tiers.service'
import { getTenantBySlug } from '@/lib/tenant'

async function handleCron(request: NextRequest) {
  try {
    const slug = new URL(request.url).searchParams.get('tenant')
    if (!slug) {
      return NextResponse.json({ error: 'Falta ?tenant=' }, { status: 400 })
    }
    const tenant = await getTenantBySlug(slug)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 })
    }

    const templateSid = await getSettingValue('birthday_template_sid', tenant.id)

    if (!templateSid) {
      console.warn('[Cron Birthday] No hay plantilla configurada para cumpleaños. Configúrala en Dashboard > Ajustes.')
      return NextResponse.json({
        ok: false,
        error: 'No hay plantilla de cumpleaños configurada. Ve a Dashboard > Ajustes y selecciona una plantilla aprobada.',
        sent: 0,
      })
    }

    const customers = await findBirthdayCustomers(tenant.id)

    if (customers.length === 0) {
      return NextResponse.json({
        ok: true,
        campaign_id: null,
        sent: 0,
        failed: 0,
        total_birthday_customers: 0,
      })
    }

    const campaign = await getOrCreateTodayCampaign('birthday', `template:${templateSid}`, tenant.id)
    let sent = 0
    let failed = 0
    const sentCustomerIds: string[] = []

    for (const customer of customers) {
      const alreadySent = await hasRecentCampaignMessage(customer.id, 'birthday', 365)
      if (alreadySent) continue

      try {
        const tiersRoadmap = await buildTiersRoadmap(customer.total_points ?? 0, tenant.id)
        const result = await sendTemplateMessage(customer.phone, templateSid, { '1': customer.name, '2': tiersRoadmap }, tenant, undefined, { customerId: customer.id, messageType: 'birthday' })

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

    await updateCustomerLastCampaignAt(sentCustomerIds)
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
  return handleCron(request)
}

export async function POST(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return handleCron(request)
}
