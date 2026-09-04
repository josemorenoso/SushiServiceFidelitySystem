import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { requireLocationScope, applyLocationFilter } from '@/lib/location-scope'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const db = getServiceClient()
    const base = db.from('authorized_numbers').select('*').eq('tenant_id', scopeResult.scope.tenantId)
    const query = applyLocationFilter(base, scopeResult.scope, 'location_id')
    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ numbers: data ?? [] })
  } catch (error) {
    console.error('[AuthorizedNumbers] GET error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { phone, name } = body

    if (!phone || !name) {
      return NextResponse.json({ error: 'Teléfono y nombre son requeridos' }, { status: 400 })
    }

    const cleaned = String(phone).replace(/[^0-9]/g, '').replace(/^57/, '').slice(-10)
    if (!/^3\d{9}$/.test(cleaned)) {
      return NextResponse.json({ error: 'Formato inválido. Debe ser celular colombiano (3XXXXXXXXX)' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    const db = getServiceClient()

    const { data: existing } = await db
      .from('authorized_numbers')
      .select('id')
      .eq('phone', cleaned)
      .eq('tenant_id', tenantId)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Este número ya está registrado' }, { status: 409 })
    }

    const { data, error } = await db
      .from('authorized_numbers')
      .insert({ phone: cleaned, name: String(name).trim(), is_active: true, tenant_id: tenantId })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, number: data })
  } catch (error) {
    console.error('[AuthorizedNumbers] POST error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
