import crypto from 'node:crypto'
import { zernioFetch, ZernioApiError } from './client'

/**
 * Cliente de `/v1/connect/whatsapp*` — el alta de una línea de WhatsApp.
 *
 * **SERVER-ONLY.** `ZERNIO_API_KEY` es una llave del TEAM: abre TODOS los profiles, o sea
 * todas las marcas. No viaja al navegador ni siquiera como scoped key (§7 del contrato);
 * el navegador del cliente habla solo con NUESTRAS rutas.
 *
 * Lo que lo garantiza hoy es `import crypto from 'node:crypto'`: un import de `node:` hace
 * fallar el bundle de cliente en el acto. No se agrega el paquete `server-only` porque no
 * está en el proyecto y meter una dependencia nueva para reforzar algo que el import de
 * Node ya impide sería cambio de más — pero **si algún día esta línea desaparece, el
 * guardia desaparece con ella**.
 *
 * Verificado contra `Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §3.
 * Las rutas NO se inventan: salen de ese archivo.
 *
 * QUÉ NO ESTÁ ACÁ, A PROPÓSITO
 * ────────────────────────────
 * · `/v1/connect/whatsapp/credentials` (§3.c). Re-suscribe la WABA del cliente a un
 *   callback de Zernio y **corta el que el negocio ya tuviera**. En coexistencia, donde
 *   el número está vivo y quizá colgado de otra integración, eso es inaceptable. Queda
 *   como escotilla documentada, no implementada.
 * · `/v1/connect/whatsapp/select-phone-number` (§3.b.3). Decisión del dueño (2026-09-06):
 *   NO se implementa; se asume que ningún cliente tiene una WABA con 2+ números y el alta
 *   va acompañada por el equipo. Lo que sí es obligatorio es **detectar** el caso y
 *   decirlo — ver `SELECT_PHONE_NUMBER_STEP`.
 */

/**
 * El `step` con el que el flujo headless avisa que la WABA tiene 2+ números.
 *
 * No se implementa el paso, pero se DETECTA: la diferencia entre una deuda declarada y un
 * callejón sin salida es que el cliente lea «esto lo termina tu asesor» en vez de quedarse
 * mirando una pantalla que no avanza.
 */
export const SELECT_PHONE_NUMBER_STEP = 'select_phone_number'

/** Los dos modos de onboarding del §3.b. Salen del MISMO dato que `isCoexistence`. */
export type ZernioOnboarding = 'api' | 'business_app'

export interface StartWhatsappConnectArgs {
  profileId: string
  /**
   * A dónde vuelve el navegador del cliente.
   *
   * ⚠️ **NO es `/api/webhook/zernio`.** Esa ruta solo exporta `POST` y exige firma HMAC:
   * un navegador que aterrice ahí recibe **405**. El AIOS arma justamente esa URL (y, si
   * la variable está vacía, manda literalmente `https://zernio.com`), que es una de las
   * dos cosas rotas que este apartado viene a arreglar. El destino correcto es una PÁGINA
   * del panel: `/dashboard/conexiones/whatsapp/callback`.
   */
  redirectUrl: string
  onboarding: ZernioOnboarding
}

export interface StartWhatsappConnectResult {
  authUrl: string
  /**
   * El `state` de Zernio: `"user123-profile456-timestamp-callbackurl"`.
   *
   * ⚠️ **NO es un identificador de tenant confiable y no se usa para autorizar nada.** Se
   * guarda solo para trazabilidad. Quien identifica la conexión al volver es NUESTRO
   * nonce. Ver `newSignupNonce()`.
   */
  state: string | null
}

/** §3.b.1 — la URL del Embedded Signup de Meta. No conecta nada todavía. */
export async function startWhatsappConnect(
  args: StartWhatsappConnectArgs
): Promise<StartWhatsappConnectResult> {
  const qs = new URLSearchParams({
    profileId: args.profileId,
    redirect_url: args.redirectUrl,
    headless: 'true',
    onboarding: args.onboarding,
  })

  const body = await zernioFetch<{ authUrl?: string; state?: string }>(`/connect/whatsapp?${qs}`)

  if (!body?.authUrl) {
    throw new ZernioApiError('Zernio devolvió 200 sin authUrl en /connect/whatsapp', 200, body)
  }
  return { authUrl: body.authUrl, state: body.state ?? null }
}

