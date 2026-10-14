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
 * De leer TODAS las escrituras que hacen las pantallas (`saveSetting(...)` de Ajustes y de
 * Plantillas, y los `PUT` del Golden Bullet), cruzadas con lo que el código lee de `admin_settings`.
 * Una clave que ninguna pantalla escribe no entra, con UNA excepción: las del ciclo de
 * recuperación (fase 1A, 2026-10-11), que entraron antes que su pantalla (fase 2) porque
 * el spec las fija ya. Si mañana una pantalla nueva necesita otra, se agrega acá en el
 * mismo commit — el test `p1a-settings-claves.test.ts` falla si una pantalla manda una
 * clave que esta lista no conoce.
 *
 * LOS PUNTEROS DE PLANTILLA
 * ─────────────────────────
 *   · Marca **Twilio**: el dueño elige la plantilla en Plantillas («Elegir otra», en la fila
 *     de cada mensaje; hasta el 2026-10-11 era Ajustes › Plantillas WhatsApp) por esta
 *     misma ruta. Se aceptan.
 *   · Marca **Zernio**: el puntero lo escribe solo `promoteVersion()` (al aprobarse una
 *     versión). Un cambio por acá se rechaza con un 400 que dice por qué. Reescribir el
 *     MISMO valor que ya tiene no es un cambio y la ruta lo contesta 200 sin escribir nada:
 *     nació porque Ajustes guardaba las 15 de una vez en cada «Guardar» (esa sección ya no
 *     existe, 2026-10-11) y se queda porque no cuesta nada.
 */

import { TEMPLATE_CATALOG } from '@/constants/template-catalog'
import { HOY_NO_CLAVES } from '@/lib/cycle-touch'
import { REFERRAL_SETTING_KEYS } from '@/lib/referidos'

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
  // Recompensas › Premios para regalar › Regalo fuerte (la reactivación insistente) y el
  // recordatorio de vencimiento (S-1, 2026-10-13: antes era un bloque de Ajustes)
  'aggressive_reward_id',
  'aggressive_reward_window_days',
  'reward_reminder_enabled',
  'reward_reminder_days_before',
  // Recompensas › Premios para regalar › Premio por reseña (S-1; antes en Ajustes › Reseñas de
  // Google, donde sigue el link de reseñas)
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
  // Ciclo de recuperación (fase 1A, 2026-10-11). Ninguna pantalla las escribe todavía: la
  // de la fase 2 lo hará por esta ruta. Defaults y saneamiento en `normalizeCycleSettings()`
  // (`src/lib/cycle-engine.ts`, `CYCLE_SETTING_KEYS`: un test exige que las dos listas
  // coincidan). `cycle_enabled` nace apagado en todas las marcas, y SOLO lo escribe el
  // operador de Cada1 (`CLAVES_DEL_OPERADOR`, decisión H7).
  'cycle_enabled',
  'cycle_rhythm',
  'cycle_small_reward_ids',
  'cycle_strong_reward_id',
  'cycle_fatigue_touches',
  'cycle_heartbeat_enabled',
  'cycle_strong_cooldown_days',
  'cycle_send_slot',
  'cycle_holdout_pct',
] as const

/**
 * Claves de `admin_settings` que escribe SOLO el sistema: viven en la misma tabla, pero el
 * `PUT` no las acepta (no están en `CLAVES_ESCRIBIBLES`).
 *
 *   · `cycle_enabled_at` (fase 1B del ciclo, 2026-10-13): cuándo vio el cron la marca
 *     encendida por primera vez. La anota el cron de reactivación y la borra al ver la marca
 *     apagada. Es la regla (1) del encendido —un toque solo sale si su día es igual o
 *     posterior a esta fecha—, así que escribirla a mano con una fecha vieja haría salir de
 *     golpe todos los toques atrasados: la ráfaga que la regla existe para evitar.
 *   · `cycle_hoy_no_*` (fase 2 del ciclo, 2026-10-14, `HOY_NO_CLAVES`): el «Hoy no» de una
 *     tarjeta automática de «Para hoy» (decisión A6). La escribe `POST
 *     /api/dashboard/cycle/hoy-no` con el día de la próxima corrida y la lee el cron.
 */
