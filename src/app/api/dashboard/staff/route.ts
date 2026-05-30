import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/** Verifica que el request venga de un admin autenticado vía Supabase Auth. */
async function assertAdmin(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}

// ─── GET: listar meseros + dispositivos ───
export async function GET(request: NextRequest) {
  const user = await assertAdmin(request)
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const { data: staffList, error } = await supabase
    .from('staff_users')
    .select('id, name, phone, role, is_active, last_login_at, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }

  const { data: devices } = await supabase
    .from('staff_devices')
    .select('id, staff_user_id, device_name, is_trusted, trusted_at, expires_at, last_used_at')
    .order('trusted_at', { ascending: false })

  return NextResponse.json({ staff: staffList ?? [], devices: devices ?? [] })
}

// ─── POST: crear mesero ───
export async function POST(request: NextRequest) {
  const user = await assertAdmin(request)
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, phone, pin, role = 'waiter' } = body

    if (!name || !phone || !pin) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere name, phone y pin' },
        { status: 400 }
      )
    }

    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN inválido', message: 'El PIN debe ser numérico de 4 a 6 dígitos' },
        { status: 400 }
      )
    }

    const hashedPin = await bcrypt.hash(pin, 10)
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('staff_users')
      .insert({
        name: name.trim(),
        phone,
        pin: hashedPin,
        role,
      })
      .select('id, name, phone, role, is_active, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Duplicado', message: 'Ya existe un mesero con ese número de celular' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[DashboardStaff POST] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error creando el mesero' },
      { status: 500 }
    )
  }
}

// ─── PATCH: actualizar mesero (toggle activo, resetear PIN) ───
export async function PATCH(request: NextRequest) {
  const user = await assertAdmin(request)
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, is_active, pin, name, role } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere id' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (is_active !== undefined) updateData.is_active = is_active
    if (name !== undefined) updateData.name = name.trim()
    if (role !== undefined) updateData.role = role
    if (pin) {
      if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN inválido', message: 'El PIN debe ser numérico de 4 a 6 dígitos' },
          { status: 400 }
        )
      }
      updateData.pin = await bcrypt.hash(pin, 10)
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('staff_users')
      .update(updateData)
      .eq('id', id)
      .select('id, name, phone, role, is_active, updated_at')
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[DashboardStaff PATCH] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error actualizando el mesero' },
      { status: 500 }
    )
  }
}

// ─── DELETE: eliminar mesero ───
export async function DELETE(request: NextRequest) {
  const user = await assertAdmin(request)
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere id' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()
    await supabase.from('staff_users').delete().eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DashboardStaff DELETE] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error eliminando el mesero' },
      { status: 500 }
    )
  }
}
