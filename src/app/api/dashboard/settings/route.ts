import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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

  const service = getServiceClient()
  const { data, error } = await service
    .from('admin_settings')
    .select('key, value')

  if (error) {
    console.error('[Settings] Error:', error)
    return NextResponse.json({ error: 'Error obteniendo configuración' }, { status: 500 })
  }

  const settings: Record<string, string> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }

  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { key, value } = body as { key: string; value: string }

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key y value son requeridos' }, { status: 400 })
  }

  const service = getServiceClient()
  const { error } = await service
    .from('admin_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) {
    console.error('[Settings] Error update:', error)
    return NextResponse.json({ error: 'Error guardando configuración' }, { status: 500 })
  }

  return NextResponse.json({ message: 'Configuración actualizada', key, value })
}
