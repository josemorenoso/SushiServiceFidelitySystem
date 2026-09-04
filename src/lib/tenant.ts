import { createClient } from '@supabase/supabase-js'
import { createClient as createSSRClient } from '@/lib/supabase/server'
import type { Tenant } from '@/types/tenant.types'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import {
  pickLocationForHost,
  type ActiveLocation,
  type HostLocationSource,
} from '@/lib/location-resolver'

// Cliente service-role para resolver tenants en rutas públicas / webhooks (sin cookies).
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

const TENANT_COLUMNS =
  'id, slug, name, business_type, config, domain, twilio_subaccount_sid, twilio_subaccount_auth_token, twilio_messaging_service_sid, twilio_whatsapp_number, is_active, is_demo, messaging_provider, zernio_profile_id, zernio_account_id, zernio_phone_number, created_at'

/**
 * Normaliza un host header a la forma que guardamos en `tenants.domain`.
 * Quita el puerto y el prefijo `www.`; pasa a minúsculas.
 * Ej: "Club Sushi:3000" → "club sushi"  (los hosts reales no tienen espacios).
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null
  const clean = host.split(':')[0].trim().toLowerCase()
  if (!clean) return null
  return clean.startsWith('www.') ? clean.slice(4) : clean
}

/** Resolver tenant por dominio (host header) — rutas públicas: check-in. */
export async function getTenantByDomain(host: string | null | undefined): Promise<Tenant | null> {
  const domain = normalizeHost(host)
  if (!domain) return null
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('domain', domain)
    .eq('is_active', true)
    .single()
  if (error || !data) return null
  return data as Tenant
}

/**
 * Marca + SEDE resueltas desde el host. Es la vía 3 del §3.1 del spec de multi-sede.
 *
 * ⚠️ `getTenantByDomain()` de arriba **CONSERVA SU FIRMA INTACTA**: cambiarla para que
 * devolviera también la sede tocaría 16 archivos de golpe. La sede viaja por aquí.
 */
export interface HostContext {
  /** `null` = ni la marca ni ninguna sede reclaman este host (el llamador responde 404). */
  tenant: Tenant | null
  /** Sede resuelta por el host, o `null` = sede desconocida. */
  locationId: string | null
  /** Procedencia del dato: `'host'` (subdominio de la sede) o `'host_single'` (§3.2). */
  locationSource: HostLocationSource | null
  /**
   * `true` cuando el host es el dominio RAÍZ y la marca tiene 2+ sedes activas.
   * El registro de un cliente nuevo responde **409 con `locationChoices`** (§3.2).
   */
  requiresLocationChoice: boolean
  /** Las sedes entre las que elegir. Vacío salvo en el caso del 409. */
  locationChoices: ActiveLocation[]
}

const EMPTY_HOST_CONTEXT: HostContext = {
  tenant: null,
  locationId: null,
  locationSource: null,
  requiresLocationChoice: false,
  locationChoices: [],
}

const LOCATION_COLUMNS = 'id, name, slug, domain, is_primary'

/**
 * Resuelve MARCA + SEDE a partir del host de la petición. Fase F3 de multi-sede.
 *
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §3.1, §3.2 y §3.3.
 * La decisión de QUÉ sede sale del host es pura y vive en `pickLocationForHost()`
 * (`src/lib/location-resolver.ts`); aquí solo está el I/O.
 *
 * DOS CAMINOS PARA LLEGAR A LA MARCA
 * ──────────────────────────────────
 *   1. `tenants.domain`               → el dominio raíz, el que ya está impreso en los QR.
 *   2. `restaurant_locations.domain`  → el subdominio propio de una sede (único GLOBAL,
 *      00041). Sin este segundo camino, `laureles.marca.com` devolvería 404 y la sede
 *      2..N no podría existir: `getTenantByDomain()` solo mira `tenants`.
 *
 * FALLA BLANDO EN LA SEDE, NUNCA EN LA MARCA
 * ──────────────────────────────────────────
 * Si la consulta de sedes falla, se devuelve la marca con sede `null` ("sede desconocida")
 * en vez de propagar el error. El check-in es el camino más caliente del producto: perder
 * la atribución de una visita es un dato menos; tumbar el check-in es un cliente menos.
 */
