/**
 * El motor de piezas: cada comunicación del sistema es una PIEZA registrada con sus reglas.
 * Puro, sin I/O.
 *
 * POR QUÉ EXISTE (spec del ciclo §14.3, decisión A1 del dueño, 2026-10-11)
 * ─────────────────────────────────────────────────────────────────────
 * Las reglas de cada comunicación (si cansa al cliente, si cuenta para el tope de 3 al mes,
 * si está exenta de los 7 días, si pausa el toque del ciclo) hoy viven copiadas en
 * constantes sueltas: `MONTHLY_CAP_SOURCES` (`constants/rewards.ts`), los exentos del
 * drenador (`EXENTOS_DEL_CAP` en `api/cron/queue-drain/route.ts`), el mapa de clases
 * (`constants/messaging.ts` ↔ `message_class_map`) y la lista del trigger de fatiga
 * (`cycle_on_campaign_message_sent()`, 00070). El dueño pidió que «las bases queden fuertes
 * para que soporten adiciones»: cumpleaños del restaurante, eventos del momento, rifas,
 * activaciones. Con el registro, agregar una comunicación es declarar una pieza y escribir
 * su audiencia, no rediseñar el motor ni los topes.
 *
 * EN LA FASE 1A NO REEMPLAZA NADA. Se armó leyendo esas constantes y
 * `tests/unit/communications-registry.test.ts` exige que diga lo MISMO que ellas y que la
 * base: si mañana alguien cambia una regla en un solo lado, el test se pone rojo. Los
 * emisores nuevos (el cron del ciclo, fase 1B) leen de acá en vez de copiar reglas.
 *
 * ── CÓMO SE AGREGA UNA PIEZA: «cumpleaños del restaurante» (`brand_anniversary`) ──────
 *
 * El dueño decidió que es una pieza TIPO EVENTO (A9): sale por el mismo camino que una
 * invitación del calendario, así que hereda sus reglas sin tocar nada más:
 *
 *   {
 *     key: 'brand_anniversary',
 *     messageType: 'calendar_event',   // ya está en message_class_map (P1, campaña)
 *     campaignSource: 'calendar',      // ya está en el CHECK de campaigns.source
 *     countsForFatigue: true,          // es marketing: suma para las 6 sin volver
 *     countsForMonthlyCap: true,       // 'calendar' ya está en MONTHLY_CAP_SOURCES
 *     exemptFromFrequencyCap: true,    // como todo evento (el drenador ya lo exime)
 *     channels: ['whatsapp'],
 *     pausesCycleTouch: true,          // su blackout pospone el toque del ciclo
 *   },
 *
 * Lo que SÍ escribe quien la construya: la AUDIENCIA (a quién: p. ej. los clientes con 2+
 * visitas en el último año), la FECHA (cuándo: el aniversario guardado en la marca) y qué
 * plantilla usa (la de evento que ya existe, o una nueva en el catálogo). Lo que NO toca:
 * ni una migración, ni `MONTHLY_CAP_SOURCES`, ni el trigger de fatiga, ni
 * `message_class_map`, ni el drenador. El test de paridad pasa solo, porque la pieza dice lo
 * mismo que la base para su `messageType` y su `campaignSource`.
 *
 * Una pieza con reglas DISTINTAS a las de una existente (p. ej. una rifa que no cansa)
 * necesitaría un `campaignSource` propio: eso sí es migración (CHECK de `campaigns.source`
 * y, si cansa, la lista del trigger) y el test dice exactamente qué falta.
 */

import { FREQUENCY_CAP_DAYS, MONTHLY_MARKETING_CAP } from '@/constants/rewards'

/** Espejo del CHECK `campaigns_source_check` (00031): de dónde sale una campaña. */
export const CAMPAIGN_SOURCES = ['manual', 'calendar', 'reactivation', 'birthday', 'reward_reminder'] as const
export type CampaignSource = (typeof CAMPAIGN_SOURCES)[number]

/** Por dónde puede salir una pieza (decisión 21). Hoy solo WhatsApp. */
export type Channel = 'whatsapp'

