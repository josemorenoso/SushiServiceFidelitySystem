/**
 * El fallo de base que NO se puede confundir con "no hay nada".
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ───────────────────────────
 * `supabase-js` **no lanza**: devuelve `{ data, error }`. Todo el código que escribía
 *
 *     const { data: x } = await supabase.from('staff_users')…
 *     if (!x) return no_autorizado()
 *
 * hacía que un timeout del pooler, una policy de RLS o una columna inexistente (`42703`)
 * produjeran **exactamente el mismo `null`** que "no lo encontré". El caso feliz-vacío se
 * comía el fallo: sin log, sin alerta y sin fallar.
 *
 * LO QUE SE PRUEBA AQUÍ NO ES EL VACÍO — ES LA DIFERENCIA
 * ──────────────────────────────────────────────────────
 * Cada bloque de abajo corre el MISMO código dos veces:
 *   · una con `{ data: null, error: null }`   → "no existe", y la rama de siempre sigue bien;
 *   · otra con `{ data: null, error: {...} }` → "la base falló", y ahora se distingue.
 *
 * Si algún día alguien vuelve a descartar el `error`, los dos casos darán el mismo
 * resultado y estas pruebas se ponen rojas. Ése es todo el objetivo.
 *
 * ⚠️ Sin base de datos y sin red: el cliente de Supabase está sustituido por un doble.
 *
 * Ref: `docs/03-security.md` § "Fallos silenciosos de base de datos"
 *      `src/lib/db-failure.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isDbFailure, isNoRows, logDbFailure, type DbErrorLike } from '@/lib/db-failure'

// ═══════════════════════════════════════════════════════════════
// El doble del cliente de Supabase
// ═══════════════════════════════════════════════════════════════

interface FakeResult {
  data: unknown
  error: DbErrorLike | null
}

/** La respuesta que devolverá el próximo `.from(...)`, por tabla. */
const respuestas = new Map<string, FakeResult>()
/** Las tablas que se consultaron, en orden. Sirve para comprobar que ni se intentó. */
const tablasTocadas: string[] = []

function programar(tabla: string, resultado: FakeResult): void {
  respuestas.set(tabla, resultado)
}

/**
 * Constructor de consultas de mentira: cualquier método encadenado (`select`, `eq`,
 * `order`, `limit`…) devuelve el mismo objeto, y el objeto es *thenable*, así que el
 * `await` final —venga de `.single()`, `.maybeSingle()` o del propio builder— resuelve
 * con el resultado programado para esa tabla.
 */
function builderPara(tabla: string): unknown {
  const resultado = respuestas.get(tabla) ?? { data: null, error: null }
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (
            resolve: (v: FakeResult) => unknown,
            reject: (e: unknown) => unknown
          ) => Promise.resolve(resultado).then(resolve, reject)
        }
        return () => builder
      },
    }
  )
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      tablasTocadas.push(tabla)
      return builderPara(tabla)
    },
  }),
}))

// Los servicios construyen su cliente leyendo estas dos variables y lanzan si faltan.
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  respuestas.clear()
  tablasTocadas.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Los errores reales que devuelve PostgREST cuando algo se rompe de verdad. */
const TIMEOUT_POOLER: DbErrorLike = { code: '57014', message: 'canceling statement due to statement timeout' }
const COLUMNA_INEXISTENTE: DbErrorLike = { code: '42703', message: 'column "location_id" does not exist' }
const RLS: DbErrorLike = { code: '42501', message: 'permission denied for schema auth' }
/** Y el que NO es un error: `.single()` diciendo "cero filas". */
const CERO_FILAS: DbErrorLike = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }

// ═══════════════════════════════════════════════════════════════
// 1. Los predicados: qué cuenta como fallo y qué no
// ═══════════════════════════════════════════════════════════════

describe('isDbFailure / isNoRows — la línea entre "falló" y "no hay"', () => {
  it('PGRST116 NO es un fallo: es un .single() diciendo «cero filas»', () => {
    // Si esto se contara como fallo, cada `if (!cliente)` legítimo del repo se
    // convertiría en un 503 y romperíamos justo lo que funcionaba.
    expect(isNoRows(CERO_FILAS)).toBe(true)
    expect(isDbFailure(CERO_FILAS)).toBe(false)
  })

  it('un timeout del pooler SÍ es un fallo', () => {
    expect(isDbFailure(TIMEOUT_POOLER)).toBe(true)
  })

  it('una columna que no existe SÍ es un fallo (el 42703 de una migración sin aplicar)', () => {
    // Escenario real: la 00044 añade `staff_users.location_id`. Si el código de F4 se
    // despliega ANTES que la migración, PostgREST responde 42703 a TODOS los meseros.
    expect(isDbFailure(COLUMNA_INEXISTENTE)).toBe(true)
  })

  it('un 42501 de RLS SÍ es un fallo', () => {
    expect(isDbFailure(RLS)).toBe(true)
  })

  it('sin error no hay fallo', () => {
    expect(isDbFailure(null)).toBe(false)
    expect(isNoRows(null)).toBe(false)
  })

  it('un error sin code sigue siendo un fallo (no todo trae código)', () => {
    expect(isDbFailure({ message: 'fetch failed' })).toBe(true)
  })
})

