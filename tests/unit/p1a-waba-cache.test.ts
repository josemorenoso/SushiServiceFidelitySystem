/**
 * N16 — la pantalla de Plantillas no llama a la WABA de Zernio en cada carga (2026-10-11).
 *
 * `getTemplateCatalogState()` listaba la WABA entera en cada apertura de la pantalla. Ahora
 * guarda el listado 60 s por marca (`WABA_CACHE_MS`, en la memoria del proceso) y lo olvida
 * cuando la WABA cambia por nuestra mano (crear / someter / adoptar) o cuando Meta resuelve
 * una revisión (el webhook pasa por `applyProviderTemplateStatus()`).
 *
 * Se prueba el servicio DE VERDAD; falsos solo Supabase (vacío) y el listado de Zernio, que
 * es lo que se cuenta. La invalidación se dispara por `applyProviderTemplateStatus()` —que
 * ya existía en `2746d49`— para que este archivo falle contra ese código por la aserción y
 * no por un import que no existe.
 *
 * Código: `src/services/template.service.ts` · Doc: `docs/features/whatsapp-templates.md`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Tenant } from '@/types/tenant.types'

const listar = vi.fn()

vi.mock('@/lib/zernio/messaging', () => ({ listZernioTemplates: (...a: unknown[]) => listar(...a) }))
vi.mock('@/lib/zernio/templates', () => ({
  createZernioTemplate: async () => ({ template: { id: 'tpl_1', status: 'PENDING' } }),
  getZernioTemplateStatus: async () => ({ template: { status: 'PENDING' } }),
}))

/** Base vacía: ninguna versión, ningún puntero (un `maybeSingle` contesta «no existe»). */
function builder(): unknown {
  let una = false
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'update', 'insert']) b[m] = () => b
  b.maybeSingle = b.single = () => ((una = true), b)
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: una ? null : [], error: null }).then(ok)
  return b
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => builder() }) }))

let n = 0
/** Cada prueba usa una marca nueva: el caché vive en el módulo y no se comparte entre pruebas. */
function marca(accountId = 'acc_1'): Tenant {
  n++
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`,
    slug: `marca-${n}`,
    name: 'Marca',
    business_type: 'restaurant',
    config: {},
    messaging_provider: 'zernio',
    zernio_account_id: accountId,
  } as unknown as Tenant
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  listar.mockReset()
  listar.mockResolvedValue({ templates: [] })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-11T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('N16 · caché corto de la WABA por marca', () => {
  it('dos cargas seguidas de la pantalla = UNA llamada a Zernio', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    const t = marca()
    await getTemplateCatalogState(t)
    await getTemplateCatalogState(t)
    expect(listar).toHaveBeenCalledTimes(1)
  })

  it('pasados 60 s vuelve a leer la WABA', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    const t = marca()
    await getTemplateCatalogState(t)
    vi.advanceTimersByTime(60_001)
    await getTemplateCatalogState(t)
    expect(listar).toHaveBeenCalledTimes(2)
  })

  it('es POR MARCA: otra marca no lee el listado de la primera', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    await getTemplateCatalogState(marca('acc_A'))
    await getTemplateCatalogState(marca('acc_B'))
    expect(listar.mock.calls.map((c) => c[0])).toEqual(['acc_A', 'acc_B'])
  })

  it('un cambio de estado en Meta (webhook / «Usar la aprobada») invalida: la próxima carga relee', async () => {
    const { getTemplateCatalogState, applyProviderTemplateStatus } = await import('@/services/template.service')
    const t = marca()
    await getTemplateCatalogState(t)
    await getTemplateCatalogState(t)
    await applyProviderTemplateStatus({
      provider: 'zernio',
      tenantId: t.id,
      providerRef: 'bienvenida',
      language: 'es',
      status: 'APPROVED',
      reason: null,
    })
    await getTemplateCatalogState(t)
    expect(listar).toHaveBeenCalledTimes(2)
  })

  it('mandar una plantilla a Meta invalida: la próxima carga relee', async () => {
    const { getTemplateCatalogState, submitSuggestedTemplate } = await import('@/services/template.service')
    const t = marca()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await getTemplateCatalogState(t) // 1: la pantalla
    // 2: la validación del nombre lee la WABA en vivo. El registro posterior falla en este
    // doble (la base no devuelve la fila), pero la plantilla ya se creó en Zernio.
    await submitSuggestedTemplate({ tenant: t, key: 'welcome', editor: { userId: 'u', email: null } }).catch(() => {})
    await getTemplateCatalogState(t) // 3: tiene que releer, no servir el listado de antes
    expect(listar).toHaveBeenCalledTimes(3)
  })

  it('un fallo de Zernio no se guarda: la siguiente carga lo reintenta', async () => {
    const { getTemplateCatalogState } = await import('@/services/template.service')
    const t = marca()
    listar.mockRejectedValueOnce(new Error('502'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const primera = await getTemplateCatalogState(t)
    expect(primera.wabaTemplates).toBeNull()
    await getTemplateCatalogState(t)
    expect(listar).toHaveBeenCalledTimes(2)
  })
})
