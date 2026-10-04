import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  elegirPlantillaDeCumpleanos,
  findBirthdayCustomers,
  getOrCreateTodayCampaign,
  hasRecentCampaignMessage,
  recordCampaignMessage,
  finalizeCampaign,
  updateCustomerLastCampaignAt,
} from '@/services/campaign.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getSettingValue } from '@/services/settings.service'
import { isTwilioTemplateApproved } from '@/services/twilio-catalog.service'
import { buildTiersRoadmap } from '@/services/reward-tiers.service'
import { getTenantBySlug, getActiveTenants } from '@/lib/tenant'
import { BIRTHDAY_DEDUPE_DAYS } from '@/constants/rewards'
import type { Tenant } from '@/types/tenant.types'

interface TenantCronResult {
  tenant_slug: string
  ok: boolean
  campaign_id: string | null
  sent: number
  failed: number
  total_birthday_customers: number
  /** Con cuál salió: `se_acerca` (hasta dos días antes) o `el_dia` (la vieja, el día mismo). */
  plantilla?: 'se_acerca' | 'el_dia'
  error?: string
}

/**
 * ¿Ya está aprobada la plantilla «Cumpleaños — dos días antes» de esta marca?
 * En Zernio el puntero solo existe aprobado; en Twilio se escribe al crearla y hay que
 * preguntar (ver `isTwilioTemplateApproved()`).
 */
async function nuevaAprobada(tenant: Tenant, sid: string | null): Promise<boolean> {
  if (!sid) return false
  if (tenant.messaging_provider === 'zernio') return true
  return isTwilioTemplateApproved(tenant, sid)
}

async function processTenant(tenant: Tenant): Promise<TenantCronResult> {
  // Dos plantillas posibles (dueño, 2026-10-04): la nueva («ya está aquí», hasta dos días
  // antes) en cuanto la marca la tenga APROBADA; si no, la vieja («¡Feliz cumpleaños!»)
  // el día mismo, como siempre. La regla entera vive en `elegirPlantillaDeCumpleanos()`.
  const [nueva, vieja] = await Promise.all([
    getSettingValue('birthday_upcoming_template_sid', tenant.id),
    getSettingValue('birthday_template_sid', tenant.id),
  ])
  const plantilla = elegirPlantillaDeCumpleanos({
    nueva,
    nuevaAprobada: await nuevaAprobada(tenant, nueva),
    vieja,
  })

  if (!plantilla) {
    console.warn(`[Cron Birthday] (${tenant.slug}) No hay plantilla configurada para cumpleaños.`)
    return {
      tenant_slug: tenant.slug,
      ok: false,
      campaign_id: null,
      sent: 0,
      failed: 0,
      total_birthday_customers: 0,
      error: nueva
        ? 'La plantilla «Cumpleaños — dos días antes» todavía no está aprobada por Meta. Sale sola en cuanto la aprueben.'
        : 'No hay plantilla de cumpleaños. Ve a Dashboard > Plantillas y envía «Cumpleaños — dos días antes» a aprobación.',
    }
  }
  const templateSid = plantilla.sid

  // Con la nueva: quien cumple entre hoy y dentro de BIRTHDAY_LEAD_DAYS días (una VENTANA,
  // para que el día del cambio nadie se quede sin saludo; la dedup evita repetirlo). Con la
  // vieja: solo quien cumple hoy. Ver `findBirthdayCustomers()`.
  const customers = await findBirthdayCustomers(tenant.id, plantilla.diasDeAnticipacion)

  if (customers.length === 0) {
    return { tenant_slug: tenant.slug, ok: true, campaign_id: null, sent: 0, failed: 0, total_birthday_customers: 0, plantilla: plantilla.cual }
  }

  const campaign = await getOrCreateTodayCampaign('birthday', `template:${templateSid}`, tenant.id)
  let sent = 0
  let failed = 0
  const sentCustomerIds: string[] = []

  for (const customer of customers) {
    // BIRTHDAY_DEDUPE_DAYS < 365 a propósito: el año en que el envío se adelantó
    // dos días, el hueco contra el saludo anterior es de 363 y una ventana de 365
    // se habría comido la campaña entera sin registrar un solo error.
    const alreadySent = await hasRecentCampaignMessage(customer.id, 'birthday', BIRTHDAY_DEDUPE_DAYS)
    if (alreadySent) continue

    try {
      // ⚠️ SIN SEDE, A PROPÓSITO (00058). Un cron de cumpleaños es un envío
      // programado: no hay visita, ni QR, ni operador, ni host — no existe una
      // «sede del acto». La única sede posible sería INFERIDA del cliente
      // (`last_visit_location_id`), y esa cascada está diseñada y explícitamente
      // aplazada a F6 (`whatsapp.service.ts` §6.1). Los niveles son los de la
      // MARCA, que es el default de `buildTiersRoadmap` sin sede.
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
    plantilla: plantilla.cual,
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
