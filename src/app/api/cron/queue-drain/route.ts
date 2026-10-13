/**
 * Cron: Queue Drain — el drenador de la cola de goteo (Bloque 2).
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.4 y §7
 * Feature doc: docs/features/send-governance.md
 * Workflow n8n: n8n/cron_queue-drain.json (W4)
 *
 * ⚠️ HISTÓRICO (2026-07-05): `vercel.json` estuvo en `"crons": []` a propósito
 * porque los crons corrían duplicados (Vercel nativo + n8n a la vez) y se dejó
 * n8n como disparador único. De ahí sale la regla que SIGUE VIGENTE: un cron en
 * `vercel.json` y su Schedule Trigger de n8n encendidos a la vez = doble disparo.
 *
 * 2026-09-02: este cron vuelve a quedar DECLARADO en `vercel.json`, con la misma
 * cadencia de 15 minutos que ya tenía el Schedule Trigger de n8n (calco 1:1, cero
 * cambio de cadencia). El disparo efectivo empieza cuando se despliegue a
 * producción con el plan Pro activo, y en ESE MISMO movimiento se apaga el
 * Schedule Trigger de n8n/cron_queue-drain.json. Hasta entonces el disparador
 * vivo sigue siendo n8n. Ver docs/04-deployment.md §2 y §5.
 * Cadencia: cada 15 minutos.
 *
 * QUÉ HACE, EN ORDEN
 * ──────────────────
 * 1. Marca como `expired` lo que se pasó de su ventana. Se hace ANTES de nada
 *    más: no tiene sentido gastar cupo en un cumpleaños de ayer.
 * 2. Pide los tenants con cola pendiente, ordenados por urgencia.
 * 3. Da vueltas por los tenants en ROUND-ROBIN, tomando una tanda pequeña de
 *    cada uno por vuelta. Así un tenant con 5.000 items encolados no deja sin
 *    drenar a los demás (spec §3.4).
 * 4. Por cada item: re-evalúa las guardas de demanda, envía, y aplica los
 *    efectos posteriores (campaign_messages, last_campaign_at, cierre de
 *    campaña).
 * 5. Poda las tablas de retención.
 *
 * LA REGLA CENTRAL: encolar NO es un permiso permanente. Entre el encolado y el
 * turno del item pueden pasar días. Por eso el opt-out, el frequency cap y el
 * cap mensual se vuelven a mirar aquí.
 *
 * LOS TOQUES DEL CICLO (fase 1B, 2026-10-13: items con `cycle_touch_id`). Los demás items no
 * cambian. Para estos, además: (a) guardas nuevas antes de enviar —la marca apagó el ciclo, el
 * cliente volvió o ya no está en el estado que el toque supone → cancelado; ya tiene un regalo
 * de reactivación vivo → el toque se pospone hasta el día siguiente a que ese venza—; (b) la
 * fecha límite del regalo («vence el domingo») se calcula AL ENVIAR; (c) solo si el mensaje
 * salió, se otorga el regalo con ESE vencimiento y se escribe el toque (`sent`, el mensaje, el
 * regalo) y lo que le cambia al cliente. Todo desenlace escribe el toque (H6): lo que solo el
 * drenador sabe (el cap de 7 días y el tope del mes posponen con su fecha) se escribe ANTES de
 * cancelar el item; lo demás lo lleva el trigger de la cola (00071). `src/services/cycle.service.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import { markImportedContactsResult } from '@/services/imported-contacts.service'
import { getTenantById } from '@/lib/tenant'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { resolveGoldenBulletProvider } from '@/services/club-optin.service'
import { getLineBudget } from '@/services/line-budget.service'
import { isPhoneOptedOut } from '@/services/customer.service'
import { getRecoveryZoneConfig } from '@/services/settings.service'
import {
  passesFrequencyCap,
  isInRecoveryZone,
  filterByMonthlyCap,
  finalizeCampaign,
} from '@/services/campaign.service'
import {
  expireQueue,
  getPendingTenants,
  claimQueueBatch,
  markQueueItemSent,
  markQueueItemFailed,
  cancelQueueItem,
  getCampaignQueuedCount,
  getFinishedCampaigns,
  pruneSendGovernance,
  type QueueRow,
} from '@/services/send-queue.service'
import {
  cargarContextoDelCiclo,
  guardaDelItem,
  posponerToque,
  inicioDelMesSiguiente,
  finDelCapDeFrecuencia,
  prepararEnvioDelToque,
  completarToquesEnviados,
  type ContextoDelCicloEnLaTanda,
  type ToqueEnviado,
} from '@/services/cycle.service'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

export const dynamic = 'force-dynamic'
/** El presupuesto de tiempo real lo impone TIME_BUDGET_MS; esto solo evita que
 *  Vercel corte antes de que el drenador pueda cerrar limpio. */
