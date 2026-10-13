/**
 * Un cliente con la forma de supabase-js que habla con el Postgres EMBEBIDO de las pruebas
 * (2026-10-13, ciclo fase 1B).
 *
 * POR QUÉ EXISTE
 * ──────────────
 * Las pruebas de `tests/db/` hablaban `pg` directo y replicaban a mano los INSERT del
 * código; las de `tests/unit/` corrían el código de verdad contra un doble en memoria, que
 * no tiene CHECK, ni UNIQUE, ni triggers. El ciclo de recuperación vive justo en la junta de
 * las dos cosas: el cron decide en TypeScript y la base garantiza (un toque por etapa con el
 * UNIQUE, el toque que sigue a su item de la cola con un trigger, la fatiga, la atribución).
 * Con este cliente, el cron y el drenador REALES corren contra las migraciones reales.
 *
 * Se usa con:
 *   vi.mock('@supabase/supabase-js', async () => {
 *     const { clienteDePrueba } = await import('../setup/supabase-sobre-pg')
 *     return { createClient: () => clienteDePrueba() }
 *   })
 *
 * QUÉ IMITA (lo que usan los servicios del cron y del drenador)
 * ─────────────────────────────────────────────────────────────
 *   · `from(t).select(cols, { count, head })` con columnas, `*` y recursos embebidos
 *     muchos-a-uno (`campaigns!inner(type, source)`), y los filtros `eq neq gt gte lt lte
 *     like ilike is in not or match`, más `order range limit single maybeSingle`.
 *   · `insert`, `update`, `upsert({ onConflict, ignoreDuplicates })` y `delete`, con o sin
 *     `.select()` de vuelta.
 *   · `rpc(fn, args)`: escalares, `SETOF`/`TABLE` y `jsonb`, con los tipos de la función.
 *   · Los errores salen con el `code` de Postgres (23505, 23503, 42703…), como PostgREST.
 *   · Las filas salen por `json_agg` en una sesión en UTC: las fechas llegan con el mismo
 *     texto que manda PostgREST (`2026-10-13T20:00:00+00:00`).
 *
 * QUÉ NO ES: no es PostgREST. No hay RLS (habla como superusuario, igual que el service
 * role, que se la salta), ni `max-rows` de 1.000, ni embebidos uno-a-muchos. Lo que no sabe
 * hacer, LANZA con el nombre del método: una prueba que pasa por un método inventado no
 * prueba nada.
 */

import { Pool } from 'pg'
import { inject } from 'vitest'

type Fila = Record<string, unknown>
interface ErrorPg {
  code: string
  message: string
  details: string | null
  hint: string | null
}
interface Respuesta {
  data: unknown
  error: ErrorPg | null
  count: number | null
  status: number
  statusText: string
}

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const { connectionString } = inject('postgres')
    // UTC como Supabase: el texto de las fechas depende de la zona de la sesión.
    pool = new Pool({ connectionString, max: 10, options: '-c TimeZone=UTC' })
  }
  return pool
}

/** El cliente que devuelve `createClient()` en las pruebas. */
export function clienteDePrueba() {
  return {
    from: (tabla: string) => new Consulta(tabla),
    rpc: (fn: string, args: Record<string, unknown> = {}) => llamarFuncion(fn, args),
  }
}

export async function cerrarClienteDePrueba(): Promise<void> {
  await pool?.end()
  pool = null
}

function aError(e: unknown): ErrorPg {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string }
  return { code: err.code ?? 'XX000', message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null }
}

const ok = (data: unknown, count: number | null = null): Respuesta => ({ data, error: null, count, status: 200, statusText: 'OK' })
const mal = (error: ErrorPg): Respuesta => ({ data: null, error, count: null, status: 400, statusText: 'Bad Request' })

const IDENT = /^[a-z_][a-z0-9_]*$/
function ident(nombre: string): string {
  if (!IDENT.test(nombre)) throw new Error(`[supabase-sobre-pg] identificador no soportado: «${nombre}»`)
  return `"${nombre}"`
}

// ═══════════════════════════════════════════════════════════════
// El catálogo: claves foráneas y firmas de funciones
// ═══════════════════════════════════════════════════════════════

const fks = new Map<string, { columna: string; referida: string }>()

