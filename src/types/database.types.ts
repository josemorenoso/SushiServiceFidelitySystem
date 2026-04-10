export interface Customer {
  id: string
  phone: string
  name: string
  birthday: string | null
  city: string | null
  total_visits: number
  last_visit_at: string | null
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  customer_id: string
  source: 'qr' | 'delivery'
  notes: string | null
  address: string | null
  payment_method: string | null
  amount: number | null
  raw_message: string | null
  created_at: string
}

export interface Reward {
  id: string
  visit_milestone: number
  title: string
  message_template: string
  is_active: boolean
  created_at: string
}

export interface Campaign {
  id: string
  name: string
  type: 'manual' | 'birthday' | 'reactivation'
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'failed'
  message_template: string
  filters: Record<string, unknown> | null
  total_sent: number
  scheduled_at: string | null
  executed_at: string | null
  created_at: string
}

export interface CampaignMessage {
  id: string
  campaign_id: string
  customer_id: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  twilio_sid: string | null
  sent_at: string | null
  error_message: string | null
}

export interface AuthorizedNumber {
  id: string
  phone: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'total_visits' | 'last_visit_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
          total_visits?: number
          last_visit_at?: string | null
        }
        Update: Partial<Omit<Customer, 'id' | 'created_at'>>
      }
      visits: {
        Row: Visit
        Insert: Omit<Visit, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Visit, 'id' | 'created_at'>>
      }
      rewards: {
        Row: Reward
        Insert: Omit<Reward, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
          is_active?: boolean
        }
        Update: Partial<Omit<Reward, 'id' | 'created_at'>>
      }
      campaigns: {
        Row: Campaign
        Insert: Omit<Campaign, 'id' | 'created_at' | 'total_sent'> & {
          id?: string
          created_at?: string
          total_sent?: number
        }
        Update: Partial<Omit<Campaign, 'id' | 'created_at'>>
      }
      campaign_messages: {
        Row: CampaignMessage
        Insert: Omit<CampaignMessage, 'id'> & {
          id?: string
        }
        Update: Partial<Omit<CampaignMessage, 'id'>>
      }
      authorized_numbers: {
        Row: AuthorizedNumber
        Insert: Omit<AuthorizedNumber, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
          is_active?: boolean
        }
        Update: Partial<Omit<AuthorizedNumber, 'id' | 'created_at'>>
      }
    }
  }
}
