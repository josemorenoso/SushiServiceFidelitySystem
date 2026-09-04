/**
 * GET /api/dashboard/location-scope
 *
 * Lo que el selector del panel necesita para dibujarse (multi-sede F7, §8.4):
 * el rol del usuario, la sede seleccionada por ESTA petición, y la lista de
 * sedes que puede ver. No lleva `?location_id=` con intención de filtrar datos
 * — lo lee igual que cualquier otra ruta (para que "recargar con la sede X ya
 * puesta" muestre el selector consistente), pero su propósito es alimentar
 * `LocationScopeContext`, no una tabla.
 *
 * Ref: docs/features/multi-sede.md, docs/superpowers/specs/2026-09-02-multisede-design.md §8.4
 */

import { NextResponse } from 'next/server'
import { requireLocationScope, toScopeView } from '@/lib/location-scope'

export async function GET(request: Request) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  return NextResponse.json(toScopeView(scopeResult.scope, scopeResult.locations))
}
