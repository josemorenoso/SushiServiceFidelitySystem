/**
 * La pantalla del ciclo de recuperación, de LECTURA (fase 2, parte A, 2026-10-14): lo que
 * devuelven `/api/dashboard/cycle/overview`, `/projection` y `/customers` (spec §6 y §7.4).
 *
 * UN SOLO MOTOR. Acá no se calcula ninguna etapa, ritmo, día ni caja: se le pregunta a
 * `src/lib/cycle-engine.ts` (`boxOf()`, `boxEnteredOn()`, `stageEntryDays()`,
 * `heartbeatDueDays()`, `brandRhythmDetail()`, `secondVisitRate()`) y a
 * `src/lib/cycle-touch.ts` (`decidirCliente()`, `resolverToque()`, `proximaCorrida()`), las
 * MISMAS funciones que usa el cron. Si la pantalla calculara por su cuenta, anunciaría días
 * distintos de los que se envían (spec §7.2). Lo que el cron también lee —los regalos
 * válidos— sale de `cycle.service.ts`; si «Regalo que vence» está aprobada, de la misma
 * pregunta que el cron (`plantilla-aprobada.service.ts`), con 60 s de caché por marca.
 *
 * EL CICLO ES DE LA MARCA. Los toques tienen sede NULL (D12) y el reloj de reactivación es de
 * la marca (multi-sede §8.2): las cajas, la proyección y las listas leen la marca entera,
 * igual que hoy las burbujas del panel y el estimador. Lo único de sede es
 * quién puede ESCRIBIR («Hoy no»: alcance de marca), y eso vive en la ruta.
 *
 * Un fallo de base LANZA (y la ruta contesta 500): la pantalla dice «no pudimos leer», nunca
 * «0 clientes» (el incidente del 04-10). Nada en pesos (D7): conteos y tasas.
 *
 * Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §6, §7.4, §10, §11
 *      docs/features/ritmo-adaptativo.md §7 · docs/prompts/2026-10-14-ciclo-fase-2-pantalla.md §3
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure, type DbErrorLike } from '@/lib/db-failure'
import { leerTodo } from '@/lib/leer-todo'
import {
  bogotaDay,
  bandsFromConfig,
  boxEnteredOn,
  boxOf,
  brandRhythmDetail,
  daysForRhythm,
  daysWithoutVisit,
  effectiveRhythm,
  heartbeatDueDays,
  isCycleRhythm,
  isNewCustomer,
  normalizeCycleSettings,
  secondVisitRate,
  stageEntryDays,
  ATTRIBUTION_WINDOW_DAYS,
  CYCLE_SETTING_KEYS,
  CYCLE_STAGES,
  DORMANT_LABEL,
  HEARTBEAT_LABEL,
  RHYTHM_LABELS,
  SECOND_VISIT_WINDOW_DAYS,
  SEND_SLOTS,
  STAGE_LABELS,
  type BrandRhythmOrigin,
  type CycleBoxKey,
  type CycleRhythm,
  type CycleSettings,
  type SendSlot,
  type StageDays,
  type StageOptions,
} from '@/lib/cycle-engine'
import {
  decidirCliente,
  formatGiftDeadline,
  instanteEnBogota,
  isoDeDia,
  nextSendSlot,
  pospuestoHoy,
  proximaCorrida,
  resolverToque,
  CYCLE_CRON_HOUR,
  HOY_NO_CLAVES,
  TOUCH_TEMPLATES,
  type ClienteDelCiclo,
  type PlantillasDeLaMarca,
  type PremiosDelCiclo,
  type ToqueExistente,
  type TouchStage,
  type TouchTemplateKey,
} from '@/lib/cycle-touch'
import { getMultipleSettings } from '@/services/settings.service'
import { premiosDelCiclo } from '@/services/cycle.service'
import { punteroAprobadoEnPantalla } from '@/services/plantilla-aprobada.service'
import { audienciaDelEvento, listEvents } from '@/services/calendar.service'
import { getLineBudget } from '@/services/line-budget.service'
import { fechasEspecialesEntre, rubroDeLaMarca, type FechaEspecial } from '@/constants/fechas-especiales'
import type { Tenant } from '@/types/tenant.types'
import type { RestaurantEvent } from '@/types/database.types'

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
  logDbFailure({ scope: 'CycleScreen', reason, error, context })
  throw new Error(`Pantalla del ciclo: ${reason} (${error.message})`)
}

const DIA_MS = 24 * 60 * 60 * 1000
/** `YYYY-MM-DD` (la fecha de un evento) → número de día de `bogotaDay()`. */
const diaDeFecha = (fecha: string) => Math.floor(Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) / DIA_MS)

/** `in()` de a lotes: cada uuid ocupa ~37 caracteres de la URL de PostgREST. */
const LOTE = 150
function enLotes<T>(xs: readonly T[], n = LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < xs.length; i += n) lotes.push(xs.slice(i, i + n))
  return lotes
}

const pct = (parte: number, todo: number): number | null => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : null)

// ═══════════════════════════════════════════════════════════════
// La base: la marca, sus ajustes, su ritmo y sus clientes
// ═══════════════════════════════════════════════════════════════

const COLUMNAS_DEL_CLIENTE =
  'id, name, total_visits, total_points, source_channels, accepts_marketing, whatsapp_opt_out_at, cycle_no, cycle_started_at, cycle_state, dormant_since, strong_offer_last_at, cycle_rhythm, heartbeats_sent'

interface ClienteDeLaPantalla extends ClienteDelCiclo {
  name: string
  total_points: number | null
  accepts_marketing: boolean
  whatsapp_opt_out_at: string | null
  heartbeats_sent: number
}

interface BaseDelCiclo {
  tenant: Tenant
  ahora: Date
  hoy: number
  crudos: Record<string, string>
  ajustes: CycleSettings
  ritmo: { marca: CycleRhythm; origen: BrandRhythmOrigin; mediana: number | null; regresos: number }
  tieneDomicilio: boolean
  /** Los que el ciclo trabaja (los mismos que lee el cron): aceptan mensajes y no pidieron SALIR. */
  alcanzables: ClienteDeLaPantalla[]
  noRecibenMensajes: number
}

const CLAVES_QUE_LEE_LA_PANTALLA = [
  ...CYCLE_SETTING_KEYS,
  'aggressive_reward_id',
  'cycle_enabled_at',
  ...Object.values(HOY_NO_CLAVES),
  ...Object.values(TOUCH_TEMPLATES),
]

