/**
 * Doble de Supabase en memoria para probar servicios que leen y escriben de verdad
 * (2026-10-11, plantillas: un solo libro).
 *
 * Cubre lo que usan `template.service.ts` y `twilio-catalog.service.ts`: `select` con
 * `eq`/`neq`/`in`/`order`, `insert` (con o sin `.select().single()`), `update`, `upsert`
 * con `onConflict`, `single` y `maybeSingle`. Y — lo que importa — los índices ÚNICOS de
 * `template_versions` (00039) y la clave de `admin_settings`: un INSERT que los rompe
 * contesta `23505` como Postgres, en vez de dejar pasar una fila que la base rechazaría.
 *
 * No es Postgres: no hay tipos, ni CHECK, ni RLS. Lo que dependa de eso va en `tests/db`.
 */

export type Fila = Record<string, unknown>

interface Unico {
  cols: string[]
  /** Índice parcial: solo cuentan las filas que cumplen esto. */
  where?: (f: Fila) => boolean
}

const UNICOS: Record<string, Unico[]> = {
  template_versions: [
    { cols: ['tenant_id', 'provider_ref', 'language'] },
    { cols: ['tenant_id', 'settings_key'], where: (f) => f.is_current === true },
    { cols: ['tenant_id', 'settings_key'], where: (f) => f.status === 'pending' },
  ],
  admin_settings: [{ cols: ['key', 'tenant_id'] }],
}

const DEFAULTS: Record<string, () => Fila> = {
  template_versions: () => ({
    provider_template_id: null,
    status: 'pending',
    rejection_reason: null,
    is_current: false,
    edited_by: null,
    edited_by_email: null,
    disclaimer_accepted_at: null,
    submitted_at: null,
    resolved_at: null,
    retired_at: null,
  }),
}

type Resultado = { data: unknown; error: { code: string; message: string } | null }

export interface BaseEnMemoria {
  tablas: Record<string, Fila[]>
  /** Lo que se pasa como cliente de `@supabase/supabase-js`. */
  cliente: { from: (tabla: string) => unknown }
  /** Cada escritura, en orden: para afirmar qué NO se escribió. */
  escrituras: Array<{ tabla: string; op: string; payload: unknown }>
}

export function crearBaseEnMemoria(inicial: Record<string, Fila[]> = {}): BaseEnMemoria {
  const tablas: Record<string, Fila[]> = {}
  for (const [k, filas] of Object.entries(inicial)) tablas[k] = filas.map((f) => ({ ...f }))
  const escrituras: BaseEnMemoria['escrituras'] = []
  let seq = 0

  const tabla = (nombre: string) => (tablas[nombre] ??= [])

  function violaUnico(nombre: string, filas: Fila[]): boolean {
    for (const u of UNICOS[nombre] ?? []) {
      const vistas = new Set<string>()
      for (const f of filas) {
        if (u.where && !u.where(f)) continue
        const clave = JSON.stringify(u.cols.map((c) => f[c] ?? null))
        if (vistas.has(clave)) return true
        vistas.add(clave)
      }
    }
    return false
  }

  const duplicado: Resultado = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }

  function from(nombre: string) {
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
    let payload: Fila | Fila[] | null = null
    let onConflict: string[] = []
    let devolverFilas = false
    let modo: 'lista' | 'single' | 'maybeSingle' = 'lista'
    let orden: { col: string; asc: boolean } | null = null
    const filtros: Array<(f: Fila) => boolean> = []

    function ejecutar(): Resultado {
      const filas = tabla(nombre)

      if (op === 'select') {
        let r = filas.filter((f) => filtros.every((p) => p(f))).map((f) => ({ ...f }))
        if (orden) {
          const { col, asc } = orden
          r = r.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
        }
        return unaOLista(r)
      }

      if (op === 'insert' || op === 'upsert') {
        const originales = Array.isArray(payload) ? payload : [payload as Fila]
        const nuevas = originales.map((p): Fila => {
          seq++
          return {
            ...(DEFAULTS[nombre]?.() ?? {}),
            id: `fila-${seq}`,
            created_at: new Date(Date.UTC(2026, 9, 11, 0, 0, seq)).toISOString(),
            ...p,
          }
        })
        if (op === 'upsert' && onConflict.length > 0) {
          const resultado = filas.map((f) => ({ ...f }))
          nuevas.forEach((n, k) => {
            const i = resultado.findIndex((f) => onConflict.every((c) => f[c] === n[c]))
            if (i >= 0) resultado[i] = { ...resultado[i], ...originales[k] }
            else resultado.push(n)
          })
          if (violaUnico(nombre, resultado)) return duplicado
          tablas[nombre] = resultado
        } else {
          if (violaUnico(nombre, [...filas, ...nuevas])) return duplicado
          filas.push(...nuevas)
        }
        escrituras.push({ tabla: nombre, op, payload })
        return devolverFilas ? unaOLista(nuevas.map((f) => ({ ...f }))) : { data: null, error: null }
      }

      if (op === 'update') {
        const resultado = filas.map((f) => (filtros.every((p) => p(f)) ? { ...f, ...(payload as Fila) } : f))
        if (violaUnico(nombre, resultado)) return duplicado
        const tocadas = resultado.filter((f, i) => f !== filas[i])
        tablas[nombre] = resultado
        escrituras.push({ tabla: nombre, op, payload })
        return devolverFilas ? unaOLista(tocadas.map((f) => ({ ...f }))) : { data: null, error: null }
      }

      // delete
      const quedan = filas.filter((f) => !filtros.every((p) => p(f)))
      tablas[nombre] = quedan
      escrituras.push({ tabla: nombre, op, payload: null })
      return { data: null, error: null }
    }

    function unaOLista(r: Fila[]): Resultado {
      if (modo === 'lista') return { data: r, error: null }
      if (r.length > 1) return { data: null, error: { code: 'PGRST116', message: 'más de una fila' } }
      if (r.length === 0) {
        return modo === 'maybeSingle'
          ? { data: null, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'ninguna fila' } }
      }
      return { data: r[0], error: null }
    }

    const b: Record<string, unknown> = {
      select: () => {
        if (op !== 'select') devolverFilas = true
        return b
      },
      eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), b),
      neq: (c: string, v: unknown) => (filtros.push((f) => f[c] !== v), b),
      in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), b),
      order: (col: string, o?: { ascending?: boolean }) => ((orden = { col, asc: o?.ascending !== false }), b),
      limit: () => b,
      insert: (p: Fila | Fila[]) => ((op = 'insert'), (payload = p), b),
      update: (p: Fila) => ((op = 'update'), (payload = p), b),
      upsert: (p: Fila | Fila[], o?: { onConflict?: string }) => {
        op = 'upsert'
        payload = p
        onConflict = (o?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        return b
      },
      delete: () => ((op = 'delete'), b),
      single: () => ((modo = 'single'), b),
      maybeSingle: () => ((modo = 'maybeSingle'), b),
      then: (ok: (v: Resultado) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, ko),
    }
    return b
  }

  return { tablas, cliente: { from }, escrituras }
}