export const maxDuration = 300

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * Presupuesto de tiempo por invocación (spec §3.4). Se corta solo y devuelve
 * `has_more`; la siguiente corrida del cron (15 min después) sigue donde quedó.
 *
 * Era 50 s (el techo del plan Hobby). En Pro, con `maxDuration = 300`, ese
 * número hacía que un bloque de Golden Bullet de 1.400 saliera en ~7 corridas
 * —tres horas— cuando el freno de verdad es el bloque DIARIO (D-7), no la
 * hora del día. 240 s deja 60 s de margen para cerrar limpio (2026-09-11).
 */
const TIME_BUDGET_MS = 240_000

/** Items por tenant y por vuelta del round-robin. Es concurrencia contra el
 *  proveedor, no un tope de volumen: Meta acepta 80 msg/s por número, así que
 *  20 en paralelo sigue muy por debajo. Era 10 (2026-09-11). */
const SLICE = 20

/**
 * Cuánto drenar de un tenant cuyo límite de Meta NO se conoce
 * (`messaging_daily_limit IS NULL`: los tenants anteriores a 00037).
 * `line_budget()` devuelve `campaign_available: null` para ellos, así que no
 * hay techo contra el que medir. Se usa un tope prudente por invocación en vez
 * de vaciarles la cola de golpe.
 */
const SIN_LIMITE_POR_INVOCACION = 50

/**
 * Tipos de mensaje que NO deben tocar `customers.last_campaign_at`.
 * `reward_reminder` está exento del frequency cap a propósito (ver
 * MONTHLY_CAP_SOURCES en constants/rewards.ts): si marcara last_campaign_at,
 * bloquearía las campañas siguientes del cliente.
 */
const NO_MARCAN_ULTIMA_CAMPANA = new Set(['reward_reminder'])

interface Resultado {
  processed: number
  sent: number
  failed: number
  skipped: number
  expired: number
  tenants: number
  has_more: boolean
  cursor: string | null
}

export async function POST(request: NextRequest) {
  return drenar(request)
}

/** GET por consistencia con los otros 4 crons del proyecto. */
export async function GET(request: NextRequest) {
  return drenar(request)
}

async function drenar(request: NextRequest): Promise<NextResponse> {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const inicio = Date.now()
  const res: Resultado = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    expired: 0,
    tenants: 0,
    has_more: false,
    cursor: null,
  }

  try {
    res.expired = await expireQueue()

    const pendientes = await getPendingTenants()
    res.tenants = pendientes.length
    if (pendientes.length === 0) {
      // Aunque no haya nada que drenar puede haber campañas por cerrar: los
      // items que expireQueue() acaba de vencer, o los que el operador canceló
      // desde el dashboard, vacían una cola sin pasar por el envío.
      await cerrarCampanasTerminadas()
      await pruneSendGovernance()
      return NextResponse.json({ ok: true, ...res })
    }

    // Tenants que ya no admiten más en esta invocación (sin cupo, sin cola, o
    // inutilizables). Salen del round-robin.
    const agotados = new Set<string>()

    while (agotados.size < pendientes.length) {
      if (Date.now() - inicio > TIME_BUDGET_MS) {
        res.has_more = true
        break
      }

      let huboTrabajo = false

      for (const { tenant_id: tenantId } of pendientes) {
        if (agotados.has(tenantId)) continue
        if (Date.now() - inicio > TIME_BUDGET_MS) {
          res.has_more = true
          break
        }

        const tanda = await drenarTenant(tenantId, res)
        if (tanda.agotado) {
          agotados.add(tenantId)
          if (tanda.quedaCola) res.has_more = true
        }
        if (tanda.procesados > 0) {
          huboTrabajo = true
          res.cursor = tenantId
        }
      }

      // Vuelta completa sin procesar nada: no hay nada más que hacer.
      if (!huboTrabajo) break
    }

    await cerrarCampanasTerminadas()
    await pruneSendGovernance()
    return NextResponse.json({ ok: true, ...res })
  } catch (error) {
    console.error('[QueueDrain]', error)
    return NextResponse.json(
      { error: 'Error del servidor', ...res },
      { status: 500 }
    )
  }
}

