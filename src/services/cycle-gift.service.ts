/**
 * «Mandar un regalo» (fase 2 del ciclo, parte C, 2026-10-14): el botón principal de la pantalla
 * del ciclo (spec §6.5). Regalo · hasta cuándo · a quién · cuándo, con el conteo vivo, el cupo
 * de la línea y el MISMO adaptador de plantilla que el ciclo.
 *
 * LA REGLA QUE MANDA (spec §5): **el regalo se otorga AL ENVIAR y la fecha límite se calcula AL
 * ENVIAR**, igual que en los toques del ciclo. Programar no otorga nada: crea la campaña
 * (`source = 'manual'`: cuenta para la fatiga y el tope del mes como un envío manual) y encola a
 * la hora de la marca. El drenador (`/api/cron/queue-drain`), cuando el mensaje sale, pone «vence
 * el domingo» (o 3/7/14 días) y SOLO ENTONCES otorga el regalo con ese vencimiento.
 *
 * CÓMO SABE EL DRENADOR QUE UN ITEM LLEVA REGALO (el mecanismo mínimo, sin migración): el regalo
 * es de la CAMPAÑA, no del item —un envío, un premio, una regla—, así que vive en
 * `campaigns.filters.regalo` (`{ reward_id, titulo, vence, plantilla }`; `filters` ya es la bolsa
 * de configuración de una campaña, como en el Golden Bullet). El drenador lo lee una vez por
 * tanda, y solo si la tanda trae items `manual` (`cargarContextoDeRegalos()`). Los demás envíos
 * no pagan nada.
 *
 * UN REGALO VIVO POR CLIENTE (spec §5, índice de la 00031): a quien ya tiene uno —del ciclo o del
 * dueño— no se le manda otro: ni se programa, ni sale si al enviar ya lo tiene. Y el ciclo, desde
 * esta parte, tampoco le apila el suyo encima al del dueño (`FUENTES_DE_REGALO_VIVO`).
 *
 * Reglas de la casa: todo INSERT con `tenant_id` explícito; la sede de la cola es NULL (D12: la
 * de una campaña masiva es F6); un fallo de base LANZA (la ruta contesta 500: nunca «0
 * clientes»); nada en pesos (D7): conteos.
 *
 * Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §4, §5, §6.5
 *      docs/prompts/2026-10-14-ciclo-fase-2-pantalla.md §5 (punto 2) · docs/features/campaigns.md
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure, type DbErrorLike } from '@/lib/db-failure'
import { leerTodo } from '@/lib/leer-todo'
import { bogotaDay, SEND_SLOTS } from '@/lib/cycle-engine'
import {
  formatGiftDeadline,
  instanteDelRegalo,
  isoDeDia,
  plantillaDelRegalo,
  variablesDelRegaloAlEnviar,
  variablesDelToque,
  venceSegunRegla,
  esReglaDeVencimiento,
  REGLAS_DE_VENCIMIENTO,
  TOUCH_TEMPLATES,
  type ReglaDeVencimiento,
  type TouchTemplateKey,
} from '@/lib/cycle-touch'
import { appEndOfDay } from '@/lib/timezone'
import { buildTemplateBody, resolveTemplateEmoji } from '@/constants/template-catalog'
import { CADENCE_RULES } from '@/lib/communications/registry'
import { getMultipleSettings } from '@/services/settings.service'
import { regaloQueVenceAprobada, FUENTES_DE_REGALO_VIVO } from '@/services/cycle.service'
import { audienciasDelCiclo, cuandoSale, type AudienciaDeRegalo } from '@/services/cycle-overview.service'
import { getCustomersAtMonthlyCap, getMonthBoundaries, passesFrequencyCap } from '@/services/campaign.service'
import { getCampaignRewardById, getCampaignRewards, createCampaignReward } from '@/services/campaign-reward.service'
import { getLineBudget } from '@/services/line-budget.service'
import { canSendBulk } from '@/services/wallet.service'
import { enqueueSendBatch, type EnqueueItem, type QueueRow } from '@/services/send-queue.service'
import { grantReward } from '@/services/reward-grant.service'
import { getNextTier, buildTiersRoadmap } from '@/services/reward-tiers.service'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

function fallo(
  reason: string,
  error: DbErrorLike,
  context: Record<string, string | number | boolean | null | undefined>
): never {
  logDbFailure({ scope: 'CycleGift', reason, error, context })
  throw new Error(`Mandar un regalo: ${reason} (${error.message})`)
}

const LOTE = 150
function enLotes<T>(xs: readonly T[], n = LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < xs.length; i += n) lotes.push(xs.slice(i, i + n))
  return lotes
}

/** Un item que no encontró cupo en estos días ya no sale (el regalo se fecha al enviar, pero no llega un mes tarde). */
export const DIAS_EN_LA_COLA = 7

