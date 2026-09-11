/**
 * El píxel de Meta — qué píxeles se disparan en una página pública y con qué datos.
 *
 * DOS PÍXELES, NO UNO (dueño, 2026-09-10)
 * ───────────────────────────────────────
 * Un píxel solo alimenta a la cuenta publicitaria que lo creó, así que "quién
 * puede tirar campañas con esto" es literalmente "de quién es el píxel". El
 * dueño pidió las dos cosas, y por eso hay dos:
 *
 *   1. **El de la plataforma** — `NEXT_PUBLIC_META_PIXEL_ID`, el mismo en las 25
 *      marcas. Es el de Cada1. Cada evento lleva `tenant` y `location`, así que
 *      dentro de esa cuenta se puede segmentar por marca y por sede.
 *      ⚠️ APAGADO POR DECISIÓN DEL DUEÑO (2026-09-11): la variable se queda
 *      vacía. Juntar a los comensales de las 25 marcas en una cuenta no sirve
 *      para nada que la Ley 1581 permita (finalidad y responsable). El código
 *      se queda; no se enciende sin una decisión nueva. `meta-pixel.md`.
 *   2. **El de la marca** — `tenants.config.integrations.meta_pixel_id`, que el
 *      restaurante carga desde el panel. Si lo carga, los MISMOS eventos le
 *      llegan también a su cuenta y tira sus propias campañas. Si no lo carga,
 *      no pasa nada: la lista queda con uno solo.
 *
 * Meta acepta varios `fbq('init', …)` en la misma página y reparte cada `track`
 * a todos los píxeles inicializados. No hay que llamar a `track` dos veces.
 *
 * QUÉ VIAJA DESDE EL NAVEGADOR, Y QUÉ NO
 * ──────────────────────────────────────
 * Desde el navegador NO viaja ningún dato personal: ni el celular, ni el
 * nombre, ni el correo, ni la fecha de nacimiento, ni el id del cliente.
 * `buildMetaEventParams()` es la ÚNICA fábrica de parámetros de este módulo y
 * su salida está acotada a mano a `tenant`, `location` y un `content_category`
 * de lista cerrada. Meta reconoce al cliente por las cookies que ya tenía.
 *
 * El CELULAR sí viaja, pero desde el SERVIDOR y hasheado, por la API de
 * Conversiones (`meta-conversions.ts`, dueño 2026-09-11): es lo que hace que
 * el evento cuente aunque un bloqueador haya apagado el píxel. Los dos
 * eventos se unen por `event_id` (ver `metaEventIdForRegistration()` y
 * `metaEventIdForVisit()` allá). Un dato personal NUEVO en cualquiera de los
 * dos lados no se agrega solo: cambia la política de privacidad
 * (`src/app/(public)/privacidad/page.tsx` §7 es su espejo).
 *
 * Este archivo es PURO y no importa nada de Next: se prueba sin levantar nada
 * (`tests/unit/meta-pixel.test.ts`). El `<script>` lo pone
 * `src/components/features/analytics/MetaPixel.tsx`; los eventos los dispara
 * `src/lib/meta-pixel-client.ts`.
 *
 * Ref: docs/features/meta-pixel.md
 */

import type { TenantConfig } from '@/types/tenant.types'

/**
 * Un id de píxel de Meta es un número largo. Hoy son de 15 o 16 dígitos, pero
 * la validación acepta 10–20 a propósito: rechazar un id válido porque Meta
 * cambió el largo se ve como "el píxel no mide" y cuesta días encontrarlo,
 * mientras que aceptar un número de más no rompe nada (Meta ignora un id que no
 * es suyo). Lo que sí se rechaza es todo lo que no sea dígitos — ahí es donde
 * alguien pega el snippet entero o una URL por error.
 */
export const META_PIXEL_ID_PATTERN = /^[0-9]{10,20}$/

/**
 * Normaliza lo que venga a un id de píxel, o `null`.
 *
 * Tolera los espacios y los guiones que deja el copiar/pegar desde el
 * Administrador de eventos de Meta. No tolera nada más.
 */
export function normalizeMetaPixelId(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    const asText = String(raw)
    return META_PIXEL_ID_PATTERN.test(asText) ? asText : null
  }
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().replace(/[\s-]/g, '')
  if (cleaned === '') return null
  return META_PIXEL_ID_PATTERN.test(cleaned) ? cleaned : null
}

/**
 * Lee el id de píxel que cargó la MARCA desde el panel.
 *
 * Devuelve `null` con config ausente, con el espacio `integrations` ausente y
 * con un valor mal formado. Un id inválido guardado a mano en la base no puede
 * tumbar el render de una página pública: se ignora, y punto.
 */
export function tenantMetaPixelId(config: TenantConfig | null | undefined): string | null {
  if (!config || typeof config !== 'object') return null
  const integrations = (config as { integrations?: unknown }).integrations
  if (!integrations || typeof integrations !== 'object') return null
  return normalizeMetaPixelId((integrations as Record<string, unknown>).meta_pixel_id)
}

/**
 * La lista final de píxeles a inicializar, en orden y sin repetidos.
 *
 * El de la plataforma va primero por costumbre, no porque importe. El
 * `dedupe` no es decorativo: si un restaurante pega POR ERROR el id de Cada1 en
 * su campo, `fbq('init')` dos veces con el mismo id hace que Meta cuente cada
 * evento DOS VECES en esa cuenta, y eso no se ve — se descubre semanas después
 * mirando un número inflado.
 */
