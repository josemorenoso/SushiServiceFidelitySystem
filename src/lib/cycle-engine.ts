/**
 * Motor del ciclo de recuperación — cálculo PURO, sin I/O (como `points-engine.ts`).
 *
 * Lo van a importar el cron que decide y encola (fase 1B), los endpoints y el navegador
 * (fase 2). Si la pantalla y el cron calcularan la etapa por separado, anunciarían días
 * distintos (spec §7.2). Por eso este módulo NO importa nada de Supabase ni toca la red.
 *
 * ESPEJO EN SQL: el ritmo personal lo fija un trigger de la migración 00070 al abrir cada
 * ciclo (`cycle_rhythm_from_median()` + `cycle_customer_median_gap()`). La regla de abajo
 * (`rhythmFromMedian()` y `medianGap()`) tiene que ser IDÉNTICA: lo verifica
 * `tests/db/cycle-triggers.test.ts` con los mismos historiales en los dos lados.
 *
 * Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §3, §7.2, §13, §14
 *      docs/features/ritmo-adaptativo.md
 */

import {
  DEFAULT_REWARD_REMINDER_DAYS_BEFORE,
  FREQUENCY_CAP_DAYS,
  MONTHLY_MARKETING_CAP,
} from '@/constants/rewards'
import { APP_UTC_OFFSET, appEndOfDay } from '@/lib/timezone'

// ═══════════════════════════════════════════════════════════════
// Los cuatro ritmos (spec §3.2.bis, decisión A4)
// ═══════════════════════════════════════════════════════════════

export const CYCLE_RHYTHMS = ['cafe', 'casual', 'restaurant', 'occasional'] as const
export type CycleRhythm = (typeof CYCLE_RHYTHMS)[number]

/** Las cinco etapas del ciclo activo, en orden. `heartbeat` (el trimestral) es aparte. */
export const CYCLE_STAGES = ['t1', 't2', 't3', 't4', 't5'] as const
export type CycleStage = (typeof CYCLE_STAGES)[number]

/** Los días sin venir en que cae cada etapa: t1 · t2 · t3 · t4 · t5. */
export type StageDays = readonly [number, number, number, number, number]

/**
 * Los cuatro ritmos validados. Los cuatro pasan `validateStageConfig()` (7 días entre
 * toques y nunca más de 3 mensajes por mes calendario ni por ventana de 30 días, contando
 * el recordatorio del rescate). El de restaurante se ajustó el 11-10 a los percentiles de
 * Sushi Service (mediana 27, 75 % en 49, 90 % en 74).
 */
export const RHYTHM_PRESETS: Readonly<Record<CycleRhythm, StageDays>> = {
  cafe: [7, 14, 26, 42, 58],
  casual: [10, 17, 29, 45, 61],
  restaurant: [14, 28, 42, 60, 80],
  occasional: [21, 38, 56, 80, 110],
}

/** El ritmo cuando no hay datos ni elección del dueño. */
export const DEFAULT_RHYTHM: CycleRhythm = 'restaurant'

/** Regresos que necesita una marca para que su mediana elija el ritmo (si no: restaurante). */
export const BRAND_RHYTHM_MIN_RETURNS = 30

/** Días distintos con visita que necesita un cliente para tener ritmo personal. */
export const PERSONAL_RHYTHM_MIN_DAYS = 3

/** Con ≥ 5 visitas se salta «Le recordamos»: ya conoce el programa (spec §3.6). */
export const T1_SKIP_MIN_VISITS = 5

/** Toque trimestral a dormidos: cada 90 días, máximo 2 (spec §3.5). */
export const HEARTBEAT_EVERY_DAYS = 90
export const HEARTBEAT_MAX = 2

/** «Vence el domingo»: mínimo de días entre el envío y el vencimiento (spec §5). */
export const GIFT_MIN_DAYS = 5

/** El tope mensual se cuenta también en cualquier ventana de 30 días (H1). */
export const MONTHLY_WINDOW_DAYS = 30

