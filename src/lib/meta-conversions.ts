/**
 * La API de Conversiones de Meta — el evento que se manda desde el SERVIDOR.
 *
 * POR QUÉ EXISTE ADEMÁS DEL PÍXEL (dueño, 2026-09-11)
 * ───────────────────────────────────────────────────
 * El píxel (`meta-pixel.ts`) corre en el navegador del cliente. Un bloqueador
 * de anuncios, el modo privado o el iOS de turno lo apagan y ese check-in
 * nunca se mide. Esta API manda el MISMO evento desde nuestro servidor, que
 * nadie bloquea. Meta recibe los dos, y los une por `event_id`: si el del
 * navegador llegó, el del servidor no se cuenta dos veces; si no llegó, el del
 * servidor cuenta solo.
 *
 * Pero el servidor no tiene las cookies del navegador, así que Meta no tiene
 * con qué reconocer a nadie… salvo que le demos un identificador. Por eso
 * este evento lleva el CELULAR del cliente, hasheado con SHA-256, que es lo
 * que Meta compara contra sus propios celulares hasheados. Es la decisión del
 * dueño del 2026-09-11 y la política de privacidad (`/privacidad` §7) la
 * cuenta con esas palabras: «encriptado» no es «anónimo» — Meta se entera de
 * que ese celular es cliente de ese restaurante.
 *
 * QUÉ VIAJA Y QUÉ NO
 * ──────────────────
 * Viaja: el celular hasheado, el país hasheado (`co`, para afinar el match),
 * y —solo cuando el pedido salió del navegador del CLIENTE— su IP, su
 * user-agent y las cookies `_fbp`/`_fbc` que el píxel ya había dejado.
 * NO viaja: nombre, correo, cumpleaños, ciudad, puntos ni el id interno del
 * cliente. `buildConversionEvent()` es la única fábrica y su salida está
 * acotada a mano; el test fija la lista de claves de `user_data`.
 *
 * ⚠️ LAS SEÑALES DEL NAVEGADOR SON DEL CLIENTE O NO SON. Con el check-in por
 * mesero (`source: 'staff_scan'`), el pedido HTTP lo hace el celular del
 * MESERO: mandar su IP, su user-agent y su `_fbp` junto al celular hasheado
 * del cliente le enseñaría a Meta que el navegador del mesero es ese cliente
 * — y el siguiente cliente, y el siguiente. Es la misma razón por la que
 * `/mesero/*` no dispara el píxel. Ahí va el celular hasheado y nada más.
 *
 * Este archivo no toca la base ni lee el entorno: el SHA-256 viene de
 * `node:crypto` y el POST a Meta recibe su `fetch` por parámetro, así que se
 * prueba con uno falso. Resolver QUÉ píxeles y CON QUÉ token es de
 * `meta-conversions-server.ts`.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { createHash } from 'node:crypto'
import type { MetaEventSpec, MetaEventSurface, MetaPixelContext } from './meta-pixel'

// Los ids de evento (`metaEventIdForRegistration`, `metaEventIdForVisit`) viven
// en `meta-pixel.ts`: los usa también el navegador, y este archivo trae
// `node:crypto`, que no puede ir al cliente.

/**
 * Versión del Graph API. Meta mantiene cada versión ~2 años; cuando esta
 * caduque, la API responde 400 con `code: 2635` y hay que subirla acá.
 */
export const META_GRAPH_API_VERSION = 'v23.0'

/** Hash SHA-256 en hexadecimal minúscula, como lo pide Meta. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * El celular como lo quiere Meta: solo dígitos, CON indicativo de país y SIN
 * `+` ni ceros por delante. Nuestro `validatePhone()` deja 10 dígitos
 * colombianos (`3001234567`); Meta necesita `573001234567`. Un celular que ya
 * venga con el 57 no lo duplica.
 */
export function normalizePhoneForMeta(cleaned: string): string | null {
  const digits = cleaned.replace(/\D/g, '')
  if (digits === '') return null
  if (/^3\d{9}$/.test(digits)) return `57${digits}`
  if (/^573\d{9}$/.test(digits)) return digits
  return null
}

/** El celular hasheado, o `null` si no tiene forma de celular colombiano. */
export function hashPhoneForMeta(cleaned: string): string | null {
  const normalized = normalizePhoneForMeta(cleaned)
  return normalized ? sha256Hex(normalized) : null
}

// ─── El evento ───────────────────────────────────────────────────────────────

/** Señales del navegador del CLIENTE. Se omiten enteras si el pedido no salió de ahí. */
export interface BrowserSignals {
  ip: string | null
  userAgent: string | null
  /** Cookie `_fbp` que dejó el píxel en nuestro dominio. */
  fbp: string | null
  /** Cookie `_fbc` (click id) cuando el cliente llegó desde un anuncio. */
  fbc: string | null
}

export interface ConversionEventInput {
  event: MetaEventSpec
  eventId: string
  /** Segundos Unix. Se recibe para que el test sea determinista. */
  eventTime: number
  /** URL de la pantalla del cliente (no la del mesero). */
  sourceUrl: string | null
  /** Celular tal como sale de `validatePhone().cleaned`. */
  phone: string
  context: MetaPixelContext
  surface: MetaEventSurface
  /** `null` = el pedido NO salió del navegador del cliente (mesero): sin señales. */
  browser: BrowserSignals | null
}

