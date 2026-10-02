/**
 * POST /api/dashboard/templates/catalog/[key]/adopt
 *
 * Conecta a este mensaje del catálogo la plantilla que YA está aprobada en la
 * WABA del negocio y que el sistema no tenía registrada (alta por el AIOS: las
 * crea en Meta sin dejar versión ni puntero). Es el botón «Usar la aprobada».
 *
 * Hermana de `.../submit`: aquel crea una plantilla nueva en Meta; este no crea
 * nada, solo empieza a usar la que ya existe. Qué plantilla se conecta lo decide
 * el servidor contra el listado real de Zernio (`adoptApprovedTemplate()`): el
 * cliente no manda nombre, para que esto no se vuelva «apuntá a cualquier cosa».
 *
 * Docs: docs/features/whatsapp-templates.md · docs/API_DOCS.md
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt, getTenantById } from '@/lib/tenant'
import { isTemplateKey } from '@/constants/template-catalog'
import { adoptApprovedTemplate, TemplateError } from '@/services/template.service'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { key } = await params
    if (!isTemplateKey(key)) {
      return NextResponse.json({ error: 'Esa plantilla no existe en el catálogo.' }, { status: 404 })
    }

    const tenantId = await getTenantIdFromJwt()
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Vuelve a iniciar sesión para activar el mensaje.' },
        { status: 401 }
      )
    }
    const tenant = await getTenantById(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })

    const result = await adoptApprovedTemplate({
      tenant,
      key,
      editor: { userId: user.id, email: user.email ?? null },
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      version: result.version,
    })
  } catch (err) {
    if (err instanceof TemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[Templates/catalog/key/adopt]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
