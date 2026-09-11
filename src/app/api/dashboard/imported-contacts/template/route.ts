import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { getSettingValue } from '@/services/settings.service'
import {
  createClubInviteTemplate,
  buildClubInviteBody,
  GoldenBulletTemplateError,
} from '@/services/golden-bullet-template.service'
import { resolveBranding } from '@/lib/branding'

export const dynamic = 'force-dynamic'

/**
 * GET — vista previa. NO toca Twilio ni Meta.
 * Sirve para leer el mensaje exacto antes de mandarlo a aprobar.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await requireTenantId()
  const tenant = await getTenantById(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const procedencia = new URL(request.url).searchParams.get('procedencia') ?? ''
  const brandName = resolveBranding(tenant.config).name

  return NextResponse.json({
    brand_name: brandName,
    body: buildClubInviteBody(brandName, procedencia || '[de dónde salió su número]'),
  })
}

/**
 * POST — crea la plantilla en Twilio y la SOMETE A META.
 *
 * ⚠️ Esto sale de nuestra máquina: crea un recurso en la cuenta Twilio del
 * cliente y abre una solicitud de aprobación ante Meta que queda registrada en
 * su WABA. No es reversible con un botón. Por eso lo dispara una persona desde
 * el panel y no un proceso automático.
 *
 * Meta tarda entre 24 y 48 horas en responder.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await requireTenantId()
  const enabled = await getSettingValue('golden_bullet_enabled', tenantId)
  if (enabled !== 'true') {
    return NextResponse.json(
      { error: 'Función desactivada', message: 'Golden Bullet está apagado en esta marca. Encendelo con el botón de la pantalla Golden Bullet.' },
      { status: 403 }
    )
  }

  try {
    const tenant = await getTenantById(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const body = (await request.json()) as { procedencia?: string; promo_ejemplo?: string }

    const result = await createClubInviteTemplate(
      tenant,
      body.procedencia ?? '',
      body.promo_ejemplo ?? ''
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof GoldenBulletTemplateError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[GoldenBullet] Error creando la plantilla:', error)
    return NextResponse.json({ error: 'No se pudo crear la plantilla' }, { status: 500 })
  }
}
