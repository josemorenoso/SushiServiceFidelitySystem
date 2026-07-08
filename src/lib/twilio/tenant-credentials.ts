import { getTenantById, getTenantIdFromJwt } from '@/lib/tenant'

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
  /** true si se resolvió con la subcuenta del tenant; false si cayó a la master (env). */
  usingSubaccount: boolean
}

/**
 * Resuelve las credenciales Twilio de la SUBCUENTA del tenant autenticado (dashboard).
 *
 * Multitenant: la Content API y la Messages API de Twilio son POR-CUENTA. Autenticar
 * con la cuenta master (env `TWILIO_*` = Sushi Service) devuelve las plantillas/mensajes
 * de la master, no los del tenant. Para que Don Alirio vea SUS plantillas hay que
 * autenticar con su `twilio_subaccount_sid` + `twilio_subaccount_auth_token`.
 *
 * Fallback a la cuenta master si:
 *  - el tenant no tiene subcuenta propia (aún opera bajo la master), o
 *  - no hay `tenant_id` en el JWT (admin que no ha re-logueado tras la migración).
 *
 * Se exige que SID y token de la subcuenta estén AMBOS presentes; nunca se mezcla el
 * SID de la subcuenta con el token de la master (produciría un 401 de Twilio).
 *
 * @param tenantIdArg opcional — si el caller ya resolvió el tenant_id (p.ej. via
 *                    requireTenantId) se pasa aquí para evitar releer el JWT.
 */
export async function getTenantTwilioCredentials(
  tenantIdArg?: string
): Promise<TenantTwilioCredentials | null> {
  const tenantId = tenantIdArg ?? (await getTenantIdFromJwt())
  const tenant = tenantId ? await getTenantById(tenantId) : null

  const hasSubaccount = Boolean(
    tenant?.twilio_subaccount_sid && tenant?.twilio_subaccount_auth_token
  )

  const accountSid = hasSubaccount
    ? tenant!.twilio_subaccount_sid!
    : process.env.TWILIO_ACCOUNT_SID ?? null
  const authToken = hasSubaccount
    ? tenant!.twilio_subaccount_auth_token!
    : process.env.TWILIO_AUTH_TOKEN ?? null

  if (!accountSid || !authToken) return null

  const whatsappNumber =
    tenant?.twilio_whatsapp_number ?? process.env.TWILIO_WHATSAPP_NUMBER ?? null

  return {
    accountSid,
    authToken,
    basicAuth: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    whatsappNumber,
    usingSubaccount: hasSubaccount,
  }
}