/** `user_data` según Meta: todo hasheado salvo las señales técnicas. */
export interface ConversionUserData {
  ph: string[]
  country: string[]
  client_ip_address?: string
  client_user_agent?: string
  fbp?: string
  fbc?: string
}

export interface ConversionEvent {
  event_name: string
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url?: string
  user_data: ConversionUserData
  custom_data: {
    tenant?: string
    location?: string
    content_category: MetaEventSurface
  }
}

/**
 * Arma UN evento para la API de Conversiones. Es la única fábrica: nada llega
 * a Meta por el servidor sin pasar por acá.
 *
 * Devuelve `null` si el celular no se puede hashear: un evento sin
 * identificador no sirve para nada en el servidor (no hay cookie que lo
 * salve) y mandarlo solo ensucia la calidad de coincidencia que Meta reporta.
 */
export function buildConversionEvent(input: ConversionEventInput): ConversionEvent | null {
  const ph = hashPhoneForMeta(input.phone)
  if (!ph) return null

  const user_data: ConversionUserData = {
    ph: [ph],
    // Todos los clientes son colombianos (validatePhone solo acepta celulares
    // de Colombia). El país afina el match y no es un dato de la persona.
    country: [sha256Hex('co')],
  }
  if (input.browser) {
    if (input.browser.ip) user_data.client_ip_address = input.browser.ip
    if (input.browser.userAgent) user_data.client_user_agent = input.browser.userAgent
    if (input.browser.fbp) user_data.fbp = input.browser.fbp
    if (input.browser.fbc) user_data.fbc = input.browser.fbc
  }

  const event: ConversionEvent = {
    event_name: input.event.name,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: 'website',
    user_data,
    custom_data: { content_category: input.surface },
  }
  if (input.sourceUrl) event.event_source_url = input.sourceUrl
  if (input.context.tenant) event.custom_data.tenant = input.context.tenant
  if (input.context.location) event.custom_data.location = input.context.location
  return event
}

/**
 * Lee `_fbp` y `_fbc` de un header `Cookie` crudo. Sin dependencias: son dos
 * claves y el formato es `a=b; c=d`.
 */
export function readMetaCookies(cookieHeader: string | null | undefined): { fbp: string | null; fbc: string | null } {
  const out = { fbp: null as string | null, fbc: null as string | null }
  if (!cookieHeader) return out
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === '_fbp' && value) out.fbp = value
    if (key === '_fbc' && value) out.fbc = value
  }
  return out
}

/** Primera IP de `x-forwarded-for`, o `x-real-ip`, o nada. */
export function readClientIp(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip') || null
}

// ─── El token de la marca ────────────────────────────────────────────────────

/**
 * Un token de Meta es una cadena larga sin espacios. No se valida más que eso:
 * el formato real lo decide Meta y cambia; lo que sí se atrapa es pegar el
 * snippet, una URL o el id del píxel en el campo equivocado.
 */
export function validarTokenDeMeta(raw: unknown): { ok: true; token: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'debe ser texto' }
  const token = raw.trim()
  if (token === '') return { ok: true, token: '' }
  if (/\s/.test(token)) return { ok: false, error: 'el token no lleva espacios: pegá solo la cadena que da Meta' }
  if (token.length < 20 || token.length > 1024) return { ok: false, error: 'eso no parece un token de Meta' }
  if (/^[0-9]+$/.test(token)) return { ok: false, error: 'eso es el id del píxel, no el token: el token es una cadena larga con letras' }
  if (/^https?:\/\//i.test(token) || token.includes('<')) return { ok: false, error: 'pegá solo el token, no un enlace ni el código' }
  return { ok: true, token }
}

// ─── El envío ────────────────────────────────────────────────────────────────

/** Un píxel al que mandar y con qué token. */
export interface ConversionTarget {
  pixelId: string
  accessToken: string
  /** Solo para el log: de quién es. */
  owner: 'platform' | 'brand'
}

/** Cuánto se espera a Meta. Corre después de la respuesta, pero un cuelgue igual cuesta cómputo. */
const META_TIMEOUT_MS = 5_000

/**
 * POST a `/{pixel_id}/events`. Uno por destino, en paralelo, cada uno con su
 * propio try/catch: que falle el de la marca no le quita el evento a la
 * plataforma ni al revés. NUNCA lanza.
 */
export async function postConversionEvent(
  targets: ConversionTarget[],
  event: ConversionEvent,
  options: { testEventCode?: string; fetchImpl?: typeof fetch } = {}
): Promise<void> {
  if (targets.length === 0) return
  const fetchImpl = options.fetchImpl ?? fetch

  await Promise.all(
    targets.map(async (target) => {
      const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${target.pixelId}/events`
      const body: Record<string, unknown> = { data: [event], access_token: target.accessToken }
      if (options.testEventCode) body.test_event_code = options.testEventCode
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(META_TIMEOUT_MS),
        })
        if (!res.ok) {
          // El cuerpo del error de Meta dice qué pasó (token vencido, versión
          // caducada, píxel ajeno). El token NO se loguea jamás.
          const detail = (await res.text().catch(() => '')).slice(0, 300)
          console.error(
            `[MetaCAPI][FALLO] owner=${target.owner} pixel=${target.pixelId} event=${event.event_name} status=${res.status} detalle="${detail}"`
          )
        }
      } catch (err) {
        console.error(
          `[MetaCAPI][FALLO] owner=${target.owner} pixel=${target.pixelId} event=${event.event_name} detalle="${err instanceof Error ? err.message : String(err)}"`
        )
      }
    })
  )
}
