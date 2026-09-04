import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { resolveHostContext } from '@/lib/tenant'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

function getStaffSecret() {
  const s = process.env.STAFF_JWT_SECRET
  if (!s) throw new Error('STAFF_JWT_SECRET no está configurado')
  return new TextEncoder().encode(s)
}

export async function GET(request: NextRequest) {
  try {
    // Multi-sede F4 (D11): `resolveHostContext` resuelve la marca TAMBIEN por
    // `restaurant_locations.domain`. Sin eso, el mesero de la sede 2 abre
    // `laureles.marca.com/mesero` y toda esta superficie responde 404. `getTenantByDomain`
    // solo mira `tenants.domain` y CONSERVA su firma: la sede viaja por aqui.
    const tenant = (await resolveHostContext(request.headers.get('host'))).tenant
    if (!tenant) {
      return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    const deviceToken = request.headers.get('x-device-token')

    const supabase = getServiceClient()
    let staffId: string | null = null
    let deviceId: string | null = null

    // ─── Escenario A: autenticación por JWT ───
    if (token) {
      const { payload } = await jwtVerify(token, getStaffSecret(), { clockTolerance: 60 })
      const sid = payload.sub as string
      const { data: staff, error: staffError } = await supabase
        .from('staff_users')
        .select('id, is_active')
        .eq('id', sid)
        .eq('tenant_id', tenant.id)
        .maybeSingle()
      // 503 y no 401: un 401 aquí le dice a la app del mesero que su sesión murió.
      if (isDbFailure(staffError)) {
        logDbFailure({
          scope: 'StaffStats',
          reason: 'staff_lookup_error',
          error: staffError,
          context: { tenant: tenant.slug, staff_id: sid },
        })
        return NextResponse.json(
          { error: 'Problema técnico', message: 'No pudimos verificar tu sesión ahora mismo.' },
          { status: 503 }
        )
      }
      if (!staff || !staff.is_active) {
        return NextResponse.json({ error: 'No autorizado', message: 'Sesión inválida' }, { status: 401 })
      }
      staffId = staff.id
    }

    // ─── Escenario B: autenticación por device_token ───
    if (deviceToken) {
      const { data: device, error: deviceError } = await supabase
        .from('staff_devices')
        .select('id, is_trusted, expires_at')
        .eq('device_fingerprint', deviceToken)
        .eq('tenant_id', tenant.id)
        .eq('is_trusted', true)
        .maybeSingle()
      if (isDbFailure(deviceError)) {
        logDbFailure({
          scope: 'StaffStats',
          reason: 'device_lookup_error',
          error: deviceError,
          context: { tenant: tenant.slug },
        })
        return NextResponse.json(
          { error: 'Problema técnico', message: 'No pudimos verificar este dispositivo ahora mismo.' },
          { status: 503 }
        )
      }
      if (!device) {
        return NextResponse.json({ error: 'No autorizado', message: 'Dispositivo no reconocido' }, { status: 401 })
      }
      if (device.expires_at && new Date(device.expires_at) < new Date()) {
        return NextResponse.json({ error: 'No autorizado', message: 'Dispositivo expirado' }, { status: 401 })
      }
      deviceId = device.id
      const { error: touchError } = await supabase.from('staff_devices').update({ last_used_at: new Date().toISOString() }).eq('id', device.id)
      if (touchError) {
        logDbFailure({
          scope: 'StaffStats',
          reason: 'device_touch_error',
          error: touchError,
          context: { tenant: tenant.slug, device_id: device.id },
        })
      }
    }

    if (!staffId && !deviceId) {
      return NextResponse.json({ error: 'No autorizado', message: 'Se requiere autenticación' }, { status: 401 })
    }

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    let query = supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'staff_scan')
      .eq('tenant_id', tenant.id)
      .gte('created_at', startOfDay.toISOString())

    if (staffId) {
      query = query.eq('registered_by_staff_id', staffId)
    }

    const { count, error } = await query

    if (error) {
      throw new Error(`Error obteniendo stats: ${error.message}`)
    }

    return NextResponse.json({ visits_today: count ?? 0 })
  } catch (error) {
    console.error('[StaffStats] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error obteniendo estadísticas' },
      { status: 500 }
    )
  }
}
