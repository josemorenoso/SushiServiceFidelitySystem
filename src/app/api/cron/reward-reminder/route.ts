import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import {
  expireGrants,
  findGrantsDueForReminder,
  markReminderSent,
} from '@/services/reward-grant.service'
import {
  getOrCreateTodayCampaign,
  recordCampaignMessage,
  finalizeCampaign,
  filterByMonthlyCap,
} from '@/services/campaign.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { DEFAULT_REWARD_REMINDER_DAYS_BEFORE } from '@/constants/rewards'
import { getTenantBySlug, getActiveTenants } from '@/lib/tenant'
import type { Tenant } from '@/types/tenant.types'

/**
 * Cron de recordatorio de vencimiento de premio.
 *
 * Disparador: hoy n8n ("Cron Recordatorio de Premios"), igual que reactivation y birthday.
 * Desde 2026-09-02 también queda DECLARADO en `vercel.json` a las 16:00 UTC (= 11:00 en
 * Colombia), calco 1:1 del Schedule Trigger de n8n: cero cambio de cadencia. El disparo
 * efectivo empieza cuando se despliegue a producción con el plan Pro activo, y en ese mismo
 * movimiento se apaga el Schedule Trigger de n8n — los dos encendidos a la vez = doble
 * disparo. Hasta entonces el disparador vivo sigue siendo n8n.
 *
 * Hace dos cosas, en este orden:
 *   1. BARRIDO — marca `expired` los premios cuya fecha ya pasó. Corre SIEMPRE, aunque el
 *      recordatorio esté apagado, para que las métricas de "vencidos sin reclamar" sean
 *      honestas sin necesidad de un cron aparte.
 *   2. RECORDATORIO — un solo golpe a los premios que están por vencer cuyo dueño no ha
 *      vuelto.
 *
 * CAPS (decisión D5, ver docs/features/reward-grants.md):
 *   - EXENTO del cap de frecuencia de 7 días. Sin esta excepción el recordatorio nunca
 *     saldría con ventanas de premio de 5-7 días, que son justo las que generan urgencia.
 *     Es la misma excepción que ya tiene cumpleaños.
 *   - SUJETO al cap mensual de 3 mensajes de marketing (`source='reward_reminder'` está en
 *     MONTHLY_CAP_SOURCES). Un cliente nunca recibe más de 3 al mes, pase lo que pase.
 *
 * Ref: docs/features/reward-grants.md
 */

interface TenantCronResult {
  tenant_slug: string
  ok: boolean
  expired: number
  candidates: number
  sent: number
  failed: number
  skipped_monthly_cap: number
  reminder_enabled: boolean
  error?: string
}

