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
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
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
  /**
   * `true` cuando la sesión no se pudo VERIFICAR porque la base falló — no porque la
   * credencial fuera mala. Sin este tercer estado, un timeout del pooler le contesta al
   * mesero exactamente lo mismo que un PIN equivocado: el mesero cree que se equivocó,
   * vuelve a intentar, y nadie se entera de que la base está caída.
   *
   * El llamador DEBE responder 503 (no 401) cuando esto viene en `true`.
   */
  dbFailure: boolean
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
          const { data: staff, error } = await supabase
            .from('staff_users')
            .select('id, is_active')
            .eq('id', sid)
            .eq('tenant_id', tenant.id)
            .maybeSingle()
          // El `error` se mira ANTES que el `data`. Con `.maybeSingle()` un mesero que no
          // existe devuelve `{ data: null, error: null }`, así que todo `error` que llegue
          // aquí es un fallo de verdad y no un "cero filas".
          if (isDbFailure(error)) {
            logDbFailure({
              scope: 'StaffAuth',
              reason: 'staff_lookup_error',
              error,
              context: { tenant: tenant.slug, staff_id: sid },
            })
            return { valid: false, staffId: null, dbFailure: true }
          }
          if (staff && staff.is_active) {
            return { valid: true, staffId: staff.id, dbFailure: false }
          }
        }
      } catch (err) {
        console.warn('[StaffAuth] Bearer staff JWT inválido:', err instanceof Error ? err.message : err)
      }
    }
  }

  // ─── Escenario B: dispositivo de confianza ───
  if (deviceToken) {
    const { data: device, error } = await supabase
      .from('staff_devices')
      .select('id, staff_user_id, is_trusted, expires_at')
      .eq('device_fingerprint', deviceToken)
      .eq('is_trusted', true)
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    if (isDbFailure(error)) {
      logDbFailure({
        scope: 'StaffAuth',
        reason: 'device_lookup_error',
        error,
        context: { tenant: tenant.slug },
      })
      return { valid: false, staffId: null, dbFailure: true }
    }
    if (device && (!device.expires_at || new Date(device.expires_at) >= new Date())) {
      // `last_used_at` es telemetría: que falle no invalida la sesión, pero tampoco se
      // calla — hasta hoy este UPDATE descartaba su resultado entero.
      const { error: touchError } = await supabase
        .from('staff_devices')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', device.id)
      if (touchError) {
        logDbFailure({
          scope: 'StaffAuth',
          reason: 'device_touch_error',
          error: touchError,
          context: { tenant: tenant.slug, device_id: device.id },
        })
      }
      return { valid: true, staffId: device.staff_user_id ?? null, dbFailure: false }
    }
  }

  return { valid: false, staffId: null, dbFailure: false }
}
