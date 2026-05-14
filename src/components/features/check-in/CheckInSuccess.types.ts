export interface RoadmapItem {
  milestone: number
  title: string
  is_black?: boolean
}

export interface CheckInSuccessProps {
  type: 'welcome' | 'welcome_back' | 'duplicate'
  customerName: string
  totalVisits: number
  reward?: {
    title: string
    message: string
    is_black?: boolean
  } | null
  nextRewardHint?: string | null
  roadmap?: RoadmapItem[]
  onReset: () => void
}