describe('logDbFailure — el formato que ya usa el repo', () => {
  it('escribe [Scope][FALLO] con reason, code y detalle', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logDbFailure({
      scope: 'StaffAuth',
      reason: 'staff_lookup_error',
      error: COLUMNA_INEXISTENTE,
      context: { tenant: 'sushi-service', staff_id: 'abc' },
    })
    const linea = spy.mock.calls[0][0] as string
    // El espejo del `[Delivery][FALLO] reason=… detalle="…"` de delivery.service.ts.
    expect(linea).toContain('[StaffAuth][FALLO]')
    expect(linea).toContain('reason=staff_lookup_error')
    expect(linea).toContain('code=42703')
    expect(linea).toContain('tenant=sushi-service')
    expect(linea).toContain('staff_id=abc')
  })

  it('omite el contexto vacío en vez de escribir «tenant=undefined»', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logDbFailure({ scope: 'X', reason: 'y', error: null, context: { a: null, b: undefined, c: '' } })
    const linea = spy.mock.calls[0][0] as string
    expect(linea).not.toContain('undefined')
    expect(linea).not.toContain('a=')
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. settings.service — el fallo que APAGABA la verificación por mesero
// ═══════════════════════════════════════════════════════════════

describe('getMultipleSettings — error ≠ vacío', () => {
  it('cero filas devuelve {} sin lanzar: una clave sin configurar es NORMAL', async () => {
    const { getMultipleSettings } = await import('@/services/settings.service')
    programar('admin_settings', { data: [], error: null })

    await expect(getMultipleSettings(['checkin_mode'], 'tenant-1')).resolves.toEqual({})
  })

  it('devuelve las claves que sí existen', async () => {
    const { getMultipleSettings } = await import('@/services/settings.service')
    programar('admin_settings', {
      data: [{ key: 'checkin_mode', value: 'staff_verified' }],
      error: null,
    })

    await expect(getMultipleSettings(['checkin_mode'], 'tenant-1')).resolves.toEqual({
      checkin_mode: 'staff_verified',
    })
  })

  it('un fallo de base LANZA en vez de devolver {} — antes apagaba `staff_verified`', async () => {
    // ÉSTE es el caso que importa. Con `{}`, `settings.checkin_mode ?? 'auto'` daba
    // 'auto' y el check-in dejaba de exigir mesero: el cliente se registraba solo, con
    // visita y con bono de bienvenida. El fraude que `staff_verified` existe para impedir,
    // desactivándose por un timeout y sin una sola línea de log.
    const { getMultipleSettings } = await import('@/services/settings.service')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    programar('admin_settings', { data: null, error: TIMEOUT_POOLER })

    await expect(getMultipleSettings(['checkin_mode'], 'tenant-1')).rejects.toThrow(/configuración/i)
  })

  it('el fallo queda registrado con su reason', async () => {
    const { getMultipleSettings } = await import('@/services/settings.service')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    programar('admin_settings', { data: null, error: RLS })

    await expect(getMultipleSettings(['x'], 't')).rejects.toThrow()
    expect(spy.mock.calls[0][0]).toContain('reason=settings_read_error')
  })
})

describe('getSettingValue — error ≠ clave sin configurar', () => {
  it('una clave que no está devuelve null, sin lanzar', async () => {
    const { getSettingValue } = await import('@/services/settings.service')
    programar('admin_settings', { data: null, error: null })

    await expect(getSettingValue('birthday_template_sid', 't')).resolves.toBeNull()
  })

  it('un fallo de base LANZA', async () => {
    const { getSettingValue } = await import('@/services/settings.service')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    programar('admin_settings', { data: null, error: COLUMNA_INEXISTENTE })

    await expect(getSettingValue('birthday_template_sid', 't')).rejects.toThrow(/configuración/i)
  })

  it('PGRST116 NO lanza: si alguien vuelve a .single(), «cero filas» sigue siendo null', async () => {
    // Red de seguridad del cambio a `.maybeSingle()`. Si un día se revierte, este caso
    // impide que "la clave no existe" se convierta en una excepción.
    const { getSettingValue } = await import('@/services/settings.service')
    programar('admin_settings', { data: null, error: CERO_FILAS })

    await expect(getSettingValue('cualquiera', 't')).resolves.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. resolveStaffAuth — el mesero rechazado como si su PIN fuera malo
// ═══════════════════════════════════════════════════════════════

describe('resolveStaffAuth — el tercer estado que faltaba', () => {
  const tenant = { id: 'tenant-1', slug: 'sushi-service' }

  async function autenticarConDispositivo(resultado: FakeResult) {
    const { resolveStaffAuth } = await import('@/lib/staff-auth')
    const { NextRequest } = await import('next/server')
    programar('staff_devices', resultado)
    const request = new NextRequest('http://localhost/api/staff/pending-rewards', {
      headers: { 'x-device-token': 'huella-del-aparato' },
    })
    // El tipo real es `Tenant`; aquí solo se leen `id` y `slug`.
    return resolveStaffAuth(request, tenant as Parameters<typeof resolveStaffAuth>[1])
  }

  it('dispositivo que NO existe → no válido, y NO es un fallo de base', async () => {
    const auth = await autenticarConDispositivo({ data: null, error: null })

    expect(auth.valid).toBe(false)
    expect(auth.dbFailure).toBe(false) // ← credencial mala de verdad: el 401 es correcto
  })

  it('dispositivo de confianza y vigente → válido', async () => {
    const auth = await autenticarConDispositivo({
      data: { id: 'dev-1', staff_user_id: 'mesero-9', is_trusted: true, expires_at: null },
      error: null,
    })

    expect(auth.valid).toBe(true)
    expect(auth.staffId).toBe('mesero-9')
    expect(auth.dbFailure).toBe(false)
  })

  it('LA PRUEBA: un fallo de base NO se ve igual que un dispositivo desconocido', async () => {
    // Antes de este arreglo, este caso y el de "dispositivo que no existe" devolvían
    // EXACTAMENTE lo mismo — `{ valid: false, staffId: null }` — y la ruta contestaba 401.
    // El mesero concluía que su tablet perdió la confianza y salía a buscar a un
    // supervisor, cuando lo único que había pasado es que la base tosió.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const auth = await autenticarConDispositivo({ data: null, error: TIMEOUT_POOLER })

    expect(auth.valid).toBe(false)
    expect(auth.dbFailure).toBe(true) // ← 503, no 401
  })

  it('el 42703 de una migración sin aplicar también marca dbFailure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const auth = await autenticarConDispositivo({ data: null, error: COLUMNA_INEXISTENTE })

    expect(auth.dbFailure).toBe(true)
  })

  it('el fallo se registra con contexto, no se traga', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await autenticarConDispositivo({ data: null, error: TIMEOUT_POOLER })

    const linea = spy.mock.calls[0][0] as string
    expect(linea).toContain('[StaffAuth][FALLO]')
    expect(linea).toContain('reason=device_lookup_error')
    expect(linea).toContain('tenant=sushi-service')
  })

  it('sin credenciales no se consulta la base y tampoco es un fallo', async () => {
    const { resolveStaffAuth } = await import('@/lib/staff-auth')
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost/api/staff/pending-rewards')

    const auth = await resolveStaffAuth(request, tenant as Parameters<typeof resolveStaffAuth>[1])

    expect(auth).toEqual({ valid: false, staffId: null, dbFailure: false })
    expect(tablasTocadas).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. La regresión que vigila el patrón entero
// ═══════════════════════════════════════════════════════════════

describe('la diferencia es observable, no solo el log', () => {
  it('vacío y fallo NO producen el mismo resultado en ninguna de las tres capas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getSettingValue } = await import('@/services/settings.service')

    // Capa 1: el predicado.
    expect(isDbFailure(CERO_FILAS)).not.toBe(isDbFailure(TIMEOUT_POOLER))

    // Capa 2: el servicio. Vacío resuelve, fallo lanza.
    programar('admin_settings', { data: null, error: null })
    const conVacio = await getSettingValue('k', 't').then(
      (v) => ({ tipo: 'resuelve' as const, v }),
      () => ({ tipo: 'lanza' as const, v: null })
    )
    programar('admin_settings', { data: null, error: TIMEOUT_POOLER })
    const conFallo = await getSettingValue('k', 't').then(
      (v) => ({ tipo: 'resuelve' as const, v }),
      () => ({ tipo: 'lanza' as const, v: null })
    )

    expect(conVacio.tipo).toBe('resuelve')
    expect(conFallo.tipo).toBe('lanza')
    expect(conVacio.tipo).not.toBe(conFallo.tipo)
  })
})
