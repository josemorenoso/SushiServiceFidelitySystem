/**
 * Invitaciones con premio — un enlace o QR que regala algo a quien se registre.
 *
 * Doc: docs/features/invite-campaigns.md
 * Migración: 00063_invitaciones_con_premio.sql
 *
 * QUÉ RESUELVE
 * ────────────
 * El dueño quiere regalar un 2x1 y que la gente VENGA. Crea la invitación, le
 * queda un enlace `/c/{slug}` y su QR, lo manda por WhatsApp o lo pone en redes.
 * Quien lo abre se registra; el premio le aparece en su tarjeta desde ese
 * momento; y lo reclama cuando el mesero lo escanea en el local.
 *
 * POR QUÉ NO HAY "TARJETA PROVISIONAL"
 * ───────────────────────────────────
 * Otros sistemas la inventan porque no tienen el concepto de premio con dueño
 * pendiente de reclamar. Este lo tiene: `reward_grants`. El premio de una
 * invitación es un grant `campaign_prize` con `source = 'invite'`, y el reclamo
 * es el mismo de siempre — el mesero escanea, le salta el aviso, toca Entregar.
 * Nada nuevo que enseñarle al mesero.
 *
 * LA REGLA DE SEGURIDAD, y dónde vive: quien se registra por una invitación NO
 * recibe la visita #1 automática, tenga la marca lo que tenga en
 * `checkin_first_visit_free`. Se registra desde su casa, no desde la mesa. Eso lo
 * impone `/api/check-in` (`pendingStaffScan = true`); este servicio solo otorga.
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure } from '@/lib/db-failure'
import { grantReward } from '@/services/reward-grant.service'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export interface QrCampaign {
  id: string
  tenant_id: string
  location_id: string | null
  slug: string
  name: string
  reward_title: string
  reward_description: string | null
  window_days: number | null
  starts_at: string | null
  ends_at: string | null
  max_grants: number | null
  is_active: boolean
  created_at: string
}

export interface QrCampaignStats {
  /** Registros con premio otorgado (activos + redimidos + vencidos). */
  granted: number
  /** Vinieron y el mesero les entregó. */
  redeemed: number
  /** Todavía lo tienen pendiente en la tarjeta. */
  pending: number
  expired: number
}

export type QrCampaignWithStats = QrCampaign & { stats: QrCampaignStats }

/** Slug válido: minúsculas, números y guiones, 2-40. Espejo del CHECK de la 00063. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Convierte "Promo Apertura 2x1" en "promo-apertura-2x1". PURA: es lo que se
 * prueba sin base.
 */
export function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export type CampaignAvailability =
  | { ok: true }
  | { ok: false; reason: 'inactive' | 'not_started' | 'ended' | 'sold_out' }

/**
 * ¿Se puede otorgar el premio de esta invitación AHORA?
 *
 * PURA a propósito: recibe la campaña y cuántos premios lleva otorgados, y decide.
 * Es la misma función que usa la landing (para mostrar "agotado" en vez de un
 * formulario que va a fallar) y el registro (para no regalar de más).
 */
export function checkAvailability(
  c: Pick<QrCampaign, 'is_active' | 'starts_at' | 'ends_at' | 'max_grants'>,
  granted: number,
  now: Date = new Date()
): CampaignAvailability {
  if (!c.is_active) return { ok: false, reason: 'inactive' }
  if (c.starts_at && new Date(c.starts_at) > now) return { ok: false, reason: 'not_started' }
  if (c.ends_at && new Date(c.ends_at) < now) return { ok: false, reason: 'ended' }
  if (c.max_grants !== null && granted >= c.max_grants) return { ok: false, reason: 'sold_out' }
  return { ok: true }
}

// ─── Lectura ────────────────────────────────────────────────────

