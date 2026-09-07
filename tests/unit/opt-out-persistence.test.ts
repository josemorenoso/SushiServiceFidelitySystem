/**
 * El opt-out que decía «persistido» sin haber persistido nada.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * El 2026-09-06 los logs de producción decían, cuatro veces seguidas:
 *
 *     [twilio-incoming] opt-out persistido para 3243416918 (keyword="CANCEL")
 *
 * ...y el panel del dueño seguía en cero. Las dos cosas eran ciertas a la vez, porque
 * el escritor devolvía `void`:
 *
 *     const { error } = await supabase.from('customers').update({…}).eq('phone', …)
 *     if (error) console.error(…)          // no hubo error
 *     // y aquí el llamador loguea "persistido"
 *
 * Un `UPDATE … WHERE phone = $1 AND tenant_id = $2` que **no encuentra a nadie** es un
 * éxito para Postgres: cero filas, `error = null`. Con `void` de retorno, "marqué a un
 * cliente" y "no había a quién marcar" llegaban al llamador como exactamente lo mismo.
 * El log no estaba mal escrito: no tenía forma de saber la verdad.
 *
 * LO QUE SE PRUEBA AQUÍ NO ES QUE ESCRIBA — ES QUE SEPA CUÁNTO ESCRIBIÓ
 * ────────────────────────────────────────────────────────────────────
 * Los tres desenlaces tienen que ser DISTINGUIBLES entre sí:
 *
 *   · `{ ok: false }`            → la base falló; el cliente sigue recibiendo.
 *   · `{ ok: true, matched: 0 }` → ese teléfono no tiene ficha en ESTE tenant.
 *   · `{ ok: true, matched: n }` → n filas marcadas; esto sí sale en el panel.
 *
 * Si alguien vuelve a colapsar los tres en uno —quitando el `.select('id')`, o volviendo
 * a `Promise<void>`— estas pruebas se ponen rojas. Ése es todo el objetivo.
 *
 * ⚠️ Sin base de datos y sin red: el cliente de Supabase está sustituido por un doble.
 *
 * Ref: `docs/features/twilio-opt-out.md` § "El log que mentía"
 *      `src/services/customer.service.ts` → `OptOutWriteResult`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setWhatsappOptOut, clearWhatsappOptOut } from '@/services/customer.service'
import type { DbErrorLike } from '@/lib/db-failure'

// ═══════════════════════════════════════════════════════════════
// El doble del cliente de Supabase
// ═══════════════════════════════════════════════════════════════

/** Lo que quedó registrado de la consulta que el servicio construyó. */
interface ConsultaVista {
  tabla: string
  /** El objeto que se le pasó a `.update(...)`. */
  payload: Record<string, unknown>
  /** Los `.eq(columna, valor)` en orden. Aquí se comprueba el aislamiento por tenant. */
  filtros: Array<[string, unknown]>
  /** Las columnas de `.select(...)`, o `null` si nunca se encadenó. */
  seleccion: string | null
}

/** Lo que resolverá el próximo `await` sobre el builder. */
let respuesta: { data: unknown; error: DbErrorLike | null } = { data: [], error: null }
/** Todas las consultas que se construyeron, en orden. */
let consultas: ConsultaVista[] = []

/**
 * Constructor de consultas de mentira. Cualquier método encadenado devuelve el mismo
 * objeto, y el objeto es *thenable*, así que el `await` final resuelve con `respuesta`.
 * A diferencia del doble de `db-failure.test.ts`, éste **anota** lo que se le pidió:
 * el payload, los filtros y si hubo o no `.select()`. Sin eso no se puede probar que el
 * UPDATE va acotado al tenant ni que `matched` tiene de dónde salir.
 */
function builderPara(tabla: string): unknown {
  const vista: ConsultaVista = { tabla, payload: {}, filtros: [], seleccion: null }
  consultas.push(vista)

  const builder: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (
            resolver: (v: typeof respuesta) => unknown,
            rechazar: (e: unknown) => unknown
          ) => Promise.resolve(respuesta).then(resolver, rechazar)
        }
        if (prop === 'update') {
          return (payload: Record<string, unknown>) => {
            vista.payload = payload
            return builder
          }
        }
        if (prop === 'eq') {
          return (columna: string, valor: unknown) => {
            vista.filtros.push([columna, valor])
            return builder
          }
        }
        if (prop === 'select') {
          return (columnas?: string) => {
            vista.seleccion = columnas ?? '*'
            return builder
          }
        }
        return () => builder
      },
    }
  )
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => builderPara(tabla) }),
}))

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTRO_TENANT = '22222222-2222-2222-2222-222222222222'

