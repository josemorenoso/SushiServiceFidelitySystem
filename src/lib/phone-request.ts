/**
 * Tronco común de los endpoints públicos identificados por teléfono.
 *
 * `review-prompt` (GET) y `review-action` (POST) hacían la misma secuencia copiada línea a
 * línea: validar el número → rate limit → resolver el tenant por dominio → buscar al cliente.
 * Aquí vive una sola vez. Cada ruta decide qué HTTP devolver para cada `reason` —porque ahí
 * SÍ difieren: `review-prompt` trata al cliente desconocido como "no mostrar el pop-up", no
 * como un 404—, así que el helper resuelve pero no responde.
 */

import { validatePhone } from '@/lib/validators/phone'
import { rateLimit } from '@/lib/rate-limit'
import { getTenantByDomain } from '@/lib/tenant'
import { findCustomerByPhone } from '@/services/customer.service'
import type { Customer } from '@/types/database.types'
import type { Tenant } from '@/types/tenant.types'

export type PhoneRequestFailure = 'invalid_phone' | 'rate_limited' | 'no_tenant' | 'no_customer'

export type PhoneRequestResult =
  | { ok: true; tenant: Tenant; customer: Customer; cleaned: string }
  | { ok: false; reason: PhoneRequestFailure; retryAfterSeconds?: number }

export async function resolvePhoneRequest(params: {
  phone: string | null | undefined
  host: string | null | undefined
  /** Prefijo de la clave de rate limit (se le concatena `:${cleaned}`). */
  rateLimitKey: string
  rateLimitMax: number
  rateLimitWindowMs?: number
}): Promise<PhoneRequestResult> {
  if (!params.phone) return { ok: false, reason: 'invalid_phone' }

  const { valid, cleaned } = validatePhone(params.phone)
  if (!valid) return { ok: false, reason: 'invalid_phone' }

  const rl = rateLimit(`${params.rateLimitKey}:${cleaned}`, params.rateLimitMax, params.rateLimitWindowMs ?? 60_000)
  if (!rl.allowed) return { ok: false, reason: 'rate_limited', retryAfterSeconds: rl.retryAfterSeconds }

  const tenant = await getTenantByDomain(params.host)
  if (!tenant) return { ok: false, reason: 'no_tenant' }

  const customer = await findCustomerByPhone(cleaned, tenant.id)
  if (!customer) return { ok: false, reason: 'no_customer' }

  return { ok: true, tenant, customer, cleaned }
}
