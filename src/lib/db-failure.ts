/**
 * El fallo de base de datos que NO se puede confundir con "no hay nada".
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * `supabase-js` **no lanza excepciones**: devuelve `{ data, error }`. Quien escribe
 *
 *     const { data: x } = await supabase.from('staff_users')…
 *     if (!x) return no_autorizado()
 *
 * acaba de hacer que un timeout del pooler, una policy de RLS o una columna que no
 * existe (`42703`) produzcan **exactamente el mismo `null`** que "no lo encontré". El
 * código sigue por la rama del caso feliz-vacío: sin log, sin alerta y sin fallar.
 *
 * El precedente que fija el criterio es la Fase 2 de §25: la lectura de
 * `authorized_numbers` en `/api/webhook/twilio-incoming` mira el `error` ANTES que el
 * `data`, lo registra con contexto y le contesta al operador algo visible. Antes de eso,
 * un pedido de domicilio se perdía en silencio si la base tosía.
 *
 * REGLA (§24 de `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`)
 * ─────────────────────────────────────────────────────────────────
 * Si hay `error`, **se registra con contexto y se falla de forma visible** (o se propaga).
 * Perder algo en silencio es peor que fallar ruidosamente.
 *
 * Lo que este helper NO dice: que todo `null` sea un fallo. En muchísimos sitios `null`
 * significa legítimamente "no existe" y esa rama es correcta. Lo que hay que arreglar es
 * que **el error no se distinga del vacío**, no el manejo del vacío.
 *
 * Ref: `docs/03-security.md` § "Fallos silenciosos de base de datos"
 */

/**
 * La forma mínima de un error de PostgREST. Se declara aquí en vez de importar
 * `PostgrestError` para que el helper también acepte el error de un `.rpc()` o de
 * `supabase.auth`, que no comparten el mismo tipo nominal pero sí estos campos.
 */
export interface DbErrorLike {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

export interface LogDbFailureArgs {
  /** Quién falló, en el estilo que ya usa el repo: `CheckIn`, `StaffAuth`, `Settings`… */
  scope: string
  /** Qué se intentaba hacer, en snake_case. Es la clave por la que se busca en los logs. */
  reason: string
  /** El `error` tal cual lo devolvió supabase-js. */
  error: DbErrorLike | null
  /** Contexto que hace el log accionable: tenant, id consultado, tabla… */
  context?: Record<string, string | number | boolean | null | undefined>
}

/**
 * Registra un fallo de base de datos con contexto suficiente para actuar.
 *
 * Formato (espejo del `[Delivery][FALLO]` de `delivery.service.ts`):
 *
 *     [CheckIn][FALLO] reason=staff_lookup_error code=42703 detalle="column … does not exist" tenant=sushi-service staff_id=…
 *
 * `code` es lo que casi siempre resuelve el incidente: `42703` es una columna que no
 * existe (migración sin aplicar), `42501` es RLS, `57014` es un timeout de statement y
 * `PGRST116` es "cero filas" de un `.single()` — este último **no** es un fallo real y
 * por eso los llamadores lo filtran antes de llegar aquí.
 */
export function logDbFailure({ scope, reason, error, context }: LogDbFailureArgs): void {
  const extra = Object.entries(context ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')

  console.error(
    `[${scope}][FALLO] reason=${reason}` +
      (error?.code ? ` code=${error.code}` : '') +
      ` detalle="${error?.message ?? 'sin mensaje'}"` +
      (extra ? ` ${extra}` : '')
  )
}

/**
 * `PGRST116` = "el `.single()` esperaba exactamente una fila y encontró cero".
 *
 * NO es un fallo de base de datos: es la forma que tiene PostgREST de decir "no existe".
 * Confundirlo con un fallo real haría lo contrario de lo que busca este archivo —
 * convertiría el vacío legítimo en un 503 y rompería todos los `if (!x)` correctos.
 *
 * Por eso: `.single()` + este filtro, o mejor `.maybeSingle()`, que devuelve
 * `{ data: null, error: null }` para cero filas y deja el `error` limpio para lo que de
 * verdad es un fallo.
 */
export function isNoRows(error: DbErrorLike | null): boolean {
  return error?.code === 'PGRST116'
}

/**
 * ¿Este `error` es un fallo REAL de base de datos (y no un "cero filas" de `.single()`)?
 *
 * Es el guardia que va antes de cada rama de "no existe":
 *
 *     const { data, error } = await supabase.from('x').select().eq(…).single()
 *     if (isDbFailure(error)) { … falla visible … }
 *     if (!data) { … no existe: la rama de siempre, que sigue siendo correcta … }
 */
export function isDbFailure(error: DbErrorLike | null): error is DbErrorLike {
  return !!error && !isNoRows(error)
}
