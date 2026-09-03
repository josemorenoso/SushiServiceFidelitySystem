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
  /**
   * Sede desde la que se generó el QR (multi-sede F3, §3.1 del spec).
   *
   * ⚠️ **NUNCA DECIDE LA SEDE DE LA VISITA.** Es la única señal que el cliente puede
   * falsificar —el QR se arma con el subdominio que él tenga abierto, y ese puede ser un
   * enlace guardado de otra sede—, así que solo sirve para poner
   * `visits.location_conflict` (`true` = el QR decía otra sede). Ver conflicto 7 de §11.
   *
   * OPCIONAL a propósito: los tokens ya emitidos no lo traen, y sin él
   * `location_conflict` queda en `NULL` = "no se evaluó", que es exactamente lo que
   * describe el COMMENT de la columna en la 00043.
   */
  loc?: string
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
    .setExpirationTime('30m')
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
    maxTokenAge: '30m',
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
    // Ausente en todos los tokens anteriores a F3: se omite en vez de inventarlo.
    ...(typeof payload.loc === 'string' ? { loc: payload.loc } : {}),
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

    // JWT usa base64url: convertir a base64 estándar + padding antes de atob
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)

    // Decodificar respetando UTF-8 (nombres con tildes, ñ, etc.)
    const binary = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary')
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const json = new TextDecoder('utf-8').decode(bytes)

    const payload = JSON.parse(json)
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.phone !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.ts !== 'number'
    ) {
      return null
    }
    return {
      sub: payload.sub,
      phone: payload.phone,
      name: payload.name,
      ts: payload.ts,
      ...(typeof payload.loc === 'string' ? { loc: payload.loc } : {}),
    }
  } catch {
    return null
  }
}
