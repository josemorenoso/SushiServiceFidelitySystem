/**
 * El ciclo de recuperación con I/O (fase 1B, 2026-10-13): lo que corre el cron de
 * reactivación por cada marca con el ciclo ENCENDIDO, y lo que el drenador necesita para
 * los items de la cola que son toques del ciclo.
 *
 * El CRON decide y encola (`ejecutarCicloDeLaMarca()`); no envía nada. El DRENADOR envía a
 * la hora de la marca, calcula la fecha límite en ese momento, otorga el regalo SOLO si el
 * mensaje salió y escribe el resultado en el libro de toques (`completarToquesEnviados()`).
 * Las decisiones son de `src/lib/cycle-touch.ts` y `src/lib/cycle-engine.ts` (puros); acá solo
 * se lee, se escribe y se llama.
 *
 * Las reglas de la pieza (con qué tipo y fuente se graba, qué topes le aplican, qué la
 * pospone) salen del motor de piezas (`src/lib/communications/registry.ts`), no de copias.
 *
 * Reglas de la casa que se cumplen acá: todo INSERT lleva `tenant_id` explícito; la sede del
 * toque y de la cola es NULL (D12: la sede de una campaña masiva es F6); un fallo de base
 * LANZA (la marca falla con su error y las demás siguen), nunca es «nadie para hoy».
 *
 * Ref: docs/prompts/2026-10-12-ciclo-fase-1b-envios.md §2.2 y §2.3 · docs/features/campaigns.md
 *      docs/features/send-governance.md · docs/features/ritmo-adaptativo.md §7
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure } from '@/lib/db-failure'
import { leerTodo } from '@/lib/leer-todo'
import {
  bogotaDay,
  brandRhythm,
  normalizeCycleSettings,
  CYCLE_SETTING_KEYS,
  SEND_SLOTS,
  type CycleRhythm,
  type CycleSettings,
} from '@/lib/cycle-engine'
import {
  decidirCliente,
  resolverToque,
  variablesDelToque,
  variablesAlEnviar,
  guardaDelCicloAlEnviar,
  nextSendSlot,
  instanteEnBogota,
  pospuestoHoy,
  diaQuePospone,
  TOUCH_TEMPLATES,
  GIFT_TITLE_VARIABLE,
  HOY_NO_CLAVES,
  type ClienteDelCiclo,
  type ToqueExistente,
  type ToquePlaneado,
  type TouchStage,
  type TouchStatus,
  type TouchTemplateKey,
  type GiftSize,
  type PremiosDelCiclo,
  type Premio,
  type GuardaDelCiclo,
  type MotivoPospuesto,
  type TarjetaConHoyNo,
} from '@/lib/cycle-touch'
import { getPiece, piezasQuePausanElToque, CADENCE_RULES } from '@/lib/communications/registry'
import { getMultipleSettings } from '@/services/settings.service'
import { expireGrants, grantReward } from '@/services/reward-grant.service'
import {
  getOrCreateTodayCampaign,
  filterByMonthlyCap,
  passesFrequencyCap,
  getActiveBlackouts,
  getMonthBoundaries,
  finalizeCampaign,
} from '@/services/campaign.service'
import { audienciaDelEvento } from '@/services/calendar.service'
import { enqueueSendBatch, type EnqueueItem, type QueueRow } from '@/services/send-queue.service'
import { getNextTier, buildTiersRoadmap } from '@/services/reward-tiers.service'
import { punteroAprobado } from '@/services/plantilla-aprobada.service'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

/** La pieza del motor de piezas: cómo se graba el toque y qué topes le aplican. */
function piezaDelToque() {
  const pieza = getPiece('cycle_touch')
  if (!pieza) throw new Error('El motor de piezas no tiene la pieza cycle_touch')
  return pieza
}

/** `in()` de a lotes: cada uuid ocupa ~37 caracteres de la URL de PostgREST. */
const LOTE = 150
function enLotes<T>(xs: readonly T[], n = LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < xs.length; i += n) lotes.push(xs.slice(i, i + n))
  return lotes
}

const DIA_MS = 24 * 60 * 60 * 1000
/** `YYYY-MM-DD` (la fecha de un evento) → número de día de `bogotaDay()`. */
const diaDeFecha = (fecha: string) => Math.floor(Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) / DIA_MS)

function fallo(
  reason: string,
  error: { message: string; code?: string },
  context: Record<string, string | number | boolean | null | undefined>
): never {
  logDbFailure({ scope: 'Cycle', reason, error, context })
  throw new Error(`Ciclo de recuperación: ${reason} (${error.message})`)
}

// ═══════════════════════════════════════════════════════════════
// El encendido
// ═══════════════════════════════════════════════════════════════

/** Las claves que lee el cron para decidir si una marca va por el camino nuevo. */
export const CLAVES_DEL_ENCENDIDO = ['cycle_enabled', 'cycle_enabled_at'] as const

/**
 * Apagar la marca borra la fecha de encendido (`cycle_enabled_at`): el próximo encendido la
 * vuelve a anotar y vuelve a aplicar las dos reglas del encendido. No lanza: es la limpieza
 * de una marca que ya va por el camino viejo, y un fallo acá no le cambia nada hoy.
 */