export const CLAVES_DEL_SISTEMA: ReadonlySet<string> = new Set<string>([
  'cycle_enabled_at',
  ...Object.values(HOY_NO_CLAVES),
])

/**
 * Las claves del programa de referidos (2026-10-15, `src/lib/referidos.ts`). Son de la lista
 * cerrada, pero NO las escribe esta ruta: las escribe `PUT /api/dashboard/referrals`, que valida
 * el conjunto entero (encender exige un premio para quien invita) y que cada premio elegido sea
 * del catálogo activo de ESTA marca. Por la ruta genérica un premio de otra marca entraría sin
 * que nadie lo mire, así que acá se rechazan con 400 y el lugar correcto.
 */
export const CLAVES_DE_REFERIDOS: ReadonlySet<string> = new Set<string>(REFERRAL_SETTING_KEYS)

/**
 * Claves que el panel acepta, pero SOLO del operador de Cada1 (`isSuperAdmin()`), nunca de un
 * super usuario de la marca.
 *
 *   · `cycle_enabled` (fase 2 parte C, 2026-10-14; decisión H7 del comandante): encender el
 *     ciclo sube el volumen de mensajes y el costo de la línea de un día para otro, así que lo
 *     decide Cada1 con el dueño. Hasta la parte B solo la PANTALLA escondía el interruptor: el
 *     `PUT` lo aceptaba de cualquier super usuario de la marca (`exigirAlcanceDeMarca()`).
 */
export const CLAVES_DEL_OPERADOR: ReadonlyMap<string, string> = new Map([
  ['cycle_enabled', 'Encender o apagar el ciclo lo hace el equipo de Cada1. Escríbenos y lo hacemos contigo.'],
])

/**
 * Punteros que el código consume y que el catálogo NO cubre: la reactivación «con premio»
 * del sistema anterior, que una marca Twilio elige en Plantillas (bloque «Sistema
 * antiguo»). Es excepción de `p1a-plantillas-paridad.test.ts` (como la legacy
 * `reactivation_template_sid`, que se lee pero ya no se escribe). La lee SOLO el camino
 * viejo del cron de reactivación (marcas con el ciclo apagado); el ciclo no la lee nunca, y
 * sale cuando todas las marcas estén en el ciclo. `tier_unlocked_template_sid` y
 * `reward_reminder_template_sid` estaban acá hasta el 2026-10-11, cuando entraron al
 * catálogo (decisión B3).
 */
const PUNTEROS_FUERA_DEL_CATALOGO = ['reactivation_with_reward_template_sid'] as const

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
  | { ok: false; status: 400 | 403; error: string }

/**
 * La regla entera, PURA. `valorActual` es lo que hoy guarda `admin_settings` para esa
 * clave (`null` si no hay fila); solo importa para un puntero de una marca Zernio.
 * `esOperador` es si quien escribe es el operador de Cada1 (`isSuperAdmin()`): lo resuelve la
 * ruta y llega como dato, para que la regla siga siendo pura. Sin él no se escribe una clave
 * del operador (falla cerrado).
 */
export function decidirEscrituraDeAjuste(input: {
  key: string
  valor: string
  proveedor: string | null | undefined
  valorActual: string | null
  esOperador: boolean
}): DecisionDeAjuste {
  const { key, valor, proveedor, valorActual, esOperador } = input

  if (CLAVES_DEL_SISTEMA.has(key)) {
    return {
      ok: false,
      status: 400,
      error: `«${key}» la anota el sistema, no se cambia desde el panel.`,
    }
  }

  if (CLAVES_DE_REFERIDOS.has(key)) {
    return {
      ok: false,
      status: 400,
      error: `«${key}» se cambia en Recompensas › Referidos, que revisa el programa entero.`,
    }
  }

  if (!CLAVES_ESCRIBIBLES.has(key)) {
    return {
      ok: false,
      status: 400,
      error: `«${key}» no es un ajuste que se pueda cambiar desde el panel.`,
    }
  }

  const delOperador = CLAVES_DEL_OPERADOR.get(key)
  if (delOperador && !esOperador) return { ok: false, status: 403, error: delOperador }

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
