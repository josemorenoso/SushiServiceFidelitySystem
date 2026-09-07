import { createClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

/**
 * Connection Service — el estado de las conexiones del negocio con terceros.
 *
 * Fase **C1**: sin migración y sin una sola llamada a Zernio. Todo lo que devuelve sale
 * de columnas que YA existen (`tenants.messaging_provider`, `twilio_*`, `zernio_*`) y de
 * `admin_settings`, que ya es key-value con PK `(key, tenant_id)`.
 *
 * Por qué eso alcanza: hoy el cliente **no tiene dónde ver por qué número sale su
 * WhatsApp**. Esa mitad del valor no necesita ni tabla nueva ni API externa.
 *
 * ÁMBITO MARCA, SIEMPRE
 * ─────────────────────
 * Nada de acá se filtra por el selector de sede del encabezado (`LocationScope`). La
 * línea es de la MARCA y la comparten todas las sedes (D6, re-cerrada el 2026-09-07):
 * filtrar por sede escondería la línea y el cliente creería que no tiene WhatsApp.
 *
 * Ref: docs/features/conexiones.md · docs/superpowers/specs/2026-09-06-conexiones-design.md
 */

/**
 * La clave del interruptor de la auto-respuesta (§18.e).
 *
 * Vive en `admin_settings` y **no** en `tenants.config`, que es PÚBLICO por construcción
 * y viaja al navegador en cada página. Que un tercero sepa si el robot contesta o no es
 * inocuo, pero `config` es además la superficie que el propio tenant edita: una
 * preferencia que decide si el sistema le habla a los clientes reales del restaurante no
 * se pone ahí. `admin_settings` ya es key-value por tenant y por eso C1 no lleva migración.
 */
export const AUTO_REPLY_SETTING_KEY = 'whatsapp_auto_reply_enabled'

/**
 * El default es **PRENDIDA**, y es a propósito.
 *
 * §18.e recomienda apagarla en todo tenant que traiga su línea propia, pero el producto
 * **no sabe hoy** cuál es coexistente (ese dato vive en el AIOS). Elegir «apagada» como
 * default cambiaría en silencio el comportamiento vivo de las 5 marcas de Twilio. El
 * interruptor existe justamente para que alguien lo apague a propósito, marca por marca.
 */
export const AUTO_REPLY_DEFAULT = true

export type MessagingProvider = 'twilio' | 'zernio'

export interface WhatsappConnectionView {
  /** Con qué proveedor sale hoy el WhatsApp de esta marca. */
  provider: MessagingProvider
  /**
   * El número por el que sale, en el formato que lo guarda cada proveedor.
   * `null` = la marca no tiene línea configurada y no puede enviar nada.
   */
  phone: string | null
  /** ¿Está lista para enviar? Es la misma invariante que corta `sendViaZernio()`. */
  configured: boolean
  /**
   * `true` para los tenants de Twilio: la tarjeta es de SOLO LECTURA. No se les inventa
   * una fila ni se les ofrece un flujo que no les toca (regla de honestidad, §3).
   */
  readOnly: boolean
  /** El interruptor de §18.e, tal como está hoy para este tenant. */
  autoReplyEnabled: boolean
  /**
   * ¿La auto-respuesta llega a hacer algo con este proveedor? Solo el camino Twilio
   * contesta; el webhook de Zernio nunca mandó una auto-respuesta. Sin este dato la
   * pantalla le ofrecería a un tenant Zernio apagar algo que no está prendido.
   */
  autoReplyApplies: boolean
}

export interface ConnectionsView {
  tenantId: string
  whatsapp: WhatsappConnectionView
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/**
 * `'false'` es lo único que apaga. Cualquier otra cosa —y la ausencia de la clave— deja
 * el default.
 *
 * Es el mismo criterio que `isPointsSystemEnabled()` (`value !== 'false'`) y se elige por
 * la misma razón: una clave a medio escribir, o escrita con otro casing, no puede apagar
 * en silencio algo que hoy funciona. Pura, y exportada para poder probarla sin base.
 */
export function parseAutoReplySetting(value: string | null): boolean {
  if (value === null) return AUTO_REPLY_DEFAULT
  return value !== 'false'
}

/**
 * ¿Está prendida la auto-respuesta de este tenant?
 *
 * LANZA ante un fallo de base, igual que `getSettingValue()`. El llamador decide: el
 * webhook de entrada la trata como prendida (preservar el comportamiento de hoy vale más
 * que un silencio nuevo) y la pantalla devuelve 500 en vez de mentir sobre el estado.
 */
export async function isAutoReplyEnabled(tenantId: string): Promise<boolean> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', AUTO_REPLY_SETTING_KEY)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'auto_reply_read_error',
      error,
      context: { tenant_id: tenantId, key: AUTO_REPLY_SETTING_KEY },
    })
    throw new Error(`No se pudo leer el interruptor de auto-respuesta: ${error.message}`)
  }

  return parseAutoReplySetting(data?.value ?? null)
}

