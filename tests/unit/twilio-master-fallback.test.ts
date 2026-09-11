/**
 * La cuenta Twilio del env (`TWILIO_ACCOUNT_SID`) es de UNA marca. Hasta el
 * 2026-09-10 cualquier tenant sin subcuenta caía a ella: un cliente recién
 * creado en el AIOS vio las 27 plantillas de Sushi Service en su panel, y con
 * una campaña manual habría enviado desde el número de Sushi Service (y se le
 * habría cobrado a Sushi Service).
 *
 * `resolveTwilioAccount()` es la única regla y la comparten el envío, el
 * calendario, el sondeo de línea y el panel. Lo que se fija acá:
 *
 *  1. Un tenant sin subcuenta que NO es el master recibe `null`. Siempre.
 *  2. Solo el tenant cuyo id es `TWILIO_MASTER_TENANT_ID` usa el env.
 *  3. Sin esa variable, nadie usa el env (falla cerrado).
 *  4. Una subcuenta a medias (solo SID o solo token) no se completa con el master.
 *
 * Ref: docs/03-security.md § "Cuenta Twilio master"
 */

import { describe, it, expect } from 'vitest'
import { isTwilioMasterTenant, resolveTwilioAccount } from '@/lib/twilio/tenant-credentials'

const MASTER_ID = '11111111-1111-4111-8111-111111111111'
const OTRO_ID = '22222222-2222-4222-8222-222222222222'

const env = {
  TWILIO_ACCOUNT_SID: 'ACmaster',
  TWILIO_AUTH_TOKEN: 'token-master',
  TWILIO_WHATSAPP_NUMBER: 'whatsapp:+10000000000',
  TWILIO_MASTER_TENANT_ID: MASTER_ID,
}

const sinSubcuenta = (id: string) => ({
  id,
  twilio_subaccount_sid: null,
  twilio_subaccount_auth_token: null,
  twilio_whatsapp_number: null,
})

describe('resolveTwilioAccount — quién puede usar la cuenta del env', () => {
  it('un tenant sin subcuenta que no es el master NO recibe credenciales', () => {
    // El caso del 10: Planeta Wings recién creado, sin paso 4 del AIOS.
    expect(resolveTwilioAccount(sinSubcuenta(OTRO_ID), env)).toBeNull()
  })

  it('solo el tenant master usa el env, y con el número del env si no tiene el suyo', () => {
    expect(resolveTwilioAccount(sinSubcuenta(MASTER_ID), env)).toEqual({
      accountSid: 'ACmaster',
      authToken: 'token-master',
      whatsappNumber: 'whatsapp:+10000000000',
      usingSubaccount: false,
    })
  })

  it('sin TWILIO_MASTER_TENANT_ID nadie es el master: falla cerrado', () => {
    const sinMaster = { ...env, TWILIO_MASTER_TENANT_ID: undefined }
    expect(resolveTwilioAccount(sinSubcuenta(MASTER_ID), sinMaster)).toBeNull()
    expect(resolveTwilioAccount(sinSubcuenta(OTRO_ID), sinMaster)).toBeNull()
    expect(isTwilioMasterTenant(MASTER_ID, sinMaster)).toBe(false)
    expect(isTwilioMasterTenant(MASTER_ID, { ...env, TWILIO_MASTER_TENANT_ID: '   ' })).toBe(false)
  })

  it('sin tenant no hay cuenta (un JWT sin tenant_id ya no cae al master)', () => {
    expect(resolveTwilioAccount(null, env)).toBeNull()
    expect(resolveTwilioAccount(undefined, env)).toBeNull()
  })
})

describe('resolveTwilioAccount — la subcuenta manda y no se mezcla con el master', () => {
  it('con SID y token propios usa la subcuenta y SU número, aunque sea el master', () => {
    const tenant = {
      id: MASTER_ID,
      twilio_subaccount_sid: 'ACsub',
      twilio_subaccount_auth_token: 'token-sub',
      twilio_whatsapp_number: 'whatsapp:+573001112233',
    }
    expect(resolveTwilioAccount(tenant, env)).toEqual({
      accountSid: 'ACsub',
      authToken: 'token-sub',
      whatsappNumber: 'whatsapp:+573001112233',
      usingSubaccount: true,
    })
  })

  it('una subcuenta sin número no toma prestado el número del env', () => {
    const tenant = {
      id: OTRO_ID,
      twilio_subaccount_sid: 'ACsub',
      twilio_subaccount_auth_token: 'token-sub',
      twilio_whatsapp_number: null,
    }
    expect(resolveTwilioAccount(tenant, env)?.whatsappNumber).toBeNull()
  })

  it('una subcuenta a medias (solo SID o solo token) no se completa con el master', () => {
    const soloSid = { ...sinSubcuenta(OTRO_ID), twilio_subaccount_sid: 'ACsub' }
    const soloToken = { ...sinSubcuenta(OTRO_ID), twilio_subaccount_auth_token: 'token-sub' }
    expect(resolveTwilioAccount(soloSid, env)).toBeNull()
    expect(resolveTwilioAccount(soloToken, env)).toBeNull()
    // El master con subcuenta a medias usa el env ENTERO, nunca el SID de la
    // subcuenta con el token master (eso es un 401 de Twilio).
    expect(resolveTwilioAccount({ ...soloSid, id: MASTER_ID }, env)).toMatchObject({
      accountSid: 'ACmaster',
      authToken: 'token-master',
      usingSubaccount: false,
    })
  })
})
