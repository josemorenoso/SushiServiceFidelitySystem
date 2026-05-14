export interface CheckInFormProps {
  onLookupResult: (result: LookupResult) => void
  onRegisterSuccess: (result: RegisterResult) => void
  onCheckInSuccess: (result: CheckInResult) => void
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

export interface RegisterResult {
  message: 'welcome'
  customer: {
    name: string
    total_visits: number
  }
  roadmap?: RoadmapItem[]
}

export interface CheckInResult {
  message: 'welcome_back'
  customer: {
    name: string
    total_visits: number
  }
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
}

export type CheckInStep = 'phone' | 'register' | 'loading'
