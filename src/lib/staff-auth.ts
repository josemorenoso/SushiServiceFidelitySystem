/**
 * Autenticación del mesero para rutas públicas de staff.
 *
 * Dos escenarios, mismo esquema que ya usaban /api/check-in y /api/reward-redeem:
 *   A) Bearer <staff JWT>   — el mesero inició sesión con su PIN
 *   B) X-Device-Token       — dispositivo de confianza registrado
 *
 * Devuelve el `staffId` cuando la sesión es válida, para poder ATRIBUIR la acción
 * (quién entregó el premio). Un dispositivo de confianza sin mesero asociado es válido
 * pero no atribuible: `valid: true, staffId: null`.
 *
 * Ref: docs/features/staff-qr-scan.md
 */

import { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'
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

export interface StaffAuthResult {
  valid: boolean
  staffId: string | null
}

export async function resolveStaffAuth(
  request: NextRequest,
  tenant: Tenant
): Promise<StaffAuthResult> {
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
        console.warn('[StaffAuth] Bearer staff JWT inválido:', err instanceof Error ? err.message : err)
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
      await supabase
        .from('staff_devices')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', device.id)
      return { valid: true, staffId: device.staff_user_id ?? null }
    }
  }

  return { valid: false, staffId: null }
}