async function cargarBase(tenant: Tenant, ahora: Date): Promise<BaseDelCiclo> {
  const db = getServiceClient()
  const [crudos, lecturaClientes, stats] = await Promise.all([
    getMultipleSettings(CLAVES_QUE_LEE_LA_PANTALLA, tenant.id),
    leerTodo<ClienteDeLaPantalla>((desde, hasta) =>
      db
        .from('customers')
        .select(COLUMNAS_DEL_CLIENTE)
        .eq('tenant_id', tenant.id)
        .order('id', { ascending: true })
        .range(desde, hasta)
    ),
    db.rpc('cycle_brand_rhythm_stats', { p_tenant_id: tenant.id }),
  ])
  if (lecturaClientes.error) fallo('clientes_error', lecturaClientes.error, { tenant_id: tenant.id })
  if (stats.error) fallo('ritmo_error', stats.error, { tenant_id: tenant.id })

  const clientes = lecturaClientes.data
  const ajustes = normalizeCycleSettings(crudos, { totalClientes: clientes.length })
  const fila = ((stats.data ?? []) as Array<{ median_gap_days: number | null; returns_count: number | null }>)[0]
  const mediana = fila?.median_gap_days ?? null
  const regresos = fila?.returns_count ?? 0
  const { ritmo, origen } = brandRhythmDetail({
    mediana,
    regresos,
    elegidoPorElDueno: ajustes.rhythm === 'auto' ? null : ajustes.rhythm,
  })

  const alcanzables = clientes.filter((c) => c.accepts_marketing && !c.whatsapp_opt_out_at)
  return {
    tenant,
    ahora,
    hoy: bogotaDay(ahora),
    crudos,
    ajustes,
    ritmo: { marca: ritmo, origen, mediana, regresos },
    tieneDomicilio: tenant.config?.has_delivery_webhook === true,
    alcanzables,
    noRecibenMensajes: clientes.length - alcanzables.length,
  }
}

const esDormido = (c: ClienteDelCiclo) => c.cycle_state === 'dormido' || c.cycle_state === 'archivado'

function ritmoDe(c: ClienteDelCiclo, base: BaseDelCiclo): CycleRhythm {
  return effectiveRhythm(isCycleRhythm(c.cycle_rhythm) ? c.cycle_rhythm : null, base.ritmo.marca)
}

function opcionesDe(c: ClienteDelCiclo, base: BaseDelCiclo): StageOptions {
  return { tieneDomicilio: base.tieneDomicilio, canalesDelCliente: c.source_channels }
}

interface LugarActivo {
  caja: CycleBoxKey
  dias: number | null
  entraHoy: CycleBoxKey | null
}

/** Dónde está HOY un cliente activo, con las funciones del motor. */
function lugarDelActivo(c: ClienteDelCiclo, base: BaseDelCiclo): LugarActivo {
  if (!c.cycle_started_at) return { caja: 'reciente', dias: null, entraHoy: null }
  const dias = daysWithoutVisit(c.cycle_started_at, base.ahora)
  const ritmo = ritmoDe(c, base)
  const opciones = opcionesDe(c, base)
  return { caja: boxOf(dias, ritmo, opciones), dias, entraHoy: boxEnteredOn(dias, ritmo, opciones) }
}

// ═══════════════════════════════════════════════════════════════
// El retorno a 14 días, con mensaje y sin mensaje (spec §11.1)
// ═══════════════════════════════════════════════════════════════

/** El período que mira la pantalla: los toques cuya ventana de 14 días se cerró en los últimos 30 días. */
export const DIAS_DEL_PERIODO = 30

export interface Retorno {
  toques: number
  volvieron: number
  /** `null` sin toques que medir (nunca un 0 % inventado). */
  pct: number | null
}

export interface RetornoDeEtapa {
  con_mensaje: Retorno
  /** El grupo de control: «sin mensaje, para comparar». */
  sin_mensaje: Retorno
}

export interface ToqueMedible {
  stage: TouchStage
  status: 'sent' | 'holdout'
  due_at: string
  returned_at: string | null
}

async function leerToquesMedibles(tenantId: string, desde: Date): Promise<ToqueMedible[]> {
  const db = getServiceClient()
  const { data, error } = await leerTodo<ToqueMedible>((d, h) =>
    db
      .from('customer_cycle_touches')
      .select('id, stage, status, due_at, returned_at')
      .eq('tenant_id', tenantId)
      .in('status', ['sent', 'holdout'])
      .gte('due_at', desde.toISOString())
      .order('id', { ascending: true })
      .range(d, h)
  )
  if (error) fallo('toques_medibles_error', error, { tenant_id: tenantId })
  return data
}

const retornoVacio = (): RetornoDeEtapa => ({
  con_mensaje: { toques: 0, volvieron: 0, pct: null },
  sin_mensaje: { toques: 0, volvieron: 0, pct: null },
})

/**
 * El retorno por etapa y el total. Solo cuentan los toques cuya ventana de atribución
 * (`due_at` + 14 días, la del trigger `on_customer_visit`) ya se CERRÓ en los últimos 30 días:
 * un toque de ayer todavía puede traer a alguien, y contarlo bajaría la tasa de mentira. Los
 * dos grupos se miden con la misma vara. «Volvieron por un mensaje» son los regresos REALES
 * de los últimos 30 días (`returned_at`) de toques que salieron.
 */