/** La FK de `base` hacia `relacion` (muchos-a-uno), como la resuelve PostgREST. */
async function claveForanea(base: string, relacion: string): Promise<{ columna: string; referida: string }> {
  const k = `${base}->${relacion}`
  const cache = fks.get(k)
  if (cache) return cache
  const { rows } = await getPool().query<{ columna: string; referida: string }>(
    `SELECT a.attname AS columna, ar.attname AS referida
       FROM pg_constraint c
       JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = c.conkey[1]
       JOIN pg_attribute ar ON ar.attrelid = c.confrelid AND ar.attnum = c.confkey[1]
      WHERE c.contype = 'f'
        AND c.conrelid = $1::regclass AND c.confrelid = $2::regclass
        AND array_length(c.conkey, 1) = 1
      ORDER BY c.conname
      LIMIT 1`,
    [`public.${base}`, `public.${relacion}`]
  )
  if (!rows[0]) throw new Error(`[supabase-sobre-pg] no hay FK simple de ${base} a ${relacion}`)
  fks.set(k, rows[0])
  return rows[0]
}

interface Firma {
  argumentos: Array<{ nombre: string; tipo: string }>
  devuelveConjunto: boolean
  devuelveVoid: boolean
}
const firmas = new Map<string, Firma>()

async function firma(fn: string): Promise<Firma> {
  const cache = firmas.get(fn)
  if (cache) return cache
  const { rows } = await getPool().query<{ nombres: string[] | null; tipos: string[]; retset: boolean; rettype: string }>(
    `SELECT p.proargnames AS nombres,
            ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes::oid[]) AS t) AS tipos,
            p.proretset AS retset,
            format_type(p.prorettype, NULL) AS rettype
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1`,
    [fn]
  )
  if (rows.length !== 1) throw new Error(`[supabase-sobre-pg] la función ${fn} tiene ${rows.length} firmas`)
  const r = rows[0]
  const f: Firma = {
    argumentos: r.tipos.map((tipo, i) => ({ nombre: r.nombres?.[i] ?? `$${i + 1}`, tipo })),
    devuelveConjunto: r.retset,
    devuelveVoid: r.rettype === 'void',
  }
  firmas.set(fn, f)
  return f
}

async function llamarFuncion(fn: string, args: Record<string, unknown>): Promise<Respuesta> {
  try {
    const f = await firma(fn)
    const valores: unknown[] = []
    const partes: string[] = []
    for (const [nombre, valor] of Object.entries(args)) {
      const arg = f.argumentos.find((a) => a.nombre === nombre)
      if (!arg) throw new Error(`[supabase-sobre-pg] ${fn} no tiene el argumento ${nombre}`)
      const esJson = arg.tipo === 'json' || arg.tipo === 'jsonb'
      valores.push(esJson && valor !== null ? JSON.stringify(valor) : valor)
      partes.push(`${ident(nombre)} => $${valores.length}::${arg.tipo}`)
    }
    const llamada = `${ident(fn)}(${partes.join(', ')})`
    const sql = f.devuelveConjunto
      ? `SELECT coalesce(json_agg(r), '[]'::json) AS data FROM ${llamada} AS r`
      : f.devuelveVoid
        ? `SELECT ${llamada}, NULL::json AS data`
        : `SELECT to_json(${llamada}) AS data`
    const { rows } = await getPool().query<{ data: unknown }>(sql, valores)
    return ok(rows[0]?.data ?? null)
  } catch (e) {
    return mal(aError(e))
  }
}

// ═══════════════════════════════════════════════════════════════
// Las columnas del select: `a, b, rel!inner(c, d)`
// ═══════════════════════════════════════════════════════════════

interface Embebido {
  relacion: string
  inner: boolean
  columnas: string[]
}
interface Seleccion {
  base: string[] // '*' o nombres
  embebidos: Embebido[]
}

function partirPorComas(texto: string): string[] {
  const partes: string[] = []
  let nivel = 0
  let actual = ''
  for (const ch of texto) {
    if (ch === '(') nivel++
    if (ch === ')') nivel--
    if (ch === ',' && nivel === 0) {
      partes.push(actual.trim())
      actual = ''
    } else actual += ch
  }
  if (actual.trim()) partes.push(actual.trim())
  return partes
}