export function isCycleRhythm(value: unknown): value is CycleRhythm {
  return typeof value === 'string' && (CYCLE_RHYTHMS as readonly string[]).includes(value)
}

export function daysForRhythm(ritmo: CycleRhythm): StageDays {
  return RHYTHM_PRESETS[ritmo]
}

// ═══════════════════════════════════════════════════════════════
// Días en hora de Bogotá
// ═══════════════════════════════════════════════════════════════

const DIA_MS = 24 * 60 * 60 * 1000

/** `-05:00` → −300 minutos. Colombia no tiene horario de verano (`timezone.ts`). */
const OFFSET_MS = (() => {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(APP_UTC_OFFSET)
  if (!m) throw new Error(`APP_UTC_OFFSET inválido: ${APP_UTC_OFFSET}`)
  const minutos = Number(m[2]) * 60 + Number(m[3])
  return (m[1] === '-' ? -minutos : minutos) * 60 * 1000
})()

/** Número de día calendario (días desde 1970-01-01) del instante, en hora de Bogotá. */
export function bogotaDay(instante: Date | string | number): number {
  const ms = instante instanceof Date ? instante.getTime() : new Date(instante).getTime()
  return Math.floor((ms + OFFSET_MS) / DIA_MS)
}

/** `YYYY-MM-DD` de un número de día. */
function isoDeDia(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10)
}

/** 0 = domingo … 6 = sábado. El 1970-01-01 fue jueves. */
function diaDeLaSemana(dia: number): number {
  return (((dia + 4) % 7) + 7) % 7
}

// ═══════════════════════════════════════════════════════════════
// El ritmo personal y el de la marca
// ═══════════════════════════════════════════════════════════════

/** Mediana clásica: con un número par de valores, el promedio de los dos del medio. */
function mediana(valores: readonly number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(orden.length / 2)
  return orden.length % 2 === 1 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2
}

/**
 * Mediana de días entre los DÍAS DISTINTOS con visita (hora de Bogotá): dos escaneos el
 * mismo día son una visita. `null` con menos de `PERSONAL_RHYTHM_MIN_DAYS` días.
 *
 * Espejo de `cycle_customer_median_gap()` (00070), que usa `percentile_cont(0.5)`: la
 * misma mediana clásica.
 */
export function medianGap(diasConVisita: ReadonlyArray<Date | string | number>): number | null {
  const dias = [...new Set(diasConVisita.map(bogotaDay))].sort((a, b) => a - b)
  if (dias.length < PERSONAL_RHYTHM_MIN_DAYS) return null
  const huecos = dias.slice(1).map((d, i) => d - dias[i])
  return mediana(huecos)
}

/**
 * El ritmo validado más cercano a una mediana: < 9 → cafe · 9–18 → casual · 19–35 →
 * restaurant · > 35 → occasional (cortes ≈ punto medio geométrico entre las medianas de
 * referencia 6, 13, 27 y 45). Con una mediana fraccionaria, 18,5 es casual y 35,5 es
 * occasional. Espejo EXACTO de `cycle_rhythm_from_median()` (00070).
 */
export function rhythmFromMedian(dias: number): CycleRhythm {
  if (dias < 9) return 'cafe'
  if (dias < 19) return 'casual'
  if (dias <= 35) return 'restaurant'
  return 'occasional'
}

/** El ritmo personal de un historial, o `null` si todavía no tiene 3 días con visita. */
export function personalRhythm(diasConVisita: ReadonlyArray<Date | string | number>): CycleRhythm | null {
  const m = medianGap(diasConVisita)
  return m === null ? null : rhythmFromMedian(m)
}

/** El personal manda; sin él, el de la marca. */
export function effectiveRhythm(personal: CycleRhythm | null | undefined, marca: CycleRhythm): CycleRhythm {
  return personal ?? marca
}

/** De dónde salió el ritmo de la marca: lo eligió el dueño, lo calculó su mediana, o el de por defecto. */
export type BrandRhythmOrigin = 'dueno' | 'calculado' | 'por_defecto'

