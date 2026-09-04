import { NextRequest, NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { cancelQueueItemForTenant } from '@/services/send-queue.service'

/**
 * DELETE /api/dashboard/send-queue/[id] — cancela un item de la cola.
 *
 * NO borra la fila: la pasa a `status='cancelled'`. La cola es el registro de
 * lo que se decidió enviar y de qué pasó con cada intento; borrar filas dejaría
 * al operador sin poder explicar por qué una campaña envió 180 de 380.
 *
 * Cancelar además libera el hueco del índice único parcial (que solo cubre
 * `status='queued'`), así que ese teléfono se puede volver a encolar para la
 * misma campaña.
 *
 * Ref: docs/features/send-governance.md
 *      docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §5
 */

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { id } = await params

    // El filtro por tenant Y por sede va DENTRO del update, no antes: el
    // service role se salta RLS, así que sin esos filtros un admin podría
    // cancelar la cola de otro restaurante (o, ahora, de otra sede) conociendo
    // un id.
    const { cancelled, reason } = await cancelQueueItemForTenant(scopeResult.scope, id)

    if (!cancelled) {
      if (reason === 'sending') {
        // El drenador ya lo tomó y lo está enviando: cancelarlo no detiene ese
        // envío. Decir "cancelado" aquí sería mentir — el cliente lo va a
        // recibir igual.
        return NextResponse.json(
          {
            error: 'Este mensaje ya se está enviando y no se puede cancelar',
            reason: 'sending',
          },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'El item no existe, no es de este tenant, o ya no estaba en cola' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[send-queue DELETE]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
