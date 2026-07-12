/**
 * Campaign Reward Service — catálogo de premios de campaña.
 *
 * Los premios que el dueño edita en Dashboard > Premios de campaña ("1/2 sushi gratis",
 * "Postre cortesía") y que las campañas otorgan como `reward_grants`.
 *
 * Es deliberadamente independiente de `reward_tiers`: los tiers son premios que SE GANAN
 * con puntos, y regalar uno gratis por campaña devaluaría el sistema de puntos.
 *
 * Ref: docs/features/reward-grants.md
 */

import { createClient } from '@supabase/supabase-js'
import type { CampaignReward } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

export async function getCampaignRewards(
  tenantId: string,
  onlyActive = false
): Promise<CampaignReward[]> {
  const supabase = getServiceClient()
  let query = supabase
    .from('campaign_rewards')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (onlyActive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) {
    console.error('[CampaignReward] Error listando catálogo:', error.message)
    return []
  }
  return (data ?? []) as CampaignReward[]
}

/** Valida además que el premio pertenezca al tenant (defensa contra IDOR). */
export async function getCampaignRewardById(
  id: string,
  tenantId: string
): Promise<CampaignReward | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaign_rewards')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !data) return null
  return data as CampaignReward
}

export async function createCampaignReward(
  params: { title: string; description?: string | null },
  tenantId: string
): Promise<CampaignReward> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaign_rewards')
    .insert({
      tenant_id: tenantId,
      title: params.title,
      description: params.description ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Error creando premio de campaña: ${error.message}`)
  return data as CampaignReward
}

export async function updateCampaignReward(
  id: string,
  params: { title?: string; description?: string | null; is_active?: boolean },
  tenantId: string
): Promise<CampaignReward> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaign_rewards')
    .update(params)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw new Error(`Error actualizando premio de campaña: ${error.message}`)
  return data as CampaignReward
}

/**
 * Baja lógica, no borrado. Los `reward_grants` ya otorgados guardan el título como
 * snapshot, así que un premio retirado del catálogo no rompe nada de lo que hay en curso.
 */
export async function deactivateCampaignReward(id: string, tenantId: string): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('campaign_rewards')
    .update({ is_active: false })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`Error desactivando premio de campaña: ${error.message}`)
}
