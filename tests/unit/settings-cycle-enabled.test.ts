/**
 * El interruptor del ciclo, también en el SERVIDOR (fase 2 del ciclo, parte C, punto 5;
 * decisión H7 del comandante, 2026-10-14) — `PUT /api/dashboard/settings`.
 *
 * Lo encontró la parte B: la pantalla escondía «Encender/Apagar el ciclo» a quien no es el
 * operador de Cada1, pero el `PUT` de Ajustes aceptaba `cycle_enabled` de cualquier super
 * usuario de la marca (`exigirAlcanceDeMarca()`). Encender sube el volumen de mensajes y el
 * costo de un día para otro: lo decide Cada1 con el dueño.
 *
 * Mismos dobles que `settings-permisos.test.ts`: la decisión de alcance es la real
 * (`decideLocationScope()`, `puedeEscribirEnLaMarca()`); se doblan la sesión y la base.
 *
 * Contra el código anterior: el super usuario de la marca recibía 200 y escribía.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocationScopeResult } from '@/lib/location-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'

let alcanceDelUsuario: LocationScopeResult
let esOperadorDeCada1 = false
let escrituras: Array<{ op: string; fila: Record<string, unknown> }> = []

vi.mock('@/lib/location-scope', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireLocationScope: async () => alcanceDelUsuario }
})
vi.mock('@/lib/admin', () => ({ isSuperAdmin: async () => esOperadorDeCada1 }))
vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireTenantId: async () => TENANT }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', app_metadata: { tenant_id: TENANT } } } }) },
  }),
}))

function builder(op: string, fila: Record<string, unknown> = {}): unknown {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: () => b,
    update: (f: Record<string, unknown>) => builder('update', f),
    insert: (f: Record<string, unknown>) => builder('insert', f),
    then: (ok: (v: unknown) => unknown) => {
      if (op !== 'select') escrituras.push({ op, fila })
      return Promise.resolve({ data: null, error: null }).then(ok)
    },
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => builder('select') }) }))

async function alcance(permissions: { location_id: string | null; role: string }[]) {
  const { decideLocationScope } = await import('@/lib/location-scope')
  const r = decideLocationScope({ tenantId: TENANT, permissions, activeLocationIds: [SEDE_1, SEDE_2], requested: null })
  if (!r.ok) throw new Error(`el alcance no se pudo resolver: ${r.error}`)
  return { ok: true as const, scope: r.scope, locations: [] }
}

async function guardar(key: string, value: string) {
  const { PUT } = await import('@/app/api/dashboard/settings/route')
  const req = new Request('https://don-alirio.constelarys.com/api/dashboard/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
    headers: { 'content-type': 'application/json' },
  })
  const res = await PUT(req as never)
  return { status: res.status, body: (await res.json()) as { error?: string } }
}

beforeEach(() => {
  escrituras = []
  esOperadorDeCada1 = false
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://doble.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'doble')
})

describe('cycle_enabled lo escribe SOLO el operador de Cada1', () => {
  it('un super usuario de la marca recibe 403 con el motivo en español y no escribe nada', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    const r = await guardar('cycle_enabled', 'true')
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('Encender o apagar el ciclo lo hace el equipo de Cada1. Escríbenos y lo hacemos contigo.')
    expect(escrituras).toEqual([])
  })

  it('apagarlo tampoco: es el mismo interruptor', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    expect((await guardar('cycle_enabled', 'false')).status).toBe(403)
    expect(escrituras).toEqual([])
  })

  it('el operador de Cada1 sí lo enciende (200, escribe en la marca)', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    esOperadorDeCada1 = true
    const r = await guardar('cycle_enabled', 'true')
    expect(r.status).toBe(200)
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0].fila).toMatchObject({ key: 'cycle_enabled', value: 'true', tenant_id: TENANT })
  })

  it('el ritmo y los regalos siguen siendo del super usuario de la marca', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    expect((await guardar('cycle_rhythm', 'cafe')).status).toBe(200)
    expect(escrituras).toHaveLength(1)
  })

  it('un administrador de sede sigue sin poder nada (403 de la marca, antes que el del operador)', async () => {
    alcanceDelUsuario = await alcance([{ location_id: SEDE_1, role: 'location' }])
    const r = await guardar('cycle_enabled', 'true')
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('Los ajustes son de la marca: solo un super usuario puede cambiarlos.')
    expect(escrituras).toEqual([])
  })
})