/**
 * El ritmo de la MARCA y de dónde salió (la pantalla lo dice: «Tus clientes vuelven cada
 * mes · calculado con tus visitas»). Es la ÚNICA regla: `brandRhythm()` la usa.
 */
export function brandRhythmDetail(input: {
  mediana: number | null
  regresos: number
  elegidoPorElDueno?: string | null
}): { ritmo: CycleRhythm; origen: BrandRhythmOrigin } {
  if (isCycleRhythm(input.elegidoPorElDueno)) return { ritmo: input.elegidoPorElDueno, origen: 'dueno' }
  if (input.mediana !== null && Number.isFinite(input.mediana) && input.regresos >= BRAND_RHYTHM_MIN_RETURNS) {
    return { ritmo: rhythmFromMedian(input.mediana), origen: 'calculado' }
  }
  return { ritmo: DEFAULT_RHYTHM, origen: 'por_defecto' }
}

/**
 * El ritmo de la MARCA (para quien tiene 1 o 2 días con visita). Lo que eligió el dueño
 * en Ajustes manda; si eligió `auto` (el default) o nada, con 30 o más regresos la mediana
 * de la marca elige, y con menos, `restaurant`. `mediana` y `regresos` salen de
 * `cycle_brand_rhythm_stats()` (00070).
 */
export function brandRhythm(input: {
  mediana: number | null
  regresos: number
  elegidoPorElDueno?: string | null
}): CycleRhythm {
  return brandRhythmDetail(input).ritmo
}

/** Cómo dice el dueño cada ritmo (las palabras del prototipo aprobado el 14-10). */
export const RHYTHM_LABELS: Readonly<Record<CycleRhythm, string>> = {
  cafe: 'Cada semana',
  casual: 'Cada quince días',
  restaurant: 'Cada mes',
  occasional: 'De vez en cuando',
}

// ═══════════════════════════════════════════════════════════════
// Las etapas
// ═══════════════════════════════════════════════════════════════

/** Cómo llama el dueño a cada etapa (spec §6.6). */
export const STAGE_LABELS: Readonly<Record<CycleStage | 'reciente', string>> = {
  reciente: 'Recién vino',
  t1: 'Le recordamos',
  t2: 'Le regalamos algo',
  t3: 'Le mostramos lo otro',
  t4: 'Rescate',
  t5: 'Despedida',
}

/** El toque de los dormidos y su caja, en palabras del dueño (spec §6.6). */
export const HEARTBEAT_LABEL = 'Toque trimestral'
export const DORMANT_LABEL = 'Dormidos'

export interface StageOptions {
  /** `tenants.config.has_delivery_webhook` (00066). Sin domicilio no existe `t3`. */
  tieneDomicilio: boolean
  /** `customers.source_channels`. Con `both`, «le mostramos lo otro» no tiene qué mostrar. */
  canalesDelCliente?: 'qr' | 'delivery' | 'both' | string | null
}

/**
 * Las etapas que existen para este cliente, con su día. `t3` solo con domicilio, y se
 * salta si el cliente ya usa los dos canales (spec §3.2, decisión 13).
 */
export function cycleStages(ritmo: CycleRhythm, opts: StageOptions): Array<{ stage: CycleStage; day: number }> {
  const dias = RHYTHM_PRESETS[ritmo]
  const conT3 = opts.tieneDomicilio && opts.canalesDelCliente !== 'both'
  return CYCLE_STAGES.map((stage, i) => ({ stage, day: dias[i] })).filter((e) => e.stage !== 't3' || conT3)
}

/**
 * La etapa en la que está un cliente con `diasSinVenir`: la última cuyo día ya llegó.
 * `null` antes de la primera. Decir QUÉ toque le corresponde es de acá; decidir si se
 * envía hoy (ya salió en este ciclo, grupo de control, blackout de un evento, salto de
 * `t1`) es del cron de la fase 1B.
 */
export function resolveStage(diasSinVenir: number, ritmo: CycleRhythm, opts: StageOptions): CycleStage | null {
  let actual: CycleStage | null = null
  for (const e of cycleStages(ritmo, opts)) {
    if (diasSinVenir >= e.day) actual = e.stage
  }
  return actual
}

