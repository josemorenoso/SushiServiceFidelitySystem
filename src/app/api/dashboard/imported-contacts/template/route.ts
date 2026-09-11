import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { getSettingValue, getMultipleSettings } from '@/services/settings.service'
import {
  createClubInviteTemplate,
  buildClubInviteBody,
  BOTON_SI,
  BOTON_NO,
  BOTON_MAX,
  CUERPO_MAX,
  GoldenBulletTemplateError,
} from '@/services/golden-bullet-template.service'
import {
  CLUB_SETTING_KEYS,
  CLUB_PLACEHOLDERS,
  RESPUESTA_SI_DEFECTO,
  RESPUESTA_NO_DEFECTO,
} from '@/services/club-optin.service'
import { resolveBranding } from '@/lib/branding'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/** Upsert de las dos etiquetas en `admin_settings`, con `tenant_id` explícito. */
async function guardarEtiquetas(tenantId: string, botonSi: string, botonNo: string): Promise<void> {
  try {
    const db = getServiceClient()
    const ahora = new Date().toISOString()
    const { error } = await db.from('admin_settings').upsert(
      [
        { key: CLUB_SETTING_KEYS.botonSi, value: botonSi, updated_at: ahora, tenant_id: tenantId },
        { key: CLUB_SETTING_KEYS.botonNo, value: botonNo, updated_at: ahora, tenant_id: tenantId },
      ],
      { onConflict: 'key,tenant_id' }
    )
    if (error) console.error('[GoldenBullet] No se pudieron guardar las etiquetas de los botones:', error.message)
  } catch (err) {
    console.error('[GoldenBullet] Excepción guardando etiquetas:', err)
  }
}

/**
 * GET — lo que la pestaña necesita para pintarse. NO toca Twilio ni Meta.
 *
 * Devuelve el cuerpo de defecto (por si el operador no quiere escribir el
 * suyo), los límites, y las respuestas a los botones tal como están guardadas
 * en `admin_settings` (vacías = las de defecto, que también viajan para que
 * la pantalla las muestre).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await requireTenantId()
  const tenant = await getTenantById(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const brandName = resolveBranding(tenant.config).name
  const ajustes = await getMultipleSettings(Object.values(CLUB_SETTING_KEYS), tenantId)
  const slug = ajustes[CLUB_SETTING_KEYS.invitacion]?.trim() || null

  return NextResponse.json({
    brand_name: brandName,
    body_default: buildClubInviteBody(brandName, '[de dónde salió su número — y tiene que ser verdad]'),
    boton_si_default: BOTON_SI,
    boton_no_default: BOTON_NO,
    boton_max: BOTON_MAX,
    cuerpo_max: CUERPO_MAX,
    placeholders: CLUB_PLACEHOLDERS,
    respuestas: {
      si: ajustes[CLUB_SETTING_KEYS.respuestaSi] ?? '',
      no: ajustes[CLUB_SETTING_KEYS.respuestaNo] ?? '',
      si_default: RESPUESTA_SI_DEFECTO,
      no_default: RESPUESTA_NO_DEFECTO,
      foto_si: ajustes[CLUB_SETTING_KEYS.fotoSi] ?? '',
      boton_si: ajustes[CLUB_SETTING_KEYS.botonSi] ?? '',
      boton_no: ajustes[CLUB_SETTING_KEYS.botonNo] ?? '',
    },
    // El enlace que va en {enlace}: el de la invitación con premio si eligió
    // una (Recompensas → Invitaciones), si no el general de la tarjeta.
    invitacion_slug: slug,
    enlace: tenant.domain ? (slug ? `https://${tenant.domain}/c/${encodeURIComponent(slug)}` : `https://${tenant.domain}`) : null,
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

    const body = (await request.json()) as {
      body?: string
      boton_si?: string
      boton_no?: string
      promo_ejemplo?: string
    }

    const result = await createClubInviteTemplate(tenant, {
      body: body.body ?? '',
      botonSi: body.boton_si,
      botonNo: body.boton_no,
      promoEjemplo: body.promo_ejemplo,
    })

    // Los títulos con los que quedó creada se guardan para el respaldo por
    // texto del detector (ver `detectClubButton`). Best-effort: la plantilla ya
    // existe en Twilio y eso es lo que importa; si esto falla, el payload del
    // botón sigue reconociéndolo.
    await guardarEtiquetas(tenantId, result.botonSi, result.botonNo)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof GoldenBulletTemplateError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[GoldenBullet] Error creando la plantilla:', error)
    return NextResponse.json({ error: 'No se pudo crear la plantilla' }, { status: 500 })
  }
}
