import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TWILIO_MSG_COST_USD = 0.0058
const USD_TO_COP = 4200

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN

    if (!accountSid || !authToken) {
      console.warn('[TwilioBalance] Missing env vars:', {
        hasSid: !!accountSid,
        hasToken: !!authToken,
      })
      return NextResponse.json({
        balance: null,
        currency: 'USD',
        costPerMessage: TWILIO_MSG_COST_USD,
        costPerMessageCOP: Math.round(TWILIO_MSG_COST_USD * USD_TO_COP),
        error: 'Twilio no configurado — faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN',
      })
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`
    const res = await fetch(twilioUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[TwilioBalance] API error:', res.status, errBody)
      return NextResponse.json({
        balance: null,
        currency: 'USD',
        costPerMessage: TWILIO_MSG_COST_USD,
        costPerMessageCOP: Math.round(TWILIO_MSG_COST_USD * USD_TO_COP),
        error: `Twilio respondió ${res.status}: ${errBody.slice(0, 100)}`,
      })
    }

    const data = await res.json()
    const balance = parseFloat(data.balance)

    console.log('[TwilioBalance] OK:', { balance, currency: data.currency })

    return NextResponse.json({
      balance,
      currency: data.currency,
      costPerMessage: TWILIO_MSG_COST_USD,
      costPerMessageCOP: Math.round(TWILIO_MSG_COST_USD * USD_TO_COP),
      maxMessages: Math.floor(balance / TWILIO_MSG_COST_USD),
      balanceCOP: Math.round(balance * USD_TO_COP),
    })
  } catch (error) {
    console.error('[TwilioBalance] Exception:', error)
    return NextResponse.json(
      { error: `Error del servidor: ${error instanceof Error ? error.message : 'desconocido'}` },
      { status: 500 }
    )
  }
}