export interface CycleBox {
  key: CycleStage | 'reciente'
  label: string
  minDays: number
  /** `Infinity` en la última (Despedida, mientras siga activo). */
  maxDays: number
}

/**
 * Las cajas por etapa de la pantalla (spec §6.2): «Recién vino» y una por etapa que
 * exista. Los dormidos son una caja aparte (por estado, no por días).
 *
 * Reemplazará a `deriveCycleBands()` (`src/constants/rankings.ts`) en la fase 2; hasta
 * entonces aquella sigue sirviendo a las pantallas de hoy con los días viejos.
 */
export function bandsFromConfig(ritmo: CycleRhythm, opts: StageOptions): CycleBox[] {
  const etapas = cycleStages(ritmo, opts)
  const cajas: CycleBox[] = [{ key: 'reciente', label: STAGE_LABELS.reciente, minDays: 0, maxDays: etapas[0].day - 1 }]
  etapas.forEach((e, i) => {
    const siguiente = etapas[i + 1]
    cajas.push({
      key: e.stage,
      label: STAGE_LABELS[e.stage],
      minDays: e.day,
      maxDays: siguiente ? siguiente.day - 1 : Infinity,
    })
  })
  return cajas
}

// ═══════════════════════════════════════════════════════════════
// La pantalla (fase 2): cajas, entradas y proyección — con la MISMA regla que el cron
// ═══════════════════════════════════════════════════════════════

export type CycleBoxKey = CycleStage | 'reciente'

/** «Nuevo» = una sola visita (o ninguna). El `cycle_no` no sirve: es la llave del libro de toques. */
export const NEW_CUSTOMER_MAX_VISITS = 1

export function isNewCustomer(totalVisits: number | null | undefined): boolean {
  return (totalVisits ?? 0) <= NEW_CUSTOMER_MAX_VISITS
}

/**
 * Días sin venir de un cliente activo: días de Bogotá entre el inicio de su ciclo y `ahora`
 * (la MISMA cuenta que `decidirCliente()` en `cycle-touch.ts`).
 */
export function daysWithoutVisit(cycleStartedAt: Date | string, ahora: Date): number {
  return bogotaDay(ahora) - bogotaDay(cycleStartedAt)
}

/** La caja de un cliente activo: «Recién vino» antes del primer toque, si no su etapa. */
export function boxOf(diasSinVenir: number, ritmo: CycleRhythm, opts: StageOptions): CycleBoxKey {
  return resolveStage(diasSinVenir, ritmo, opts) ?? 'reciente'
}

/**
 * ¿A qué caja ENTRA hoy? «Recién vino» el día de la visita (día 0); una etapa, el día exacto
 * en que le toca. `null` si hoy no cambia de caja.
 */
export function boxEnteredOn(diasSinVenir: number, ritmo: CycleRhythm, opts: StageOptions): CycleBoxKey | null {
  if (diasSinVenir === 0) return 'reciente'
  return cycleStages(ritmo, opts).find((e) => e.day === diasSinVenir)?.stage ?? null
}

/**
 * El día calendario (número de `bogotaDay()`) en que el cliente entra a cada etapa de su
 * ciclo: el inicio del ciclo + el día de la etapa en SU ritmo. Es la proyección del
 * calendario (spec §6.4): aritmética, sin tabla nueva.
 */
export function stageEntryDays(
  inicioDelCiclo: Date | string,
  ritmo: CycleRhythm,
  opts: StageOptions
): Array<{ stage: CycleStage; day: number }> {
  const inicio = bogotaDay(inicioDelCiclo)
  return cycleStages(ritmo, opts).map((e) => ({ stage: e.stage, day: inicio + e.day }))
}

/**
 * Los días en que a un dormido le toca cada toque trimestral: `dormant_since` + 90 × n, con
 * n = 1 … `HEARTBEAT_MAX` (la cuenta de `decidirCliente()` para los dormidos).
 */
