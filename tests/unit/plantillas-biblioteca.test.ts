/**
 * Un solo libro, punto 5 — la Biblioteca para campañas (B4) y las libres de Zernio (B5),
 * 2026-10-11.
 *
 *   · B4: las plantillas que el dueño crea para una campaña viven aparte de las de los
 *     mensajes automáticos. No hay tabla nueva: la cuenta de WhatsApp ya las guarda; lo que
 *     faltaba era SEPARARLAS (`clasificarParaLaBiblioteca`).
 *   · B5: una marca Zernio no tenía cómo crear una plantilla libre. Ahora `POST
 *     /api/dashboard/templates` la crea en su WABA por el endpoint verificado de siempre.
 *   · Una sola regla para las libres, en el formulario y en el servidor
 *     (`validarPlantillaLibre`): antes la ruta no exigía SALIR ni variables sin huecos
 *     (`docs/PENDIENTES-PLANTILLAS.md` §1.9).
 *
 * Código: `src/lib/template-library.ts` · `src/constants/template-catalog.ts` ·
 * `src/services/template.service.ts` (`crearPlantillaLibreZernio`) ·
 * `src/app/api/dashboard/templates/route.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Tenant } from '@/types/tenant.types'

const TENANT = 'aaaaaaaa-0000-4000-8000-0000000000bb'

const listar = vi.fn()
const crear = vi.fn()
vi.mock('@/lib/zernio/messaging', () => ({ listZernioTemplates: (...a: unknown[]) => listar(...a) }))
vi.mock('@/lib/zernio/templates', () => ({
  createZernioTemplate: (...a: unknown[]) => crear(...a),
  getZernioTemplateStatus: async () => ({ template: { status: 'PENDING' } }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
      return b
    },
  }),
}))

const MARCA_ZERNIO = {
  id: TENANT,
  slug: 'planeta-wings',
  name: 'Planeta Wings',
  business_type: 'restaurant',
  config: {},
  messaging_provider: 'zernio',
  zernio_account_id: 'acc_pw',
} as unknown as Tenant

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/alcance-de-marca', () => ({ exigirAlcanceDeMarca: async () => ({ ok: true, tenantId: TENANT }) }))
vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, getTenantIdFromJwt: async () => TENANT, getTenantById: async () => MARCA_ZERNIO }
})

const PROMO =
  '¡Hola {{1}}! Este viernes tenemos dos por uno en todo el menú. Tienes {{2}} puntos para usar. Responde SALIR para no recibir más mensajes.'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  listar.mockReset().mockResolvedValue({ templates: [] })
  crear.mockReset().mockResolvedValue({ template: { id: 'meta_1', name: 'promo_viernes', status: 'PENDING' } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('B4 · qué es de la biblioteca', () => {
  it('lo que usa un mensaje automático NO es de la biblioteca, y dice cuál lo usa', async () => {
    const { clasificarParaLaBiblioteca } = await import('@/lib/template-library')
    const r = clasificarParaLaBiblioteca(
      [
        { sid: 'HX1', name: 'bienvenida_sushi' },
        { sid: 'HX2', name: 'promo_amor_y_amistad' },
        { sid: 'HX3', name: 'reactivacion_con_regalo' },
      ],
      { welcome_template_sid: 'HX1', reactivation_with_reward_template_sid: 'HX3' },
      'twilio'
    )
    expect(r.map((t) => [t.sid, t.biblioteca, t.en_uso_por])).toEqual([
      ['HX1', false, 'Bienvenida'],
      ['HX2', true, null],
      ['HX3', false, 'Reactivación con premio (sistema anterior)'],
    ])
  })

  it('en Zernio, una versión vieja de un mensaje del catálogo tampoco es de la biblioteca', async () => {
    const { clasificarParaLaBiblioteca } = await import('@/lib/template-library')
    const r = clasificarParaLaBiblioteca(
      [
        { sid: 'bienvenida', name: 'bienvenida' },
        { sid: 'bienvenida_v2', name: 'bienvenida_v2' },
        { sid: 'club_invite_pw', name: 'club_invite_pw' },
      ],
      { welcome_template_sid: 'bienvenida_v2' },
      'zernio'
    )
    expect(r.map((t) => t.biblioteca)).toEqual([false, false, true])
  })
})

describe('una sola regla para las plantillas libres', () => {
  it('una buena pasa', async () => {
    const { validarPlantillaLibre } = await import('@/constants/template-catalog')
    expect(
      validarPlantillaLibre({ name: 'Promo Viernes', body: PROMO, category: 'MARKETING', samples: { '1': 'María', '2': '120' } })
    ).toEqual([])
  })

  it('MARKETING sin la línea de SALIR no pasa (la ruta Twilio de antes la dejaba)', async () => {
    const { validarPlantillaLibre } = await import('@/constants/template-catalog')
    const sinSalir = PROMO.replace(' Responde SALIR para no recibir más mensajes.', ' ¡Te esperamos!')
    expect(
      validarPlantillaLibre({ name: 'promo', body: sinSalir, category: 'MARKETING', samples: { '1': 'a', '2': 'b' } }).join()
    ).toContain('SALIR')
  })

  it('variables con huecos, poco texto por variable o sin ejemplo no pasan', async () => {
    const { validarPlantillaLibre } = await import('@/constants/template-catalog')
    const base = { name: 'promo', category: 'UTILITY', samples: { '1': 'a', '3': 'c' } }
    expect(validarPlantillaLibre({ ...base, body: 'Hola {{1}}, tu premio {{3}} te espera hoy mismo en el local.' }).join()).toContain('{{2}}')
    expect(validarPlantillaLibre({ ...base, body: 'Hola {{1}} y {{2}} ya.' }).join()).toMatch(/palabras fijas/)
    expect(
      validarPlantillaLibre({ ...base, samples: {}, body: 'Hola {{1}}, gracias por venir hoy al local, te esperamos pronto.' }).join()
    ).toMatch(/ejemplo de \{\{1\}\}/)
  })

  it('el nombre se normaliza como lo verá Meta (espacios y tildes fuera, sin _ en las puntas)', async () => {
    const { nombreDePlantillaLibre } = await import('@/constants/template-catalog')
    expect(nombreDePlantillaLibre('  Promo Día de la Madre ')).toBe('promo_dia_de_la_madre')
  })
})

describe('B5 · una marca Zernio crea plantillas libres', () => {
  it('se crea en SU WABA, con los ejemplos en orden, y no deja puntero ni versión', async () => {
    const { crearPlantillaLibreZernio } = await import('@/services/template.service')
    const r = await crearPlantillaLibreZernio({
      tenant: MARCA_ZERNIO,
      name: 'Promo Viernes',
      body: PROMO,
      category: 'MARKETING',
      samples: { '1': 'María', '2': '120' },
    })
    expect(r).toEqual({ name: 'promo_viernes', status: 'PENDING' })
    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc_pw',
        name: 'promo_viernes',
        category: 'MARKETING',
        language: 'es',
        bodyText: PROMO,
        bodyExample: ['María', '120'],
      })
    )
  })

  it('no deja usar el nombre de un mensaje automático (el panel la confundiría con una versión)', async () => {
    const { crearPlantillaLibreZernio } = await import('@/services/template.service')
    const err = await crearPlantillaLibreZernio({
      tenant: MARCA_ZERNIO,
      name: 'bienvenida_v7',
      body: PROMO,
      category: 'MARKETING',
      samples: { '1': 'a', '2': 'b' },
    }).catch((e) => e)
    expect(err.status).toBe(409)
    expect(crear).not.toHaveBeenCalled()
  })

  it('un nombre que ya está en la WABA se corta antes de llamar a Zernio', async () => {
    listar.mockResolvedValue({ templates: [{ name: 'promo_viernes', language: 'es', status: 'APPROVED' }] })
    const { crearPlantillaLibreZernio } = await import('@/services/template.service')
    const err = await crearPlantillaLibreZernio({
      tenant: MARCA_ZERNIO,
      name: 'promo_viernes',
      body: PROMO,
      category: 'MARKETING',
      samples: { '1': 'a', '2': 'b' },
    }).catch((e) => e)
    expect(err.status).toBe(409)
    expect(err.message).toContain('Ya existe en tu cuenta de WhatsApp')
    expect(crear).not.toHaveBeenCalled()
  })

  it('la ruta de siempre (`POST /api/dashboard/templates`) la crea en Zernio, no en Twilio', async () => {
    const fetchTwilio = vi.fn()
    vi.stubGlobal('fetch', fetchTwilio)
    const { POST } = await import('@/app/api/dashboard/templates/route')
    const res = await POST(
      new Request('https://marca.constelarys.com/api/dashboard/templates', {
        method: 'POST',
        body: JSON.stringify({ name: 'promo_viernes', body: PROMO, category: 'MARKETING', variables: { '1': 'María', '2': '120' } }),
        headers: { 'content-type': 'application/json' },
      }) as never
    )
    vi.unstubAllGlobals()
    expect(res.status).toBe(200)
    expect((await res.json()).template).toMatchObject({ sid: 'promo_viernes', status: 'pending' })
    expect(crear).toHaveBeenCalledTimes(1)
    expect(fetchTwilio).not.toHaveBeenCalled()
  })

  it('la ruta rechaza con la misma regla que el formulario', async () => {
    const { POST } = await import('@/app/api/dashboard/templates/route')
    const res = await POST(
      new Request('https://marca.constelarys.com/api/dashboard/templates', {
        method: 'POST',
        body: JSON.stringify({ name: 'promo', body: '{{1}} promo', category: 'MARKETING', variables: { '1': 'a' } }),
        headers: { 'content-type': 'application/json' },
      }) as never
    )
    expect(res.status).toBe(400)
    expect(crear).not.toHaveBeenCalled()
  })
})
