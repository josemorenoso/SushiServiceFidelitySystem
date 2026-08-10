import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId, getTenantById } from '@/lib/tenant'

/**
 * POST /api/dashboard/campaigns/run-auto
 * Body: { type: 'birthday' | 'reactivation' }
 *
 * Puente autenticado para el botón "Ejecutar Ahora" del dashboard.
 * Los crons exigen `Authorization: Bearer CRON_SECRET`, que el navegador no
 * conoce (ni debe conocer). Este endpoint valida la sesión del admin y llama
 * al cron del tenant actual con el secret desde el servidor, devolviendo el
 * resultado real (enviados/fallidos/error) en vez del 401 silencioso anterior.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = (await request.json()) as { type?: string }
    if (body.type !== 'birthday' && body.type !== 'reactivation') {
      return NextResponse.json(
        { error: "type debe ser 'birthday' o 'reactivation'" },
        { status: 400 }
      )
    }

    const secret = process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: 'CRON_SECRET no configurado en el servidor' },
        { status: 500 }
      )
    }

    const tenantId = await requireTenantId()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const cronUrl = new URL(`/api/cron/${body.type}`, request.nextUrl.origin)
    cronUrl.searchParams.set('tenant', tenant.slug)

    const cronRes = await fetch(cronUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    const result = await cronRes.json()

    return NextResponse.json(result, { status: cronRes.status })
  } catch (error) {
    console.error('[Campaigns RunAuto]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
