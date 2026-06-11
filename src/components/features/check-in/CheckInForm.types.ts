export interface CheckInFormProps {
  onLookupResult: (result: LookupResult, phone: string) => void
  onRegisterSuccess: (result: RegisterResult, phone: string) => void
  onCheckInSuccess: (result: CheckInResult, phone: string) => void
  onError: (message: string) => void
}

export interface LookupResult {
  found: boolean
  checkin_mode?: 'auto' | 'staff_verified'
  checkin_first_visit_free?: boolean
  qr_token?: string | null
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
  qr_token?: string | null
  customer: {
    id?: string
    name: string
    total_visits: number
    total_points?: number
  }
  points_awarded?: number
  tiers?: unknown[]
}

export interface CheckInResult {
  message: 'welcome_back' | 'tier_unlocked' | 'points_earned' | 'duplicate'
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