/** El error real que devuelve PostgREST cuando el pooler se queda sin aire. */
const TIMEOUT_POOLER: DbErrorLike = {
  code: '57014',
  message: 'canceling statement due to statement timeout',
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  respuesta = { data: [], error: null }
  consultas = []
  // El servicio loguea sus fallos por `logDbFailure()`; aquí solo estorbarían.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// 1. Los tres desenlaces, y que sean distinguibles
// ═══════════════════════════════════════════════════════════════

describe('setWhatsappOptOut — «lo marqué» y «no había a quién marcar» no son lo mismo', () => {
  it('marcó un cliente: matched = 1', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }

    const resultado = await setWhatsappOptOut('3001234567', TENANT)

    expect(resultado).toEqual({ ok: true, matched: 1 })
  })

  it('EL CASO QUE MENTÍA: cero filas y sin error → matched = 0, NO un éxito a secas', async () => {
    // Esto es exactamente lo que pasó en producción: el teléfono no tenía ficha en ese
    // tenant. Postgres lo considera un UPDATE correcto y `error` viene null. Antes el
    // llamador recibía `undefined` en los dos casos y logueaba «persistido» igual.
    respuesta = { data: [], error: null }

    const resultado = await setWhatsappOptOut('3243416918', TENANT)

    expect(resultado).toEqual({ ok: true, matched: 0 })
    // La prueba de verdad es esta: el caso de arriba y el de aquí NO coinciden.
    respuesta = { data: [{ id: 'c-1' }], error: null }
    expect(await setWhatsappOptOut('3243416918', TENANT)).not.toEqual(resultado)
  })

  it('la base falló: ok = false, y eso tampoco se confunde con matched = 0', async () => {
    respuesta = { data: null, error: TIMEOUT_POOLER }

    const resultado = await setWhatsappOptOut('3001234567', TENANT)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('statement timeout')
  })

  it('sigue siendo best-effort: no lanza ni cuando faltan las variables de entorno', async () => {
    // `getServiceClient()` sí lanza. El contrato de estas dos funciones es que el fallo
    // viaje en el valor de retorno, porque el llamador es un webhook que debe responder
    // 200 igual (si no, Twilio y Zernio reintentan la entrega).
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const resultado = await setWhatsappOptOut('3001234567', TENANT)

    expect(resultado.ok).toBe(false)
  })
})