export async function olvidarEncendido(tenantId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from('admin_settings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('key', 'cycle_enabled_at')
  if (error) logDbFailure({ scope: 'Cycle', reason: 'olvidar_encendido_error', error, context: { tenant_id: tenantId } })
}

/**
 * «Hoy no» (decisión A6): lo automático de «Para hoy» sale solo y el dueño lo pospone UN día.
 * Anota en `admin_settings` (clave del sistema, `HOY_NO_CLAVES`) el día de la PRÓXIMA corrida
 * del cron; esa corrida no encola esa tarjeta y la siguiente la retoma (el toque no se crea,
 * así que al otro día vuelve a tocar). Apretarlo dos veces el mismo día es lo mismo que una.
 * Devuelve el día pospuesto. Un fallo de base LANZA: la pantalla no puede decir «listo» si no
 * quedó escrito.
 */
export async function anotarHoyNo(tenantId: string, tarjeta: TarjetaConHoyNo, ahora: Date = new Date()): Promise<string> {
  const dia = diaQuePospone(ahora)
  const { error } = await getServiceClient()
    .from('admin_settings')
    .upsert({ key: HOY_NO_CLAVES[tarjeta], value: dia, tenant_id: tenantId }, { onConflict: 'key,tenant_id' })
  if (error) fallo('hoy_no_error', error, { tenant_id: tenantId, tarjeta })
  return dia
}

// ═══════════════════════════════════════════════════════════════
// El cron: decide y encola
// ═══════════════════════════════════════════════════════════════

const COLUMNAS_DEL_CLIENTE =
  'id, name, phone, total_visits, total_points, source_channels, last_campaign_at, cycle_no, cycle_started_at, cycle_state, dormant_since, heartbeats_sent, strong_offer_last_at, cycle_rhythm'

interface FilaDeCliente extends ClienteDelCiclo {
  name: string
  phone: string
  total_points: number | null
  last_campaign_at: string | null
  heartbeats_sent: number
}

const COLUMNAS_DEL_TOQUE = 'id, customer_id, cycle_no, stage, seq, status, attempts, due_at, sent_at'

interface FilaDeToque extends ToqueExistente {
  customer_id: string
}

export interface EjemploDelCiclo {
  customer_id: string
  etapa: TouchStage
  seq: number
  plantilla: TouchTemplateKey
  regalo: string | null
  decision: 'encolar' | 'control' | MotivoPospuesto
}

export interface ResultadoDelCiclo {
  tenant_slug: string
  ok: boolean
  /** La marca fue por el camino nuevo. */
  ciclo: true
  dry: boolean
  /** `false` solo en `?dry=1`: la simulación se hace como si se encendiera hoy. */
  encendido: boolean
  encendido_desde: string
  ritmo_de_la_marca: CycleRhythm
  hora: string
  grupo_de_control_pct: number
  plantilla_del_regalo: 'gift_expiring' | 'reactivation_aggressive' | 'sin_plantilla'
  regalos: { pequeno: string | null; fuerte: string | null }
  evaluados: { activos: number; dormidos: number }
  /** Toques encolados por etapa (en `?dry=1`, los que irían). */
  por_etapa: Record<TouchStage, number>
  encolados_en_la_cola: number
  en_control: number
  pospuestos: Record<MotivoPospuesto, number>
  saltados: {
    atrasado: number
    t1_fiel: number
    en_curso: number
    esperando: number
    /** Toques trimestrales que el dueño pospuso un día («Hoy no», decisión A6). */
    hoy_no: number
    sin_plantilla: Partial<Record<TouchStage, number>>
  }
  /**
   * PL-2-ciclo: las plantillas configuradas que Twilio no da por aprobadas HOY (suave,
   * insistente, cruzadas). Sus toques cuentan en `saltados.sin_plantilla` y mañana se vuelve a
   * mirar. «Regalo que vence» va aparte: sin aprobar, el adaptador usa la insistente.
   */
  plantillas_sin_aprobar: TouchTemplateKey[]
  dormidos_por_encendido: number
  dormidos_tras_la_despedida: number
  archivados: number
  cancelados_etapa_pasada: number
  reconciliados: number
  premios_vencidos: number
  campaign_id: string | null
  ejemplos?: EjemploDelCiclo[]
  // Lo que suma la respuesta del cron (forma del camino viejo): el cron del ciclo no envía.
  sent: 0
  failed: 0
  aggressive_sent: 0
  rewards_granted: 0
  total_inactive_customers: number
}

const ESTADOS_RETOMABLES: TouchStatus[] = ['pending', 'deferred', 'failed']

interface Candidato {
  cliente: FilaDeCliente
  toque: ToquePlaneado
}

/**
 * El primer premio de la lista que exista, esté activo y sea de ESTA marca. Lo usa también la
 * pantalla del ciclo (`cycle-overview.service.ts`): el «regalo elegido» del primer uso es el
 * mismo que el cron va a mandar.
 */
export async function premiosDelCiclo(ajustes: CycleSettings, tenantId: string): Promise<PremiosDelCiclo> {
  const ids = [...new Set([...ajustes.smallRewardIds, ...(ajustes.strongRewardId ? [ajustes.strongRewardId] : [])])]
  if (ids.length === 0) return { small: null, strong: null }
  // Una sola lectura, filtrada por marca, que LANZA ante un fallo de base: un error no puede
  // verse como «la marca no eligió regalo» (el toque saldría sin regalo, y ese toque ya no
  // vuelve). `getCampaignRewardById()` hace el mismo filtro pero devuelve null ante un error.
  const { data, error } = await getServiceClient()
    .from('campaign_rewards')
    .select('id, title, is_active')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) fallo('premios_error', error, { tenant_id: tenantId })
  const activos = new Map<string, Premio>()
  for (const p of (data ?? []) as Array<{ id: string; title: string; is_active: boolean }>) {
    if (p.is_active) activos.set(p.id, { id: p.id, title: p.title })
  }
  const small = ajustes.smallRewardIds.map((id) => activos.get(id)).find(Boolean) ?? null
  const strong = ajustes.strongRewardId ? (activos.get(ajustes.strongRewardId) ?? null) : null
  return { small, strong }
}

/**
 * ¿«Regalo que vence» está aprobada en esta marca? Zernio: el puntero solo existe aprobado.
 * Demo: el envío es simulado. Twilio: el puntero se escribe al CREAR la plantilla, así que se
 * le pregunta a Twilio, una vez por corrida (como `reward-reminder` desde PL-2-a); ante la
 * duda, no (sale la insistente, y el regalo igual llega a la tarjeta). La pregunta es
 * `punteroAprobado()`; la portada usa la versión con caché (`punteroAprobadoEnPantalla()`).
 */
export async function regaloQueVenceAprobada(tenant: Tenant, sid: string | null | undefined): Promise<boolean> {
  return punteroAprobado(tenant, sid)
}

