export interface Customer {
  id: string
  phone: string
  name: string
  birthday: string | null
  city: string | null
  total_visits: number
  last_visit_at: string | null
  source_channels: 'qr' | 'delivery' | 'both'
  last_campaign_at: string | null
  accepts_marketing: boolean
  total_points: number
  current_tier: string | null
  mystery_box_low_streak: number
  last_points_awarded_at: string | null
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  customer_id: string
  source: 'qr' | 'delivery' | 'staff_scan'
  notes: string | null
  address: string | null
  payment_method: string | null
  amount: number | null
  raw_message: string | null
  table_number: number | null
  registered_by_staff_id: string | null
  created_at: string
}

export interface Reward {
  id: string
  visit_milestone: number | null
  title: string
  message_template: string
  is_active: boolean
  is_black: boolean
  created_at: string
}

export type CampaignSource = 'manual' | 'calendar' | 'reactivation' | 'birthday'

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
  source: CampaignSource
  media_url: string | null
  media_type: 'image' | 'video' | null
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

export interface StaffUser {
  id: string
  name: string
  phone: string
  pin: string | null
  role: 'waiter' | 'supervisor' | 'admin'
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface StaffDevice {
  id: string
  staff_user_id: string | null
  device_fingerprint: string
  device_name: string | null
  is_trusted: boolean
  trusted_at: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

export type EventType = 'promo' | 'festival' | 'activacion' | 'aniversario' | 'otro'
export type EventSendMode = 'auto' | 'remind'
export type EventStatus = 'planned' | 'scheduled' | 'sent' | 'cancelled' | 'failed'
export type EventMediaType = 'image' | 'video'

export interface RestaurantEvent {
  id: string
  title: string
  description: string | null
  event_date: string                   // YYYY-MM-DD
  event_time: string | null            // HH:MM:SS
  event_type: EventType
  send_mode: EventSendMode
  scheduled_send_at: string | null     // ISO timestamp
  filters: Record<string, unknown>
  media_url: string | null
  media_type: EventMediaType | null
  content_sid: string | null
  campaign_id: string | null
  status: EventStatus
  blackout_days: number
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════
// Points + Mystery Box System (v1.0.0)
// ═══════════════════════════════════════════════════════════════

export type PointTransactionSource =
  | 'visit_qr'
  | 'visit_delivery'
  | 'visit_staff'
  | 'event_bonus'
  | 'campaign_bonus'
  | 'welcome_bonus'
  | 'admin_adjustment'

export interface PointTransaction {
  id: string
  customer_id: string
  points: number
  source: PointTransactionSource
  reference_id: string | null
  balance_after: number
  created_at: string
}

export interface MysteryPrize {
  title: string
  probability: number
  emoji: string
}

export interface RewardTier {
  id: string
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled: boolean
  mystery_prizes: MysteryPrize[]
  is_black: boolean
  sort_order: number
  is_active: boolean
  created_at: string
}

export type MysteryBoxChoice = 'safe' | 'mystery'

export interface MysteryBoxResult {
  id: string
  customer_id: string
  tier_id: string
  choice: MysteryBoxChoice
  prize_title: string
  prize_tier_index: number
  was_golden: boolean
  created_at: string
}

// ═══════════════════════════════════════════════════════════════
// Message Logs (Auditoría 12-Julio — tracking de mensajes WhatsApp)
// ═══════════════════════════════════════════════════════════════

export type MessageLogStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'undelivered'

export type MessageLogType =
  | 'welcome'
  | 'checkin'
  | 'tier_unlocked'
  | 'points_earned_near'
  | 'points_earned_far'
  | 'safe_reward'
  | 'mystery_box'
  | 'golden_box'
  | 'birthday'
  | 'reactivation'
  | 'manual'
  | 'event'
  | 'delivery'

export interface MessageLog {
  id: string
  customer_id: string | null
  phone: string
  message_type: MessageLogType | string
  template_sid: string | null
  variables: Record<string, string> | null
  status: MessageLogStatus
  twilio_sid: string | null
  error_code: string | null
  error_message: string | null
  sent_at: string | null
  delivered_at: string | null
  created_at: string
}

export type GlobalCapPeriod = 'week' | 'month' | 'total'

export interface MysteryBoxGlobalCap {
  id: string
  tier_id: string
  prize_title: string
  max_per_period: number
  period: GlobalCapPeriod
  current_count: number
  period_start: string
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'total_visits' | 'last_visit_at' | 'source_channels' | 'last_campaign_at' | 'total_points' | 'current_tier' | 'mystery_box_low_streak' | 'last_points_awarded_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
          total_visits?: number
          last_visit_at?: string | null
          source_channels?: 'qr' | 'delivery' | 'both'
          last_campaign_at?: string | null
          accepts_marketing?: boolean
          total_points?: number
          current_tier?: string | null
          mystery_box_low_streak?: number
          last_points_awarded_at?: string | null
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
        Insert: Omit<Campaign, 'id' | 'created_at' | 'total_sent' | 'source' | 'media_url' | 'media_type'> & {
          id?: string
          created_at?: string
          total_sent?: number
          source?: CampaignSource
          media_url?: string | null
          media_type?: 'image' | 'video' | null
        }
        Update: Partial<Omit<Campaign, 'id' | 'created_at'>>
      }
      restaurant_events: {
        Row: RestaurantEvent
        Insert: Omit<RestaurantEvent, 'id' | 'created_at' | 'updated_at' | 'status' | 'send_mode' | 'blackout_days' | 'filters'> & {
          id?: string
          created_at?: string
          updated_at?: string
          status?: EventStatus
          send_mode?: EventSendMode
          blackout_days?: number
          filters?: Record<string, unknown>
        }
        Update: Partial<Omit<RestaurantEvent, 'id' | 'created_at'>>
      }
      campaign_messages: {
        Row: CampaignMessage
        Insert: Omit<CampaignMessage, 'id'> & {
          id?: string
        }
        Update: Partial<Omit<CampaignMessage, 'id'>>
      }
      message_logs: {
        Row: MessageLog
        Insert: Omit<MessageLog, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
          status?: MessageLogStatus
        }
        Update: Partial<Omit<MessageLog, 'id' | 'created_at'>>
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