interface ResultadoTanda {
  procesados: number
  /** El tenant sale del round-robin. */
  agotado: boolean
  /** Se agotó por cupo o tiempo, no porque la cola esté vacía. */
  quedaCola: boolean
}

async function drenarTenant(tenantId: string, res: Resultado): Promise<ResultadoTanda> {
  const tenant = await getTenantById(tenantId)
  if (!tenant) {
    console.warn(`[QueueDrain] Tenant ${tenantId} no encontrado — se salta`)
    return { procesados: 0, agotado: true, quedaCola: true }
  }

  // Cuánto cupo de campaña queda AHORA. Se relee en cada vuelta a propósito:
  // entre tanda y tanda pueden haber salido bienvenidas y check-ins que
  // consumieron límite.
  let disponible: number
  try {
    const presupuesto = await getLineBudget(tenantId)

    if (presupuesto.lineStatus === 'frozen') {
      // Línea congelada: las campañas no salen. No se cancelan los items —
      // esperan a que un humano reactive la línea (spec §3.5: no hay
      // des-congelamiento automático).
      return { procesados: 0, agotado: true, quedaCola: true }
    }

    disponible = presupuesto.enforced
      ? (presupuesto.campaignAvailable ?? 0)
      : SIN_LIMITE_POR_INVOCACION
  } catch (err) {
    // Falla CERRADO, igual que la guarda de presupuesto del choke-point: si no
    // se puede confirmar que hay cupo, no se envía.
    console.error(`[QueueDrain] No se pudo leer el presupuesto de ${tenantId}:`, err)
    return { procesados: 0, agotado: true, quedaCola: true }
  }

  if (disponible <= 0) return { procesados: 0, agotado: true, quedaCola: true }

  const items = await claimQueueBatch(tenantId, Math.min(disponible, SLICE))
  if (items.length === 0) return { procesados: 0, agotado: true, quedaCola: false }

  // Las campañas de TODOS los items reclamados, no solo las de los que
  // sobreviven a las guardas. Si una tanda se cancela entera —por ejemplo los
  // últimos 6 items de una campaña cuyos clientes hicieron opt-out mientras
  // esperaban—, esa campaña se quedaría en `running` para siempre: su cola
  // llega a 0, el tenant deja de aparecer en `send_queue_pending_tenants()` y
  // el drenador no vuelve a mirarla nunca.
  const campanasTocadas = new Set<string>()
  for (const item of items) {
    if (item.campaign_id) campanasTocadas.add(item.campaign_id)
  }

  // ── Re-evaluación de las guardas de demanda ──
  // Se hace sobre la tanda entera (2 consultas) en vez de por item.
  //
  // Si una guarda no se puede verificar (hoy: el tope mensual, que desde N7 LANZA ante un
  // fallo de base en vez de contestar «nadie llegó»), la tanda NO sale: vuelve a la cola
  // con backoff por `markQueueItemFailed()` —el mismo camino que un fallo de envío, con su
  // tope de intentos— y el tenant sale de esta vuelta. Las demás marcas siguen drenando:
  // un `throw` acá tumbaba la corrida entera.
  let permitidos: QueueRow[]
  // Los toques del ciclo de la tanda (solo si hay alguno): sus guardas se leen acá, dentro del
  // mismo try, así que una lectura que falla devuelve la tanda a la cola como cualquier guarda.
  let ciclo: ContextoDelCicloEnLaTanda | null = null
  try {
    if (items.some((i) => i.cycle_touch_id)) ciclo = await cargarContextoDelCiclo(tenantId, items)
    permitidos = await filtrarPorGuardas(tenantId, items, res, ciclo)
  } catch (err) {
    const motivo = `No se pudieron verificar las guardas de envío: ${err instanceof Error ? err.message : 'error desconocido'}`
    console.error(`[QueueDrain][FALLO] reason=guardas_error tenant=${tenantId} detalle="${motivo}"`)
    for (const item of items) await markQueueItemFailed(item, motivo)
    return { procesados: 0, agotado: true, quedaCola: true }
  }

  const enviadosParaMarcar: string[] = []
  // Golden Bullet: los contactos importados no son clientes, así que no caben
  // en `campaign_messages`. Su resultado se anota en `imported_contacts`.
  const importadosEnviados: { id: string; sid: string | null }[] = []
  const importadosRebotados: string[] = []
  const registrosCampana: Array<{
    campaign_id: string
    customer_id: string
    status: string
    tenant_id: string
    twilio_sid: string | null
    sent_at: string | null
    error_message: string | null
  }> = []

  // El Golden Bullet puede salir por OTRA línea que el resto de la marca
  // (la de coexistencia en Zernio, mientras lo normal sigue en Twilio). Se
  // resuelve una vez por tanda y solo si hay items de importación en ella.
  const proveedorGoldenBullet = permitidos.some((item) => item.message_type === 'import')
    ? await resolveGoldenBulletProvider(tenant)
    : null

  // Un toque del ciclo sale con la fecha límite de su regalo calculada AHORA, no al encolar.
  const alEnviar = new Date()
  const envioDelCiclo = new Map<string, { variables: Record<string, string>; vence: Date | null }>()
  for (const item of permitidos) {
    const toque = item.cycle_touch_id ? ciclo?.toques.get(item.cycle_touch_id) : undefined
    if (toque) envioDelCiclo.set(item.id, prepararEnvioDelToque(item, toque, alEnviar))
  }

  // Lotes concurrentes, igual que las campañas.
  const resultados = await Promise.all(
    permitidos.map(async (item) => {
      try {
        const proveedor =
          item.message_type === 'import' && proveedorGoldenBullet
            ? proveedorGoldenBullet
            : tenant.messaging_provider === 'zernio'
              ? 'zernio'
              : 'twilio'
        const enviado = await sendTemplateMessage(
          item.phone,
          item.template_sid,
          envioDelCiclo.get(item.id)?.variables ?? item.variables ?? {},
          tenant,
          { customerId: item.customer_id, messageType: item.message_type },
          { ...construirOpciones(item, proveedor), provider: proveedor }
        )
        return { item, enviado, error: null as string | null }
      } catch (err) {
        return {
          item,
          enviado: null,
          error: err instanceof Error ? err.message : 'Error desconocido',
        }
      }
    })
  )

  const ahora = new Date().toISOString()

  for (const { item, enviado, error } of resultados) {
    res.processed++

    if (enviado) {
      res.sent++
      await markQueueItemSent(item.id)
      if (item.customer_id && !NO_MARCAN_ULTIMA_CAMPANA.has(item.message_type)) {
        enviadosParaMarcar.push(item.customer_id)
      }
      if (item.imported_contact_id) {
        importadosEnviados.push({ id: item.imported_contact_id, sid: enviado.sid })
      }
      if (item.campaign_id && item.customer_id) {
        registrosCampana.push({
          campaign_id: item.campaign_id,
          customer_id: item.customer_id,
          status: 'sent',
          tenant_id: tenantId,
          twilio_sid: enviado.sid,
          sent_at: ahora,
          error_message: null,
        })
      }
    } else {
      // `sendTemplateMessage()` devuelve `null` para TODOS sus modos de fallo:
      // sin credenciales, opt-out, presupuesto agotado, rechazo del proveedor.
      // El drenador no puede distinguirlos desde aquí, así que trata el fallo
      // como reintentable y deja que `attempts` decida cuándo rendirse. Es
      // conservador a propósito: un item que se reintenta 3 veces cuesta
      // milisegundos; uno cancelado por error se pierde para siempre.
      const motivo = error ?? 'El proveedor rechazó el envío o no había cupo'
      const destino = await markQueueItemFailed(item, motivo)
      if (destino === 'failed') {
        res.failed++
        // Solo al RENDIRSE (3er intento). Un fallo reintentable no marca nada:
        // el contacto sigue en cola y todavía puede salir.
        if (item.imported_contact_id) importadosRebotados.push(item.imported_contact_id)
        if (item.campaign_id && item.customer_id) {
          registrosCampana.push({
            campaign_id: item.campaign_id,
            customer_id: item.customer_id,
            status: 'failed',
            tenant_id: tenantId,
            twilio_sid: null,
            sent_at: null,
            error_message: motivo,
          })
        }
      }
    }
  }

  const db = getServiceClient()

  // Los mensajes YA salieron: estas escrituras no se pueden «deshacer» lanzando, pero un
  // fallo no puede pasar callado (N8). Sin `last_campaign_at` el cliente queda expuesto a
  // otra campaña dentro de los 7 días; sin la fila de `campaign_messages` el tope mensual y
  // las dedups no ven este envío. Queda en el log con la causa, para corregirlo a mano.
  if (enviadosParaMarcar.length > 0) {
    const { error: marcarError } = await db
      .from('customers')
      .update({ last_campaign_at: ahora })
      .in('id', enviadosParaMarcar)
      .eq('tenant_id', tenantId)
    if (isDbFailure(marcarError)) {
      logDbFailure({
        scope: 'QueueDrain',
        reason: 'last_campaign_at_error',
        error: marcarError,
        context: { tenant_id: tenantId, clientes: enviadosParaMarcar.length },
      })
    }
  }
  // Los ids de vuelta: el toque del ciclo guarda qué fila de `campaign_messages` es su envío.
  const mensajeDe = new Map<string, string>()
  if (registrosCampana.length > 0) {
    const { data: grabados, error: registroError } = await db
      .from('campaign_messages')
      .insert(registrosCampana)
      .select('id, campaign_id, customer_id, status')
    for (const g of (grabados ?? []) as Array<{ id: string; campaign_id: string; customer_id: string; status: string }>) {
      if (g.status === 'sent') mensajeDe.set(`${g.campaign_id}|${g.customer_id}`, g.id)
    }
    if (isDbFailure(registroError)) {
      logDbFailure({
        scope: 'QueueDrain',
        reason: 'campaign_messages_insert_error',
        error: registroError,
        context: {
          tenant_id: tenantId,
          filas: registrosCampana.length,
          campanas: [...new Set(registrosCampana.map((r) => r.campaign_id))].join(','),
        },
      })
    }
  }
  await markImportedContactsResult(importadosEnviados, importadosRebotados)

  // ── Los toques del ciclo que SALIERON: el regalo, el libro de toques y el cliente ──
  if (ciclo) {
    const enviadosDelCiclo: ToqueEnviado[] = []
    for (const { item, enviado } of resultados) {
      const toque = item.cycle_touch_id ? ciclo.toques.get(item.cycle_touch_id) : undefined
      const envio = envioDelCiclo.get(item.id)
      if (!enviado || !toque || !envio) continue
      enviadosDelCiclo.push({
        item,
        toque,
        variables: envio.variables,
        vence: envio.vence,
        campaignMessageId: mensajeDe.get(`${item.campaign_id}|${item.customer_id}`) ?? null,
        heartbeatsSent: ciclo.clientes.get(item.customer_id!)?.heartbeats_sent ?? 0,
      })
    }
    if (enviadosDelCiclo.length > 0) await completarToquesEnviados(tenantId, enviadosDelCiclo)
  }

  await cerrarCampanasVacias(campanasTocadas)

  return { procesados: items.length, agotado: false, quedaCola: true }
}

