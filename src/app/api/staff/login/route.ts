import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
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

export async function POST(request: NextRequest) {
  try {
    // Multi-sede F4 (D11). `resolveHostContext` en vez de `getTenantByDomain` por dos
    // razones, las dos imprescindibles para que exista el login POR SEDE:
    //   1. Resuelve la marca también por `restaurant_locations.domain`. Sin eso, el mesero
    //      de la sede 2 abre `laureles.marca.com/mesero` y recibe un 404 "Restaurante no
    //      reconocido" — no hay login de sede posible.
    //   2. Trae la sede del host, que es la mitad del guardarraíl del §5.3.
    const hostContext = await resolveHostContext(request.headers.get('host'))
    const tenant = hostContext.tenant
    if (!tenant) {
      return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })
    }

    const body = await request.json()
    const { phone, pin } = body

    if (!phone || !pin) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone y pin' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()
    const { data: staff, error: staffError } = await supabase
      .from('staff_users')
      .select('id, name, phone, pin, role, is_active, location_id')
      .eq('phone', phone)
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    // El fallo de base NO es un 401. Contestar "mesero no encontrado" cuando la base está
    // caída manda al mesero a probar PINs que ya eran correctos, y el incidente no deja
    // rastro en ningún sitio. Ojo al escenario concreto: si la 00044 se despliega DESPUÉS
    // del código de F4, esta consulta pide `location_id`, PostgREST responde 42703 y —sin
    // esto— TODOS los meseros del tenant reciben "PIN incorrecto" a la vez.
    if (isDbFailure(staffError)) {
      logDbFailure({
        scope: 'StaffLogin',
        reason: 'staff_lookup_error',
        error: staffError,
        context: { tenant: tenant.slug },
      })
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos validar tu ingreso ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }

    if (!staff || !staff.is_active) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Mesero no encontrado o inactivo' },
        { status: 401 }
      )
    }

    if (!staff.pin) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Este mesero no tiene PIN configurado. Usa un dispositivo de confianza.' },
        { status: 401 }
      )
    }

    const valid = await bcrypt.compare(String(pin), staff.pin)
    if (!valid) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'PIN incorrecto' },
        { status: 401 }
      )
    }

    // ─── D11: el mesero es de UNA sede, y entra por el enlace de ESA sede ───
    // Guardarraíl del §5.3 del spec. Solo actúa cuando las DOS sedes son conocidas:
    //   · mesero sin sede asignada (`location_id` NULL, que es todo el parque de hoy) → pasa.
    //   · host que no resuelve sede (marca con 0 o 2+ sedes en el dominio raíz)      → pasa.
    // Así ningún mesero de los 4 tenants vivos se queda fuera el día que se aplique la 00044,
    // y el rechazo solo aparece cuando alguien de verdad se equivocó de enlace.
    //
    // Va DESPUÉS de validar el PIN a propósito: contestar "estás en otra sede" antes de
    // comprobar la clave le diría a cualquiera qué celulares existen y en qué sede están.
    if (
      hostContext.locationId &&
      staff.location_id &&
      hostContext.locationId !== staff.location_id
    ) {
      return NextResponse.json(
        {
          error: 'Sede incorrecta',
          message:
            'Estás en el enlace de otra sede. Abre el enlace de tu sede para iniciar sesión.',
        },
        { status: 403 }
      )
    }

    // Actualizar last_login_at. Telemetría: que falle no impide entrar, pero se registra.
    const { error: touchError } = await supabase
      .from('staff_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', staff.id)
    if (touchError) {
      logDbFailure({
        scope: 'StaffLogin',
        reason: 'last_login_touch_error',
        error: touchError,
        context: { tenant: tenant.slug, staff_id: staff.id },
      })
    }

    // Generar JWT (8 horas)
    // ⚠️ La sede NO va dentro del JWT (§5.3): dura 8 horas, así que reasignar de sede a un
    // mesero tardaría hasta 8 horas en verse y no habría forma de revocarlo. Vive en la fila
    // de `staff_users` y se relee en cada petición — el check-in ya hacía ese SELECT de
    // todos modos, así que el ahorro de meterla en el token sería cero.
    const token = await new SignJWT({
      sub: staff.id,
      phone: staff.phone,
      name: staff.name,
      role: staff.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('8h')
      .setIssuedAt()
      .sign(getStaffSecret())

    return NextResponse.json({
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        phone: staff.phone,
        role: staff.role,
        // Para MOSTRAR de qué sede es el mesero, no para autorizar: la autorización la
        // decide la fila, que se relee en cada petición. `null` = sin sede asignada.
        location_id: staff.location_id ?? null,
      },
    })
  } catch (error) {
    console.error('[StaffLogin] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error al iniciar sesión' },
      { status: 500 }
    )
  }
}