export function heartbeatDueDays(dormantSince: Date | string): Array<{ seq: number; day: number }> {
  const dormido = bogotaDay(dormantSince)
  return Array.from({ length: HEARTBEAT_MAX }, (_, i) => ({ seq: i + 1, day: dormido + HEARTBEAT_EVERY_DAYS * (i + 1) }))
}

/**
 * La atribución del regreso: el toque cuyo día de envío (`due_at`) cae en los 14 días
 * anteriores a la visita. ESPEJO del trigger `on_customer_visit` (00070), que es quien la
 * escribe: este número solo dice cuándo se CERRÓ la ventana de un toque.
 */
export const ATTRIBUTION_WINDOW_DAYS = 14

/** La segunda visita (A12): la ventana y la cohorte que se miden. */
export const SECOND_VISIT_WINDOW_DAYS = 60
export const SECOND_VISIT_COHORT_DAYS = 90

export interface SecondVisitRate {
  /** Primer día (número de `bogotaDay()`) de la cohorte: quienes vinieron por PRIMERA vez desde acá… */
  desde: number
  /** …hasta acá: la ventana de 60 días de todos ya cerró. */
  hasta: number
  clientes: number
  volvieron: number
}

/**
 * La segunda visita (decisión A12, métrica principal): de los clientes cuya PRIMERA visita
 * cae en la cohorte (los `SECOND_VISIT_COHORT_DAYS` días que terminan hace
 * `SECOND_VISIT_WINDOW_DAYS`), cuántos volvieron OTRO día dentro de los 60 siguientes. Se
 * cuenta con DÍAS DISTINTOS con visita (hora de Bogotá), no con `cycle_no`: dos escaneos el
 * mismo día son una visita, y el `cycle_no` sube con cada uno.
 *
 * `diasConVisitaPorCliente`: por cliente, los días (números de `bogotaDay()`) con visita.
 */
export function secondVisitRate(diasConVisitaPorCliente: Iterable<Iterable<number>>, hoy: number): SecondVisitRate {
  const hasta = hoy - SECOND_VISIT_WINDOW_DAYS
  const desde = hasta - SECOND_VISIT_COHORT_DAYS + 1
  let clientes = 0
  let volvieron = 0
  for (const crudos of diasConVisitaPorCliente) {
    const dias = [...new Set(crudos)].sort((a, b) => a - b)
    if (dias.length === 0) continue
    const primera = dias[0]
    if (primera < desde || primera > hasta) continue
    clientes++
    if (dias.some((d) => d > primera && d <= primera + SECOND_VISIT_WINDOW_DAYS)) volvieron++
  }
  return { desde, hasta, clientes, volvieron }
}

// ═══════════════════════════════════════════════════════════════
// «Vence el domingo» y la validación por simulación (H1, H2)
// ═══════════════════════════════════════════════════════════════

/** El primer domingo que cae al menos `minDias` días después de `dia` (números de día). */
function domingoDesde(dia: number, minDias: number): number {
  let d = dia + minDias
  while (diaDeLaSemana(d) !== 0) d++
  return d
}

/**
 * Fecha límite de un regalo: el cierre (23:59:59 Bogotá) del primer domingo que esté a
 * `minDias` días o más del envío. Enviado el martes vence el domingo de esa semana;
 * enviado el miércoles, el domingo siguiente (spec §5).
 */
export function expiresOnSunday(fechaDeEnvio: Date | string, minDias: number = GIFT_MIN_DAYS): Date {
  return appEndOfDay(isoDeDia(domingoDesde(bogotaDay(fechaDeEnvio), minDias)))
}

export interface StageValidation {
  ok: boolean
  /** Fechas de visita simuladas × con y sin domicilio. */
  casos: number
  fallas: number
  /** Lo que falló, en palabras (hasta 5 ejemplos). */
  motivos: string[]
}

/** Primer día del año simulado (365 fechas de visita). Cualquier año sin 29-F sirve. */
const DIA_INICIAL_SIMULADO = Math.floor(Date.UTC(2026, 0, 1) / DIA_MS)
const FECHAS_SIMULADAS = 365