async function countGrants(campaignId: string): Promise<QrCampaignStats> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('reward_grants')
    .select('status')
    .eq('qr_campaign_id', campaignId)

  if (error) {
    logDbFailure({ scope: 'QrCampaign', reason: 'count_grants_error', error, context: { campaign_id: campaignId } })
    return { granted: 0, redeemed: 0, pending: 0, expired: 0 }
  }

  const s: QrCampaignStats = { granted: 0, redeemed: 0, pending: 0, expired: 0 }
  for (const row of data ?? []) {
    s.granted++
    if (row.status === 'redeemed') s.redeemed++
    else if (row.status === 'expired') s.expired++
    else s.pending++
  }
  return s
}

export async function listCampaigns(tenantId: string): Promise<QrCampaignWithStats[]> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('qr_campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    logDbFailure({ scope: 'QrCampaign', reason: 'list_error', error, context: { tenant_id: tenantId } })
    throw new Error(`No se pudieron listar las invitaciones: ${error.message}`)
  }

  const out: QrCampaignWithStats[] = []
  for (const c of (data ?? []) as QrCampaign[]) {
    out.push({ ...c, stats: await countGrants(c.id) })
  }
  return out
}

/** La invitación por su slug, dentro de la marca. `null` si no existe. */
export async function getCampaignBySlug(slug: string, tenantId: string): Promise<QrCampaign | null> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('qr_campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    logDbFailure({ scope: 'QrCampaign', reason: 'get_by_slug_error', error, context: { tenant_id: tenantId, slug } })
    return null
  }
  return (data as QrCampaign | null) ?? null
}

/** Lo que la landing pública puede saber: nada que no esté ya en el mensaje que se compartió. */
export interface PublicCampaignView {
  slug: string
  name: string
  reward_title: string
  reward_description: string | null
  window_days: number | null
  ends_at: string | null
  availability: CampaignAvailability
  /** Cupos que quedan, solo si hay cupo. Para la barra de urgencia de la landing. */
  remaining: number | null
}

export async function getPublicCampaign(slug: string, tenantId: string): Promise<PublicCampaignView | null> {
  const c = await getCampaignBySlug(slug, tenantId)
  if (!c) return null
  const stats = await countGrants(c.id)
  return {
    slug: c.slug,
    name: c.name,
    reward_title: c.reward_title,
    reward_description: c.reward_description,
    window_days: c.window_days,
    ends_at: c.ends_at,
    availability: checkAvailability(c, stats.granted),
    remaining: c.max_grants !== null ? Math.max(0, c.max_grants - stats.granted) : null,
  }
}

// ─── Escritura ──────────────────────────────────────────────────

export interface CreateCampaignInput {
  name: string
  slug?: string
  reward_title: string
  reward_description?: string | null
  window_days?: number | null
  starts_at?: string | null
  ends_at?: string | null
  max_grants?: number | null
  location_id?: string | null
}

export class QrCampaignError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'QrCampaignError'
  }
}

export async function createCampaign(input: CreateCampaignInput, tenantId: string): Promise<QrCampaign> {
  const slug = (input.slug?.trim() || slugify(input.name)).toLowerCase()
  if (!SLUG_RE.test(slug) || slug.length < 2) {
    throw new QrCampaignError(
      'El enlace solo puede llevar minúsculas, números y guiones (ej. promo-apertura).',
      400
    )
  }
  if (!input.name.trim()) throw new QrCampaignError('Falta el nombre de la invitación.', 400)
  if (!input.reward_title.trim()) throw new QrCampaignError('Falta qué se regala.', 400)

  const db = getServiceClient()
  const { data, error } = await db
    .from('qr_campaigns')
    .insert({
      tenant_id: tenantId, // SIEMPRE explícito (DEFAULT puente de la 00028)
      location_id: input.location_id ?? null,
      slug,
      name: input.name.trim(),
      reward_title: input.reward_title.trim(),
      reward_description: input.reward_description?.trim() || null,
      window_days: input.window_days ?? null,
      starts_at: input.starts_at ?? null,
      ends_at: input.ends_at ?? null,
      max_grants: input.max_grants ?? null,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new QrCampaignError(`Ya existe una invitación con el enlace "${slug}". Elegí otro.`, 409)
    }
    logDbFailure({ scope: 'QrCampaign', reason: 'create_error', error, context: { tenant_id: tenantId, slug } })
    throw new QrCampaignError(`No se pudo crear la invitación: ${error.message}`, 500)
  }
  return data as QrCampaign
}

