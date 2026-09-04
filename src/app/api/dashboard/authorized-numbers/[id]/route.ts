import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireLocationScope, applyLocationFilter } from '@/lib/location-scope'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { is_active } = body

    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active debe ser boolean' }, { status: 400 })
    }

    const db = getServiceClient()
    // El filtro de sede aquí también es el candado: un número FUERA del alcance
    // del que llama no matchea ninguna fila, igual que hoy pasa si el `id` es de
    // otro tenant.
    const base = db.from('authorized_numbers').update({ is_active }).eq('id', id).eq('tenant_id', scopeResult.scope.tenantId)
    const query = applyLocationFilter(base, scopeResult.scope, 'location_id')
    const { data, error } = await query.select().single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('[AuthorizedNumbers] PATCH error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { id } = await params
    const db = getServiceClient()
    const base = db.from('authorized_numbers').delete().eq('id', id).eq('tenant_id', scopeResult.scope.tenantId)
    const query = applyLocationFilter(base, scopeResult.scope, 'location_id')
    const { error } = await query

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[AuthorizedNumbers] DELETE error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
