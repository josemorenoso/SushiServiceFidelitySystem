import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordRedemption } from '@/services/redemption.service'
import { resolveHostContext } from '@/lib/tenant'
import { resolveStaffAuth } from '@/lib/staff-auth'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import type { RedemptionSource } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

interface RedeemBody {
  customer_id: string
  /** Camino principal desde la migración 00031: el premio otorgado que se entrega. */
  grant_id?: string | null
  mystery_box_result_id?: string | null
  /** Opcional: un premio de campaña no tiene tier. */
  tier_id?: string | null
  prize_title: string
  source?: RedemptionSource
  table_number?: number | null
  notes?: string | null
  pos_reference?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const host = request.headers.get('host')
    // Multi-sede F4 (D11): `resolveHostContext` resuelve la marca TAMBIEN por
    // `restaurant_locations.domain`. Sin eso, el mesero de la sede 2 abre
    // `laureles.marca.com/mesero` y toda esta superficie responde 404. `getTenantByDomain`
    // solo mira `tenants.domain` y CONSERVA su firma: la sede viaja por aqui.
    const tenant = (await resolveHostContext(host)).tenant
    if (!tenant) {
      return NextResponse.json(
        { error: 'Restaurante no reconocido', message: 'No se pudo identificar el restaurante para este dominio' },
        { status: 404 }
      )
    }

    const auth = await resolveStaffAuth(request, tenant)
    // Fallo de base ≠ credencial mala. Entregar un premio es una acción de una sola vía:
    // si el mesero cree que su sesión caducó, lo entrega igual "a mano" y la entrega no
    // queda registrada — el premio se puede volver a reclamar.
    if (auth.dbFailure) {
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos verificar tu sesión ahora mismo. NO marques el premio como entregado: intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Mesero o dispositivo no válido.' },
        { status: 401 }
      )
    }

    const body = (await request.json()) as RedeemBody
    const { customer_id, prize_title } = body

    // `tier_id` ya no es obligatorio: un premio de campaña no tiene tier. Lo que sí exigimos
    // es que la entrega esté anclada a ALGO (un grant o un resultado de mystery box), para
    // que los índices únicos de la DB puedan impedir la doble entrega.
    if (!customer_id || !prize_title) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere customer_id y prize_title' },
        { status: 400 }
      )
    }
    // Excepción: `staff_override` es una entrada MANUAL del mesero (registro de auditoría,
    // p. ej. una integración de POS). No tiene ancla y por eso no goza de la protección de
    // doble entrega de los índices únicos — es aceptable porque la escribe una persona a mano,
    // no un flujo automático. El resto de orígenes SÍ deben venir anclados.
    if (!body.grant_id && !body.mystery_box_result_id && body.source !== 'staff_override') {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere grant_id o mystery_box_result_id' },
        { status: 400 }
      )
    }

    // Validar que el cliente existe (defensa en profundidad: customer_id viene del body,
    // así que también verificamos que pertenezca a este tenant — evita IDOR entre restaurantes)
    const supabase = getServiceClient()
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    // Sin esto, un timeout del pooler le dice al mesero "Cliente no encontrado" — que es
    // justo la respuesta que le hace cerrar la pantalla y entregar el premio sin registrarlo.
    if (isDbFailure(customerError)) {
      logDbFailure({
        scope: 'RewardRedeem',
        reason: 'customer_lookup_error',
        error: customerError,
        context: { tenant: tenant.slug, customer_id },
      })
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos verificar al cliente ahora mismo. NO marques el premio como entregado: intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }
    if (!customer) {
      return NextResponse.json(
        { error: 'No encontrado', message: 'Cliente no encontrado' },
        { status: 404 }
      )
    }

    const result = await recordRedemption({
      customerId: customer_id,
      grantId: body.grant_id ?? null,
      mysteryBoxResultId: body.mystery_box_result_id ?? null,
      tierId: body.tier_id ?? null,
      prizeTitle: prize_title,
      source: body.source,
      redeemedByStaffId: auth.staffId,
      tableNumber: body.table_number ?? null,
      notes: body.notes ?? null,
      posReference: body.pos_reference ?? null,
    }, tenant.id)

    if (!result.ok) {
      const status = result.code === 'already_redeemed' ? 409 : result.code === 'invalid_result' ? 400 : 500
      return NextResponse.json({ error: 'No se pudo registrar', message: result.error, code: result.code }, { status })
    }

    return NextResponse.json({ ok: true, redemption: result.redemption }, { status: 201 })
  } catch (error) {
    console.error('[RewardRedeem] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error registrando la redención' },
      { status: 500 }
    )
  }
}