describe('clearWhatsappOptOut — el mismo contrato al revés', () => {
  it('reactivó un cliente: matched = 1', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }
    expect(await clearWhatsappOptOut('3001234567', TENANT)).toEqual({ ok: true, matched: 1 })
  })

  it('nadie a quien reactivar: matched = 0', async () => {
    respuesta = { data: [], error: null }
    expect(await clearWhatsappOptOut('3001234567', TENANT)).toEqual({ ok: true, matched: 0 })
  })

  it('la base falló: ok = false', async () => {
    respuesta = { data: null, error: TIMEOUT_POOLER }
    expect((await clearWhatsappOptOut('3001234567', TENANT)).ok).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. De dónde sale `matched` — el `.select()` que parece decoración
// ═══════════════════════════════════════════════════════════════

describe('el UPDATE encadena .select(): sin él no hay forma de contar filas', () => {
  it('setWhatsappOptOut pide las filas afectadas', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }
    await setWhatsappOptOut('3001234567', TENANT)

    // Sin `.select()`, supabase-js manda `Prefer: return=minimal` y la respuesta no
    // trae nada que contar: `matched` volvería a ser siempre 0 y el log volvería a mentir.
    expect(consultas[0].seleccion).toBe('id')
  })

  it('clearWhatsappOptOut también', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }
    await clearWhatsappOptOut('3001234567', TENANT)
    expect(consultas[0].seleccion).toBe('id')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Aislamiento de marca — un opt-out de A no toca a B
// ═══════════════════════════════════════════════════════════════

describe('el UPDATE va acotado al tenant y al teléfono normalizado', () => {
  it('filtra por phone Y por tenant_id, siempre los dos', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }
    await setWhatsappOptOut('3001234567', TENANT)

    const filtros = Object.fromEntries(consultas[0].filtros)
    expect(consultas[0].tabla).toBe('customers')
    expect(filtros.phone).toBe('3001234567')
    expect(filtros.tenant_id).toBe(TENANT)
  })

  it('normaliza el remitente de WhatsApp a los 10 dígitos de customers.phone', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }
    await setWhatsappOptOut('whatsapp:+57 300 123 4567', TENANT)

    expect(Object.fromEntries(consultas[0].filtros).phone).toBe('3001234567')
  })

  it('el tenant que se le pasa es el que va al WHERE, sin fallback ni default', async () => {
    // El DEFAULT puente de la 00028 sigue vivo (la 00030 nunca se aplicó): cualquier
    // escritura que se quede sin `tenant_id` se va callada a Sushi Service. Aquí el
    // filtro es explícito y por eso un opt-out de la marca A no puede tocar a la B.
    respuesta = { data: [], error: null }
    await setWhatsappOptOut('3001234567', OTRO_TENANT)

    expect(Object.fromEntries(consultas[0].filtros).tenant_id).toBe(OTRO_TENANT)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Qué se escribe en la fila
// ═══════════════════════════════════════════════════════════════

describe('el payload del UPDATE', () => {
  it('salir sella la fecha y apaga accepts_marketing', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }
    await setWhatsappOptOut('3001234567', TENANT)

    const { payload } = consultas[0]
    // `whatsapp_opt_out_at` es la columna que lee `isPhoneOptedOut()` antes de cada
    // envío Y la que lista `/api/dashboard/opt-outs`: escribir una sin la otra dejaría
    // el panel y el envío contando cosas distintas.
    expect(typeof payload.whatsapp_opt_out_at).toBe('string')
    expect(Number.isNaN(Date.parse(payload.whatsapp_opt_out_at as string))).toBe(false)
    expect(payload.accepts_marketing).toBe(false)
  })

  it('volver limpia la fecha y reactiva accepts_marketing', async () => {
    respuesta = { data: [{ id: 'c-1' }], error: null }
    await clearWhatsappOptOut('3001234567', TENANT)

    expect(consultas[0].payload).toEqual({
      whatsapp_opt_out_at: null,
      accepts_marketing: true,
    })
  })

  it('ni salir ni volver tocan puntos, visitas ni historial', async () => {
    // Es lo que el panel le promete al dueño y lo que la confirmación por WhatsApp le
    // promete al cliente: salir es dejar de recibir mensajes, no perder el progreso.
    respuesta = { data: [{ id: 'c-1' }], error: null }
    await setWhatsappOptOut('3001234567', TENANT)
    await clearWhatsappOptOut('3001234567', TENANT)

    const prohibidas = ['total_points', 'total_visits', 'current_tier', 'last_visit_at']
    for (const consulta of consultas) {
      for (const columna of prohibidas) {
        expect(Object.keys(consulta.payload)).not.toContain(columna)
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. La confirmación al cliente: Twilio sí, Zernio no
// ═══════════════════════════════════════════════════════════════

/**
 * Al cliente que escribe SALIR hay que contestarle algo — antes no se le contestaba
 * nada y no sabía si había servido. Por Twilio se puede: el webhook devuelve TwiML en la
 * misma petición, texto libre dentro de la ventana de atención de 24 h que abrió él
 * mismo, y es el mecanismo que esa ruta YA usa con el mesero y con el comensal.
 *
 * Por Zernio **no existe la posibilidad**: el webhook solo devuelve un 2xx sin cuerpo y
 * la única salida del módulo de mensajería manda PLANTILLAS APROBADAS. Estas dos pruebas
 * clavan esa asimetría para que nadie "empareje" los dos webhooks abriendo texto libre
 * por un canal donde está prohibido.
 */
function fuente(rutaRelativa: string): string {
  return readFileSync(resolve(process.cwd(), rutaRelativa), 'utf8')
}

describe('la confirmación de salida sale por TwiML, y solo por TwiML', () => {
  it('el webhook de Twilio le contesta al cliente que pidió salir', () => {
    const src = fuente('src/app/api/webhook/twilio-incoming/route.ts')

    // Que exista el constructor del texto y que la rama de opt-out responda con él.
    expect(src).toContain('function buildOptOutReply(')
    expect(src).toMatch(/OPT_OUT_KEYWORDS\.includes\(upper\)[\s\S]*?twimlResponse\(buildOptOutReply\(/)
  })

  it('el módulo de Zernio sigue sin poder mandar texto libre', () => {
    const src = fuente('src/lib/zernio/messaging.ts')

    // Si algún día aparece un envío de texto libre por Zernio, esta prueba se cae: no es
    // para prohibirlo para siempre, es para que quien lo agregue lea por qué el opt-out
    // de Zernio se quedó mudo y decida a conciencia (haría falta plantilla aprobada).
    expect(src).toContain('export async function sendZernioTemplateMessage')
    const enviosLibres = [...src.matchAll(/export async function (\w+)/g)]
      .map((m) => m[1])
      .filter((nombre) => /text|free|plain|session|reply/i.test(nombre))
    expect(enviosLibres).toEqual([])
  })
})
