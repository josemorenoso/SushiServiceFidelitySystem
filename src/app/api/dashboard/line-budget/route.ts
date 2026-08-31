import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt } from '@/lib/tenant'
import { getLineBudget } from '@/services/line-budget.service'
import { getQueueDepth } from '@/services/send-queue.service'

/**
 * GET /api/dashboard/line-budget — cuánto puede emitir HOY la línea del tenant.
 *
 * Meta limita cada línea a N destinatarios ÚNICOS por 24h RODANTES, y ese
 * límite lo consumen por igual los mensajes de marketing y los transaccionales.
 * De ahí la reserva: si una campaña gastara el límite completo, el restaurante
 * no podría saludar a quien se registre esa tarde.
 *
 * Para tenants Zernio esta tarjeta REEMPLAZA a la de billetera — desde 00037
 * (decisión D-2) esos tenants ya no se cobran por mensaje, porque Meta les
 * factura directo. El freno dejó de ser el saldo y pasó a ser el cupo.
 *
 * Ref: docs/features/send-governance.md
 *      docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.1
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Un super-admin puede no tener tenant_id en el JWT: se degrada limpio, igual
  // que /api/dashboard/wallet, para que la tarjeta muestre "—" en vez de romper.
  const tenantId = await getTenantIdFromJwt()
  if (!tenantId) {
    return NextResponse.json({ available: false })
  }

  try {
    // `queueDepth` lo pide el spec §5 en este payload. Va aparte de
    // `line_budget()` a propósito: esa función SQL ya está commiteada y el AIOS
    // la consume, así que se le añade el dato en la ruta en vez de cambiarle el
    // contrato. Falla blando — un error contando la cola no debe tumbar la
    // tarjeta de presupuesto, que es el dato importante.
    const [budget, depth] = await Promise.all([getLineBudget(tenantId), getQueueDepth(tenantId)])
    return NextResponse.json({ available: true, ...budget, queueDepth: depth })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[line-budget] No se pudo calcular el presupuesto:', message)
    return NextResponse.json(
      { error: 'No se pudo calcular el presupuesto de la línea' },
      { status: 500 }
    )
  }
}
