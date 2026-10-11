/**
 * OPER-4 — `PUT /api/dashboard/settings` solo acepta una LISTA CERRADA de claves (2026-10-11).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * La ola 0 cerró QUIÉN escribe los ajustes (alcance de marca, `settings-permisos.test.ts`).
 * Faltaba QUÉ: el PUT aceptaba cualquier clave, y en una marca Zernio un puntero de
 * plantilla (`*_template_sid`) se pisaba sin pasar por `promoteVersion()`, su único
 * escritor (`CLAUDE.md`).
 *
 * Lo que se fija:
 *   1. Cada clave que de verdad mandan las pantallas se acepta. La lista NO se copia acá:
 *      se LEE del código de las pantallas, así que una pantalla nueva que escriba una clave
 *      que `src/lib/settings-keys.ts` no conoce rompe este test, no a un cliente.
 *   2. Una clave inventada da 400 y no escribe.
 *   3. En una marca Zernio, CAMBIAR un puntero da 400 con el porqué; guardarlo con el mismo
 *      valor (Ajustes guarda los 15 juntos) da 200 sin escribir; un ajuste común se guarda.
 *   4. En una marca Twilio, los punteros se guardan (el dueño los elige en Ajustes).
 *
 * Se prueba la RUTA, con el doble de sesión y de base de `settings-permisos.test.ts`.
 *
 * Código: `src/app/api/dashboard/settings/route.ts` · `src/lib/settings-keys.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATE_CATALOG } from '@/constants/template-catalog'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'

// ═══════════════════════════════════════════════════════════════
// Dobles: un super usuario de la marca; la base contesta lo que diga cada prueba
// ═══════════════════════════════════════════════════════════════

let proveedor: 'twilio' | 'zernio' = 'twilio'
/** Lo que hoy guarda `admin_settings` (clave → valor). */
let guardado: Record<string, string> = {}
let escrituras: Array<{ op: string; fila: Record<string, unknown> }> = []

vi.mock('@/lib/alcance-de-marca', () => ({
  exigirAlcanceDeMarca: async () => ({ ok: true, tenantId: TENANT }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

function builder(tabla: string): unknown {
  let op = 'select'
  let fila: Record<string, unknown> = {}
  let clave: string | null = null
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, x: unknown) => {
      if (c === 'key') clave = String(x)
      return b
    },
    maybeSingle: () => b,
    update: (f: Record<string, unknown>) => ((op = 'update'), (fila = f), b),
    insert: (f: Record<string, unknown>) => ((op = 'insert'), (fila = f), b),
    then: (ok: (v: unknown) => unknown) => {
      if (op !== 'select') {
        escrituras.push({ op, fila: { ...fila, key: fila.key ?? clave } })
        return Promise.resolve({ data: null, error: null }).then(ok)
      }
      if (tabla === 'tenants') return Promise.resolve({ data: { messaging_provider: proveedor }, error: null }).then(ok)
      const data = clave !== null && clave in guardado ? { key: clave, value: guardado[clave] } : null
      return Promise.resolve({ data, error: null }).then(ok)
    },
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => builder(tabla) }),
}))

async function guardar(key: string, value: string) {
  const { PUT } = await import('@/app/api/dashboard/settings/route')
  const req = new Request('https://marca.constelarys.com/api/dashboard/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
    headers: { 'content-type': 'application/json' },
  })
  return PUT(req as never)
}

beforeEach(() => {
  proveedor = 'twilio'
  guardado = {}
  escrituras = []
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://doble.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'doble')
})

// ═══════════════════════════════════════════════════════════════
// Las claves que mandan las pantallas, leídas de su código
// ═══════════════════════════════════════════════════════════════

