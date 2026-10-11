import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantTwilioCredentials } from '@/lib/twilio/tenant-credentials'
import { getTenantIdFromJwt, getTenantById } from '@/lib/tenant'
import { listZernioTemplates } from '@/lib/zernio/messaging'
import { mapZernioTemplateToItem } from '@/lib/zernio/template-listing'
import { resolveGoldenBulletProvider } from '@/services/club-optin.service'
import { listarContenidoTwilio } from '@/lib/twilio/content-list'
import { exigirAlcanceDeMarca } from '@/lib/alcance-de-marca'
import { clasificarParaLaBiblioteca } from '@/lib/template-library'
import { getMultipleSettings } from '@/services/settings.service'
import { TEMPLATE_CATALOG, nombreDePlantillaLibre, validarPlantillaLibre } from '@/constants/template-catalog'
import { crearPlantillaLibreZernio, TemplateError } from '@/services/template.service'

export const dynamic = 'force-dynamic'

const TWILIO_CONTENT_API = 'https://content.twilio.com/v1/Content'

/**
 * GET — las plantillas del proveedor, en la forma que las pantallas ya conocen.
 *
 * Desde el 2026-09-12 es consciente del proveedor: un tenant Zernio recibe SU
 * WABA (antes recibía `[]` con «Twilio no configurado», y el asistente de
 * Golden Bullet, las campañas manuales y las burbujas de riesgo se quedaban
 * sin nada que elegir). `?provider=zernio|twilio` fuerza uno, y
 * `?provider=golden_bullet` pide el de la difusión, que puede ser distinto al
 * de la marca (la línea de coexistencia en Zernio con lo demás en Twilio; ver
 * `resolveGoldenBulletProvider`). Solo se acepta `zernio` si el tenant tiene la
 * cuenta conectada; si no, cae al de la marca.
 *
 * Desde el 2026-10-11 cada plantilla trae además `en_uso_por` (el mensaje automático que
 * la usa) y `biblioteca` (`true` = es de las de campaña): la pestaña Biblioteca y
 * Campañas → Mensaje libre separan con eso (`src/lib/template-library.ts`).
 */

