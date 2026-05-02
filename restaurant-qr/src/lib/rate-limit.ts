/**
 * Rate limiter simple en memoria (sliding window).
 *
 * NOTA: En Vercel serverless, el estado en memoria no se comparte entre
 * instancias (cold starts resetan el contador). Para escala real usar
 * Upstash Redis o similar. Para MVP con volumen bajo (3 restaurantes,
 * ~100 check-ins/día cada uno) es suficiente + barrera anti-abuse básica.
 *
 * Para clones en VPS con servidor persistente, funciona perfectamente.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitEntry>()

// Limpieza periódica para evitar memory leak
const CLEANUP_INTERVAL = 60_000 // 1 minuto
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt < now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

/**
 * Verifica si una key (normalmente IP+ruta) ha excedido el límite.
 *
 * @param key  identificador único (ej: `checkin:1.2.3.4`)
 * @param max  máximo de requests permitidas
 * @param windowMs ventana de tiempo en ms
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  cleanup()
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || entry.resetAt < now) {
    // Nueva ventana
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return {
      allowed: true,
      remaining: max - 1,
      resetAt: now + windowMs,
      retryAfterSeconds: 0,
    }
  }

  if (entry.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count += 1
  return {
    allowed: true,
    remaining: max - entry.count,
    resetAt: entry.resetAt,
    retryAfterSeconds: 0,
  }
}

/**
 * Extrae la IP del cliente de los headers de la request.
 * Maneja proxies (x-forwarded-for, x-real-ip).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