const RAIZ = path.resolve(import.meta.dirname, '../..')

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return archivos(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

/** Toda clave que una pantalla manda por PUT a `/api/dashboard/settings`. */
function clavesDeLasPantallas(): string[] {
  const claves = new Set<string>()
  const fuentes = [...archivos(path.join(RAIZ, 'src/app/(dashboard)')), ...archivos(path.join(RAIZ, 'src/components'))]
  for (const f of fuentes) {
    const src = fs.readFileSync(f, 'utf8')
    if (!src.includes("'/api/dashboard/settings'") || !src.includes("method: 'PUT'")) continue
    for (const re of [
      /saveSetting\(\s*'([a-z0-9_]+)'/g, // Ajustes
      /key:\s*'([a-z0-9_]+)'/g, // JSON.stringify({ key: '…', value })
      /\[\s*'([a-z0-9_]+)'\s*,\s*[a-zA-Z]/g, // pares [clave, variable] del Golden Bullet
    ]) {
      for (const m of src.matchAll(re)) claves.add(m[1])
    }
    // Plantillas › Mensajes automáticos (2026-10-11) escribe el puntero de CADA mensaje del
    // catálogo con su clave (`definition.settingsKey`): en una marca Twilio, «Elegir otra»
    // reemplazó a los 15 desplegables de Ajustes. La clave no es un literal: sale del catálogo.
    if (/saveSetting\(\s*entry\.definition\.settingsKey/.test(src)) {
      for (const t of TEMPLATE_CATALOG) claves.add(t.settingsKey)
    }
  }
  return [...claves].sort()
}

const CLAVES = clavesDeLasPantallas()

describe('OPER-4 · las claves que mandan las pantallas', () => {
  it('la lectura del código encuentra las de Ajustes, las de Plantillas y las del Golden Bullet', () => {
    // Si esto baja, el extractor dejó de ver una pantalla: arreglar el extractor, no el número.
    // 2026-10-11: 46 (los punteros se mudaron de Ajustes a Plantillas y el catálogo creció a 16).
    expect(CLAVES.length).toBeGreaterThanOrEqual(46)
    expect(CLAVES).toContain('welcome_template_sid')
    expect(CLAVES).toContain('tier_unlocked_template_sid')
    expect(CLAVES).toContain('reactivation_with_reward_template_sid')
    expect(CLAVES).toContain('reactivation_reward_id')
    expect(CLAVES).toContain('reward_reminder_days_before')
    expect(CLAVES).toContain('golden_bullet_reply_si_image_url')
    expect(CLAVES).toContain('golden_bullet_invite_slug')
  })

  it.each(CLAVES)('marca Twilio: «%s» se acepta y se escribe', async (key) => {
    const res = await guardar(key, 'valor')
    expect(res.status).toBe(200)
    expect(escrituras).toHaveLength(1)
  })
})

describe('OPER-4 · lista cerrada', () => {
  it('una clave inventada da 400 y no escribe nada', async () => {
    const res = await guardar('clave_inventada', 'x')
    expect(res.status).toBe(400)
    expect(escrituras).toEqual([])
  })

  it('un puntero legacy que ya ninguna pantalla escribe tampoco entra', async () => {
    const res = await guardar('reactivation_template_sid', 'HX_viejo')
    expect(res.status).toBe(400)
    expect(escrituras).toEqual([])
  })
})

describe('OPER-4 · punteros de plantilla en una marca Zernio', () => {
  beforeEach(() => {
    proveedor = 'zernio'
  })

  it('CAMBIAR un *_template_sid da 400 con el porqué, y no escribe', async () => {
    guardado = { welcome_template_sid: 'bienvenida' }
    const res = await guardar('welcome_template_sid', 'otra_plantilla')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Plantillas/)
    expect(escrituras).toEqual([])
  })

  it('crear un puntero que no existía también da 400', async () => {
    const res = await guardar('points_earned_far_template_sid', 'puntos_sumados_lejos')
    expect(res.status).toBe(400)
    expect(escrituras).toEqual([])
  })

  it('los de evento (sin _template_sid en el nombre) también son punteros', async () => {
    const res = await guardar('event_template_image_sid', 'evento_imagen')
    expect(res.status).toBe(400)
    expect(escrituras).toEqual([])
  })

  it('el MISMO valor que ya tiene es 200 sin escribir: Ajustes guarda los 15 juntos', async () => {
    guardado = { welcome_template_sid: 'bienvenida' }
    expect((await guardar('welcome_template_sid', 'bienvenida')).status).toBe(200)
    expect((await guardar('birthday_template_sid', '')).status).toBe(200)
    expect(escrituras).toEqual([])
  })

  it('un ajuste que no es puntero se guarda igual que en Twilio', async () => {
    const res = await guardar('reactivation_soft_days', '21')
    expect(res.status).toBe(200)
    expect(escrituras).toHaveLength(1)
  })
})