async function processTenant(tenant: Tenant): Promise<TenantCronResult> {
  // ─── 1. Barrido de vencidos (siempre, incluso con el recordatorio apagado) ───
  const expired = await expireGrants(tenant.id)

  const settings = await getMultipleSettings(
    ['reward_reminder_enabled', 'reward_reminder_days_before', 'reward_reminder_template_sid'],
    tenant.id
  )

  const enabled = settings.reward_reminder_enabled === 'true'
  const templateSid = settings.reward_reminder_template_sid

  if (!enabled || !templateSid) {
    return {
      tenant_slug: tenant.slug,
      ok: true,
      expired,
      candidates: 0,
      sent: 0,
      failed: 0,
      skipped_monthly_cap: 0,
      reminder_enabled: enabled,
    }
  }

  const parsedDays = Number(settings.reward_reminder_days_before)
  const daysBefore =
    Number.isFinite(parsedDays) && parsedDays > 0
      ? Math.floor(parsedDays)
      : DEFAULT_REWARD_REMINDER_DAYS_BEFORE

  // ─── 2. Candidatos ───
  const candidates = await findGrantsDueForReminder(tenant.id, daysBefore)

  if (candidates.length === 0) {
    return {
      tenant_slug: tenant.slug,
      ok: true,
      expired,
      candidates: 0,
      sent: 0,
      failed: 0,
      skipped_monthly_cap: 0,
      reminder_enabled: true,
    }
  }

  // ─── 3. Cap mensual (filterByMonthlyCap filtra por `id`, así que mapeamos a esa forma) ───
  const { eligible, excluded } = await filterByMonthlyCap(
    candidates.map((c) => ({ ...c, id: c.customer_id }))
  )

  const campaign = await getOrCreateTodayCampaign(
    'reactivation',
    `template:${templateSid}|reward_reminder`,
    tenant.id,
    'reward_reminder'
  )

  let sent = 0
  let failed = 0
  const remindedGrantIds: string[] = []

  // Envío en paralelo por lotes (mismo patrón que campaigns/manual): antes era un loop
  // secuencial con un `await` de red por candidato, así que 20-50 premios convertían un
  // job de sub-segundo en 10-25 s de latencia en serie. Los lotes acotan la concurrencia
  // para no saturar Twilio.
  const BATCH_SIZE = 10
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (candidate) => {
        try {
          const result = await sendTemplateMessage(
            candidate.customer_phone,
            templateSid,
            {
              '1': candidate.customer_name,
              '2': candidate.prize_title,
              '3': String(candidate.days_left),
            },
            tenant,
            { customerId: candidate.customer_id, messageType: 'reward_reminder' }
          )

          await recordCampaignMessage({
            campaignId: campaign.id,
            customerId: candidate.customer_id,
            status: result ? 'sent' : 'failed',
            tenantId: tenant.id,
            twilioSid: result?.sid ?? null,
            errorMessage: result ? null : 'Twilio no configurado o error de envío',
          })

          // Se sella solo si el mensaje SALIÓ. Si Twilio falló, el premio sigue siendo
          // candidato en la próxima corrida — todavía le queda ventana.
          return { grantId: candidate.grant_id, ok: !!result }
        } catch (error) {
          await recordCampaignMessage({
            campaignId: campaign.id,
            customerId: candidate.customer_id,
            status: 'failed',
            tenantId: tenant.id,
            errorMessage: error instanceof Error ? error.message : 'Error desconocido',
          })
          return { grantId: candidate.grant_id, ok: false }
        }
      })
    )

    for (const r of results) {
      if (r.ok) {
        sent++
        remindedGrantIds.push(r.grantId)
      } else {
        failed++
      }
    }
  }

  await markReminderSent(remindedGrantIds)
  await finalizeCampaign(campaign.id, sent)

  // NOTA: deliberadamente NO llamamos a updateCustomerLastCampaignAt(). Eso movería el cap
  // de frecuencia de 7 días del cliente y bloquearía su próxima reactivación real. El
  // recordatorio ya está contabilizado donde importa (el cap mensual, vía campaign_messages).

  return {
    tenant_slug: tenant.slug,
    ok: true,
    expired,
    candidates: candidates.length,
    sent,
    failed,
    skipped_monthly_cap: excluded.length,
    reminder_enabled: true,
  }
}

async function handleCron(request: NextRequest) {
  try {
    const slug = new URL(request.url).searchParams.get('tenant')

    // Con ?tenant= → un solo tenant (compat con el patrón de n8n).
    if (slug) {
      const tenant = await getTenantBySlug(slug)
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 })
      }
      return NextResponse.json(await processTenant(tenant))
    }

    // Sin ?tenant= → todos los tenants activos. allSettled: un tenant que falle no debe
    // tumbar el procesamiento de los demás.
    const tenants = await getActiveTenants()
    const settled = await Promise.allSettled(tenants.map(processTenant))
    const results: TenantCronResult[] = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            tenant_slug: tenants[i].slug,
            ok: false,
            expired: 0,
            candidates: 0,
            sent: 0,
            failed: 0,
            skipped_monthly_cap: 0,
            reminder_enabled: false,
            error: r.reason instanceof Error ? r.reason.message : 'Error desconocido',
          }
    )

    return NextResponse.json({
      ok: true,
      tenants_processed: results.length,
      expired: results.reduce((acc, r) => acc + r.expired, 0),
      sent: results.reduce((acc, r) => acc + r.sent, 0),
      failed: results.reduce((acc, r) => acc + r.failed, 0),
      skipped_monthly_cap: results.reduce((acc, r) => acc + r.skipped_monthly_cap, 0),
      results,
    })
  } catch (error) {
    console.error('[Cron RewardReminder] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Error ejecutando cron de recordatorio de premios' },
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