export function medirRetorno(
  toques: readonly ToqueMedible[],
  ahora: Date
): { porEtapa: Map<TouchStage, RetornoDeEtapa>; total: RetornoDeEtapa; volvieronPorMensaje: number } {
  const cierre = ahora.getTime() - ATTRIBUTION_WINDOW_DAYS * DIA_MS
  const inicio = cierre - DIAS_DEL_PERIODO * DIA_MS
  const desdeRegresos = ahora.getTime() - DIAS_DEL_PERIODO * DIA_MS
  const porEtapa = new Map<TouchStage, RetornoDeEtapa>()
  const total = retornoVacio()
  let volvieronPorMensaje = 0

  for (const t of toques) {
    if (t.status === 'sent' && t.returned_at && Date.parse(t.returned_at) >= desdeRegresos) volvieronPorMensaje++
    const due = Date.parse(t.due_at)
    if (!(due >= inicio && due < cierre)) continue
    const etapa = porEtapa.get(t.stage) ?? retornoVacio()
    porEtapa.set(t.stage, etapa)
    for (const r of [etapa, total]) {
      const grupo = t.status === 'sent' ? r.con_mensaje : r.sin_mensaje
      grupo.toques++
      if (t.returned_at) grupo.volvieron++
    }
  }
  for (const r of [...porEtapa.values(), total]) {
    r.con_mensaje.pct = pct(r.con_mensaje.volvieron, r.con_mensaje.toques)
    r.sin_mensaje.pct = pct(r.sin_mensaje.volvieron, r.sin_mensaje.toques)
  }
  return { porEtapa, total, volvieronPorMensaje }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/cycle/overview
// ═══════════════════════════════════════════════════════════════

export interface CajaDelCiclo {
  key: CycleBoxKey
  etiqueta: string
  /** Días sin venir del rango, con el ritmo de la MARCA (un cliente con ritmo propio cae por sus días). */
  desde: number
  /** `null` = sin tope (la Despedida, mientras siga en el ciclo). */
  hasta: number | null
  total: number
  /** Una sola visita (o ninguna). */
  nuevos: number
  ya_volvieron: number
  /** Los que entran HOY a esta caja (Recién vino: los que vinieron hoy). */
  hoy_entran: number
  /** El regalo que lleva el toque de esta etapa, si la marca lo eligió. */
  regalo: string | null
  /** `null` en Recién vino (no tiene toque) y en la versión mini. */
  retorno: RetornoDeEtapa | null
}

export interface CajaDormidos {
  etiqueta: string
  total: number
  nuevos: number
  ya_volvieron: number
  /** Los que ya no reciben nada automático (los dos trimestrales pasaron): «sin toques desde hace más de 6 meses». */
  sin_toques_hace_6_meses: number
  hoy_entran: number
  /** El regalo del primer toque trimestral (el pequeño). */
  regalo: string | null
  retorno: RetornoDeEtapa | null
}

export type AccionDeTarjeta = 'ok' | 'hoy_no' | 'cambiar_regalo' | 'crear_evento' | 'elegir_regalo' | 'subir_foto'
export type TipoDeTarjeta = 'trimestral' | 'fecha_especial' | 'evento_sin_foto' | 'rescate_sin_regalo' | 'cupo_sin_regalo'

export interface TarjetaParaHoy {
  /** Estable mientras la situación no cambie: `trimestral`, `fecha:halloween:2026-10-31`, `evento_sin_foto:<id>`… */
  id: string
  tipo: TipoDeTarjeta
  /** La frase, en palabras del dueño. */
  texto: string
  /** A cuántos clientes mueve. */
  clientes: number
  /** Días hasta que importa (0 = hoy). */
  dias: number
  acciones: AccionDeTarjeta[]
  /** Trimestral: cuándo sale (ISO) y con qué regalo; si el dueño lo pospuso. */
  sale?: string
  regalo?: string | null
  pospuesto?: boolean
  /** Fecha especial: cuál y qué día (para «Crear evento» con la fecha puesta). */
  fecha?: string
  nombre?: string
  /** Evento sin foto: cuál. */
  evento_id?: string
}

export interface ProximoEvento {
  id: string
  titulo: string
  fecha: string
  dias: number
  estado: RestaurantEvent['status']
  /** A cuántos les llega la invitación (`null` si el evento es «solo recordarme»). */
  invitados: number | null
  sin_foto: boolean
}

export interface PrimerUso {
  regalo_pequeno: { listo: boolean; titulo: string | null; elegido_inactivo: boolean }
  regalo_fuerte: { listo: boolean; titulo: string | null; elegido_inactivo: boolean }
  /** `pendiente`: hay plantilla, pero el proveedor todavía no la aprobó (los regalos salen con la insistente). */
  plantilla_regalo: { estado: 'aprobada' | 'pendiente' | 'sin_plantilla' }
  listos: number
  total: 3
}

export interface SegundaVisita {
  ventana_dias: number
  /** La cohorte: quienes vinieron por PRIMERA vez entre estas dos fechas (su ventana de 60 días ya cerró). */
  desde: string
  hasta: string
  clientes: number
  volvieron: number
  pct: number | null
}

/**
 * El detalle plegado de la pantalla, «Ver por día» (parte B, 2026-10-14): cuántos clientes del
 * ciclo llevan exactamente N días sin venir. El mismo `daysWithoutVisit()` que ponen las cajas,
 * contado una vez más: la pantalla no calcula ningún día.
 */
export interface PorDia {
  /** `conteo[n]` = clientes del ciclo con exactamente `n` días sin venir. */
  conteo: number[]
  /** Los que llevan más días que el largo de `conteo` (un cliente con ritmo propio más lento que el de la marca). */
  mas_alla: number
}

/** Días que el detalle muestra después de la Despedida de la marca. */
export const DIAS_DESPUES_DE_LA_DESPEDIDA = 10

/** Cuenta cuántos clientes hay en cada día sin venir (0 … `largo - 1`); los demás van a `mas_alla`. */
export function contarPorDia(dias: Iterable<number>, largo: number): PorDia {
  const conteo = new Array<number>(Math.max(0, largo)).fill(0)
  let masAlla = 0
  for (const d of dias) {
    if (d >= 0 && d < conteo.length) conteo[d]++
    else if (d >= conteo.length) masAlla++
  }
  return { conteo, mas_alla: masAlla }
}

export interface CycleOverview {
  /** `true` = la versión del panel principal (el mini-ciclo): solo cajas y estado. */
  mini: boolean
  ciclo: {
    encendido: boolean
    encendido_desde: string | null
    /** La hora de la marca (`16:30` cena / `10:30` almuerzo). */
    hora: string
    grupo_de_control_pct: number
  }
  ritmo: {
    marca: CycleRhythm
    etiqueta: string
    origen: BrandRhythmOrigin
    dias: StageDays
    mediana: number | null
    regresos: number
    /** Clientes activos con su propio ritmo (3+ días con visita). */
    con_ritmo_propio: number
  }
  cajas: CajaDelCiclo[]
  dormidos: CajaDormidos
  /** Clientes de la marca que no aceptaron mensajes o pidieron SALIR: fuera del ciclo. */
  no_reciben_mensajes: number
  numeros: {
    en_el_ciclo: number
    dormidos: number
    volvieron_por_mensaje: {
      clientes: number
      con_mensaje_pct: number | null
      /** `null` mientras no haya grupo de control medido. */
      sin_mensaje_pct: number | null
    } | null
    proximo_evento: ProximoEvento | null
  }
  segunda_visita: SegundaVisita | null
  primer_uso: PrimerUso | null
  /** Máximo tres, ordenadas por lo que mueven por día que queda. */
  para_hoy: TarjetaParaHoy[] | null
  /** El histograma de «Ver por día». `null` en la versión mini. */
  por_dia: PorDia | null
}

/** Con cuántas tarjetas abre «Para hoy» como mucho (spec §6.1). */
export const MAX_TARJETAS = 3
/** Las fechas especiales y los eventos sin foto entran a «Para hoy» desde 30 días antes. */
export const DIAS_DE_ANTICIPACION = 30
/** El rango de eventos que mira la portada. */
const DIAS_DE_EVENTOS = 60

export async function getCycleOverview(
  tenant: Tenant,
  opciones: { ahora?: Date; mini?: boolean } = {}
): Promise<CycleOverview> {
  const ahora = opciones.ahora ?? new Date()
  const mini = opciones.mini === true
  const base = await cargarBase(tenant, ahora)
  const { ajustes, crudos, hoy } = base

  // ── Las cajas, contadas con el motor ──
  const cajasDeLaMarca = bandsFromConfig(base.ritmo.marca, { tieneDomicilio: base.tieneDomicilio })
  const cuenta = new Map<CycleBoxKey, { total: number; nuevos: number; hoy: number }>(
    cajasDeLaMarca.map((c) => [c.key, { total: 0, nuevos: 0, hoy: 0 }])
  )
  const dorm = { total: 0, nuevos: 0, archivados: 0, hoy: 0 }
  const activos: ClienteDeLaPantalla[] = []
  const diasDeLosActivos: number[] = []
  let conRitmoPropio = 0

  for (const c of base.alcanzables) {
    if (esDormido(c)) {
      dorm.total++
      if (isNewCustomer(c.total_visits)) dorm.nuevos++
      if (c.cycle_state === 'archivado') dorm.archivados++
      else if (c.dormant_since && bogotaDay(c.dormant_since) === hoy) dorm.hoy++
      continue
    }
    if (c.cycle_state !== 'activo') continue
    activos.push(c)
    if (isCycleRhythm(c.cycle_rhythm)) conRitmoPropio++
    const lugar = lugarDelActivo(c, base)
    if (lugar.dias !== null) diasDeLosActivos.push(lugar.dias)
    // Una etapa que no existe para la marca (sin domicilio no hay «Le mostramos lo otro») no
    // llega: `boxOf()` usa las etapas del cliente, que son un subconjunto de las de la marca.
    const fila = cuenta.get(lugar.caja) ?? { total: 0, nuevos: 0, hoy: 0 }
    cuenta.set(lugar.caja, fila)
    fila.total++
    if (isNewCustomer(c.total_visits)) fila.nuevos++
    if (lugar.entraHoy !== null) {
      const entra = cuenta.get(lugar.entraHoy)
      if (entra) entra.hoy++
    }
  }

  // ── Lo que la versión mini no necesita: retorno, regalos, eventos, tarjetas ──
  let medido: ReturnType<typeof medirRetorno> | null = null
  let premios: PremiosDelCiclo = { small: null, strong: null }
  let primerUso: PrimerUso | null = null
  let paraHoy: TarjetaParaHoy[] | null = null
  let proximoEvento: ProximoEvento | null = null
  let segundaVisita: SegundaVisita | null = null

  if (!mini) {
    const desdeToques = new Date(ahora.getTime() - (ATTRIBUTION_WINDOW_DAYS + DIAS_DEL_PERIODO) * DIA_MS)
    const [toques, premiosLeidos, diasConVisita, eventos] = await Promise.all([
      leerToquesMedibles(tenant.id, desdeToques),
      premiosDelCiclo(ajustes, tenant.id),
      leerDiasConVisita(tenant.id),
      listEvents(isoDeDia(hoy - 7), isoDeDia(hoy + DIAS_DE_EVENTOS), tenant.id),
    ])
    medido = medirRetorno(toques, ahora)
    premios = premiosLeidos

    // La MISMA pregunta que el cron (`punteroAprobado()`): Zernio y demo con el puntero; Twilio,
    // a Twilio — pero con 60 s de caché por marca (N-PORTADA-TWILIO, 2026-10-15): antes se le
    // preguntaba en CADA carga de la portada, y el cron lo hace una vez por corrida.
    const sids = Object.fromEntries(
      (Object.entries(TOUCH_TEMPLATES) as Array<[TouchTemplateKey, string]>).map(([k, setting]) => [k, crudos[setting] ?? null])
    ) as Record<TouchTemplateKey, string | null>
    const aprobada = await punteroAprobadoEnPantalla(tenant, sids.gift_expiring)
    const estadoPlantilla: PrimerUso['plantilla_regalo']['estado'] = !sids.gift_expiring?.trim()
      ? 'sin_plantilla'
      : aprobada
        ? 'aprobada'
        : 'pendiente'
    primerUso = {
      regalo_pequeno: {
        listo: premios.small !== null,
        titulo: premios.small?.title ?? null,
        elegido_inactivo: ajustes.smallRewardIds.length > 0 && premios.small === null,
      },
      regalo_fuerte: {
        listo: premios.strong !== null,
        titulo: premios.strong?.title ?? null,
        elegido_inactivo: ajustes.strongRewardId !== null && premios.strong === null,
      },
      plantilla_regalo: { estado: estadoPlantilla },
      listos: [premios.small !== null, premios.strong !== null, estadoPlantilla === 'aprobada'].filter(Boolean).length,
      total: 3,
    }

    const r = secondVisitRate(diasConVisita.values(), hoy)
    segundaVisita = {
      ventana_dias: SECOND_VISIT_WINDOW_DAYS,
      desde: isoDeDia(r.desde),
      hasta: isoDeDia(r.hasta),
      clientes: r.clientes,
      volvieron: r.volvieron,
      pct: pct(r.volvieron, r.clientes),
    }

    const audiencias = new Map<string, number>()
    const audiencia = async (ev: RestaurantEvent): Promise<number> => {
      const ya = audiencias.get(ev.id)
      if (ya !== undefined) return ya
      // La MISMA audiencia que va a recibir la invitación (`executeAutoEvent()` usa esta función):
      // con el ciclo encendido, sin los dormidos salvo «Incluir a los dormidos» (00073).
      const n = (await audienciaDelEvento(ev, tenant.id)).length
      audiencias.set(ev.id, n)
      return n
    }

    const proximo = eventos
      .filter((ev) => ev.status !== 'cancelled' && diaDeFecha(ev.event_date) >= hoy)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))[0]
    if (proximo) {
      proximoEvento = {
        id: proximo.id,
        titulo: proximo.title,
        fecha: proximo.event_date,
        dias: diaDeFecha(proximo.event_date) - hoy,
        estado: proximo.status,
        invitados: proximo.send_mode === 'auto' ? await audiencia(proximo) : null,
        sin_foto: proximo.send_mode === 'auto' && !proximo.media_url,
      }
    }

    const t2 = cuenta.get('t2')?.total ?? 0
    paraHoy = await armarParaHoy({
      base,
      activos,
      premios,
      plantillas: { sids, regaloQueVenceAprobada: aprobada },
      eventos,
      audiencia,
      clientesEnT2: t2,
    })
  }

  const regaloDeEtapa = (key: CycleBoxKey): string | null =>
    key === 't2' ? (premios.small?.title ?? null) : key === 't4' ? (premios.strong?.title ?? premios.small?.title ?? null) : null

  const cajas: CajaDelCiclo[] = cajasDeLaMarca.map((c) => {
    const n = cuenta.get(c.key) ?? { total: 0, nuevos: 0, hoy: 0 }
    return {
      key: c.key,
      etiqueta: c.label,
      desde: c.minDays,
      hasta: Number.isFinite(c.maxDays) ? c.maxDays : null,
      total: n.total,
      nuevos: n.nuevos,
      ya_volvieron: n.total - n.nuevos,
      hoy_entran: n.hoy,
      regalo: mini ? null : regaloDeEtapa(c.key),
      retorno: !medido || c.key === 'reciente' ? null : (medido.porEtapa.get(c.key) ?? retornoVacio()),
    }
  })

  const encendidoDesde =
    crudos.cycle_enabled_at && !Number.isNaN(Date.parse(crudos.cycle_enabled_at)) ? crudos.cycle_enabled_at : null

  return {
    mini,
    ciclo: {
      encendido: ajustes.enabled,
      encendido_desde: ajustes.enabled ? encendidoDesde : null,
      hora: SEND_SLOTS[ajustes.sendSlot],
      grupo_de_control_pct: ajustes.holdoutPct,
    },
    ritmo: {
      marca: base.ritmo.marca,
      etiqueta: RHYTHM_LABELS[base.ritmo.marca],
      origen: base.ritmo.origen,
      dias: daysForRhythm(base.ritmo.marca),
      mediana: base.ritmo.mediana,
      regresos: base.ritmo.regresos,
      con_ritmo_propio: conRitmoPropio,
    },
    cajas,
    dormidos: {
      etiqueta: DORMANT_LABEL,
      total: dorm.total,
      nuevos: dorm.nuevos,
      ya_volvieron: dorm.total - dorm.nuevos,
      sin_toques_hace_6_meses: dorm.archivados,
      hoy_entran: dorm.hoy,
      regalo: mini ? null : (premios.small?.title ?? null),
      retorno: medido ? (medido.porEtapa.get('heartbeat') ?? retornoVacio()) : null,
    },
    no_reciben_mensajes: base.noRecibenMensajes,
    numeros: {
      en_el_ciclo: activos.length,
      dormidos: dorm.total,
      volvieron_por_mensaje: medido
        ? {
            clientes: medido.volvieronPorMensaje,
            con_mensaje_pct: medido.total.con_mensaje.pct,
            sin_mensaje_pct: medido.total.sin_mensaje.pct,
          }
        : null,
      proximo_evento: proximoEvento,
    },
    segunda_visita: segundaVisita,
    primer_uso: primerUso,
    para_hoy: paraHoy,
    por_dia: mini
      ? null
      : contarPorDia(diasDeLosActivos, daysForRhythm(base.ritmo.marca)[4] + DIAS_DESPUES_DE_LA_DESPEDIDA + 1),
  }
}

