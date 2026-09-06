import crypto from 'crypto'

/**
 * Valida la firma de un webhook entrante de Twilio.
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 *
 * El `authToken` se recibe explícito porque cada tenant firma con SU PROPIO token
 * (subcuenta real, ej. Sushi Fun) o con el master — nunca hay un único token válido
 * para todos. Su único llamador (`src/app/api/webhook/twilio-incoming/route.ts`)
 * resuelve primero qué token corresponde y lo pasa acá.
 *
 * Fail-closed sin excepciones: sin token o sin firma → false. Nada de "saltar en
 * development" — esa puerta trasera es justo lo que dejaba pasar producción mal
 * configurada.
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string | null | undefined
): boolean {
  if (!authToken || !signature) return false

  const sortedKeys = Object.keys(params).sort()
  const dataString = sortedKeys.reduce((acc, key) => acc + key + params[key], url)

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(dataString, 'utf-8'))
    .digest('base64')

  // Comparación en tiempo constante (mismo criterio que verifyZernioSignature en
  // src/lib/zernio/webhooks.ts).
  const expectedBuf = Buffer.from(expectedSignature, 'utf-8')
  const receivedBuf = Buffer.from(signature, 'utf-8')
  if (expectedBuf.length !== receivedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}
