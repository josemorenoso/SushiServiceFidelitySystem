/**
 * GET /api/check-in/review-prompt?phone=...
 *
 * ¿Se le muestra el pop-up de reseña a este cliente? Lo decide el servidor.
 *
 * Vive en su propio endpoint y NO en la respuesta del check-in a propósito: en el flujo
 * real (`checkin_mode = staff_verified`) el POST /api/check-in lo hace el celular DEL MESERO,
 * mientras que la pantalla del cliente la alimenta el polling de /api/check-in/status. Y
 * colgarlo de ese polling —que corre cada 5 segundos— dispararía una impresión por segundo.
 * Un endpoint propio es agnóstico del modo de check-in.
 *
 * Ref: docs/features/review-flow.md (decisión B3-D1)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getReviewPromptState, logReviewShown } from '@/services/review.service'
import { resolvePhoneRequest } from '@/lib/phone-request'

/** Respuesta neutra: la UI simplemente no muestra nada. Nunca rompe el check-in. */
const HIDDEN = { show: false, reward_title: null, google_url: '' }

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Rate limit por teléfono (no por IP): en el local todos comparten el WiFi y el NAT del
    // operador móvil. Mismo criterio que /api/check-in/status.
    const resolved = await resolvePhoneRequest({
      phone: searchParams.get('phone'),
      host: request.headers.get('host'),
      rateLimitKey: 'review-prompt',
      rateLimitMax: 20,
    })

    if (!resolved.ok) {
      if (resolved.reason === 'invalid_phone') {
        return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
      }
      if (resolved.reason === 'rate_limited') {
        return NextResponse.json(
          { error: 'Demasiadas solicitudes', retryAfter: resolved.retryAfterSeconds },
          { status: 429, headers: { 'Retry-After': String(resolved.retryAfterSeconds) } }
        )
      }
      if (resolved.reason === 'no_tenant') {
        return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })
      }
      // no_customer: un teléfono desconocido no es un error → simplemente no se muestra nada.
      return NextResponse.json(HIDDEN)
    }

    const { tenant, customer, locationId } = resolved
    const state = await getReviewPromptState(customer, tenant)

    // La impresión se sella aquí, no en el navegador: es el único punto que sabe con
    // certeza que el modal se va a renderizar. Deduplicado a 12h por si el cliente recarga.
    //
    // Multi-sede F4 (deuda #11): la sede viaja hasta `review_events.location_id`. Antes de la
    // 00044 la función SQL que escribe este evento no recibía sede, así que el DENOMINADOR
    // del embudo de reseñas nacía vacío mientras el numerador (`clicked`, que escribe
    // `logReviewEvent`) sí la traía — dos mitades del mismo embudo medidas distinto.
    if (state.show) {
      await logReviewShown(customer.id, tenant.id, locationId)
    }

    return NextResponse.json(state)
  } catch (error) {
    console.error('[ReviewPrompt] Error:', error)
    // Degrada en silencio: si esto falla (p. ej. la migración 00032 aún no se aplicó), el
    // cliente ve su check-in normal sin pop-up. Nunca un 500 en la cara del cliente.
    return NextResponse.json(HIDDEN)
  }
}
