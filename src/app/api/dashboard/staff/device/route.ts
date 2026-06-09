import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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

    const db = getServiceClient()
    const { data, error } = await db
      .from('staff_devices')
      .update({ is_trusted: false })
      .eq('id', device_id)
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

    const db = getServiceClient()
    const { data: device } = await db
      .from('staff_devices')
      .select('id, is_trusted')
      .eq('id', id)
      .single()

    if (!device) {
      return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
    }
    if (device.is_trusted) {
      return NextResponse.json(
        { error: 'Revocá el dispositivo antes de eliminarlo' },
        { status: 409 }
      )
    }

    const { error } = await db.from('staff_devices').delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DashboardStaffDevice DELETE] Error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
