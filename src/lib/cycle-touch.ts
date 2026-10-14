/**
 * El toque del ciclo, de la decisión al envío — cálculo PURO, sin I/O (fase 1B, 2026-10-13).
 *
 * `cycle-engine.ts` dice en qué etapa ESTÁ un cliente. Este módulo decide qué se hace HOY
 * con eso: si toca un toque, cuál, con qué regalo y qué plantilla (el adaptador del spec
 * §4), si se pospone, si va al grupo de control, a qué hora sale (H3) y, ya en el drenador,
 * qué fecha límite lleva el mensaje y si todavía se puede mandar. Lo usan el cron
 * (`src/services/cycle.service.ts`, desde `/api/cron/reactivation`) y el drenador
 * (`/api/cron/queue-drain`). Nada de lógica de etapa vive fuera de `cycle-engine.ts`: acá se
 * la consulta.
 *
 * Las dos reglas del encendido (`docs/PENDIENTES.md` §2.4, comandante 12-10):
 *   (1) NADA ATRASADO: un toque solo sale si su día (`cycle_started_at` + el día de la
 *       etapa, en días de Bogotá) es igual o posterior al día en que se encendió la marca.
 *       El que ya está entre dos etapas espera la siguiente.
 *   (2) Quien ya pasó el último toque de su ritmo sin estar dormido se duerme, sin mensaje.
 *
 * Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §3, §4, §5, §13
 *      docs/prompts/2026-10-12-ciclo-fase-1b-envios.md §2.2 y §2.3
 */

import {
  bogotaDay,
  cycleStages,
  resolveStage,
  effectiveRhythm,
  isCycleRhythm,
  shouldSkipT1,
  strongOfferAllowed,
  heartbeatPrize,
  isHoldout,
  expiresOnSunday,
  HEARTBEAT_EVERY_DAYS,
  HEARTBEAT_MAX,
  SEND_SLOTS,
  CYCLE_STAGES,
  type CycleRhythm,
  type CycleStage,
  type SendSlot,
} from '@/lib/cycle-engine'
import { MAX_INTENTOS_FALLIDOS_POR_TOQUE } from '@/constants/rewards'
import { CADENCE_RULES } from '@/lib/communications/registry'
import { APP_TIMEZONE, APP_UTC_OFFSET, appEndOfDay } from '@/lib/timezone'

// ═══════════════════════════════════════════════════════════════
// El toque: etapas, estados, plantillas
// ═══════════════════════════════════════════════════════════════

/** Las cinco etapas del ciclo activo más el toque trimestral de los dormidos. */
export type TouchStage = CycleStage | 'heartbeat'

/** Espejo del CHECK `customer_cycle_touches_status_check` (00071). */
export const TOUCH_STATUSES = ['pending', 'queued', 'sent', 'failed', 'holdout', 'deferred', 'cancelled'] as const
export type TouchStatus = (typeof TOUCH_STATUSES)[number]

export type GiftSize = 'small' | 'strong'

/**
 * Las cinco plantillas del catálogo que puede usar un toque, con su puntero. Espejo del CHECK
 * `customer_cycle_touches_template_key_check` (00071). Las legacy de reactivación
 * (`reactivation_with_reward_template_sid`, `reactivation_template_sid`) NO están: el camino
 * nuevo no las lee nunca.
 */
export const TOUCH_TEMPLATES = {
  gift_expiring: 'gift_expiring_template_sid',
  reactivation_aggressive: 'reactivation_aggressive_template_sid',
  reactivation_no_reward: 'reactivation_no_reward_template_sid',
  campaign_presencial_to_domicilio: 'campaign_presencial_to_domicilio_template_sid',
  campaign_domicilio_to_presencial: 'campaign_domicilio_to_presencial_template_sid',
} as const
export type TouchTemplateKey = keyof typeof TOUCH_TEMPLATES

