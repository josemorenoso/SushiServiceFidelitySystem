/**
 * El defecto: `/api/webhook/twilio-incoming` validaba SIEMPRE contra el token MASTER
 * (`TWILIO_AUTH_TOKEN`), pero Twilio firma con el token de la cuenta DUEÑA DEL NÚMERO —
 * la subcuenta de cada tenant (Sushi Fun y cualquiera con `twilio_subaccount_auth_token`).
 * Nunca podían coincidir: 403 a todo mensaje entrante de esos tenants, y sus `SALIR` se
 * perdían en silencio.
 *
 * El arreglo invierte el orden: resolver el tenant por `To` PRIMERO (solo para elegir el
 * secreto), validar DESPUÉS con `tenant.twilio_subaccount_auth_token ?? TWILIO_AUTH_TOKEN`.
 * Esto no debilita nada — sigue siendo fail-closed en cada rama.
 *
 * Ref: `src/lib/validators/twilio.ts`, `src/app/api/webhook/twilio-incoming/route.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { validateTwilioSignature } from '@/lib/validators/twilio'
import type { Tenant } from '@/types/tenant.types'

/** Firma un request como lo haría Twilio — mismo algoritmo, para armar los vectores de prueba. */
function firmar(url: string, params: Record<string, string>, authToken: string): string {
  const sortedKeys = Object.keys(params).sort()
  const dataString = sortedKeys.reduce((acc, key) => acc + key + params[key], url)
  return crypto.createHmac('sha1', authToken).update(Buffer.from(dataString, 'utf-8')).digest('base64')
}

// ═══════════════════════════════════════════════════════════════
// 1. validateTwilioSignature — el HMAC en sí, contra el token correcto
// ═══════════════════════════════════════════════════════════════

