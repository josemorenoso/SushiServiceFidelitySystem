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
    // `assign_staff_phone` (opcional): celular del mesero al que se atribuye este
    // dispositivo. El supervisor sigue siendo quien autoriza con su PIN; la
    // atribución determina a nombre de quién quedan las visitas del dispositivo.
    const { phone, pin, device_fingerprint, device_name, assign_staff_phone } = body

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

    // Resolver a quién queda atribuido el dispositivo: al mesero indicado
    // (si se pasó assign_staff_phone) o al supervisor que lo activa.
    let ownerStaff = { id: staff.id, name: staff.name }
    if (assign_staff_phone && assign_staff_phone !== phone) {
      const { data: assignee } = await supabase
        .from('staff_users')
        .select('id, name, is_active')
        .eq('phone', assign_staff_phone)
        .eq('tenant_id', tenant.id)
        .single()

      if (!assignee || !assignee.is_active) {
        return NextResponse.json(
          {
            error: 'Mesero no encontrado',
            message: `No hay un mesero activo con el celular ${assign_staff_phone}. Créalo primero en Dashboard → Meseros.`,
          },
          { status: 404 }
        )
      }
      ownerStaff = { id: assignee.id, name: assignee.name }
    }

    const finalDeviceName = device_name || `Dispositivo de ${ownerStaff.name}`

    // Verificar si ya existe dispositivo con ese fingerprint
    const { data: existing } = await supabase
      .from('staff_devices')
      .select('id')
      .eq('device_fingerprint', device_fingerprint)
      .eq('tenant_id', tenant.id)
      .single()

    if (existing) {
      // Actualizar existente (incluye re-atribuir al nuevo dueño)
      await supabase
        .from('staff_devices')
        .update({
          staff_user_id: ownerStaff.id,
          is_trusted: true,
          trusted_at: new Date().toISOString(),
          expires_at: null,
          last_used_at: new Date().toISOString(),
          device_name: finalDeviceName,
        })
        .eq('id', existing.id)
    } else {
      // Crear nuevo
      await supabase.from('staff_devices').insert({
        staff_user_id: ownerStaff.id,
        device_fingerprint,
        device_name: finalDeviceName,
        is_trusted: true,
        trusted_at: new Date().toISOString(),
        expires_at: null,
        tenant_id: tenant.id,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Dispositivo activado a nombre de ${ownerStaff.name}`,
      assigned_to: ownerStaff.name,
    })
  } catch (error) {
    console.error('[DeviceRegister] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error activando el dispositivo' },
      { status: 500 }
    )
  }
}