/**
 * PL-2-ciclo (2026-10-15): las OTRAS cuatro plantillas del ciclo —la suave, la insistente y las
 * dos cruzadas— también se escriben al crear en Twilio. Antes solo se preguntaba por «Regalo que
 * vence», y un toque con una plantilla en revisión fallaba en Meta tres días seguidos y se
 * rendía. Una pregunta por plantilla configurada y por corrida; las que no figuran aprobadas
 * quedan fuera HOY (el toque no se crea, `saltados.sin_plantilla`, y mañana se vuelve a mirar
 * en la misma etapa), igual que el recordatorio de premio desde PL-2-a.
 */
async function plantillasSinAprobar(
  tenant: Tenant,
  sids: Readonly<Record<TouchTemplateKey, string | null>>
): Promise<TouchTemplateKey[]> {
  const claves = (Object.keys(sids) as TouchTemplateKey[]).filter((k) => k !== 'gift_expiring' && sids[k]?.trim())
  const respuestas = await Promise.all(claves.map((k) => punteroAprobado(tenant, sids[k])))
  return claves.filter((_, i) => !respuestas[i])
}

/** Cliente → desde cuándo se reevalúa su toque si está en la audiencia de un evento en blackout. */
async function blackoutsDeLaMarca(tenantId: string, ahora: Date): Promise<Map<string, Date>> {
  const hasta = new Map<string, Date>()
  if (piezasQuePausanElToque().length === 0) return hasta
  const eventos = await getActiveBlackouts(tenantId, ahora)
  for (const ev of eventos) {
    // La MISMA audiencia que va a recibir la invitación (`executeAutoEvent()` usa esta función):
    // con el ciclo encendido, sin los dormidos salvo «Incluir a los dormidos» (00073).
    const audiencia = await audienciaDelEvento(ev, tenantId)
    const reevaluar = instanteEnBogota(diaDeFecha(ev.event_date) + 1)
    for (const c of audiencia) {
      const antes = hasta.get(c.id)
      if (!antes || antes < reevaluar) hasta.set(c.id, reevaluar)
    }
  }
  return hasta
}

async function leerClientes(tenantId: string, conDormidos: boolean): Promise<FilaDeCliente[]> {
  const db = getServiceClient()
  const { data, error } = await leerTodo<FilaDeCliente>((desde, hasta) =>
    db
      .from('customers')
      .select(COLUMNAS_DEL_CLIENTE)
      .eq('tenant_id', tenantId)
      .eq('accepts_marketing', true)
      .is('whatsapp_opt_out_at', null)
      .in('cycle_state', conDormidos ? ['activo', 'dormido'] : ['activo'])
      .order('id', { ascending: true })
      .range(desde, hasta)
  )
  if (error) fallo('clientes_error', error, { tenant_id: tenantId })
  return data
}

/** Los toques del ciclo VIGENTE de cada cliente. */
async function leerToques(tenantId: string, clientes: readonly FilaDeCliente[]): Promise<Map<string, FilaDeToque[]>> {
  const db = getServiceClient()
  const cicloDe = new Map(clientes.map((c) => [c.id, c.cycle_no]))
  const porCliente = new Map<string, FilaDeToque[]>()
  for (const lote of enLotes(clientes.map((c) => c.id))) {
    const { data, error } = await leerTodo<FilaDeToque>((desde, hasta) =>
      db
        .from('customer_cycle_touches')
        .select(COLUMNAS_DEL_TOQUE)
        .eq('tenant_id', tenantId)
        .in('customer_id', lote)
        .order('id', { ascending: true })
        .range(desde, hasta)
    )
    if (error) fallo('toques_error', error, { tenant_id: tenantId })
    for (const t of data) {
      if (t.cycle_no !== cicloDe.get(t.customer_id)) continue
      porCliente.set(t.customer_id, [...(porCliente.get(t.customer_id) ?? []), t])
    }
  }
  return porCliente
}

function vacio(): Pick<ResultadoDelCiclo, 'por_etapa' | 'pospuestos' | 'saltados'> {
  return {
    por_etapa: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, heartbeat: 0 },
    pospuestos: { evento: 0, siete_dias: 0, tope_mes: 0 },
    saltados: { atrasado: 0, t1_fiel: 0, en_curso: 0, esperando: 0, hoy_no: 0, sin_plantilla: {} },
  }
}

/**
 * Una marca con el ciclo encendido (o cualquier marca, en `?dry=1`): decide qué toque le toca
 * a cada cliente y lo encola a la hora de la marca. Con `dry`, las mismas decisiones y CERO
 * escrituras: ni toques, ni cola, ni ajustes, ni regalos, ni la fecha de encendido.
 */
