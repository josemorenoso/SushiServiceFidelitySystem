import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * El cliente `service_role` SIN alcance de sede. La segunda de las tres redes de
 * F7 (§5.2 del spec de multi-sede): **compilador → nombre feo del escape → test de
 * allowlist**.
 *
 * POR QUÉ SE LLAMA ASÍ
 * ────────────────────
 * `service_role` se salta el RLS por definición, así que un cliente construido con
 * él no filtra por marca NI por sede: todo el aislamiento lo ponen los
 * `.eq('tenant_id', …)` y `applyLocationFilter()` que escriba quien lo use. El
 * nombre existe para que ese costo se vea en el `import`, no para desalentar su
 * uso: es el cliente correcto para las lecturas que son **de la MARCA a propósito**
 * —clientes, tiers, Black, ROI— y para todo el camino de crons y webhooks.
 *
 * `getServiceClient()` no dice nada. `getUnscopedServiceClient()` obliga a que
 * quien lo lea se pregunte "¿y el alcance?", que es justo la pregunta que 55
 * archivos de este repo no se hicieron.
 *
 * ⚠️ NO es la red principal. La red principal es el tipo `LocationScope`
 *    (`src/lib/location-scope.ts`): la ruta que se olvida del filtro NO COMPILA.
 *    Esto solo hace visible el escape. Un test de allowlist
 *    (`tests/unit/location-scope-allowlist.test.ts`) vigila quién lo llama.
 *
 * ⚠️ SOLO SERVIDOR. `SUPABASE_SERVICE_ROLE_KEY` nunca lleva el prefijo
 *    `NEXT_PUBLIC_` y este módulo no se puede importar desde un componente
 *    cliente.
 */
export function getUnscopedServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}
