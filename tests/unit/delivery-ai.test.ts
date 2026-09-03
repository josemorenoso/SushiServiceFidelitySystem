/**
 * El parseo de domicilios con IA — Fase 2 de §25.
 *
 * Lo que se prueba aquí es lo que hasta el 2026-09-03 vivía en el nodo «Parsear Respuesta
 * IA» de `n8n/domicilios_whatsapp_v4.json` y **no tenía ni una prueba**: estaba probado
 * "en producción", que es otra forma de decir que se descubría roto con un pedido real.
 *
 * ⚠️ NINGÚN TEST DE ESTE ARCHIVO LLAMA A LA API DE OPENAI. `extractDeliveryOrder()`
 * recibe la llamada al modelo por parámetro (`complete`) justo para esto: la costura
 * existe para las pruebas, no para producción, donde el default es la llamada real.
 *
 * Los cuatro casos que pidió el encargo, más los bordes que el nodo de n8n ya manejaba y
 * que se replicaron: mensaje real que sí parsea · celular inválido · JSON con backticks ·
 * IA que devuelve basura.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  DeliveryExtractionError,
  extractDeliveryOrder,
  parseDeliveryAiJson,
  type DeliveryCompletion,
} from '@/services/delivery-ai.service'
import { buildDeliveryExtractionPrompt } from '@/constants/delivery-ai'
import { logDeliveryIntakeFailure, processDeliveryMessage } from '@/services/delivery.service'
import type { Tenant } from '@/types/tenant.types'

/** Respuesta típica del modelo para un pedido bien escrito. */
const JSON_OK = JSON.stringify({
  nombre_cliente: 'Juan Pérez',
  celular: '3009876543',
  direccion: 'Cra 43A #1-50',
  metodo_pago: 'nequi',
  monto_total: 45000,
  ciudad: 'Envigado',
})

/** Una `complete` de mentira que devuelve siempre lo mismo. */
function completaCon(contenido: string): DeliveryCompletion {
  return async () => contenido
}

