import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { exigirAlcanceDeMarca } from '@/lib/alcance-de-marca'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

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
    .from('admin_settings')
    .select('key, value')
    .eq('tenant_id', tenantId)

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

/**
 * Escribe UNA clave de `admin_settings` de la marca.
 *
 * Los ajustes son de la MARCA (`admin_settings` es `(key, tenant_id)`: no hay ajuste
 * por sede), así que escribir exige alcance de marca: `exigirAlcanceDeMarca()`. Hasta
 * la ola 0 (OPER-4, auditoría 2026-09-28) bastaba con tener sesión, y un
 * administrador de UNA sede pisaba cualquier clave de toda la marca —un
 * `*_template_sid` vigente incluido—. El GET sigue abierto a cualquier sesión de la
 * marca: leer no cruza marcas, y la pantalla de Ajustes la abren los dos roles.
 *
 * ⚠️ Qué claves acepta NO cambió acá: eso es 0.PLANTILLAS (`ESTADO.md` §3).
 */
export async function PUT(req: NextRequest) {
  const guardia = await exigirAlcanceDeMarca(
    req,
    'Los ajustes son de la marca: solo un super usuario puede cambiarlos.'
  )
  if (!guardia.ok) return guardia.res
  const tenantId = guardia.tenantId

  const body = await req.json()
  const { key, value } = body as { key: string; value: string }

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key y value son requeridos' }, { status: 400 })
  }

  const service = getServiceClient()

  // Try update first, then insert if not exists.
  //
  // Esta lectura decide entre UPDATE e INSERT: ante un fallo de base `existing` llegaba
  // `null`, el código elegía la rama de INSERT para una clave que YA EXISTÍA — con el PK
  // compuesto (key, tenant_id) de la 00028 eso no duplica en silencio, pero sí choca contra
  // el PK y el admin recibe "Error guardando configuración" en vez de la causa real (un
  // fallo de LECTURA, no de escritura).
  const { data: existing, error: existingError } = await service
    .from('admin_settings')
    .select('key')
    .eq('key', key)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (isDbFailure(existingError)) {
    logDbFailure({
      scope: 'Settings',
      reason: 'dup_check_error',
      error: existingError,
      context: { tenant_id: tenantId, key },
    })
    return NextResponse.json(
      {
        error: 'Problema técnico',
        message: 'No pudimos guardar la configuración ahora mismo. Intenta de nuevo en un momento.',
      },
      { status: 503 }
    )
  }

  let error
  if (existing) {
    const result = await service
      .from('admin_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
      .eq('tenant_id', tenantId)
    error = result.error
  } else {
    const result = await service
      .from('admin_settings')
      .insert({ key, value, updated_at: new Date().toISOString(), tenant_id: tenantId })
    error = result.error
  }

  if (error) {
    console.error('[Settings] Error update:', error)
    return NextResponse.json({ error: 'Error guardando configuración' }, { status: 500 })
  }

  console.log(`[Settings] Actualizado: ${key} = ${value}`)
  return NextResponse.json({ message: 'Configuración actualizada', key, value })
}
