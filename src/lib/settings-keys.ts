/**
 * Qué claves de `admin_settings` se pueden escribir por `PUT /api/dashboard/settings`.
 *
 * POR QUÉ EXISTE (OPER-4, 2026-10-11)
 * ───────────────────────────────────
 * El PUT aceptaba CUALQUIER clave: con una sesión de la marca se podía escribir
 * `foo=bar`, o pisar un puntero de plantilla (`*_template_sid`) de una marca Zernio
 * sin pasar por `promoteVersion()`, que es su único escritor (`CLAUDE.md`). La ola 0
 * cerró QUIÉN escribe (alcance de marca); esto cierra QUÉ se escribe.
 *
 * DE DÓNDE SALE LA LISTA
 * ──────────────────────
 * De leer TODAS las escrituras que hacen las pantallas (`saveSetting(...)` de Ajustes y
 * los `PUT` del Golden Bullet), cruzadas con lo que el código lee de `admin_settings`.
 * Una clave que ninguna pantalla escribe no entra: si mañana una pantalla nueva necesita
 * otra, se agrega acá en el mismo commit — el test `p1a-settings-claves.test.ts` falla
 * si una pantalla manda una clave que esta lista no conoce.
 *
 * LOS PUNTEROS DE PLANTILLA
 * ─────────────────────────
 *   · Marca **Twilio**: el dueño elige la plantilla en Ajustes › Plantillas WhatsApp por
 *     esta misma ruta. Se aceptan.
 *   · Marca **Zernio**: el puntero lo escribe solo `promoteVersion()` (al aprobarse una
 *     versión). Un cambio por acá se rechaza con un 400 que dice por qué. Reescribir el
 *     MISMO valor que ya tiene no es un cambio: Ajustes guarda las 15 de una vez cada vez
 *     que alguien aprieta «Guardar», y rechazar eso dejaría la sección sin guardar nunca
 *     aunque nadie haya tocado un puntero. La ruta lo contesta 200 sin escribir nada.
 */

import { TEMPLATE_CATALOG } from '@/constants/template-catalog'

/** Ajustes que NO son punteros de plantilla. Agrupados por la pantalla que los escribe. */
const AJUSTES = [
  // Ajustes › Ticket promedio y beneficios Black
  'avg_ticket',
  'black_benefits',
  // Ajustes › Sistema de puntos
  'points_system_enabled',
  'points_per_visit_min',
  'points_per_visit_max',
  'welcome_bonus_points_min',
  'welcome_bonus_points_max',
  'shortfall_min',
  'shortfall_max',
  'pity_timer_threshold',
  // Ajustes › Verificación del check-in y ubicación
  'checkin_mode',
  'checkin_first_visit_free',
  'geo_strict_mode',
  // Ajustes › Reactivación (días, premio de la plantilla con premio)
  'reactivation_soft_days',
  'reactivation_aggressive_days',
  'reactivation_reward_id',
  // Ajustes › Premio de la reactivación insistente y recordatorio de vencimiento
  'aggressive_reward_id',
  'aggressive_reward_window_days',
  'reward_reminder_enabled',
  'reward_reminder_days_before',
  // Ajustes › Reseñas de Google
  'review_reward_id',
  'review_reward_window_days',
  // Golden Bullet (`imported-contacts`, `ImportedContactsTemplate`, `InviteCampaignsPanel`)
  'golden_bullet_enabled',
  'golden_bullet_provider',
  'golden_bullet_template_image_url',
  'golden_bullet_fallback_name',
  'golden_bullet_reply_si_text',
  'golden_bullet_reply_no_text',
  'golden_bullet_reply_si_image_url',
  'golden_bullet_invite_slug',
] as const

/**
 * Punteros que el código consume y que el catálogo NO cubre. Ajustes › Plantillas los
 * escribe en las marcas Twilio. Son las excepciones de `p1a-plantillas-paridad.test.ts`
 * (salvo la legacy `reactivation_template_sid`, que se lee pero ya no se escribe), y
 * dejan de serlo cuando entren al catálogo (`docs/PENDIENTES.md` §3.1 paso 2, decisión B3).
 */
const PUNTEROS_FUERA_DEL_CATALOGO = [
  'tier_unlocked_template_sid',
  'reward_reminder_template_sid',
  'reactivation_with_reward_template_sid',
] as const

/** Todo puntero de plantilla que esta ruta acepta (en Twilio). */
export const PUNTEROS_DE_PLANTILLA: ReadonlySet<string> = new Set<string>([
  ...TEMPLATE_CATALOG.map((t) => t.settingsKey),
  ...PUNTEROS_FUERA_DEL_CATALOGO,
])

/** La lista cerrada completa: ajustes + punteros. */
export const CLAVES_ESCRIBIBLES: ReadonlySet<string> = new Set<string>([...AJUSTES, ...PUNTEROS_DE_PLANTILLA])

/** ¿Es un puntero de plantilla? Además de la lista, cualquier `*_template_sid` cuenta. */
export function esPunteroDePlantilla(key: string): boolean {
  return PUNTEROS_DE_PLANTILLA.has(key) || key.endsWith('_template_sid')
}

export type DecisionDeAjuste =
  | { ok: true; escribir: boolean }
  | { ok: false; status: 400; error: string }

/**
 * La regla entera, PURA. `valorActual` es lo que hoy guarda `admin_settings` para esa
 * clave (`null` si no hay fila); solo importa para un puntero de una marca Zernio.
 */
export function decidirEscrituraDeAjuste(input: {
  key: string
  valor: string
  proveedor: string | null | undefined
  valorActual: string | null
}): DecisionDeAjuste {
  const { key, valor, proveedor, valorActual } = input

  if (!CLAVES_ESCRIBIBLES.has(key)) {
    return {
      ok: false,
      status: 400,
      error: `«${key}» no es un ajuste que se pueda cambiar desde el panel.`,
    }
  }

  if (esPunteroDePlantilla(key) && proveedor === 'zernio') {
    // Mismo valor = nada que cambiar (vacío y «sin fila» cuentan igual).
    if ((valorActual ?? '').trim() === valor.trim()) return { ok: true, escribir: false }
    return {
      ok: false,
      status: 400,
      error:
        'En esta marca las plantillas de WhatsApp se cambian desde Plantillas: allí se crean, ' +
        'se mandan a Meta y se activan solas cuando Meta las aprueba. Desde Ajustes no se pueden elegir.',
    }
  }

  return { ok: true, escribir: true }
}
