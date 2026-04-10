import crypto from 'crypto'

/**
 * Validates a Twilio webhook request signature.
 * In development mode, validation can be skipped.
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.warn('[Twilio] AUTH_TOKEN no configurado — saltando validación de firma')
    return process.env.NODE_ENV === 'development'
  }

  const sortedKeys = Object.keys(params).sort()
  const dataString = sortedKeys.reduce((acc, key) => acc + key + params[key], url)

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(dataString, 'utf-8'))
    .digest('base64')

  return signature === expectedSignature
}