/** Por cliente, los días (de Bogotá) con visita: la segunda visita se mide con días, no con `cycle_no`. */
async function leerDiasConVisita(tenantId: string): Promise<Map<string, number[]>> {
  const db = getServiceClient()
  const { data, error } = await leerTodo<{ id: string; customer_id: string; created_at: string }>((d, h) =>
    db
      .from('visits')
      .select('id, customer_id, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(d, h)
  )
  if (error) fallo('visitas_error', error, { tenant_id: tenantId })
  const porCliente = new Map<string, number[]>()
  for (const v of data) {
    if (!v.customer_id) continue
    porCliente.set(v.customer_id, [...(porCliente.get(v.customer_id) ?? []), bogotaDay(v.created_at)])
  }
  return porCliente
}

// ═══════════════════════════════════════════════════════════════
// «Para hoy» (spec §6.1): aprobar, no crear
// ═══════════════════════════════════════════════════════════════

const singular = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/** «16:30» → «4:30 pm» (como lo dice el prototipo). */
function horaEnPalabras(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** «hoy a las 4:30 pm» · «mañana a las 10:30 am» · «el sábado 17 de octubre a las 4:30 pm». */
export function cuandoSale(sale: Date, hoy: number, hora: string): string {
  const d = bogotaDay(sale) - hoy
  const dia = d === 0 ? 'hoy' : d === 1 ? 'mañana' : `el ${formatGiftDeadline(sale)}`
  return `${dia} a las ${horaEnPalabras(hora)}`
}

async function leerLatidos(tenantId: string): Promise<Map<string, ToqueExistente[]>> {
  const db = getServiceClient()
  const { data, error } = await leerTodo<ToqueExistente & { customer_id: string }>((d, h) =>
    db
      .from('customer_cycle_touches')
      .select('id, customer_id, cycle_no, stage, seq, status, attempts, due_at, sent_at')
      .eq('tenant_id', tenantId)
      .eq('stage', 'heartbeat')
      .order('id', { ascending: true })
      .range(d, h)
  )
  if (error) fallo('latidos_error', error, { tenant_id: tenantId })
  const porCliente = new Map<string, ToqueExistente[]>()
  for (const t of data) porCliente.set(t.customer_id, [...(porCliente.get(t.customer_id) ?? []), t])
  return porCliente
}

interface EntradaParaHoy {
  base: BaseDelCiclo
  activos: readonly ClienteDeLaPantalla[]
  premios: PremiosDelCiclo
  plantillas: PlantillasDeLaMarca
  eventos: readonly RestaurantEvent[]
  audiencia: (ev: RestaurantEvent) => Promise<number>
  clientesEnT2: number
}

/**
 * «31 dormidos reciben su toque trimestral mañana a las 4:30 pm con Postre del chef». Lo que
 * decidirá la PRÓXIMA corrida del cron (o la siguiente, si el dueño apretó «Hoy no»), con
 * `decidirCliente()` y `resolverToque()`: el mismo motor, el mismo grupo de control. No mira el
 * cap de 7 días, el tope del mes ni el blackout de un evento (son lecturas de la hora del
 * envío): el número es «a lo sumo».
 */
async function tarjetaTrimestral(e: EntradaParaHoy): Promise<TarjetaParaHoy | null> {
  const { base, premios, plantillas } = e
  const { ajustes, crudos, ahora, hoy } = base
  if (!ajustes.enabled || !ajustes.heartbeatEnabled) return null
  const dormidos = base.alcanzables.filter((c) => c.cycle_state === 'dormido')
  if (dormidos.length === 0) return null

  const corrida = proximaCorrida(ahora)
  const pospuesto = pospuestoHoy(crudos[HOY_NO_CLAVES.trimestral], corrida.instante)
  const instante = pospuesto ? instanteEnBogota(corrida.dia + 1, CYCLE_CRON_HOUR) : corrida.instante
  const anotado =
    crudos.cycle_enabled_at && !Number.isNaN(Date.parse(crudos.cycle_enabled_at)) ? crudos.cycle_enabled_at : null
  const latidos = await leerLatidos(base.tenant.id)
  const ctx = {
    ahora: instante,
    diaDelEncendido: bogotaDay(anotado ?? instante),
    ritmoDeLaMarca: base.ritmo.marca,
    tieneDomicilio: base.tieneDomicilio,
    heartbeatEnabled: ajustes.heartbeatEnabled,
    strongCooldownDays: ajustes.strongCooldownDays,
    plantillas,
    premios,
  }

  let n = 0
  const regalos = new Set<string>()
  for (const c of dormidos) {
    const toques = (latidos.get(c.id) ?? []).filter((t) => t.cycle_no === c.cycle_no)
    const { decision } = decidirCliente(c, toques, ctx)
    if (decision.tipo !== 'toque') continue
    const res = resolverToque(decision.toque, c.id, {
      ahora: instante,
      slot: ajustes.sendSlot,
      holdoutPct: ajustes.holdoutPct,
      blackoutHasta: null,
      pasaSieteDias: true,
      ultimaCampana: null,
      alTopeDelMes: false,
      inicioDelMesSiguiente: instante,
    })
    if (res.status !== 'encolar') continue
    n++
    if (decision.toque.regalo) regalos.add(decision.toque.regalo.premio.title)
  }
  if (n === 0) return null

  const sale = nextSendSlot(instante, ajustes.sendSlot)
  const titulos = [...regalos]
  const conRegalo = titulos.length === 0 ? ' sin regalo' : ` con ${titulos.join(' o ')}`
  const frase = `${n} ${singular(n, 'dormido recibe', 'dormidos reciben')} su toque trimestral ${cuandoSale(sale, hoy, SEND_SLOTS[ajustes.sendSlot])}${conRegalo}.`
  return {
    id: 'trimestral',
    tipo: 'trimestral',
    texto: pospuesto ? `Pospuesto un día: ${frase}` : frase,
    clientes: n,
    dias: bogotaDay(sale) - hoy,
    acciones: pospuesto ? ['ok', 'cambiar_regalo'] : ['ok', 'cambiar_regalo', 'hoy_no'],
    sale: sale.toISOString(),
    regalo: titulos[0] ?? null,
    pospuesto,
  }
}

/** «Halloween es en 27 días. ¿Creamos el evento?» — la fecha especial más cercana sin evento. */
function tarjetaFechaEspecial(e: EntradaParaHoy): TarjetaParaHoy | null {
  const { base, eventos, activos } = e
  const { tenant, hoy } = base
  const fechas: FechaEspecial[] = fechasEspecialesEntre(isoDeDia(hoy + 1), isoDeDia(hoy + DIAS_DE_ANTICIPACION), {
    businessType: tenant.business_type,
    rubro: rubroDeLaMarca(tenant),
  })
  for (const f of fechas) {
    const dia = diaDeFecha(f.fecha)
    // Ya hay un evento para esa fecha (la semana antes o el día después): no se sugiere.
    const yaTieneEvento = eventos.some((ev) => {
      const d = diaDeFecha(ev.event_date)
      return ev.status !== 'cancelled' && d >= dia - 7 && d <= dia + 1
    })
    if (yaTieneEvento) continue
    const dias = dia - hoy
    return {
      id: `fecha:${f.id}:${f.fecha}`,
      tipo: 'fecha_especial',
      texto: `${f.nombre} es ${dias === 1 ? 'mañana' : `en ${dias} días`}. ¿Creamos el evento?`,
      // Un evento de la marca le llega a los que están en el ciclo.
      clientes: activos.length,
      dias,
      acciones: ['crear_evento'],
      fecha: f.fecha,
      nombre: f.nombre,
    }
  }
  return null
}

/** «Noche de sushi (sábado 17 de octubre) todavía no tiene foto. Sin foto no sale.» */
async function tarjetasEventoSinFoto(e: EntradaParaHoy): Promise<TarjetaParaHoy[]> {
  const { base, eventos, audiencia } = e
  const { hoy } = base
  const out: TarjetaParaHoy[] = []
  for (const ev of eventos) {
    if (ev.send_mode !== 'auto' || ev.media_url || !['planned', 'scheduled'].includes(ev.status)) continue
    const diaDelEvento = diaDeFecha(ev.event_date)
    if (diaDelEvento < hoy) continue
    const diaDelEnvio = ev.scheduled_send_at ? bogotaDay(ev.scheduled_send_at) : diaDelEvento
    const dias = Math.max(0, diaDelEnvio - hoy)
    if (dias > DIAS_DE_ANTICIPACION) continue
    out.push({
      id: `evento_sin_foto:${ev.id}`,
      tipo: 'evento_sin_foto',
      texto: `«${ev.title}» (${formatGiftDeadline(instanteEnBogota(diaDelEvento, 12))}) todavía no tiene foto. Sin foto no sale.`,
      clientes: await audiencia(ev),
      dias,
      acciones: ['subir_foto'],
      evento_id: ev.id,
    })
  }
  return out
}

/** «23 clientes llegan al rescate esta semana y no hay regalo fuerte elegido.» */
function tarjetaRescateSinRegalo(e: EntradaParaHoy): TarjetaParaHoy | null {
  const { base, activos, premios } = e
  const { ajustes, hoy } = base
  if (!ajustes.enabled || premios.strong) return null
  let n = 0
  let primero = Infinity
  for (const c of activos) {
    if (!c.cycle_started_at) continue
    const rescate = stageEntryDays(c.cycle_started_at, ritmoDe(c, base), opcionesDe(c, base)).find((s) => s.stage === 't4')
    if (!rescate || rescate.day < hoy || rescate.day > hoy + 6) continue
    n++
    primero = Math.min(primero, rescate.day)
  }
  if (n === 0) return null
  const motivo = ajustes.strongRewardId ? 'el regalo fuerte que elegiste ya no está activo' : 'no hay regalo fuerte elegido'
  return {
    id: 'rescate_sin_regalo',
    tipo: 'rescate_sin_regalo',
    texto: `${n} ${singular(n, 'cliente llega', 'clientes llegan')} al rescate esta semana y ${motivo}.`,
    clientes: n,
    dias: primero - hoy,
    acciones: ['elegir_regalo'],
  }
}

/** «Hoy sobran 120 del cupo y hay 48 en «Le regalamos algo» sin regalo configurado.» */
async function tarjetaCupoSinRegalo(e: EntradaParaHoy): Promise<TarjetaParaHoy | null> {
  const { base, premios, clientesEnT2 } = e
  if (!base.ajustes.enabled || premios.small || clientesEnT2 === 0) return null
  // Lanza ante un fallo: el cupo es una lectura de base como cualquier otra.
  const cupo = await getLineBudget(base.tenant.id)
  if (!cupo.enforced || !cupo.campaignBudget || cupo.campaignAvailable === null) return null
  if (cupo.campaignAvailable <= cupo.campaignBudget * 0.5) return null
  return {
    id: 'cupo_sin_regalo',
    tipo: 'cupo_sin_regalo',
    texto: `Hoy sobran ${cupo.campaignAvailable} del cupo y ${singular(clientesEnT2, 'hay 1', `hay ${clientesEnT2}`)} en «${STAGE_LABELS.t2}» sin regalo configurado.`,
    clientes: clientesEnT2,
    dias: 0,
    acciones: ['elegir_regalo'],
  }
}

/**
 * Las tarjetas, ordenadas por lo que MUEVEN por día que queda (clientes ÷ días, mínimo 1):
 * un evento que sale mañana sin foto le gana a una fecha especial dentro de un mes aunque la
 * fecha llegue a más gente. Máximo tres. Las automáticas (el trimestral) solo con el ciclo
 * encendido: con el ciclo apagado no sale nada solo, y la tarjeta mentiría.
 */
export function ordenarTarjetas(tarjetas: readonly TarjetaParaHoy[]): TarjetaParaHoy[] {
  const peso = (t: TarjetaParaHoy) => t.clientes / Math.max(1, t.dias)
  return [...tarjetas]
    .filter((t) => t.clientes > 0)
    .sort((a, b) => peso(b) - peso(a) || a.dias - b.dias || a.id.localeCompare(b.id))
    .slice(0, MAX_TARJETAS)
}

async function armarParaHoy(e: EntradaParaHoy): Promise<TarjetaParaHoy[]> {
  const [trimestral, sinFoto, cupo] = await Promise.all([tarjetaTrimestral(e), tarjetasEventoSinFoto(e), tarjetaCupoSinRegalo(e)])
  const todas = [trimestral, tarjetaFechaEspecial(e), ...sinFoto, tarjetaRescateSinRegalo(e), cupo].filter(
    (t): t is TarjetaParaHoy => t !== null
  )
  return ordenarTarjetas(todas)
}

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/cycle/projection?from&to
// ═══════════════════════════════════════════════════════════════

/** El rango más largo que se proyecta de una vez (un trimestre). */
export const MAX_DIAS_DE_PROYECCION = 93

export interface EntradaDelDia {
  etapa: TouchStage
  etiqueta: string
  total: number
  nuevos: number
}

export interface EventoDelCalendario {
  id: string
  titulo: string
  fecha: string
  estado: RestaurantEvent['status']
  sin_foto: boolean
  /** «Reservado para el evento»: los días antes en que ningún otro mensaje les llega (blackout). */
  reservado_desde: string | null
}

export interface DiaDeLaProyeccion {
  fecha: string
  /** Cuántos entran a cada etapa ese día (vacío en los días pasados: la proyección es hacia adelante). */
  entran: EntradaDelDia[]
  eventos: string[]
  fechas_especiales: FechaEspecial[]
  /** Eventos para los que este día está reservado (blackout). */
  reservado_para: string[]
}

export interface CycleProjection {
  desde: string
  hasta: string
  hoy: string
  encendido: boolean
  dias: DiaDeLaProyeccion[]
  eventos: EventoDelCalendario[]
}

const ETIQUETA_DE_TOQUE = (s: TouchStage): string => (s === 'heartbeat' ? HEARTBEAT_LABEL : STAGE_LABELS[s])
const ORDEN_DE_TOQUE: readonly TouchStage[] = [...CYCLE_STAGES, 'heartbeat']

export async function getCycleProjection(
  tenant: Tenant,
  rango: { desde: string; hasta: string },
  opciones: { ahora?: Date } = {}
): Promise<CycleProjection> {
  const ahora = opciones.ahora ?? new Date()
  const ini = diaDeFecha(rango.desde)
  const fin = diaDeFecha(rango.hasta)
  // Un evento DESPUÉS del rango puede sombrear sus primeros días con el blackout (máx. 30).
  const [base, eventos] = await Promise.all([
    cargarBase(tenant, ahora),
    listEvents(rango.desde, isoDeDia(fin + 30), tenant.id),
  ])
  const { hoy } = base

  const dias = new Map<number, { entran: Map<TouchStage, { total: number; nuevos: number }>; d: DiaDeLaProyeccion }>()
  for (let n = ini; n <= fin; n++) {
    dias.set(n, {
      entran: new Map(),
      d: { fecha: isoDeDia(n), entran: [], eventos: [], fechas_especiales: [], reservado_para: [] },
    })
  }
  const sumar = (dia: number, etapa: TouchStage, nuevo: boolean) => {
    if (dia < hoy) return
    const fila = dias.get(dia)
    if (!fila) return
    const c = fila.entran.get(etapa) ?? { total: 0, nuevos: 0 }
    fila.entran.set(etapa, c)
    c.total++
    if (nuevo) c.nuevos++
  }

  for (const c of base.alcanzables) {
    const nuevo = isNewCustomer(c.total_visits)
    if (c.cycle_state === 'activo' && c.cycle_started_at) {
      for (const e of stageEntryDays(c.cycle_started_at, ritmoDe(c, base), opcionesDe(c, base))) sumar(e.day, e.stage, nuevo)
    } else if (c.cycle_state === 'dormido' && c.dormant_since && base.ajustes.heartbeatEnabled) {
      for (const h of heartbeatDueDays(c.dormant_since)) sumar(h.day, 'heartbeat', nuevo)
    }
  }

  for (const f of fechasEspecialesEntre(rango.desde, rango.hasta, {
    businessType: tenant.business_type,
    rubro: rubroDeLaMarca(tenant),
  })) {
    dias.get(diaDeFecha(f.fecha))?.d.fechas_especiales.push(f)
  }

  const delCalendario: EventoDelCalendario[] = []
  for (const ev of eventos) {
    if (ev.status === 'cancelled') continue
    const dia = diaDeFecha(ev.event_date)
    const blackout = Math.max(0, ev.blackout_days ?? 0)
    if (dia <= fin) {
      delCalendario.push({
        id: ev.id,
        titulo: ev.title,
        fecha: ev.event_date,
        estado: ev.status,
        sin_foto: ev.send_mode === 'auto' && !ev.media_url,
        reservado_desde:
          blackout > 0 && (ev.status === 'planned' || ev.status === 'scheduled') ? isoDeDia(dia - blackout) : null,
      })
      dias.get(dia)?.d.eventos.push(ev.id)
    }
    // Ventana del blackout: [fecha − blackout_days, fecha), y solo de un evento que todavía va a
    // salir (`planned`/`scheduled`), como `getActiveBlackouts()`.
    if (ev.status === 'planned' || ev.status === 'scheduled') {
      for (let n = dia - blackout; n < dia; n++) dias.get(n)?.d.reservado_para.push(ev.id)
    }
  }

  const out: DiaDeLaProyeccion[] = []
  for (const { entran, d } of dias.values()) {
    d.entran = ORDEN_DE_TOQUE.filter((s) => entran.has(s)).map((s) => ({
      etapa: s,
      etiqueta: ETIQUETA_DE_TOQUE(s),
      total: entran.get(s)!.total,
      nuevos: entran.get(s)!.nuevos,
    }))
    out.push(d)
  }

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    hoy: isoDeDia(hoy),
    encendido: base.ajustes.enabled,
    dias: out,
    eventos: delCalendario,
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/cycle/customers
// ═══════════════════════════════════════════════════════════════

export type FiltroDeClientes =
  /** Los que están HOY en una caja. */
  | { tipo: 'etapa'; etapa: CycleBoxKey }
  /** Los que llevan exactamente N días sin venir (el histograma «Ver por día»). */
  | { tipo: 'dia'; dia: number }
  /** La caja Dormidos (con los que ya no reciben nada automático). */
  | { tipo: 'dormidos' }
  /** Los que ENTRAN a un toque ese día (el calendario: tocar un día). */
  | { tipo: 'fecha'; fecha: string; etapa: TouchStage | null }

export const POR_PAGINA_DEFAULT = 50
export const POR_PAGINA_MAX = 100

export interface UltimoToque {
  etapa: TouchStage
  etiqueta: string
  /** `false` = «sin mensaje, para comparar» (grupo de control). */
  con_mensaje: boolean
  fecha: string
  /** Volvió en las dos semanas siguientes. */
  volvio: boolean
}

export interface ClienteDeLaLista {
  id: string
  nombre: string
  ciclo: number
  visitas: number
  puntos: number
  nuevo: boolean
  /** `null` para los dormidos. */
  dias_sin_venir: number | null
  caja: CycleBoxKey | 'dormido'
  /** Dormido que ya no recibe nada automático («sin toques desde hace más de 6 meses»). */
  archivado: boolean
  /** Solo con `fecha`: a qué toque entra ese día. */
  entra_a?: TouchStage
  ultimo_toque: UltimoToque | null
}

export interface ListaDelCiclo {
  filtro: FiltroDeClientes
  total: number
  nuevos: number
  ya_volvieron: number
  pagina: number
  por_pagina: number
  clientes: ClienteDeLaLista[]
}

interface Coincidencia {
  c: ClienteDeLaPantalla
  caja: CycleBoxKey | 'dormido'
  dias: number | null
  entra?: TouchStage
}

function coincidencias(base: BaseDelCiclo, filtro: FiltroDeClientes): Coincidencia[] {
  const out: Coincidencia[] = []
  const diaPedido = filtro.tipo === 'fecha' ? diaDeFecha(filtro.fecha) : null
  for (const c of base.alcanzables) {
    if (esDormido(c)) {
      if (filtro.tipo === 'dormidos') out.push({ c, caja: 'dormido', dias: null })
      else if (
        filtro.tipo === 'fecha' &&
        c.cycle_state === 'dormido' &&
        c.dormant_since &&
        base.ajustes.heartbeatEnabled &&
        (filtro.etapa === null || filtro.etapa === 'heartbeat') &&
        heartbeatDueDays(c.dormant_since).some((h) => h.day === diaPedido)
      ) {
        out.push({ c, caja: 'dormido', dias: null, entra: 'heartbeat' })
      }
      continue
    }
    if (c.cycle_state !== 'activo' || filtro.tipo === 'dormidos') continue
    const lugar = lugarDelActivo(c, base)
    if (filtro.tipo === 'etapa' && lugar.caja === filtro.etapa) out.push({ c, caja: lugar.caja, dias: lugar.dias })
    else if (filtro.tipo === 'dia' && lugar.dias === filtro.dia) out.push({ c, caja: lugar.caja, dias: lugar.dias })
    else if (filtro.tipo === 'fecha' && c.cycle_started_at) {
      const entrada = stageEntryDays(c.cycle_started_at, ritmoDe(c, base), opcionesDe(c, base)).find(
        (e) => e.day === diaPedido && (filtro.etapa === null || filtro.etapa === e.stage)
      )
      if (entrada) out.push({ c, caja: lugar.caja, dias: lugar.dias, entra: entrada.stage })
    }
  }
  return out
}

function ordenar(filtro: FiltroDeClientes, xs: Coincidencia[]): Coincidencia[] {
  const nombre = (a: Coincidencia, b: Coincidencia) =>
    (a.c.name ?? '').localeCompare(b.c.name ?? '', 'es') || a.c.id.localeCompare(b.c.id)
  if (filtro.tipo === 'dormidos') {
    // Los que todavía reciben su trimestral primero; dentro, los que se durmieron antes.
    return xs.sort(
      (a, b) =>
        Number(a.c.cycle_state === 'archivado') - Number(b.c.cycle_state === 'archivado') ||
        (a.c.dormant_since ?? '').localeCompare(b.c.dormant_since ?? '') ||
        nombre(a, b)
    )
  }
  if (filtro.tipo === 'fecha') {
    return xs.sort((a, b) => ORDEN_DE_TOQUE.indexOf(a.entra!) - ORDEN_DE_TOQUE.indexOf(b.entra!) || nombre(a, b))
  }
  // Los más cerca de la próxima etapa primero.
  return xs.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || nombre(a, b))
}

async function ultimosToques(tenantId: string, ids: readonly string[]): Promise<Map<string, UltimoToque>> {
  const db = getServiceClient()
  const ultimos = new Map<string, UltimoToque>()
  for (const lote of enLotes(ids)) {
    const { data, error } = await leerTodo<{
      id: string
      customer_id: string
      stage: TouchStage
      status: 'sent' | 'holdout'
      due_at: string
      sent_at: string | null
      returned_at: string | null
    }>((d, h) =>
      db
        .from('customer_cycle_touches')
        .select('id, customer_id, stage, status, due_at, sent_at, returned_at')
        .eq('tenant_id', tenantId)
        .in('customer_id', lote)
        .in('status', ['sent', 'holdout'])
        .order('due_at', { ascending: false })
        .order('id', { ascending: true })
        .range(d, h)
    )
    if (error) fallo('ultimo_toque_error', error, { tenant_id: tenantId })
    for (const t of data) {
      if (ultimos.has(t.customer_id)) continue
      ultimos.set(t.customer_id, {
        etapa: t.stage,
        etiqueta: ETIQUETA_DE_TOQUE(t.stage),
        con_mensaje: t.status === 'sent',
        fecha: t.sent_at ?? t.due_at,
        volvio: t.returned_at !== null,
      })
    }
  }
  return ultimos
}

export async function getCycleCustomers(
  tenant: Tenant,
  filtro: FiltroDeClientes,
  opciones: { pagina?: number; porPagina?: number; ahora?: Date } = {}
): Promise<ListaDelCiclo> {
  const ahora = opciones.ahora ?? new Date()
  const pagina = Math.max(1, Math.floor(opciones.pagina ?? 1))
  const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, Math.floor(opciones.porPagina ?? POR_PAGINA_DEFAULT)))
  const base = await cargarBase(tenant, ahora)

  const todos = ordenar(filtro, coincidencias(base, filtro))
  const nuevos = todos.filter((x) => isNewCustomer(x.c.total_visits)).length
  const enLaPagina = todos.slice((pagina - 1) * porPagina, pagina * porPagina)
  const ultimos = await ultimosToques(
    tenant.id,
    enLaPagina.map((x) => x.c.id)
  )

  return {
    filtro,
    total: todos.length,
    nuevos,
    ya_volvieron: todos.length - nuevos,
    pagina,
    por_pagina: porPagina,
    clientes: enLaPagina.map((x) => ({
      id: x.c.id,
      nombre: x.c.name,
      ciclo: x.c.cycle_no,
      visitas: x.c.total_visits ?? 0,
      puntos: x.c.total_points ?? 0,
      nuevo: isNewCustomer(x.c.total_visits),
      dias_sin_venir: x.dias,
      caja: x.caja,
      archivado: x.c.cycle_state === 'archivado',
      ...(x.entra ? { entra_a: x.entra } : {}),
      ultimo_toque: ultimos.get(x.c.id) ?? null,
    })),
  }
}

