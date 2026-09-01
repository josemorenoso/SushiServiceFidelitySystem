/**
 * GET /api/dashboard/opt-outs?days=90
 *
 * Quién pidió no recibir más mensajes — **leído de la fuente de verdad**
 * (`customers.whatsapp_opt_out_at`), no del proveedor.
 *
 * POR QUÉ NO SIRVE `/api/dashboard/twilio-metrics`: ese endpoint deduce los
 * opt-outs paginando la API de Mensajes de Twilio (respuestas con keyword +
 * errores 21610/63016). Es correcto para un tenant Twilio y devuelve **vacío**
 * para uno Zernio, aunque sus clientes hayan respondido SALIR y el sistema los
 * esté respetando — porque esos opt-outs entran por
 * `/api/webhook/zernio` y viven en la columna, no en Twilio.
 *
 * `whatsapp_opt_out_at` es además exactamente lo que consulta
 * `isPhoneOptedOut()` antes de cada envío (`whatsapp.service.ts`, las dos ramas
 * de proveedor) y lo que filtran las campañas. Así que este endpoint muestra la
 * lista que el sistema de verdad respeta, no una reconstrucción.
 *
 * Docs: docs/features/campaigns.md · docs/API_DOCS.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** Cuántos opt-outs recientes se listan. El total no depende de este tope. */
const RECENT_LIMIT = 50
const DEFAULT_DAYS = 90
const MAX_DAYS = 365

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/** `3001234567` → `300···4567`. Suficiente para reconocerlo, sin exponerlo. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return phone
  return `${digits.slice(0, 3)}···${digits.slice(-4)}`
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const tenantId = await requireTenantId()

    const requestedDays = Number(request.nextUrl.searchParams.get('days') ?? DEFAULT_DAYS)
    const days =
      Number.isFinite(requestedDays) && requestedDays > 0
        ? Math.min(Math.trunc(requestedDays), MAX_DAYS)
        : DEFAULT_DAYS
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const service = getServiceClient()

    // Dos consultas con propósitos distintos: el TOTAL histórico (el número que
    // importa para la salud de la lista) y los RECIENTES (los que explican un
    // cambio de tendencia). Un solo `select` con límite daría un total mentiroso.
    const [totalResult, recentResult, baseResult] = await Promise.all([
      service
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('whatsapp_opt_out_at', 'is', null),
      service
        .from('customers')
        .select('id, name, phone, whatsapp_opt_out_at, total_visits, total_points')
        .eq('tenant_id', tenantId)
        .not('whatsapp_opt_out_at', 'is', null)
        .gte('whatsapp_opt_out_at', since)
        .order('whatsapp_opt_out_at', { ascending: false })
        .limit(RECENT_LIMIT),
      service
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
    ])

    if (totalResult.error) throw totalResult.error
    if (recentResult.error) throw recentResult.error
    if (baseResult.error) throw baseResult.error

    const total = totalResult.count ?? 0
    const base = baseResult.count ?? 0

    return NextResponse.json({
      total,
      /** Clientes con teléfono en la base. El denominador de la tasa. */
      base,
      /** % de la base que pidió salir. Redondeado a una decimal. */
      rate: base > 0 ? Math.round((total / base) * 1000) / 10 : 0,
      days,
      recentCount: recentResult.data?.length ?? 0,
      recent: (recentResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        phone: maskPhone(row.phone ?? ''),
        optedOutAt: row.whatsapp_opt_out_at,
        totalVisits: row.total_visits ?? 0,
        totalPoints: row.total_points ?? 0,
      })),
    })
  } catch (error) {
    console.error('[OptOuts]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