/** En qué variable va la fecha límite del regalo, según la plantilla (`{{n}}` del catálogo). */
export const DEADLINE_VARIABLE: Readonly<Partial<Record<TouchTemplateKey, string>>> = {
  gift_expiring: '3',
  reactivation_aggressive: '5',
}

/** En qué variable va el NOMBRE del regalo, según la plantilla. */
export const GIFT_TITLE_VARIABLE: Readonly<Partial<Record<TouchTemplateKey, string>>> = {
  gift_expiring: '2',
  reactivation_aggressive: '4',
}

// ═══════════════════════════════════════════════════════════════
// Días y horas en Bogotá
// ═══════════════════════════════════════════════════════════════

const DIA_MS = 24 * 60 * 60 * 1000
const dos = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` de un número de día de `bogotaDay()`. */
export function isoDeDia(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10)
}

/** El instante de las `hh:mm` de Bogotá del día `dia`. */
export function instanteEnBogota(dia: number, horas = 0, minutos = 0): Date {
  return new Date(`${isoDeDia(dia)}T${dos(horas)}:${dos(minutos)}:00${APP_UTC_OFFSET}`)
}

/**
 * La PRÓXIMA hora de la marca (H3). El cron corre a las 15:00 de Bogotá (`0 20 * * *` UTC):
 * la cena (16:30) sale hoy; el almuerzo (10:30) ya pasó y sale mañana. Nada sale «ahora».
 */
export function nextSendSlot(ahora: Date, slot: SendSlot): Date {
  const [h, m] = SEND_SLOTS[slot].split(':').map(Number)
  const hoy = instanteEnBogota(bogotaDay(ahora), h, m)
  return hoy > ahora ? hoy : instanteEnBogota(bogotaDay(ahora) + 1, h, m)
}

/**
 * La hora de Bogotá a la que corre el cron que decide los toques (`/api/cron/reactivation`,
 * `vercel.json`: `0 20 * * *` UTC = 15:00).
 */
export const CYCLE_CRON_HOUR = 15

/** La PRÓXIMA corrida del cron: hoy a las 15:00 si todavía no llegó; si ya pasó, mañana. */
export function proximaCorrida(ahora: Date): { dia: number; instante: Date } {
  const hoy = bogotaDay(ahora)
  const deHoy = instanteEnBogota(hoy, CYCLE_CRON_HOUR)
  return ahora < deHoy ? { dia: hoy, instante: deHoy } : { dia: hoy + 1, instante: instanteEnBogota(hoy + 1, CYCLE_CRON_HOUR) }
}

// ═══════════════════════════════════════════════════════════════
// «Hoy no» (decisión A6): lo automático sale solo; «Hoy no» lo pospone un día
// ═══════════════════════════════════════════════════════════════

/**
 * Las tarjetas automáticas de «Para hoy» que el dueño puede posponer, con su clave en
 * `admin_settings` (claves del SISTEMA: el `PUT` del panel no las acepta, las escribe
 * `POST /api/dashboard/cycle/hoy-no`). El valor es el día de Bogotá (`YYYY-MM-DD`) de la
 * corrida que NO manda esa tarjeta. Hoy hay una: el toque trimestral de los dormidos.
 */
export const HOY_NO_CLAVES = {
  trimestral: 'cycle_hoy_no_trimestral',
} as const
export type TarjetaConHoyNo = keyof typeof HOY_NO_CLAVES

export function esTarjetaConHoyNo(valor: unknown): valor is TarjetaConHoyNo {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(HOY_NO_CLAVES, valor)
}

/**
 * El día que pospone un «Hoy no» apretado `ahora`: el de la PRÓXIMA corrida. Antes de las
 * 15:00, la de hoy; después, la de mañana (la de hoy ya decidió y encoló).
 */
export function diaQuePospone(ahora: Date): string {
  return isoDeDia(proximaCorrida(ahora).dia)
}

/** ¿La corrida de `ahora` es la que el dueño pospuso? Lo pregunta el cron antes de encolar. */
export function pospuestoHoy(valor: string | null | undefined, ahora: Date): boolean {
  return !!valor && valor.trim() === isoDeDia(bogotaDay(ahora))
}

/** Después de esto el item no sale nunca: el cierre (23:59:59 Bogotá) del día siguiente al envío. */
export function queueExpiry(notBefore: Date): Date {
  return appEndOfDay(isoDeDia(bogotaDay(notBefore) + 1))
}

/** «domingo 18 de octubre», en hora de Bogotá: la fecha límite tal como la lee el cliente. */
export function formatGiftDeadline(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: APP_TIMEZONE,
  }).formatToParts(fecha)
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${parte('weekday')} ${parte('day')} de ${parte('month')}`
}

