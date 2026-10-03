/**
 * `POST /api/webhook/delivery` — registro de un pedido de domicilio YA PARSEADO.
 *
 * ⚠️ **DESPUÉS DE LA FASE 2 DE §25 ESTE ENDPOINT YA NO ES EL CAMINO PRINCIPAL.**
 * `twilio-incoming` y `webhook/zernio` ahora parsean con IA y llaman a
 * `processDeliveryMessage()` en proceso, sin dar la vuelta por HTTP. La ruta se
 * **mantiene intacta en contrato y comportamiento** por dos motivos:
 *
 *   1. `n8n/domicilios_whatsapp_v4.json` sigue desplegado en el VPS y lo llama. El VPS
 *      lo apaga el dueño a mano (§25.7, respuesta 3); hasta entonces no se puede romper.
 *      En la práctica deja de recibir tráfico solo: su webhook lo disparábamos nosotros.
 *   2. Es la única forma de dar de alta un domicilio desde fuera (pruebas, cargas).
 *
 * Toda la lógica de negocio vive ahora en `registerDeliveryOrder()`
 * (`src/services/delivery.service.ts`). Aquí solo queda el HTTP: auth, rate limit,
 * resolución del tenant y la forma de la respuesta.
 *
 * Ver `docs/features/delivery-webhook.md` y `docs/API_DOCS.md`.
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { getTenantBySlug } from '@/lib/tenant'
import {
  DeliveryRegistrationError,
  registerDeliveryOrder,
} from '@/services/delivery.service'

interface DeliveryRequestBody {
  nombre_cliente: string
  celular: string
  direccion?: string | null
  metodo_pago?: string | null
  monto_total?: number | null
  raw_message?: string | null
  ciudad?: string | null
  birthday?: string | null
  tenant_slug: string
  /**
   * Celular del OPERADOR que reenvió el pedido (10 dígitos). Es la sede del pedido (D9).
   *
   * Opcional: el workflow de n8n lo manda desde F3, pero un llamador antiguo puede no
   * traerlo y entonces el pedido entra con sede desconocida, sin fallar.
   */
  remitente?: string | null
}

/**
 * ¿El `x-webhook-secret` que llegó es el nuestro? En tiempo constante, como los otros
 * tres validadores (`twilio.ts`, `zernio/webhooks.ts`, `aios-provision.ts`). Con `!==`
 * la comparación corta en el primer byte distinto y el tiempo de respuesta delata
 * cuántos acertó quien prueba (AISLA-5, auditoría 2026-09-28) — y es UN secreto para
 * todas las marcas.
 */
function secretoCoincide(expected: string, received: string | null): boolean {
  if (!received) return false
  const a = Buffer.from(expected, 'utf-8')
  const b = Buffer.from(received, 'utf-8')
  // timingSafeEqual exige el mismo largo. Comparar largos antes no filtra nada útil:
  // el largo de un secreto no es lo que se adivina byte a byte.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  try {
    // ─── AUTH (fail-closed): rechaza si secret no configurado ───
    const authHeader = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.WEBHOOK_DELIVERY_SECRET

    if (!expectedSecret) {
      console.error('[Delivery] WEBHOOK_DELIVERY_SECRET no configurado — rechazando request')
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 })
    }

    if (!secretoCoincide(expectedSecret, authHeader)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // ─── RATE LIMITING por IP ───
    const ip = getClientIp(request)
    const rl = rateLimit(`webhook-delivery:${ip}`, 60, 60_000) // 60/min por IP
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes', retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    const body = (await request.json()) as DeliveryRequestBody

    const tenant = await getTenantBySlug(body.tenant_slug)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (!body.celular) {
      return NextResponse.json({ ok: false, error: 'Falta celular del cliente' }, { status: 400 })
    }

    const result = await registerDeliveryOrder({
      tenant,
      order: {
        nombre_cliente: body.nombre_cliente,
        celular: body.celular,
        direccion: body.direccion,
        metodo_pago: body.metodo_pago,
        monto_total: body.monto_total,
        raw_message: body.raw_message,
        ciudad: body.ciudad,
        birthday: body.birthday,
      },
      // Sin `location`: este llamador solo tiene el número del operador, así que la sede
      // se resuelve con una consulta a `authorized_numbers` dentro del servicio.
      remitente: body.remitente,
    })

    return NextResponse.json({
      ok: true,
      is_new: result.isNew,
      action: result.action,
      cliente_id: result.customerId,
      customer: {
        name: result.customerName,
        phone: result.customerPhone,
        total_visits: result.totalVisits,
        total_points: result.totalPoints,
      },
      points_awarded: result.pointsAwarded,
      tier_unlocked: result.tierUnlocked
        ? { name: result.tierUnlocked.name, safe_reward: result.tierUnlocked.safeReward }
        : null,
    })
  } catch (error) {
    if (error instanceof DeliveryRegistrationError) {
      return NextResponse.json(
        { ok: false, error: 'Celular inválido', celular: error.celular },
        { status: 400 }
      )
    }
    console.error('[Delivery] Error:', error)
    return NextResponse.json({ ok: false, error: 'Error del servidor' }, { status: 500 })
  }
}
