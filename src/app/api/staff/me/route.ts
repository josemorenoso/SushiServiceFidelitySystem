import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { resolveHostContext } from '@/lib/tenant'

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

    // ─── Escenario A: autenticación por JWT de mesero ───
    if (token) {
      const { payload } = await jwtVerify(token, getStaffSecret(), {
        clockTolerance: 60,
      })

      const staffId = payload.sub as string
      const { data: staff } = await supabase
        .from('staff_users')
        .select('id, name, phone, role, is_active, location_id')
        .eq('id', staffId)
        .eq('tenant_id', tenant.id)
        .single()

      if (!staff || !staff.is_active) {
        return NextResponse.json(
          { error: 'No autorizado', message: 'Sesión inválida' },
          { status: 401 }
        )
      }

      return NextResponse.json({
        authenticated: true,
        type: 'staff',
        staff: {
          id: staff.id,
          name: staff.name,
          phone: staff.phone,
          role: staff.role,
          // Se relee de la FILA en cada petición, nunca del JWT (§5.3): reasignar de sede a
          // un mesero se ve al instante y no hay que esperar a que caduque su token de 8h.
          location_id: staff.location_id ?? null,
        },
      })
    }

    // ─── Escenario B: autenticación por device_token ───
    if (deviceToken) {
      const { data: device } = await supabase
        .from('staff_devices')
        .select('id, device_name, is_trusted, expires_at, staff_user_id')
        .eq('device_fingerprint', deviceToken)
        .eq('tenant_id', tenant.id)
        .eq('is_trusted', true)
        .single()

      if (!device) {
        return NextResponse.json(
          { error: 'No autorizado', message: 'Dispositivo no reconocido' },
          { status: 401 }
        )
      }

      if (device.expires_at && new Date(device.expires_at) < new Date()) {
        return NextResponse.json(
          { error: 'No autorizado', message: 'Dispositivo expirado' },
          { status: 401 }
        )
      }

      // Actualizar last_used_at
      await supabase
        .from('staff_devices')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', device.id)

      return NextResponse.json({
        authenticated: true,
        type: 'device',
        device: {
          id: device.id,
          name: device.device_name,
        },
      })
    }

    return NextResponse.json(
      { error: 'No autorizado', message: 'Se requiere token de sesión o dispositivo' },
      { status: 401 }
    )
  } catch (error) {
    console.error('[StaffMe] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error validando sesión' },
      { status: 500 }
    )
  }
}
