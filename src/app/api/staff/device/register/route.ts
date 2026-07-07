import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { getTenantByDomain } from '@/lib/tenant'

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
    const tenant = await getTenantByDomain(request.headers.get('host'))
    if (!tenant) {
      return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })
    }

    const body = await request.json()
    const { phone, pin, device_fingerprint, device_name } = body

    if (!phone || !pin || !device_fingerprint) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone, pin y device_fingerprint' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

    // Validar supervisor/admin
    const { data: staff } = await supabase
      .from('staff_users')
      .select('id, name, pin, role, is_active')
      .eq('phone', phone)
      .eq('tenant_id', tenant.id)
      .single()

    if (!staff || !staff.is_active) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Usuario no encontrado o inactivo' },
        { status: 401 }
      )
    }

    if (staff.role !== 'supervisor' && staff.role !== 'admin') {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Solo supervisores o admins pueden activar dispositivos' },
        { status: 403 }
      )
    }

    if (!staff.pin) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Este usuario no tiene PIN configurado' },
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

    // Verificar si ya existe dispositivo con ese fingerprint
    const { data: existing } = await supabase
      .from('staff_devices')
      .select('id')
      .eq('device_fingerprint', device_fingerprint)
      .eq('tenant_id', tenant.id)
      .single()

    if (existing) {
      // Actualizar existente
      await supabase
        .from('staff_devices')
        .update({
          is_trusted: true,
          trusted_at: new Date().toISOString(),
          expires_at: null,
          last_used_at: new Date().toISOString(),
          device_name: device_name || null,
        })
        .eq('id', existing.id)
    } else {
      // Crear nuevo
      await supabase.from('staff_devices').insert({
        staff_user_id: staff.id,
        device_fingerprint,
        device_name: device_name || null,
        is_trusted: true,
        trusted_at: new Date().toISOString(),
        expires_at: null,
        tenant_id: tenant.id,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Dispositivo activado como de confianza',
    })
  } catch (error) {
    console.error('[DeviceRegister] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error activando el dispositivo' },
      { status: 500 }
    )
  }
}
