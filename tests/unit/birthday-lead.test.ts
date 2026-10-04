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
import {
  findBirthdayCustomers,
  elegirPlantillaDeCumpleanos,
  diasDeLaVentanaDeCumpleanos,
} from '@/services/campaign.service'
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
  it('con la plantilla nueva: la VENTANA de hoy a pasado mañana, y nada fuera de ella', async () => {
    // Una ventana y no un día exacto (2026-10-04): el día que una marca pasa de la
    // plantilla vieja (el día mismo) a la nueva, quien cumple hoy o mañana no se queda
    // sin saludo. Los días siguientes la dedup impide repetirlo.
    hoyEs(2026, 3, 10)
    filas = [
      { id: 'ayer', birthday: '1989-03-09' },
      { id: 'hoy', birthday: '1990-03-10' },
      { id: 'manana', birthday: '1991-03-11' },
      { id: 'objetivo', birthday: '1992-03-12' },
      { id: 'pasado', birthday: '1993-03-13' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT, BIRTHDAY_LEAD_DAYS)

    expect(elegidos.map(c => c.id)).toEqual(['hoy', 'manana', 'objetivo'])
  })

  it('con la plantilla vieja (0 días): solo quien cumple hoy, exactamente como siempre', async () => {
    hoyEs(2026, 3, 10)
    filas = [
      { id: 'hoy', birthday: '1990-03-10' },
      { id: 'manana', birthday: '1991-03-11' },
      { id: 'objetivo', birthday: '1992-03-12' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT, 0)

    expect(elegidos.map(c => c.id)).toEqual(['hoy'])
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
      { id: 'enero-29', birthday: '1990-01-29' },
      { id: 'enero-31', birthday: '1990-01-31' },
      { id: 'febrero', birthday: '1990-02-01' },
      { id: 'febrero-2', birthday: '1990-02-02' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT)

    expect(elegidos.map(c => c.id)).toEqual(['enero-31', 'febrero'])
  })

  it('rueda al año siguiente (30 de diciembre → 1 de enero)', async () => {
    hoyEs(2026, 12, 30)
    filas = [
      { id: 'diciembre-31', birthday: '1990-12-31' },
      { id: 'enero', birthday: '1990-01-01' },
      { id: 'enero-2', birthday: '1990-01-02' },
    ]

    const elegidos = await findBirthdayCustomers(TENANT)

    expect(elegidos.map(c => c.id)).toEqual(['diciembre-31', 'enero'])
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

describe('diasDeLaVentanaDeCumpleanos', () => {
  it('cuenta hoy y los días de anticipación, ambos incluidos', () => {
    expect([...diasDeLaVentanaDeCumpleanos(new Date(2026, 2, 10), 2)]).toEqual(['03-10', '03-11', '03-12'])
    expect([...diasDeLaVentanaDeCumpleanos(new Date(2026, 2, 10), 0)]).toEqual(['03-10'])
  })

  it('el 29 de febrero solo existe en año bisiesto', () => {
    expect(diasDeLaVentanaDeCumpleanos(new Date(2027, 1, 27), 2).has('02-29')).toBe(false)
    expect(diasDeLaVentanaDeCumpleanos(new Date(2028, 1, 27), 2).has('02-29')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3-bis. Qué plantilla, y con cuánta anticipación (2026-10-04)
// ═══════════════════════════════════════════════════════════════

describe('elegirPlantillaDeCumpleanos — nadie recibe «¡Feliz cumpleaños!» dos días antes', () => {
  it('con la nueva APROBADA: la nueva, con BIRTHDAY_LEAD_DAYS de anticipación', () => {
    expect(elegirPlantillaDeCumpleanos({ nueva: 'HX_nueva', nuevaAprobada: true, vieja: 'HX_vieja' })).toEqual({
      sid: 'HX_nueva',
      diasDeAnticipacion: BIRTHDAY_LEAD_DAYS,
      cual: 'se_acerca',
    })
  })

  it('con la nueva EN REVISIÓN: la vieja, el día mismo (lo de siempre)', () => {
    expect(elegirPlantillaDeCumpleanos({ nueva: 'HX_nueva', nuevaAprobada: false, vieja: 'HX_vieja' })).toEqual({
      sid: 'HX_vieja',
      diasDeAnticipacion: 0,
      cual: 'el_dia',
    })
  })

  it('la vieja NUNCA sale con anticipación', () => {
    const r = elegirPlantillaDeCumpleanos({ nueva: null, nuevaAprobada: false, vieja: 'HX_vieja' })
    expect(r?.diasDeAnticipacion).toBe(0)
  })

  it('una marca nueva solo con la nueva aprobada la usa; sin ninguna, no hay saludo', () => {
    expect(elegirPlantillaDeCumpleanos({ nueva: 'cumpleanos_se_acerca', nuevaAprobada: true, vieja: null })?.cual).toBe(
      'se_acerca'
    )
    expect(elegirPlantillaDeCumpleanos({ nueva: 'HX_nueva', nuevaAprobada: false, vieja: null })).toBeNull()
    expect(elegirPlantillaDeCumpleanos({ nueva: null, nuevaAprobada: false, vieja: null })).toBeNull()
  })
})

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
