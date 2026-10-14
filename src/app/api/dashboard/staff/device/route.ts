import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { requireLocationScope } from '@/lib/location-scope'
import { alcanceDeMeseros, veAlAparato, type AlcanceDeMeseros } from '@/lib/meseros-por-sede'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * La marca y el alcance de quien llama (SEDE-MESEROS, 2026-10-15): un administrador de sede
 * revoca y borra solo los aparatos de SU sede. Antes, `requireTenantId()` le dejaba los de
 * la otra. Mismo patrón que `/api/dashboard/staff`.
 */
async function alcanceDeLaPeticion(
  request: Request
): Promise<{ ok: true; tenantId: string; alcance: AlcanceDeMeseros } | { ok: false; res: NextResponse }> {
  const url = new URL(request.url)
  url.searchParams.delete('location_id')
  const r = await requireLocationScope(new Request(url.toString()))
  if (!r.ok) return { ok: false, res: NextResponse.json({ error: r.error }, { status: r.status }) }
  return { ok: true, tenantId: r.scope.tenantId, alcance: alcanceDeMeseros(r.scope) }
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

    const quien = await alcanceDeLaPeticion(request)
    if (!quien.ok) return quien.res
    const { tenantId, alcance } = quien
    const db = getServiceClient()

    const { data: aparato, error: aparatoError } = await db
      .from('staff_devices')
      .select('id, location_id')
      .eq('id', device_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (isDbFailure(aparatoError)) {
      logDbFailure({
        scope: 'DashboardStaffDevice',
        reason: 'device_lookup_error',
        error: aparatoError,
        context: { tenant_id: tenantId, device_id },
      })
      return NextResponse.json({ error: 'Error del servidor' }, { status: 503 })
    }
    // El de la otra sede sale igual que el que no existe: no se le dice qué hay allá.
    if (!aparato || !veAlAparato(alcance, aparato)) {
      return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
    }

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

    const quien = await alcanceDeLaPeticion(request)
    if (!quien.ok) return quien.res
    const { tenantId, alcance } = quien
    const db = getServiceClient()
    // Sin destructurar `error`, un fallo de base aquí se confundía con "Dispositivo no
    // encontrado" (404) en vez del fallo real.
    const { data: device, error: deviceError } = await db
      .from('staff_devices')
      .select('id, is_trusted, location_id')
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

    if (!device || !veAlAparato(alcance, device)) {
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
