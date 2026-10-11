/**
 * Un solo libro, punto 4 — UNA pantalla de Plantillas para Twilio y Zernio (2026-10-11).
 *
 * Antes eran tres (`docs/PENDIENTES-PLANTILLAS.md` §1.3): el catálogo solo para Zernio; la
 * lista cruda de Twilio con «Del set estándar te faltan»; y Ajustes › Plantillas WhatsApp,
 * 15 desplegables para asignar lo que se creaba en otro lado — que en una marca Zernio,
 * además, tragaba un 400 sin avisar (OPER-4-bis).
 *
 * Se fija:
 *   1. `GET /api/dashboard/templates/catalog` contesta a una marca TWILIO con el catálogo
 *      (antes: 409 y otra pantalla), con el estado REAL de cada mensaje según Twilio.
 *   2. Lo que Ajustes permitía —elegir cualquier plantilla aprobada, y la reactivación con
 *      premio del sistema anterior— sigue siendo posible desde Plantillas.
 *   3. Ajustes ya no asigna punteros: ni desplegables ni «Guardar» que trague errores.
 *
 * Código: `src/services/twilio-catalog.service.ts` (`getTwilioCatalogState`) ·
 * `src/app/api/dashboard/templates/catalog/route.ts` · `dashboard/settings/page.tsx`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { crearBaseEnMemoria, type BaseEnMemoria } from './_dobles/supabase-en-memoria'
import type { Tenant } from '@/types/tenant.types'

const TENANT = 'aaaaaaaa-0000-4000-8000-0000000000aa'

let db: BaseEnMemoria
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.cliente }))

let contenidos: unknown[] | null = []
vi.mock('@/lib/twilio/content-list', () => ({
  listarContenidoTwilio: async () =>
    contenidos === null ? { ok: false, status: 503, detalle: 'caído' } : { ok: true, contents: contenidos },
}))
vi.mock('@/lib/twilio/tenant-credentials', () => ({
  getTenantTwilioCredentials: async () => ({ basicAuth: 'Basic doble' }),
  resolveTwilioAccount: () => null,
}))

const MARCA_TWILIO = {
  id: TENANT,
  slug: 'sushi-service',
  name: 'Sushi Service',
  business_type: 'restaurant',
  config: {},
  messaging_provider: 'twilio',
} as unknown as Tenant

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, getTenantIdFromJwt: async () => TENANT, getTenantById: async () => MARCA_TWILIO }
})

function contenido(sid: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    sid,
    friendly_name: `plantilla_${sid.toLowerCase()}`,
    language: 'es',
    types: { 'twilio/text': { body: `Texto de ${sid}` } },
    approval_requests: { status, category: 'MARKETING' },
    ...extra,
  }
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  db = crearBaseEnMemoria({
    admin_settings: [
      { tenant_id: TENANT, key: 'welcome_template_sid', value: 'HXAPROBADA' },
      { tenant_id: TENANT, key: 'points_earned_far_template_sid', value: 'HXRECHAZADA' },
      { tenant_id: TENANT, key: 'reward_safe_template_sid', value: 'HXBORRADA' },
      { tenant_id: TENANT, key: 'reactivation_with_reward_template_sid', value: 'HXLEGACY' },
      { tenant_id: TENANT, key: 'reactivation_reward_id', value: 'premio-1' },
    ],
  })
  contenidos = [
    contenido('HXAPROBADA', 'approved', { approval_requests: { status: 'approved', category: 'MARKETING' } }),
    contenido('HXRECHAZADA', 'rejected', {
      approval_requests: { status: 'rejected', category: 'MARKETING', rejection_reason: 'INVALID_FORMAT' },
    }),
    contenido('HXLIBRE', 'approved'),
  ]
})

describe('punto 4 · el catálogo de una marca Twilio, con la forma del de Zernio', () => {
  it('cada mensaje trae el estado REAL que dice Twilio de la plantilla asignada', async () => {
    const { getTwilioCatalogState } = await import('@/services/twilio-catalog.service')
    const state = await getTwilioCatalogState(MARCA_TWILIO)
    const de = (key: string) => state.entries.find((e) => e.definition.key === key)!

    expect(state.provider).toBe('twilio')
    // Bienvenida: activa, y la categoría con que la dejó Meta (se pidió UTILITY).
    expect(de('welcome').enWhatsApp).toMatchObject({ ref: 'HXAPROBADA', status: 'approved', category: 'MARKETING' })
    // Rechazada: el motivo viaja hasta la pantalla.
    expect(de('points_earned_far').enWhatsApp).toMatchObject({ status: 'rejected', rejectionReason: 'INVALID_FORMAT' })
    // Puntero a algo que Twilio ya no conoce: asignado, pero sin vista del proveedor.
    expect(de('reward_safe').adoptedRef).toBe('HXBORRADA')
    expect(de('reward_safe').enWhatsApp).toBeNull()
    // Sin puntero: pendiente de enviar, con el texto del catálogo para leerlo antes.
    expect(de('tier_unlocked').adoptedRef).toBeNull()
    expect(de('tier_unlocked').suggestedBody).toContain('{{2}}')
    expect(state.aviso).toBeNull()
  })

  it('las nuevas del catálogo también aparecen para las marcas Twilio (un solo viaje a Meta)', async () => {
    const { getTwilioCatalogState } = await import('@/services/twilio-catalog.service')
    const keys = (await getTwilioCatalogState(MARCA_TWILIO)).entries.map((e) => e.definition.key)
    expect(keys).toEqual(expect.arrayContaining(['tier_unlocked', 'reward_reminder', 'gift_expiring', 'birthday_upcoming']))
  })

  it('lo que hacía Ajustes sigue siendo posible: elegir cualquier aprobada y la reactivación con premio', async () => {
    const { getTwilioCatalogState } = await import('@/services/twilio-catalog.service')
    const state = await getTwilioCatalogState(MARCA_TWILIO)
    expect(state.elegibles?.map((o) => o.ref).sort()).toEqual(['HXAPROBADA', 'HXLIBRE'])
    expect(state.sistemaAntiguo).toEqual({ reactivationWithRewardSid: 'HXLEGACY', reactivationRewardId: 'premio-1' })
  })

  it('si Twilio no responde, no se cae: avisa y cada mensaje queda con lo que tiene asignado', async () => {
    contenidos = null
    const { getTwilioCatalogState } = await import('@/services/twilio-catalog.service')
    const state = await getTwilioCatalogState(MARCA_TWILIO)
    expect(state.aviso).toMatch(/No se pudo leer/)
    expect(state.entries.find((e) => e.definition.key === 'welcome')?.adoptedRef).toBe('HXAPROBADA')
  })

  it('la ruta del catálogo le contesta a una marca Twilio (antes: 409 y otra pantalla)', async () => {
    const { GET } = await import('@/app/api/dashboard/templates/catalog/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).provider).toBe('twilio')
  })
})

// ═══════════════════════════════════════════════════════════════
// Las pantallas (lectura del código: el proyecto no tiene DOM de pruebas)
// ═══════════════════════════════════════════════════════════════

const RAIZ = path.resolve(import.meta.dirname, '../..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

describe('punto 4 · Ajustes ya no asigna plantillas; Plantillas sí', () => {
  it('Ajustes no manda ningún puntero de plantilla ni tiene el «Guardar» que tragaba el 400 (OPER-4-bis)', () => {
    const ajustes = leer('src/app/(dashboard)/dashboard/settings/page.tsx')
    expect(ajustes).not.toMatch(/saveSetting\(\s*'[a-z_]*template[a-z_]*sid'/)
    expect(ajustes).not.toContain('handleSaveTemplates')
    // Queda una tarjeta que lleva a Plantillas: varios avisos del sistema dicen «en Ajustes».
    expect(ajustes).toContain('href="/dashboard/templates"')
  })

  it('Plantillas tiene las dos pestañas: mensajes automáticos y biblioteca', () => {
    const pagina = leer('src/app/(dashboard)/dashboard/templates/page.tsx')
    expect(pagina).toContain('TemplateCatalogEditor')
    expect(pagina).toContain('TemplateLibrary')
    // Ni importado ni llamado (el comentario que explica por qué no, sí puede nombrarlo).
    expect(pagina).not.toMatch(/import[^\n]*useSearchParams|=\s*useSearchParams\(/)
  })

  it('en la pantalla única, un error al elegir plantilla SE MUESTRA (no se traga)', () => {
    const editor = leer('src/components/dashboard/templates/TemplateCatalogEditor.tsx')
    const elegir = editor.slice(editor.indexOf('const handleChoose'), editor.indexOf('const handleSaveLegacy'))
    expect(elegir).toContain('setActionError')
    expect(elegir).not.toMatch(/catch\s*\{\s*\/\*\s*silent/)
  })
})