export interface UpdateCampaignInput {
  name?: string
  reward_title?: string
  reward_description?: string | null
  window_days?: number | null
  starts_at?: string | null
  ends_at?: string | null
  max_grants?: number | null
  is_active?: boolean
}

/**
 * Edita lo editable. El `slug` NO se cambia: ya puede estar impreso en un QR o
 * mandado por WhatsApp — cambiarlo rompe un enlace que la gente tiene en la mano.
 * Si el dueño necesita otro, crea otra invitación.
 */
export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
  tenantId: string
): Promise<QrCampaign> {
  const db = getServiceClient()
  const cambios: Record<string, unknown> = {}
  if (input.name !== undefined) cambios.name = input.name.trim()
  if (input.reward_title !== undefined) cambios.reward_title = input.reward_title.trim()
  if (input.reward_description !== undefined) cambios.reward_description = input.reward_description?.trim() || null
  if (input.window_days !== undefined) cambios.window_days = input.window_days
  if (input.starts_at !== undefined) cambios.starts_at = input.starts_at
  if (input.ends_at !== undefined) cambios.ends_at = input.ends_at
  if (input.max_grants !== undefined) cambios.max_grants = input.max_grants
  if (input.is_active !== undefined) cambios.is_active = input.is_active

  const { data, error } = await db
    .from('qr_campaigns')
    .update(cambios)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .maybeSingle()

  if (error) {
    logDbFailure({ scope: 'QrCampaign', reason: 'update_error', error, context: { tenant_id: tenantId, id } })
    throw new QrCampaignError(`No se pudo guardar: ${error.message}`, 500)
  }
  if (!data) throw new QrCampaignError('Invitación no encontrada.', 404)
  return data as QrCampaign
}

// ─── El otorgamiento, desde el registro ─────────────────────────

export type GrantFromInviteResult =
  | { ok: true; grantId: string; rewardTitle: string }
  | {
      ok: false
      reason: 'inactive' | 'not_started' | 'ended' | 'sold_out' | 'not_found' | 'duplicate_active' | 'db_error'
    }

/**
 * Otorga el premio de una invitación a un cliente recién registrado.
 *
 * Se llama desde `/api/check-in` (register) cuando llega `campaign_slug`. Vuelve a
 * comprobar la disponibilidad ACÁ y no solo en la landing: entre que la persona
 * abrió el enlace y llenó el formulario pudo agotarse el cupo o vencer la fecha.
 *
 * Best-effort respecto del registro: si esto falla, el cliente YA quedó
 * registrado (eso es lo correcto) y lo único que no recibe es el premio. Se
 * loguea, no se lanza.
 */
export async function grantFromInvite(
  slug: string,
  customerId: string,
  tenantId: string
): Promise<GrantFromInviteResult> {
  const c = await getCampaignBySlug(slug, tenantId)
  if (!c) return { ok: false, reason: 'not_found' }

  const stats = await countGrants(c.id)
  const disponible = checkAvailability(c, stats.granted)
  if (!disponible.ok) return { ok: false, reason: disponible.reason }

  const res = await grantReward(
    {
      customerId,
      grantType: 'campaign_prize',
      source: 'invite',
      prizeTitle: c.reward_title,
      qrCampaignId: c.id,
      windowDays: c.window_days,
    },
    tenantId
  )

  if (!res.ok) {
    if (res.code !== 'duplicate_active') {
      console.error(`[QrCampaign] No se pudo otorgar el premio de "${slug}" a ${customerId}: ${res.error}`)
    }
    return { ok: false, reason: res.code }
  }
  return { ok: true, grantId: res.grant.id, rewardTitle: c.reward_title }
}
