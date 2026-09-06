/**
 * GET / PUT /api/dashboard/tenant-config
 *
 * Edición de `tenants.config` (jsonb) desde el dashboard. Sus clientes son el
 * link de reseñas de Google (hallazgo 3.8), la identidad visual de la marca
 * (§5/§6) y la config del QR Studio (§3).
 *
 * El link de reseñas NO se guarda en `admin_settings` a propósito:
 * `resolveBranding()` lo lee de `tenants.config`, y duplicarlo crearía dos
 * fuentes de verdad para el mismo dato. Lo mismo vale para logo y paleta.
 *
 * ⚠️ `config` es un jsonb que contiene TODO el tenant. Ni el GET ni el PUT lo
 * tratan como un objeto: se leen y se escriben RUTAS de una whitelist explícita
 * (`src/lib/tenant-config-paths.ts`). Ahí está el porqué de cada validación.
 *
 * FORMA DEL CUERPO. Plana y por rutas — el panel manda
 * `{"branding.primary": "#0a7c4a", "qr_studio.theme": "sushi"}`. La ruta lo
 * convierte al patch anidado que espera la base. Se eligió plano porque hace
 * imposible mandar un espacio entero por accidente: cada campo viaja solo.
 *
 * Ref: docs/features/identidad-visual.md · docs/features/review-flow.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { buildConfigPatch, projectEditablePaths } from '@/lib/tenant-config-paths'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
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

    const config = (data?.config ?? {}) as Record<string, unknown>
    return NextResponse.json(projectEditablePaths(config))
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

    const built = buildConfigPatch(body)
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    // Merge ATÓMICO y PROFUNDO en la base (`merge_tenant_config_deep`, 00048).
    //
    // Dos cosas se resuelven acá y ninguna es opcional:
    //   · Atómico — antes de la 00032 esto era lectura → merge en JS → escritura,
    //     con una ventana en la que dos escrituras concurrentes sobre el jsonb se
    //     pisaban y perdían la del otro.
    //   · Profundo — el `||` de jsonb mezcla solo el primer nivel: guardar
    //     `{branding:{primary}}` con el merge superficial BORRARÍA el logo y el
    //     resto del espacio `branding`, sin error y sin aviso.
    const { error: writeError } = await service.rpc('merge_tenant_config_deep', {
      p_tenant_id: tenantId,
      p_patch: built.patch,
    })

    if (writeError) {
      console.error('[TenantConfig] Error guardando config:', writeError)
      return NextResponse.json({ error: 'Error guardando la configuración' }, { status: 500 })
    }

    console.log(`[TenantConfig] Actualizado: ${built.paths.join(', ')}`)
    return NextResponse.json({ message: 'Configuración actualizada', updated: built.paths })
  } catch (error) {
    console.error('[TenantConfig] Error:', error)
    return NextResponse.json({ error: 'Error guardando la configuración' }, { status: 500 })
  }
}