describe('parseDeliveryAiJson — el nodo «Parsear Respuesta IA», sin red', () => {
  it('extrae los seis campos de un pedido real', () => {
    const pedido = parseDeliveryAiJson(JSON_OK)

    expect(pedido).toEqual({
      nombre_cliente: 'Juan Pérez',
      celular: '3009876543',
      direccion: 'Cra 43A #1-50',
      metodo_pago: 'nequi',
      monto_total: 45000,
      ciudad: 'Envigado',
    })
  })

  it('limpia el bloque markdown cuando la IA envuelve el JSON en backticks', () => {
    const conBackticks = '```json\n' + JSON_OK + '\n```'

    // Sin el `.replace(/```json\n?/g,'')` esto moriría en el JSON.parse. Es el caso que
    // motivó la limpieza en n8n.
    expect(parseDeliveryAiJson(conBackticks).celular).toBe('3009876543')
  })

  it('limpia también los backticks pelados, sin la etiqueta json', () => {
    expect(parseDeliveryAiJson('```\n' + JSON_OK + '\n```').celular).toBe('3009876543')
  })

  it('rechaza un celular que no cumple ^3\\d{9}$ y dice cuál extrajo la IA', () => {
    const basura = JSON.stringify({ nombre_cliente: 'Ana', celular: '12345' })

    let error: unknown
    try {
      parseDeliveryAiJson(basura)
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(DeliveryExtractionError)
    expect((error as DeliveryExtractionError).reason).toBe('celular_invalido')
    // El motivo REAL, no un "error de parseo" genérico: se puede leer del log qué
    // entendió la IA. §24: un domicilio no se pierde en silencio.
    expect((error as DeliveryExtractionError).detail).toContain('12345')
  })

  it('rechaza un fijo de Bogotá: 10 dígitos pero no empieza con 3', () => {
    const fijo = JSON.stringify({ celular: '6015551234' })

    expect(() => parseDeliveryAiJson(fijo)).toThrowError(DeliveryExtractionError)
  })

  it('normaliza +57, espacios y guiones antes de validar', () => {
    const conPrefijo = JSON.stringify({ celular: '+57 300-987 6543' })

    expect(parseDeliveryAiJson(conPrefijo).celular).toBe('3009876543')
  })

  it('quita el 0 inicial que a veces mete la IA', () => {
    expect(parseDeliveryAiJson(JSON.stringify({ celular: '03009876543' })).celular).toBe('3009876543')
  })

  it('cuando la IA devuelve basura que no es JSON, el motivo es json_invalido y trae el texto', () => {
    const basura = 'Claro, con gusto: el cliente se llama Juan y su número es 3009876543.'

    let error: unknown
    try {
      parseDeliveryAiJson(basura)
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(DeliveryExtractionError)
    expect((error as DeliveryExtractionError).reason).toBe('json_invalido')
    expect((error as DeliveryExtractionError).detail).toContain('Claro, con gusto')
  })

  it('un JSON válido que no es un objeto tampoco pasa', () => {
    // `JSON.parse('42')` no lanza: sin la guarda esto seguiría hasta el celular y
    // reportaría el motivo equivocado.
    let error: unknown
    try {
      parseDeliveryAiJson('42')
    } catch (err) {
      error = err
    }
    expect((error as DeliveryExtractionError).reason).toBe('json_invalido')
  })

  it('un array tampoco es un pedido', () => {
    expect(() => parseDeliveryAiJson('[{"celular":"3009876543"}]')).toThrowError(
      DeliveryExtractionError
    )
  })

  it('el nombre cae a "Cliente Domicilio" cuando la IA no encuentra uno', () => {
    const sinNombre = JSON.stringify({ celular: '3009876543', nombre_cliente: null })

    expect(parseDeliveryAiJson(sinNombre).nombre_cliente).toBe('Cliente Domicilio')
  })

  it('los campos opcionales vacíos colapsan a null, no a ""', () => {
    const pedido = parseDeliveryAiJson(
      JSON.stringify({ celular: '3009876543', direccion: '', metodo_pago: null })
    )

    expect(pedido.direccion).toBeNull()
    expect(pedido.metodo_pago).toBeNull()
  })

  describe('monto_total', () => {
    it('respeta un número tal cual', () => {
      expect(parseDeliveryAiJson(JSON.stringify({ celular: '3009876543', monto_total: 45000 })).monto_total).toBe(45000)
    })

    it('limpia el $ y los separadores de un string', () => {
      expect(
        parseDeliveryAiJson(JSON.stringify({ celular: '3009876543', monto_total: '$ 45 000' })).monto_total
      ).toBe(45000)
    })

    it('null cuando no hay nada que interpretar', () => {
      expect(
        parseDeliveryAiJson(JSON.stringify({ celular: '3009876543', monto_total: 'no dijo' })).monto_total
      ).toBeNull()
    })

    it('ausente es null, no 0 (0 sería un pedido gratis)', () => {
      expect(parseDeliveryAiJson(JSON.stringify({ celular: '3009876543' })).monto_total).toBeNull()
    })
  })

  describe('ciudad — el default ya NO está horneado', () => {
    it('usa la ciudad que devolvió la IA', () => {
      expect(parseDeliveryAiJson(JSON.stringify({ celular: '3009876543', ciudad: 'Sabaneta' })).ciudad).toBe('Sabaneta')
    })

    it('sin ciudad y con default de la marca, usa el default', () => {
      expect(parseDeliveryAiJson(JSON.stringify({ celular: '3009876543' }), 'Envigado').ciudad).toBe('Envigado')
    })

    it('sin ciudad y SIN default, queda null — no se le inventa Envigado a otra marca', () => {
      // El prompt de n8n terminaba en «Por defecto: Envigado». Horneado en el producto le
      // escribiría esa ciudad en customers.city a los clientes de los 25 tenants.
      expect(parseDeliveryAiJson(JSON.stringify({ celular: '3009876543' })).ciudad).toBeNull()
    })
  })
})

describe('buildDeliveryExtractionPrompt', () => {
  it('sin ciudad de la marca, le prohíbe a la IA inventarse una', () => {
    const prompt = buildDeliveryExtractionPrompt(null)

    expect(prompt).toContain('NO inventes una ciudad')
    expect(prompt).not.toContain('Envigado')
  })

  it('con ciudad de la marca, la usa como default', () => {
    const prompt = buildDeliveryExtractionPrompt('Envigado')

    expect(prompt).toContain('Por defecto: Envigado')
    expect(prompt).not.toContain('NO inventes una ciudad')
  })

  it('conserva el contrato de campos del prompt que corre en n8n', () => {
    const prompt = buildDeliveryExtractionPrompt('Envigado')

    // Los seis campos son los que registerDeliveryOrder() escribe en customers/visits.
    for (const campo of ['nombre_cliente', 'celular', 'direccion', 'metodo_pago', 'monto_total', 'ciudad']) {
      expect(prompt).toContain(campo)
    }
    expect(prompt).toContain('El celular es OBLIGATORIO')
  })
})

describe('extractDeliveryOrder — con OpenAI mockeado, nunca real', () => {
  it('le pasa al modelo el mensaje del operador y el prompt de la marca', async () => {
    const complete = vi.fn<DeliveryCompletion>(async () => JSON_OK)

    const pedido = await extractDeliveryOrder({
      message: 'pedido de Juan 3009876543 cra 43a #1-50 nequi 45mil',
      cityHint: 'Envigado',
      complete,
    })

    expect(pedido.celular).toBe('3009876543')
    expect(complete).toHaveBeenCalledTimes(1)
    const args = complete.mock.calls[0][0]
    expect(args.user).toBe('pedido de Juan 3009876543 cra 43a #1-50 nequi 45mil')
    expect(args.system).toContain('Por defecto: Envigado')
  })

  it('un mensaje vacío no llega siquiera a gastar una llamada al modelo', async () => {
    const complete = vi.fn<DeliveryCompletion>(async () => JSON_OK)

    await expect(extractDeliveryOrder({ message: '   ', complete })).rejects.toMatchObject({
      reason: 'mensaje_vacio',
    })
    expect(complete).not.toHaveBeenCalled()
  })

  it('si el modelo devuelve vacío, el motivo es ia_sin_respuesta', async () => {
    await expect(
      extractDeliveryOrder({ message: 'pedido', complete: completaCon('') })
    ).rejects.toMatchObject({ reason: 'ia_sin_respuesta' })
  })

  it('un error de red de OpenAI se convierte en ia_error con el mensaje real', async () => {
    const complete: DeliveryCompletion = async () => {
      throw new Error('Connection error.')
    }

    let error: unknown
    try {
      await extractDeliveryOrder({ message: 'pedido', complete })
    } catch (err) {
      error = err
    }

    expect((error as DeliveryExtractionError).reason).toBe('ia_error')
    expect((error as DeliveryExtractionError).detail).toBe('Connection error.')
  })

  it('propaga el motivo del parseo cuando la IA responde basura', async () => {
    await expect(
      extractDeliveryOrder({ message: 'pedido', complete: completaCon('lo siento, no entiendo') })
    ).rejects.toMatchObject({ reason: 'json_invalido' })
  })

  it('la ciudad de la marca también rellena cuando la IA no la devuelve', async () => {
    const pedido = await extractDeliveryOrder({
      message: 'pedido de Ana 3001112233',
      cityHint: 'Medellín',
      complete: completaCon(JSON.stringify({ celular: '3001112233', nombre_cliente: 'Ana' })),
    })

    expect(pedido.ciudad).toBe('Medellín')
  })
})

describe('processDeliveryMessage — el contrato de "no se pierde en silencio"', () => {
  /**
   * Tenant de mentira. Estas pruebas cubren SOLO los caminos en los que la extracción
   * falla, que cortan ANTES de tocar la base: por eso no hace falta Postgres ni mockear
   * supabase-js. El camino feliz escribe cliente + visita + puntos y se prueba end-to-end
   * contra el flujo real, no aquí.
   */
  const tenant = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'marca-de-prueba',
    name: 'Marca de Prueba',
    config: { brand_name: 'Marca de Prueba' },
  } as Tenant

  it('devuelve ok:false con el motivo real en vez de lanzar', async () => {
    const resultado = await processDeliveryMessage({
      tenant,
      rawMessage: 'pedido de alguien',
      operatorPhone: '3001112233',
      operatorLocationId: null,
      complete: completaCon('esto no es json'),
    })

    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('inalcanzable')
    expect(resultado.reason).toBe('json_invalido')
    expect(resultado.detail).toContain('esto no es json')
  })

  it('deja el fallo en el log con el prefijo estable [Delivery][FALLO]', async () => {
    // Ese prefijo es sobre lo que se monta una alerta en Vercel sin tocar código: si
    // alguien lo cambia, la alerta deja de dispararse en silencio.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let lineas: string[] = []
    try {
      await processDeliveryMessage({
        tenant,
        rawMessage: 'pedido sin numero',
        operatorPhone: '3001112233',
        operatorLocationId: null,
        complete: completaCon(JSON.stringify({ celular: 'no hay' })),
      })
      // Leer las llamadas ANTES de restaurar: mockRestore() también limpia mock.calls.
      lineas = spy.mock.calls.map((c) => String(c[0]))
    } finally {
      spy.mockRestore()
    }

    const linea = lineas.find((l) => l.includes('[Delivery][FALLO]'))
    expect(linea).toBeDefined()
    expect(linea).toContain('reason=celular_invalido')
    expect(linea).toContain('tenant=marca-de-prueba')
    expect(linea).toContain('operador=3001112233')
    // El mensaje original queda en el log: sin él, "no se pudo parsear" es inútil.
    expect(linea).toContain('pedido sin numero')
  })

  it('un mensaje vacío falla ruidosamente y no llega al modelo', async () => {
    const complete = vi.fn<DeliveryCompletion>(async () => JSON_OK)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const resultado = await processDeliveryMessage({
        tenant,
        rawMessage: '',
        operatorPhone: '3001112233',
        operatorLocationId: null,
        complete,
      })
      expect(resultado).toMatchObject({ ok: false, reason: 'mensaje_vacio' })
    } finally {
      spy.mockRestore()
    }
    expect(complete).not.toHaveBeenCalled()
  })
})