// ═══════════════════════════════════════════════════════════════
// Las audiencias del creador «Mandar un regalo» (fase 2, parte C, 2026-10-14)
// ═══════════════════════════════════════════════════════════════

/** A quién se le manda un regalo (spec §6.5): una caja, los Dormidos, o todos. */
export type AudienciaDeRegalo = CycleBoxKey | 'dormidos' | 'todos'

export interface AudienciaDelCiclo {
  clave: AudienciaDeRegalo
  etiqueta: string
  /** Los clientes que están HOY ahí (los que el ciclo trabaja: aceptan mensajes y no pidieron SALIR). */
  ids: string[]
  /** «Recién vino» no se ofrece: vinieron hace poco y todavía no les toca ningún mensaje. */
  disponible: boolean
}

export interface AudienciasDelCiclo {
  encendido: boolean
  sendSlot: SendSlot
  /** En el orden de la pantalla: las cajas de la marca, Dormidos y Todos. */
  audiencias: AudienciaDelCiclo[]
}

/**
 * Quién está HOY en cada caja, en Dormidos y en «Todos», con el MISMO motor que las cajas de la
 * portada (`lugarDelActivo()` → `boxOf()`): el «Rescate · 23» del creador es el mismo 23 de la
 * caja. «Todos» son los del ciclo menos los que recién vinieron, más los dormidos (también los
 * que ya no reciben nada automático: un regalo que manda el dueño no es automático).
 */
