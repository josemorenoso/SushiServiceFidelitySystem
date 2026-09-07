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

// ═══════════════════════════════════════════════════════════════════════════
// FASE C2 — el alta. A partir de acá se lee y escribe `tenant_connections`
// (migración 00054) y se habla con Zernio.
// ═══════════════════════════════════════════════════════════════════════════

/** Los tres caminos del §2 del diseño. Se manda SIEMPRE explícito a Zernio. */
export type ConnectionRoute = 'coexistence' | 'byo_cloud_api' | 'zernio_number'

export type ConnectionStatus =
  | 'sin_empezar'
  | 'camino_elegido'
  | 'kyc_pendiente'
  | 'numero_declarado'
  | 'numero_comprado'
  | 'signup_abierto'
  | 'verificacion_pendiente'
  | 'conectada'
  | 'activa'
  | 'fallida'
  | 'suspendida'
  | 'liberada'

export interface TenantConnection {
  id: string
  tenant_id: string
  provider: string
  label: string | null
  route: ConnectionRoute | null
  status: ConnectionStatus
  phone_e164: string | null
  zernio_profile_id: string | null
  zernio_account_id: string | null
  waba_id: string | null
  phone_number_id: string | null
  signup_opened_at: string | null
  is_primary: boolean
  purchase_allowed: boolean
  monthly_price_cop: number | null
  last_event: string | null
  last_event_at: string | null
  last_error: string | null
}

/**
 * Las columnas que salen hacia el navegador.
 *
 * ⚠️ `signup_nonce` **NO está en esta lista, y es la razón por la que la lista existe.**
 * Un `select('*')` lo mandaría al cliente, y el nonce es justo lo que impide que un `code`
 * de otra pestaña conecte la WABA equivocada. Si viaja, deja de ser un secreto y deja de
 * servir para nada.
 */
const CONNECTION_COLUMNS =
  'id, tenant_id, provider, label, route, status, phone_e164, zernio_profile_id, ' +
  'zernio_account_id, waba_id, phone_number_id, signup_opened_at, is_primary, ' +
  'purchase_allowed, monthly_price_cop, last_event, last_event_at, last_error'

/** `route` → los dos campos que Zernio quiere, derivados del MISMO dato (§2). */
export function onboardingForRoute(route: ConnectionRoute): {
  onboarding: 'api' | 'business_app'
  isCoexistence: boolean
} {
  // No pueden contradecirse porque no son dos decisiones: son una sola, proyectada.
  // Es exactamente como quedó en el AIOS.
  return route === 'coexistence'
    ? { onboarding: 'business_app', isCoexistence: true }
    : { onboarding: 'api', isCoexistence: false }
}

/** E.164 con '+', el mismo patrón que el CHECK de la 00054 y el de la 00036. */
export function isValidE164(phone: string): boolean {
  return /^\+[0-9]{7,15}$/.test(phone)
}

/**
 * La línea principal de la marca, si existe. `null` = todavía no empezó el alta.
 *
 * NUNCA se busca por un id que venga del cliente: se busca por el `tenantId` de la sesión.
 */
export async function getPrimaryConnection(tenantId: string): Promise<TenantConnection | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenant_connections')
    .select(CONNECTION_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('provider', 'whatsapp_zernio')
    .eq('is_primary', true)
    .maybeSingle<TenantConnection>()

  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'connection_read_error',
      error,
      context: { tenant_id: tenantId },
    })
    throw new Error(`No se pudo leer la conexión: ${error.message}`)
  }
  return data ?? null
}

/**
 * La línea principal, creándola si todavía no existe.
 *
 * El INSERT lleva `tenant_id` EXPLÍCITO. La 00030 no está aplicada: un INSERT que lo
 * olvide se va calladito a Sushi Service, sin error.
 */
export async function ensurePrimaryConnection(tenantId: string): Promise<TenantConnection> {
  const existing = await getPrimaryConnection(tenantId)
  if (existing) return existing

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenant_connections')
    .insert({
      tenant_id: tenantId,
      provider: 'whatsapp_zernio',
      label: 'Línea principal',
      status: 'sin_empezar',
      is_primary: true,
    })
    .select(CONNECTION_COLUMNS)
    .single<TenantConnection>()

  if (error || !data) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'connection_create_error',
      error,
      context: { tenant_id: tenantId },
    })
    throw new Error(`No se pudo crear la conexión: ${error?.message ?? 'sin datos'}`)
  }
  return data
}

/**
 * Un UPDATE acotado a (id, tenant_id).
 *
 * El `AND tenant_id` no es decorativo: sin él, un id filtrado dejaría escribir sobre la
 * conexión de otra marca. Es la misma regla que el `AND tenant_id` de
 * `connection_apply_whatsapp()` en la 00054.
 */
