import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/twilio-metrics?days=30
 *
 * Métricas de mensajería Twilio (Req P2.3):
 * - Conteos por estado: enviados, entregados, leídos, fallidos, no entregados.
 * - Tasa de entrega y tasa de lectura (read receipts de WhatsApp).
 * - Opt-outs detectados: inbound con keyword (SALIR/STOP/...) + outbound con error 21610/63016.
 * - Timeline diario para gráfico de evolución.
 *
 * Fuente: Twilio Messages API (no requiere webhook de status callback).
 */

interface TwilioApiMessage {
  sid: string
  status: string
  error_code: number | null
  date_sent: string | null
  date_created: string
  direction: string
  to: string
  from: string
  body: string | null
}

interface TwilioMessagesPage {
  messages: TwilioApiMessage[]
  next_page_uri: string | null
}

interface TimelinePoint {
  date: string
  enviados: number
  entregados: number
  leidos: number
  fallidos: number
}

interface OptOutEntry {
  phone: string
  name: string | null
  date: string
  reason: 'keyword' | 'error_code'
  detail: string
}

// Keywords de opt-out configurados en el Messaging Service (docs/features/twilio-opt-out.md)
const OPT_OUT_KEYWORDS = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit',
  'baja', 'cancelar', 'salir', 'sal', 'sali', 'sair', 'fuera', 'optout', 'remova', 'unsubscribirse',
])

// Códigos de error Twilio que indican destinatario opt-out
const OPT_OUT_ERROR_CODES = new Set([21610, 63016])

const MAX_PAGES = 5 // hasta 5000 mensajes por consulta
const PAGE_SIZE = 1000

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Últimos 10 dígitos para matchear formatos distintos (57 + celular colombiano). */
function phoneKey(raw: string): string {
  const digits = normalizePhone(raw)
  return digits.slice(-10)
}

async function fetchMessages(accountSid: string, authToken: string, sinceDate: string): Promise<TwilioApiMessage[]> {
  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
  const baseHost = 'https://api.twilio.com'
  let url: string | null =
    `${baseHost}/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=${PAGE_SIZE}&DateSent%3E=${sinceDate}`

  const all: TwilioApiMessage[] = []
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url, { headers: { Authorization: auth }, cache: 'no-store' })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Twilio Messages API respondió ${res.status}: ${errBody.slice(0, 120)}`)
    }
    const data: TwilioMessagesPage = await res.json()
    all.push(...(data.messages ?? []))
    url = data.next_page_uri ? `${baseHost}${data.next_page_uri}` : null
  }
  return all
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: 'Twilio no configurado — faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN' },
        { status: 503 }
      )
    }

    const daysParam = Number(request.nextUrl.searchParams.get('days') ?? '30')
    const days = Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= 90 ? daysParam : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const sinceDate = since.toISOString().slice(0, 10)

    const messages = await fetchMessages(accountSid, authToken, sinceDate)

    const outbound = messages.filter((m) => m.direction.startsWith('outbound'))
    const inbound = messages.filter((m) => m.direction === 'inbound')

    // ─── Conteos por estado (outbound) ───
    const statusCounts: Record<string, number> = {}
    for (const m of outbound) {
      statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1
    }
    const delivered = statusCounts.delivered ?? 0
    const read = statusCounts.read ?? 0
    const failed = statusCounts.failed ?? 0
    const undelivered = statusCounts.undelivered ?? 0
    const pending = (statusCounts.queued ?? 0) + (statusCounts.accepted ?? 0) + (statusCounts.sending ?? 0) + (statusCounts.sent ?? 0)
    const total = outbound.length
    // 'read' implica entregado: la tasa de entrega incluye leídos
    const deliveredOrRead = delivered + read

    // ─── Opt-outs ───
    const optOutMap = new Map<string, OptOutEntry>()
    for (const m of inbound) {
      const keyword = (m.body ?? '').trim().toLowerCase()
      if (OPT_OUT_KEYWORDS.has(keyword)) {
        const key = phoneKey(m.from)
        const date = m.date_sent ?? m.date_created
        const existing = optOutMap.get(key)
        if (!existing || new Date(date) > new Date(existing.date)) {
          optOutMap.set(key, {
            phone: normalizePhone(m.from),
            name: null,
            date,
            reason: 'keyword',
            detail: `Respondió "${(m.body ?? '').trim()}"`,
          })
        }
      }
    }
    for (const m of outbound) {
      if (m.error_code !== null && OPT_OUT_ERROR_CODES.has(m.error_code)) {
        const key = phoneKey(m.to)
        if (!optOutMap.has(key)) {
          optOutMap.set(key, {
            phone: normalizePhone(m.to),
            name: null,
            date: m.date_sent ?? m.date_created,
            reason: 'error_code',
            detail: `Envío rechazado (error ${m.error_code})`,
          })
        }
      }
    }

    // Mapear nombres de clientes por teléfono
    if (optOutMap.size > 0) {
      const { data: customers } = await supabase.from('customers').select('name, phone')
      const byKey = new Map<string, string>()
      for (const c of customers ?? []) {
        byKey.set(phoneKey(c.phone), c.name)
      }
      for (const [key, entry] of optOutMap) {
        entry.name = byKey.get(key) ?? null
      }
    }

    const optOuts = Array.from(optOutMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    // ─── Timeline diario ───
    const timelineMap = new Map<string, TimelinePoint>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      timelineMap.set(d, { date: d, enviados: 0, entregados: 0, leidos: 0, fallidos: 0 })
    }
    for (const m of outbound) {
      const dateStr = m.date_sent ?? m.date_created
      const day = new Date(dateStr).toISOString().slice(0, 10)
      const point = timelineMap.get(day)
      if (!point) continue
      point.enviados++
      if (m.status === 'delivered') point.entregados++
      else if (m.status === 'read') { point.entregados++; point.leidos++ }
      else if (m.status === 'failed' || m.status === 'undelivered') point.fallidos++
    }

    return NextResponse.json({
      days,
      since: sinceDate,
      totals: {
        total,
        delivered: deliveredOrRead,
        read,
        failed,
        undelivered,
        pending,
        deliveryRate: total > 0 ? Math.round((deliveredOrRead / total) * 100) : 0,
        readRate: deliveredOrRead > 0 ? Math.round((read / deliveredOrRead) * 100) : 0,
      },
      optOuts,
      optOutCount: optOuts.length,
      timeline: Array.from(timelineMap.values()),
      truncated: messages.length >= MAX_PAGES * PAGE_SIZE,
    })
  } catch (error) {
    console.error('[TwilioMetrics] Exception:', error)
    return NextResponse.json(
      { error: `Error consultando métricas: ${error instanceof Error ? error.message : 'desconocido'}` },
      { status: 500 }
    )
  }
}
