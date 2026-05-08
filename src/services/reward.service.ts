import { createClient } from '@supabase/supabase-js'
import type { Reward } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

export async function checkRewardForVisit(totalVisits: number): Promise<Reward | null> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('visit_milestone', totalVisits)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error buscando recompensa: ${error.message}`)
  }

  return data
}

export async function getNextReward(currentVisits: number): Promise<{ milestone: number; title: string } | null> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('rewards')
    .select('visit_milestone, title')
    .eq('is_active', true)
    .gt('visit_milestone', currentVisits)
    .order('visit_milestone', { ascending: true })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error buscando próxima recompensa: ${error.message}`)
  }

  // .gt('visit_milestone', n) excluye NULLs en SQL, así que data.visit_milestone es siempre number aquí.
  if (!data || data.visit_milestone === null) return null
  return { milestone: data.visit_milestone, title: data.title }
}

/**
 * Devuelve sólo el título del premio para usar en {{3}} de las plantillas.
 * La frase completa la define la plantilla aprobada en Twilio.
 */
export function getRewardTitle(nextReward: { milestone: number; title: string } | null): string {
  return nextReward?.title ?? 'más beneficios'
}

/**
 * Devuelve cuántas visitas faltan para el próximo premio.
 * Infinity si no hay más milestones — se usa para decidir near (1) vs far (≥2).
 */
export function getRemainingForReward(currentVisits: number, nextReward: { milestone: number; title: string } | null): number {
  if (!nextReward) return Infinity
  return nextReward.milestone - currentVisits
}

/**
 * @deprecated Use getRewardTitle + plantillas con sintaxis {{3}}.
 * Conservado para compatibilidad con código que aún no migró.
 */
export function buildRewardHint(currentVisits: number, nextReward: { milestone: number; title: string } | null): string {
  if (!nextReward) return '¡Sigue acumulando visitas para premios!'
  const remaining = nextReward.milestone - currentVisits
  if (remaining === 1) {
    return `¡En tu próxima visita ganas: ${nextReward.title}!`
  }
  return `En tu visita ${nextReward.milestone} ganas: ${nextReward.title} (te faltan ${remaining})`
}

/**
 * Fetch a single reward by id (para reactivación con regalo fijo o campañas manuales).
 */
export async function getRewardById(id: string): Promise<Reward | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error buscando recompensa ${id}: ${error.message}`)
  }
  return data
}