async function updateConnection(
  tenantId: string,
  connectionId: string,
  patch: Record<string, unknown>,
  reason: string
): Promise<TenantConnection> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenant_connections')
    .update({ ...patch, last_event: reason, last_event_at: new Date().toISOString() })
    .eq('id', connectionId)
    .eq('tenant_id', tenantId)
    .select(CONNECTION_COLUMNS)
    .maybeSingle<TenantConnection>()

  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'Conexiones',
      reason: `connection_update_${reason}`,
      error,
      context: { tenant_id: tenantId, connection_id: connectionId },
    })
    // `camino_congelado` y `conexion_de_otra_marca` son EXCEPCIONES del motor: llegan acá
    // como error de PostgREST y se propagan con su nombre para que la ruta pueda
    // convertirlas en un 409 con causa, y no en un 500 mudo.
    throw new Error(error.message)
  }
  if (!data) {
    // Cero filas sin error = el id no es de esta marca. Es el intento de escribir sobre
    // otra marca, y se trata como tal.
    throw new Error('conexion_de_otra_marca')
  }
  return data
}

/** Fija el camino. El trigger de la 00054 lo CONGELA si ya hay número o signup abierto. */
export async function setConnectionRoute(
  tenantId: string,
  route: ConnectionRoute
): Promise<TenantConnection> {
  const conn = await ensurePrimaryConnection(tenantId)
  return updateConnection(
    tenantId,
    conn.id,
    { route, status: conn.status === 'sin_empezar' ? 'camino_elegido' : conn.status },
    'camino_elegido'
  )
}

/** Declara el número propio (caminos A y B). */
export async function setConnectionPhone(
  tenantId: string,
  phone: string
): Promise<TenantConnection> {
  const conn = await ensurePrimaryConnection(tenantId)
  return updateConnection(
    tenantId,
    conn.id,
    { phone_e164: phone, status: 'numero_declarado' },
    'numero_declarado'
  )
}

/** Guarda el nonce propio y marca el signup como abierto. */
export async function openSignup(
  tenantId: string,
  connectionId: string,
  nonce: string
): Promise<TenantConnection> {
  return updateConnection(
    tenantId,
    connectionId,
    {
      signup_nonce: nonce,
      signup_opened_at: new Date().toISOString(),
      status: 'signup_abierto',
      last_error: null,
    },
    'signup_abierto'
  )
}

/**
 * Resuelve una conexión POR NONCE. Es la puerta de vuelta del Embedded Signup.
 *
 * Devuelve `null` si el nonce no existe — y el llamador contesta **409 sin cerrar nada**.
 * No se acepta ningún otro identificador para esto: ni el `state` de Zernio, ni un
 * `connectionId` del cliente, ni el `profileId`. Los tres son adivinables o falsificables
 * desde otra pestaña; el nonce, no.
 */
export async function findConnectionByNonce(nonce: string): Promise<TenantConnection | null> {
  // Un nonce corto no se consulta siquiera: `newSignupNonce()` produce 43 caracteres, así
  // que cualquier cosa más corta es basura o un intento, no una vuelta legítima.
  if (!nonce || nonce.length < 16) return null

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenant_connections')
    .select(CONNECTION_COLUMNS)
    .eq('signup_nonce', nonce)
    .maybeSingle<TenantConnection>()

  if (isDbFailure(error)) {
    logDbFailure({ scope: 'Conexiones', reason: 'nonce_lookup_error', error, context: {} })
    // Fail-closed: si no se puede comprobar el nonce, NO se cierra la conexión.
    throw new Error(`No se pudo verificar el nonce: ${error.message}`)
  }
  return data ?? null
}

/** Marca la conexión como fallida, con el motivo REAL a la vista del cliente. */
export async function failConnection(
  tenantId: string,
  connectionId: string,
  detail: string
): Promise<void> {
  await updateConnection(tenantId, connectionId, { status: 'fallida', last_error: detail }, 'fallida')
}

/**
 * Cierra la conexión: activa Zernio para la marca en UNA transacción.
 *
 * Delega en `connection_apply_whatsapp()` (00054) y **no escribe `tenants` por su cuenta**.
 * Ese es el punto entero de «un cuerpo, dos puertas»: si Conexiones tuviera su propia
 * validación, un día un tenant quedaría con `messaging_provider='zernio'` y sin
 * `account_id` — el caso exacto que `sendViaZernio()` corta con `zernio_not_configured`.
 */
export async function applyWhatsappConnection(args: {
  tenantId: string
  profileId: string | null
  accountId: string
  phone: string
}): Promise<string> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('connection_apply_whatsapp', {
    p_tenant_id: args.tenantId,
    p_profile_id: args.profileId,
    p_account_id: args.accountId,
    p_phone: args.phone,
  })

  if (error) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'apply_whatsapp_error',
      error,
      context: { tenant_id: args.tenantId, account_id: args.accountId },
    })
    throw new Error(error.message)
  }
  return data as string
}