export interface CompleteWhatsappConnectArgs {
  code: string
  profileId: string
  /**
   * Solo `code` y `profileId` son obligatorios para Zernio. Estos tres se mandan cuando se
   * tienen porque acotan la conexión a la línea que el cliente declaró.
   */
  wabaId?: string | null
  phoneNumberId?: string | null
  isCoexistence: boolean
  /**
   * ⚠️ **La única verificación real de que se conectó ESA línea y no otra.** Se manda
   * SIEMPRE que haya número declarado. En el AIOS ya es un gate y acá se mantiene: sin
   * esto, un `code` de otra pestaña conectaría la WABA equivocada y los mensajes de una
   * marca saldrían por el número de otra sin que nadie se entere.
   */
  expectedPhoneNumber?: string | null
}

export interface CompleteWhatsappConnectResult {
  accountId: string | null
  phoneNumber: string | null
  wabaId: string | null
  phoneNumberId: string | null
  /** `select_phone_number` cuando la WABA tiene 2+ números. Ver arriba. */
  step: string | null
  raw: unknown
}

/** §3.b.2 — cierra la conexión con el `code` que devolvió Meta. */
export async function completeWhatsappConnect(
  args: CompleteWhatsappConnectArgs
): Promise<CompleteWhatsappConnectResult> {
  const payload: Record<string, unknown> = {
    code: args.code,
    profileId: args.profileId,
    isCoexistence: args.isCoexistence,
  }
  if (args.wabaId) payload.wabaId = args.wabaId
  if (args.phoneNumberId) payload.phoneNumberId = args.phoneNumberId
  if (args.expectedPhoneNumber) payload.expectedPhoneNumber = args.expectedPhoneNumber

  const body = await zernioFetch<Record<string, unknown>>('/connect/whatsapp/embedded-signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return { ...readConnectResult(body), raw: body }
}

/**
 * Lee la respuesta de `embedded-signup`, que el contrato describe por su código de estado
 * y no por la forma exacta del cuerpo.
 *
 * Por eso se leen VARIOS nombres posibles en vez de uno: si mañana el cuerpo trae
 * `account.id` en lugar de `accountId`, esto sigue encontrando la cuenta en lugar de
 * devolver `null` y dejar la conexión colgada en `conectada` para siempre. Es una
 * tolerancia deliberada de lectura, no de escritura: lo que se guarda sigue siendo
 * exactamente un id o nada.
 *
 * Exportada porque es PURA y es lo único de este archivo que se puede probar sin red.
 */
export function readConnectResult(
  body: Record<string, unknown> | null | undefined
): Omit<CompleteWhatsappConnectResult, 'raw'> {
  const pick = (...paths: string[]): string | null => {
    for (const p of paths) {
      const value = p.split('.').reduce<unknown>(
        (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
        body ?? undefined
      )
      if (typeof value === 'string' && value.length > 0) return value
    }
    return null
  }

  return {
    accountId: pick('accountId', 'account.accountId', 'account.id', 'id'),
    phoneNumber: pick('phoneNumber', 'account.phoneNumber', 'number'),
    wabaId: pick('wabaId', 'account.wabaId'),
    phoneNumberId: pick('phoneNumberId', 'account.phoneNumberId'),
    step: pick('step'),
  }
}

/**
 * El nonce del Embedded Signup — **nuestro**, no el de Zernio.
 *
 * 32 bytes de `randomBytes` en base64url: no adivinable, y por lo tanto no falsificable
 * desde otra pestaña. Se guarda en la fila al abrir el signup y se compara al volver; un
 * `code` que llegue sin nonce válido devuelve **409 y NO cierra la conexión**.
 *
 * Se usa `crypto.randomBytes` y no `Math.random()` a propósito: de este valor cuelga que
 * los mensajes de una marca no salgan por el número de otra.
 */
export function newSignupNonce(): string {
  return crypto.randomBytes(32).toString('base64url')
}
