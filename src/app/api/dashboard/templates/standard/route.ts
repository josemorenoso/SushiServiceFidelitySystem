/**
 * GET  /api/dashboard/templates/standard
 * POST /api/dashboard/templates/standard   { key: TemplateKey }
 *
 * El catálogo estándar visto desde un tenant **Twilio**: cuáles de las 13 ya
 * tiene, cuáles le faltan, y crear una que falte.
 *
 * Nace del reporte del dueño de que "faltan las plantillas de invitar a
 * restaurante los que piden por domicilio y al revés": están en el catálogo,
 * pero nunca se crearon en la cuenta Twilio de esos negocios, y sus presets de
 * campaña se ocultan solos mientras no haya plantilla aprobada (§15.2 de
 * docs/features/dashboard.md).
 *
 * Estrictamente aditivo: nunca reemplaza ni re-somete una plantilla existente.
 * El razonamiento completo está en `src/services/twilio-catalog.service.ts`.
 *
 * Espejo de `/api/dashboard/templates/catalog`, que es el camino Zernio: aquel
 * devuelve 409 a un tenant Twilio, y este devuelve 409 a uno Zernio.
 *
 * Docs: docs/features/whatsapp-templates.md · docs/API_DOCS.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt, getTenantById } from '@/lib/tenant'
import {
  TwilioCatalogError,
  createStandardTemplate,
  getStandardCatalogReport,
} from '@/services/twilio-catalog.service'
import type { Tenant } from '@/types/tenant.types'

export const dynamic = 'force-dynamic'

type Resolved = { tenant: Tenant } | { response: NextResponse }

async function resolveTenant(): Promise<Resolved> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const tenantId = await getTenantIdFromJwt()
  if (!tenantId) {
    return {
      response: NextResponse.json(
        { error: 'Vuelve a iniciar sesión para cargar la configuración de tu negocio.' },
        { status: 401 }
      ),
    }
  }

  const tenant = await getTenantById(tenantId)
  if (!tenant) {
    return { response: NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 }) }
  }

  return { tenant }
}

function describe(err: unknown, context: string): NextResponse {
  if (err instanceof TwilioCatalogError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error(context, err)
  return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
}

export async function GET() {
  const resolved = await resolveTenant()
  if ('response' in resolved) return resolved.response

  try {
    return NextResponse.json(await getStandardCatalogReport(resolved.tenant))
  } catch (err) {
    return describe(err, '[Templates/standard] GET')
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenant()
  if ('response' in resolved) return resolved.response

  let key: unknown
  try {
    key = (await request.json())?.key
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  if (typeof key !== 'string') {
    return NextResponse.json({ error: 'Falta "key": qué plantilla crear.' }, { status: 400 })
  }

  try {
    const result = await createStandardTemplate(resolved.tenant, key)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return describe(err, '[Templates/standard] POST')
  }
}
