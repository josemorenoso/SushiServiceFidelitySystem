export interface CheckInFormProps {
  onLookupResult: (result: LookupResult, phone: string) => void
  onRegisterSuccess: (result: RegisterResult, phone: string) => void
  onCheckInSuccess: (result: CheckInResult, phone: string) => void
  onError: (message: string) => void
}

export interface LookupResult {
  found: boolean
  customer?: {
    name: string
    total_visits: number
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
  message: 'welcome'
  customer: {
    name: string
    total_visits: number
    total_points?: number
  }
  points_awarded?: number
  roadmap?: RoadmapItem[]
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
  reward: {
    title: string
    message: string
    is_black?: boolean
  } | null
  nextReward?: {
    milestone: number
    title: string
    hint: string
  } | null
  roadmap?: RoadmapItem[]
  tiers_roadmap?: string
}

export type CheckInStep = 'phone' | 'register' | 'loading'