describe('validateTwilioSignature — recibe el token explícito, no lee el entorno', () => {
  // Vector publicado por Twilio (docs de validación de firma / SDKs oficiales).
  const URL_EJEMPLO = 'https://mycompany.com/myapp.php?foo=1&bar=2'
  const PARAMS_EJEMPLO = {
    CallSid: 'CA1234567890ABCDE',
    Caller: '+14158675309',
    Digits: '1234',
    From: '+14158675309',
    To: '+18005551212',
  }
  const FIRMA_EJEMPLO = 'RSOYDt4T1cUTdK1PDd93/VVr8B8='

  it('el vector de ejemplo de Twilio valida contra SU token', () => {
    expect(validateTwilioSignature(URL_EJEMPLO, PARAMS_EJEMPLO, FIRMA_EJEMPLO, '12345')).toBe(true)
  })

  it('la MISMA firma no valida contra un token distinto (el núcleo del defecto)', () => {
    expect(validateTwilioSignature(URL_EJEMPLO, PARAMS_EJEMPLO, FIRMA_EJEMPLO, 'token-equivocado')).toBe(false)
  })

  it('round-trip: firma calculada con el token del tenant valida con ESE token', () => {
    const url = 'https://ejemplo.com/api/webhook/twilio-incoming'
    const params = { To: 'whatsapp:+573000000000', From: 'whatsapp:+573001112222', Body: 'hola' }
    const firma = firmar(url, params, 'token-del-tenant')
    expect(validateTwilioSignature(url, params, firma, 'token-del-tenant')).toBe(true)
  })

  it('sin token → false, fail-closed sin excepción por NODE_ENV', () => {
    const prevEnv = process.env.NODE_ENV
    vi.stubEnv('NODE_ENV', 'development')
    expect(validateTwilioSignature(URL_EJEMPLO, PARAMS_EJEMPLO, FIRMA_EJEMPLO, undefined)).toBe(false)
    expect(validateTwilioSignature(URL_EJEMPLO, PARAMS_EJEMPLO, FIRMA_EJEMPLO, null)).toBe(false)
    expect(validateTwilioSignature(URL_EJEMPLO, PARAMS_EJEMPLO, FIRMA_EJEMPLO, '')).toBe(false)
    vi.stubEnv('NODE_ENV', prevEnv ?? 'test')
    vi.unstubAllEnvs()
  })

  it('sin firma → false', () => {
    expect(validateTwilioSignature(URL_EJEMPLO, PARAMS_EJEMPLO, '', '12345')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. La ruta completa — el escenario real: ¿con qué token se valida cada tenant?
// ═══════════════════════════════════════════════════════════════

const getTenantByWhatsappNumber = vi.fn<(n: string) => Promise<Tenant | null>>()

vi.mock('@/lib/tenant', () => ({
  getTenantByWhatsappNumber: (n: string) => getTenantByWhatsappNumber(n),
}))

function tenantDePrueba(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-sushi-fun',
    slug: 'sushi-fun',
    name: 'Sushi Fun',
    business_type: 'restaurant',
    config: { brand_name: 'Sushi Fun' },
    domain: 'sushifun.example.com',
    twilio_subaccount_sid: null,
    twilio_subaccount_auth_token: null,
    twilio_messaging_service_sid: null,
    twilio_whatsapp_number: 'whatsapp:+573000000000',
    is_active: true,
    is_demo: false,
    messaging_provider: 'twilio',
    zernio_profile_id: null,
    zernio_account_id: null,
    zernio_phone_number: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// Un `From` corto (<8 dígitos tras normalizar) evita las ramas de domicilio/cooldown,
// que abren un cliente de Supabase real — no hace falta para probar SOLO la firma.
const REQUEST_URL = 'https://ejemplo.com/api/webhook/twilio-incoming'
const BODY_PARAMS = {
  To: 'whatsapp:+573000000000',
  From: 'whatsapp:+1234567',
  Body: 'hola, este es un mensaje cualquiera',
}

async function postWebhook(signature: string) {
  const { POST } = await import('@/app/api/webhook/twilio-incoming/route')
  const { NextRequest } = await import('next/server')
  const rawBody = new URLSearchParams(BODY_PARAMS).toString()
  const req = new NextRequest(REQUEST_URL, {
    method: 'POST',
    headers: { 'x-twilio-signature': signature },
    body: rawBody,
  })
  return POST(req)
}

describe('POST /api/webhook/twilio-incoming — valida con el token del TENANT, no el master', () => {
  beforeEach(() => {
    getTenantByWhatsappNumber.mockReset()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('firma buena con el token de la subcuenta del tenant → 200', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'token-master-del-entorno')
    const tenant = tenantDePrueba({ twilio_subaccount_auth_token: 'token-subcuenta-sushi-fun' })
    getTenantByWhatsappNumber.mockResolvedValueOnce(tenant)

    const firma = firmar(REQUEST_URL, BODY_PARAMS, 'token-subcuenta-sushi-fun')
    const res = await postWebhook(firma)

    expect(res.status).toBe(200)
  })

  it('la MISMA firma (calculada con el token del tenant) validada contra el master → 403', async () => {
    // Éste es el defecto en producción: la ruta antigua ignoraba la subcuenta y siempre
    // caía al master. Simulado acá con un tenant SIN token propio: la ruta cae al master
    // del entorno, y la firma —hecha con el token real de la subcuenta— no cuadra.
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'token-master-del-entorno')
    const tenant = tenantDePrueba({ twilio_subaccount_auth_token: null })
    getTenantByWhatsappNumber.mockResolvedValueOnce(tenant)

    const firma = firmar(REQUEST_URL, BODY_PARAMS, 'token-subcuenta-sushi-fun')
    const res = await postWebhook(firma)

    expect(res.status).toBe(403)
  })

  it('tenant desconocido → 200 sin actuar (NO 403: Twilio reintentaria)', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'token-master-del-entorno')
    getTenantByWhatsappNumber.mockResolvedValueOnce(null)

    // Firma tecnicamente valida contra el master — da igual: sin tenant no se actua.
    // Un 403 aca no protegeria nada (no hay accion que impedir) y si haria que Twilio
    // REINTENTE la entrega. Rechazar la accion y avisarle un error a Twilio son cosas
    // distintas; esta salida es la unica que no es fail-closed, y es deliberada.
    const firma = firmar(REQUEST_URL, BODY_PARAMS, 'token-master-del-entorno')
    const res = await postWebhook(firma)

    expect(res.status).toBe(200)
  })

  it('sin ningún token con el que validar (ni subcuenta ni master) → 403', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    const tenant = tenantDePrueba({ twilio_subaccount_auth_token: null })
    getTenantByWhatsappNumber.mockResolvedValueOnce(tenant)

    const firma = firmar(REQUEST_URL, BODY_PARAMS, 'cualquier-cosa')
    const res = await postWebhook(firma)

    expect(res.status).toBe(403)
  })
})
