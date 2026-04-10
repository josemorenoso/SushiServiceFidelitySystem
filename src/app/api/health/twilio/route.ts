import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    return NextResponse.json({
      connected: false,
      error: 'TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN no están configurados',
      hasSid: !!accountSid,
      hasToken: !!authToken,
    })
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({
        connected: false,
        status: res.status,
        error: errText.slice(0, 200),
      })
    }

    const data = await res.json()
    return NextResponse.json({
      connected: true,
      balance: parseFloat(data.balance),
      currency: data.currency,
      accountSid: accountSid.slice(0, 6) + '...',
    })
  } catch (error) {
    return NextResponse.json({
      connected: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}
