/**
 * Un solo libro, punto 1 — el panel reconoce lo que YA está en la WABA (2026-10-11).
 *
 * EL PROBLEMA (`docs/PENDIENTES-PLANTILLAS.md` §1.1, prompt del 12-09 punto 1)
 * ───────────────────────────────────────────────────────────────────────────
 * El alta por el AIOS crea las plantillas en Meta sin dejar filas en `template_versions`.
 * Resultado, verificado en Planeta Wings:
 *   · las que estaban en revisión se veían «Pendiente de enviar», y «Enviar a Meta» chocaba
 *     por nombre (Zernio 400: «La categoría UTILITY no coincide con la que ya está asociada
 *     a esta plantilla: MARKETING» — Meta la había recategorizado), y la pantalla decía
 *     «vuelve a intentarlo más tarde», que es falso;
 *   · cuando Meta las aprobaba, el webhook las descartaba («sin versión registrada»);
 *   · las que el AIOS sí apuntó se veían «Activo, pero no tenemos su texto».
 *
 * Se prueba el servicio DE VERDAD sobre una base en memoria con los índices únicos de la
 * 00039. Falsos: Supabase (`_dobles/supabase-en-memoria`) y la API de Zernio.
 *
 * Código: `src/services/template.service.ts` (`reconciliarConLaWaba`,
 * `adoptarLaQueYaExiste`) · Doc: `docs/features/whatsapp-templates.md`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crearBaseEnMemoria, type BaseEnMemoria, type Fila } from './_dobles/supabase-en-memoria'
import { ZernioApiError } from '@/lib/zernio/client'
import { TEMPLATE_CATALOG_BY_KEY } from '@/constants/template-catalog'
import type { ZernioTemplateSummary } from '@/lib/zernio/messaging'
import type { Tenant } from '@/types/tenant.types'
import type { TemplateVersion } from '@/types/template.types'

const listar = vi.fn()
const crear = vi.fn()
const estado = vi.fn()

vi.mock('@/lib/zernio/messaging', () => ({ listZernioTemplates: (...a: unknown[]) => listar(...a) }))
vi.mock('@/lib/zernio/templates', () => ({
  createZernioTemplate: (...a: unknown[]) => crear(...a),
  getZernioTemplateStatus: (...a: unknown[]) => estado(...a),
}))

let db: BaseEnMemoria
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.cliente }))

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
let n = 0
/** Marca nueva por prueba: el caché de la WABA vive en el módulo. */
function marca(): Tenant {
  n++
  return {
    id: `${TENANT.slice(0, -2)}${String(n).padStart(2, '0')}`,
    slug: `planeta-${n}`,
    name: 'Planeta Wings',
    business_type: 'restaurant',
    config: { branding: { name: 'Planeta Wings' } },
    messaging_provider: 'zernio',
    zernio_account_id: 'acc_pw',
  } as unknown as Tenant
}

const WELCOME = TEMPLATE_CATALOG_BY_KEY.welcome
const FAR = TEMPLATE_CATALOG_BY_KEY.points_earned_far

const BIENVENIDA_AIOS = '¡Hola {{1}}! Bienvenid@ a Planeta Wings. Hoy recibiste {{2}} puntos. Así funciona tu camino: {{3}} ¡Te esperamos!'
const LEJOS_AIOS = '¡{{1}}, gracias por tu visita! Sumaste {{2}} puntos, tu saldo es {{3}}. Tu camino: {{4}} Responde SALIR para no recibir más mensajes.'

function waba(name: string, body: string, extra: Partial<ZernioTemplateSummary> = {}): ZernioTemplateSummary {
  return {
    id: `meta_${name}`,
    name,
    status: 'PENDING',
    category: 'MARKETING',
    language: 'es',
    components: [{ type: 'BODY', text: body }],
    ...extra,
  }
}

