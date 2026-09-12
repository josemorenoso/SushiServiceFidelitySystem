import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantTwilioCredentials } from '@/lib/twilio/tenant-credentials'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { listZernioTemplates } from '@/lib/zernio/messaging'
import { mapZernioTemplateToItem } from '@/lib/zernio/template-listing'
import { resolveGoldenBulletProvider } from '@/services/club-optin.service'

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
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const tenant = await getTenantById(await requireTenantId())
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
        const listado = await listZernioTemplates(tenant.zernio_account_id)
        const templates = (listado.templates ?? []).map(mapZernioTemplateToItem)
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
    const headers = {
      Authorization: creds.basicAuth,
      'Content-Type': 'application/json',
    }

    // ContentAndApprovals trae plantillas + estado de aprobación + motivo de rechazo
    // en UNA llamada. Antes se hacía 1 fetch de ApprovalRequests POR plantilla (N+1):
    // con 24 plantillas, "Sincronizar" tardaba varios segundos.
    const res = await fetch(`${TWILIO_CONTENT_API}AndApprovals?PageSize=100`, {
      headers,
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[Templates] Twilio API error:', res.status, errText)
      return NextResponse.json({ templates: [], error: 'Error consultando Twilio' })
    }

    const data = await res.json()
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

    const contents: TwilioContentItem[] = data.contents || []

    const templates = contents.map((t) => {
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

    return NextResponse.json({ templates, provider })
  } catch (error) {
    console.error('[Templates]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const creds = await getTenantTwilioCredentials()
    if (!creds) {
      return NextResponse.json({ error: 'Twilio no configurado' }, { status: 400 })
    }
    const headers = {
      Authorization: creds.basicAuth,
      'Content-Type': 'application/json',
    }

    const body = await request.json()
    const { name, language, category, body: messageBody, variables } = body

    if (!name || !messageBody) {
      return NextResponse.json({ error: 'Nombre y cuerpo son requeridos' }, { status: 400 })
    }

    // Reglas que Meta aplica SIEMPRE — validarlas aquí evita quemar un ciclo de
    // aprobación de 24-72h (y golpes a la reputación del número por rechazos):
    const trimmedBody = String(messageBody).trim()
    if (/^\{\{\d+\}\}/.test(trimmedBody) || /\{\{\d+\}\}\s*$/.test(trimmedBody)) {
      return NextResponse.json({
        error: 'Meta rechaza plantillas que empiezan o terminan con una variable. Agrega texto antes de la primera variable y después de la última (ej: "¡Hola {{1}}!" en vez de "{{1}} hola").',
      }, { status: 400 })
    }
    if (trimmedBody.length > 1024) {
      return NextResponse.json({
        error: `El cuerpo supera el límite de 1024 caracteres de WhatsApp (actual: ${trimmedBody.length}).`,
      }, { status: 400 })
    }

    // WhatsApp template name: lowercase letters, numbers, underscores only (Meta policy)
    const whatsappName = name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9_]/g, '_')                      // replace invalid chars with _
      .replace(/_+/g, '_')                               // collapse multiple underscores
      .replace(/^_|_$/g, '')                             // trim leading/trailing underscores
      .slice(0, 512)

    // Build variables map: {{1}}, {{2}}, etc.
    const varMatches = messageBody.match(/\{\{\d+\}\}/g) || []
    const uniqueVars = [...new Set(varMatches)] as string[]
    const variablesMap: Record<string, string> = {}
    uniqueVars.forEach((v) => {
      const num = v.replace(/[{}]/g, '')
      variablesMap[num] = variables?.[num] || `variable_${num}`
    })

    const twilioBody = {
      friendly_name: name,
      language: language || 'es',
      variables: Object.keys(variablesMap).length > 0 ? variablesMap : undefined,
      types: {
        'twilio/text': {
          body: messageBody,
        },
      },
    }

    const res = await fetch(TWILIO_CONTENT_API, {
      method: 'POST',
      headers,
      body: JSON.stringify(twilioBody),
    })

    if (!res.ok) {
      const errData = await res.json()
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
            category: category || 'UTILITY',
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
