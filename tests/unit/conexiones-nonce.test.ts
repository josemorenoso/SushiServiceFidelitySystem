import { describe, it, expect } from 'vitest'
import { newSignupNonce, readConnectResult, SELECT_PHONE_NUMBER_STEP } from '@/lib/zernio/connect'
import { onboardingForRoute, isValidE164 } from '@/services/connection.service'

/**
 * Las piezas puras de C2. Las tres cuidan la misma frontera: **que los mensajes de una
 * marca no salgan por el número de otra**.
 */

describe('newSignupNonce — el nonce es NUESTRO, no el `state` de Zernio', () => {
  it('es largo e impredecible', () => {
    // El `state` que devuelve Zernio ("user123-profile456-timestamp-callbackurl") es
    // ADIVINABLE: lleva un timestamp y una URL que cualquiera conoce. Por eso no sirve
    // para identificar la conexión y este nonce sí.
    const n = newSignupNonce()
    expect(n.length).toBeGreaterThanOrEqual(40)
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/) // base64url: entra tal cual en una URL
  })

  it('no se repite: 500 nonces son 500 valores distintos', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 500; i++) vistos.add(newSignupNonce())
    // Un choque haría que un `code` cerrara la conexión de OTRA marca, que es exactamente
    // el desastre que el nonce existe para impedir.
    expect(vistos.size).toBe(500)
  })
})

describe('onboardingForRoute — `onboarding` e `isCoexistence` salen del MISMO dato', () => {
  it('coexistencia = business_app + isCoexistence true', () => {
    expect(onboardingForRoute('coexistence')).toEqual({ onboarding: 'business_app', isCoexistence: true })
  })

  it('número ya en Cloud API = api + isCoexistence false', () => {
    expect(onboardingForRoute('byo_cloud_api')).toEqual({ onboarding: 'api', isCoexistence: false })
  })

  it('no pueden contradecirse: son una sola decisión proyectada', () => {
    // Si fueran dos campos independientes, un día alguien mandaría `business_app` con
    // `isCoexistence: false` y Zernio conectaría el número por el camino equivocado —
    // rompiéndole al restaurante la app de WhatsApp Business que tiene viva en el teléfono.
    for (const route of ['coexistence', 'byo_cloud_api'] as const) {
      const r = onboardingForRoute(route)
      expect(r.isCoexistence).toBe(r.onboarding === 'business_app')
    }
  })
})

describe('isValidE164 — el mismo formato en los tres sitios', () => {
  it('acepta E.164 con +', () => {
    expect(isValidE164('+573001234567')).toBe(true)
    expect(isValidE164('+12025550123')).toBe(true)
  })

  it('rechaza lo que el CHECK de la 00054 también rechaza', () => {
    // Si esta validación fuera más laxa que el CHECK, el error saldría del motor como un
    // 500 en vez de como un mensaje que el cliente pueda corregir.
    expect(isValidE164('3001234567')).toBe(false)
    expect(isValidE164('573001234567')).toBe(false)
    expect(isValidE164('+57 300 123 4567')).toBe(false)
    expect(isValidE164('whatsapp:+573001234567')).toBe(false)
    expect(isValidE164('')).toBe(false)
  })
})

describe('readConnectResult — leer la respuesta de Zernio sin quedarse colgado', () => {
  it('encuentra la cuenta esté donde esté', () => {
    // El contrato describe esta respuesta por su código de estado, no por la forma exacta
    // del cuerpo. Leer un solo nombre dejaría la conexión en `conectada` para siempre el
    // día que Zernio la anide.
    expect(readConnectResult({ accountId: 'acc_1' }).accountId).toBe('acc_1')
    expect(readConnectResult({ account: { accountId: 'acc_2' } }).accountId).toBe('acc_2')
    expect(readConnectResult({ account: { id: 'acc_3' } }).accountId).toBe('acc_3')
  })

  it('detecta el paso que NO se implementa', () => {
    // `select_phone_number` no se implementa (decisión del dueño), pero se DETECTA: es la
    // diferencia entre una deuda declarada y un callejón sin salida.
    expect(readConnectResult({ step: SELECT_PHONE_NUMBER_STEP }).step).toBe(SELECT_PHONE_NUMBER_STEP)
  })

  it('un cuerpo vacío o nulo devuelve nulls, no revienta', () => {
    // Y con `accountId: null` la ruta NO activa: `activa` exige cuenta Y número, la misma
    // invariante que corta `sendViaZernio()`.
    expect(readConnectResult(null).accountId).toBeNull()
    expect(readConnectResult({}).phoneNumber).toBeNull()
    expect(readConnectResult({ accountId: '' }).accountId).toBeNull()
    expect(readConnectResult({ accountId: 123 as unknown as string }).accountId).toBeNull()
  })
})
