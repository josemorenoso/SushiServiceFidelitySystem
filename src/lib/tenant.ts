import { createClient } from '@supabase/supabase-js'
import { createClient as createSSRClient } from '@/lib/supabase/server'
import type { Tenant } from '@/types/tenant.types'

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
