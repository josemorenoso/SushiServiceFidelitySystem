/**
 * POST /api/check-in/review-action
 * Body: { phone, action: 'clicked' | 'postponed' }
 *
 * Las dos únicas salidas del pop-up de reseña:
 *   - `clicked`   → sella la columna, OTORGA el premio y registra el evento.
 *   - `postponed` → sella el aplazamiento. Se le vuelve a mostrar en su próximo check-in.
 *
 * Es público y otorga un premio, así que va rate-limited. El daño ya estaba acotado por
 * partida doble antes de esto: `google_review_clicked_at` solo se sella una vez, y el índice
 * único parcial de la migración 00031 impide un segundo premio de reseña activo. El rate
 * limit es la tercera capa, no la única.
 *
 * Ref: docs/features/review-flow.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { registerReviewClick, registerReviewPostpone } from '@/services/review.service'
import { resolvePhoneRequest } from '@/lib/phone-request'

interface ReviewActionBody {
  phone: string
  action: 'clicked' | 'postponed'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReviewActionBody
    const { phone, action } = body

    if (!phone || !action) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone y action' },
        { status: 400 }
      )
    }

    if (action !== 'clicked' && action !== 'postponed') {
      return NextResponse.json(
        { error: 'Acción inválida', message: "action debe ser 'clicked' o 'postponed'" },
        { status: 400 }
      )
    }

    const resolved = await resolvePhoneRequest({
      phone,
      host: request.headers.get('host'),
      rateLimitKey: 'review-action',
      rateLimitMax: 10,
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
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const { tenant, customer } = resolved

    if (action === 'postponed') {
      await registerReviewPostpone(customer, tenant.id)
      return NextResponse.json({ ok: true })
    }

    const result = await registerReviewClick(customer, tenant)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[ReviewAction] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'No se pudo registrar la acción' },
      { status: 500 }
    )
  }
}