/**
 * Hora de Bogotá a la que corre el cron del recordatorio de premio (`vercel.json`:
 * `0 16 * * *` UTC = 11:00). El regalo vence a las 23:59:59 de su domingo.
 */
export const REWARD_REMINDER_CRON_HOUR = 11

/**
 * El día en que SALE de verdad el recordatorio de un regalo que vence el día `diaQueVence`
 * (fase 1B, 2026-10-13). `reward-reminder` toma lo que vence dentro de
 * `reward_reminder_days_before` días (2) DESDE la hora de la corrida, y el vencimiento es a
 * las 23:59:59: el viernes a las 11:00 el domingo a medianoche queda fuera del horizonte
 * (vence 61 h después), y la primera corrida que lo toma es la del SÁBADO. La simulación
 * suponía «2 días antes» (el viernes); con el día real los cuatro ritmos siguen pasando.
 */
export function diaDelRecordatorio(diaQueVence: number, diasAntes: number = DEFAULT_REWARD_REMINDER_DAYS_BEFORE): number {
  const vence = diaQueVence * DIA_MS + (24 * 60 * 60 - 1) * 1000
  for (let dia = diaQueVence - diasAntes - 1; dia <= diaQueVence; dia++) {
    const corrida = dia * DIA_MS + REWARD_REMINDER_CRON_HOUR * 60 * 60 * 1000
    if (vence > corrida && vence <= corrida + diasAntes * DIA_MS) return dia
  }
  return diaQueVence
}

/**
 * Valida unos días de ciclo SIMULANDO, no a mano (H1): 365 fechas de visita, con y sin
 * domicilio (con y sin `t3`), suponiendo que el cliente no vuelve. Cada caso exige:
 *   · `FREQUENCY_CAP_DAYS` (7) entre dos toques;
 *   · nunca más de `MONTHLY_MARKETING_CAP` (3) mensajes en un mes calendario
 *     (`getCustomersAtMonthlyCap()` cuenta así) ni en una ventana de 30 días,
 *     contando el recordatorio del rescate: el regalo fuerte vence el domingo
 *     (`expiresOnSunday()`, mínimo 5 días) y el aviso sale el día REAL en que lo toma el
 *     cron (`diaDelRecordatorio()`: el sábado). El regalo pequeño de `t2` NO lleva
 *     recordatorio (decisión 15, `reward_grants.skip_reminder`).
 * El recordatorio está exento del cap de 7 días (D5 de `reward-grants.md`).
 */
export function validateStageConfig(dias: readonly number[]): StageValidation {
  const motivos: string[] = []
  const estructura =
    dias.length === CYCLE_STAGES.length &&
    dias.every((d) => Number.isInteger(d) && d > 0) &&
    dias.every((d, i) => i === 0 || d > dias[i - 1])
  if (!estructura) {
    return { ok: false, casos: 0, fallas: 1, motivos: ['Hacen falta cinco días enteros, positivos y crecientes.'] }
  }

  let casos = 0
  let fallas = 0
  for (let i = 0; i < FECHAS_SIMULADAS; i++) {
    const visita = DIA_INICIAL_SIMULADO + i
    for (const conDomicilio of [true, false]) {
      casos++
      const toques = dias.filter((_, idx) => conDomicilio || CYCLE_STAGES[idx] !== 't3').map((d) => visita + d)
      const rescate = visita + dias[CYCLE_STAGES.indexOf('t4')]
      const recordatorio = diaDelRecordatorio(domingoDesde(rescate, GIFT_MIN_DAYS))
      const mensajes = [...toques, recordatorio].sort((a, b) => a - b)

      const motivo = fallaDelCaso(toques, mensajes)
      if (motivo) {
        fallas++
        if (motivos.length < 5) {
          motivos.push(`Visita el ${isoDeDia(visita)}${conDomicilio ? '' : ' (sin domicilio)'}: ${motivo}`)
        }
      }
    }
  }
  return { ok: fallas === 0, casos, fallas, motivos }
}