// ═══════════════════════════════════════════════════════════════
// Estados de un toque
// ═══════════════════════════════════════════════════════════════

export interface EstadoDeToque {
  status: TouchStatus
  attempts: number
  due_at: string
}

/** Ya no se intenta más: salió, era de control, se canceló, o falló sus 3 veces. */
export function esTerminal(t: Pick<EstadoDeToque, 'status' | 'attempts'>): boolean {
  return (
    t.status === 'sent' ||
    t.status === 'holdout' ||
    t.status === 'cancelled' ||
    (t.status === 'failed' && t.attempts >= MAX_INTENTOS_FALLIDOS_POR_TOQUE)
  )
}

/** Se puede volver a intentar algún día (lo que el cron cancela si la etapa ya pasó). */
function sigueAbierto(t: Pick<EstadoDeToque, 'status' | 'attempts'>): boolean {
  return t.status === 'pending' || t.status === 'deferred' || (t.status === 'failed' && !esTerminal(t))
}

/**
 * ¿El cron lo retoma HOY? Un `pending` es un encolado que falló a medias en una corrida
 * anterior; un `deferred`, cuando llega su fecha; un `failed`, al día siguiente, mientras no
 * pase de los 3 intentos.
 */
export function sePuedeRetomar(t: EstadoDeToque, ahora: Date): boolean {
  if (t.status === 'pending') return true
  if (t.status === 'deferred') return new Date(t.due_at).getTime() <= ahora.getTime()
  if (t.status === 'failed') return !esTerminal(t)
  return false
}

// ═══════════════════════════════════════════════════════════════
// El regalo y la plantilla (el adaptador, spec §4)
// ═══════════════════════════════════════════════════════════════

export interface Premio {
  id: string
  title: string
}

/** Los premios del catálogo de la marca que usa el ciclo, ya validados (activos y de ESA marca). */
export interface PremiosDelCiclo {
  small: Premio | null
  strong: Premio | null
}

export interface RegaloElegido {
  size: GiftSize
  premio: Premio
}

/**
 * `t2` el pequeño · `t4` el fuerte, o el pequeño si el cooldown de 180 días no lo deja (o no
 * hay fuerte) · el trimestral, `heartbeatPrize()` con el mismo freno. Sin premio configurado,
 * ninguno: el toque sale igual, sin regalo.
 */
export function elegirRegalo(
  stage: TouchStage,
  seq: number,
  ultimoFuerte: string | null,
  premios: PremiosDelCiclo,
  ahora: Date,
  cooldownDias: number
): RegaloElegido | null {
  const pequeno: RegaloElegido | null = premios.small ? { size: 'small', premio: premios.small } : null
  const fuerte = (): RegaloElegido | null =>
    premios.strong && strongOfferAllowed(ultimoFuerte, ahora, cooldownDias)
      ? { size: 'strong', premio: premios.strong }
      : pequeno
  if (stage === 't2') return pequeno
  if (stage === 't4') return fuerte()
  if (stage === 'heartbeat') {
    const tamano = heartbeatPrize(seq)
    return tamano === 'strong' ? fuerte() : tamano === 'small' ? pequeno : null
  }
  return null
}