function leerSeleccion(texto: string): Seleccion {
  const sel: Seleccion = { base: [], embebidos: [] }
  for (const parte of partirPorComas(texto.replace(/\s+/g, ' ').trim() || '*')) {
    const m = /^([a-z_][a-z0-9_]*)(!inner)?\s*\((.*)\)$/.exec(parte)
    if (m) {
      sel.embebidos.push({ relacion: m[1], inner: !!m[2], columnas: partirPorComas(m[3]) })
    } else if (parte === '*' || IDENT.test(parte)) {
      sel.base.push(parte)
    } else {
      throw new Error(`[supabase-sobre-pg] columna no soportada en select: «${parte}»`)
    }
  }
  if (sel.base.length === 0 && sel.embebidos.length === 0) sel.base.push('*')
  return sel
}

// ═══════════════════════════════════════════════════════════════
// Filtros
// ═══════════════════════════════════════════════════════════════

interface Filtro {
  col: string
  op: string
  valor: unknown
  negado?: boolean
}

/** `(a,b,"c d")` → ['a','b','c d'] (la sintaxis de PostgREST para `in`). */
function listaPostgrest(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  const t = String(v).trim().replace(/^\(/, '').replace(/\)$/, '')
  return t === '' ? [] : t.split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1'))
}

class Construccion {
  valores: unknown[] = []
  p(v: unknown): string {
    this.valores.push(v)
    return `$${this.valores.length}`
  }
}

function condicion(alias: string, f: Filtro, c: Construccion): string {
  const col = `${alias}.${ident(f.col)}`
  let sql: string
  switch (f.op) {
    case 'eq': sql = `${col} = ${c.p(f.valor)}`; break
    case 'neq': sql = `${col} <> ${c.p(f.valor)}`; break
    case 'gt': sql = `${col} > ${c.p(f.valor)}`; break
    case 'gte': sql = `${col} >= ${c.p(f.valor)}`; break
    case 'lt': sql = `${col} < ${c.p(f.valor)}`; break
    case 'lte': sql = `${col} <= ${c.p(f.valor)}`; break
    case 'like': sql = `${col} LIKE ${c.p(f.valor)}`; break
    case 'ilike': sql = `${col} ILIKE ${c.p(f.valor)}`; break
    case 'in': sql = `${col} = ANY(${c.p(listaPostgrest(f.valor))})`; break
    case 'is': {
      const v = f.valor === null || f.valor === 'null' ? 'NULL' : f.valor === true || f.valor === 'true' ? 'TRUE' : f.valor === false || f.valor === 'false' ? 'FALSE' : null
      if (!v) throw new Error(`[supabase-sobre-pg] is(${f.col}, ${String(f.valor)}) no soportado`)
      sql = `${col} IS ${v}`
      break
    }
    default:
      throw new Error(`[supabase-sobre-pg] operador no soportado: ${f.op}`)
  }
  return f.negado ? `NOT (${sql})` : sql
}

/** `a.is.null,b.lt.2026-10-13T00:00:00Z` → condiciones unidas por OR. */
function leerOr(texto: string): Filtro[] {
  return partirPorComas(texto).map((parte) => {
    const m = /^([a-z_][a-z0-9_]*)\.(not\.)?([a-z]+)\.(.*)$/.exec(parte)
    if (!m) throw new Error(`[supabase-sobre-pg] or() no soportado: «${parte}»`)
    const valor = m[3] === 'in' ? listaPostgrest(m[4]) : m[4]
    return { col: m[1], op: m[3], valor, negado: !!m[2] }
  })
}

// ═══════════════════════════════════════════════════════════════
// La consulta
// ═══════════════════════════════════════════════════════════════

