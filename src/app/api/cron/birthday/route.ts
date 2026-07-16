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
import { getTenantBySlug, getActiveTenants } from '@/lib/tenant'
import type { Tenant } from '@/types/tenant.types'

interface TenantCronResult {
  tenant_slug: string
  ok: boolean
  campaign_id: string | null
  sent: number
  failed: number
  total_birthday_customers: number
  error?: string
}

async function processTenant(tenant: Tenant): Promise<TenantCronResult> {
  const templateSid = await getSettingValue('birthday_template_sid', tenant.id)

  if (!templateSid) {
    console.warn(`[Cron Birthday] (${tenant.slug}) No hay plantilla configurada para cumpleaños.`)
    return {
      tenant_slug: tenant.slug,
      ok: false,
      campaign_id: null,
      sent: 0,
      failed: 0,
      total_birthday_customers: 0,
      error: 'No hay plantilla de cumpleaños configurada. Ve a Dashboard > Ajustes y selecciona una plantilla aprobada.',
    }
  }

  const customers = await findBirthdayCustomers(tenant.id)

  if (customers.length === 0) {
    return { tenant_slug: tenant.slug, ok: true, campaign_id: null, sent: 0, failed: 0, total_birthday_customers: 0 }
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
      const result = await sendTemplateMessage(customer.phone, templateSid, { '1': customer.name, '2': tiersRoadmap }, tenant, { customerId: customer.id, messageType: 'birthday' })

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

  return {
    tenant_slug: tenant.slug,
    ok: true,
    campaign_id: campaign.id,
    sent,
    failed,
    total_birthday_customers: customers.length,
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
            total_birthday_customers: 0,
            error: r.reason instanceof Error ? r.reason.message : 'Error desconocido',
          }
    )

    return NextResponse.json({
      ok: true,
      tenants_processed: results.length,
      sent: results.reduce((acc, r) => acc + r.sent, 0),
      failed: results.reduce((acc, r) => acc + r.failed, 0),
      results,
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
