import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { recordRedemption } from '@/services/redemption.service'
import { getTenantByDomain } from '@/lib/tenant'
import type { RedemptionSource } from '@/types/database.types'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

function getStaffSecret(): Uint8Array | null {
  const s = process.env.STAFF_JWT_SECRET
  if (!s) return null
  return new TextEncoder().encode(s)
}

/**
 * Resuelve la autenticación del mesero desde headers (mismo esquema que /api/check-in
 * y /api/staff/stats): Bearer staff JWT o X-Device-Token. Devuelve el staffId si la
 * sesión es válida (para atribuir la entrega) y si la auth es válida en absoluto.
 */
async function resolveStaffAuth(
  request: NextRequest,
  tenant: Tenant
): Promise<{ valid: boolean; staffId: string | null }> {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null
  const deviceToken = request.headers.get('x-device-token')
  const supabase = getServiceClient()

  // ─── Escenario A: JWT de mesero ───
  if (bearer) {
    const secret = getStaffSecret()
    if (secret) {
      try {
        const { payload } = await jwtVerify(bearer, secret, { clockTolerance: 60 })
        const sid = typeof payload.sub === 'string' ? payload.sub : null
        if (sid) {
          const { data: staff } = await supabase
            .from('staff_users')
            .select('id, is_active')
            .eq('id', sid)
            .eq('tenant_id', tenant.id)
            .single()
          if (staff && staff.is_active) {
            return { valid: true, staffId: staff.id }
          }
        }
      } catch (err) {
        console.warn('[RewardRedeem] Bearer staff JWT inválido:', err instanceof Error ? err.message : err)
      }
    }
  }

  // ─── Escenario B: dispositivo de confianza ───
  if (deviceToken) {
    const { data: device } = await supabase
      .from('staff_devices')
      .select('id, staff_user_id, is_trusted, expires_at')
      .eq('device_fingerprint', deviceToken)
      .eq('is_trusted', true)
      .eq('tenant_id', tenant.id)
      .single()
    if (device && (!device.expires_at || new Date(device.expires_at) >= new Date())) {
      await supabase.from('staff_devices').update({ last_used_at: new Date().toISOString() }).eq('id', device.id)
      return { valid: true, staffId: device.staff_user_id ?? null }
    }
  }

  return { valid: false, staffId: null }
}

interface RedeemBody {
  customer_id: string
  mystery_box_result_id?: string | null
  tier_id: string
  prize_title: string
  source?: RedemptionSource
  table_number?: number | null
  notes?: string | null
  pos_reference?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const host = request.headers.get('host')
    const tenant = await getTenantByDomain(host)
    if (!tenant) {
      return NextResponse.json(
        { error: 'Restaurante no reconocido', message: 'No se pudo identificar el restaurante para este dominio' },
        { status: 404 }
      )
    }

    const auth = await resolveStaffAuth(request, tenant)
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Mesero o dispositivo no válido.' },
        { status: 401 }
      )
    }

    const body = (await request.json()) as RedeemBody
    const { customer_id, tier_id, prize_title } = body

    if (!customer_id || !tier_id || !prize_title) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere customer_id, tier_id y prize_title' },
        { status: 400 }
      )
    }

    // Validar que el cliente existe (defensa en profundidad: customer_id viene del body,
    // así que también verificamos que pertenezca a este tenant — evita IDOR entre restaurantes)
    const supabase = getServiceClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    if (!customer) {
      return NextResponse.json(
        { error: 'No encontrado', message: 'Cliente no encontrado' },
        { status: 404 }
      )
    }

    const result = await recordRedemption({
      customerId: customer_id,
      mysteryBoxResultId: body.mystery_box_result_id ?? null,
      tierId: tier_id,
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
