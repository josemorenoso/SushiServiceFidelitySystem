import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin'
import { recordTopup } from '@/services/wallet.service'

/**
 * POST /api/admin/wallet/topup — SOLO super-admin.
 *
 * Registra manualmente una recarga: "me llegaron 50,000 por Nequi, ref M12345".
 * Es donde el operador ANOTA el depósito hasta que exista el autoservicio (Wompi).
 *
 * Ref: docs/features/wallet-billing.md (§7.1)
 */

export const dynamic = 'force-dynamic'

interface TopupBody {
  tenantId: string
  amountCop: number
  type?: 'topup' | 'adjustment' | 'refund'
  notes?: string
  externalRef?: string
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.userId ? 'Requiere super-admin' : 'No autorizado' },
      { status: auth.userId ? 403 : 401 }
    )
  }

  let body: TopupBody
  try {
    body = (await request.json()) as TopupBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { tenantId, amountCop, type = 'topup', notes, externalRef } = body

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })
  }
  if (!Number.isFinite(amountCop) || amountCop === 0) {
    return NextResponse.json({ error: 'amountCop debe ser un número distinto de 0' }, { status: 400 })
  }
  // Recargas y reembolsos entran positivos; solo 'adjustment' puede ser negativo.
  if (type !== 'adjustment' && amountCop < 0) {
    return NextResponse.json(
      { error: 'Solo un ajuste (adjustment) puede tener monto negativo' },
      { status: 400 }
    )
  }

  const result = await recordTopup({
    tenantId,
    amountCop,
    source: 'manual',
    createdBy: auth.userId!,
    type,
    externalRef: externalRef?.trim() || null,
    notes: notes?.trim() || null,
  })

  if (!result.ok) {
    const status = result.error === 'duplicate' ? 409 : 500
    return NextResponse.json({ error: result.message ?? 'Error registrando la recarga' }, { status })
  }

  return NextResponse.json({ success: true, transaction: result.transaction })
}