export async function ejecutarCicloDeLaMarca(
  tenant: Tenant,
  opciones: { dry: boolean; ahora?: Date }
): Promise<ResultadoDelCiclo> {
  const { dry } = opciones
  const ahora = opciones.ahora ?? new Date()
  const db = getServiceClient()
  const pieza = piezaDelToque()

  // ── Ajustes ──
  const crudos = await getMultipleSettings(
    [
      ...CYCLE_SETTING_KEYS,
      'aggressive_reward_id',
      'cycle_enabled_at',
      ...Object.values(HOY_NO_CLAVES),
      ...Object.values(TOUCH_TEMPLATES),
    ],
    tenant.id
  )
  // «Hoy no» del toque trimestral: el dueño pospuso ESTA corrida (A6). Los trimestrales de hoy
  // no se crean ni se encolan; mañana `decidirCliente()` los vuelve a decidir igual.
  const trimestralPospuesto = pospuestoHoy(crudos[HOY_NO_CLAVES.trimestral], ahora)
  const { count: totalClientes, error: conteoError } = await db
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  if (conteoError) fallo('conteo_error', conteoError, { tenant_id: tenant.id })
  const ajustes = normalizeCycleSettings(crudos, { totalClientes: totalClientes ?? 0 })

  // ── El encendido se anota solo ──
  const anotado = crudos.cycle_enabled_at && !Number.isNaN(Date.parse(crudos.cycle_enabled_at)) ? crudos.cycle_enabled_at : null
  const encendidoDesde = anotado ?? ahora.toISOString()
  if (!dry && !anotado) {
    const { error } = await db
      .from('admin_settings')
      .upsert(
        { key: 'cycle_enabled_at', value: encendidoDesde, tenant_id: tenant.id },
        { onConflict: 'key,tenant_id', ignoreDuplicates: true }
      )
    if (error) fallo('encendido_error', error, { tenant_id: tenant.id })
  }

  // ── Antes de decidir: vencer regalos (un regalo vencido que sigue `active` bloquea uno
  //    nuevo por el índice único de la 00031) y reconciliar los toques (H6) ──
  let premiosVencidos = 0
  let reconciliados = 0
  if (!dry) {
    premiosVencidos = await expireGrants(tenant.id)
    const { data, error } = await db.rpc('cycle_reconcile_touches', { p_tenant_id: tenant.id })
    if (error) fallo('reconciliacion_error', error, { tenant_id: tenant.id })
    reconciliados = Number(data ?? 0)
  }

  // ── El ritmo de la marca, los regalos, las plantillas ──
  const { data: stats, error: statsError } = await db.rpc('cycle_brand_rhythm_stats', { p_tenant_id: tenant.id })
  if (statsError) fallo('ritmo_error', statsError, { tenant_id: tenant.id })
  const fila = ((stats ?? []) as Array<{ median_gap_days: number | null; returns_count: number | null }>)[0]
  const ritmoDeLaMarca = brandRhythm({
    mediana: fila?.median_gap_days ?? null,
    regresos: fila?.returns_count ?? 0,
    elegidoPorElDueno: ajustes.rhythm === 'auto' ? null : ajustes.rhythm,
  })
  const premios = await premiosDelCiclo(ajustes, tenant.id)
  const sids = Object.fromEntries(
    (Object.entries(TOUCH_TEMPLATES) as Array<[TouchTemplateKey, string]>).map(([k, setting]) => [k, crudos[setting] ?? null])
  ) as Record<TouchTemplateKey, string | null>
  const hayRegalo = premios.small !== null || premios.strong !== null
  const aprobada = hayRegalo ? await regaloQueVenceAprobada(tenant, sids.gift_expiring) : false
  // PL-2-ciclo: una plantilla en revisión es, por hoy, una plantilla que no está.
  const sinAprobar = await plantillasSinAprobar(tenant, sids)
  const sidsUsables = { ...sids }
  for (const k of sinAprobar) sidsUsables[k] = null
  if (sinAprobar.length > 0) {
    console.warn(
      `[Cycle] (${tenant.slug}) Plantillas que Meta todavía no aprueba: ${sinAprobar.join(', ')}. ` +
        `Sus toques no salen hoy (no cuentan como fallidos) y se vuelven a mirar mañana.`
    )
  }

  // ── Quién está en la audiencia de un evento en su blackout ──
  const blackout = await blackoutsDeLaMarca(tenant.id, ahora)

  // ── Los clientes y sus toques ──
  const clientes = await leerClientes(tenant.id, ajustes.heartbeatEnabled)
  const toquesPorCliente = await leerToques(tenant.id, clientes)
  const ctx = {
    ahora,
    diaDelEncendido: bogotaDay(encendidoDesde),
    ritmoDeLaMarca,
    tieneDomicilio: tenant.config?.has_delivery_webhook === true,
    heartbeatEnabled: ajustes.heartbeatEnabled,
    strongCooldownDays: ajustes.strongCooldownDays,
    plantillas: { sids: sidsUsables, regaloQueVenceAprobada: aprobada },
    premios,
  }

  const r = vacio()
  const cancelar: string[] = []
  const dormirPorEncendido: FilaDeCliente[] = []
  const dormirTrasLaDespedida: FilaDeCliente[] = []
  const archivar: FilaDeCliente[] = []
  const candidatos: Candidato[] = []
  let activos = 0
  let dormidos = 0

  for (const c of clientes) {
    if (c.cycle_state === 'dormido') dormidos++
    else activos++
    const { cancelar: viejos, decision } = decidirCliente(c, toquesPorCliente.get(c.id) ?? [], ctx)
    cancelar.push(...viejos)
    switch (decision.tipo) {
      case 'toque':
        if (trimestralPospuesto && decision.toque.stage === 'heartbeat') {
          r.saltados.hoy_no++
          break
        }
        candidatos.push({ cliente: c, toque: decision.toque })
        break
      case 'sin_plantilla':
        r.saltados.sin_plantilla[decision.stage] = (r.saltados.sin_plantilla[decision.stage] ?? 0) + 1
        break
      case 'dormir':
        ;(decision.motivo === 'encendido' ? dormirPorEncendido : dormirTrasLaDespedida).push(c)
        break
      case 'archivar':
        archivar.push(c)
        break
      case 'nada':
        if (decision.motivo === 'atrasado' || decision.motivo === 't1_fiel' || decision.motivo === 'en_curso' || decision.motivo === 'esperando') {
          r.saltados[decision.motivo]++
        }
        break
    }
  }

  // ── Topes: el mensual sobre todos los candidatos de una vez; el de 7 días a la hora real
  //    del envío (la próxima hora de la marca), no a la del cron ──
  const notBefore = nextSendSlot(ahora, ajustes.sendSlot)
  const alTope = new Set<string>()
  if (pieza.countsForMonthlyCap && candidatos.length > 0) {
    const { excluded } = await filterByMonthlyCap(candidatos.map((k) => ({ id: k.cliente.id })))
    for (const e of excluded) alTope.add(e.id)
  }
  const inicioDelMesSiguiente = new Date(getMonthBoundaries(ahora).nextMonthISO)

  const resueltos = candidatos.map((k) => ({
    ...k,
    resolucion: resolverToque(k.toque, k.cliente.id, {
      ahora,
      slot: ajustes.sendSlot,
      holdoutPct: ajustes.holdoutPct,
      blackoutHasta: blackout.get(k.cliente.id) ?? null,
      pasaSieteDias:
        pieza.exemptFromFrequencyCap ||
        passesFrequencyCap(k.cliente.last_campaign_at, CADENCE_RULES.frequencyCapDays, notBefore),
      ultimaCampana: k.cliente.last_campaign_at,
      alTopeDelMes: alTope.has(k.cliente.id),
      inicioDelMesSiguiente,
    }),
  }))

  let enControl = 0
  for (const k of resueltos) {
    if (k.resolucion.status === 'encolar') r.por_etapa[k.toque.stage]++
    else if (k.resolucion.status === 'holdout') enControl++
    else r.pospuestos[k.resolucion.motivo]++
  }
  // Hasta 10 ejemplos para mirar antes de encender: primero lo que saldría.
  const ejemplos: EjemploDelCiclo[] = [...resueltos]
    .sort((a, b) => Number(b.resolucion.status === 'encolar') - Number(a.resolucion.status === 'encolar'))
    .slice(0, 10)
    .map((k) => ({
      customer_id: k.cliente.id,
      etapa: k.toque.stage,
      seq: k.toque.seq,
      plantilla: k.toque.plantilla.key,
      regalo: k.toque.regalo?.premio.title ?? null,
      decision: k.resolucion.status === 'encolar' ? 'encolar' : k.resolucion.status === 'holdout' ? 'control' : k.resolucion.motivo,
    }))

  let campaignId: string | null = null
  let encolados = 0
  if (!dry) {
    await cancelarEtapasPasadas(tenant.id, cancelar)
    await cambiarEstado(tenant.id, [...dormirPorEncendido, ...dormirTrasLaDespedida], 'activo', {
      cycle_state: 'dormido',
      dormant_since: ahora.toISOString(),
    })
    await cambiarEstado(tenant.id, archivar, 'dormido', { cycle_state: 'archivado' })
    const escrito = await escribirToques(tenant, resueltos, {
      messageType: pieza.messageType,
      campaignSource: pieza.campaignSource,
      hora: SEND_SLOTS[ajustes.sendSlot],
    })
    campaignId = escrito.campaignId
    encolados = escrito.encolados
  }

  return {
    tenant_slug: tenant.slug,
    ok: true,
    ciclo: true,
    dry,
    encendido: ajustes.enabled,
    encendido_desde: encendidoDesde,
    ritmo_de_la_marca: ritmoDeLaMarca,
    hora: SEND_SLOTS[ajustes.sendSlot],
    grupo_de_control_pct: ajustes.holdoutPct,
    plantilla_del_regalo:
      aprobada && sids.gift_expiring ? 'gift_expiring' : sidsUsables.reactivation_aggressive ? 'reactivation_aggressive' : 'sin_plantilla',
    plantillas_sin_aprobar: sinAprobar,
    regalos: { pequeno: premios.small?.title ?? null, fuerte: premios.strong?.title ?? null },
    evaluados: { activos, dormidos },
    por_etapa: r.por_etapa,
    encolados_en_la_cola: encolados,
    en_control: enControl,
    pospuestos: r.pospuestos,
    saltados: r.saltados,
    dormidos_por_encendido: dormirPorEncendido.length,
    dormidos_tras_la_despedida: dormirTrasLaDespedida.length,
    archivados: archivar.length,
    cancelados_etapa_pasada: cancelar.length,
    reconciliados,
    premios_vencidos: premiosVencidos,
    campaign_id: campaignId,
    ...(dry ? { ejemplos } : {}),
    sent: 0,
    failed: 0,
    aggressive_sent: 0,
    rewards_granted: 0,
    total_inactive_customers: activos + dormidos,
  }
}