export interface PlantillasDeLaMarca {
  /** El puntero de cada plantilla (`admin_settings.*_template_sid`); vacío = no la tiene. */
  sids: Readonly<Partial<Record<TouchTemplateKey, string | null>>>
  /**
   * ¿«Regalo que vence» está APROBADA en esta marca? En Zernio el puntero solo existe
   * aprobado; en la marca demo el envío es simulado; en Twilio lo dice
   * `isTwilioTemplateApproved()` (una vez por corrida).
   */
  regaloQueVenceAprobada: boolean
}

export interface PlantillaElegida {
  key: TouchTemplateKey
  sid: string
}

/**
 * El adaptador. Un toque con regalo usa «Regalo que vence» si está aprobada en la marca; si
 * no, la INSISTENTE con el regalo en `{{4}}` y la fecha en `{{5}}` (el regalo igual llega a la
 * tarjeta). `t1` → la suave sin oferta · `t3` → la cruzada según el canal · `t5` y un toque sin
 * regalo → la insistente sin `{{4}}`/`{{5}}`. Sin la plantilla configurada: `null` (no se crea
 * el toque y la respuesta del cron lo cuenta).
 */
export function elegirPlantilla(
  stage: TouchStage,
  conRegalo: boolean,
  canales: string | null | undefined,
  plantillas: PlantillasDeLaMarca
): PlantillaElegida | null {
  const tomar = (key: TouchTemplateKey): PlantillaElegida | null => {
    const sid = plantillas.sids[key]?.trim()
    return sid ? { key, sid } : null
  }
  switch (stage) {
    case 't1':
      return tomar('reactivation_no_reward')
    case 't3':
      // `both` no llega acá: sin nada que mostrar, `t3` no existe para ese cliente.
      return canales === 'delivery' ? tomar('campaign_domicilio_to_presencial') : tomar('campaign_presencial_to_domicilio')
    case 't5':
      return tomar('reactivation_aggressive')
    default:
      if (conRegalo && plantillas.regaloQueVenceAprobada) {
        const regalo = tomar('gift_expiring')
        if (regalo) return regalo
      }
      return tomar('reactivation_aggressive')
  }
}

export interface DatosDelMensaje {
  nombre: string
  puntos: number
  /** El premio del próximo nivel (`safe_reward_title`), o `null` si no hay. */
  premioProximo: string | null
  /** `buildTiersRoadmap()`: solo lo usa «Regalo que vence». */
  caminoDeNiveles: string
}

/**
 * Las variables que se guardan al ENCOLAR. La fecha límite NO va: la calcula el drenador al
 * enviar (`variablesAlEnviar()`). Los valores por defecto son los del cron de siempre.
 */
export function variablesDelToque(
  key: TouchTemplateKey,
  datos: DatosDelMensaje,
  regalo: RegaloElegido | null
): Record<string, string> {
  const puntos = String(datos.puntos ?? 0)
  switch (key) {
    case 'gift_expiring':
      // {{3}} = la fecha, al enviar.
      return { '1': datos.nombre, '2': regalo?.premio.title ?? '', '4': datos.caminoDeNiveles }
    case 'reactivation_aggressive': {
      const v: Record<string, string> = { '1': datos.nombre, '2': puntos, '3': datos.premioProximo ?? 'premios exclusivos' }
      // {{5}} = la fecha, al enviar. Una insistente de 3 variables sigue funcionando:
      // `sendTemplateMessage()` reintenta con menos ante el 21665 de Twilio.
      if (regalo) v['4'] = regalo.premio.title
      return v
    }
    default:
      return { '1': datos.nombre, '2': puntos, '3': datos.premioProximo ?? 'más beneficios' }
  }
}

/**
 * Lo que el DRENADOR le agrega al mensaje en el momento del envío: la fecha límite del
 * regalo («vence el domingo», mínimo 5 días desde HOY, no desde que se encoló). Devuelve
 * también ese vencimiento: es el MISMO `expires_at` del premio que se otorga.
 */
