/**
 * GET /api/dashboard/templates/catalog
 *
 * Estado completo del catálogo estándar del negocio: cada mensaje, qué se está
 * enviando hoy, qué hay en revisión de Meta y qué texto propone el banco.
 *
 * Docs: docs/features/whatsapp-templates.md · docs/API_DOCS.md
 *
 * Desde el 2026-10-11 responde a los DOS proveedores con la misma forma: Plantillas es
 * una sola pantalla. Antes un negocio Twilio recibía 409 y la pantalla caía al gestor
 * Twilio de siempre, con «Ajustes › Plantillas» aparte para asignar.
 *   · Zernio → `getTemplateCatalogState()` (versiones, WABA, reconciliación).
 *   · Twilio → `getTwilioCatalogState()` (puntero + lo que dice Twilio, y las aprobadas
 *     para elegir).
 * Solo LEE: crear, mandar a Meta y elegir tienen sus rutas, con alcance de marca.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt, getTenantById } from '@/lib/tenant'
import { getTemplateCatalogState, TemplateError } from '@/services/template.service'
import { getTwilioCatalogState, TwilioCatalogError } from '@/services/twilio-catalog.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const tenantId = await getTenantIdFromJwt()
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Vuelve a iniciar sesión para cargar la configuración de tu negocio.' },
        { status: 401 }
      )
    }

    const tenant = await getTenantById(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })

    return NextResponse.json(
      tenant.messaging_provider === 'zernio'
        ? await getTemplateCatalogState(tenant)
        : await getTwilioCatalogState(tenant)
    )
  } catch (err) {
    if (err instanceof TemplateError || err instanceof TwilioCatalogError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[Templates/catalog]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
