/**
 * La alarma de silencio de domicilios (§24.3-B), con el umbral DERIVADO del historial
 * de cada marca.
 *
 * EL REQUISITO, TEXTUAL
 * ─────────────────────
 * *«llevás N días sin un solo pedido, cuando tu promedio es M»*. Y el umbral **nunca es
 * fijo**: un número fijo le sirve a Sushi Service (542 clientes, pedidos casi diarios) y
 * le miente a una barbería o a Café Frangal (8 clientes), donde tres días sin domicilio
 * es un martes normal. La misma decisión la tomó el tablero de salud del AIOS y por el
 * mismo motivo — ver `ESTADO.md` §5, «el umbral del silencio sale del historial de CADA
 * marca».
 *
 * CÓMO SE DERIVA
 * ──────────────
 * Sobre una ventana de 28 días (la misma que usa `aios_health()` en la 00053) se cuenta
 * en cuántos días DISTINTOS entró al menos un pedido. Eso da el ritmo propio de la marca:
 *
 *     ritmo = ventana / días_con_pedido        («entra un pedido cada ~ritmo días»)
 *
 * y de ahí salen los dos umbrales:
 *
 *     aviso  = ceil(ritmo) + 1
 *     alarma = ceil(ritmo × 2) + 1
 *
 * El `+1` es el que evita el falso positivo obvio: una marca que recibe pedidos todos los
 * días tiene ritmo 1, y sin él cualquier tarde tranquila ya sería un aviso.
 *
 * Qué da eso en los casos reales:
 *
 * | Marca                          | días con pedido / 28 | ritmo | aviso | alarma |
 * |--------------------------------|----------------------|-------|-------|--------|
 * | Pedidos a diario               | 28                   | 1,0   | 2 d   | 3 d    |
 * | Un par por semana              | 7                    | 4,0   | 5 d   | 9 d    |
 * | Dos veces en el mes            | 2                    | 14,0  | —     | —      |
 *
 * La última fila **no alarma nunca**, y es correcto: con dos días activos en 28 no hay
 * ritmo del que hablar. Por eso hace falta un mínimo de evidencia antes de afirmar nada.
 *
 * ESTA FUNCIÓN NO MANDA NADA
 * ──────────────────────────
 * Solo describe. Los mensajes y los correos son §24-A y viven en el AIOS. Acá se pinta
 * en pantalla y se acabó.
 *
 * PURA: sin red, sin base, sin `Date.now()`. El día de hoy entra por parámetro —ya
 * calculado en hora de Bogotá con `src/lib/timezone.ts`— justamente para que se pueda
 * probar entera y para que la zona del navegador no decida qué día es.
 */

/** La misma ventana que `aios_health()` (00053). Cambiarla acá no cambia la de allá. */
export const SILENCE_WINDOW_DAYS = 28

/**
 * Cuántos días DISTINTOS con pedido hacen falta antes de afirmar que existe un ritmo.
 *
 * Con menos que esto, `ventana / días_activos` es aritmética, no una línea base: un solo
 * pedido en 28 días daría «un pedido cada 28 días» y la alarma no se dispararía jamás,
 * pero afirmándolo con una seguridad que nadie tiene. Preferimos decir «todavía no sé».
 */
export const MIN_ACTIVE_DAYS_FOR_BASELINE = 3

/** Un día calendario de Bogotá y cuántos pedidos entraron en él. */
export interface DeliveryDayBucket {
  /** `YYYY-MM-DD` en hora de Bogotá. */
  date: string
  count: number
}

export type SilenceStatus =
  /** No hay historial suficiente para derivar un umbral. No se afirma nada. */
  | 'sin_historial'
  /** El silencio actual cabe dentro del ritmo normal de esta marca. */
  | 'al_dia'
  /** Se pasó del ritmo normal, pero todavía no del doble. */
  | 'aviso'
  /** Más del doble del ritmo normal sin un solo pedido. */
  | 'alarma'

export interface SilenceAssessment {
  status: SilenceStatus
  /** Ventana sobre la que se midió el ritmo. */
  windowDays: number
  /** En cuántos días distintos de la ventana entró al menos un pedido. */
  activeDays: number
  /** Cuántos pedidos entraron en total en la ventana. */
  totalDeliveries: number
  /** `YYYY-MM-DD` del último día con pedido, o `null` si no hubo ninguno. */
  lastDeliveryDate: string | null
  /** Días completos desde el último pedido. `0` = entró uno hoy. `null` = nunca hubo. */
  daysSilent: number | null
  /** El ritmo propio: un pedido cada ~N días. `null` sin línea base. */
  typicalGapDays: number | null
  /** A partir de cuántos días de silencio esto es un aviso. `null` sin línea base. */
  avisoAtDays: number | null
  /** A partir de cuántos días de silencio esto es una alarma. `null` sin línea base. */
  alarmaAtDays: number | null
  /** La frase que se pinta, ya armada. */
  message: string
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Días completos entre dos fechas `YYYY-MM-DD`, contadas como días CALENDARIO.
 *
 * `Date.UTC` y no `new Date(str)`: las dos fechas ya vienen en hora de Bogotá, así que lo
 * único que hace falta es restar días, y hacerlo en UTC evita que el huso del proceso —
 * que en Vercel es UTC y en la máquina de un admin es cualquiera— corra el resultado un
 * día. Devuelve `null` si alguna fecha no tiene la forma esperada.
 */
export function daysBetween(from: string, to: string): number | null {
  const a = DATE_RE.exec(from)
  const b = DATE_RE.exec(to)
  if (!a || !b) return null

  const ms =
    Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) -
    Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))

  return Math.round(ms / 86_400_000)
}

