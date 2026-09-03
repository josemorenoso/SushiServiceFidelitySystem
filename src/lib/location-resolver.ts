/**
 * Resolución de SEDE — la lógica pura de multi-sede (Fase F3).
 *
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §3
 * Feature: `docs/features/multi-sede.md`
 * Columnas que alimenta: las 18 de `00043_location_id_eventos.sql`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO NO HABLA CON LA BASE, A PROPÓSITO
 * ─────────────────────────────────────────────────────────────────────────
 * Cero imports. Todo entra por parámetro y todo sale por retorno. Dos razones:
 *
 *   1. La precedencia de señales es la regla de negocio más delicada de F3 —
 *      si se equivoca, D12 ("efectividad por sede") reporta números falsos sin
 *      que nadie lo note. Una función pura se prueba de verdad, sin levantar
 *      Postgres ni mockear supabase-js.
 *   2. Mandamiento II: la lógica va separada del acceso a datos. El I/O vive en
 *      `resolveHostContext()` (`src/lib/tenant.ts`), que consulta y luego llama
 *      aquí.
 *
 * El host y el dominio de la marca llegan YA NORMALIZADOS (`normalizeHost()` de
 * `src/lib/tenant.ts`): sin puerto, sin `www.`, en minúsculas. Normalizar aquí
 * obligaría a importar tenant.ts y con él supabase-js y `next/headers`.
 */

/**
 * Las 7 vías del CHECK `visits_location_source_check` (00043:238-252).
 *
 * ⚠️ ESPEJO EXACTO DE LA BASE. Agregar un valor aquí sin agregarlo al CHECK hace
 * que el INSERT muera con 23514 en producción y en silencio en el `catch` del
 * check-in (la visita es best-effort). Cambiar SIEMPRE los dos lados.
 */
export const LOCATION_SOURCES = [
  'staff_user',
  'staff_device',
  'host',
  'host_single',
  'qr_token',
  'authorized_number',
  'manual',
] as const

export type LocationSource = (typeof LOCATION_SOURCES)[number]

/** Las dos vías que puede producir el host (§3.1 vía 3 y §3.2). */
export type HostLocationSource = Extract<LocationSource, 'host' | 'host_single'>

/**
 * Una sede activa de la marca, con lo mínimo para elegirla o mostrarla.
 * Es el subconjunto de `restaurant_locations` que lee `resolveHostContext()`.
 */
export interface ActiveLocation {
  id: string
  name: string
  slug: string | null
  /** Subdominio propio de la sede (único GLOBAL, 00041). NULL = no estrenó dominio. */
  domain: string | null
  is_primary: boolean
}

/** Lo que resuelve el host, antes de que entren las señales más fuertes. */
export interface HostLocationPick {
  locationId: string | null
  source: HostLocationSource | null
  /**
   * `true` solo en el caso del §3.2: el host es el dominio RAÍZ de la marca y la
   * marca tiene 2+ sedes activas. El registro responde 409 con `choices`.
   */
  requiresChoice: boolean
  /** Las sedes entre las que hay que elegir. Vacío si no hay que elegir. */
  choices: ActiveLocation[]
}

/**
 * Resultado final: lo que se escribe en `visits.location_id`,
 * `visits.location_source` y `visits.location_conflict`.
 *
 * INVARIANTE: `locationId` y `source` van juntos o no van ninguno. Lo exige el
 * CHECK `visits_location_pareja_check` (00043:262-266) y esta función lo cumple
 * por construcción — nunca se asigna uno sin el otro.
 */
export interface LocationResolution {
  locationId: string | null
  source: LocationSource | null
  /**
   * TRI-ESTADO, nunca `false` por defecto (00043:290-292):
   *   · `null`  = NO SE EVALUÓ — no hubo claim `loc` en el QR, o no se resolvió sede.
   *   · `false` = se evaluó y el QR coincidía con la sede resuelta.
   *   · `true`  = el QR decía OTRA sede (enlace guardado de otra sede).
   */
  conflict: boolean | null
}

/** Las señales del §3.1, en crudo. Cada una puede faltar. */
export interface LocationSignals {
  /**
   * Vía 1 — `staff_users.location_id` del mesero autenticado. La más fuerte.
   *
   * ⚠️ HOY SIEMPRE LLEGA `null`: esa columna la crea la migración **00044**, que
   * es F4. F3 no lleva migración nueva, así que la vía queda cableada y probada
   * pero sin fuente. Cuando F4 aplique la 00044, basta con pasarle el valor.
   */
  staffLocationId?: string | null
  /**
   * Vía 2 — `staff_devices.location_id` del dispositivo de confianza.
   * ⚠️ Mismo caso que la vía 1: la columna llega con la 00044 (F4).
   */
  deviceLocationId?: string | null
  /** Vía 3 — lo que resolvió el host. Va con su `hostSource` o no va. */
  hostLocationId?: string | null
  hostSource?: HostLocationSource | null
  /**
   * Claim `loc` del JWT del QR del cliente. **NUNCA DECIDE LA SEDE.**
   * Solo sirve para poner `conflict` (§3.1 y conflicto 7 de §11 del spec).
   */
  qrLocationId?: string | null
}

