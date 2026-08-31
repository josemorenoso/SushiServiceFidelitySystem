/**
 * PUT /api/dashboard/templates/style
 *
 * Cambia el estilo por defecto del negocio y, si se pide, lo re-aplica a las 13
 * plantillas del catálogo.
 *
 * DOS ACCIONES MUY DISTINTAS, a propósito (§12 respuesta 4 — el estilo es
 * SUGERENCIA, no candado):
 *
 *   `reapplyAll: false` → solo cambia el default. Ninguna plantilla se toca,
 *      nada va a Meta. Es el punto de partida de la próxima que se cree o edite.
 *
 *   `reapplyAll: true`  → además reescribe las 13 con el banco del estilo nuevo.
 *      Son 13 aprobaciones nuevas de Meta y hasta 3 días de revisión. La
 *      pantalla tiene que haberlo advertido ANTES de llegar aquí; por eso esta
 *      variante exige además `acceptedDisclaimer`.
 *
 * Docs: docs/features/whatsapp-templates.md · docs/API_DOCS.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt, getTenantById } from '@/lib/tenant'
import { isTemplateStyle } from '@/constants/template-catalog'
import {
  applyStyleToCatalog,
  assertZernioTenant,
  setTenantTemplateStyle,
  TemplateError,
} from '@/services/template.service'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const payload = (await request.json().catch(() => ({}))) as {
      style?: unknown
      reapplyAll?: unknown
      acceptedDisclaimer?: unknown
    }

    if (typeof payload.style !== 'string' || !isTemplateStyle(payload.style)) {
      return NextResponse.json({ error: 'Estilo no válido.' }, { status: 400 })
    }
    const style = payload.style

    const tenantId = await getTenantIdFromJwt()
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Vuelve a iniciar sesión para guardar cambios.' },
        { status: 401 }
      )
    }
    const tenant = await getTenantById(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })

    assertZernioTenant(tenant)

    if (payload.reapplyAll !== true) {
      await setTenantTemplateStyle(tenantId, style)
      return NextResponse.json({
        success: true,
        style,
        reapplied: false,
        message:
          'Listo. Los mensajes que crees o edites de ahora en adelante partirán de este estilo. Los que ya tienes siguen igual.',
      })
    }

    const result = await applyStyleToCatalog({
      tenant,
      style,
      editor: { userId: user.id, email: user.email ?? null },
      acceptedDisclaimer: payload.acceptedDisclaimer === true,
    })

    return NextResponse.json({
      success: true,
      style,
      reapplied: true,
      submitted: result.submitted,
      skipped: result.skipped,
      failed: result.failed,
      message:
        result.failed.length > 0
          ? `Se enviaron ${result.submitted.length} mensajes a revisión y ${result.failed.length} no se pudieron enviar. Los que ya tenías siguen funcionando.`
          : `Se enviaron ${result.submitted.length} mensajes a revisión de WhatsApp. Mientras los revisan, tus clientes siguen recibiendo los actuales.`,
    })
  } catch (err) {
    if (err instanceof TemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[Templates/style]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
