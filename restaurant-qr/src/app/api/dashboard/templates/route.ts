import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TWILIO_CONTENT_API = 'https://content.twilio.com/v1/Content'

function getTwilioHeaders() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return {
    Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const headers = getTwilioHeaders()
    if (!headers) {
      return NextResponse.json({ templates: [], error: 'Twilio no configurado' })
    }

    const res = await fetch(TWILIO_CONTENT_API, {
      headers,
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[Templates] Twilio API error:', res.status, errText)
      return NextResponse.json({ templates: [], error: 'Error consultando Twilio' })
    }

    const data = await res.json()
    interface TwilioApprovalRequests {
      status?: string
      category?: string
      name?: string
      channel_type?: string
      whatsapp?: {
        status?: string
        category?: string
        rejection_reason?: string
      }
    }
    interface TwilioContentItem {
      sid: string
      friendly_name: string
      language: string
      date_created: string
      date_updated: string
      types: Record<string, { body?: string }>
      variables?: Record<string, string>
      approval_requests?: TwilioApprovalRequests | TwilioApprovalRequests[]
    }

    // Fetch approval status for each content item individually for reliability
    const contents: TwilioContentItem[] = data.contents || []

    const templates = await Promise.all(
      contents.map(async (t) => {
        let approvalStatus = 'draft'
        let category = 'MARKETING'

        // Helper to extract status from an approval object (handles multiple Twilio formats)
        const extractFromApprovalObj = (ar: TwilioApprovalRequests) => {
          const raw = ar.whatsapp?.status || ar.status || ''
          if (raw) approvalStatus = raw.toLowerCase()
          const cat = ar.whatsapp?.category || ar.category || ''
          if (cat) category = cat
        }

        const ar = t.approval_requests
        if (ar) {
          // approval_requests may be an array or a plain object depending on API version
          if (Array.isArray(ar)) {
            const whatsappEntry = (ar as TwilioApprovalRequests[]).find(
              (item) => item.whatsapp?.status || item.status
            )
            if (whatsappEntry) extractFromApprovalObj(whatsappEntry)
          } else {
            extractFromApprovalObj(ar)
          }
        }

        // Fetch from the authoritative endpoint: GET /ApprovalRequests (without /whatsapp)
        // Response structure: { whatsapp: { status: "approved", category: "MARKETING", ... } }
        try {
          const approvalRes = await fetch(
            `${TWILIO_CONTENT_API}/${t.sid}/ApprovalRequests`,
            { headers: headers!, cache: 'no-store' }
          )
          if (approvalRes.ok) {
            const approvalData = await approvalRes.json()
            const rawStatus = approvalData?.whatsapp?.status || ''
            if (rawStatus) approvalStatus = rawStatus.toLowerCase()
            const rawCategory = approvalData?.whatsapp?.category || ''
            if (rawCategory) category = rawCategory
          } else {
            const errText = await approvalRes.text()
            console.error(
              `[Templates] ApprovalRequests fetch failed for ${t.sid}: ${approvalRes.status} ${errText}`
            )
          }
        } catch (err) {
          console.error(`[Templates] ApprovalRequests exception for ${t.sid}:`, err)
        }

        const body = t.types?.['twilio/text']?.body
          || t.types?.['twilio/quick-reply']?.body
          || t.types?.['twilio/card']?.body
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
          variables: t.variables || {},
          createdAt: t.date_created,
          updatedAt: t.date_updated,
        }
      })
    )

    return NextResponse.json({ templates })
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

    const headers = getTwilioHeaders()
    if (!headers) {
      return NextResponse.json({ error: 'Twilio no configurado' }, { status: 400 })
    }

    const body = await request.json()
    const { name, language, category, body: messageBody, variables } = body

    if (!name || !messageBody) {
      return NextResponse.json({ error: 'Nombre y cuerpo son requeridos' }, { status: 400 })
    }

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

    // Auto-submit for approval
    try {
      await fetch(`${TWILIO_CONTENT_API}/${created.sid}/ApprovalRequests/whatsapp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name,
          category: category || 'MARKETING',
        }),
      })
    } catch {
      // Approval request is best-effort
    }

    return NextResponse.json({
      success: true,
      template: {
        sid: created.sid,
        name: created.friendly_name,
        status: 'pending',
      },
    })
  } catch (error) {
    console.error('[Templates]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
