export interface CheckInSuccessProps {
  type: 'welcome' | 'welcome_back' | 'duplicate'
  customerName: string
  totalVisits: number
  reward?: {
    title: string
    message: string
  } | null
  onReset: () => void
}
