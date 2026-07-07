import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await requireTenantId()
  const service = getServiceClient()
  const { data, error } = await service
    .from('restaurant_locations')
    .select('id, name, address, lat, lon, radius_meters, is_active')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .single()

  if (error) {
    console.error('[Location] Error:', error)
    return NextResponse.json({ error: 'Error obteniendo ubicación' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { lat, lon, radius_meters, address } = body as {
    lat: number
    lon: number
    radius_meters?: number
    address?: string
  }

  if (lat == null || lon == null) {
    return NextResponse.json({ error: 'lat y lon son requeridos' }, { status: 400 })
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 })
  }

  const tenantId = await requireTenantId()
  const service = getServiceClient()

  const { data: existing } = await service
    .from('restaurant_locations')
    .select('id')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .single()

  const updatePayload: Record<string, unknown> = {
    lat,
    lon,
    radius_meters: radius_meters ?? 20,
    updated_at: new Date().toISOString(),
  }
  if (address !== undefined) updatePayload.address = address

  let error
  if (existing) {
    const result = await service
      .from('restaurant_locations')
      .update(updatePayload)
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
    error = result.error
  } else {
    const result = await service
      .from('restaurant_locations')
      .insert({ ...updatePayload, name: 'Sede principal', tenant_id: tenantId })
    error = result.error
  }

  if (error) {
    console.error('[Location] Error update:', error)
    return NextResponse.json({ error: 'Error guardando ubicación' }, { status: 500 })
  }

  console.log(`[Location] Actualizado: lat=${lat}, lon=${lon}, radius=${radius_meters ?? 20}`)
  return NextResponse.json({ message: 'Ubicación actualizada', lat, lon, radius_meters: radius_meters ?? 20 })
}