/** Lo más largo que puede ser el nombre de un regalo escrito a mano. */
export const MAX_TITULO_DE_REGALO = 80

// ═══════════════════════════════════════════════════════════════
// El regalo de la campaña (`campaigns.filters.regalo`)
// ═══════════════════════════════════════════════════════════════

export interface RegaloDeLaCampana {
  reward_id: string
  titulo: string
  vence: ReglaDeVencimiento
  /** La plantilla con que se programó (el adaptador): de ella sale en qué variable va la fecha. */
  plantilla: Extract<TouchTemplateKey, 'gift_expiring' | 'reactivation_aggressive'>
}

/** Lee `campaigns.filters.regalo`. PURA. `null` si la campaña no es un regalo (o lo guardado no sirve). */
export function leerRegaloDeLaCampana(filters: unknown): RegaloDeLaCampana | null {
  if (!filters || typeof filters !== 'object') return null
  const r = (filters as { regalo?: unknown }).regalo
  if (!r || typeof r !== 'object') return null
  const { reward_id, titulo, vence, plantilla } = r as Record<string, unknown>
  if (typeof reward_id !== 'string' || !reward_id) return null
  if (typeof titulo !== 'string' || !titulo.trim()) return null
  if (!esReglaDeVencimiento(vence)) return null
  if (plantilla !== 'gift_expiring' && plantilla !== 'reactivation_aggressive') return null
  return { reward_id, titulo, vence, plantilla }
}

// ═══════════════════════════════════════════════════════════════
// Quién lo recibe: la audiencia, menos lo que no debe recibirlo
// ═══════════════════════════════════════════════════════════════

export interface NoLoReciben {
  /** Ya tiene un regalo vivo (del ciclo o del dueño) o uno del ciclo en camino. */
  regalo_vivo: number
  /** Recibió otro mensaje hace menos de 7 días (a la hora del envío). */
  siete_dias: number
  /** Ya tiene sus 3 mensajes de marketing de este mes. */
  tope_mes: number
}

export interface AudienciaDeLaVistaPrevia {
  clave: AudienciaDeRegalo
  etiqueta: string
  disponible: boolean
  /** Los que están HOY en la caja (el mismo número de la caja). */
  total: number
  /** A lo sumo: el drenador vuelve a mirar los topes en el momento del envío. */
  reciben: number
  no_reciben: NoLoReciben
}

interface ClienteDelRegalo {
  id: string
  name: string
  phone: string
  total_points: number | null
  last_campaign_at: string | null
}

type Motivo = keyof NoLoReciben

interface Clasificacion {
  audiencias: Array<{ clave: AudienciaDeRegalo; etiqueta: string; disponible: boolean; ids: string[] }>
  encendido: boolean
  sendSlot: keyof typeof SEND_SLOTS
  clientes: Map<string, ClienteDelRegalo>
  /** Por qué NO lo recibe cada cliente (el primer motivo que aplica). Sin entrada = lo recibe. */
  motivo: Map<string, Motivo>
}

