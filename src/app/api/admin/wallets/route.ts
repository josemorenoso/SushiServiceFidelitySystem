import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin'
import { listTenantWallets } from '@/services/wallet.service'

/**
 * GET /api/admin/wallets — SOLO super-admin.
 * Saldo, consumo del mes y última recarga de cada tenant. Alimenta el panel
 * donde el operador asigna plata y ve quién está por quedarse sin saldo.
 *
 * Ref: docs/features/wallet-billing.md (§6.3)
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.userId ? 'Requiere super-admin' : 'No autorizado' },
      { status: auth.userId ? 403 : 401 }
    )
  }

  const wallets = await listTenantWallets()
  return NextResponse.json({ wallets })
}
