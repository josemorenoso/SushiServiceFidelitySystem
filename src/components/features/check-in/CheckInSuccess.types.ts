export interface RoadmapItem {
  milestone: number
  title: string
  is_black?: boolean
}

export interface MysteryPrizeDisplay {
  title: string
  probability: number
  emoji: string
}

export interface TierUnlockedDisplay {
  id: string
  name: string
  safe_reward: string
  mystery_box_enabled: boolean
  mystery_prizes: MysteryPrizeDisplay[]
  is_black: boolean
}

export interface NextTierDisplay {
  name: string
  points_remaining: number
  threshold: number
}

export interface CheckInSuccessProps {
  type: 'welcome' | 'welcome_back' | 'duplicate' | 'points_earned' | 'tier_unlocked'
  customerName: string
  totalVisits: number
  totalPoints?: number
  pointsAwarded?: number
  reward?: {
    title: string
    message: string
    is_black?: boolean
  } | null
  nextRewardHint?: string | null
  roadmap?: RoadmapItem[]
  tierUnlocked?: TierUnlockedDisplay | null
  nextTier?: NextTierDisplay | null
  customerPhone?: string
  onReset: () => void
}
