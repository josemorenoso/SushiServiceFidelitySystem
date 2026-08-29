/**
 * Cliente base de Zernio — wrapper mínimo sobre fetch().
 *
 * ESTADO: módulo NUEVO y AISLADO. Nada del código existente lo importa todavía
 * (whatsapp.service.ts sigue hablando solo con Twilio). Es la base para migrar
 * el envío de WhatsApp de Twilio a Zernio — ver docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §1.
 *
 * No hay un nombre de paquete npm oficial confirmado en la documentación pública
 * (la doc de Zernio menciona SDKs para varios lenguajes sin dar el nombre exacto
 * del paquete) — por eso, igual que el resto del repo ya hace con la Twilio
 * Content API (ver src/app/api/dashboard/templates/route.ts), se habla directo
 * con la REST API en vez de instalar una dependencia sin verificar.
 *
 * Base URL y esquema de auth según el spec OpenAPI público
 * (docs.zernio.com/api/openapi → `servers` / `securitySchemes`) y las llamadas
 * de solo lectura registradas en docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md
 * §1 ("Prueba real con la API key"):
 *   servers: https://zernio.com/api
 *   security: Authorization: Bearer <ZERNIO_API_KEY>
 */

const ZERNIO_BASE_URL = 'https://zernio.com/api/v1'

/** Corte duro para no quedar colgados si Zernio no responde (la API no
 * garantiza latencia; los flujos que llaman esto corren en serverless). */
const ZERNIO_TIMEOUT_MS = 10_000

export class ZernioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message)
    this.name = 'ZernioApiError'
  }
}

function getApiKey(): string {
  const key = process.env.ZERNIO_API_KEY
  if (!key) {
    throw new Error('ZERNIO_API_KEY no está configurada')
  }
  return key
}

/**
 * Llamada genérica a la API de Zernio. `path` es relativo a /v1 (ej. '/inbox/conversations').
 */
export async function zernioFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ZERNIO_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${ZERNIO_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new ZernioApiError(
      controller.signal.aborted
        ? `Zernio API sin respuesta en ${path} tras ${ZERNIO_TIMEOUT_MS}ms`
        : `Zernio API inalcanzable en ${path}: ${detail}`,
      0,
      null
    )
  } finally {
    clearTimeout(timer)
  }

  const raw = await res.text()
  let body: unknown = null
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      // Un 2xx con body no-JSON no es un éxito parseable: fallar ruidoso aquí
      // evita devolver `null` tipado como T y explotar más adelante con un
      // TypeError críptico en el caller.
      if (res.ok) {
        throw new ZernioApiError(`Zernio API ${res.status} en ${path}: respuesta 2xx con body no-JSON`, res.status, raw)
      }
      body = raw
    }
  }

  if (!res.ok) {
    throw new ZernioApiError(`Zernio API ${res.status} en ${path}: ${JSON.stringify(body)}`, res.status, body)
  }

  return body as T
}