export function resolveMetaPixelIds(args: {
  platformId?: string | null | undefined
  tenantConfig?: TenantConfig | null | undefined
}): string[] {
  const ids: string[] = []
  const platform = normalizeMetaPixelId(args.platformId)
  if (platform) ids.push(platform)
  const brand = tenantMetaPixelId(args.tenantConfig)
  if (brand && !ids.includes(brand)) ids.push(brand)
  return ids
}

// ─── Los eventos ─────────────────────────────────────────────────────────────

/**
 * Un evento del píxel. `standard: true` va por `fbq('track', …)` — son los
 * nombres que Meta entiende y con los que se optimiza una campaña. `false` va
 * por `fbq('trackCustom', …)`: mandar un nombre inventado por `track` hace que
 * Meta lo descarte en silencio.
 */
export interface MetaEventSpec {
  name: string
  standard: boolean
}

/** Alguien abrió una página pública. Lo dispara el componente, una vez por carga. */
export const META_EVENT_PAGE_VIEW: MetaEventSpec = { name: 'PageView', standard: true }

/**
 * Un cliente NUEVO terminó de registrarse en el programa. Es el evento que vale
 * para optimizar: es el que convierte a un visitante en cliente de la marca.
 */
export const META_EVENT_REGISTER: MetaEventSpec = { name: 'CompleteRegistration', standard: true }

/**
 * Un cliente YA registrado hizo check-in. No es un evento estándar de Meta
 * (no hay ninguno que signifique "volvió al local"), así que va por
 * `trackCustom` y sirve para armar la audiencia de los que vuelven.
 */
export const META_EVENT_CHECK_IN: MetaEventSpec = { name: 'CheckIn', standard: false }

/**
 * De dónde salió el evento. Lista CERRADA a propósito: es lo único, además de
 * la marca y la sede, que sale de acá hacia Meta.
 */
export type MetaEventSurface = 'check-in' | 'tarjeta'

/** La marca y la sede desde donde se está mirando. Lo arma el layout público. */
export interface MetaPixelContext {
  /** Slug del tenant (`sushi-service`). Nunca el UUID: el slug no es un secreto y se lee. */
  tenant: string | null
  /** Id de la sede, o `null` = sede desconocida. Se manda tal cual: NULL es un dato. */
  location: string | null
}

/**
 * ¿Se mide esta ruta?
 *
 * Todo `(public)` menos `/mesero/*`, y no es un detalle legal sino de calidad
 * del dato: el mesero abre la pantalla de escaneo cuarenta veces por turno
 * desde el celular del local. Medirlo mete al EMPLEADO en la audiencia de la
 * marca con el perfil del cliente más fiel que existe, y después esa audiencia
 * se usa para buscar gente parecida. La página del mesero no dispara el píxel y
 * por lo tanto tampoco muestra el aviso de medición: las dos cosas salen de
 * esta función, así que no pueden desincronizarse.
 */
export function isMeasuredPath(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false
  return pathname !== '/mesero' && !pathname.startsWith('/mesero/')
}

/** De qué pantalla salió el evento. Todo lo que no es la tarjeta es el check-in. */
export function surfaceForPath(pathname: string): MetaEventSurface {
  return pathname.startsWith('/tarjeta') ? 'tarjeta' : 'check-in'
}

export interface MetaEventParams {
  tenant?: string
  location?: string
  content_category?: MetaEventSurface
}

/**
 * Los parámetros de un evento. Es la única fábrica: nada llega a Meta sin pasar
 * por acá, y acá no hay forma de meter un dato personal.
 *
 * Las claves ausentes se OMITEN en vez de mandarse como `null` o `''`, que en
 * el Administrador de eventos de Meta se ven como un valor real y ensucian los
 * desgloses. "Sede desconocida" se representa no mandando `location`.
 */
export function buildMetaEventParams(
  context: MetaPixelContext | null | undefined,
  surface: MetaEventSurface
): MetaEventParams {
  const params: MetaEventParams = { content_category: surface }
  if (context?.tenant) params.tenant = context.tenant
  if (context?.location) params.location = context.location
  return params
}

// ─── Los ids de evento: deterministas, para que navegador y servidor coincidan ─
//
// Los usa el servidor (API de Conversiones) y el navegador (píxel) para el MISMO
// evento: Meta los une por este id y lo cuenta una vez. Viven acá y no en
// `meta-conversions.ts` porque aquel trae `node:crypto` y este archivo viaja al
// cliente.

/**
 * Un registro tiene UN id de evento, derivado del id del cliente.
 *
 * Es determinista a propósito. El navegador del cliente dispara su
 * `CompleteRegistration` a veces MUCHO después que el servidor: con check-in
 * por mesero, el registro responde `registered_pending_scan`, el cliente
 * muestra su QR, y recién cuando el mesero escanea la pantalla pasa a
 * «bienvenido». Si el id fuera aleatorio habría que guardarlo en algún lado
 * para que los dos coincidan; con el id del cliente adentro, los dos lo
 * calculan solos y Meta los une (ventana de 48 h).
 */
export function metaEventIdForRegistration(customerId: string): string {
  return `reg-${customerId}`
}

/** Idem para una visita: el id de la fila de `visits`. Una visita, un evento. */
export function metaEventIdForVisit(visitId: string): string {
  return `visit-${visitId}`
}