/** «La etapa ya pasó»: los toques viejos que seguían abiertos quedan `cancelled`. */
async function cancelarEtapasPasadas(tenantId: string, ids: string[]): Promise<void> {
  const db = getServiceClient()
  for (const lote of enLotes(ids)) {
    const { error } = await db
      .from('customer_cycle_touches')
      .update({ status: 'cancelled', reason: 'La etapa ya pasó: sale la siguiente' })
      .eq('tenant_id', tenantId)
      .in('id', lote)
      .in('status', ESTADOS_RETOMABLES)
    if (error) fallo('cancelar_etapa_error', error, { tenant_id: tenantId, toques: lote.length })
  }
}

/**
 * Dormir (regla 2 del encendido, o pasada la despedida) y archivar: SIN mensaje. Solo si el
 * cliente sigue en el estado y en el CICLO que se leyó: si volvió mientras corría el cron,
 * su ciclo nuevo no se toca.
 */
async function cambiarEstado(
  tenantId: string,
  clientes: readonly FilaDeCliente[],
  desde: 'activo' | 'dormido',
  cambio: Record<string, unknown>
): Promise<void> {
  const db = getServiceClient()
  const porCiclo = new Map<number, string[]>()
  for (const c of clientes) porCiclo.set(c.cycle_no, [...(porCiclo.get(c.cycle_no) ?? []), c.id])
  for (const [ciclo, ids] of porCiclo) {
    for (const lote of enLotes(ids)) {
      const { error } = await db
        .from('customers')
        .update(cambio)
        .eq('tenant_id', tenantId)
        .eq('cycle_state', desde)
        .eq('cycle_no', ciclo)
        .in('id', lote)
      if (error) fallo('estado_del_cliente_error', error, { tenant_id: tenantId, clientes: lote.length })
    }
  }
}

type Resuelto = Candidato & { resolucion: ReturnType<typeof resolverToque> }

/** Las columnas del toque que se escriben al decidir (las mismas al crear y al retomar). */
function columnasDecididas(k: Resuelto) {
  return {
    template_key: k.toque.plantilla.key,
    reward_id: k.toque.regalo?.premio.id ?? null,
    gift_size: (k.toque.regalo?.size ?? null) as GiftSize | null,
  }
}

/**
 * Escribe lo decidido. Un toque NUEVO entra con `INSERT … ON CONFLICT DO NOTHING` (el UNIQUE de
 * la 00070 es el anti-doble-disparo: si el cron corre dos veces, el segundo no inserta y no
 * encola). Uno que se RETOMA se actualiza solo si sigue en un estado retomable. Lo que se
 * encola entra a la cola con su `cycle_touch_id`: el trigger de la 00071 pasa el toque a
 * `queued` con `due_at` = la hora del envío. Si el encolado falla, el toque queda `pending`
 * y el cron lo retoma al día siguiente.
 */