/**
 * Re-evalúa las guardas de demanda sobre una tanda ya reclamada.
 * Lo que no pasa se CANCELA (no es un fallo: no se reintenta ni gasta intentos).
 *
 * Un toque del ciclo que no pasa el cap de 7 días o el tope del mes no se pierde: su toque se
 * pospone (`deferred`, con la fecha en que vuelve a poder) ANTES de cancelar el item.
 */
async function filtrarPorGuardas(
  tenantId: string,
  items: QueueRow[],
  res: Resultado,
  ciclo: ContextoDelCicloEnLaTanda | null
): Promise<QueueRow[]> {
  const db = getServiceClient()

  // ── 1. Opt-out ──
  // `sendTemplateMessage()` ya lo mira, pero ahí el item se contabilizaría como
  // fallo reintentable y volvería 3 veces. Mirarlo aquí lo cancela de una.
  const trasOptOut: QueueRow[] = []
  for (const item of items) {
    if (await isPhoneOptedOut(item.phone, tenantId)) {
      await cancelQueueItem(item.id, 'El cliente hizo opt-out después de encolarse')
      res.skipped++
    } else {
      trasOptOut.push(item)
    }
  }

  // Los items sin cliente (Golden Bullet) no tienen guardas de demanda que
  // re-evaluar: no hay `customers` que consultar.
  const conCliente = trasOptOut.filter((i) => i.customer_id)
  const sinCliente = trasOptOut.filter((i) => !i.customer_id)
  if (conCliente.length === 0) return sinCliente

  const ids = [...new Set(conCliente.map((i) => i.customer_id!))]
  const { data: clientes, error } = await db
    .from('customers')
    .select('id, last_campaign_at, last_visit_at, whatsapp_opt_out_at')
    .in('id', ids)
    .eq('tenant_id', tenantId)

  if (error) {
    // Sin poder verificar, se deja pasar: el choke-point de envío vuelve a
    // mirar el opt-out por su cuenta y el presupuesto ya está reservado.
    console.error('[QueueDrain] No se pudieron releer los clientes:', error.message)
    return trasOptOut
  }

  const porId = new Map((clientes ?? []).map((c) => [c.id as string, c]))

  // La ventana reservada al cron, según los días que este tenant configuró.
  // Se lee una vez por tanda, no por item.
  const recoveryZone = await getRecoveryZoneConfig(tenantId)

  // ── 2. Frequency cap ──
  // Puede haberle llegado otra campaña entre el encolado y ahora.
  // `birthday` y `reward_reminder` están exentos por diseño (ver
  // MONTHLY_CAP_SOURCES en constants/rewards.ts).
  //
  // `calendar_event` también está exento, y por una razón distinta a las otras dos: el
  // camino INMEDIATO de `executeAutoEvent()` nunca aplicó el frequency cap. Si el
  // drenador se lo aplicara, la mitad encolada de UN MISMO evento se comportaría distinto
  // de la mitad que salió al instante — la gente que no cupo en el presupuesto de hoy
  // quedaría sin invitación justo por haber quedado de última en la lista.
  const EXENTOS_DEL_CAP = new Set(['birthday', 'reward_reminder', 'calendar_event'])
  const trasCap: QueueRow[] = []
  for (const item of conCliente) {
    const cliente = porId.get(item.customer_id!)
    if (!cliente) {
      // El cliente se borró después de encolarse.
      await cancelQueueItem(item.id, 'El cliente ya no existe')
      res.skipped++
      continue
    }

    // ── Las guardas del ciclo (solo items con `cycle_touch_id`) ──
    if (item.cycle_touch_id && ciclo) {
      const guarda = guardaDelItem(item, ciclo, new Date())
      if (guarda.tipo !== 'enviar') {
        if (guarda.tipo === 'posponer') await posponerToque(tenantId, item.cycle_touch_id, guarda.dueAt, guarda.motivo)
        await cancelQueueItem(item.id, guarda.motivo)
        res.skipped++
        continue
      }
    }

    if (
      !EXENTOS_DEL_CAP.has(item.message_type) &&
      !passesFrequencyCap(cliente.last_campaign_at as string | null)
    ) {
      if (item.cycle_touch_id) {
        await posponerToque(
          tenantId,
          item.cycle_touch_id,
          finDelCapDeFrecuencia(cliente.last_campaign_at as string | null, new Date()),
          'Recibió otra campaña mientras esperaba en la cola'
        )
      }
      await cancelQueueItem(item.id, 'Recibió otra campaña mientras esperaba en la cola')
      res.skipped++
      continue
    }

    // ── Recovery Zone ──
    // El spec §3.4 dice textualmente que un cliente puede «haber visitado el
    // restaurante (y dejar de ser "inactivo")» entre el encolado y el envío.
    // Si volvió y cayó en la ventana de recuperación, queda reservado para el
    // cron de reactivación personalizado y la campaña manual no lo toca — la
    // misma regla que se le aplicó al crear la campaña.
    //
    // Solo para 'manual': es el único emisor que filtra por Recovery Zone.
    // La ventana es la MISMA que se aplicó al crear la campaña: derivada de los
    // días de reactivación de este tenant, no las constantes fijas.
    if (
      item.message_type === 'manual' &&
      isInRecoveryZone(cliente.last_visit_at as string | null, recoveryZone)
    ) {
      await cancelQueueItem(item.id, 'Volvió al restaurante: entró en la zona de recuperación')
      res.skipped++
      continue
    }

    trasCap.push(item)
  }

  // ── 3. Cap mensual ──
  if (trasCap.length === 0) return sinCliente

  const { excluded } = await filterByMonthlyCap(
    trasCap.map((i) => ({ id: i.customer_id!, item: i }))
  )
  const excluidos = new Set(excluded.map((e) => e.item.id))
  const finales: QueueRow[] = []
  for (const item of trasCap) {
    if (excluidos.has(item.id)) {
      if (item.cycle_touch_id) {
        await posponerToque(
          tenantId,
          item.cycle_touch_id,
          inicioDelMesSiguiente(new Date()),
          'Llegó a su cap mensual mientras esperaba en la cola'
        )
      }
      await cancelQueueItem(item.id, 'Llegó a su cap mensual mientras esperaba en la cola')
      res.skipped++
    } else {
      finales.push(item)
    }
  }

  return [...sinCliente, ...finales]
}