export async function resolveHostContext(host: string | null | undefined): Promise<HostContext> {
  const domain = normalizeHost(host)
  if (!domain) return EMPTY_HOST_CONTEXT

  let tenant = await getTenantByDomain(host)

  // Camino 2: el host es el subdominio de una sede, no el de la marca.
  if (!tenant) {
    const supabase = getServiceClient()
    const { data: sede, error: sedeError } = await supabase
      .from('restaurant_locations')
      .select('tenant_id')
      .eq('domain', domain)
      .eq('is_active', true)
      .maybeSingle()

    // OJO: el "falla blando en la sede" del comentario de arriba se refiere a
    // `getActiveLocations()`, que decide QUÉ SEDE. Esta consulta es otra cosa: decide la
    // MARCA. Si falla y se devuelve `EMPTY_HOST_CONTEXT`, el llamador responde 404 y
    // `laureles.marca.com` deja de existir para todo el mundo — un fallo de base
    // disfrazado de "ese host no es de nadie". Se registra para que se vea.
    if (isDbFailure(sedeError)) {
      logDbFailure({
        scope: 'Tenant',
        reason: 'location_domain_lookup_error',
        error: sedeError,
        context: { domain },
      })
      return EMPTY_HOST_CONTEXT
    }

    if (!sede?.tenant_id) return EMPTY_HOST_CONTEXT

    const porSede = await getTenantById(sede.tenant_id as string)
    // `getTenantById` no filtra `is_active`; `getTenantByDomain` sí. Se iguala el criterio
    // para que un subdominio de sede no reviva una marca desactivada.
    if (!porSede || porSede.is_active === false) return EMPTY_HOST_CONTEXT
    tenant = porSede
  }

  const activas = await getActiveLocations(tenant.id)
  const pick = pickLocationForHost(domain, normalizeHost(tenant.domain), activas)

  return {
    tenant,
    locationId: pick.locationId,
    locationSource: pick.source,
    requiresLocationChoice: pick.requiresChoice,
    locationChoices: pick.choices,
  }
}

/**
 * Sedes activas de una marca, en el orden en que se le muestran a una persona:
 * la principal primero, después `sort_order`, y `name` como desempate estable.
 *
 * El `.eq('tenant_id', …)` no es decorativo: la app corre con `service_role` en 55
 * archivos, así que el RLS no aísla nada. El aislamiento son estos filtros a mano.
 */
export async function getActiveLocations(tenantId: string): Promise<ActiveLocation[]> {
  if (!tenantId) return []
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('restaurant_locations')
    .select(LOCATION_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error || !data) {
    if (error) console.error('[Tenant] No se pudieron leer las sedes:', error.message)
    return []
  }
  return data as ActiveLocation[]
}

/** Todos los tenants activos — usado por crons que procesan todos los clientes en un solo disparo (birthday, reactivation). */
export async function getActiveTenants(): Promise<Tenant[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('is_active', true)
  if (error || !data) return []
  return data as Tenant[]
}

/** Resolver tenant por id — usado por crons de sistema que iteran filas con tenant_id. */
export async function getTenantById(id: string): Promise<Tenant | null> {
  if (!id) return null
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as Tenant
}

/** Resolver tenant por slug — usado por webhooks de n8n (tenant_slug en el body). */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  if (!slug) return null
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  if (error || !data) return null
  return data as Tenant
}

/** Resolver tenant por MessagingServiceSid — webhook de estado de Twilio. */
export async function getTenantByMessagingService(msid: string): Promise<Tenant | null> {
  if (!msid) return null
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('twilio_messaging_service_sid', msid)
    .eq('is_active', true)
    .single()
  if (error || !data) return null
  return data as Tenant
}

/** Resolver tenant por número de WhatsApp (To) — fallback del webhook de Twilio. */
export async function getTenantByWhatsappNumber(number: string): Promise<Tenant | null> {
  if (!number) return null
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('twilio_whatsapp_number', number)
    .eq('is_active', true)
    .single()
  if (error || !data) return null
  return data as Tenant
}

/** Resolver tenant por zernio_account_id — webhook entrante de Zernio (payload.account.id). */
export async function getTenantByZernioAccountId(accountId: string): Promise<Tenant | null> {
  if (!accountId) return null
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('zernio_account_id', accountId)
    .eq('is_active', true)
    .single()
  if (error || !data) return null
  return data as Tenant
}

/**
 * Resolver el tenant_id del usuario autenticado (dashboard).
 * Lee `app_metadata.tenant_id` del JWT. Requiere que el admin haya hecho re-login
 * después de la migración para que el token traiga el tenant_id.
 */
export async function getTenantIdFromJwt(): Promise<string | null> {
  const supabase = await createSSRClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const tenantId = user.app_metadata?.tenant_id as string | undefined
  return tenantId ?? null
}

/** Igual que getTenantIdFromJwt pero lanza si no hay tenant — para rutas que lo exigen. */
export async function requireTenantId(): Promise<string> {
  const tenantId = await getTenantIdFromJwt()
  if (!tenantId) {
    throw new Error('No tenant_id en el JWT. El admin debe re-loguearse tras la migración multitenant.')
  }
  return tenantId
}