/** Prende o apaga la auto-respuesta. `tenant_id` va SIEMPRE explícito (la 00030 no está aplicada). */
export async function setAutoReplyEnabled(tenantId: string, enabled: boolean): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('admin_settings')
    .upsert(
      { key: AUTO_REPLY_SETTING_KEY, tenant_id: tenantId, value: enabled ? 'true' : 'false' },
      { onConflict: 'key,tenant_id' }
    )

  if (error) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'auto_reply_write_error',
      error,
      context: { tenant_id: tenantId, enabled },
    })
    throw new Error(`No se pudo guardar el interruptor de auto-respuesta: ${error.message}`)
  }
}

/**
 * Las columnas de `tenants` de las que sale la tarjeta. Nada más: ni un `auth_token` de
 * Twilio ni una clave de Zernio entran en esta forma, para que no puedan salir por
 * descuido hacia el navegador.
 */
export interface TenantMessagingRow {
  messaging_provider: string | null
  twilio_whatsapp_number: string | null
  zernio_account_id: string | null
  zernio_phone_number: string | null
}

/**
 * La proyección PURA: de las columnas de la marca a lo que ve la tarjeta.
 *
 * Está separada de la lectura porque acá vive la decisión que parte la pantalla en dos —
 * **Twilio ve una tarjeta de solo lectura y Zernio no** — y esa decisión merece probarse
 * sin base de datos ni sesión.
 */
export function projectWhatsappConnection(
  row: TenantMessagingRow,
  autoReplyEnabled: boolean
): WhatsappConnectionView {
  const provider: MessagingProvider = row.messaging_provider === 'zernio' ? 'zernio' : 'twilio'

  if (provider === 'zernio') {
    const phone = row.zernio_phone_number ?? null
    return {
      provider: 'zernio',
      phone,
      // La misma pareja que exige `sendViaZernio()`: sin las dos, el envío corta con
      // `zernio_not_configured`. Decir «activa» con una sola sería mentir en pantalla.
      configured: !!(phone && row.zernio_account_id),
      readOnly: false,
      autoReplyEnabled,
      autoReplyApplies: false,
    }
  }

  const twilioPhone = row.twilio_whatsapp_number ?? null
  return {
    provider: 'twilio',
    phone: twilioPhone,
    configured: !!twilioPhone,
    // SOLO LECTURA. Un tenant de Twilio trae su propia cuenta: no se le inventa una fila
    // ni se le ofrece un flujo de alta que no le corresponde (regla de honestidad, §3).
    readOnly: true,
    autoReplyEnabled,
    // Solo el camino Twilio contesta; el webhook de Zernio nunca mandó una auto-respuesta.
    autoReplyApplies: true,
  }
}

/**
 * La foto de las conexiones de una marca.
 *
 * Lee `tenants` con el cliente de servicio y **nunca** devuelve credenciales: de Twilio
 * sale solo el número, jamás el `auth_token` (que `TenantPublic` ya excluye por algo).
 */
export async function getConnectionsView(tenantId: string): Promise<ConnectionsView> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('messaging_provider, twilio_whatsapp_number, zernio_account_id, zernio_phone_number')
    .eq('id', tenantId)
    .maybeSingle<TenantMessagingRow>()

  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'tenant_read_error',
      error,
      context: { tenant_id: tenantId },
    })
    throw new Error(`No se pudo leer la marca: ${error.message}`)
  }
  if (!data) {
    // `null` sin `error` es el vacío legítimo: esa marca no existe. Ya se separó del
    // fallo real un par de líneas más arriba, que es de lo que trata `db-failure.ts`.
    throw new Error('La marca de esta sesión no existe')
  }

  return {
    tenantId,
    whatsapp: projectWhatsappConnection(data, await isAutoReplyEnabled(tenantId)),
  }
}
