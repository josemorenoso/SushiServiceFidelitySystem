import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getNextReward, getRewardTitle, getRewardById } from '@/services/reward.service'
import {
  filterByMonthlyCap,
  getActiveBlackouts,
  passesFrequencyCap,
  isInRecoveryZone,
} from '@/services/campaign.service'
import { canSendBulk } from '@/services/wallet.service'
import { getLineBudget } from '@/services/line-budget.service'
import { enqueueSendBatch, type EnqueueItem } from '@/services/send-queue.service'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { getRecoveryZoneConfig } from '@/services/settings.service'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

interface ManualCampaignBody {
  name: string
  filters: {
    city: string
    minVisits: string
    maxVisits: string
    minAge: string
    maxAge: string
    source: string
    /** Días mínimos sin venir (última visita hace N días o más) */
    minDays?: string
    /** Días máximos sin venir (última visita hace M días o menos) */
    maxDays?: string
  }
  templateSid: string
  messageTemplate: string
  /**
   * Qué recompensa mostrar en {{3}}:
   *  - 'auto' (default): próxima recompensa de cada cliente
   *  - uuid: recompensa fija para todos los clientes
   *  - 'none': la plantilla no usa {{3}} (sólo {{1}}, {{2}})
   */
  rewardId?: string | 'auto' | 'none'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = (await request.json()) as ManualCampaignBody
    const { name, filters, templateSid, messageTemplate, rewardId = 'auto' } = body