function fallaDelCaso(toques: number[], mensajes: number[]): string | null {
  for (let i = 1; i < toques.length; i++) {
    if (toques[i] - toques[i - 1] < FREQUENCY_CAP_DAYS) {
      return `dos toques a ${toques[i] - toques[i - 1]} días (mínimo ${FREQUENCY_CAP_DAYS})`
    }
  }
  const porMes = new Map<string, number>()
  for (const m of mensajes) {
    const mes = isoDeDia(m).slice(0, 7)
    porMes.set(mes, (porMes.get(mes) ?? 0) + 1)
  }
  for (const [mes, n] of porMes) {
    if (n > MONTHLY_MARKETING_CAP) return `${n} mensajes en ${mes} (máximo ${MONTHLY_MARKETING_CAP})`
  }
  for (const desde of mensajes) {
    const n = mensajes.filter((m) => m >= desde && m < desde + MONTHLY_WINDOW_DAYS).length
    if (n > MONTHLY_MARKETING_CAP) {
      return `${n} mensajes en los ${MONTHLY_WINDOW_DAYS} días desde el ${isoDeDia(desde)} (máximo ${MONTHLY_MARKETING_CAP})`
    }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// Escalera de regalos, saltos y grupo de control
// ═══════════════════════════════════════════════════════════════

/** Con ≥ 5 visitas el cliente ya conoce el programa: se salta «Le recordamos». */
export function shouldSkipT1(visitas: number): boolean {
  return visitas >= T1_SKIP_MIN_VISITS
}

/**
 * ¿Puede recibir el regalo FUERTE? Solo si el último fue hace `cooldownDias` (180) o más;
 * si no, el rescate lleva el pequeño (freno al «efecto Temu», spec §3.6).
 */
export function strongOfferAllowed(
  ultimaVez: Date | string | null | undefined,
  ahora: Date,
  cooldownDias: number = CYCLE_DEFAULTS.strongCooldownDays
): boolean {
  if (!ultimaVez) return true
  const antes = ultimaVez instanceof Date ? ultimaVez.getTime() : new Date(ultimaVez).getTime()
  if (Number.isNaN(antes)) return true
  return ahora.getTime() - antes >= cooldownDias * DIA_MS
}

/**
 * El regalo del toque trimestral: el primero pequeño, el segundo fuerte (el orden esquiva
 * el cooldown de 180 días, spec §3.5). Después de dos, ninguno: el cliente se archiva.
 */
export function heartbeatPrize(seq: number): 'small' | 'strong' | null {
  if (seq === 1) return 'small'
  if (seq === 2) return 'strong'
  return null
}

/** FNV-1a de 32 bits: estable, sin `crypto` (este módulo corre también en el navegador). */
function fnv1a(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * ¿Este toque cae en el grupo de control? Sorteo ESTABLE por cliente + etapa + ciclo: el
 * mismo toque siempre da lo mismo (el cron puede correr dos veces) y, como entra el ciclo,
 * no es siempre el mismo 10 % el que se queda sin rescate (H4).
 */
export function isHoldout(customerId: string, stage: string, cycleNo: number, pct: number): boolean {
  if (!(pct > 0)) return false
  if (pct >= 100) return true
  return fnv1a(`${customerId}|${stage}|${cycleNo}`) % 100 < pct
}

// ═══════════════════════════════════════════════════════════════
// Ajustes de la marca (`admin_settings`, claves en `src/lib/settings-keys.ts`)
// ═══════════════════════════════════════════════════════════════

export const SEND_SLOTS = { dinner: '16:30', lunch: '10:30' } as const
export type SendSlot = keyof typeof SEND_SLOTS

/** Con menos clientes, el 10 % de control es ruido: el default baja a 0 (decisión 11). */
export const HOLDOUT_MIN_CUSTOMERS = 200

export const CYCLE_DEFAULTS = {
  /** Apagado en todas las marcas: se enciende por marca, empezando por el piloto (H7). */
  enabled: false,
  rhythm: 'auto' as CycleRhythm | 'auto',
  /** Lo mismo que el default del trigger `on_campaign_message_sent` (00070). */
  fatigueTouches: 6,
  heartbeatEnabled: true,
  strongCooldownDays: 180,
  sendSlot: 'dinner' as SendSlot,
  holdoutPct: 10,
} as const

/** Las claves que lee `normalizeCycleSettings()`. Todas están en la lista cerrada del PUT. */
export const CYCLE_SETTING_KEYS = [
  'cycle_enabled',
  'cycle_rhythm',
  'cycle_small_reward_ids',
  'cycle_strong_reward_id',
  'cycle_fatigue_touches',
  'cycle_heartbeat_enabled',
  'cycle_strong_cooldown_days',
  'cycle_send_slot',
  'cycle_holdout_pct',
] as const

export interface CycleSettings {
  enabled: boolean
  rhythm: CycleRhythm | 'auto'
  smallRewardIds: string[]
  strongRewardId: string | null
  fatigueTouches: number
  heartbeatEnabled: boolean
  strongCooldownDays: number
  sendSlot: SendSlot
  holdoutPct: number
}

type Crudo = string | null | undefined

/** Entero positivo de hasta 4 cifras o el default: la MISMA regla que el trigger de fatiga. */
function enteroPositivo(valor: Crudo, porDefecto: number): number {
  const texto = valor?.trim() ?? ''
  return /^[0-9]{1,4}$/.test(texto) && Number(texto) > 0 ? Number(texto) : porDefecto
}

function listaDeIds(valor: Crudo): string[] {
  const texto = valor?.trim()
  if (!texto) return []
  let partes: unknown[] = texto.split(',')
  if (texto.startsWith('[')) {
    try {
      const json: unknown = JSON.parse(texto)
      partes = Array.isArray(json) ? json : []
    } catch {
      partes = []
    }
  }
  return partes.map((p) => String(p).trim()).filter(Boolean)
}

/**
 * Los ajustes del ciclo de una marca, con sus defaults. `admin_settings` es key-value de
 * texto que se edita a mano: un valor corrupto cae al default en vez de reventar el cron.
 * `aggressive_reward_id` es el respaldo del regalo fuerte (es el premio de la insistente
 * de hoy). El grupo de control nace en 0 en las marcas con menos de 200 clientes.
 */
export function normalizeCycleSettings(
  raw: Readonly<Record<string, Crudo>>,
  contexto: { totalClientes: number }
): CycleSettings {
  const rhythm = raw.cycle_rhythm?.trim()
  const slot = raw.cycle_send_slot?.trim()
  const holdoutCrudo = raw.cycle_holdout_pct?.trim()
  const holdoutExplicito = holdoutCrudo ? Number(holdoutCrudo) : NaN
  const holdoutPct =
    Number.isInteger(holdoutExplicito) && holdoutExplicito >= 0 && holdoutExplicito <= 100
      ? holdoutExplicito
      : contexto.totalClientes < HOLDOUT_MIN_CUSTOMERS
        ? 0
        : CYCLE_DEFAULTS.holdoutPct

  return {
    enabled: raw.cycle_enabled?.trim() === 'true',
    rhythm: isCycleRhythm(rhythm) ? rhythm : 'auto',
    smallRewardIds: listaDeIds(raw.cycle_small_reward_ids),
    strongRewardId: raw.cycle_strong_reward_id?.trim() || raw.aggressive_reward_id?.trim() || null,
    fatigueTouches: enteroPositivo(raw.cycle_fatigue_touches, CYCLE_DEFAULTS.fatigueTouches),
    heartbeatEnabled: raw.cycle_heartbeat_enabled?.trim() !== 'false',
    strongCooldownDays: enteroPositivo(raw.cycle_strong_cooldown_days, CYCLE_DEFAULTS.strongCooldownDays),
    sendSlot: slot === 'lunch' || slot === 'dinner' ? slot : CYCLE_DEFAULTS.sendSlot,
    holdoutPct,
  }
}