export function variablesAlEnviar(
  key: TouchTemplateKey | null,
  giftSize: GiftSize | null,
  variables: Record<string, string>,
  ahora: Date
): { variables: Record<string, string>; vence: Date | null } {
  if (!giftSize || !key) return { variables, vence: null }
  const vence = expiresOnSunday(ahora)
  const indice = DEADLINE_VARIABLE[key]
  return { variables: indice ? { ...variables, [indice]: formatGiftDeadline(vence) } : variables, vence }
}

// ═══════════════════════════════════════════════════════════════
// Qué le toca HOY a un cliente (el cron)
// ═══════════════════════════════════════════════════════════════

export interface ClienteDelCiclo {
  id: string
  total_visits: number
  source_channels: string | null
  cycle_no: number
  cycle_started_at: string | null
  cycle_state: 'activo' | 'dormido' | 'archivado' | string
  dormant_since: string | null
  strong_offer_last_at: string | null
  cycle_rhythm: string | null
}

export interface ToqueExistente extends EstadoDeToque {
  id: string
  cycle_no: number
  stage: TouchStage
  seq: number
  sent_at: string | null
}

export interface ContextoDeDecision {
  ahora: Date
  /** `bogotaDay(cycle_enabled_at)`: la regla (1) del encendido. */
  diaDelEncendido: number
  ritmoDeLaMarca: CycleRhythm
  /** `tenants.config.has_delivery_webhook` (00066). */
  tieneDomicilio: boolean
  heartbeatEnabled: boolean
  strongCooldownDays: number
  plantillas: PlantillasDeLaMarca
  premios: PremiosDelCiclo
}

export interface ToquePlaneado {
  /** El toque que se retoma (deferred/pending/failed), o `null` si es nuevo. */
  existenteId: string | null
  cycleNo: number
  stage: TouchStage
  seq: number
  plantilla: PlantillaElegida
  regalo: RegaloElegido | null
}

export type MotivoSinToque =
  | 'antes_del_primer_toque'
  | 'en_curso'
  | 'hecho'
  | 'esperando'
  | 'atrasado'
  | 't1_fiel'
  | 'trimestral_apagado'
  | 'sin_fecha'

export type Decision =
  | { tipo: 'nada'; motivo: MotivoSinToque }
  | { tipo: 'sin_plantilla'; stage: TouchStage }
  /** Pasó la despedida (o le tocaba antes de encender) y no va a salir otra: duerme sin mensaje. */
  | { tipo: 'dormir'; motivo: 'encendido' | 'despedida' }
  /** Dos trimestrales y 90 días desde el segundo: solo cumpleaños y eventos. */
  | { tipo: 'archivar' }
  | { tipo: 'toque'; toque: ToquePlaneado }

export interface DecisionDeCliente {
  /** Toques de etapas que ya pasaron y todavía estaban abiertos: quedan `cancelled`. */
  cancelar: string[]
  decision: Decision
}

const ORDEN_DE_ETAPA: Readonly<Record<CycleStage, number>> = Object.fromEntries(
  CYCLE_STAGES.map((s, i) => [s, i])
) as Record<CycleStage, number>

/**
 * Qué le toca HOY a un cliente. `toques` son los de su ciclo VIGENTE (`cycle_no`). No mira el
 * blackout, el grupo de control ni los topes: eso es `resolverToque()`, que va después.
 */
