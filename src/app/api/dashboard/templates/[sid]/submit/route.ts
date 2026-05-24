import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TWILIO_CONTENT_API = 'https://content.twilio.com/v1/Content'

function getTwilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sid: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const auth = getTwilioAuth()
    if (!auth) return NextResponse.json({ error: 'Twilio no configurado' }, { status: 400 })

    const { sid } = await params
    const body = await request.json().catch(() => ({}))
    const category: string = body.category || 'UTILITY'

    // Fetch current template to get friendly_name for the whatsapp name field
    const templateRes = await fetch(`${TWILIO_CONTENT_API}/${sid}`, {
      headers: { Authorization: auth },
      cache: 'no-store',
    })
    if (!templateRes.ok) {
      return NextResponse.json({ error: 'Template no encontrado en Twilio' }, { status: 404 })
    }
    const template = await templateRes.json()
    const whatsappName = (template.friendly_name as string)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 512)

    const approvalParams = new URLSearchParams({ name: whatsappName, category })
    const approvalRes = await fetch(
      `${TWILIO_CONTENT_API}/${sid}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers: { Authorization: auth },
        body: approvalParams,
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
      console.error('[Templates/submit] ApprovalRequest failed:', approvalRes.status, errMsg)
      return NextResponse.json({ error: errMsg }, { status: approvalRes.status })
    }

    const approvalData = await approvalRes.json()
    return NextResponse.json({
      success: true,
      status: approvalData?.whatsapp?.status || approvalData?.status || 'received',
    })
  } catch (err) {
    console.error('[Templates/submit]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