describe('logDeliveryIntakeFailure — el embudo que usan también las rutas', () => {
  const tenant = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'marca-de-prueba',
    name: 'Marca de Prueba',
    config: { brand_name: 'Marca de Prueba' },
  } as Tenant

  /**
   * `remitente_no_verificable` es el único fallo que ocurre ANTES de
   * `processDeliveryMessage()`: la consulta a `authorized_numbers` se cae y no se sabe si
   * el remitente era un operador. supabase-js **no lanza** — devuelve `{ data: null,
   * error }` — así que quien solo lea `data` ve un `null` idéntico al de «no es un
   * operador» y pierde el pedido sin una línea de log. Esta prueba fija que las rutas
   * reportan ese caso por el MISMO embudo, con el MISMO prefijo.
   */
  it('deja la línea [Delivery][FALLO] para remitente_no_verificable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let lineas: string[] = []
    try {
      logDeliveryIntakeFailure({
        tenant,
        operatorPhone: '3001112233',
        reason: 'remitente_no_verificable',
        detail: 'canceling statement due to statement timeout',
        rawMessage: 'pedido de Juan 3009876543',
      })
      lineas = spy.mock.calls.map((c) => String(c[0]))
    } finally {
      spy.mockRestore()
    }

    const linea = lineas.find((l) => l.includes('[Delivery][FALLO]'))
    expect(linea).toBeDefined()
    expect(linea).toContain('reason=remitente_no_verificable')
    expect(linea).toContain('tenant=marca-de-prueba')
    expect(linea).toContain('statement timeout')
    expect(linea).toContain('pedido de Juan 3009876543')
  })

  it('recorta el mensaje original a 300 caracteres para no inundar el log', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let linea = ''
    try {
      logDeliveryIntakeFailure({
        tenant,
        operatorPhone: null,
        reason: 'registro_fallido',
        detail: 'x',
        rawMessage: 'a'.repeat(1000),
      })
      linea = String(spy.mock.calls[0][0])
    } finally {
      spy.mockRestore()
    }

    expect(linea).toContain('operador=desconocido')
    expect(linea).not.toContain('a'.repeat(301))
    expect(linea).toContain('a'.repeat(300))
  })
})
