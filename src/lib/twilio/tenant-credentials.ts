// `@/lib/tenant` arrastra `next/headers` (cookies del SSR). Se importa dentro de
// `getTenantTwilioCredentials()` y no arriba para que `resolveTwilioAccount()`,
// que es pura y la usan whatsapp/calendar/line-health, siga siendo importable
// desde vitest y desde cualquier sitio sin request.

/**
 * Credenciales Twilio resueltas para el tenant del dashboard.
 * `basicAuth` sirve tanto para la Content API (content.twilio.com) como para la
 * REST API (api.twilio.com), ambas usan Basic auth con SID:token.
 */
export interface TenantTwilioCredentials {
  accountSid: string
  authToken: string
  /** Header `Authorization` listo: "Basic base64(accountSid:authToken)". */
  basicAuth: string
  whatsappNumber: string | null
  /** true si se resolvió con la subcuenta del tenant; false si es el tenant master usando el env. */
  usingSubaccount: boolean
}

/** Lo mínimo que hay que saber de un tenant para decidir con qué cuenta Twilio habla. */
export interface TwilioAccountSource {
  id: string
  twilio_subaccount_sid: string | null
  twilio_subaccount_auth_token: string | null
  twilio_whatsapp_number?: string | null
}

export interface ResolvedTwilioAccount {
  accountSid: string
  authToken: string
  whatsappNumber: string | null
  usingSubaccount: boolean
}

/** Las cuatro variables que importan; `process.env` encaja por ser un diccionario de strings. */
type TwilioEnv = Record<string, string | undefined>

/**
 * ¿Este tenant es el dueño de la cuenta Twilio del env (`TWILIO_ACCOUNT_SID`)?
 *
 * Esa cuenta es de UNA marca (hoy Sushi Service) y solo ella puede operar con
 * esas credenciales. Se identifica por `TWILIO_MASTER_TENANT_ID` (el uuid de
 * `tenants.id`). Si la variable no está puesta, NADIE es el master: falla
 * cerrado a propósito — el 2026-09-10 un tenant recién creado en el AIOS, sin
 * subcuenta, vio las 27 plantillas de Sushi Service y habría podido crear
 * plantillas en su cuenta y mandar campañas desde su número.
 */
export function isTwilioMasterTenant(
  tenantId: string | null | undefined,
  env: TwilioEnv = process.env
): boolean {
  const master = env.TWILIO_MASTER_TENANT_ID?.trim()
  return Boolean(master && tenantId && tenantId === master)
}

/**
 * La ÚNICA regla para elegir cuenta Twilio, pura y compartida por el envío
 * (`whatsapp.service`), el calendario, el sondeo de línea y el panel:
 *
 *  1. Subcuenta propia (SID **y** token, nunca uno solo): esa, con SU número.
 *     No se mezcla el SID de la subcuenta con el token o el número del master.
 *  2. Sin subcuenta y el tenant es el master (`TWILIO_MASTER_TENANT_ID`): el env.
 *  3. Cualquier otro caso: `null`. Sin tenant, sin subcuenta y sin ser el
 *     master no hay cuenta con la que hablar — y no se inventa una.
 */
export function resolveTwilioAccount(
  tenant: TwilioAccountSource | null | undefined,
  env: TwilioEnv = process.env
): ResolvedTwilioAccount | null {
  if (!tenant) return null

  if (tenant.twilio_subaccount_sid && tenant.twilio_subaccount_auth_token) {
    return {
      accountSid: tenant.twilio_subaccount_sid,
      authToken: tenant.twilio_subaccount_auth_token,
      whatsappNumber: tenant.twilio_whatsapp_number ?? null,
      usingSubaccount: true,
    }
  }

  if (!isTwilioMasterTenant(tenant.id, env)) return null

  const accountSid = env.TWILIO_ACCOUNT_SID
  const authToken = env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return null

  return {
    accountSid,
    authToken,
    whatsappNumber: tenant.twilio_whatsapp_number ?? env.TWILIO_WHATSAPP_NUMBER ?? null,
    usingSubaccount: false,
  }
}

/**
 * Credenciales Twilio del tenant autenticado (dashboard), vía `resolveTwilioAccount()`.
 *
 * Multitenant: la Content API y la Messages API de Twilio son POR-CUENTA. Para
 * que Don Alirio vea SUS plantillas hay que autenticar con su subcuenta; un
 * tenant sin subcuenta que no sea el master recibe `null` y el panel muestra
 * «Twilio no configurado». Sin `tenant_id` en el JWT tampoco hay credenciales.
 *
 * @param tenantIdArg opcional — si el caller ya resolvió el tenant_id (p.ej. via
 *                    requireTenantId) se pasa aquí para evitar releer el JWT.
 */
export async function getTenantTwilioCredentials(
  tenantIdArg?: string
): Promise<TenantTwilioCredentials | null> {
  const { getTenantById, getTenantIdFromJwt } = await import('@/lib/tenant')
  const tenantId = tenantIdArg ?? (await getTenantIdFromJwt())
  const tenant = tenantId ? await getTenantById(tenantId) : null

  const account = resolveTwilioAccount(tenant)
  if (!account) return null

  return {
    ...account,
    basicAuth: `Basic ${Buffer.from(`${account.accountSid}:${account.authToken}`).toString('base64')}`,
  }
}