export async function audienciasDelCiclo(tenant: Tenant, opciones: { ahora?: Date } = {}): Promise<AudienciasDelCiclo> {
  const base = await cargarBase(tenant, opciones.ahora ?? new Date())
  const cajas = bandsFromConfig(base.ritmo.marca, { tieneDomicilio: base.tieneDomicilio })
  const porCaja = new Map<CycleBoxKey, string[]>(cajas.map((c) => [c.key, []]))
  const dormidos: string[] = []
  for (const c of base.alcanzables) {
    if (esDormido(c)) {
      dormidos.push(c.id)
      continue
    }
    if (c.cycle_state !== 'activo') continue
    const lugar = lugarDelActivo(c, base)
    porCaja.get(lugar.caja)?.push(c.id)
  }
  const todos = [...cajas.filter((c) => c.key !== 'reciente').flatMap((c) => porCaja.get(c.key) ?? []), ...dormidos]
  return {
    encendido: base.ajustes.enabled,
    sendSlot: base.ajustes.sendSlot,
    audiencias: [
      ...cajas.map((c) => ({ clave: c.key, etiqueta: c.label, ids: porCaja.get(c.key) ?? [], disponible: c.key !== 'reciente' })),
      { clave: 'dormidos' as const, etiqueta: DORMANT_LABEL, ids: dormidos, disponible: true },
      { clave: 'todos' as const, etiqueta: 'Todos', ids: todos, disponible: true },
    ],
  }
}
