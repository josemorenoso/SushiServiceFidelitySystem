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

export interface RegisterResult {
  message: 'welcome'
  customer: {
    name: string
    total_visits: number
  }
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
  } | null
}

export type CheckInStep = 'phone' | 'register' | 'loading'
