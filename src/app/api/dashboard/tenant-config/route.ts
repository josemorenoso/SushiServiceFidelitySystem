/**
 * GET / PUT /api/dashboard/tenant-config
 *
 * Edición de `tenants.config` (jsonb) desde el dashboard. Hoy su único cliente es el
 * **link de reseñas de Google** (hallazgo 3.8: hasta ahora solo se podía editar por SQL).
 *
 * El link NO se guarda en `admin_settings` a propósito: `resolveBranding()` lo lee de
 * `tenants.config`, y duplicarlo crearía dos fuentes de verdad para el mismo dato.
 *
 * ⚠️ `config` es un jsonb que contiene TODO el branding del tenant (nombre, gradientes,
 * etiquetas de negocio). Un PUT que lo reemplazara entero borraría la marca del cliente de
 * un plumazo. Por eso: lectura → merge → escritura, y **whitelist de claves editables**.
 *
 * Ref: docs/features/review-flow.md · docs/02-architecture.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import type { TenantConfig } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * Las únicas claves de `tenants.config` que el dashboard puede tocar.
 * Ampliar esta lista es una decisión consciente, no un efecto secundario.
 */
const EDITABLE_KEYS = ['google_maps_url'] as const
type EditableKey = (typeof EDITABLE_KEYS)[number]

function isEditableKey(key: string): key is EditableKey {
  return (EDITABLE_KEYS as readonly string[]).includes(key)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const tenantId = await requireTenantId()
    const service = getServiceClient()

    const { data, error } = await service
      .from('tenants')
      .select('config')
      .eq('id', tenantId)
      .single()

    if (error) {
      console.error('[TenantConfig] Error leyendo config:', error)
      return NextResponse.json({ error: 'Error obteniendo la configuración' }, { status: 500 })
    }

    const config = (data?.config ?? {}) as TenantConfig

    // Solo se devuelve lo editable: el resto del branding no es asunto de este endpoint.
    const editable: Partial<TenantConfig> = {}
    for (const key of EDITABLE_KEYS) {
      editable[key] = config[key]
    }

    return NextResponse.json(editable)
  } catch (error) {
    console.error('[TenantConfig] Error:', error)
    return NextResponse.json({ error: 'Error obteniendo la configuración' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = (await request.json()) as Record<string, unknown>
    const tenantId = await requireTenantId()
    const service = getServiceClient()

    const patch: Partial<TenantConfig> = {}
    for (const [key, value] of Object.entries(body)) {
      if (!isEditableKey(key)) continue
      if (typeof value !== 'string') {
        return NextResponse.json(
          { error: `El valor de ${key} debe ser texto` },
          { status: 400 }
        )
      }
      const trimmed = value.trim()

      // Un link vacío es válido: apaga el pop-up de reseñas. Uno mal formado, no.
      if (key === 'google_maps_url' && trimmed && !/^https?:\/\//i.test(trimmed)) {
        return NextResponse.json(
          { error: 'El link de Google debe empezar por http:// o https://' },
          { status: 400 }
        )
      }
      patch[key] = trimmed
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'No hay nada editable en la petición' },
        { status: 400 }
      )
    }

    // Merge ATÓMICO en la base de datos (`config = config || patch`, vía RPC de la 00032).
    // Antes era lectura → merge-en-JS → escritura, con una ventana en la que dos escrituras
    // concurrentes sobre `tenants.config` (el jsonb con TODO el branding) se pisaban y perdían
    // la del otro. Ahora el patch se aplica sobre el valor más reciente sin pasar por JS.
    const { error: writeError } = await service.rpc('merge_tenant_config', {
      p_tenant_id: tenantId,
      p_patch: patch,
    })

    if (writeError) {
      console.error('[TenantConfig] Error guardando config:', writeError)
      return NextResponse.json({ error: 'Error guardando la configuración' }, { status: 500 })
    }

    console.log(`[TenantConfig] Actualizado: ${Object.keys(patch).join(', ')}`)
    return NextResponse.json({ message: 'Configuración actualizada', ...patch })
  } catch (error) {
    console.error('[TenantConfig] Error:', error)
    return NextResponse.json({ error: 'Error guardando la configuración' }, { status: 500 })
  }
}
