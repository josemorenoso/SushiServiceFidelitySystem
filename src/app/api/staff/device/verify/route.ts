import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveHostContext } from '@/lib/tenant'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  try {
    // Multi-sede F4 (D11): `resolveHostContext` resuelve la marca TAMBIEN por
    // `restaurant_locations.domain`. Sin eso, el mesero de la sede 2 abre
    // `laureles.marca.com/mesero` y toda esta superficie responde 404. `getTenantByDomain`
    // solo mira `tenants.domain` y CONSERVA su firma: la sede viaja por aqui.
    const tenant = (await resolveHostContext(request.headers.get('host'))).tenant
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
      .maybeSingle()

    // Esta ruta SÍ miraba el `error` — pero lo fundía con el vacío en un mismo
    // `{ valid: false }`. Es la misma pérdida de información: la tablet del local concluye
    // que ya no es de confianza y manda al mesero a pedirle el PIN a un supervisor, cuando
    // lo único que pasó fue que la base tosió un segundo.
    if (isDbFailure(error)) {
      logDbFailure({
        scope: 'DeviceVerify',
        reason: 'device_lookup_error',
        error,
        context: { tenant: tenant.slug },
      })
      return NextResponse.json(
        { valid: false, unavailable: true, message: 'No pudimos verificar el dispositivo ahora mismo.' },
        { status: 503 }
      )
    }

    if (!device) {
      return NextResponse.json({ valid: false })
    }

    if (device.expires_at && new Date(device.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, expired: true })
    }

    // Actualizar last_used_at (telemetría: no invalida nada, pero se registra).
    const { error: touchError } = await supabase
      .from('staff_devices')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', device.id)
    if (touchError) {
      logDbFailure({
        scope: 'DeviceVerify',
        reason: 'device_touch_error',
        error: touchError,
        context: { tenant: tenant.slug, device_id: device.id },
      })
    }

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
