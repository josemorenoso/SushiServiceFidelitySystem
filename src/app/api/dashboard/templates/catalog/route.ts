/**
 * GET /api/dashboard/templates/catalog
 *
 * Estado completo del catálogo estándar del tenant: las 13 plantillas, qué se
 * está enviando hoy, qué hay en revisión de Meta y qué texto propone su estilo.
 *
 * Docs: docs/features/whatsapp-templates.md · docs/API_DOCS.md
 *
 * Solo tenants Zernio. Un tenant Twilio recibe 409 con `provider: 'twilio'`
 * para que la pantalla caiga al gestor Twilio de siempre — decisión del dueño:
 * los 4 tenants Twilio no se tocan.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt, getTenantById } from '@/lib/tenant'
import { getTemplateCatalogState, TemplateError } from '@/services/template.service'

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

    if (tenant.messaging_provider !== 'zernio') {
      return NextResponse.json({ provider: tenant.messaging_provider }, { status: 409 })
    }

    return NextResponse.json(await getTemplateCatalogState(tenant))
  } catch (err) {
    if (err instanceof TemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[Templates/catalog]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