export function decidirCliente(
  c: ClienteDelCiclo,
  toques: readonly ToqueExistente[],
  ctx: ContextoDeDecision
): DecisionDeCliente {
  if (c.cycle_state === 'dormido') return decidirDormido(c, toques, ctx)
  if (c.cycle_state !== 'activo' || !c.cycle_started_at) {
    return { cancelar: [], decision: { tipo: 'nada', motivo: 'sin_fecha' } }
  }

  const hoy = bogotaDay(ctx.ahora)
  const inicio = bogotaDay(c.cycle_started_at)
  const ritmo = effectiveRhythm(isCycleRhythm(c.cycle_rhythm) ? c.cycle_rhythm : null, ctx.ritmoDeLaMarca)
  const opciones = { tieneDomicilio: ctx.tieneDomicilio, canalesDelCliente: c.source_channels }
  const stage = resolveStage(hoy - inicio, ritmo, opciones)
  if (!stage) return { cancelar: [], decision: { tipo: 'nada', motivo: 'antes_del_primer_toque' } }

  const etapa = cycleStages(ritmo, opciones).find((e) => e.stage === stage)!
  const cancelar = toques
    .filter((t) => t.stage !== 'heartbeat' && ORDEN_DE_ETAPA[t.stage] < ORDEN_DE_ETAPA[stage] && sigueAbierto(t))
    .map((t) => t.id)
  const propio = toques.find((t) => t.stage === stage && t.seq === 1)

  if (propio) {
    if (propio.status === 'queued') return { cancelar, decision: { tipo: 'nada', motivo: 'en_curso' } }
    if (esTerminal(propio)) {
      // La despedida ya salió (el drenador lo duerme; esto es la red si no alcanzó) o no va
      // a salir nunca (control, cancelada, 3 fallos): el cliente no queda activo para siempre.
      if (stage === 't5') return { cancelar, decision: { tipo: 'dormir', motivo: 'despedida' } }
      return { cancelar, decision: { tipo: 'nada', motivo: 'hecho' } }
    }
    if (!sePuedeRetomar(propio, ctx.ahora)) return { cancelar, decision: { tipo: 'nada', motivo: 'esperando' } }
  } else {
    // Regla (1): nada atrasado. Regla (2): si lo atrasado es la despedida, duerme sin mensaje.
    if (inicio + etapa.day < ctx.diaDelEncendido) {
      return stage === 't5'
        ? { cancelar, decision: { tipo: 'dormir', motivo: 'encendido' } }
        : { cancelar, decision: { tipo: 'nada', motivo: 'atrasado' } }
    }
    if (stage === 't1' && shouldSkipT1(c.total_visits)) {
      return { cancelar, decision: { tipo: 'nada', motivo: 't1_fiel' } }
    }
  }

  return { cancelar, decision: planear(c, ctx, propio?.id ?? null, stage, 1) }
}

function decidirDormido(
  c: ClienteDelCiclo,
  toques: readonly ToqueExistente[],
  ctx: ContextoDeDecision
): DecisionDeCliente {
  if (!ctx.heartbeatEnabled) return { cancelar: [], decision: { tipo: 'nada', motivo: 'trimestral_apagado' } }
  if (!c.dormant_since) return { cancelar: [], decision: { tipo: 'nada', motivo: 'sin_fecha' } }

  const hoy = bogotaDay(ctx.ahora)
  const dormido = bogotaDay(c.dormant_since)
  const trimestres = Math.floor((hoy - dormido) / HEARTBEAT_EVERY_DAYS)
  if (trimestres < 1) return { cancelar: [], decision: { tipo: 'nada', motivo: 'antes_del_primer_toque' } }

  const seq = Math.min(trimestres, HEARTBEAT_MAX)
  const latidos = toques.filter((t) => t.stage === 'heartbeat')
  const cancelar = latidos.filter((t) => t.seq < seq && sigueAbierto(t)).map((t) => t.id)
  const propio = latidos.find((t) => t.seq === seq)

  // Pasaron los dos trimestrales: a los 90 días del segundo (o de cuando le tocaba), archivado.
  if (trimestres > HEARTBEAT_MAX && (!propio || esTerminal(propio))) {
    const referencia = propio?.sent_at ?? propio?.due_at ?? null
    const desde = referencia ? hoy - bogotaDay(referencia) : Infinity
    return desde >= HEARTBEAT_EVERY_DAYS
      ? { cancelar, decision: { tipo: 'archivar' } }
      : { cancelar, decision: { tipo: 'nada', motivo: 'esperando' } }
  }

  if (propio) {
    if (propio.status === 'queued') return { cancelar, decision: { tipo: 'nada', motivo: 'en_curso' } }
    if (esTerminal(propio)) return { cancelar, decision: { tipo: 'nada', motivo: 'hecho' } }
    if (!sePuedeRetomar(propio, ctx.ahora)) return { cancelar, decision: { tipo: 'nada', motivo: 'esperando' } }
  } else if (dormido + HEARTBEAT_EVERY_DAYS * seq < ctx.diaDelEncendido) {
    return { cancelar, decision: { tipo: 'nada', motivo: 'atrasado' } }
  }

  return { cancelar, decision: planear(c, ctx, propio?.id ?? null, 'heartbeat', seq) }
}

