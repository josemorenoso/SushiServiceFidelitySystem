import { NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { getFullAnalytics } from '@/services/dashboard.service'

export async function GET(request: Request) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const analytics = await getFullAnalytics(scopeResult.scope)
    return NextResponse.json(analytics)
  } catch (error) {
    console.error('[Dashboard] Error analytics:', error)
    return NextResponse.json({ error: 'Error obteniendo analytics' }, { status: 500 })
  }
}