    if (!templateSid) {
      return NextResponse.json({ error: 'Plantilla requerida' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const db = getServiceClient()

    // Create campaign record
    const { data: campaign, error: campaignError } = await db
      .from('campaigns')
      .insert({
        name: name || 'Campaña Manual',
        type: 'manual',
        source: 'manual',
        status: 'running',
        message_template: messageTemplate || templateSid,
        filters: filters as Record<string, unknown>,
        executed_at: new Date().toISOString(),
        tenant_id: tenantId,
      })
      .select()
      .single()

    if (campaignError) {
      console.error('[ManualCampaign] Error creating campaign:', campaignError)
      return NextResponse.json({ error: 'Error creando campaña' }, { status: 500 })
    }

    // Fetch matching customers
    let query = db.from('customers').select('id, phone, name, total_visits, total_points, last_campaign_at, last_visit_at, source_channels, accepts_marketing')
    query = query.eq('tenant_id', tenantId)
    query = query.eq('accepts_marketing', true)
    query = query.is('whatsapp_opt_out_at', null)
    if (filters.city) query = query.ilike('city', `%${filters.city}%`)
    if (filters.minVisits) query = query.gte('total_visits', parseInt(filters.minVisits))
    if (filters.maxVisits) query = query.lte('total_visits', parseInt(filters.maxVisits))
    if (filters.source && filters.source !== 'all') {
      if (filters.source === 'qr_only') {
        query = query.eq('source_channels', 'qr')
      } else if (filters.source === 'delivery_only') {
        query = query.eq('source_channels', 'delivery')
      }
    }
    if (filters.minAge) {
      const maxBirthday = new Date()
      maxBirthday.setFullYear(maxBirthday.getFullYear() - parseInt(filters.minAge))
      query = query.lte('birthday', maxBirthday.toISOString().split('T')[0])
    }
    if (filters.maxAge) {
      const minBirthday = new Date()
      minBirthday.setFullYear(minBirthday.getFullYear() - parseInt(filters.maxAge) - 1)
      query = query.gte('birthday', minBirthday.toISOString().split('T')[0])
    }
    // Días sin venir (mismo criterio que estimate/route.ts):
    // ambos filtros excluyen clientes sin last_visit_at (inactividad no medible).
    if (filters.minDays) {
      const cutoff = new Date(Date.now() - parseInt(filters.minDays) * 24 * 60 * 60 * 1000).toISOString()
      query = query.lte('last_visit_at', cutoff)
    }
    if (filters.maxDays) {
      const cutoff = new Date(Date.now() - (parseInt(filters.maxDays) + 1) * 24 * 60 * 60 * 1000).toISOString()
      query = query.gt('last_visit_at', cutoff)
    }

    const { data: customers, error: customersError } = await query

    // Esta lectura ES la audiencia de la campaña, que ya se creó arriba como 'running'.
    // Ante un fallo de base `customers` llegaba `null` → 0 elegibles → la campaña se
    // marcaba 'completed' con total_sent=0, mintiendo que corrió a una audiencia vacía en
    // vez de avisar que no se pudo ni leer la audiencia. Se deshace la campaña fantasma,
    // igual que en el bloqueo por saldo insuficiente de más abajo.
    if (isDbFailure(customersError)) {
      logDbFailure({
        scope: 'ManualCampaign',
        reason: 'audience_lookup_error',
        error: customersError,
        context: { tenant_id: tenantId, campaign_id: campaign.id },
      })
      await db.from('campaigns').delete().eq('id', campaign.id)
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos leer la audiencia para esta campaña. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }

    // Frequency cap: excluir clientes contactados en los últimos FREQUENCY_CAP_DAYS días.
    // La regla vive en campaign.service.ts para que el drenador de la cola use
    // EXACTAMENTE la misma al re-evaluarla en el momento del envío.
    const afterFrequencyCap = (customers ?? []).filter((c) => passesFrequencyCap(c.last_campaign_at))
    const skipped = (customers?.length ?? 0) - afterFrequencyCap.length

    // Recovery Zone: excluir clientes dentro de la ventana reservada al cron de
    // reactivación personalizado. La ventana se DERIVA de los días que este tenant
    // configuró en Ajustes: si bajó el toque suave a 15, la zona baja con él y los
    // días 15-17 quedan protegidos (con 18-25 fijo, no lo estaban).
    const recoveryZone = await getRecoveryZoneConfig(tenantId)
    const afterRecoveryZone = afterFrequencyCap.filter((c) => !isInRecoveryZone(c.last_visit_at, recoveryZone))
    const skippedRecoveryZone = afterFrequencyCap.length - afterRecoveryZone.length

    // Pre-event blackout: hoy solo informativo — la exclusión real la hacen el
    // frequency cap + monthly cap. Se mantiene la consulta para trazabilidad.
    await getActiveBlackouts(tenantId)
    const eligible = afterRecoveryZone
    const skippedBlackout = 0

    // Monthly cap: máximo 3 mensajes de marketing por mes por cliente
    const { eligible: finalEligible, excluded: excludedMonthlyCap } = await filterByMonthlyCap(eligible)
    const skippedMonthlyCap = excludedMonthlyCap.length

    // ─── Bloqueo por saldo (spec W-D6) ───
    // Las campañas masivas SÍ se bloquean sin saldo: son las que queman el
    // presupuesto del tenant. Se valida contra el número real a enviar
    // (finalEligible), después de todos los filtros. No se envía parcial: media
    // campaña es peor que ninguna y deja al tenant en negativo.
    if (finalEligible.length > 0) {
      const budget = await canSendBulk(tenantId, finalEligible.length)
      if (!budget.ok) {
        // Deshacer la campaña vacía para no dejar un registro fantasma "running".
        await db.from('campaigns').delete().eq('id', campaign.id)
        return NextResponse.json(
          {
            error: 'Saldo insuficiente para esta campaña',
            reason: 'insufficient_balance',
            balanceCop: budget.balanceCop,
            pricePerMessage: budget.pricePerMessage,
            messagesAvailable: budget.messagesAvailable,
            recipients: finalEligible.length,
            shortfallCop: budget.shortfallCop,
          },
          { status: 409 }
        )
      }
    }

    // Pre-compute reward titles según rewardId:
    //  - 'auto': título de próxima recompensa por total_visits (1 query por valor único)
    //  - 'none': sin {{3}}
    //  - uuid: 1 sola query, mismo título para todos
    const titleByVisits: Record<number, string> = {}
    let fixedRewardTitle: string | null = null
    let useReward3 = true

    if (rewardId === 'none') {
      useReward3 = false
    } else if (rewardId && rewardId !== 'auto') {
      const fixedReward = await getRewardById(rewardId)
      fixedRewardTitle = fixedReward?.title ?? 'más beneficios'
    } else {
      const uniqueVisitCounts = [...new Set(eligible.map((c) => c.total_visits))]
      await Promise.all(
        uniqueVisitCounts.map(async (v) => {
          const next = await getNextReward(v, tenantId)
          titleByVisits[v] = getRewardTitle(next)
        })
      )
    }

    // ─── Partir la campaña: lo que cabe HOY y lo que va a la cola ───
    // Spec §3.4. Antes del Bloque 2, los destinatarios que no cabían en el
    // presupuesto de línea se intentaban igual y se perdían: el choke-point los
    // marcaba `failed` con error_code='campaign_budget_exhausted'. Ahora se
    // guardan y gotean en los días siguientes.
    //
    // Se pregunta el cupo ANTES de enviar nada, no se descubre agotándolo.
    let cabenHoy = finalEligible
    let aLaCola: typeof finalEligible = []
    let presupuestoNota: string | null = null

    try {
      const linea = await getLineBudget(tenantId)
      if (linea.lineStatus === 'frozen') {
        // Línea congelada por calidad: no sale ninguna campaña. Todo a la cola,
        // a esperar que un humano la reactive (no hay des-congelamiento
        // automático — spec §3.5).
        cabenHoy = []
        aLaCola = finalEligible
        presupuestoNota = 'La línea está congelada por calidad: la campaña queda entera en cola.'
      } else if (linea.enforced && linea.campaignAvailable !== null) {
        if (finalEligible.length > linea.campaignAvailable) {
          cabenHoy = finalEligible.slice(0, linea.campaignAvailable)
          aLaCola = finalEligible.slice(linea.campaignAvailable)
          presupuestoNota = `Hoy caben ${cabenHoy.length}; los otros ${aLaCola.length} se envían solos en los próximos días.`
        }
      }
      // `enforced: false` (tenants anteriores a 00037, sin límite conocido):
      // se envía todo, como siempre. Imponerles un tope inventado les cortaría
      // campañas que hoy salen sin problema.
    } catch (err) {
      // No se pudo leer el presupuesto. Se sigue con el comportamiento de
      // antes del Bloque 2 (intentarlo todo): el choke-point vuelve a mirar el
      // cupo por cada envío y falla cerrado si tampoco puede confirmarlo, así
      // que no se puede pasar del límite por esta rama.
      console.error('[ManualCampaign] No se pudo leer el presupuesto de línea:', err)
    }

    // Send en paralelo en batches para evitar timeout + saturar Twilio
    const BATCH_SIZE = 10
    const now = new Date().toISOString()
    let sent = 0
    let failed = 0
    const messageRecords: { campaign_id: string; customer_id: string; status: string; tenant_id: string; twilio_sid: string | null; sent_at: string | null; error_message: string | null }[] = []
    const sentCustomerIds: string[] = []
    /** Los que no salieron hoy y se mandan a la cola en vez de darlos por perdidos. */
    const reintentar: { customer: (typeof finalEligible)[number]; error: string | null }[] = []

    for (let i = 0; i < cabenHoy.length; i += BATCH_SIZE) {
      const batch = cabenHoy.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (customer) => {
          try {
            const variables: Record<string, string> = {
              '1': customer.name,
              '2': String(customer.total_points ?? 0),
            }
            if (useReward3) {
              variables['3'] = fixedRewardTitle ?? titleByVisits[customer.total_visits] ?? 'más beneficios'
            }
            const result = await sendTemplateMessage(customer.phone, templateSid, variables, tenant, { customerId: customer.id, messageType: 'manual' })
            return { customer, result, error: null as string | null }
          } catch (err) {
            return {
              customer,
              result: null,
              error: err instanceof Error ? err.message : 'Error desconocido',
            }
          }
        })
      )

      for (const { customer, result, error } of results) {
        if (result) {
          sent++
          sentCustomerIds.push(customer.id)
          messageRecords.push({
            campaign_id: campaign.id,
            customer_id: customer.id,
            status: 'sent',
            tenant_id: tenantId,
            twilio_sid: result.sid,
            sent_at: now,
            error_message: null,
          })
        } else {
          // NO se marca `failed` todavía: se manda a la cola para reintentarlo.
          //
          // `sendTemplateMessage()` devuelve `null` para todos sus modos de
          // fallo, y uno de ellos es justamente que el cupo se agotó entre que
          // se leyó el presupuesto y que salió este envío (una bienvenida o un
          // check-in pueden habérselo comido). Marcarlos `failed` aquí perdía a
          // esos clientes en silencio — exactamente lo que el Bloque 2 existe
          // para evitar.
          //
          // El drenador los reintenta con backoff y se rinde a los 3 intentos,
          // así que un número realmente malo termina igual en `failed`, solo
          // que unas horas más tarde y dejando rastro en `send_queue`.
          reintentar.push({ customer, error })
        }
      }
    }

    // Bulk update last_campaign_at para todos los enviados (1 query)
    if (sentCustomerIds.length > 0) {
      await db
        .from('customers')
        .update({ last_campaign_at: now })
        .in('id', sentCustomerIds)
    }

    // ─── Encolar lo que no salió hoy ───
    // Dos grupos: los que el presupuesto dejó fuera de entrada (`aLaCola`) y los
    // que se intentaron y no salieron (`reintentar`). Se encola DESPUÉS de
    // enviar, para que un fallo aquí no impida que salgan los de hoy.
    const aEncolar = [
      ...aLaCola.map((customer) => ({ customer, error: null as string | null })),
      ...reintentar,
    ]

    let queued = 0
    let queueError: string | null = null

    if (aEncolar.length > 0) {
      try {
        const items: EnqueueItem[] = aEncolar.map(({ customer }) => {
          const variables: Record<string, string> = {
            '1': customer.name,
            '2': String(customer.total_points ?? 0),
          }
          if (useReward3) {
            variables['3'] = fixedRewardTitle ?? titleByVisits[customer.total_visits] ?? 'más beneficios'
          }
          return {
            tenantId,
            phone: customer.phone,
            customerId: customer.id,
            campaignId: campaign.id,
            messageType: 'manual',
            templateSid,
            variables,
          }
        })
        queued = (await enqueueSendBatch(items)).enqueued
      } catch (err) {
        // El encolado falló: estos clientes NO van a recibir nada y nadie los va
        // a reintentar. Se registran como `failed` con el motivo real —
        // perderlos en silencio mientras la respuesta promete "se envían solos"
        // es el peor desenlace posible.
        queueError = err instanceof Error ? err.message : 'Error desconocido al encolar'
        console.error('[ManualCampaign] No se pudo encolar el resto:', err)
        for (const { customer, error } of aEncolar) {
          failed++
          messageRecords.push({
            campaign_id: campaign.id,
            customer_id: customer.id,
            status: 'failed',
            tenant_id: tenantId,
            twilio_sid: null,
            sent_at: null,
            error_message: error ?? `No se pudo encolar: ${queueError}`,
          })
        }
      }
    }

    // Bulk insert message records — va DESPUÉS del encolado porque el catch de
    // arriba puede añadir filas.
    if (messageRecords.length > 0) {
      await db.from('campaign_messages').insert(messageRecords)
    }

    // Update campaign status
    // Una campaña con cola pendiente sigue `running`: marcarla `completed`
    // mientras gotea le miente al operador (spec §3.4).
    await db
      .from('campaigns')
      .update({ status: queued > 0 ? 'running' : 'completed', total_sent: sent })
      .eq('id', campaign.id)

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      totalSent: sent,
      totalFailed: failed,
      totalQueued: queued,
      totalEligible: finalEligible.length,
      budgetNote: presupuestoNota,
      queueError,
      totalSkippedFrequencyCap: skipped,
      totalSkippedRecoveryZone: skippedRecoveryZone,
      totalSkippedMonthlyCap: skippedMonthlyCap,
      totalSkippedBlackout: skippedBlackout,
    })
  } catch (error) {
    console.error('[ManualCampaign]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
