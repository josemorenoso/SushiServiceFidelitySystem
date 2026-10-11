/**
 * POST /api/dashboard/templates/catalog/[key]/submit
 *
 * Manda a revisión de Meta el texto que el catálogo propone para este negocio,
 * TAL CUAL, sin pasar por el editor.
 *
 * Es el camino del alta: un negocio nuevo nace con las 13 sin configurar y en
 * la mayoría no hay nada que cambiar. Antes el único botón que las creaba en
 * bloque estaba escondido detrás de "elegir un estilo distinto al actual", así
 * que con el estilo por defecto no existía y había que editar 13 veces a mano.
 *
 * Hermana de `PUT /api/dashboard/templates/catalog/[key]`, con UNA diferencia
 * deliberada: aquí NO se pide la advertencia de responsabilidad. El texto no lo
 * escribió el dueño — es el nuestro, de `template-texts.ts` — y estampar una
 * aceptación sobre una redacción ajena sería un registro falso. El porqué
 * completo está en `submitSuggestedTemplate()`.
 *
 * No hay body: qué texto se manda lo decide el servidor a partir del estilo del
 * negocio. Si el cliente pudiera mandarlo, este sería el `PUT` sin la casilla.
 *
 * Docs: docs/features/whatsapp-templates.md · docs/API_DOCS.md
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantById } from '@/lib/tenant'
import { exigirAlcanceDeMarca } from '@/lib/alcance-de-marca'
import { isTemplateKey } from '@/constants/template-catalog'
import { submitSuggestedTemplate, TemplateError } from '@/services/template.service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
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

    // Las plantillas son de la MARCA (un puntero por marca, sin sede): editarlas, mandarlas a
    // Meta o activarlas exige alcance de marca (N5, 2026-10-11). Antes bastaba una sesión, y
    // un administrador de UNA sede cambiaba el mensaje que reciben los clientes de todas.
    const guardia = await exigirAlcanceDeMarca(
      request,
      'Las plantillas son de la marca: solo un super usuario puede cambiarlas.'
    )
    if (!guardia.ok) return guardia.res
    const tenant = await getTenantById(guardia.tenantId)
    if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })

    const result = await submitSuggestedTemplate({
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
    console.error('[Templates/catalog/key/submit]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
