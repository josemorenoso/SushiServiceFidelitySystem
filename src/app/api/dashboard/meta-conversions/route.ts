/**
 * GET / PUT /api/dashboard/meta-conversions
 *
 * El token de la API de Conversiones de Meta de la MARCA. Es la mitad secreta
 * del píxel propio: el id del píxel vive en `tenants.config` (público) y se
 * edita por `/api/dashboard/tenant-config`; el token vive en
 * `tenant_integration_secrets` (00061), que solo lee el service role.
 *
 * EL TOKEN NO SALE POR NINGÚN ENDPOINT. El GET dice si hay uno y de cuándo es;
 * el PUT lo reemplaza o lo borra. No hay forma de leerlo de vuelta: quien lo
 * perdió genera otro en el Administrador de eventos de Meta, que es gratis.
 *
 * ⚠️ Autentica con `requireTenantId()`, igual que `tenant-config`: un
 * `role='location'` puede cambiar el token de la marca entera. Es la misma
 * deuda que el resto de la config de marca (`docs/features/meta-pixel.md`
 * § Pendiente) y no se arregla acá sola.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { logDbFailure } from '@/lib/db-failure'
import { META_CONVERSIONS_PROVIDER } from '@/lib/meta-conversions-server'
import { validarTokenDeMeta } from '@/lib/meta-conversions'

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
    const { data, error } = await getServiceClient()
      .from('tenant_integration_secrets')
      .select('updated_at')
      .eq('tenant_id', tenantId)
      .eq('provider', META_CONVERSIONS_PROVIDER)
      .maybeSingle()

    if (error) {
      logDbFailure({ scope: 'MetaCAPI', reason: 'token_status_error', error, context: { tenantId } })
      // 42P01 = la 00061 no corrió. Se dice con palabras, no como un 500 mudo.
      const sinTabla = error.code === '42P01'
      return NextResponse.json(
        { error: sinTabla ? 'La API de Conversiones todavía no está habilitada en la base (migración 00061)' : 'Error consultando el token' },
        { status: sinTabla ? 503 : 500 }
      )
    }

    const row = data as { updated_at?: string } | null
    return NextResponse.json({ configured: Boolean(row), updated_at: row?.updated_at ?? null })
  } catch (error) {
    console.error('[MetaCAPI] Error:', error)
    return NextResponse.json({ error: 'Error consultando el token' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = (await request.json()) as { token?: unknown }
    const validado = validarTokenDeMeta(body.token)
    if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 })

    const tenantId = await requireTenantId()
    const service = getServiceClient()

    if (validado.token === '') {
      const { error } = await service
        .from('tenant_integration_secrets')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('provider', META_CONVERSIONS_PROVIDER)
      if (error) {
        logDbFailure({ scope: 'MetaCAPI', reason: 'token_delete_error', error, context: { tenantId } })
        return NextResponse.json({ error: 'Error borrando el token' }, { status: 500 })
      }
      console.log(`[MetaCAPI] Token borrado tenant=${tenantId}`)
      return NextResponse.json({ configured: false })
    }

    // `tenant_id` explícito SIEMPRE (guardrail del dominio). El upsert va por la
    // PK compuesta: una marca, un token por proveedor.
    const { error } = await service
      .from('tenant_integration_secrets')
      .upsert(
        { tenant_id: tenantId, provider: META_CONVERSIONS_PROVIDER, secret: validado.token, updated_by: user.id },
        { onConflict: 'tenant_id,provider' }
      )
    if (error) {
      logDbFailure({ scope: 'MetaCAPI', reason: 'token_upsert_error', error, context: { tenantId } })
      const sinTabla = error.code === '42P01'
      return NextResponse.json(
        { error: sinTabla ? 'La API de Conversiones todavía no está habilitada en la base (migración 00061)' : 'Error guardando el token' },
        { status: sinTabla ? 503 : 500 }
      )
    }
    console.log(`[MetaCAPI] Token guardado tenant=${tenantId}`)
    return NextResponse.json({ configured: true })
  } catch (error) {
    console.error('[MetaCAPI] Error:', error)
    return NextResponse.json({ error: 'Error guardando el token' }, { status: 500 })
  }
}