async function escribirToques(
  tenant: Tenant,
  resueltos: readonly Resuelto[],
  { messageType, campaignSource, hora }: { messageType: string; campaignSource: string; hora: string }
): Promise<{ campaignId: string | null; encolados: number }> {
  const db = getServiceClient()
  const paraEncolar: Array<{ k: Resuelto; touchId: string }> = []

  // Nuevos: en un solo INSERT por lote.
  const nuevos = resueltos.filter((k) => !k.toque.existenteId)
  for (const lote of enLotes(nuevos)) {
    const filas = lote.map((k) => ({
      tenant_id: tenant.id,
      customer_id: k.cliente.id,
      cycle_no: k.toque.cycleNo,
      stage: k.toque.stage,
      seq: k.toque.seq,
      status: k.resolucion.status === 'encolar' ? 'pending' : k.resolucion.status,
      holdout: k.resolucion.status === 'holdout',
      due_at: (k.resolucion.status === 'encolar' ? k.resolucion.notBefore : k.resolucion.dueAt).toISOString(),
      reason: k.resolucion.status === 'deferred' ? k.resolucion.reason : null,
      location_id: null,
      ...columnasDecididas(k),
    }))
    const { data, error } = await db
      .from('customer_cycle_touches')
      .upsert(filas, { onConflict: 'customer_id,cycle_no,stage,seq', ignoreDuplicates: true })
      .select('id, customer_id, stage, seq')
    if (error) fallo('toque_insert_error', error, { tenant_id: tenant.id, toques: filas.length })
    const insertados = new Map(
      ((data ?? []) as Array<{ id: string; customer_id: string; stage: string; seq: number }>).map((f) => [
        `${f.customer_id}|${f.stage}|${f.seq}`,
        f.id,
      ])
    )
    for (const k of lote) {
      const id = insertados.get(`${k.cliente.id}|${k.toque.stage}|${k.toque.seq}`)
      // Solo si insertó: si otra corrida ya lo creó, esa es la que encola.
      if (id && k.resolucion.status === 'encolar') paraEncolar.push({ k, touchId: id })
    }
  }

  // Retomados: uno por uno (son pocos: los pospuestos que vencieron y los fallidos de ayer).
  for (const k of resueltos.filter((x) => x.toque.existenteId)) {
    const id = k.toque.existenteId!
    const cambio =
      k.resolucion.status === 'deferred'
        ? { status: 'deferred', due_at: k.resolucion.dueAt.toISOString(), reason: k.resolucion.reason, holdout: false }
        : k.resolucion.status === 'holdout'
          ? { status: 'holdout', holdout: true, due_at: k.resolucion.dueAt.toISOString(), reason: null }
          : { reason: null }
    const { data, error } = await db
      .from('customer_cycle_touches')
      .update({ ...cambio, ...columnasDecididas(k) })
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .in('status', ESTADOS_RETOMABLES)
      .select('id')
    if (error) fallo('toque_update_error', error, { tenant_id: tenant.id, toque: id })
    if ((data ?? []).length > 0 && k.resolucion.status === 'encolar') paraEncolar.push({ k, touchId: id })
  }

  if (paraEncolar.length === 0) return { campaignId: null, encolados: 0 }

  // La campaña del día solo se crea si hay algo que encolar: una corrida vacía no deja una
  // campaña `running` sin cola (el drenador solo cierra las que tuvieron cola).
  const campaign = await getOrCreateTodayCampaign('reactivation', `ciclo|hora:${hora}`, tenant.id, campaignSource)
  if (campaign.status !== 'running') {
    // La campaña del día ya se había cerrado (otra corrida de hoy): vuelve a gotear.
    const { error } = await db.from('campaigns').update({ status: 'running' }).eq('id', campaign.id).eq('tenant_id', tenant.id)
    if (error) fallo('campana_reabrir_error', error, { tenant_id: tenant.id, campaign_id: campaign.id })
  }

  const items: EnqueueItem[] = []
  const cache = new Map<number, { premioProximo: string | null; camino: string | null }>()
  for (const { k, touchId } of paraEncolar) {
    if (k.resolucion.status !== 'encolar') continue
    const puntos = k.cliente.total_points ?? 0
    const datos = cache.get(puntos) ?? { premioProximo: null, camino: null }
    if (!cache.has(puntos)) {
      const proximo = await getNextTier(puntos, tenant.id)
      datos.premioProximo = proximo ? proximo.tier.safe_reward_title : null
      cache.set(puntos, datos)
    }
    if (k.toque.plantilla.key === 'gift_expiring' && datos.camino === null) {
      datos.camino = await buildTiersRoadmap(puntos, tenant.id)
    }
    items.push({
      tenantId: tenant.id,
      phone: k.cliente.phone,
      customerId: k.cliente.id,
      campaignId: campaign.id,
      messageType,
      templateSid: k.toque.plantilla.sid,
      variables: variablesDelToque(
        k.toque.plantilla.key,
        { nombre: k.cliente.name, puntos, premioProximo: datos.premioProximo, caminoDeNiveles: datos.camino ?? '' },
        k.toque.regalo
      ),
      notBefore: k.resolucion.notBefore,
      expiresAt: k.resolucion.expiresAt,
      // D12: la sede de una campaña masiva es F6. NULL = sede desconocida, y se muestra.
      locationId: null,
      cycleTouchId: touchId,
    })
  }

  let encolados = 0
  try {
    encolados = (await enqueueSendBatch(items)).enqueued
  } finally {
    if (encolados === 0) await cerrarSiNoTieneCola(campaign.id, tenant.id)
  }
  return { campaignId: campaign.id, encolados }
}

