/**
 * La API de Conversiones de Meta — lo que sale desde el SERVIDOR.
 *
 * Tres garantías, en orden de lo que cuesta romperlas:
 *
 *   1. **El celular viaja hasheado y NADA más de la persona.** `user_data`
 *      tiene una lista cerrada de claves; nombre, correo y cumpleaños no
 *      existen ahí. Si alguien los agrega "para mejorar el match", esto se
 *      pone rojo y la política de privacidad (§7) deja de ser verdad.
 *   2. **Las señales del navegador son del cliente o no son.** Con check-in
 *      por mesero, el pedido lo hace el celular del MESERO: su IP, su
 *      user-agent y su `_fbp` no pueden ir pegados al celular del cliente.
 *   3. **Los ids de evento son deterministas** y los mismos que usa el píxel:
 *      es lo que hace que Meta cuente cada registro y cada visita UNA vez.
 *
 * El envío (`postConversionEvent`) se prueba con un `fetch` falso: nunca se
 * toca Meta desde un test.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { describe, it, expect, vi } from 'vitest'
import {
  buildConversionEvent,
  postConversionEvent,
  hashPhoneForMeta,
  normalizePhoneForMeta,
  readClientIp,
  readMetaCookies,
  sha256Hex,
  validarTokenDeMeta,
  META_GRAPH_API_VERSION,
  type ConversionTarget,
} from '@/lib/meta-conversions'
import {
  META_EVENT_CHECK_IN,
  META_EVENT_REGISTER,
  metaEventIdForRegistration,
  metaEventIdForVisit,
} from '@/lib/meta-pixel'

const CONTEXT = { tenant: 'sushi-service', location: 'loc-1' }
const BROWSER = { ip: '181.1.2.3', userAgent: 'Mozilla/5.0 (iPhone)', fbp: 'fb.1.1700000000.123', fbc: 'fb.1.1700000000.AbC' }

describe('el celular como lo quiere Meta', () => {
  it('le pone el 57 al celular colombiano de 10 dígitos y no lo duplica', () => {
    expect(normalizePhoneForMeta('3001234567')).toBe('573001234567')
    expect(normalizePhoneForMeta('573001234567')).toBe('573001234567')
    expect(normalizePhoneForMeta('+57 300 123 4567')).toBe('573001234567')
  })

  it('rechaza lo que no es un celular colombiano', () => {
    expect(normalizePhoneForMeta('')).toBeNull()
    expect(normalizePhoneForMeta('6041234567')).toBeNull()
    expect(normalizePhoneForMeta('abc')).toBeNull()
  })

  it('hashea el número normalizado con SHA-256 en hex minúscula', () => {
    // Vector conocido: sha256("573001234567") — si cambia el normalizador, cambia esto.
    expect(hashPhoneForMeta('3001234567')).toBe(sha256Hex('573001234567'))
    expect(hashPhoneForMeta('3001234567')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashPhoneForMeta('nada')).toBeNull()
  })
})

describe('buildConversionEvent — el contrato de user_data', () => {
  it('con el navegador del cliente: celular y país hasheados + sus cuatro señales', () => {
    const ev = buildConversionEvent({
      event: META_EVENT_REGISTER,
      eventId: 'reg-c1',
      eventTime: 1_800_000_000,
      sourceUrl: 'https://marca.constelarys.com/check-in',
      phone: '3001234567',
      context: CONTEXT,
      surface: 'check-in',
      browser: BROWSER,
    })
    expect(ev).not.toBeNull()
    if (!ev) return
    expect(ev.event_name).toBe('CompleteRegistration')
    expect(ev.event_id).toBe('reg-c1')
    expect(ev.event_time).toBe(1_800_000_000)
    expect(ev.action_source).toBe('website')
    expect(ev.event_source_url).toBe('https://marca.constelarys.com/check-in')
    expect(ev.user_data).toEqual({
      ph: [sha256Hex('573001234567')],
      country: [sha256Hex('co')],
      client_ip_address: '181.1.2.3',
      client_user_agent: 'Mozilla/5.0 (iPhone)',
      fbp: 'fb.1.1700000000.123',
      fbc: 'fb.1.1700000000.AbC',
    })
    expect(ev.custom_data).toEqual({ tenant: 'sushi-service', location: 'loc-1', content_category: 'check-in' })
  })

  it('con el check-in por MESERO: celular hasheado y NINGUNA señal del navegador', () => {
    // El pedido lo hizo el celular del mesero. Mandar su IP/UA/_fbp con el
    // celular del cliente le enseña a Meta que el mesero es cada cliente.
    const ev = buildConversionEvent({
      event: META_EVENT_CHECK_IN,
      eventId: 'visit-v1',
      eventTime: 1_800_000_000,
      sourceUrl: null,
      phone: '3001234567',
      context: CONTEXT,
      surface: 'check-in',
      browser: null,
    })
    expect(ev).not.toBeNull()
    if (!ev) return
    expect(Object.keys(ev.user_data).sort()).toEqual(['country', 'ph'])
    expect('event_source_url' in ev).toBe(false)
  })

  it('NUNCA lleva nombre, correo, cumpleaños ni el id del cliente', () => {
    const ev = buildConversionEvent({
      event: META_EVENT_REGISTER, eventId: 'reg-c1', eventTime: 1, sourceUrl: null,
      phone: '3001234567', context: CONTEXT, surface: 'check-in', browser: BROWSER,
    })
    if (!ev) throw new Error('evento nulo')
    const ud = ev.user_data as unknown as Record<string, unknown>
    for (const prohibida of ['fn', 'ln', 'em', 'db', 'ct', 'external_id', 'name', 'email', 'birthday', 'city', 'customer_id']) {
      expect(ud[prohibida]).toBeUndefined()
    }
    // El celular crudo no aparece en NINGÚN lado del evento.
    expect(JSON.stringify(ev)).not.toContain('3001234567')
    expect(JSON.stringify(ev)).not.toContain('573001234567')
  })

  it('sin celular hasheable no hay evento: en el servidor no hay cookie que lo salve', () => {
    expect(buildConversionEvent({
      event: META_EVENT_REGISTER, eventId: 'x', eventTime: 1, sourceUrl: null,
      phone: '6041234567', context: CONTEXT, surface: 'check-in', browser: BROWSER,
    })).toBeNull()
  })

  it('las señales vacías se omiten, no se mandan como cadenas vacías', () => {
    const ev = buildConversionEvent({
      event: META_EVENT_REGISTER, eventId: 'x', eventTime: 1, sourceUrl: null,
      phone: '3001234567', context: { tenant: null, location: null }, surface: 'tarjeta',
      browser: { ip: null, userAgent: null, fbp: null, fbc: null },
    })
    if (!ev) throw new Error('evento nulo')
    expect(Object.keys(ev.user_data).sort()).toEqual(['country', 'ph'])
    expect(ev.custom_data).toEqual({ content_category: 'tarjeta' })
  })
})

describe('los ids de evento: navegador y servidor calculan el mismo', () => {
  it('registro por cliente, visita por fila de visits', () => {
    expect(metaEventIdForRegistration('c-123')).toBe('reg-c-123')
    expect(metaEventIdForVisit('v-456')).toBe('visit-v-456')
    // Dos llamadas, mismo id: es lo que Meta usa para deduplicar.
    expect(metaEventIdForVisit('v-456')).toBe(metaEventIdForVisit('v-456'))
  })
})

describe('leer las señales del pedido', () => {
  it('saca _fbp y _fbc del header Cookie e ignora el resto', () => {
    expect(readMetaCookies('_ga=GA1.1; _fbp=fb.1.1.2; sb-token=abc; _fbc=fb.1.1.XYZ'))
      .toEqual({ fbp: 'fb.1.1.2', fbc: 'fb.1.1.XYZ' })
    expect(readMetaCookies(null)).toEqual({ fbp: null, fbc: null })
    expect(readMetaCookies('_fbp=')).toEqual({ fbp: null, fbc: null })
  })

  it('la IP es la primera de x-forwarded-for, o x-real-ip, o nada', () => {
    const h = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null })
    expect(readClientIp(h({ 'x-forwarded-for': '1.1.1.1, 10.0.0.1' }))).toBe('1.1.1.1')
    expect(readClientIp(h({ 'x-real-ip': '2.2.2.2' }))).toBe('2.2.2.2')
    expect(readClientIp(h({}))).toBeNull()
  })
})

describe('validarTokenDeMeta — lo que el panel deja guardar', () => {
  it('acepta una cadena larga sin espacios y el vacío (= borrar)', () => {
    expect(validarTokenDeMeta('EAAGm0PX4ZCpsBOZCZAZBxyz1234567890abcdefghijklmnop')).toEqual({ ok: true, token: 'EAAGm0PX4ZCpsBOZCZAZBxyz1234567890abcdefghijklmnop' })
    expect(validarTokenDeMeta('   ')).toEqual({ ok: true, token: '' })
  })

  it('rechaza el error real: pegar el id del píxel, un enlace o el snippet', () => {
    expect(validarTokenDeMeta('1234567890123456').ok).toBe(false)
    expect(validarTokenDeMeta('https://business.facebook.com/events_manager2/').ok).toBe(false)
    expect(validarTokenDeMeta('<script>fbq()</script> y mucho mas texto para pasar el largo').ok).toBe(false)
    expect(validarTokenDeMeta('EAAG con espacio dentro del token de mentira 12345').ok).toBe(false)
    expect(validarTokenDeMeta(12345).ok).toBe(false)
  })
})

describe('postConversionEvent — un POST por destino, y ninguno tumba al otro', () => {
  const event = buildConversionEvent({
    event: META_EVENT_REGISTER, eventId: 'reg-c1', eventTime: 1, sourceUrl: null,
    phone: '3001234567', context: CONTEXT, surface: 'check-in', browser: null,
  })
  if (!event) throw new Error('evento nulo')

  const targets: ConversionTarget[] = [
    { pixelId: '111111111111111', accessToken: 'TOKEN-PLATAFORMA', owner: 'platform' },
    { pixelId: '222222222222222', accessToken: 'TOKEN-MARCA', owner: 'brand' },
  ]

  it('manda el mismo evento a cada píxel con SU token', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const fetchFalso = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response('{"events_received":1}', { status: 200 })
    }) as unknown as typeof fetch

    await postConversionEvent(targets, event, { fetchImpl: fetchFalso })

    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/111111111111111/events`)
    expect(calls[0].body.access_token).toBe('TOKEN-PLATAFORMA')
    expect(calls[1].url).toBe(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/222222222222222/events`)
    expect(calls[1].body.access_token).toBe('TOKEN-MARCA')
    expect(calls[0].body.data).toEqual([event])
    expect(calls[1].body.data).toEqual([event])
  })

  it('un 401 en la marca no impide el envío a la plataforma, y no lanza', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFalso = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('222222222222222')
        ? new Response('{"error":{"message":"Invalid OAuth access token"}}', { status: 401 })
        : new Response('{"events_received":1}', { status: 200 })
    ) as unknown as typeof fetch

    await expect(postConversionEvent(targets, event, { fetchImpl: fetchFalso })).resolves.toBeUndefined()
    expect(fetchFalso).toHaveBeenCalledTimes(2)
    // Se loguea el fallo con el dueño y el píxel, y SIN el token.
    const logueado = error.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logueado).toContain('owner=brand')
    expect(logueado).toContain('status=401')
    expect(logueado).not.toContain('TOKEN-MARCA')
    error.mockRestore()
  })

  it('una red caída tampoco lanza', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFalso = vi.fn(async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    await expect(postConversionEvent(targets, event, { fetchImpl: fetchFalso })).resolves.toBeUndefined()
    error.mockRestore()
  })

  it('sin destinos no hace ni una llamada', async () => {
    const fetchFalso = vi.fn() as unknown as typeof fetch
    await postConversionEvent([], event, { fetchImpl: fetchFalso })
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
