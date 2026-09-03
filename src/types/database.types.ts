import type { LocationSource } from '@/lib/location-resolver'

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
  whatsapp_opt_out_at: string | null
  total_points: number
  current_tier: string | null
  mystery_box_low_streak: number
  last_points_awarded_at: string | null
  /** Si el cliente vino de un contacto importado (Golden Bullet, migración 00023) */
  imported_contact_id: string | null
  /** Fue al link de reseñas de Google → nunca más se le muestra el pop-up (migración 00032). */
  google_review_clicked_at: string | null
  /** Tocó "La próxima lo hago" → sí se le vuelve a mostrar (migración 00032). */
  google_review_postponed_at: string | null
  /**
   * Sede donde se REGISTRÓ el cliente (D2, migración 00043). NULL = sede desconocida.
   * No parte al cliente: `customers_phone_tenant_key (phone, tenant_id)` NO se toca, y por
   * eso los puntos siguen unificados entre sedes sin escribir una línea de código.
   */
  origin_location_id: string | null
  /** Caché de la sede de su última visita ("sede de casa", 00043). NULL = desconocida. */
  last_visit_location_id: string | null
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
  /** Sede donde ocurrió la visita (00043). NULL = SEDE DESCONOCIDA, y se MUESTRA. */
  location_id: string | null
  /** De dónde salió `location_id`. Va junto con él (CHECK `visits_location_pareja_check`). */
  location_source: LocationSource | null
  /** TRI-ESTADO: null = no se evaluó · false = el QR coincidía · true = el QR decía otra sede. */
  location_conflict: boolean | null
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
  tenant_id: string
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
  /** true cuando el premio ya fue entregado físicamente en el local (migración 00022) */
  redeemed: boolean
  redeemed_at: string | null
  created_at: string
}

// ═══════════════════════════════════════════════════════════════
// Reward Redemptions — tracking de entrega física (v2.0.0, migración 00022)
// ═══════════════════════════════════════════════════════════════

export type RedemptionSource = 'mystery_box' | 'safe_choice' | 'staff_override' | 'campaign_reward'

export interface RewardRedemption {
  id: string
  customer_id: string
  mystery_box_result_id: string | null
  /** Nullable desde la migración 00031: un premio de campaña no tiene tier. */
  tier_id: string | null
  prize_title: string
  source: RedemptionSource
  redeemed_at: string
  redeemed_by_staff_id: string | null
  table_number: number | null
  notes: string | null
  pos_reference: string | null
  /** El premio otorgado que esta entrega cierra (migración 00031). */
  grant_id: string | null
  created_at: string
}

// ═══════════════════════════════════════════════════════════════
// Reward Grants — el premio otorgado (v2.3.0, migración 00031)
//
// La pieza que va entre "ganar" y "entregar": un premio que le PERTENECE a un
// cliente y está pendiente de reclamar.
//   Ref: docs/features/reward-grants.md
// ═══════════════════════════════════════════════════════════════

export type GrantType = 'tier_prize' | 'campaign_prize'

/** De dónde salió el premio. `manual` queda reservado para referidos y promos. */
export type GrantSource = 'mystery_box' | 'safe_choice' | 'reactivation' | 'review' | 'manual'

export type GrantStatus = 'active' | 'redeemed' | 'expired'

export interface RewardGrant {
  id: string
  tenant_id: string
  customer_id: string
  grant_type: GrantType
  source: GrantSource
  /** Snapshot: renombrar el premio del catálogo no cambia lo ya otorgado. */
  prize_title: string
  tier_id: string | null
  mystery_box_result_id: string | null
  campaign_reward_id: string | null
  campaign_id: string | null
  status: GrantStatus
  /** NULL = no vence. Los premios de tier no vencen; los de campaña sí. */
  expires_at: string | null
  reminder_sent_at: string | null
  granted_at: string
  redeemed_at: string | null
  created_at: string
}

/** Catálogo editable de premios de campaña (Dashboard > Premios de campaña). */
export interface CampaignReward {
  id: string
  tenant_id: string
  title: string
  description: string | null
  is_active: boolean
  created_at: string
}