/** Una campaña que se creó para esta corrida y no recibió ni un item no se queda `running`. */
async function cerrarSiNoTieneCola(campaignId: string, tenantId: string): Promise<void> {
  const { count, error } = await getServiceClient()
    .from('send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('tenant_id', tenantId)
  if (error) {
    logDbFailure({ scope: 'Cycle', reason: 'campana_vacia_error', error, context: { tenant_id: tenantId, campaign_id: campaignId } })
    return
  }
  if ((count ?? 0) === 0) await finalizeCampaign(campaignId, 0)
}

// ═══════════════════════════════════════════════════════════════
// El drenador: guardas al enviar y lo que pasa después
// ═══════════════════════════════════════════════════════════════

/**
 * Los regalos que cuentan para «un regalo activo por cliente» (spec §5): los del ciclo y los
 * que manda el dueño. Las invitaciones con premio y las reseñas son otra cosa (y su índice
 * único de la 00031 es por `source`, así que pueden convivir).
 */
export const FUENTES_DE_REGALO_VIVO = ['reactivation', 'manual'] as const

export interface ToqueDelDrenador {
  id: string
  customer_id: string
  cycle_no: number
  stage: TouchStage
  seq: number
  status: TouchStatus
  gift_size: GiftSize | null
  reward_id: string | null
  template_key: TouchTemplateKey | null
}

export interface ContextoDelCicloEnLaTanda {
  encendido: boolean
  toques: Map<string, ToqueDelDrenador>
  clientes: Map<string, { cycle_no: number; cycle_state: string; heartbeats_sent: number }>
  /** Cliente → vencimiento de su regalo vivo, del ciclo o del dueño (`null` = sin vencimiento). */
  regalosVivos: Map<string, string | null>
}

/**
 * Lo que el drenador necesita para los items del ciclo de una tanda, en cuatro lecturas. Un
 * fallo de base LANZA: el drenador devuelve la tanda a la cola con backoff (una guarda que no
 * se puede verificar no deja salir la tanda).
 */
export async function cargarContextoDelCiclo(tenantId: string, items: readonly QueueRow[]): Promise<ContextoDelCicloEnLaTanda> {
  const db = getServiceClient()
  const delCiclo = items.filter((i) => i.cycle_touch_id && i.customer_id)
  const ajustes = await getMultipleSettings(['cycle_enabled'], tenantId)
  const encendido = normalizeCycleSettings(ajustes, { totalClientes: 0 }).enabled

  const toques = new Map<string, ToqueDelDrenador>()
  for (const lote of enLotes([...new Set(delCiclo.map((i) => i.cycle_touch_id!))])) {
    const { data, error } = await db
      .from('customer_cycle_touches')
      .select('id, customer_id, cycle_no, stage, seq, status, gift_size, reward_id, template_key')
      .eq('tenant_id', tenantId)
      .in('id', lote)
    if (error) fallo('drenador_toques_error', error, { tenant_id: tenantId })
    for (const t of (data ?? []) as ToqueDelDrenador[]) toques.set(t.id, t)
  }

  const ids = [...new Set(delCiclo.map((i) => i.customer_id!))]
  const clientes = new Map<string, { cycle_no: number; cycle_state: string; heartbeats_sent: number }>()
  const regalosVivos = new Map<string, string | null>()
  const ahoraIso = new Date().toISOString()
  for (const lote of enLotes(ids)) {
    const { data, error } = await db
      .from('customers')
      .select('id, cycle_no, cycle_state, heartbeats_sent')
      .eq('tenant_id', tenantId)
      .in('id', lote)
    if (error) fallo('drenador_clientes_error', error, { tenant_id: tenantId })
    for (const c of (data ?? []) as Array<{ id: string; cycle_no: number; cycle_state: string; heartbeats_sent: number }>) {
      clientes.set(c.id, { cycle_no: c.cycle_no, cycle_state: c.cycle_state, heartbeats_sent: c.heartbeats_sent })
    }
    // Un regalo activo por cliente (spec §5): el del ciclo (`reactivation`) o el que mandó el
    // dueño con «Mandar un regalo» (`manual`, fase 2 parte C), vivo y sin vencer. Sin el
    // segundo, el rescate le apilaba un regalo encima al que el dueño acababa de mandarle.
    const { data: vivos, error: vivosError } = await db
      .from('reward_grants')
      .select('customer_id, expires_at')
      .eq('tenant_id', tenantId)
      .in('customer_id', lote)
      .eq('status', 'active')
      .eq('grant_type', 'campaign_prize')
      .in('source', FUENTES_DE_REGALO_VIVO)
      .or(`expires_at.is.null,expires_at.gt.${ahoraIso}`)
    if (vivosError) fallo('drenador_regalos_error', vivosError, { tenant_id: tenantId })
    for (const g of (vivos ?? []) as Array<{ customer_id: string; expires_at: string | null }>) {
      regalosVivos.set(g.customer_id, g.expires_at)
    }
  }
  return { encendido, toques, clientes, regalosVivos }
}

/** La guarda del ciclo para UN item (antes de las de siempre: cap de 7 días y tope del mes). */
export function guardaDelItem(item: QueueRow, ctx: ContextoDelCicloEnLaTanda, ahora: Date): GuardaDelCiclo {
  const toque = ctx.toques.get(item.cycle_touch_id!)
  if (!toque) return { tipo: 'cancelar', motivo: 'El toque del ciclo ya no existe' }
  if (toque.status !== 'queued') return { tipo: 'cancelar', motivo: `El toque ya no estaba en cola (${toque.status})` }
  const cliente = ctx.clientes.get(item.customer_id!)
  if (!cliente) return { tipo: 'cancelar', motivo: 'El cliente ya no existe' }
  return guardaDelCicloAlEnviar({
    cicloEncendido: ctx.encendido,
    toque,
    cliente,
    regaloVivoVence: ctx.regalosVivos.has(item.customer_id!) ? ctx.regalosVivos.get(item.customer_id!) : undefined,
    ahora,
  })
}

/**
 * Pospone el toque ANTES de cancelar su item: el trigger de la 00071 solo toca toques que
 * siguen `queued`, así que este `deferred` con su fecha es el que queda. Si esta escritura
 * falla, el item se cancela igual y el toque queda `cancelled` por el trigger (y se pierde
 * esa etapa, pero nunca queda colgado): se deja en el log.
 */
export async function posponerToque(
  tenantId: string,
  touchId: string,
  dueAt: Date,
  motivo: string
): Promise<void> {
  const { error } = await getServiceClient()
    .from('customer_cycle_touches')
    .update({ status: 'deferred', due_at: dueAt.toISOString(), reason: motivo })
    .eq('id', touchId)
    .eq('tenant_id', tenantId)
    .eq('status', 'queued')
  if (error) {
    logDbFailure({ scope: 'QueueDrain', reason: 'cycle_posponer_error', error, context: { tenant_id: tenantId, toque: touchId } })
  }
}

/** El día 1 del mes siguiente, 00:00 de Bogotá (el tope de 3 al mes). */
export function inicioDelMesSiguiente(ahora: Date): Date {
  return new Date(getMonthBoundaries(ahora).nextMonthISO)
}

/** `last_campaign_at` + 7 días (el cap de frecuencia de la pieza). */
export function finDelCapDeFrecuencia(ultimaCampana: string | null, ahora: Date): Date {
  const base = ultimaCampana ? new Date(ultimaCampana).getTime() : ahora.getTime()
  return new Date(base + CADENCE_RULES.frequencyCapDays * DIA_MS)
}

/** Las variables con que sale un item del ciclo y el vencimiento del regalo que promete. */
export function prepararEnvioDelToque(
  item: QueueRow,
  toque: ToqueDelDrenador,
  ahora: Date
): { variables: Record<string, string>; vence: Date | null } {
  return variablesAlEnviar(toque.template_key, toque.gift_size, item.variables ?? {}, ahora)
}

export interface ToqueEnviado {
  item: QueueRow
  toque: ToqueDelDrenador
  variables: Record<string, string>
  vence: Date | null
  campaignMessageId: string | null
  heartbeatsSent: number
}

/**
 * Después de un envío EXITOSO, y solo entonces: el regalo (con el vencimiento EXACTO del
 * mensaje; el pequeño sin recordatorio), el toque `sent` con su `campaign_message_id` y su
 * `grant_id`, y lo que el envío le cambia al cliente (el fuerte mueve el cooldown; la
 * despedida lo duerme; el trimestral suma uno). El mensaje YA salió: nada de esto lanza; lo
 * que falle queda en el log para corregirlo a mano.
 */
export async function completarToquesEnviados(tenantId: string, enviados: readonly ToqueEnviado[]): Promise<{ otorgados: number }> {
  const db = getServiceClient()
  const ahora = new Date().toISOString()
  let otorgados = 0

  for (const e of enviados) {
    const { item, toque } = e
    let grantId: string | null = null

    if (toque.gift_size && toque.template_key) {
      const indice = GIFT_TITLE_VARIABLE[toque.template_key]
      const titulo = indice ? e.variables[indice] : undefined
      if (titulo) {
        const otorgado = await grantReward(
          {
            customerId: toque.customer_id,
            grantType: 'campaign_prize',
            source: 'reactivation',
            prizeTitle: titulo,
            campaignRewardId: toque.reward_id,
            campaignId: item.campaign_id,
            expiresAt: e.vence,
            skipReminder: toque.gift_size === 'small',
          },
          tenantId
        )
        if (otorgado.ok) {
          grantId = otorgado.grant.id
          otorgados++
        } else if (otorgado.code === 'duplicate_active') {
          // La guarda del regalo vivo corrió antes del envío; otra vía otorgó uno en el medio.
          // El toque queda `sent` sin regalo y no se reintenta.
          console.warn(
            `[QueueDrain][ciclo] tenant=${tenantId} toque=${toque.id}: el cliente ya tenía un regalo de reactivación vivo (carrera). Salió el mensaje sin regalo nuevo.`
          )
        } else {
          console.error(
            `[QueueDrain][FALLO] reason=cycle_grant_error tenant=${tenantId} toque=${toque.id} detalle="${otorgado.error}" — el mensaje salió y el regalo NO quedó en la tarjeta`
          )
        }
      }
    }

    // El trigger de la cola ya lo dejó `sent` con su hora al marcar el item; acá se le suma
    // qué mensaje y qué regalo. Si el trigger no alcanzó, esto mismo lo deja `sent`.
    const { error: toqueError } = await db
      .from('customer_cycle_touches')
      .update({ status: 'sent', campaign_message_id: e.campaignMessageId, grant_id: grantId, reason: null })
      .eq('id', toque.id)
      .eq('tenant_id', tenantId)
      .in('status', ['queued', 'sent'])
    const { error: horaError } = await db
      .from('customer_cycle_touches')
      .update({ sent_at: ahora })
      .eq('id', toque.id)
      .eq('tenant_id', tenantId)
      .is('sent_at', null)
    for (const error of [toqueError, horaError]) {
      if (error) logDbFailure({ scope: 'QueueDrain', reason: 'cycle_touch_sent_error', error, context: { tenant_id: tenantId, toque: toque.id } })
    }

    const efectos: Array<PromiseLike<{ error: { message: string; code?: string } | null }>> = []
    if (toque.gift_size === 'strong') {
      efectos.push(db.from('customers').update({ strong_offer_last_at: ahora }).eq('id', toque.customer_id).eq('tenant_id', tenantId))
    }
    if (toque.stage === 't5') {
      // La despedida duerme al cliente, solo si sigue activo en ESE ciclo.
      efectos.push(
        db
          .from('customers')
          .update({ cycle_state: 'dormido', dormant_since: ahora })
          .eq('id', toque.customer_id)
          .eq('tenant_id', tenantId)
          .eq('cycle_no', toque.cycle_no)
          .eq('cycle_state', 'activo')
      )
    }
    if (toque.stage === 'heartbeat') {
      efectos.push(
        db
          .from('customers')
          .update({ heartbeats_sent: e.heartbeatsSent + 1 })
          .eq('id', toque.customer_id)
          .eq('tenant_id', tenantId)
          .eq('cycle_no', toque.cycle_no)
          .eq('cycle_state', 'dormido')
          .eq('heartbeats_sent', e.heartbeatsSent)
      )
    }
    for (const r of await Promise.all(efectos)) {
      if (r.error) {
        logDbFailure({ scope: 'QueueDrain', reason: 'cycle_customer_effect_error', error: r.error, context: { tenant_id: tenantId, toque: toque.id } })
      }
    }
  }
  return { otorgados }
}
