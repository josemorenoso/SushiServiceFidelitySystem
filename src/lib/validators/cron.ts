import { NextRequest } from 'next/server'

/**
 * Validates the CRON_SECRET from the Authorization header.
 * Expected format: "Bearer {CRON_SECRET}"
 */
export function validateCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Cron] CRON_SECRET no configurado — rechazando request por seguridad')
    return false
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '')
  return token === secret
}
