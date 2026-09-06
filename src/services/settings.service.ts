import { createClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import {
  normalizeReactivationDays,
  deriveRecoveryZone,
  type RecoveryZone,
} from '@/constants/rewards'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/**
 * ESTAS DOS FUNCIONES LANZAN. No es un descuido: es el arreglo.
 * ────────────────────────────────────────────────────────────
 * Hasta el 2026-09-03 las dos descartaban el `error` de supabase-js y devolvían
 * `null` / `{}`. Como `supabase-js` no lanza, un timeout del pooler o una policy de RLS
 * producían exactamente el mismo vacío que "esa clave no está configurada" — y **todos**
 * los llamadores caen a sus valores por defecto ante el vacío. Consecuencias reales:
 *
 *   · `checkin_mode` → el default es `'auto'`. Un error de base APAGABA la verificación
 *     por mesero del check-in: el cliente se registraba solo, con visita y con bono de
 *     bienvenida, sin que ningún mesero escaneara nada. Es justo el fraude que el modo
 *     `staff_verified` existe para impedir, desactivándose sin una línea de log.
 *   · `points_system_enabled` → `isPointsSystemEnabled()` devuelve `value !== 'false'`, o
 *     sea que ante el vacío otorga puntos AUNQUE el admin los haya apagado.
 *   · los `*_template_sid` → sin plantilla no sale el WhatsApp, y el motivo real
 *     ("la base falló") quedaba indistinguible de "no la has configurado".
 *
 * Lanzar es lo que pide §24: si hay error, se registra con contexto y se falla de forma
 * visible o se PROPAGA. Los 18 sitios que las llaman están dentro de un `catch` que
 * convierte la excepción en un 500, en un resultado `ok:false` del cron o en un
 * `[Delivery][FALLO] reason=registro_fallido` — auditado uno por uno el 2026-09-03.
 *
 * Lo que NO cambia: una clave que sencillamente no está configurada sigue devolviendo
 * `null` / faltando en el mapa, sin lanzar. El vacío legítimo se respeta; lo que se
 * dejó de tratar como vacío es el FALLO.
 */
export async function getSettingValue(key: string, tenantId: string): Promise<string | null> {
  const supabase = getServiceClient()
  // `.maybeSingle()` y no `.single()`: una clave sin configurar es el caso NORMAL, y
  // `.single()` lo reporta como error PGRST116. Con `.maybeSingle()` el vacío llega como
  // `{ data: null, error: null }` y todo `error` que quede es un fallo de verdad.
  const { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'Settings',
      reason: 'setting_read_error',
      error,
      context: { tenant_id: tenantId, key },
    })
    throw new Error(`No se pudo leer la configuración "${key}": ${error.message}`)
  }

  return data?.value ?? null
}

export async function getMultipleSettings(keys: string[], tenantId: string): Promise<Record<string, string>> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', keys)
    .eq('tenant_id', tenantId)

  if (error) {
    logDbFailure({
      scope: 'Settings',
      reason: 'settings_read_error',
      error,
      context: { tenant_id: tenantId, keys: keys.join(',') },
    })
    throw new Error(`No se pudo leer la configuración (${keys.join(', ')}): ${error.message}`)
  }

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

  // La regla de normalización vive en constants/rewards.ts porque la tarjeta del
  // ciclo de recuperación (cliente) tiene que llegar al mismo número que el cron.
  return normalizeReactivationDays(
    settings.reactivation_soft_days,
    settings.reactivation_aggressive_days
  )
}

/**
 * La ventana reservada al cron de reactivación, DERIVADA de los días que el
 * tenant configuró en Ajustes.
 *
 * No es una preferencia aparte a propósito: la zona existe para proteger el
 * toque suave y el agresivo, así que tiene que moverse con ellos. Dos keys
 * independientes dejarían configurar una zona que no cubre el día del toque.
 *
 * Con los defaults (21 / 25) devuelve 18-25, igual que las constantes que esto
 * reemplaza: ningún tenant que no haya tocado sus días cambia de comportamiento.
 */
export async function getRecoveryZoneConfig(tenantId: string): Promise<RecoveryZone> {
  const { softDays, aggressiveDays } = await getReactivationDaysConfig(tenantId)
  return deriveRecoveryZone(softDays, aggressiveDays)
}