/** Redondea a un decimal para mostrar («un pedido cada 4,3 días»). */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** «casi todos los días» / «cada 4,3 días» — el ritmo dicho como lo diría una persona. */
function ritmoEnPalabras(gap: number): string {
  if (gap <= 1.05) return 'te entra al menos un pedido casi todos los días'
  if (gap < 2) return `te entra al menos un pedido cada día y medio, más o menos`
  return `te entra al menos un pedido cada ${round1(gap).toLocaleString('es-CO')} días, más o menos`
}

function diasEnPalabras(n: number): string {
  if (n === 0) return 'hoy mismo'
  if (n === 1) return '1 día'
  return `${n} días`
}

/**
 * Evalúa el silencio de domicilios de UNA marca contra su propio historial.
 *
 * `days` son los días calendario de Bogotá con al menos un pedido dentro de la ventana.
 * Los días sin pedido pueden venir con `count: 0` o simplemente no venir: da lo mismo,
 * solo cuentan los que tienen `count > 0`. Las fechas repetidas se cuentan una vez.
 */
export function assessDeliverySilence(params: {
  days: readonly DeliveryDayBucket[]
  /** Hoy, `YYYY-MM-DD`, EN HORA DE BOGOTÁ. */
  today: string
  windowDays?: number
}): SilenceAssessment {
  const windowDays = params.windowDays ?? SILENCE_WINDOW_DAYS

  const conPedidos = params.days.filter((d) => d.count > 0 && DATE_RE.test(d.date))
  const fechas = [...new Set(conPedidos.map((d) => d.date))].sort()
  const activeDays = fechas.length
  const totalDeliveries = conPedidos.reduce((sum, d) => sum + d.count, 0)
  const lastDeliveryDate = fechas.length > 0 ? fechas[fechas.length - 1] : null

  // Un `daysSilent` negativo significaría un pedido con fecha futura. No se corrige a
  // mano ni se esconde: se deja en 0 («entró hoy»), que es lo único honesto que se puede
  // decir sin inventar un reloj.
  const crudo = lastDeliveryDate === null ? null : daysBetween(lastDeliveryDate, params.today)
  const daysSilent = crudo === null ? null : Math.max(0, crudo)

  const base: Omit<SilenceAssessment, 'status' | 'message'> = {
    windowDays,
    activeDays,
    totalDeliveries,
    lastDeliveryDate,
    daysSilent,
    typicalGapDays: null,
    avisoAtDays: null,
    alarmaAtDays: null,
  }

  if (activeDays === 0) {
    return {
      ...base,
      status: 'sin_historial',
      message: `No entró ni un domicilio en los últimos ${windowDays} días, así que todavía no hay un ritmo propio con el que comparar. Si esperabas pedidos, mirá los que NO entraron acá abajo antes de dar por hecho que no pidió nadie.`,
    }
  }

  if (activeDays < MIN_ACTIVE_DAYS_FOR_BASELINE) {
    return {
      ...base,
      status: 'sin_historial',
      message: `Van ${totalDeliveries} domicilio(s) repartidos en ${activeDays} día(s) de los últimos ${windowDays}. Hace falta al menos ${MIN_ACTIVE_DAYS_FOR_BASELINE} días distintos con pedido para saber cuál es tu ritmo — hasta entonces esta alarma prefiere callarse a inventarte un promedio.`,
    }
  }

  const typicalGapDays = windowDays / activeDays
  const avisoAtDays = Math.ceil(typicalGapDays) + 1
  const alarmaAtDays = Math.ceil(typicalGapDays * 2) + 1

  const conUmbrales = { ...base, typicalGapDays, avisoAtDays, alarmaAtDays }
  const ritmo = ritmoEnPalabras(typicalGapDays)
  const silencio = daysSilent ?? 0

  if (silencio >= alarmaAtDays) {
    return {
      ...conUmbrales,
      status: 'alarma',
      message: `Llevás ${diasEnPalabras(silencio)} sin un solo domicilio, y normalmente ${ritmo}. Eso es más del doble de tu pausa habitual: vale la pena comprobar que los pedidos estén llegando.`,
    }
  }

  if (silencio >= avisoAtDays) {
    return {
      ...conUmbrales,
      status: 'aviso',
      message: `Llevás ${diasEnPalabras(silencio)} sin un domicilio, y normalmente ${ritmo}. Todavía no es raro del todo, pero se salió de tu ritmo.`,
    }
  }

  return {
    ...conUmbrales,
    status: 'al_dia',
    message:
      silencio === 0
        ? `Hoy ya entró al menos un domicilio. En los últimos ${windowDays} días ${ritmo}.`
        : `El último domicilio entró hace ${diasEnPalabras(silencio)}, dentro de lo normal para vos: ${ritmo}.`,
  }
}