/**
 * Reconstruye las opciones de envío según el PROVEEDOR ACTUAL del envío, no
 * según el que tenía al encolar. Un tenant puede migrar de Twilio a Zernio
 * mientras su cola gotea — y un item de Golden Bullet puede salir por Zernio
 * con la marca todavía en Twilio (ver `resolveGoldenBulletProvider`).
 *
 * Twilio y Zernio pasan la media de forma incompatible: en Twilio viaja como
 * una VARIABLE de la plantilla (y hay que impedir que el reintento por 21665 la
 * suelte); en Zernio va aparte, como `headerMedia` con una URL pública.
 */
function construirOpciones(
  item: QueueRow,
  proveedor: string | null | undefined
): { keepAllVariables?: boolean; headerMediaUrl?: string; headerMediaType?: 'image' | 'video' } | undefined {
  if (!item.media_url) return undefined

  if (proveedor === 'zernio') {
    return {
      headerMediaUrl: item.media_url,
      headerMediaType: item.media_type === 'video' ? 'video' : 'image',
    }
  }
  return { keepAllVariables: true }
}

/**
 * Una campaña solo pasa a `completed` cuando su cola queda vacía (spec §3.4).
 * Mientras gotee sigue `running`, y el dashboard muestra "N de M enviados".
 */
