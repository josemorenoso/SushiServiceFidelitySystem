/**
 * POST /api/dashboard/imported-contacts/test-send
 *
 * Manda el mensaje 1 de Golden Bullet a UN número que el operador escribe, para
 * verlo en un celular antes de programar la base. Sale por el MISMO camino que
 * el envío real (`sendTemplateMessage()`: credenciales del tenant, opt-out,
 * presupuesto de línea, `message_logs` y su débito de billetera), con el mismo
 * contrato de variables que arma `confirmImport()`: `{{1}}` = nombre o el
 * genérico, `{{2}}` = la promo solo si viene. Un mensaje, un débito de 100 COP.
 *
 * Lo que NO hace: no inserta en `imported_contacts` ni encola nada, así que el
 * número de prueba no queda «ya contactado» y puede entrar después en el CSV.
 *
 * ⚠️ Sale de nuestra máquina: es un WhatsApp real a una persona real. Por eso
 * lo dispara alguien desde el panel, con el número tipeado a mano.
 *
 * Meta solo entrega plantillas APROBADAS fuera de la ventana de 24 h. Una
 * plantilla todavía en revisión llega igual si el número de prueba le escribió
 * a la línea en las últimas 24 horas (ventana de sesión): la tarjeta del panel
 * lo dice. Si Twilio la rechaza, el motivo se lee de `message_logs` y se
 * devuelve tal cual, porque `sendTemplateMessage()` devuelve `null` para todos
 * sus modos de fallo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { getSettingValue } from '@/services/settings.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { normalizePhone } from '@/services/imported-contacts.service'
import { CLUB_SETTING_KEYS, NOMBRE_GENERICO_DEFECTO, resolveGoldenBulletProvider } from '@/services/club-optin.service'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/** El último fallo registrado para ese número y esa plantilla, para decir POR QUÉ no salió. */
async function ultimoMotivoDeFallo(tenantId: string, phone: string, templateSid: string): Promise<string | null> {
  try {
    const { data } = await getServiceClient()
      .from('message_logs')
      .select('error_code, error_message')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .eq('template_sid', templateSid)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return [data.error_code, data.error_message].filter(Boolean).join(' — ') || null
  } catch {
    return null
  }
}

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
    const body = (await request.json()) as {
      phone?: string
      name?: string
      template_sid?: string
      promo_text?: string
      fallback_name?: string
    }

    const phone = normalizePhone(body.phone ?? '')
    if (!phone) {
      return NextResponse.json(
        { error: 'Número inválido', message: 'Escribí un celular colombiano: 3001234567 o +573001234567.' },
        { status: 400 }
      )
    }
    if (!body.template_sid?.trim()) {
      return NextResponse.json({ error: 'Datos inválidos', message: 'Elegí la plantilla que querés probar.' }, { status: 400 })
    }

    const tenant = await getTenantById(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const generico =
      body.fallback_name?.trim() ||
      (await getSettingValue(CLUB_SETTING_KEYS.nombreGenerico, tenantId))?.trim() ||
      NOMBRE_GENERICO_DEFECTO
    const nombre = body.name?.trim() || generico
    const promo = (body.promo_text ?? '').trim()
    const variables: Record<string, string> = promo ? { '1': nombre, '2': promo } : { '1': nombre }

    // Por la MISMA línea por la que va a salir la base (Twilio o la de
    // coexistencia en Zernio): probar por una y mandar por otra no prueba nada.
    const provider = await resolveGoldenBulletProvider(tenant)
    const enviado = await sendTemplateMessage(
      phone,
      body.template_sid.trim(),
      variables,
      tenant,
      { customerId: null, messageType: 'import' },
      { provider }
    )

    if (!enviado) {
      const motivo = await ultimoMotivoDeFallo(tenantId, phone, body.template_sid.trim())
      return NextResponse.json(
        {
          error: 'No salió',
          message: motivo
            ? `El proveedor no lo mandó: ${motivo}`
            : 'El proveedor no lo mandó. Si la plantilla sigue en revisión de Meta, escribile «hola» a la línea desde ese número y volvé a probar dentro de las 24 horas.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ sid: enviado.sid, status: enviado.status, phone, variables, provider })
  } catch (error) {
    console.error('[GoldenBullet] Error en el envío de prueba:', error)
    return NextResponse.json({ error: 'No se pudo enviar la prueba' }, { status: 500 })
  }
}