/**
 * Qué sede dice el host, y si hay que preguntarle al cliente.
 *
 * LAS DOS REGLAS DEL §3.2 y §3.3
 * ──────────────────────────────
 * · **Host = subdominio de una sede** → esa sede, `source = 'host'`. Es el caso
 *   de la sede 2..N, que estrena dominio y material impreso.
 * · **Host = dominio RAÍZ de la marca** → depende de cuántas sedes activas haya:
 *     - exactamente 1  → esa sede, `source = 'host_single'` («sede única
 *       implícita»). Es lo que le da atribución perfecta y gratis a los 4
 *       tenants vivos: sin subdominio nuevo y sin reimprimir un solo QR.
 *     - 2 o más        → sede `null` y `requiresChoice = true`. El dominio raíz
 *       **deja de atribuir automáticamente** el día que abre la segunda sede
 *       (§3.2, textual). Adivinar aquí metería visitas de Laureles en el reporte
 *       de Envigado, y ese número terminaría en una decisión de plata.
 *     - 0              → sede desconocida, sin pregunta: no hay entre qué elegir.
 *
 * ⚠️ El dominio raíz manda AUNQUE la sede principal repita ese mismo dominio
 * (que es lo que hace la 00042 con los tenants vivos). Si se resolviera por
 * coincidencia exacta de `domain`, la marca con 2 sedes seguiría atribuyéndole
 * todo a la principal — justo el silencio que el §3.2 quiere evitar.
 *
 * @param host          host normalizado de la petición (`normalizeHost()`).
 * @param tenantDomain  `tenants.domain` normalizado. `null` si la marca no tiene.
 * @param activeLocations sedes con `is_active = true`, ya ordenadas para mostrar.
 */
export function pickLocationForHost(
  host: string | null,
  tenantDomain: string | null,
  activeLocations: readonly ActiveLocation[]
): HostLocationPick {
  const sinSede: HostLocationPick = {
    locationId: null,
    source: null,
    requiresChoice: false,
    choices: [],
  }

  if (!host) return sinSede

  const esDominioRaiz = tenantDomain !== null && host === tenantDomain

  if (!esDominioRaiz) {
    const exacta = activeLocations.find((l) => l.domain !== null && l.domain === host)
    if (!exacta) return sinSede
    return { locationId: exacta.id, source: 'host', requiresChoice: false, choices: [] }
  }

  if (activeLocations.length === 1) {
    return {
      locationId: activeLocations[0].id,
      source: 'host_single',
      requiresChoice: false,
      choices: [],
    }
  }

  if (activeLocations.length >= 2) {
    return { locationId: null, source: null, requiresChoice: true, choices: [...activeLocations] }
  }

  return sinSede
}

/**
 * La precedencia del §3.1, aplicada: **mesero → dispositivo → host → NULL**.
 *
 * POR QUÉ EL MESERO LE GANA AL HOST
 * ─────────────────────────────────
 * Un cliente parado en Laureles abre su enlace guardado de `envigado.marca.com`,
 * genera su QR y se lo muestra al mesero de Laureles. Si ganara el host, la
 * visita se acreditaría a Envigado y el reporte de D12 mentiría sin que nadie lo
 * note. El mesero es de UNA sede (D11), está físicamente donde ocurre la visita
 * y su credencial la emite el sistema: el cliente no la puede falsificar.
 *
 * POR QUÉ EL QR NO DECIDE NUNCA
 * ─────────────────────────────
 * El `loc` del JWT lo genera el navegador del cliente desde el subdominio que
 * tenga abierto — exactamente el enlace guardado del párrafo anterior. Sirve para
 * DETECTAR que hubo discrepancia (`conflict = true`), no para resolverla.
 * `conflict` no es un control de acceso: no bloquea nada.
 */
export function resolveVisitLocation(signals: LocationSignals): LocationResolution {
  let locationId: string | null = null
  let source: LocationSource | null = null

  if (signals.staffLocationId) {
    locationId = signals.staffLocationId
    source = 'staff_user'
  } else if (signals.deviceLocationId) {
    locationId = signals.deviceLocationId
    source = 'staff_device'
  } else if (signals.hostLocationId && signals.hostSource) {
    // Los dos o ninguno: un `hostLocationId` sin `hostSource` sería una sede sin
    // procedencia auditable, y el CHECK de pareja la rechazaría de todos modos.
    locationId = signals.hostLocationId
    source = signals.hostSource
  }

  // Tri-estado: solo se puede COMPARAR si existen las dos puntas.
  const conflict =
    signals.qrLocationId && locationId ? signals.qrLocationId !== locationId : null

  return { locationId, source, conflict }
}

/**
 * Una sede que llega de una señal autenticada y NO pasa por el host:
 * `authorized_numbers.location_id` (domicilios, D9) o una corrección `manual`.
 *
 * Existe para que el llamador no tenga que armar a mano la pareja
 * `location_id` + `location_source` y arriesgarse a romper el CHECK.
 */
export function resolveDirectLocation(
  locationId: string | null | undefined,
  source: LocationSource
): LocationResolution {
  if (!locationId) return { locationId: null, source: null, conflict: null }
  return { locationId, source, conflict: null }
}