async function cerrarCampanasVacias(campanaIds: Set<string>): Promise<void> {
  if (campanaIds.size === 0) return
  const db = getServiceClient()

  for (const campaignId of campanaIds) {
    const pendientes = await getCampaignQueuedCount(campaignId)
    if (pendientes > 0) continue

    // `total_sent` se recalcula desde campaign_messages, que es el libro real
    // de lo que salió — sumar incrementos se desincroniza con los reintentos.
    const { count, error } = await db
      .from('campaign_messages')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')

    if (error) {
      // Sin el conteo real no se cierra. Cerrar con `count ?? 0` escribiría
      // `total_sent = 0` en una campaña que sí envió, y como `finalizeCampaign`
      // la deja en 'completed' nadie volvería a corregir ese número.
      // Dejarla 'running' es recuperable: la próxima corrida lo reintenta.
      console.error(
        `[QueueDrain] No se pudo contar los enviados de la campaña ${campaignId}; se deja abierta: ${error.message}`
      )
      continue
    }

    await finalizeCampaign(campaignId, count ?? 0)
  }
}

/**
 * Cierra las campañas que se quedaron sin cola por caminos que NO pasan por el
 * envío: `expireQueue()` (corre antes del round-robin), la cancelación desde el
 * dashboard, o una tanda que las guardas cancelaron entera.
 *
 * Sin esto, esas campañas se quedan en `running` para siempre: su cola llega a
 * 0, el tenant deja de aparecer en `send_queue_pending_tenants()` y el drenador
 * no vuelve a mirarlas nunca.
 */
async function cerrarCampanasTerminadas(): Promise<void> {
  const terminadas = await getFinishedCampaigns()
  if (terminadas.length > 0) {
    await cerrarCampanasVacias(new Set(terminadas))
  }
}
