import { createClient } from '@supabase/supabase-js'
import { REACTIVATION_DAYS, REACTIVATION_AGGRESSIVE_DAYS } from '@/constants/rewards'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function getSettingValue(key: string, tenantId: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .eq('tenant_id', tenantId)
    .single()
  return data?.value ?? null
}

export async function getMultipleSettings(keys: string[], tenantId: string): Promise<Record<string, string>> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', keys)
    .eq('tenant_id', tenantId)
  const result: Record<string, string> = {}
  for (const row of data ?? []) {
    result[row.key] = row.value
  }
  return result
}

/**
 * Feature flag del sistema de puntos (admin_settings.points_system_enabled).
 * Encendido por defecto: solo se considera apagado si el valor es exactamente 'false'.
 * Si el admin apaga el toggle en Ajustes → "Sistema de Puntos", ningún endpoint
 * debe otorgar puntos (auditoría 18-Junio, CR-07/CR-02).
 */
export async function isPointsSystemEnabled(tenantId: string): Promise<boolean> {
  const value = await getSettingValue('points_system_enabled', tenantId)
  return value !== 'false'
}

export interface ReactivationDaysConfig {
  softDays: number
  aggressiveDays: number
}

/**
 * Lee los días de reactivación configurables desde admin_settings.
 * Keys: reactivation_soft_days (default 21), reactivation_aggressive_days (default 25).
 * Hace fallback a las constantes si no están configurados o no son válidos.
 */
export async function getReactivationDaysConfig(tenantId: string): Promise<ReactivationDaysConfig> {
  const settings = await getMultipleSettings([
    'reactivation_soft_days',
    'reactivation_aggressive_days',
  ], tenantId)

  const parsePositive = (value: string | undefined, fallback: number): number => {
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? n : fallback
  }

  const softDays = parsePositive(settings.reactivation_soft_days, REACTIVATION_DAYS)
  let aggressiveDays = parsePositive(settings.reactivation_aggressive_days, REACTIVATION_AGGRESSIVE_DAYS)

  // La agresiva siempre debe ser posterior a la suave
  if (aggressiveDays <= softDays) {
    aggressiveDays = softDays + 4
  }

  return { softDays, aggressiveDays }
}
