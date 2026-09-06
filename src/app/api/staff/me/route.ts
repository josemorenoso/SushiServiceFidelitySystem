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

    // ─── Escenario A: autenticación por JWT de mesero ───
    if (token) {
      const { payload } = await jwtVerify(token, getStaffSecret(), {
        clockTolerance: 60,
      })

      const staffId = payload.sub as string
      const { data: staff, error: staffError } = await supabase
        .from('staff_users')
        .select('id, name, phone, role, is_active, location_id')
        .eq('id', staffId)
        .eq('tenant_id', tenant.id)
        .maybeSingle()

      // Un 401 aquí hace que la app del mesero borre el token y lo saque a la pantalla de
      // login. Si lo que falló fue la base, acaba de perder una sesión perfectamente válida.
      if (isDbFailure(staffError)) {
        logDbFailure({
          scope: 'StaffMe',
          reason: 'staff_lookup_error',
          error: staffError,
          context: { tenant: tenant.slug, staff_id: staffId },
        })
        return NextResponse.json(
          {
            error: 'Problema técnico',
            message: 'No pudimos verificar tu sesión ahora mismo. Intenta de nuevo en un momento.',
          },
          { status: 503 }
        )
      }

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
      const { data: device, error: deviceError } = await supabase
        .from('staff_devices')
        .select('id, device_name, is_trusted, expires_at, staff_user_id, location_id')
        .eq('device_fingerprint', deviceToken)
        .eq('tenant_id', tenant.id)
        .eq('is_trusted', true)
        .maybeSingle()

      if (isDbFailure(deviceError)) {
        logDbFailure({
          scope: 'StaffMe',
          reason: 'device_lookup_error',
          error: deviceError,
          context: { tenant: tenant.slug },
        })
        return NextResponse.json(
          {
            error: 'Problema técnico',
            message: 'No pudimos verificar este dispositivo ahora mismo. Intenta de nuevo en un momento.',
          },
          { status: 503 }
        )
      }

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

      // Actualizar last_used_at (telemetría: no invalida la sesión, pero se registra).
      const { error: touchError } = await supabase
        .from('staff_devices')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', device.id)
      if (touchError) {
        logDbFailure({
          scope: 'StaffMe',
          reason: 'device_touch_error',
          error: touchError,
          context: { tenant: tenant.slug, device_id: device.id },
        })
      }

      // El NOMBRE de la sede, en una consulta aparte a propósito: la FK de sede es COMPUESTA
      // `(location_id, tenant_id)` (00044) y el embedding de PostgREST con claves compuestas
      // es frágil — un `select` anidado que deje de resolver devolvería la sede en `null` y
      // la pantalla diría "sin sede" sobre un aparato que sí la tiene.
      let locationName: string | null = null
      if (device.location_id) {
        const { data: sede, error: sedeError } = await supabase
          .from('restaurant_locations')
          .select('name')
          .eq('id', device.location_id)
          .eq('tenant_id', tenant.id)
          .maybeSingle()
        if (isDbFailure(sedeError)) {
          // No invalida la sesión: el aparato SÍ tiene sede y el `location_id` de abajo es lo
          // que de verdad filtra la lista. Solo se queda sin la etiqueta bonita.
          logDbFailure({
            scope: 'StaffMe',
            reason: 'location_name_lookup_error',
            error: sedeError,
            context: { tenant: tenant.slug, location_id: device.location_id },
          })
        } else {
          locationName = sede?.name ?? null
        }
      }

      return NextResponse.json({
        authenticated: true,
        type: 'device',
        device: {
          id: device.id,
          name: device.device_name,
          location_name: locationName,
          // §19: la sede del APARATO. La pantalla la necesita para dos cosas: filtrar la
          // lista de meseros, y —cuando viene `null`— pedir que se asigne antes de dejar
          // escanear. NULL es "sede desconocida" y SE MUESTRA; no se adivina ni se
          // reemplaza por "todas las sedes", que es justo lo que el dueño rechazó.
          location_id: device.location_id ?? null,
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
