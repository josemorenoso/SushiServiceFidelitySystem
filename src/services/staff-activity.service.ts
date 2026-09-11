/**
 * Staff Activity Service — Rendimiento del equipo: escaneos y premios por mesero,
 * clientes nuevos vs frecuentes y mesas que más piden.
 *
 * Todo el cálculo vive en la base (`staff_activity_report()`, migración 00065):
 * decidir si una visita es la PRIMERA de un cliente exige mirar la historia fuera
 * del rango pedido, y traer todas las visitas de la marca al servidor para eso es
 * justo lo que la función evita. Acá solo se traduce el alcance de sede y la forma.
 *
 * Ref: docs/features/staff-activity.md
 */

import { createClient } from '@supabase/supabase-js'
import type { LocationScope } from '@/lib/location-scope'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

export interface StaffActivityTotals {
  scans: number
  new_customers: number
  returning_customers: number
  distinct_customers: number
  redemptions: number
  /** Escaneos desde un aparato sin mesero logueado. Se muestran, no se reparten. */
  scans_without_staff: number
  scans_without_table: number
}

export interface StaffActivityByStaff {
  /** NULL = el aparato registró sin mesero. Es una fila propia, no se esconde. */
  staff_id: string | null
  staff_name: string | null
  staff_is_active: boolean | null
  scans: number
  new_customers: number
  returning_customers: number
  distinct_customers: number
  redemptions: number
  last_scan_at: string | null
}

export interface StaffActivityByTable {
  /** NULL = el mesero no puso mesa. Fila propia. */
  table_number: number | null
  scans: number
  new_customers: number
  distinct_customers: number
  redemptions: number
}

export interface StaffActivityReport {
  totals: StaffActivityTotals
  by_staff: StaffActivityByStaff[]
  by_table: StaffActivityByTable[]
}

export interface StaffActivityRange {
  /** ISO. Inclusivo por los dos lados, igual que el resumen de redenciones. */
  from: string
  to: string
}

/**
 * La misma decisión que `applyLocationFilter()`, expresada como los dos parámetros
 * que entiende la función SQL. Se mantiene acá y no en la ruta para que un segundo
 * llamador no la reinvente distinta.
 */
export function scopeToRpcParams(scope: LocationScope): {
  p_location_ids: string[] | null
  p_include_unassigned: boolean
} {
  return {
    p_location_ids: scope.locationIds === null ? null : [...scope.locationIds],
    p_include_unassigned: scope.includesUnassigned,
  }
}

export class StaffActivityMigrationMissing extends Error {
  constructor() {
    super('Falta aplicar la migración 00065 en la base: staff_activity_report() no existe.')
    this.name = 'StaffActivityMigrationMissing'
  }
}

export async function getStaffActivityReport(
  range: StaffActivityRange,
  scope: LocationScope
): Promise<StaffActivityReport> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('staff_activity_report', {
    p_tenant_id: scope.tenantId,
    p_from: range.from,
    p_to: range.to,
    ...scopeToRpcParams(scope),
  })

  if (error) {
    // 42883 = la función no existe todavía: el código se desplegó antes que la
    // migración. Nombrarlo evita horas leyendo un 500 genérico.
    if ((error as { code?: string }).code === '42883') throw new StaffActivityMigrationMissing()
    throw new Error(`No se pudo calcular el rendimiento del equipo: ${error.message}`)
  }
  if (!data) throw new Error('staff_activity_report() no devolvió datos')

  const raw = data as StaffActivityReport
  return {
    totals: raw.totals,
    by_staff: raw.by_staff ?? [],
    by_table: raw.by_table ?? [],
  }
}
