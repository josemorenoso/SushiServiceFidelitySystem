import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireLocationScope, applyLocationFilter } from '@/lib/location-scope'
import { decidirSedeDestino } from '@/lib/authorized-number-sede'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { is_active, location_id } = body as {
      is_active?: boolean
      /** D9. `null` explícito = dejarlo en «sede desconocida»; ausente = no se toca. */
      location_id?: string | null
    }

    if (is_active !== undefined && typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active debe ser boolean' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (is_active !== undefined) updateData.is_active = is_active

    // D9 — moverle la sede al operador de domicilios. Es lo que decide a qué local se
    // atribuye cada pedido que entre por su celular (`resolveDeliveryLocation()`), así que
    // la decisión vive aparte y probada: `decidirSedeDestino()`.
    if (location_id !== undefined) {
      const decision = decidirSedeDestino(scopeResult.scope, location_id)
      if (!decision.ok) {
        return NextResponse.json(
          { error: decision.error, message: decision.message },
          { status: decision.status }
        )
      }
      updateData.location_id = location_id
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Nada que actualizar', message: 'Envía is_active o location_id.' },
        { status: 400 }
      )
    }

    const db = getServiceClient()
    // El filtro de sede aquí también es el candado: un número FUERA del alcance
    // del que llama no matchea ninguna fila, igual que hoy pasa si el `id` es de
    // otro tenant.
    const base = db.from('authorized_numbers').update(updateData).eq('id', id).eq('tenant_id', scopeResult.scope.tenantId)
    const query = applyLocationFilter(base, scopeResult.scope, 'location_id')
    const { data, error } = await query.select().maybeSingle()

    if (error) throw error
    // Cero filas no es un fallo del servidor: es un número que no existe, o que está fuera
    // del alcance de quien llama (otra marca, otra sede, o el cubo «sin sede» para un
    // administrador de sede). Con `.single()` esto salía como un 500 por un PGRST116.
    if (!data) {
      return NextResponse.json(
        { error: 'No encontrado', message: 'Ese número no existe o no está a tu alcance.' },
        { status: 404 }
      )
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('[AuthorizedNumbers] PATCH error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { id } = await params
    const db = getServiceClient()
    const base = db.from('authorized_numbers').delete().eq('id', id).eq('tenant_id', scopeResult.scope.tenantId)
    const query = applyLocationFilter(base, scopeResult.scope, 'location_id')
    const { error } = await query

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[AuthorizedNumbers] DELETE error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
