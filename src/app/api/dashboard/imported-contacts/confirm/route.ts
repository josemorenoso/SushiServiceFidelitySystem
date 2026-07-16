import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { confirmImport, type ParsedContact } from '@/services/imported-contacts.service'
import { getSettingValue } from '@/services/settings.service'

export const dynamic = 'force-dynamic'
// El envío masivo puede tardar — damos margen (Fluid Compute permite hasta 300s).
export const maxDuration = 300

interface ConfirmBody {
  batch_id: string
  source_file: string
  template_sid: string
  promo_text: string
  fallback_name?: string
  contacts: ParsedContact[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = await requireTenantId()
  const enabled = await getSettingValue('golden_bullet_enabled', tenantId)
  if (enabled !== 'true') {
    return NextResponse.json(
      { error: 'Función desactivada', message: 'Golden Bullet no está habilitado.' },
      { status: 403 }
    )
  }

  try {
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = (await request.json()) as ConfirmBody
    if (!body.batch_id || !body.template_sid || !Array.isArray(body.contacts) || body.contacts.length === 0) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere batch_id, template_sid y contacts' },
        { status: 400 }
      )
    }
    if (!body.promo_text) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere promo_text (texto de la promo)' },
        { status: 400 }
      )
    }

    const result = await confirmImport({
      batchId: body.batch_id,
      sourceFile: body.source_file || 'import.csv',
      templateSid: body.template_sid,
      promoText: body.promo_text,
      fallbackName: body.fallback_name,
      contacts: body.contacts,
      tenant,
    })

    // Saldo insuficiente: nada se envió (spec W-D6).
    if (result.insufficient_balance) {
      return NextResponse.json(
        {
          error: 'Saldo insuficiente para esta importación',
          reason: 'insufficient_balance',
          ...result.insufficient_balance,
        },
        { status: 409 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[GoldenBullet] Error confirmando importación:', error)
    return NextResponse.json({ error: 'Error enviando la campaña' }, { status: 500 })
  }
}
