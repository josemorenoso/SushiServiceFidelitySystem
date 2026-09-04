import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

// ─── PATCH: revocar (soft) — is_trusted = false ───
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { device_id } = (await request.json()) as { device_id?: string }
    if (!device_id) {
      return NextResponse.json({ error: 'Se requiere device_id' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    const db = getServiceClient()
    const { data, error } = await db
      .from('staff_devices')
      .update({ is_trusted: false })
      .eq('id', device_id)
      .eq('tenant_id', tenantId)
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DashboardStaffDevice PATCH] Error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ─── DELETE: eliminar (hard) — solo si ya está revocado ───
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Se requiere id' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    const db = getServiceClient()
    // Sin destructurar `error`, un fallo de base aquí se confundía con "Dispositivo no
    // encontrado" (404) en vez del fallo real.
    const { data: device, error: deviceError } = await db
      .from('staff_devices')
      .select('id, is_trusted')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (isDbFailure(deviceError)) {
      logDbFailure({
        scope: 'DashboardStaffDevice',
        reason: 'device_lookup_error',
        error: deviceError,
        context: { tenant_id: tenantId, device_id: id },
      })
      return NextResponse.json({ error: 'Error del servidor' }, { status: 503 })
    }

    if (!device) {
      return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
    }
    if (device.is_trusted) {
      return NextResponse.json(
        { error: 'Revocá el dispositivo antes de eliminarlo' },
        { status: 409 }
      )
    }

    const { error } = await db.from('staff_devices').delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) {
      return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DashboardStaffDevice DELETE] Error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