function planear(
  c: ClienteDelCiclo,
  ctx: ContextoDeDecision,
  existenteId: string | null,
  stage: TouchStage,
  seq: number
): Decision {
  const regalo = elegirRegalo(stage, seq, c.strong_offer_last_at, ctx.premios, ctx.ahora, ctx.strongCooldownDays)
  const plantilla = elegirPlantilla(stage, regalo !== null, c.source_channels, ctx.plantillas)
  if (!plantilla) return { tipo: 'sin_plantilla', stage }
  // Una plantilla sin dónde poner el regalo no lo lleva (hoy no pasa: t2/t4/trimestral van con
  // «Regalo que vence» o con la insistente, que tiene {{4}}).
  const lleva = regalo && GIFT_TITLE_VARIABLE[plantilla.key] ? regalo : null
  return { tipo: 'toque', toque: { existenteId, cycleNo: c.cycle_no, stage, seq, plantilla, regalo: lleva } }
}

// ═══════════════════════════════════════════════════════════════
// Blackout, grupo de control y topes (el cron, después de decidir)
// ═══════════════════════════════════════════════════════════════

export interface ContextoDeEnvio {
  ahora: Date
  slot: SendSlot
  holdoutPct: number
  /** Si el cliente está en la audiencia de un evento en su blackout: desde cuándo se reevalúa. */
  blackoutHasta: Date | null
  /** `passesFrequencyCap(last_campaign_at, 7, notBefore)`: lo calcula quien llama, con la regla de la pieza. */
  pasaSieteDias: boolean
  ultimaCampana: string | null
  /** Ya tiene 3 mensajes de marketing este mes (`filterByMonthlyCap()`). */
  alTopeDelMes: boolean
  /** 00:00 de Bogotá del día 1 del mes siguiente. */
  inicioDelMesSiguiente: Date
}

export type MotivoPospuesto = 'evento' | 'siete_dias' | 'tope_mes'

export type Resolucion =
  | { status: 'deferred'; dueAt: Date; reason: string; motivo: MotivoPospuesto }
  | { status: 'holdout'; dueAt: Date }
  | { status: 'encolar'; notBefore: Date; expiresAt: Date }

/** Sorteo del grupo de control: por etapa (y por número, en el trimestral) y por ciclo (H4). */
export function etapaDelSorteo(stage: TouchStage, seq: number): string {
  return stage === 'heartbeat' ? `heartbeat:${seq}` : stage
}

/**
 * En este orden (spec §3.3 regla 5, H4, H5, H6): el evento de su audiencia pospone hasta el
 * día siguiente al evento · el grupo de control no se envía pero queda con su `due_at` · el
 * cap de 7 días pospone a `last_campaign_at + 7` y el tope del mes al día 1 del siguiente ·
 * el resto se encola a la próxima hora de la marca.
 */