/** Los regalos vivos al `momento` y los del ciclo que ya están en camino (un toque con regalo en la cola). */
async function clientesConRegalo(tenantId: string, momento: Date): Promise<Set<string>> {
  const db = getServiceClient()
  const [vivos, enCamino] = await Promise.all([
    leerTodo<{ id: string; customer_id: string }>((d, h) =>
      db
        .from('reward_grants')
        .select('id, customer_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .eq('grant_type', 'campaign_prize')
        .in('source', [...FUENTES_DE_REGALO_VIVO])
        .or(`expires_at.is.null,expires_at.gt.${momento.toISOString()}`)
        .order('id', { ascending: true })
        .range(d, h)
    ),
    leerTodo<{ id: string; customer_id: string }>((d, h) =>
      db
        .from('customer_cycle_touches')
        .select('id, customer_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'queued')
        .not('gift_size', 'is', null)
        .order('id', { ascending: true })
        .range(d, h)
    ),
  ])
  if (vivos.error) fallo('regalos_vivos_error', vivos.error, { tenant_id: tenantId })
  if (enCamino.error) fallo('regalos_en_camino_error', enCamino.error, { tenant_id: tenantId })
  return new Set([...vivos.data, ...enCamino.data].map((r) => r.customer_id))
}

/**
 * Las audiencias del ciclo (el MISMO motor que las cajas) y, por cliente, si lo recibiría un
 * regalo que sale `sale`: sin regalo vivo, con 7 días desde su último mensaje A ESA HORA y sin
 * sus 3 del mes (si el envío cae en el mes de hoy; el mes siguiente arranca de cero).
 */
async function clasificar(tenant: Tenant, ahora: Date, sale: Date | null): Promise<Clasificacion> {
  const db = getServiceClient()
  const delCiclo = await audienciasDelCiclo(tenant, { ahora })
  const momento = sale ?? ahora
  const [lectura, conRegalo] = await Promise.all([
    leerTodo<ClienteDelRegalo>((d, h) =>
      db
        .from('customers')
        .select('id, name, phone, total_points, last_campaign_at')
        .eq('tenant_id', tenant.id)
        .order('id', { ascending: true })
        .range(d, h)
    ),
    clientesConRegalo(tenant.id, momento),
  ])
  if (lectura.error) fallo('clientes_error', lectura.error, { tenant_id: tenant.id })
  const clientes = new Map(lectura.data.map((c) => [c.id, c]))

  const posibles = [...new Set(delCiclo.audiencias.filter((a) => a.disponible).flatMap((a) => a.ids))]
  const mismoMes = momento.getTime() < new Date(getMonthBoundaries(ahora).nextMonthISO).getTime()
  const alTope = mismoMes ? await getCustomersAtMonthlyCap(posibles) : new Set<string>()

  const motivo = new Map<string, Motivo>()
  for (const id of posibles) {
    const c = clientes.get(id)
    if (conRegalo.has(id)) motivo.set(id, 'regalo_vivo')
    else if (c && !passesFrequencyCap(c.last_campaign_at, CADENCE_RULES.frequencyCapDays, momento)) motivo.set(id, 'siete_dias')
    else if (alTope.has(id)) motivo.set(id, 'tope_mes')
  }
  return { audiencias: delCiclo.audiencias, encendido: delCiclo.encendido, sendSlot: delCiclo.sendSlot, clientes, motivo }
}

function contar(ids: readonly string[], motivo: Map<string, Motivo>): { reciben: number; no_reciben: NoLoReciben } {
  const no: NoLoReciben = { regalo_vivo: 0, siete_dias: 0, tope_mes: 0 }
  for (const id of ids) {
    const m = motivo.get(id)
    if (m) no[m]++
  }
  return { reciben: ids.length - no.regalo_vivo - no.siete_dias - no.tope_mes, no_reciben: no }
}

// ═══════════════════════════════════════════════════════════════
// La plantilla (el adaptador) y lo que necesita la vista previa
// ═══════════════════════════════════════════════════════════════

async function plantillasDeLaMarca(tenant: Tenant) {
  const crudos = await getMultipleSettings([TOUCH_TEMPLATES.gift_expiring, TOUCH_TEMPLATES.reactivation_aggressive], tenant.id)
  const sids = {
    gift_expiring: crudos[TOUCH_TEMPLATES.gift_expiring] ?? null,
    reactivation_aggressive: crudos[TOUCH_TEMPLATES.reactivation_aggressive] ?? null,
  }
  const aprobada = await regaloQueVenceAprobada(tenant, sids.gift_expiring)
  const estado: 'aprobada' | 'pendiente' | 'sin_plantilla' = !sids.gift_expiring?.trim()
    ? 'sin_plantilla'
    : aprobada
      ? 'aprobada'
      : 'pendiente'
  return { plantilla: plantillaDelRegalo({ sids, regaloQueVenceAprobada: aprobada }), estado }
}

export type EstadoDelCupo =
  /** Hoy caben `hoy`; la línea manda `por_dia` al día. */
  | { estado: 'con_tope'; hoy: number; por_dia: number | null }
  /** Meta todavía no le fijó tope a la línea (marcas anteriores a la 00037): sale todo. */
  | { estado: 'sin_tope'; hoy: null; por_dia: null }
  /** La línea está congelada por calidad: nada sale hasta que se reactive. */
  | { estado: 'congelada'; hoy: null; por_dia: null }
  /** No se pudo leer: se dice, no se inventa un número. */
  | { estado: 'no_se_pudo'; hoy: null; por_dia: null }

/** «Hoy puedes mandar 180» (`getLineBudget()`, sin recalcular nada). El cupo es informativo: no frena el creador. */
async function cupoDeLaLinea(tenantId: string): Promise<EstadoDelCupo> {
  try {
    const l = await getLineBudget(tenantId)
    if (l.lineStatus === 'frozen') return { estado: 'congelada', hoy: null, por_dia: null }
    if (!l.enforced || l.campaignAvailable === null) return { estado: 'sin_tope', hoy: null, por_dia: null }
    return { estado: 'con_tope', hoy: Math.max(0, l.campaignAvailable), por_dia: l.campaignBudget ?? null }
  } catch (err) {
    console.error('[CycleGift] No se pudo leer el cupo de la línea:', err instanceof Error ? err.message : err)
    return { estado: 'no_se_pudo', hoy: null, por_dia: null }
  }
}

export interface VistaPreviaDelRegalo {
  encendido: boolean
  /** La hora de la marca (`16:30` cena / `10:30` almuerzo). */
  hora: string
  /** Cuándo sale (ISO) y en palabras («hoy a las 4:30 pm»). `null` si `cuando` no sirve. */
  sale: string | null
  sale_texto: string | null
  /** El vencimiento de cada regla, contado desde `sale` (al enviar se vuelve a contar). */
  vence: Array<{ regla: ReglaDeVencimiento; iso: string; texto: string }>
  plantilla: { clave: TouchTemplateKey | null; regalo_que_vence: 'aprobada' | 'pendiente' | 'sin_plantilla' }
  regalos: Array<{ id: string; titulo: string }>
  audiencias: AudienciaDeLaVistaPrevia[]
  cupo: EstadoDelCupo
  marca: { nombre: string; emoji: string }
  /** Los cuerpos del catálogo con la marca y su emoji, para la vista previa del WhatsApp. */
  cuerpos: { gift_expiring: string; reactivation_aggressive: string; event_image: string }
  ejemplo: { nombre: string; puntos: number; premio_proximo: string | null; camino: string }
}

/** Puntos del cliente de ejemplo de la vista previa (el del prototipo). */
const PUNTOS_DE_EJEMPLO = 412

function marcaDe(tenant: Tenant): { nombre: string; emoji: string } {
  return {
    nombre: tenant.config?.brand_name?.trim() || tenant.name,
    emoji: resolveTemplateEmoji(tenant.business_type, tenant.config?.template_emoji),
  }
}

/**
 * GET /api/dashboard/cycle/gift — todo lo que dibuja el creador: el conteo vivo de cada caja (con
 * por qué no lo recibe el resto), el cupo, la plantilla que va a salir, el catálogo de regalos y
 * los cuerpos para la vista previa. Un fallo de base LANZA; el cupo, si falla, se dice.
 */
export async function vistaPreviaDelRegalo(
  tenant: Tenant,
  opciones: { cuando?: string; ahora?: Date } = {}
): Promise<VistaPreviaDelRegalo> {
  const ahora = opciones.ahora ?? new Date()
  const [base, plantillas, catalogo, cupo] = await Promise.all([
    audienciasDelCiclo(tenant, { ahora }),
    plantillasDeLaMarca(tenant),
    getCampaignRewards(tenant.id, true),
    cupoDeLaLinea(tenant.id),
  ])
  const sale = instanteDelRegalo(opciones.cuando ?? 'hoy', base.sendSlot, ahora)
  const clasificacion = await clasificar(tenant, ahora, sale)
  const [proximo, camino] = await Promise.all([
    getNextTier(PUNTOS_DE_EJEMPLO, tenant.id),
    buildTiersRoadmap(PUNTOS_DE_EJEMPLO, tenant.id),
  ])
  const marca = marcaDe(tenant)
  const hora = SEND_SLOTS[base.sendSlot]

  return {
    encendido: base.encendido,
    hora,
    sale: sale ? sale.toISOString() : null,
    sale_texto: sale ? cuandoSale(sale, bogotaDay(ahora), hora) : null,
    vence: sale
      ? REGLAS_DE_VENCIMIENTO.map((regla) => {
          const fecha = venceSegunRegla(regla, sale)
          return { regla, iso: fecha.toISOString(), texto: formatGiftDeadline(fecha) }
        })
      : [],
    plantilla: { clave: plantillas.plantilla?.key ?? null, regalo_que_vence: plantillas.estado },
    regalos: catalogo.map((r) => ({ id: r.id, titulo: r.title })),
    audiencias: clasificacion.audiencias.map((a) => ({
      clave: a.clave,
      etiqueta: a.etiqueta,
      disponible: a.disponible,
      total: a.ids.length,
      ...(a.disponible ? contar(a.ids, clasificacion.motivo) : { reciben: 0, no_reciben: { regalo_vivo: 0, siete_dias: 0, tope_mes: 0 } }),
    })),
    cupo,
    marca,
    cuerpos: {
      gift_expiring: buildTemplateBody('gift_expiring', marca.nombre, marca.emoji),
      reactivation_aggressive: buildTemplateBody('reactivation_aggressive', marca.nombre, marca.emoji),
      event_image: buildTemplateBody('event_image', marca.nombre, marca.emoji),
    },
    ejemplo: {
      nombre: 'Sara',
      puntos: PUNTOS_DE_EJEMPLO,
      premio_proximo: proximo ? proximo.tier.safe_reward_title : null,
      camino,
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/dashboard/cycle/gift: programar
// ═══════════════════════════════════════════════════════════════

export interface EntradaDelRegalo {
  /** Del catálogo (`id`) o escrito a mano (`titulo`: entra al catálogo y queda). */
  regalo: { id: string } | { titulo: string }
  vence: ReglaDeVencimiento
  audiencia: AudienciaDeRegalo
  /** `hoy` (a la hora de la marca) o `AAAA-MM-DD`. */
  cuando: string
}

/** Las audiencias que acepta el POST (las cajas posibles, Dormidos y Todos). */
export const AUDIENCIAS_DE_REGALO: readonly AudienciaDeRegalo[] = ['reciente', 't1', 't2', 't3', 't4', 't5', 'dormidos', 'todos']

/** Lo que llega del navegador, ya con la forma del servicio, o el motivo en español. */
export function leerEntradaDelRegalo(cuerpo: unknown): { ok: true; entrada: EntradaDelRegalo } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'Faltan los datos del regalo.' }
  const { regalo, vence, audiencia, cuando } = cuerpo as Record<string, unknown>

  let delRegalo: EntradaDelRegalo['regalo']
  if (regalo && typeof regalo === 'object' && typeof (regalo as { id?: unknown }).id === 'string' && (regalo as { id: string }).id) {
    delRegalo = { id: (regalo as { id: string }).id }
  } else if (regalo && typeof regalo === 'object' && typeof (regalo as { titulo?: unknown }).titulo === 'string') {
    delRegalo = { titulo: (regalo as { titulo: string }).titulo }
  } else {
    return { ok: false, error: 'Elige un regalo del catálogo o escribe uno.' }
  }
  if (!esReglaDeVencimiento(vence)) {
    return { ok: false, error: `«vence» es una de: ${REGLAS_DE_VENCIMIENTO.join(', ')}.` }
  }
  if (typeof audiencia !== 'string' || !(AUDIENCIAS_DE_REGALO as readonly string[]).includes(audiencia)) {
    return { ok: false, error: 'Elige a quién se lo mandas.' }
  }
  if (typeof cuando !== 'string' || !cuando) return { ok: false, error: 'Elige cuándo sale.' }
  return { ok: true, entrada: { regalo: delRegalo, vence, audiencia: audiencia as AudienciaDeRegalo, cuando } }
}

export type ResultadoDelRegalo =
  | {
      ok: true
      campaign_id: string
      regalo: { id: string; titulo: string; nuevo: boolean }
      programados: number
      sale: string
      sale_texto: string
      vence: ReglaDeVencimiento
      plantilla: TouchTemplateKey
      no_reciben: NoLoReciben
      mensaje: string
    }
  | { ok: false; status: 400 | 409; error: string }

const etiquetaDe = (a: { etiqueta: string }) => `«${a.etiqueta}»`

function porQueNoLoReciben(no: NoLoReciben): string {
  const partes: string[] = []
  if (no.regalo_vivo) partes.push(`${no.regalo_vivo} ya ${no.regalo_vivo === 1 ? 'tiene' : 'tienen'} un regalo vivo`)
  if (no.siete_dias) partes.push(`${no.siete_dias} recibieron otro mensaje hace menos de 7 días`)
  if (no.tope_mes) partes.push(`${no.tope_mes} ya ${no.tope_mes === 1 ? 'tiene' : 'tienen'} sus 3 mensajes del mes`)
  return partes.join(', ')
}

/**
 * Programa el regalo: valida, deja el regalo en el catálogo si lo escribieron a mano, crea la
 * campaña (`source = 'manual'`) con el regalo en `filters.regalo` y encola a la hora de la marca.
 * **No otorga nada**: eso lo hace el drenador al enviar. Si el encolado falla, la campaña se
 * borra (y con ella, en cascada, lo que alcanzó a entrar a la cola): no sale nada a medias.
 */
export async function programarRegalo(
  tenant: Tenant,
  entrada: EntradaDelRegalo,
  opciones: { ahora?: Date } = {}
): Promise<ResultadoDelRegalo> {
  const ahora = opciones.ahora ?? new Date()
  const db = getServiceClient()

  // ── Cuándo y a quién ──
  const delCiclo = await audienciasDelCiclo(tenant, { ahora })
  const sale = instanteDelRegalo(entrada.cuando, delCiclo.sendSlot, ahora)
  if (!sale) {
    return { ok: false, status: 400, error: 'Elige hoy o una fecha de los próximos 60 días (no una que ya pasó).' }
  }
  const clasificacion = await clasificar(tenant, ahora, sale)
  const audiencia = clasificacion.audiencias.find((a) => a.clave === entrada.audiencia)
  if (!audiencia) return { ok: false, status: 400, error: 'Esa etapa no existe en tu ciclo.' }
  if (!audiencia.disponible) {
    return { ok: false, status: 400, error: `${etiquetaDe(audiencia)} vinieron hace poco: todavía no les toca ningún mensaje.` }
  }
  const { reciben, no_reciben } = contar(audiencia.ids, clasificacion.motivo)
  if (reciben === 0) {
    const porque = porQueNoLoReciben(no_reciben)
    return {
      ok: false,
      status: 400,
      error:
        audiencia.ids.length === 0
          ? `Hoy no hay nadie en ${etiquetaDe(audiencia)}.`
          : `Nadie de ${etiquetaDe(audiencia)} puede recibirlo ahora: ${porque}.`,
    }
  }

  // ── La plantilla (el adaptador del ciclo) ──
  const { plantilla } = await plantillasDeLaMarca(tenant)
  if (!plantilla || (plantilla.key !== 'gift_expiring' && plantilla.key !== 'reactivation_aggressive')) {
    return {
      ok: false,
      status: 400,
      error: 'Tu marca todavía no tiene con qué mandar un regalo: crea «Regalo que vence» en Plantillas.',
    }
  }

  // ── El regalo ──
  let regalo: { id: string; titulo: string; nuevo: boolean }
  if ('id' in entrada.regalo) {
    const premio = await getCampaignRewardById(entrada.regalo.id, tenant.id)
    if (!premio || !premio.is_active) {
      return { ok: false, status: 400, error: 'Ese regalo ya no está activo en tu catálogo. Elige otro.' }
    }
    regalo = { id: premio.id, titulo: premio.title, nuevo: false }
  } else {
    const titulo = entrada.regalo.titulo.replace(/\s+/g, ' ').trim()
    if (!titulo) return { ok: false, status: 400, error: 'Escribe qué le regalas.' }
    if (titulo.length > MAX_TITULO_DE_REGALO) {
      return { ok: false, status: 400, error: `El nombre del regalo puede tener hasta ${MAX_TITULO_DE_REGALO} letras.` }
    }
    const igual = (await getCampaignRewards(tenant.id, true)).find((r) => r.title.trim().toLowerCase() === titulo.toLowerCase())
    regalo = igual ? { id: igual.id, titulo: igual.title, nuevo: false } : { id: '', titulo, nuevo: true }
  }

  // ── Los destinatarios y el saldo ──
  const destinatarios = audiencia.ids
    .filter((id) => !clasificacion.motivo.has(id))
    .map((id) => clasificacion.clientes.get(id))
    .filter((c): c is ClienteDelRegalo => !!c && !!c.phone)
  const saldo = await canSendBulk(tenant.id, destinatarios.length)
  if (!saldo.ok) {
    return {
      ok: false,
      status: 409,
      error: `No hay saldo para ${destinatarios.length} mensajes: alcanza para ${saldo.messagesAvailable}. Recarga la billetera y vuelve a intentarlo.`,
    }
  }

  // «Escribirlo y queda»: un regalo nuevo entra al catálogo de la marca.
  if (regalo.nuevo) {
    const creado = await createCampaignReward({ title: regalo.titulo }, tenant.id)
    regalo = { id: creado.id, titulo: creado.title, nuevo: true }
  }

  // ── La campaña: el regalo vive en `filters.regalo` (lo lee el drenador) ──
  const delRegalo: RegaloDeLaCampana = { reward_id: regalo.id, titulo: regalo.titulo, vence: entrada.vence, plantilla: plantilla.key }
  const { data: campana, error: campanaError } = await db
    .from('campaigns')
    .insert({
      name: `Regalo: ${regalo.titulo}`,
      type: 'manual',
      source: 'manual',
      status: 'running',
      message_template: `template:${plantilla.sid}`,
      filters: { regalo: delRegalo, audiencia: entrada.audiencia },
      executed_at: ahora.toISOString(),
      tenant_id: tenant.id,
    })
    .select('id')
    .single()
  if (campanaError || !campana) {
    fallo('campana_error', campanaError ?? { message: 'sin fila' }, { tenant_id: tenant.id })
  }
  const campaignId = (campana as { id: string }).id

  let programados = 0
  try {
    const cache = new Map<number, { premioProximo: string | null; camino: string | null }>()
    const items: EnqueueItem[] = []
    const expira = appEndOfDay(isoDeDia(bogotaDay(sale) + DIAS_EN_LA_COLA))
    for (const c of destinatarios) {
      const puntos = c.total_points ?? 0
      const datos = cache.get(puntos) ?? { premioProximo: null, camino: null }
      if (!cache.has(puntos)) {
        const proximo = await getNextTier(puntos, tenant.id)
        datos.premioProximo = proximo ? proximo.tier.safe_reward_title : null
        cache.set(puntos, datos)
      }
      if (plantilla.key === 'gift_expiring' && datos.camino === null) datos.camino = await buildTiersRoadmap(puntos, tenant.id)
      items.push({
        tenantId: tenant.id,
        phone: c.phone,
        customerId: c.id,
        campaignId,
        messageType: 'manual',
        templateSid: plantilla.sid,
        // La fecha límite NO va: la pone el drenador al enviar (`variablesDelRegaloAlEnviar()`).
        variables: variablesDelToque(
          plantilla.key,
          { nombre: c.name, puntos, premioProximo: datos.premioProximo, caminoDeNiveles: datos.camino ?? '' },
          { size: 'small', premio: { id: regalo.id, title: regalo.titulo } }
        ),
        notBefore: sale,
        expiresAt: expira,
        // D12: la sede de una campaña masiva es F6. NULL = sede desconocida, y se muestra.
        locationId: null,
      })
    }
    programados = (await enqueueSendBatch(items)).enqueued
  } catch (err) {
    // Nada salió todavía (todo espera a la hora de la marca): se borra la campaña y, en cascada,
    // lo que alcanzó a entrar a la cola. Mejor «no se programó» que medio regalo.
    const { error } = await db.from('campaigns').delete().eq('id', campaignId).eq('tenant_id', tenant.id)
    if (error) logDbFailure({ scope: 'CycleGift', reason: 'deshacer_campana_error', error, context: { tenant_id: tenant.id, campaign_id: campaignId } })
    throw err
  }

  const hora = SEND_SLOTS[delCiclo.sendSlot]
  const saleTexto = cuandoSale(sale, bogotaDay(ahora), hora)
  const porque = porQueNoLoReciben(no_reciben)
  const vencePrevisto = formatGiftDeadline(venceSegunRegla(entrada.vence, sale))
  return {
    ok: true,
    campaign_id: campaignId,
    regalo,
    programados,
    sale: sale.toISOString(),
    sale_texto: saleTexto,
    vence: entrada.vence,
    plantilla: plantilla.key,
    no_reciben,
    mensaje:
      `Programado: ${programados} ${programados === 1 ? 'regalo' : 'regalos'} a ${etiquetaDe(audiencia)} ${saleTexto}. ` +
      `Cada regalo se entrega cuando a esa persona le llega el mensaje, y vence el ${vencePrevisto}` +
      `${entrada.vence === 'domingo' ? '' : ' (contado desde ese día)'}. Si hoy no caben todos, el resto sale en los días siguientes.` +
      (porque ? ` No lo reciben: ${porque}.` : ''),
  }
}

// ═══════════════════════════════════════════════════════════════
// El drenador: lo que necesita para los items que llevan regalo
// ═══════════════════════════════════════════════════════════════

export interface ContextoDeRegalosEnLaTanda {
  /** campaign_id → el regalo de esa campaña (solo las campañas de «Mandar un regalo»). */
  regalos: Map<string, RegaloDeLaCampana>
  /** Clientes con un regalo vivo (del ciclo o del dueño) al empezar la tanda. */
  vivos: Set<string>
}

/** Los items que podrían llevar un regalo del dueño: `manual`, con cliente y campaña, y que no son toques. */
const candidatoARegalo = (i: QueueRow) => i.message_type === 'manual' && !!i.campaign_id && !!i.customer_id && !i.cycle_touch_id

/**
 * Dos lecturas, solo si la tanda trae items `manual`: las campañas (¿son un regalo?) y los
 * regalos vivos de esos clientes. Un fallo de base LANZA: el drenador devuelve la tanda a la cola
 * con backoff (una guarda que no se puede verificar no deja salir la tanda).
 */
export async function cargarContextoDeRegalos(tenantId: string, items: readonly QueueRow[]): Promise<ContextoDeRegalosEnLaTanda | null> {
  const candidatos = items.filter(candidatoARegalo)
  if (candidatos.length === 0) return null
  const db = getServiceClient()
  const regalos = new Map<string, RegaloDeLaCampana>()
  for (const lote of enLotes([...new Set(candidatos.map((i) => i.campaign_id!))])) {
    const { data, error } = await db.from('campaigns').select('id, filters').eq('tenant_id', tenantId).in('id', lote)
    if (error) fallo('drenador_campanas_error', error, { tenant_id: tenantId })
    for (const c of (data ?? []) as Array<{ id: string; filters: unknown }>) {
      const r = leerRegaloDeLaCampana(c.filters)
      if (r) regalos.set(c.id, r)
    }
  }
  const vivos = new Set<string>()
  const clientes = [...new Set(candidatos.filter((i) => regalos.has(i.campaign_id!)).map((i) => i.customer_id!))]
  const ahoraIso = new Date().toISOString()
  for (const lote of enLotes(clientes)) {
    const { data, error } = await db
      .from('reward_grants')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .in('customer_id', lote)
      .eq('status', 'active')
      .eq('grant_type', 'campaign_prize')
      .in('source', [...FUENTES_DE_REGALO_VIVO])
      .or(`expires_at.is.null,expires_at.gt.${ahoraIso}`)
    if (error) fallo('drenador_regalos_vivos_error', error, { tenant_id: tenantId })
    for (const g of (data ?? []) as Array<{ customer_id: string }>) vivos.add(g.customer_id)
  }
  return { regalos, vivos }
}

/** El regalo que lleva un item de la cola, o `null` si es cualquier otro envío. */
export function regaloDelItem(item: QueueRow, ctx: ContextoDeRegalosEnLaTanda | null): RegaloDeLaCampana | null {
  if (!ctx || !candidatoARegalo(item)) return null
  return ctx.regalos.get(item.campaign_id!) ?? null
}

/**
 * La guarda de un item con regalo, al enviar. Un regalo vivo por cliente (spec §5): si ya tiene
 * uno, este no sale (el dueño eligió una fecha: posponerlo sería mandarlo cuando nadie lo pidió).
 * `conRegaloEnLaTanda`: los clientes que ya reciben un regalo en ESTA tanda (un toque del ciclo
 * con regalo, u otro regalo del dueño): tampoco se les apila otro. Lo llena quien llama.
 */
export function guardaDelRegalo(
  item: QueueRow,
  ctx: ContextoDeRegalosEnLaTanda,
  conRegaloEnLaTanda: ReadonlySet<string>
): { tipo: 'enviar' } | { tipo: 'cancelar'; motivo: string } {
  const cliente = item.customer_id!
  if (ctx.vivos.has(cliente)) return { tipo: 'cancelar', motivo: 'Ya tiene un regalo vivo: no se le manda otro' }
  if (conRegaloEnLaTanda.has(cliente)) return { tipo: 'cancelar', motivo: 'Le llega otro regalo en este mismo envío' }
  return { tipo: 'enviar' }
}

/** Las variables con que sale un item con regalo: la fecha límite, calculada AHORA. */
export function prepararEnvioDelRegalo(
  item: QueueRow,
  regalo: RegaloDeLaCampana,
  ahora: Date
): { variables: Record<string, string>; vence: Date } {
  return variablesDelRegaloAlEnviar(regalo.plantilla, regalo.vence, item.variables ?? {}, ahora)
}

export interface RegaloEnviado {
  item: QueueRow
  regalo: RegaloDeLaCampana
  vence: Date
}

/**
 * Después de un envío EXITOSO, y solo entonces: el regalo, con el vencimiento EXACTO del mensaje.
 * Sin recordatorio (`skipReminder`): el mensaje ya dice la fecha, la tarjeta la muestra, y el
 * recordatorio sería un mensaje más del mes (H2; el aviso es solo para el regalo fuerte del
 * ciclo, decisión A3). El mensaje YA salió: nada de esto lanza; lo que falle queda en el log.
 */
export async function otorgarRegalosEnviados(tenantId: string, enviados: readonly RegaloEnviado[]): Promise<{ otorgados: number }> {
  let otorgados = 0
  for (const e of enviados) {
    const r = await grantReward(
      {
        customerId: e.item.customer_id!,
        grantType: 'campaign_prize',
        source: 'manual',
        prizeTitle: e.regalo.titulo,
        campaignRewardId: e.regalo.reward_id,
        campaignId: e.item.campaign_id,
        expiresAt: e.vence,
        skipReminder: true,
      },
      tenantId
    )
    if (r.ok) otorgados++
    else if (r.code === 'duplicate_active') {
      console.warn(`[QueueDrain][regalo] tenant=${tenantId} item=${e.item.id}: el cliente ya tenía un regalo del dueño vivo (carrera). Salió el mensaje sin regalo nuevo.`)
    } else {
      console.error(`[QueueDrain][FALLO] reason=gift_grant_error tenant=${tenantId} item=${e.item.id} detalle="${r.error}" — el mensaje salió y el regalo NO quedó en la tarjeta`)
    }
  }
  return { otorgados }
}
