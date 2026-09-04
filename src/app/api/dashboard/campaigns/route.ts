import { NextResponse } from 'next/server'
import { getUnscopedServiceClient } from '@/lib/supabase/unscoped'
import { requireLocationScope, applyLocationFilter } from '@/lib/location-scope'

export async function GET(request: Request) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const service = getUnscopedServiceClient()

    // Multi-sede F7 (§8.4): `campaigns.location_id` la deja SIEMPRE NULL
    // birthday/reactivation/manual hoy (deuda #12 de multi-sede.md, es F6).
    // `role='brand'` no cambia nada; un futuro `role='location'` vería la
    // lista vacía hasta que F6 la llene — fail CLOSED, no fail OPEN.
    const base = service.from('campaigns').select('*').eq('tenant_id', scopeResult.scope.tenantId)
    const query = applyLocationFilter(base, scopeResult.scope, 'location_id')
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50)

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('[Dashboard] Error campañas:', error)
    return NextResponse.json({ error: 'Error obteniendo campañas' }, { status: 500 })
  }
}