export function resolverToque(
  toque: Pick<ToquePlaneado, 'stage' | 'seq' | 'cycleNo'>,
  customerId: string,
  ctx: ContextoDeEnvio
): Resolucion {
  const notBefore = nextSendSlot(ctx.ahora, ctx.slot)
  if (ctx.blackoutHasta) {
    return {
      status: 'deferred',
      dueAt: ctx.blackoutHasta,
      reason: 'Un evento de su audiencia está por salir: el toque espera al día siguiente del evento',
      motivo: 'evento',
    }
  }
  if (isHoldout(customerId, etapaDelSorteo(toque.stage, toque.seq), toque.cycleNo, ctx.holdoutPct)) {
    return { status: 'holdout', dueAt: notBefore }
  }
  if (!ctx.pasaSieteDias && ctx.ultimaCampana) {
    return {
      status: 'deferred',
      dueAt: new Date(new Date(ctx.ultimaCampana).getTime() + CADENCE_RULES.frequencyCapDays * DIA_MS),
      reason: `Recibió otro mensaje hace menos de ${CADENCE_RULES.frequencyCapDays} días`,
      motivo: 'siete_dias',
    }
  }
  if (ctx.alTopeDelMes) {
    return {
      status: 'deferred',
      dueAt: ctx.inicioDelMesSiguiente,
      reason: 'Ya recibió 3 mensajes de marketing este mes',
      motivo: 'tope_mes',
    }
  }
  return { status: 'encolar', notBefore, expiresAt: queueExpiry(notBefore) }
}

// ═══════════════════════════════════════════════════════════════
// Las guardas del drenador (al enviar)
// ═══════════════════════════════════════════════════════════════

export interface ToqueEnCola {
  cycle_no: number
  stage: TouchStage
  gift_size: GiftSize | null
}

/** Un regalo de reactivación sin fecha no debería existir; si existe, el toque reintenta en una semana. */
const ESPERA_SI_EL_REGALO_NO_VENCE_DIAS = 7

export type GuardaDelCiclo =
  | { tipo: 'enviar' }
  | { tipo: 'cancelar'; motivo: string }
  | { tipo: 'posponer'; dueAt: Date; motivo: string }

/**
 * Encolar no es un permiso permanente (`send-governance.md`): entre el cron (15:00) y el
 * envío pueden pasar horas. Se mira de nuevo si la marca sigue con el ciclo, si el cliente
 * sigue en ESE ciclo y en el estado que el toque supone, y si ya tiene un regalo vivo
 * (spec §5: un regalo activo por cliente; ni sale ni cuenta como toque).
 */
export function guardaDelCicloAlEnviar(input: {
  cicloEncendido: boolean
  toque: ToqueEnCola
  cliente: { cycle_no: number; cycle_state: string }
  /** Vencimiento del regalo de reactivación vivo del cliente: `undefined` = no tiene; `null` = vivo y sin vencimiento. */
  regaloVivoVence?: string | null
  ahora: Date
}): GuardaDelCiclo {
  const { cicloEncendido, toque, cliente, regaloVivoVence, ahora } = input
  if (!cicloEncendido) return { tipo: 'cancelar', motivo: 'La marca apagó el ciclo de recuperación' }
  if (cliente.cycle_no !== toque.cycle_no) {
    return { tipo: 'cancelar', motivo: 'El cliente volvió antes del envío: abrió un ciclo nuevo' }
  }
  const estadoEsperado = toque.stage === 'heartbeat' ? 'dormido' : 'activo'
  if (cliente.cycle_state !== estadoEsperado) {
    return { tipo: 'cancelar', motivo: `El toque era para un cliente ${estadoEsperado} y ahora está ${cliente.cycle_state}` }
  }
  if (toque.gift_size && regaloVivoVence !== undefined) {
    const dueAt =
      regaloVivoVence === null
        ? new Date(ahora.getTime() + ESPERA_SI_EL_REGALO_NO_VENCE_DIAS * DIA_MS)
        : instanteEnBogota(bogotaDay(regaloVivoVence) + 1)
    return { tipo: 'posponer', dueAt, motivo: 'Ya tiene un regalo vivo: este espera al día siguiente de que ese venza' }
  }
  return { tipo: 'enviar' }
}
