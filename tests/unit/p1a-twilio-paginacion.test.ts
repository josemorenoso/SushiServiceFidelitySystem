/**
 * N23 — las plantillas de Twilio se listan TODAS, no solo las primeras 100 (2026-10-11).
 *
 * `GET /api/dashboard/templates` pedía `ContentAndApprovals?PageSize=100` una vez y no seguía
 * `meta.next_page_url`: pasadas 100 plantillas, las demás desaparecían de Campañas →
 * Manuales y de Ajustes › Plantillas. Una marca Twilio llega a 100 sola (cada rechazo de Meta
 * obliga a crear otra con nombre nuevo).
 *
 * Se prueba la RUTA con `fetch` doblado. Además: un `next_page_url` de otro host no se sigue
 * (la petición lleva las credenciales de la cuenta), y una página que falla a la mitad no
 * devuelve una lista cortada que parezca entera.
 *
 * Código: `src/lib/twilio/content-list.ts` · `src/app/api/dashboard/templates/route.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/tenant', () => ({
  getTenantIdFromJwt: async () => TENANT,
  getTenantById: async () => ({ id: TENANT, messaging_provider: 'twilio', zernio_account_id: null }),
}))
vi.mock('@/lib/twilio/tenant-credentials', () => ({
  getTenantTwilioCredentials: async () => ({ basicAuth: 'Basic eDp5', accountSid: 'AC1', authToken: 'x' }),
}))
vi.mock('@/services/club-optin.service', () => ({ resolveGoldenBulletProvider: async () => 'twilio' }))

const PAGINA_1 = 'https://content.twilio.com/v1/ContentAndApprovals?PageSize=100'
const PAGINA_2 = 'https://content.twilio.com/v1/ContentAndApprovals?PageSize=100&Page=1&PageToken=PT2'

const plantilla = (i: number) => ({
  sid: `HX${String(i).padStart(32, '0')}`,
  friendly_name: `plantilla_${i}`,
  language: 'es',
  date_created: '2026-10-01T00:00:00Z',
  date_updated: '2026-10-01T00:00:00Z',
  types: { 'twilio/text': { body: `Hola {{1}} ${i}` } },
  approval_requests: { status: 'approved', category: 'MARKETING' },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let pedidos: string[] = []

function twilio(paginas: Record<string, Response>) {
  pedidos = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      pedidos.push(String(url))
      const r = paginas[String(url)]
      if (!r) throw new Error(`fetch inesperado: ${url}`)
      return r
    })
  )
}

async function listar() {
  const { GET } = await import('@/app/api/dashboard/templates/route')
  const { NextRequest } = await import('next/server')
  const res = await GET(new NextRequest('https://marca.constelarys.com/api/dashboard/templates'))
  return (await res.json()) as { templates: Array<{ sid: string }>; error?: string }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('N23 · GET /api/dashboard/templates (Twilio)', () => {
  it('con 105 plantillas devuelve las 105: sigue next_page_url', async () => {
    twilio({
      [PAGINA_1]: json({ contents: Array.from({ length: 100 }, (_, i) => plantilla(i)), meta: { next_page_url: PAGINA_2 } }),
      [PAGINA_2]: json({ contents: Array.from({ length: 5 }, (_, i) => plantilla(100 + i)), meta: { next_page_url: null } }),
    })

    const { templates, error } = await listar()

    expect(error).toBeUndefined()
    expect(templates).toHaveLength(105)
    expect(templates.at(-1)?.sid).toBe(plantilla(104).sid)
    expect(pedidos).toEqual([PAGINA_1, PAGINA_2])
  })

  it('una página sola sigue funcionando igual', async () => {
    twilio({ [PAGINA_1]: json({ contents: [plantilla(1)], meta: { next_page_url: null } }) })
    const { templates } = await listar()
    expect(templates).toHaveLength(1)
  })

  it('si la página 2 falla, no devuelve 100 como si fueran todas', async () => {
    twilio({
      [PAGINA_1]: json({ contents: Array.from({ length: 100 }, (_, i) => plantilla(i)), meta: { next_page_url: PAGINA_2 } }),
      [PAGINA_2]: json({ message: 'boom' }, 500),
    })
    const { templates, error } = await listar()
    expect(error).toBe('Error consultando Twilio')
    expect(templates).toEqual([])
  })

  it('no le manda las credenciales a un next_page_url de otro host', async () => {
    twilio({
      [PAGINA_1]: json({ contents: [plantilla(1)], meta: { next_page_url: 'https://evil.example.com/robar' } }),
    })
    const { templates } = await listar()
    expect(templates).toHaveLength(1)
    expect(pedidos).toEqual([PAGINA_1])
  })
})
