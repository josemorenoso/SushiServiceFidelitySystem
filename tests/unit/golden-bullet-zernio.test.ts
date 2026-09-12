/**
 * Golden Bullet por Zernio (2026-09-12): lo que decide por qué línea sale la
 * difusión, cómo se arma la plantilla con botones para Meta, cómo se lee el
 * listado de la WABA, cómo se reconoce el botón tocado y cómo se contesta.
 *
 * Todo puro, salvo el envío del acuse, que se prueba contra un `fetch` falso:
 * el cuerpo y la ruta son el contrato con Zernio y equivocarlos no rompe el
 * build — rompe el acuse de la persona que dijo que sí.
 *
 * Ref: docs/features/golden-bullet.md § "Por qué línea sale la difusión"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildZernioTemplateComponents } from '@/lib/zernio/templates'
import { mapZernioTemplateToItem } from '@/lib/zernio/template-listing'
import { readButtonPayload } from '@/lib/zernio/webhooks'
import type { ZernioWebhookPayloadMessage } from '@/lib/zernio/webhooks'
import { sendZernioConversationMessage } from '@/lib/zernio/messaging'
import { nombreLibreEnWaba, ejemploDelCuerpo } from '@/services/golden-bullet-template.service'
import { goldenBulletProviderFor, detectClubButton } from '@/services/club-optin.service'

describe('goldenBulletProviderFor — por qué línea sale la difusión', () => {
  const conZernio = {
    messaging_provider: 'twilio' as const,
    zernio_account_id: 'acc',
    zernio_phone_number: '+573001234567',
  }
  const sinZernio = { messaging_provider: 'twilio' as const, zernio_account_id: null, zernio_phone_number: null }

  it('una marca en Zernio manda la difusión por Zernio, diga lo que diga el ajuste', () => {
    expect(goldenBulletProviderFor({ ...conZernio, messaging_provider: 'zernio' as const }, '')).toBe('zernio')
    expect(goldenBulletProviderFor({ ...sinZernio, messaging_provider: 'zernio' as const }, 'twilio')).toBe('zernio')
  })

  it('marca en Twilio + ajuste zernio + cuenta conectada → Zernio (el caso de Sushi Service)', () => {
    expect(goldenBulletProviderFor(conZernio, 'zernio')).toBe('zernio')
    expect(goldenBulletProviderFor(conZernio, ' Zernio ')).toBe('zernio')
  })

  it('marca en Twilio + ajuste zernio SIN cuenta → Twilio, no un envío que falle cerrado', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(goldenBulletProviderFor(sinZernio, 'zernio')).toBe('twilio')
    expect(goldenBulletProviderFor({ ...conZernio, zernio_phone_number: null }, 'zernio')).toBe('twilio')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('sin ajuste, el de la marca', () => {
    expect(goldenBulletProviderFor(conZernio, null)).toBe('twilio')
    expect(goldenBulletProviderFor(conZernio, '')).toBe('twilio')
    expect(goldenBulletProviderFor(conZernio, 'twilio')).toBe('twilio')
  })
})

describe('buildZernioTemplateComponents — lo que Meta revisa', () => {
  it('header → body → buttons, con los ejemplos como array de arrays', () => {
    const c = buildZernioTemplateComponents({
      bodyText: 'Hola {{1}}, tenemos {{2}}',
      bodyExample: ['Juan', 'un postre'],
      header: { format: 'image', sampleUrl: 'https://x/y.jpg' },
      quickReplies: ['Quiero ser parte', 'No, gracias'],
    })
    expect(c.map((x) => x.type)).toEqual(['header', 'body', 'buttons'])
    expect(c[0]).toEqual({ type: 'header', format: 'image', example: { header_handle: ['https://x/y.jpg'] } })
    expect(c[1]).toEqual({ type: 'body', text: 'Hola {{1}}, tenemos {{2}}', example: { body_text: [['Juan', 'un postre']] } })
    expect(c[2]).toEqual({
      type: 'buttons',
      buttons: [
        { type: 'quick_reply', text: 'Quiero ser parte' },
        { type: 'quick_reply', text: 'No, gracias' },
      ],
    })
  })

  it('sin foto ni botones queda solo el body (las 13 del catálogo siguen igual)', () => {
    const c = buildZernioTemplateComponents({ bodyText: 'Hola {{1}}', bodyExample: ['Juan'] })
    expect(c).toHaveLength(1)
    expect(c[0].type).toBe('body')
  })

  it('botones vacíos o en blanco no generan el componente', () => {
    const c = buildZernioTemplateComponents({ bodyText: 'Hola {{1}}', bodyExample: ['Juan'], quickReplies: ['', '  '] })
    expect(c.map((x) => x.type)).toEqual(['body'])
  })
})

describe('nombreLibreEnWaba / ejemploDelCuerpo', () => {
  it('usa el base si está libre y versiona si no', () => {
    expect(nombreLibreEnWaba('club_invite_sushi', [])).toBe('club_invite_sushi')
    expect(nombreLibreEnWaba('club_invite_sushi', ['club_invite_sushi'])).toBe('club_invite_sushi_v2')
    expect(nombreLibreEnWaba('club_invite_sushi', ['club_invite_sushi', 'club_invite_sushi_v2'])).toBe('club_invite_sushi_v3')
    expect(nombreLibreEnWaba('club_invite_sushi', ['CLUB_INVITE_SUSHI'])).toBe('club_invite_sushi_v2')
  })

  it('declara {{2}} solo si el cuerpo la usa', () => {
    expect(ejemploDelCuerpo('Hola {{1}}')).toEqual(['Juan'])
    expect(ejemploDelCuerpo('Hola {{1}}, {{2}}', '')).toEqual(['Juan', 'un postre gratis en tu próxima visita'])
    expect(ejemploDelCuerpo('Hola {{1}}, {{2}}', ' 2x1 ')).toEqual(['Juan', '2x1'])
  })
})

describe('mapZernioTemplateToItem — el listado de la WABA con la forma de siempre', () => {
  it('el sid es el nombre, el estado en minúsculas, el cuerpo y los botones salen de components', () => {
    const item = mapZernioTemplateToItem({
      id: '123',
      name: 'club_invite_sushi_foto',
      status: 'APPROVED',
      category: 'MARKETING',
      language: 'es',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hola {{1}} 👋 tenemos {{2}}' },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quiero ser parte' }, { type: 'QUICK_REPLY', text: 'No, gracias' }] },
      ],
    })
    expect(item.sid).toBe('club_invite_sushi_foto')
    expect(item.status).toBe('approved')
    expect(item.approval_status).toBe('approved')
    expect(item.category).toBe('MARKETING')
    expect(item.body).toBe('Hola {{1}} 👋 tenemos {{2}}')
    expect(item.has_media).toBe(true)
    expect(item.media_needs_variable).toBe(false)
    expect(item.variables).toEqual({ '1': '', '2': '' })
    expect(item.buttons).toEqual(['Quiero ser parte', 'No, gracias'])
  })

  it('sin components no revienta: cuerpo no textual y pendiente', () => {
    const item = mapZernioTemplateToItem({ id: '1', name: 'x', status: 'PENDING', category: 'UTILITY', language: 'es' })
    expect(item.body).toBe('(tipo no textual)')
    expect(item.status).toBe('pending')
    expect(item.has_media).toBe(false)
    expect(item.buttons).toBeUndefined()
  })
})

describe('readButtonPayload — dónde viene el botón tocado', () => {
  const base = (extra: Partial<ZernioWebhookPayloadMessage>): ZernioWebhookPayloadMessage => ({
    id: 'evt',
    event: 'message.received',
    message: {
      id: 'm',
      conversationId: 'conv',
      platform: 'whatsapp',
      platformMessageId: 'wamid',
      direction: 'incoming',
      text: 'Quiero ser parte',
      sender: { id: '573001234567', phoneNumber: '+573001234567' },
      sentAt: '2026-09-12T00:00:00Z',
    },
    conversation: {},
    account: {},
    timestamp: '2026-09-12T00:00:00Z',
    ...extra,
  })

  it('metadata.buttonPayload del sobre (donde Zernio lo documenta)', () => {
    expect(readButtonPayload(base({ metadata: { buttonPayload: 'Quiero ser parte' } }))).toBe('Quiero ser parte')
  })

  it('interactiveId de un botón de sesión, y buttonPayload dentro de message como tolerancia', () => {
    expect(readButtonPayload(base({ metadata: { interactiveType: 'button_reply', interactiveId: 'btn_0' } }))).toBe('btn_0')
    const p = base({})
    ;(p.message as { buttonPayload?: string }).buttonPayload = 'CLUB_SI'
    expect(readButtonPayload(p)).toBe('CLUB_SI')
  })

  it('sin nada → null, y el detector cae al texto visible con la etiqueta guardada', () => {
    expect(readButtonPayload(base({}))).toBeNull()
    expect(detectClubButton('Sí, quiero mi regalo', null, { si: 'Sí, quiero mi regalo', no: 'No, gracias' })).toBe('opt_in')
    expect(detectClubButton('No, gracias', null, undefined)).toBe('opt_out')
  })
})

describe('sendZernioConversationMessage — el acuse en la ventana de 24 h', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubEnv('ZERNIO_API_KEY', 'test-key')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('POST a /inbox/conversations/{id}/messages con texto, foto e Idempotency-Key', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { messageId: 'wamid.1', conversationId: 'conv 1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const r = await sendZernioConversationMessage({
      accountId: 'acc',
      conversationId: 'conv 1',
      message: 'Bienvenido {enlace}',
      attachmentUrl: 'https://x/regalo.jpg',
      idempotencyKey: 'club-reply-evt',
    })
    expect(r.data?.messageId).toBe('wamid.1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/v1\/inbox\/conversations\/conv%201\/messages$/)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('club-reply-evt')
    expect(JSON.parse(String(init.body))).toEqual({
      accountId: 'acc',
      message: 'Bienvenido {enlace}',
      attachmentUrl: 'https://x/regalo.jpg',
      attachmentType: 'image',
    })
  })

  it('sin foto no manda attachment (una foto vacía no es una foto)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    await sendZernioConversationMessage({ accountId: 'acc', conversationId: 'c', message: 'hola', attachmentUrl: '  ' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ accountId: 'acc', message: 'hola' })
  })
})
