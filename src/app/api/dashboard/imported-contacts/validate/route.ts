import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { validateCSV } from '@/services/imported-contacts.service'
import { getSettingValue } from '@/services/settings.service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = await requireTenantId()

  // Feature flag
  const enabled = await getSettingValue('golden_bullet_enabled', tenantId)
  if (enabled !== 'true') {
    return NextResponse.json(
      { error: 'Función desactivada', message: 'Golden Bullet no está habilitado. Actívalo en Ajustes.' },
      { status: 403 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Se requiere un archivo CSV' }, { status: 400 })
    }

    const text = await file.text()
    const result = await validateCSV(text, file.name, tenantId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[GoldenBullet] Error validando CSV:', error)
    return NextResponse.json({ error: 'Error procesando el CSV' }, { status: 500 })
  }
}