class Consulta implements PromiseLike<Respuesta> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private columnas = '*'
  private devolver = false
  private conteo = false
  private soloCabeza = false
  private payload: Fila | Fila[] | null = null
  private onConflict: string[] = []
  private ignorarDuplicados = false
  private filtros: Filtro[] = []
  private ors: Filtro[][] = []
  private orden: Array<{ col: string; asc: boolean; nullsFirst?: boolean }> = []
  private limite: number | null = null
  private desde = 0
  private modo: 'lista' | 'single' | 'maybeSingle' = 'lista'

  constructor(private readonly tabla: string) {
    ident(tabla)
  }

  select(columnas = '*', opciones: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean } = {}) {
    if (this.op === 'select') {
      this.columnas = columnas
      this.conteo = !!opciones.count
      this.soloCabeza = !!opciones.head
    } else {
      this.devolver = true
      this.columnas = columnas
    }
    return this
  }
  insert(p: Fila | Fila[]) { this.op = 'insert'; this.payload = p; return this }
  update(p: Fila) { this.op = 'update'; this.payload = p; return this }
  upsert(p: Fila | Fila[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert'
    this.payload = p
    this.onConflict = (o.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    this.ignorarDuplicados = !!o.ignoreDuplicates
    return this
  }
  delete() { this.op = 'delete'; return this }

  eq(col: string, v: unknown) { return this.f(col, 'eq', v) }
  neq(col: string, v: unknown) { return this.f(col, 'neq', v) }
  gt(col: string, v: unknown) { return this.f(col, 'gt', v) }
  gte(col: string, v: unknown) { return this.f(col, 'gte', v) }
  lt(col: string, v: unknown) { return this.f(col, 'lt', v) }
  lte(col: string, v: unknown) { return this.f(col, 'lte', v) }
  like(col: string, v: unknown) { return this.f(col, 'like', v) }
  ilike(col: string, v: unknown) { return this.f(col, 'ilike', v) }
  is(col: string, v: unknown) { return this.f(col, 'is', v) }
  in(col: string, vs: unknown[]) { return this.f(col, 'in', vs) }
  not(col: string, op: string, v: unknown) {
    this.filtros.push({ col, op, valor: v, negado: true })
    return this
  }
  match(obj: Fila) {
    for (const [k, v] of Object.entries(obj)) this.f(k, 'eq', v)
    return this
  }
  or(texto: string) { this.ors.push(leerOr(texto)); return this }
  order(col: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orden.push({ col, asc: o.ascending !== false, nullsFirst: o.nullsFirst })
    return this
  }
  limit(n: number) { this.limite = n; return this }
  range(desde: number, hasta: number) { this.desde = desde; this.limite = hasta - desde + 1; return this }
  single() { this.modo = 'single'; return this }
  maybeSingle() { this.modo = 'maybeSingle'; return this }

  private f(col: string, op: string, valor: unknown) {
    this.filtros.push({ col, op, valor })
    return this
  }

  then<A = Respuesta, B = never>(ok?: ((v: Respuesta) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.ejecutar().then(ok, ko)
  }

  private async ejecutar(): Promise<Respuesta> {
    try {
      const c = new Construccion()
      const t = ident(this.tabla)
      if (this.op === 'select') return await this.leer(c, t)
      if (this.op === 'delete') {
        const where = await this.where(c, 't')
        return await this.devolverFilas(c, `DELETE FROM ${t} AS t ${where} RETURNING t.*`)
      }
      if (this.op === 'update') {
        const payload = this.payload as Fila
        const cols = Object.keys(payload)
        if (cols.length === 0) throw new Error('[supabase-sobre-pg] update sin columnas')
        const asignaciones = cols.map((k) => `${ident(k)} = _p.${ident(k)}`).join(', ')
        const json = c.p(JSON.stringify(payload))
        const where = await this.where(c, 't')
        return await this.devolverFilas(
          c,
          `UPDATE ${t} AS t SET ${asignaciones} FROM json_populate_record(null::${t}, ${json}::json) AS _p ${where} RETURNING t.*`
        )
      }
      // insert / upsert
      const filas = Array.isArray(this.payload) ? this.payload : [this.payload as Fila]
      if (filas.length === 0) return ok(this.devolver ? [] : null)
      const cols = [...new Set(filas.flatMap((f) => Object.keys(f)))]
      const lista = cols.map(ident).join(', ')
      const json = c.p(JSON.stringify(filas))
      let conflicto = ''
      if (this.op === 'upsert') {
        const destino = this.onConflict.length > 0 ? `(${this.onConflict.map(ident).join(', ')})` : ''
        const actualizar = cols.filter((k) => !this.onConflict.includes(k))
        conflicto =
          this.ignorarDuplicados || actualizar.length === 0
            ? `ON CONFLICT ${destino} DO NOTHING`
            : `ON CONFLICT ${destino} DO UPDATE SET ${actualizar.map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`).join(', ')}`
      }
      return await this.devolverFilas(
        c,
        `INSERT INTO ${t} (${lista}) SELECT ${lista} FROM json_populate_recordset(null::${t}, ${json}::json) ${conflicto} RETURNING *`
      )
    } catch (e) {
      return mal(aError(e))
    }
  }

  /** Lo escrito, de vuelta con las columnas del `.select()` (o nada, sin él). */
  private async devolverFilas(c: Construccion, dml: string): Promise<Respuesta> {
    if (!this.devolver) {
      await getPool().query(dml, c.valores)
      return ok(null)
    }
    const sel = leerSeleccion(this.columnas)
    if (sel.embebidos.length > 0) throw new Error('[supabase-sobre-pg] embebidos en el RETURNING no soportados')
    const cols = sel.base.includes('*') ? 'w.*' : sel.base.map((k) => `w.${ident(k)}`).join(', ')
    const { rows } = await getPool().query<{ data: Fila[] }>(
      `WITH w AS (${dml}) SELECT coalesce(json_agg(r), '[]'::json) AS data FROM (SELECT ${cols} FROM w) AS r`,
      c.valores
    )
    return this.forma(rows[0].data)
  }

  private async where(c: Construccion, alias: string, embebidos: Embebido[] = []): Promise<string> {
    const conds: string[] = []
    const porRelacion = new Map<string, Filtro[]>()
    for (const f of this.filtros) {
      const punto = f.col.indexOf('.')
      if (punto > 0) {
        const rel = f.col.slice(0, punto)
        porRelacion.set(rel, [...(porRelacion.get(rel) ?? []), { ...f, col: f.col.slice(punto + 1) }])
      } else conds.push(condicion(alias, f, c))
    }
    for (const grupo of this.ors) conds.push(`(${grupo.map((f) => condicion(alias, f, c)).join(' OR ')})`)
    // Un `!inner` filtra la fila base: solo quedan las que tienen su relacionada (y la
    // relacionada cumple sus filtros), como PostgREST.
    const rels = new Set([...embebidos.filter((e) => e.inner).map((e) => e.relacion), ...porRelacion.keys()])
    for (const rel of rels) {
      const fk = await claveForanea(this.tabla, rel)
      const extra = (porRelacion.get(rel) ?? []).map((f) => condicion('e', f, c))
      conds.push(
        `EXISTS (SELECT 1 FROM ${ident(rel)} AS e WHERE e.${ident(fk.referida)} = ${alias}.${ident(fk.columna)}${extra.map((x) => ` AND ${x}`).join('')})`
      )
    }
    return conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
  }

  private async leer(c: Construccion, t: string): Promise<Respuesta> {
    const sel = leerSeleccion(this.columnas)
    const where = await this.where(c, 't', sel.embebidos)

    if (this.soloCabeza) {
      const { rows } = await getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} AS t ${where}`, c.valores)
      return ok(null, rows[0].n)
    }

    const cols: string[] = sel.base.map((k) => (k === '*' ? 't.*' : `t.${ident(k)}`))
    for (const e of sel.embebidos) {
      const fk = await claveForanea(this.tabla, e.relacion)
      const obj = e.columnas.includes('*')
        ? 'to_json(e)'
        : `json_build_object(${e.columnas.map((k) => `'${ident(k).slice(1, -1)}', e.${ident(k)}`).join(', ')})`
      cols.push(`(SELECT ${obj} FROM ${ident(e.relacion)} AS e WHERE e.${ident(fk.referida)} = t.${ident(fk.columna)}) AS ${ident(e.relacion)}`)
    }
    const orden =
      this.orden.length > 0
        ? `ORDER BY ${this.orden
            .map((o) => `t.${ident(o.col)} ${o.asc ? 'ASC' : 'DESC'}${o.nullsFirst === undefined ? '' : o.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST'}`)
            .join(', ')}`
        : ''
    const limite = this.limite !== null ? `LIMIT ${Number(this.limite)}` : ''
    const desde = this.desde > 0 ? `OFFSET ${Number(this.desde)}` : ''
    const sql = `SELECT coalesce(json_agg(r), '[]'::json) AS data FROM (SELECT ${cols.join(', ')} FROM ${t} AS t ${where} ${orden} ${limite} ${desde}) AS r`
    const { rows } = await getPool().query<{ data: Fila[] }>(sql, c.valores)
    let count: number | null = null
    if (this.conteo) {
      const { rows: n } = await getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} AS t ${where}`, c.valores)
      count = n[0].n
    }
    const r = this.forma(rows[0].data)
    return { ...r, count }
  }

  private forma(filas: Fila[]): Respuesta {
    if (this.modo === 'lista') return ok(filas)
    if (filas.length > 1) return mal({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${filas.length} rows`, hint: null })
    if (filas.length === 0) {
      return this.modo === 'maybeSingle'
        ? ok(null)
        : mal({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: '0 rows', hint: null })
    }
    return ok(filas[0])
  }
}
