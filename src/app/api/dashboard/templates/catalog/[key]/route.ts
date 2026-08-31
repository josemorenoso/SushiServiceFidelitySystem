/**
 * PUT /api/dashboard/templates/catalog/[key]
 *
 * Guarda la edición de UNA plantilla del catálogo estándar.
 *
 * Para el dueño esto es "guardar un documento". Por debajo crea una plantilla
 * nueva y la somete a Meta, SIN tocar la que se está enviando: la vieja sigue
 * vigente hasta que Meta aprueba la nueva (§12, "Pregunta 1 — RESUELTA"). Toda
 * esa mecánica vive en `template.service.ts`; esta ruta solo autentica, valida
 * la forma del body y traduce errores.
 *
 * `acceptedDisclaimer` es OBLIGATORIO: la decisión del dueño ("si se las llegan
 * a bloquear va a ser su culpa") solo se sostiene si queda registro de que vio y
 * aceptó la advertencia. El servicio guarda quién y cuándo.
 *
 * Docs: docs/features/whatsapp-templates.md · docs/API_DOCS.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt, getTenantById } from '@/lib/tenant'
import { isTemplateKey } from '@/constants/template-catalog'
import { saveTemplateEdit, TemplateError } from '@/services/template.service'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
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

    const payload = (await request.json().catch(() => ({}))) as {
      body?: unknown
      acceptedDisclaimer?: unknown
    }
    if (typeof payload.body !== 'string') {
      return NextResponse.json({ error: 'Falta el texto del mensaje.' }, { status: 400 })
    }

    const tenantId = await getTenantIdFromJwt()
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Vuelve a iniciar sesión para guardar cambios.' },
        { status: 401 }
      )
    }
    const tenant = await getTenantById(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })

    const result = await saveTemplateEdit({
      tenant,
      key,
      body: payload.body,
      acceptedDisclaimer: payload.acceptedDisclaimer === true,
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
    console.error('[Templates/catalog/key]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