export interface CommunicationPiece {
  /** El tipo de comunicación. */
  key: string
  /** Cómo se clasifica el envío: clave de `MESSAGE_CLASS_MAP` / `message_class_map`. */
  messageType: string
  /** Cómo se graba la campaña: `campaigns.source`. Es lo que leen el tope mensual y la fatiga. */
  campaignSource: CampaignSource
  /** ¿Suma para las 6 sin volver? (decisión 2). */
  countsForFatigue: boolean
  /** ¿Cuenta para el tope de 3 al mes? */
  countsForMonthlyCap: boolean
  /** ¿Puede salir aunque el cliente haya recibido otra campaña en los últimos 7 días? */
  exemptFromFrequencyCap: boolean
  channels: readonly Channel[]
  /** ¿Su blackout pospone el toque del ciclo de su audiencia? (spec §3.3 regla 5). */
  pausesCycleTouch: boolean
}

/** Las reglas de cadencia que valen para todas las piezas (leídas de `constants/rewards.ts`). */
export const CADENCE_RULES = {
  frequencyCapDays: FREQUENCY_CAP_DAYS,
  monthlyCap: MONTHLY_MARKETING_CAP,
} as const

/** Las comunicaciones que existen hoy. */
export const COMMUNICATION_PIECES: readonly CommunicationPiece[] = [
  {
    // El toque del ciclo (hoy: el suave y el insistente del cron de reactivación).
    key: 'cycle_touch',
    messageType: 'reactivation',
    campaignSource: 'reactivation',
    countsForFatigue: true,
    countsForMonthlyCap: true,
    exemptFromFrequencyCap: false,
    channels: ['whatsapp'],
    pausesCycleTouch: false,
  },
  {
    // Fuera de todo tope: es relación, no marketing (dedup anual aparte).
    key: 'birthday',
    messageType: 'birthday',
    campaignSource: 'birthday',
    countsForFatigue: false,
    countsForMonthlyCap: false,
    exemptFromFrequencyCap: true,
    channels: ['whatsapp'],
    pausesCycleTouch: false,
  },
  {
    // «Tu premio vence»: habla de algo que ya es suyo. Cuenta en el mensual, exento de los
    // 7 días (D5 de reward-grants.md) y no cansa. Su campaña es `type = 'reactivation'`:
    // por eso todo se filtra por `source`, nunca por `type`.
    key: 'reward_reminder',
    messageType: 'reward_reminder',
    campaignSource: 'reward_reminder',
    countsForFatigue: false,
    countsForMonthlyCap: true,
    exemptFromFrequencyCap: true,
    channels: ['whatsapp'],
    pausesCycleTouch: false,
  },
  {
    // La invitación del calendario: el evento manda sobre el toque.
    key: 'calendar_event',
    messageType: 'calendar_event',
    campaignSource: 'calendar',
    countsForFatigue: true,
    countsForMonthlyCap: true,
    exemptFromFrequencyCap: true,
    channels: ['whatsapp'],
    pausesCycleTouch: true,
  },
  {
    key: 'manual',
    messageType: 'manual',
    campaignSource: 'manual',
    countsForFatigue: true,
    countsForMonthlyCap: true,
    exemptFromFrequencyCap: false,
    channels: ['whatsapp'],
    pausesCycleTouch: false,
  },
  {
    // Golden Bullet graba sus campañas con `source = 'manual'` (el CHECK no tiene
    // 'imported'), así que a un cliente que ya existe le cuenta como una manual.
    key: 'golden_bullet',
    messageType: 'import',
    campaignSource: 'manual',
    countsForFatigue: true,
    countsForMonthlyCap: true,
    exemptFromFrequencyCap: false,
    channels: ['whatsapp'],
    pausesCycleTouch: false,
  },
]

export function getPiece(key: string): CommunicationPiece | undefined {
  return COMMUNICATION_PIECES.find((p) => p.key === key)
}

/** Los `campaigns.source` que cansan: lo que filtra el trigger de fatiga de la 00070. */
export function fatigueSources(): CampaignSource[] {
  return [...new Set(COMMUNICATION_PIECES.filter((p) => p.countsForFatigue).map((p) => p.campaignSource))]
}