/** Punteros de la marca para saber qué plantilla usa cada mensaje. Si no se leen, nada «en uso». */
async function punterosDe(tenantId: string | null): Promise<Record<string, string>> {
  if (!tenantId) return {}
  try {
    return await getMultipleSettings(
      [...TEMPLATE_CATALOG.map((t) => t.settingsKey), 'reactivation_with_reward_template_sid', 'reactivation_template_sid'],
      tenantId
    )
  } catch (error) {
    console.error('[Templates] No se pudieron leer los punteros para la biblioteca:', error)
    return {}
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Sin tenant en el JWT se sigue exactamente el camino de antes (Twilio con
    // lo que `getTenantTwilioCredentials()` resuelva): esta ruta nunca exigió tenant.
    const tenantId = await getTenantIdFromJwt()
    const tenant = tenantId ? await getTenantById(tenantId) : null
    const pedido = request.nextUrl.searchParams.get('provider')
    const brandProvider = tenant?.messaging_provider === 'zernio' ? 'zernio' : 'twilio'
    const provider =
      pedido === 'golden_bullet' && tenant
        ? await resolveGoldenBulletProvider(tenant)
        : pedido === 'zernio' && tenant?.zernio_account_id
          ? 'zernio'
          : pedido === 'twilio'
            ? 'twilio'
            : brandProvider

    if (provider === 'zernio') {
      if (!tenant?.zernio_account_id) {
        return NextResponse.json({ templates: [], provider, error: 'Zernio no configurado' })
      }
      try {
        const [listado, pointers] = await Promise.all([
          listZernioTemplates(tenant.zernio_account_id),
          punterosDe(tenant.id),
        ])
        const templates = clasificarParaLaBiblioteca(
          (listado.templates ?? []).map(mapZernioTemplateToItem),
          pointers,
          'zernio'
        )
        return NextResponse.json({ templates, provider })
      } catch (error) {
        console.error('[Templates] Zernio API error:', error instanceof Error ? error.message : error)
        return NextResponse.json({ templates: [], provider, error: 'Error consultando Zernio' })
      }
    }

    // Multitenant: la subcuenta del tenant, o el env SOLO para el tenant master
    // (`TWILIO_MASTER_TENANT_ID`). Un tenant sin subcuenta recibe la lista vacía:
    // el 2026-09-10 uno recién creado listó las 27 plantillas de Sushi Service.
    const creds = await getTenantTwilioCredentials()
    if (!creds) {
      return NextResponse.json({ templates: [], provider, error: 'Twilio no configurado' })
    }
    // ContentAndApprovals trae plantillas + estado de aprobación + motivo de rechazo
    // por página. Antes se hacía 1 fetch de ApprovalRequests POR plantilla (N+1):
    // con 24 plantillas, "Sincronizar" tardaba varios segundos. Y se leía UNA sola
    // página de 100: pasadas 100, las demás desaparecían (N23). Ahora se recorren todas.
    const listado = await listarContenidoTwilio<TwilioContentItem>(creds.basicAuth)

    if (!listado.ok) {
      console.error('[Templates] Twilio API error:', listado.status, listado.detalle)
      return NextResponse.json({ templates: [], error: 'Error consultando Twilio' })
    }

    interface TwilioContentItem {
      sid: string
      friendly_name: string
      language: string
      date_created: string
      date_updated: string
      types: Record<string, { body?: string; media?: string[] }>
      variables?: Record<string, string>
      approval_requests?: {
        status?: string
        category?: string
        rejection_reason?: string
      }
    }

    const contents: TwilioContentItem[] = listado.contents

    const items = contents.map((t) => {
      const ar = t.approval_requests
      const approvalStatus = (ar?.status || 'draft').toLowerCase()
      const category = ar?.category || 'MARKETING'
      const rejectionReason = ar?.rejection_reason?.trim() || null

      const body = t.types?.['twilio/text']?.body
        || t.types?.['twilio/media']?.body
        || t.types?.['twilio/quick-reply']?.body
        || t.types?.['twilio/card']?.body
        // Golden Bullet con foto (2026-09-11): cabecera de imagen + cuerpo + botones.
        || t.types?.['whatsapp/card']?.body
        || t.types?.['twilio/list-picker']?.body
        || '(tipo no textual)'

      return {
        sid: t.sid,
        friendly_name: t.friendly_name,
        name: t.friendly_name,
        language: t.language,
        approval_status: approvalStatus,
        status: approvalStatus,
        category,
        body,
        has_media: !!t.types?.['twilio/media'],
        // Las plantillas de EVENTO llevan una variable DENTRO de la URL de media
        // (`{{6}}` = el path del archivo en el bucket; ver src/lib/twilio/media.ts).
        // Los selectores de campaña solo rellenan {{1}}, {{2}} y {{3}}, así que esa
        // variable saldría vacía: por eso se excluyen. Una plantilla con imagen FIJA
        // no tiene ese problema — `ContentSid` y `MediaUrl` son excluyentes, la media
        // viaja en la definición de la plantilla y sale sola en cada envío.
        media_needs_variable: (t.types?.['twilio/media']?.media ?? []).some((u) => /\{\{\d+\}\}/.test(u)),
        rejection_reason: rejectionReason,
        variables: t.variables || {},
        createdAt: t.date_created,
        updatedAt: t.date_updated,
      }
    })
    const templates = clasificarParaLaBiblioteca(items, await punterosDe(tenantId), 'twilio')

    return NextResponse.json({ templates, provider })
  } catch (error) {
    console.error('[Templates]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

/**
 * POST — una plantilla LIBRE para la biblioteca de campañas (B4 y B5, 2026-10-11).
 *
 * Body: `{ name, body, category, variables }` (`variables` = el ejemplo de cada `{{n}}`).
 *
 *   · Alcance de MARCA (N5-bis): la plantilla queda en la cuenta de WhatsApp de la marca.
 *     Antes bastaba una sesión y un administrador de UNA sede creaba plantillas en ella.
 *   · Una sola regla para los dos proveedores (`validarPlantillaLibre()`, la misma que ve el
 *     formulario): antes esta ruta no exigía la línea de SALIR ni variables sin huecos.
 *   · Marca Zernio → `crearPlantillaLibreZernio()` (hasta hoy una marca Zernio no podía
 *     crear una plantilla libre). Marca Twilio → la Content API, como siempre.
 *
 * Ninguna escribe un puntero: una plantilla libre no es de ningún mensaje automático.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const guardia = await exigirAlcanceDeMarca(
      request,
      'Las plantillas son de la marca: solo un super usuario puede crearlas.'
    )
    if (!guardia.ok) return guardia.res

    const payload = (await request.json().catch(() => ({}))) as {
      name?: unknown
      category?: unknown
      body?: unknown
      variables?: unknown
    }
    const name = typeof payload.name === 'string' ? payload.name : ''
    const messageBody = typeof payload.body === 'string' ? payload.body : ''
    const category = typeof payload.category === 'string' ? payload.category : 'UTILITY'
    const samples: Record<string, string | undefined> = {}
    if (payload.variables && typeof payload.variables === 'object') {
      for (const [k, v] of Object.entries(payload.variables as Record<string, unknown>)) {
        if (typeof v === 'string') samples[k] = v
      }
    }

    const issues = validarPlantillaLibre({ name, body: messageBody, category, samples })
    if (issues.length > 0) {
      return NextResponse.json({ error: issues.join(' ') }, { status: 400 })
    }

    const tenant = await getTenantById(guardia.tenantId)
    if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })

    if (tenant.messaging_provider === 'zernio') {
      try {
        const created = await crearPlantillaLibreZernio({ tenant, name, body: messageBody, category, samples })
        return NextResponse.json({
          success: true,
          approval_submitted: true,
          approval_error: null,
          template: { sid: created.name, name: created.name, status: created.status.toLowerCase() },
        })
      } catch (err) {
        if (err instanceof TemplateError) {
          return NextResponse.json({ error: err.message }, { status: err.status })
        }
        throw err
      }
    }

    const creds = await getTenantTwilioCredentials(tenant.id)
    if (!creds) {
      return NextResponse.json({ error: 'Twilio no configurado' }, { status: 400 })
    }
    const headers = {
      Authorization: creds.basicAuth,
      'Content-Type': 'application/json',
    }

    // El nombre que ve Meta: minúsculas, números y guion bajo (la misma regla que Zernio).
    const whatsappName = nombreDePlantillaLibre(name)

    // El ejemplo de cada {{n}}: Twilio lo pide en `variables`, y Meta lo revisa.
    const variablesMap: Record<string, string> = {}
    for (const m of messageBody.matchAll(/\{\{(\d+)\}\}/g)) {
      variablesMap[m[1]] = (samples[m[1]] ?? '').trim()
    }

    const twilioBody = {
      friendly_name: name,
      language: 'es',
      variables: Object.keys(variablesMap).length > 0 ? variablesMap : undefined,
      types: {
        'twilio/text': {
          body: messageBody.trim(),
        },
      },
    }

    const res = await fetch(TWILIO_CONTENT_API, {
      method: 'POST',
      headers,
      body: JSON.stringify(twilioBody),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      console.error('[Templates] Create error:', errData)
      return NextResponse.json({
        error: errData.message || 'Error creando plantilla en Twilio',
      }, { status: res.status })
    }

    const created = await res.json()

    // Auto-submit for WhatsApp approval.
    // The /ApprovalRequests/whatsapp endpoint expects application/json, NOT form-encoded.
    // Sending form-encoded returns: "does not support this payload format".
    let approvalSubmitted = false
    let approvalError: string | null = null

    try {
      const approvalRes = await fetch(
        `${TWILIO_CONTENT_API}/${created.sid}/ApprovalRequests/whatsapp`,
        {
          method: 'POST',
          headers: {
            Authorization: headers.Authorization,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: whatsappName,
            category,
          }),
        }
      )
      if (!approvalRes.ok) {
        let errMsg = `HTTP ${approvalRes.status}`
        try {
          const errData = await approvalRes.json()
          errMsg = errData.message || errData.error_message || JSON.stringify(errData)
        } catch {
          errMsg = await approvalRes.text().catch(() => errMsg)
        }
        console.error('[Templates] ApprovalRequest failed:', approvalRes.status, errMsg)
        approvalError = errMsg
      } else {
        approvalSubmitted = true
        console.log('[Templates] ApprovalRequest submitted OK for', created.sid)
      }
    } catch (err) {
      console.error('[Templates] ApprovalRequest exception:', err)
      approvalError = err instanceof Error ? err.message : 'Error desconocido'
    }

    return NextResponse.json({
      success: true,
      approval_submitted: approvalSubmitted,
      approval_error: approvalError,
      template: {
        sid: created.sid,
        name: created.friendly_name,
        status: approvalSubmitted ? 'received' : 'unsubmitted',
      },
    })
  } catch (error) {
    console.error('[Templates]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
