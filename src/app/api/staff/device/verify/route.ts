import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenantByDomain } from '@/lib/tenant'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantByDomain(request.headers.get('host'))
    if (!tenant) {
      return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })
    }

    const body = await request.json()
    const { device_fingerprint } = body

    if (!device_fingerprint) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere device_fingerprint' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()
    const { data: device, error } = await supabase
      .from('staff_devices')
      .select('id, device_name, is_trusted, expires_at')
      .eq('device_fingerprint', device_fingerprint)
      .eq('tenant_id', tenant.id)
      .eq('is_trusted', true)
      .single()

    if (error || !device) {
      return NextResponse.json({ valid: false })
    }

    if (device.expires_at && new Date(device.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, expired: true })
    }

    // Actualizar last_used_at
    await supabase
      .from('staff_devices')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', device.id)

    return NextResponse.json({
      valid: true,
      device: {
        id: device.id,
        name: device.device_name,
      },
    })
  } catch (error) {
    console.error('[DeviceVerify] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error verificando dispositivo' },
      { status: 500 }
    )
  }
}
