import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/validators/cron'
import { findDueAutoEvents, executeAutoEvent } from '@/services/calendar.service'

export const dynamic = 'force-dynamic'

async function handleCron() {
  try {
    const dueEvents = await findDueAutoEvents()

    if (dueEvents.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, results: [] })
    }

    const results = []

    for (const event of dueEvents) {
      try {
        const result = await executeAutoEvent(event.id)
        results.push({
          event_id: event.id,
          title: event.title,
          ok: true,
          sent: result.sent,
          failed: result.failed,
          queued: result.queued,
          excluded_monthly_cap: result.excluded_monthly_cap,
          campaign_id: result.campaign_id,
        })
        console.log(
          `[CronCalendar] ✓ ${event.title}: sent=${result.sent} queued=${result.queued} failed=${result.failed} excluded=${result.excluded_monthly_cap}`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        console.error(`[CronCalendar] ✗ ${event.title} (${event.id}): ${msg}`)
        results.push({ event_id: event.id, title: event.title, ok: false, error: msg })
      }
    }

    const totalSent = results.reduce((acc, r) => acc + (r.sent ?? 0), 0)
    const totalFailed = results.reduce((acc, r) => acc + (r.failed ?? 0), 0)
    const totalQueued = results.reduce((acc, r) => acc + (r.queued ?? 0), 0)

    return NextResponse.json({
      ok: true,
      processed: dueEvents.length,
      total_sent: totalSent,
      total_queued: totalQueued,
      total_failed: totalFailed,
      results,
    })
  } catch (error) {
    console.error('[CronCalendar] Error fatal:', error)
    return NextResponse.json(
      { ok: false, error: 'Error ejecutando cron de calendario' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return handleCron()
}

export async function POST(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return handleCron()
}