// ═══════════════════════════════════════════════════════════════
// Reseñas de Google — memoria y funnel (v2.5.0, migración 00032)
//   Ref: docs/features/review-flow.md
// ═══════════════════════════════════════════════════════════════

export type ReviewAction = 'shown' | 'clicked' | 'postponed'

export interface ReviewEvent {
  id: string
  tenant_id: string
  customer_id: string
  action: ReviewAction
  /** Solo en 'clicked': el premio que se otorgó por la reseña. */
  grant_id: string | null
  created_at: string
}

/** Lo que el modal necesita saber al montarse. Lo decide el SERVIDOR, nunca el cliente. */
export interface ReviewPromptState {
  show: boolean
  /** null = no hay recompensa configurada → el modal pide la reseña sin prometer nada. */
  reward_title: string | null
  /** Vacío = no hay link → el modal no se muestra (no hay a dónde mandar al cliente). */
  google_url: string
}

/** El embudo: se mostró N veces → X fueron a Google → Y reclamaron el premio. */
export interface ReviewFunnel {
  shown: number
  clicked: number
  postponed: number
  /** Premios de reseña efectivamente entregados por un mesero. */
  redeemed: number
  /** clicked / shown, en porcentaje. Mide el GANCHO (¿convence el premio?). */
  click_rate: number
  /** redeemed / clicked, en porcentaje. Mide la OPERACIÓN (¿el mesero cierra el ciclo?). */
  redemption_rate: number
}

// ═══════════════════════════════════════════════════════════════
// Imported Contacts — Golden Bullet (v2.0.0, migración 00023)
// ═══════════════════════════════════════════════════════════════

export type ImportedContactStatus =
  | 'pending'
  | 'valid'
  | 'invalid'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'converted'
  | 'blocked'

export interface ImportedContact {
  id: string
  phone: string
  name: string | null
  email: string | null
  source_file: string
  source_batch: string
  status: ImportedContactStatus
  validation_error: string | null
  message_sent_at: string | null
  twilio_sid: string | null
  converted_to_customer_id: string | null
  campaign_id: string | null
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
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'total_visits' | 'last_visit_at' | 'source_channels' | 'last_campaign_at' | 'total_points' | 'current_tier' | 'mystery_box_low_streak' | 'last_points_awarded_at' | 'whatsapp_opt_out_at' | 'imported_contact_id' | 'google_review_clicked_at' | 'google_review_postponed_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
          total_visits?: number
          last_visit_at?: string | null
          source_channels?: 'qr' | 'delivery' | 'both'
          last_campaign_at?: string | null
          accepts_marketing?: boolean
          whatsapp_opt_out_at?: string | null
          total_points?: number
          current_tier?: string | null
          mystery_box_low_streak?: number
          last_points_awarded_at?: string | null
          imported_contact_id?: string | null
          google_review_clicked_at?: string | null
          google_review_postponed_at?: string | null
        }
        Update: Partial<Omit<Customer, 'id' | 'created_at'>>
      }
      review_events: {
        Row: ReviewEvent
        Insert: Omit<ReviewEvent, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
          grant_id?: string | null
        }
        Update: Partial<Omit<ReviewEvent, 'id' | 'created_at'>>
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
      reward_redemptions: {
        Row: RewardRedemption
        Insert: Omit<RewardRedemption, 'id' | 'created_at' | 'redeemed_at' | 'source'> & {
          id?: string
          created_at?: string
          redeemed_at?: string
          source?: RedemptionSource
        }
        Update: Partial<Omit<RewardRedemption, 'id' | 'created_at'>>
      }
      imported_contacts: {
        Row: ImportedContact
        Insert: Omit<ImportedContact, 'id' | 'created_at' | 'status'> & {
          id?: string
          created_at?: string
          status?: ImportedContactStatus
        }
        Update: Partial<Omit<ImportedContact, 'id' | 'created_at'>>
      }
    }
  }
}
