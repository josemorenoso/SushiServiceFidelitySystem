export interface CheckInFormProps {
  onLookupResult: (result: LookupResult, phone: string) => void
  onRegisterSuccess: (result: RegisterResult, phone: string) => void
  onCheckInSuccess: (result: CheckInResult, phone: string) => void
  onError: (message: string) => void
  /**
   * Invitación con premio por la que llegó la persona (`/c/{slug}`, 00063). Viaja
   * en el `register` y hace dos cosas del lado del servidor: la visita #1 queda
   * pendiente del mesero y se le otorga el premio de la invitación.
   */
  campaignSlug?: string | null
  /**
   * Código de referido por el que llegó (`/r/{código}`, 00075). Viaja en `lookup` y `register`.
   * Si el referido cuenta, la visita #1 queda pendiente del mesero y el regalo del amigo queda en
   * su tarjeta; si no cuenta (programa apagado, código de otra marca…), el registro es el de siempre.
   */
  referralCode?: string | null
}

export interface LookupResult {
  found: boolean
  checkin_mode?: 'auto' | 'staff_verified'
  checkin_first_visit_free?: boolean
  qr_token?: string | null
  /** Premio de la invitación otorgado en este lookup a un cliente que ya existía. */
  invite_grant?: { reward_title: string } | null
  /** Llegó por el enlace de un amigo pero ya es cliente de la marca: no cuenta como referido. */
  referral_status?: 'ya_cliente'
  customer?: {
    id: string
    name: string
    total_visits: number
    current_tier?: string | null
    total_points?: number
  }
}

export interface RoadmapItem {
  milestone: number
  title: string
  is_black?: boolean
}

export interface MysteryPrizeInfo {
  title: string
  probability: number
  emoji: string
}

export interface TierUnlockedInfo {
  id: string
  name: string
  safe_reward: string
  mystery_box_enabled: boolean
  mystery_prizes: MysteryPrizeInfo[]
  is_black: boolean
}

export interface NextTierInfo {
  name: string
  points_remaining: number
  threshold: number
}

export interface RegisterResult {
  message: 'welcome' | 'registered_pending_scan'
  /** Id del evento que el servidor mandó a Meta; el píxel dispara con el mismo (dedup). */
  meta_event_id?: string | null
  qr_token?: string | null
  customer: {
    id?: string
    name: string
    total_visits: number
    total_points?: number
  }
  points_awarded?: number
  tiers?: unknown[]
  /** Premio de la invitación por la que se registró, si hubo. */
  invite_grant?: { reward_title: string; expires_at: string | null } | null
  /** El regalo del amigo que llegó por un referido que contó («Postre», «50 puntos»), o null. */
  referral_gift?: { tipo: 'reward' | 'points'; texto: string } | null
}

export interface CheckInResult {
  message: 'welcome_back' | 'tier_unlocked' | 'points_earned' | 'duplicate'
  /** Id del evento que el servidor mandó a Meta; el píxel dispara con el mismo (dedup). */
  meta_event_id?: string | null
  customer: {
    name: string
    total_visits: number
    total_points?: number
  }
  points_awarded?: number
  tier_unlocked?: TierUnlockedInfo | null
  next_tier?: NextTierInfo | null
  reward?: {
    title: string
    message: string
    is_black?: boolean
  } | null
  tiers_roadmap?: string
  tiers?: TierItem[]
}

export interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled: boolean
  is_black: boolean
}

export type CheckInStep = 'phone' | 'register' | 'customer_qr' | 'loading'
