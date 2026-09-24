/**
 * El saludo de cumpleaños sale DOS DÍAS ANTES (dueño, 2026-09-24).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * El corrimiento es una línea de aritmética de fechas, y la aritmética de fechas es
 * exactamente donde este cambio se rompe sin avisar: el 30 de enero + 2 no es el 32 de
 * enero, y el 30 de diciembre + 2 cambia de AÑO. Un fallo acá no da error: manda el
 * saludo al conjunto vacío y el cron responde `sent: 0, ok: true`, indistinguible de
 * «hoy no cumple nadie».
 *
 * Y hay una segunda trampa, que no se ve mirando `findBirthdayCustomers`: adelantar el
 * envío dos días ACORTA el hueco contra el saludo del año pasado a 363 días. La ventana
 * de deduplicación era de 365 — es decir, el primer año del cambio habría saltado a
 * TODO cliente saludado el año anterior, en silencio, y la campaña habría quedado muda
 * un año entero. De ahí `BIRTHDAY_DEDUPE_DAYS`, y de ahí el último test.
 *
 * ⚠️ Sin base de datos y sin red: el cliente de Supabase está sustituido por un doble.
 *
 * Ref: `docs/features/campaigns.md` § "Cron Cumpleaños"
 *      `src/constants/rewards.ts` → `BIRTHDAY_LEAD_DAYS`, `BIRTHDAY_DEDUPE_DAYS`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { findBirthdayCustomers } from '@/services/campaign.service'
import { BIRTHDAY_LEAD_DAYS, BIRTHDAY_DEDUPE_DAYS } from '@/constants/rewards'

// ═══════════════════════════════════════════════════════════════
// El doble del cliente de Supabase
// ═══════════════════════════════════════════════════════════════

/** Las filas que devolverá el SELECT. El filtro por mes y día ocurre en JS. */
let filas: Array<Record<string, unknown>> = []
/** Los `.eq(columna, valor)` de la última consulta: acá se comprueba el aislamiento. */
let filtros: Array<[string, unknown]> = []

function builder(): unknown {
  const b: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolver: (v: unknown) => unknown, rechazar: (e: unknown) => unknown) =>
            Promise.resolve({ data: filas, error: null }).then(resolver, rechazar)
        }
        if (prop === 'eq') {
          return (columna: string, valor: unknown) => {
            filtros.push([columna, valor])
            return b
          }
        }
        return () => b
      },
    }
  )
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => builder() }),
}))

const TENANT = '11111111-1111-1111-1111-111111111111'

/** Congela el reloj en una fecha LOCAL: el servicio lee `getMonth()`/`getDate()`. */
function hoyEs(anio: number, mes1a12: number, dia: number) {
  vi.setSystemTime(new Date(anio, mes1a12 - 1, dia, 13, 0, 0))
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  filas = []
  filtros = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// 1. Dos días antes, no el día mismo
// ═══════════════════════════════════════════════════════════════

describe('findBirthdayCustomers — anticipación', () => {
  it('elige a quien cumple pasado mañana y deja fuera a quien cumple hoy', async () => {
    hoyEs(2026, 3, 10)
    filas = [
      { id: 'hoy', birthday: '1990-03-10' },
      { id: 'manana', birthday: '1991-03-11' },
      { id: 'objetivo', birthday: '1992-03-12' },
      { id: 'pasado', birthday: '1993-03-13' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT)

    expect(elegidos.map(c => c.id)).toEqual(['objetivo'])
  })

  it('la consulta sigue acotada al tenant', async () => {
    hoyEs(2026, 3, 10)
    await findBirthdayCustomers(TENANT)

    expect(filtros).toContainEqual(['tenant_id', TENANT])
  })

  it('el año de nacimiento no interviene: solo mes y día', async () => {
    hoyEs(2026, 3, 10)
    filas = [
      { id: 'viejo', birthday: '1948-03-12' },
      { id: 'nuevo', birthday: '2024-03-12' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT)

    expect(elegidos.map(c => c.id).sort()).toEqual(['nuevo', 'viejo'])
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Los bordes donde la aritmética de fechas se rompe callada
// ═══════════════════════════════════════════════════════════════

describe('findBirthdayCustomers — bordes de calendario', () => {
  it('rueda al mes siguiente (30 de enero → 1 de febrero)', async () => {
    hoyEs(2026, 1, 30)
    filas = [
      { id: 'enero', birthday: '1990-01-30' },
      { id: 'febrero', birthday: '1990-02-01' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT)

    expect(elegidos.map(c => c.id)).toEqual(['febrero'])
  })

  it('rueda al año siguiente (30 de diciembre → 1 de enero)', async () => {
    hoyEs(2026, 12, 30)
    filas = [
      { id: 'diciembre', birthday: '1990-12-30' },
      { id: 'enero', birthday: '1990-01-01' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT)

    expect(elegidos.map(c => c.id)).toEqual(['enero'])
  })

  it('el 29 de febrero se saluda en año bisiesto (27 de febrero de 2028)', async () => {
    hoyEs(2028, 2, 27)
    filas = [{ id: 'bisiesto', birthday: '2000-02-29' }]

    const elegidos = await findBirthdayCustomers(TENANT)

    expect(elegidos.map(c => c.id)).toEqual(['bisiesto'])
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. La ventana de dedup tiene que caber en el hueco acortado
// ═══════════════════════════════════════════════════════════════

describe('BIRTHDAY_DEDUPE_DAYS', () => {
  it('es menor que el hueco del año de transición (365 − BIRTHDAY_LEAD_DAYS)', () => {
    // El año en que la anticipación pasa de 0 a BIRTHDAY_LEAD_DAYS, el saludo cae
    // ese número de días antes que el del año pasado. Si la ventana llega hasta ahí,
    // el cron toma a todo el mundo por «ya saludado» y no manda nada, sin error.
    expect(BIRTHDAY_DEDUPE_DAYS).toBeLessThan(365 - BIRTHDAY_LEAD_DAYS)
  })

  it('sigue siendo larga: un segundo saludo en el mismo año queda bloqueado', () => {
    expect(BIRTHDAY_DEDUPE_DAYS).toBeGreaterThan(300)
  })
})
