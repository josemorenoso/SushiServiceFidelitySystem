import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

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
    const body = await request.json()
    const { phone, pin } = body

    if (!phone || !pin) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone y pin' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()
    const { data: staff } = await supabase
      .from('staff_users')
      .select('id, name, phone, pin, role, is_active')
      .eq('phone', phone)
      .single()

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

    // Actualizar last_login_at
    await supabase
      .from('staff_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', staff.id)

    // Generar JWT (8 horas)
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
