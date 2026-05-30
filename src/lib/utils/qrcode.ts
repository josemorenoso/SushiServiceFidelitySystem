/**
 * Utilidades para generar y validar tokens JWT efímeros de QR dinámico.
 * Usa jose para firmar/verificar (Edge-compatible).
 */
import { SignJWT, jwtVerify } from 'jose'

const QR_SECRET = () => {
  const s = process.env.STAFF_QR_JWT_SECRET
  if (!s) throw new Error('STAFF_QR_JWT_SECRET no está configurado')
  return new TextEncoder().encode(s)
}

export interface CustomerQRToken {
  sub: string       // customer_id
  phone: string
  name: string
  ts: number        // timestamp de generación (segundos epoch)
}

/**
 * Genera un token JWT corto (5 minutos) con datos del cliente.
 * El QR del cliente codifica: `${origin}/mesero/scan?token=<jwt>`
 */
export async function generateCustomerQRToken(
  payload: Omit<CustomerQRToken, 'ts'>
): Promise<string> {
  const token = await new SignJWT({ ...payload, ts: Math.floor(Date.now() / 1000) })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .setIssuedAt()
    .sign(QR_SECRET())

  return token
}

/**
 * Valida firma y expiración del token JWT del QR.
 * Retorna el payload si es válido; lanza error si no.
 */
export async function verifyCustomerQRToken(token: string): Promise<CustomerQRToken> {
  const { payload } = await jwtVerify(token, QR_SECRET(), {
    clockTolerance: 10,
    maxTokenAge: '5m',
  })

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.phone !== 'string' ||
    typeof payload.name !== 'string' ||
    typeof payload.ts !== 'number'
  ) {
    throw new Error('Token QR con payload inválido')
  }

  return {
    sub: payload.sub,
    phone: payload.phone,
    name: payload.name,
    ts: payload.ts,
  }
}

/**
 * Parsea el payload SIN verificar la firma (solo para mostrar datos preliminares
 * en el frontend del mesero). NUNCA usar esto para validación de seguridad.
 */
export function decodeCustomerQRTokenUnsafe(token: string): CustomerQRToken | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.phone !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.ts !== 'number'
    ) {
      return null
    }
    return { sub: payload.sub, phone: payload.phone, name: payload.name, ts: payload.ts }
  } catch {
    return null
  }
}