function filas(tenantId: string, tabla = 'template_versions'): Fila[] {
  return (db.tablas[tabla] ?? []).filter((f) => f.tenant_id === tenantId)
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  db = crearBaseEnMemoria()
  listar.mockReset()
  crear.mockReset()
  estado.mockReset()
  listar.mockResolvedValue({ templates: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// ═══════════════════════════════════════════════════════════════
// La regla, PURA
// ═══════════════════════════════════════════════════════════════

describe('reconciliarConLaWaba (pura)', () => {
  const v = (x: Partial<TemplateVersion>) => ({ language: 'es', is_current: false, ...x }) as TemplateVersion

  it('mensaje vacío + en revisión en la WABA → se registra como pendiente (gana la _vN más alta)', async () => {
    const { reconciliarConLaWaba } = await import('@/services/template.service')
    const r = reconciliarConLaWaba(WELCOME, [waba('bienvenida', BIENVENIDA_AIOS), waba('bienvenida_v2', BIENVENIDA_AIOS)], [], null)
    expect(r?.tipo).toBe('pendiente')
    expect(r && 'plantilla' in r ? r.plantilla.name : null).toBe('bienvenida_v2')
  })

  it('una APROBADA para un mensaje vacío NO se registra sola: la activa el dueño («Activar»)', async () => {
    const { reconciliarConLaWaba } = await import('@/services/template.service')
    expect(reconciliarConLaWaba(WELCOME, [waba('bienvenida', BIENVENIDA_AIOS, { status: 'APPROVED' })], [], null)).toBeNull()
  })

  it('una que no sirve (otras variables) no se registra: al aprobarse fallaría cada envío', async () => {
    const { reconciliarConLaWaba } = await import('@/services/template.service')
    expect(reconciliarConLaWaba(WELCOME, [waba('bienvenida', 'Hola {{1}}, bienvenido. Responde SALIR.')], [], null)).toBeNull()
  })

  it('puntero sin fila + aprobada con ese nombre → vigente (el «activo sin texto» del AIOS)', async () => {
    const { reconciliarConLaWaba } = await import('@/services/template.service')
    const r = reconciliarConLaWaba(FAR, [waba('puntos_sumados_lejos', LEJOS_AIOS, { status: 'APPROVED' })], [], 'puntos_sumados_lejos')
    expect(r?.tipo).toBe('vigente')
  })

  it('una pendiente del panel que Meta ya resolvió sin que llegara el webhook → se aplica el veredicto', async () => {
    const { reconciliarConLaWaba } = await import('@/services/template.service')
    const pendiente = v({ provider_ref: 'bienvenida_v2', status: 'pending' })
    expect(reconciliarConLaWaba(WELCOME, [waba('bienvenida_v2', BIENVENIDA_AIOS, { status: 'APPROVED' })], [pendiente], null)?.tipo).toBe('aprobar')
    expect(reconciliarConLaWaba(WELCOME, [waba('bienvenida_v2', BIENVENIDA_AIOS, { status: 'REJECTED' })], [pendiente], null)?.tipo).toBe('rechazar')
    expect(reconciliarConLaWaba(WELCOME, [waba('bienvenida_v2', BIENVENIDA_AIOS)], [pendiente], null)).toBeNull()
  })

  it('un intento `failed` con ese nombre no la tapa (es el «Enviar a Meta» que chocó con ella)', async () => {
    const { reconciliarConLaWaba } = await import('@/services/template.service')
    const fallido = v({ provider_ref: 'bienvenida', status: 'failed' })
    expect(reconciliarConLaWaba(WELCOME, [waba('bienvenida', BIENVENIDA_AIOS)], [fallido], null)?.tipo).toBe('pendiente')
  })

  it('una rechazada solo se anota si el panel nunca tocó ese mensaje', async () => {
    const { reconciliarConLaWaba } = await import('@/services/template.service')
    const rechazada = waba('bienvenida', BIENVENIDA_AIOS, { status: 'REJECTED' })
    expect(reconciliarConLaWaba(WELCOME, [rechazada], [], null)?.tipo).toBe('rechazada')
    expect(reconciliarConLaWaba(WELCOME, [rechazada], [v({ provider_ref: 'bienvenida_pw', status: 'rejected' })], null)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Al abrir la pantalla
// ═══════════════════════════════════════════════════════════════

describe('la pantalla reconoce lo que ya está en la WABA', () => {
  it('Planeta Wings: «bienvenida» en revisión del AIOS se ve EN REVISIÓN, con la categoría REAL', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    const t = marca()
    listar.mockResolvedValue({ templates: [waba('bienvenida', BIENVENIDA_AIOS, { category: 'MARKETING' })] })

    const state = await getTemplateCatalogState(t)
    const welcome = state.entries.find((e) => e.definition.key === 'welcome')!
    expect(welcome.pending?.provider_ref).toBe('bienvenida')
    // El catálogo la pide UTILITY; Meta la dejó MARKETING. Se guarda la de Meta.
    expect(welcome.pending?.category).toBe('MARKETING')
    expect(welcome.pending?.body).toBe(BIENVENIDA_AIOS)
    expect(state.reconocidas).toHaveLength(1)
    // Ningún puntero se tocó.
    expect(db.escrituras.filter((e) => e.tabla === 'admin_settings')).toEqual([])

    // Segunda carga: ya está registrada, no se repite nada.
    const otra = await getTemplateCatalogState(t)
    expect(otra.reconocidas).toEqual([])
    expect(filas(t.id)).toHaveLength(1)
  })

  it('…y cuando Meta la aprueba, el webhook SÍ la encuentra y mueve el puntero', async () => {
    const { getTemplateCatalogState, applyProviderTemplateStatus } = await import('@/services/template.service')
    const t = marca()
    listar.mockResolvedValue({ templates: [waba('bienvenida', BIENVENIDA_AIOS)] })
    await getTemplateCatalogState(t)

    const outcome = await applyProviderTemplateStatus({
      provider: 'zernio',
      tenantId: t.id,
      providerRef: 'bienvenida',
      language: 'es',
      status: 'APPROVED',
    })
    expect(outcome).toMatchObject({ handled: true, action: 'promoted', templateKey: 'welcome' })
    expect(filas(t.id, 'admin_settings')).toEqual([
      expect.objectContaining({ key: 'welcome_template_sid', value: 'bienvenida' }),
    ])
  })

  it('el puntero cargado por el AIOS deja de ser «activo sin texto»: se ve su texto real', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    const t = marca()
    db.tablas.admin_settings = [{ tenant_id: t.id, key: 'points_earned_far_template_sid', value: 'puntos_sumados_lejos' }]
    listar.mockResolvedValue({ templates: [waba('puntos_sumados_lejos', LEJOS_AIOS, { status: 'APPROVED' })] })

    const far = (await getTemplateCatalogState(t)).entries.find((e) => e.definition.key === 'points_earned_far')!
    expect(far.current?.body).toBe(LEJOS_AIOS)
    expect(far.adoptedRef).toBeNull()
    expect(far.enWhatsApp).toMatchObject({ ref: 'puntos_sumados_lejos', status: 'approved', category: 'MARKETING' })
    // El puntero ya apuntaba ahí: no se reescribe.
    expect(db.escrituras.filter((e) => e.tabla === 'admin_settings')).toEqual([])
  })

  it('una pendiente cuyo webhook se perdió: al abrir la pantalla se aplica la aprobación', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    const t = marca()
    db.tablas.template_versions = [
      {
        id: 'v2', tenant_id: t.id, template_key: 'welcome', settings_key: 'welcome_template_sid', provider: 'zernio',
        provider_ref: 'bienvenida_v2', language: 'es', category: 'UTILITY', style: 'calido', body: BIENVENIDA_AIOS,
        status: 'pending', is_current: false, created_at: '2026-10-10T00:00:00Z',
      },
    ]
    listar.mockResolvedValue({ templates: [waba('bienvenida_v2', BIENVENIDA_AIOS, { status: 'APPROVED' })] })

    const welcome = (await getTemplateCatalogState(t)).entries.find((e) => e.definition.key === 'welcome')!
    expect(welcome.current?.provider_ref).toBe('bienvenida_v2')
    expect(welcome.pending).toBeNull()
    expect(filas(t.id, 'admin_settings')).toEqual([expect.objectContaining({ value: 'bienvenida_v2' })])
  })

  it('una rechazada del alta queda anotada con el motivo de Meta', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    const t = marca()
    listar.mockResolvedValue({ templates: [waba('bienvenida', BIENVENIDA_AIOS, { status: 'REJECTED' })] })
    estado.mockResolvedValue({ template: { status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' } })

    const welcome = (await getTemplateCatalogState(t)).entries.find((e) => e.definition.key === 'welcome')!
    expect(welcome.lastRejected?.rejection_reason).toBe('INVALID_FORMAT')
    // Sigue pudiendo mandarse: el nombre siguiente ya no choca.
    expect(welcome.suggestedName).toBe('bienvenida_v2')
  })
})

// ═══════════════════════════════════════════════════════════════
// El 400 «ya existe» de Zernio
// ═══════════════════════════════════════════════════════════════

const YA_EXISTE = new ZernioApiError('Zernio 400', 400, {
  message: 'La categoría UTILITY no coincide con la que ya está asociada a esta plantilla: MARKETING',
})

/** La primera lectura (la del nombre) falla, así el panel no sabe que `bienvenida` existe. */
function wabaQueFallaYDespues(templates: ZernioTemplateSummary[]) {
  listar.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ templates })
}

describe('un 400 de nombre o categoría repetidos ADOPTA, nunca «vuelve a intentarlo más tarde»', () => {
  const editor = { userId: 'u1', email: 'dueno@pw.co' }

  it('en revisión en la WABA → «ya existe en tu cuenta» y queda pendiente, sin `failed`', async () => {
    const { submitSuggestedTemplate } = await import('@/services/template.service')
    const t = marca()
    wabaQueFallaYDespues([waba('bienvenida', BIENVENIDA_AIOS, { category: 'MARKETING' })])
    crear.mockRejectedValue(YA_EXISTE)

    const r = await submitSuggestedTemplate({ tenant: t, key: 'welcome', editor })
    expect(r.message).toContain('Ya existe en tu cuenta de WhatsApp')
    expect(r.message).not.toMatch(/más tarde/)
    expect(r.version).toMatchObject({ provider_ref: 'bienvenida', status: 'pending', category: 'MARKETING' })
    expect(filas(t.id).map((f) => f.status)).toEqual(['pending'])
  })

  it('aprobada en la WABA y mensaje vacío → queda activa por `promoteVersion()`', async () => {
    const { submitSuggestedTemplate } = await import('@/services/template.service')
    const t = marca()
    wabaQueFallaYDespues([waba('bienvenida', BIENVENIDA_AIOS, { status: 'APPROVED' })])
    crear.mockRejectedValue(YA_EXISTE)

    const r = await submitSuggestedTemplate({ tenant: t, key: 'welcome', editor })
    expect(r.version).toMatchObject({ provider_ref: 'bienvenida', is_current: true, status: 'approved' })
    expect(filas(t.id, 'admin_settings')).toEqual([expect.objectContaining({ value: 'bienvenida' })])
  })

  it('rechazada en la WABA → lo dice con el motivo y la deja anotada', async () => {
    const { submitSuggestedTemplate } = await import('@/services/template.service')
    const t = marca()
    wabaQueFallaYDespues([waba('bienvenida', BIENVENIDA_AIOS, { status: 'REJECTED' })])
    crear.mockRejectedValue(YA_EXISTE)
    estado.mockResolvedValue({ template: { status: 'REJECTED', rejected_reason: 'PROMOTIONAL' } })

    const err = await submitSuggestedTemplate({ tenant: t, key: 'welcome', editor }).catch((e) => e)
    expect(err.status).toBe(409)
    expect(err.message).toContain('Ya existe en tu cuenta de WhatsApp')
    expect(err.message).toContain('PROMOTIONAL')
    expect(filas(t.id)).toEqual([expect.objectContaining({ status: 'rejected', rejection_reason: 'PROMOTIONAL' })])
  })

  it('con un mensaje VIVO no adopta (sería reemplazarlo): lo dice y el actual sigue', async () => {
    const { submitSuggestedTemplate } = await import('@/services/template.service')
    const t = marca()
    db.tablas.admin_settings = [{ tenant_id: t.id, key: 'welcome_template_sid', value: 'bienvenida_vieja' }]
    wabaQueFallaYDespues([waba('bienvenida', BIENVENIDA_AIOS, { status: 'APPROVED' })])
    crear.mockRejectedValue(YA_EXISTE)

    const err = await submitSuggestedTemplate({ tenant: t, key: 'welcome', editor }).catch((e) => e)
    expect(err.status).toBe(409)
    expect(err.message).toContain('Tu mensaje actual sigue funcionando')
    expect(filas(t.id, 'admin_settings')).toEqual([expect.objectContaining({ value: 'bienvenida_vieja' })])
    expect(filas(t.id).map((f) => f.status)).toEqual(['failed'])
  })

  it('si la WABA no la tiene, el 400 es por otra cosa: dice el motivo del proveedor, como antes', async () => {
    const { submitSuggestedTemplate } = await import('@/services/template.service')
    const t = marca()
    wabaQueFallaYDespues([])
    crear.mockRejectedValue(new ZernioApiError('Zernio 400', 400, { message: 'Invalid parameter' }))

    const err = await submitSuggestedTemplate({ tenant: t, key: 'welcome', editor }).catch((e) => e)
    expect(err.status).toBe(400)
    expect(err.message).toContain('Invalid parameter')
    expect(err.message).not.toMatch(/más tarde/)
  })
})
