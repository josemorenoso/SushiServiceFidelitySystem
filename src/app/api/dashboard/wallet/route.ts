import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt } from '@/lib/tenant'
import { getWalletSummary } from '@/services/wallet.service'
import { DEFAULT_PRICE_PER_MESSAGE_COP } from '@/constants/wallet'

/**
 * GET /api/dashboard/wallet — saldo de ESTE tenant (su propia billetera COP).
 *
 * Reemplaza, para el tenant, al viejo /api/dashboard/twilio-balance, que
 * exponía el saldo de la cuenta MATRIZ (inventario del operador) a cualquier
 * admin autenticado. Aquí el tenant ve solo lo suyo (spec §6.1).
 *
 * Ref: docs/features/wallet-billing.md
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Un super-admin puede no tener tenant_id en el JWT: devolvemos un resumen
  // vacío en vez de lanzar, para que la tarjeta degrade limpio (muestra "—").
  const tenantId = await getTenantIdFromJwt()
  if (!tenantId) {
    return NextResponse.json({
      balanceCop: 0,
      pricePerMessage: DEFAULT_PRICE_PER_MESSAGE_COP,
      messagesAvailable: 0,
      monthSpendCop: 0,
      transactions: [],
    })
  }

  const summary = await getWalletSummary(tenantId)
  return NextResponse.json(summary)
}
