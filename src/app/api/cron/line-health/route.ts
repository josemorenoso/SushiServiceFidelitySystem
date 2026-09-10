/**
 * Cron de salud de línea — Bloque 3 de la gobernanza de envío.
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.5
 * Doc:  docs/features/send-governance.md
 *
 * QUÉ HACE: le pregunta al proveedor (Twilio o Zernio), por cada marca activa,
 * en qué escalón de Meta está su línea y de qué color la tiene pintada. Guarda
 * el snapshot, sincroniza `tenants.messaging_daily_limit` y aprieta el freno si
 * la calidad cayó.
 *
 * POR QUÉ IMPORTA: hasta hoy `messaging_daily_limit` estaba en NULL en las 5
 * marcas vivas, o sea que TODO el freno de presupuesto que construyó la 00037
 * estaba medido pero apagado. Este cron es quien lo enciende con el número
 * real en vez de con uno inventado.
 *
 * MODO ENSAYO — úsalo la primera vez:
 *
 *     GET /api/cron/line-health?dry=1
 *
 * Devuelve exactamente lo que escribiría, sin escribir nada. Existe porque este
 * endpoint toca el freno de las campañas de marcas en producción: poner un 250
 * equivocado en una línea que mueve 2.000 le corta las campañas al cliente.
 *
 * CADENCIA: cada hora. No más seguido — el escalón de Meta cambia de día en
 * día, no de minuto en minuto, y cada corrida son N llamadas al proveedor.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateCronSecret } from '@/lib/validators/cron'
import { syncTenantHealth, type SyncResult } from '@/services/line-health.service'
import type { Tenant } from '@/types/tenant.types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

async function handler(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  try {
    const db = getServiceClient()

    // Los tenants de demo se saltan: no tienen línea real que sondear y una
    // llamada al proveedor por cada uno es gasto sin dato.
    const { data: tenants, error } = await db
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .eq('is_demo', false)

    if (error) {
      console.error('[LineHealth] No se pudo listar los tenants:', error.message)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    const resultados: SyncResult[] = []
    let sinLectura = 0

    // En SERIE, no en paralelo: son llamadas a la API del proveedor y varias
    // marcas comparten cuenta de Twilio. Dispararlas todas juntas es la forma
    // más fácil de comerse un 429 y quedarse sin ninguna lectura.
    for (const t of tenants ?? []) {
      const res = await syncTenantHealth(t as Tenant, { dryRun })
      if (res) resultados.push(res)
      else sinLectura++
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      sondeados: resultados.length,
      sin_lectura: sinLectura,
      resultados,
    })
  } catch (err) {
    console.error('[LineHealth]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler
