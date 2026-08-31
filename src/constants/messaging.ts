/**
 * Clases y prioridades de mensaje — espejo en TypeScript de la tabla
 * `message_class_map` (migración 00037).
 *
 * Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.3
 *
 * POR QUÉ EXISTE EN DOS LADOS: SQL lo necesita para calcular el p95 de consumo
 * transaccional dentro de `line_budget()`; TypeScript lo necesita para decidir
 * la clase ANTES de llamar a `reserve_send_slot()`, sin pagar un viaje extra a
 * la base en cada envío. El test `message-class-map.test.ts` verifica que las
 * dos copias no diverjan — si agregas un tipo aquí, agrégalo también en la
 * migración.
 */

export type MessageClass = 'transactional' | 'campaign'

/** 0 = transaccional · 1 = sensible al tiempo · 2-3 = postponible · 4 = Golden Bullet */
export type MessagePriority = 0 | 1 | 2 | 3 | 4

export interface MessageClassEntry {
  messageClass: MessageClass
  priority: MessagePriority
}

export const MESSAGE_CLASS_MAP: Readonly<Record<string, MessageClassEntry>> = {
  // P0 · transaccional: consume la reserva, nunca se encola
  welcome: { messageClass: 'transactional', priority: 0 },
  checkin: { messageClass: 'transactional', priority: 0 },
  tier_unlocked: { messageClass: 'transactional', priority: 0 },
  points_earned_near: { messageClass: 'transactional', priority: 0 },
  points_earned_far: { messageClass: 'transactional', priority: 0 },
  safe_reward: { messageClass: 'transactional', priority: 0 },
  mystery_box: { messageClass: 'transactional', priority: 0 },
  golden_box: { messageClass: 'transactional', priority: 0 },
  delivery: { messageClass: 'transactional', priority: 0 },
  low_balance: { messageClass: 'transactional', priority: 0 },

  // P1 · campaña sensible al tiempo: entregarla tarde no sirve de nada
  birthday: { messageClass: 'campaign', priority: 1 },
  reward_reminder: { messageClass: 'campaign', priority: 1 },
  calendar_event: { messageClass: 'campaign', priority: 1 },
  event: { messageClass: 'campaign', priority: 1 },

  // P2/P3 · campaña postponible
  reactivation: { messageClass: 'campaign', priority: 2 },
  manual: { messageClass: 'campaign', priority: 3 },

  // P4 · Golden Bullet: contactos SIN consentimiento, régimen especial (spec §3.4.1)
  import: { messageClass: 'campaign', priority: 4 },
} as const

/**
 * Un `message_type` desconocido se trata como campaña de prioridad 3 — la
 * opción CONSERVADORA: queda sujeto al presupuesto de campaña (más estrecho)
 * en vez de poder consumir la reserva transaccional.
 */
export const DEFAULT_MESSAGE_CLASS: MessageClassEntry = {
  messageClass: 'campaign',
  priority: 3,
}

export function classifyMessageType(messageType: string): MessageClassEntry {
  return MESSAGE_CLASS_MAP[messageType] ?? DEFAULT_MESSAGE_CLASS
}
