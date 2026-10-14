/**
 * Referidos — la lógica PURA (2026-10-15).
 *
 * Un cliente comparte su enlace `/r/{código}`, el amigo se registra con él y, cuando el mesero
 * valida la primera visita del amigo, los dos ganan. Lo que vive acá no toca la base: los
 * ajustes con sus defaults, el código, el texto que se comparte, el dominio del enlace y el
 * estado que se muestra. El I/O está en `src/services/referral.service.ts`; la regla de «una
 * sola vez», en la base (`completar_referido()`, 00075).
 *
 * Doc: docs/features/referral-program.md
 */

// ═══════════════════════════════════════════════════════════════
// Los ajustes de la marca
// ═══════════════════════════════════════════════════════════════

/**
 * Las claves de `admin_settings` del programa. Las escribe SOLO `PUT /api/dashboard/referrals`
 * (que valida el conjunto entero, y que un premio sea de ESTA marca); `PUT /api/dashboard/settings`
 * las rechaza con el porqué (`src/lib/settings-keys.ts`, `CLAVES_DE_REFERIDOS`).
 */
export const REFERRAL_SETTING_KEYS = [
  'referral_enabled',
  'referral_referrer_reward_type',
  'referral_referrer_reward_id',
  'referral_referrer_reward_points',
  'referral_referred_reward_type',
  'referral_referred_reward_id',
  'referral_referred_reward_points',
  'referral_monthly_cap',
  'referral_pending_expiry_days',
  'referral_share_message',
] as const

export type ClaveDeReferidos = (typeof REFERRAL_SETTING_KEYS)[number]

/** Qué se gana: un premio del catálogo (Premios para regalar), puntos, o nada. */
export type TipoDePremio = 'reward' | 'points' | 'none'

export interface PremioDeReferido {
  tipo: TipoDePremio
  /** `campaign_rewards.id` cuando `tipo = 'reward'`. */
  rewardId: string | null
  /** Cuando `tipo = 'points'`. */
  puntos: number | null
}

export interface AjustesDeReferidos {
  /** Apagado por defecto en todas las marcas: sin fila = apagado. */
  enabled: boolean
  /** Lo que gana quien invita cuando su amigo VIENE. */
  premioDeQuienInvita: PremioDeReferido
  /** El regalo de bienvenida del amigo. */
  premioDelAmigo: PremioDeReferido
  /** Premios de quien invita por mes (Bogotá). Los amigos de más cuentan, sin premio. */
  topeAlMes: number
  /** Días que tiene el amigo para venir; y los que dura cada premio para reclamarlo. */
  diasDeVencimiento: number
  /** El texto que se comparte por WhatsApp, con `{nombre}`, `{beneficio}`, `{enlace}` y `{marca}`. */
  mensaje: string
}

export const TOPE_AL_MES_DEFAULT = 10
export const DIAS_DE_VENCIMIENTO_DEFAULT = 30
export const LIMITES = {
  puntos: { min: 1, max: 10_000 },
  topeAlMes: { min: 1, max: 1_000 },
  dias: { min: 1, max: 365 },
  mensaje: 600,
} as const

export const MENSAJE_DEFAULT =
  '¡Hola! Soy {nombre} y te regalo {beneficio} en {marca} 🎁 Regístrate con mi enlace y lo reclamas en tu primera visita: {enlace}'

const SIN_PREMIO: PremioDeReferido = { tipo: 'none', rewardId: null, puntos: null }

function entero(v: string | undefined | null, min: number, max: number): number | null {
  if (v == null || !/^\s*\d+\s*$/.test(v)) return null
  const n = Number(v.trim())
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null
}

function leerPremio(tipo: string | undefined, id: string | undefined, puntos: string | undefined): PremioDeReferido {
  const t = (tipo ?? '').trim()
  if (t === 'reward') {
    const rid = (id ?? '').trim()
    return rid ? { tipo: 'reward', rewardId: rid, puntos: null } : SIN_PREMIO
  }
  if (t === 'points') {
    const n = entero(puntos, LIMITES.puntos.min, LIMITES.puntos.max)
    return n !== null ? { tipo: 'points', rewardId: null, puntos: n } : SIN_PREMIO
  }
  return SIN_PREMIO
}

/**
 * `admin_settings` → los ajustes, con sus defaults. Lo que no se entiende cae al default
 * conservador: un premio a medio configurar (tipo «reward» sin id, puntos fuera de rango) es
 * «sin premio», nunca un premio inventado.
 */
export function normalizarAjustesDeReferidos(raw: Record<string, string | undefined>): AjustesDeReferidos {
  const mensaje = (raw.referral_share_message ?? '').trim()
  return {
    enabled: (raw.referral_enabled ?? '').trim() === 'true',
    premioDeQuienInvita: leerPremio(
      raw.referral_referrer_reward_type,
      raw.referral_referrer_reward_id,
      raw.referral_referrer_reward_points
    ),
    premioDelAmigo: leerPremio(
      raw.referral_referred_reward_type,
      raw.referral_referred_reward_id,
      raw.referral_referred_reward_points
    ),
    topeAlMes: entero(raw.referral_monthly_cap, LIMITES.topeAlMes.min, LIMITES.topeAlMes.max) ?? TOPE_AL_MES_DEFAULT,
    diasDeVencimiento:
      entero(raw.referral_pending_expiry_days, LIMITES.dias.min, LIMITES.dias.max) ?? DIAS_DE_VENCIMIENTO_DEFAULT,
    mensaje: mensaje && mensaje.length <= LIMITES.mensaje ? mensaje : MENSAJE_DEFAULT,
  }
}

/** Los ajustes → las filas de `admin_settings` (todas las claves, siempre: el conjunto es uno). */
export function ajustesAFilas(a: AjustesDeReferidos): Record<ClaveDeReferidos, string> {
  return {
    referral_enabled: a.enabled ? 'true' : 'false',
    referral_referrer_reward_type: a.premioDeQuienInvita.tipo,
    referral_referrer_reward_id: a.premioDeQuienInvita.rewardId ?? '',
    referral_referrer_reward_points: a.premioDeQuienInvita.puntos != null ? String(a.premioDeQuienInvita.puntos) : '',
    referral_referred_reward_type: a.premioDelAmigo.tipo,
    referral_referred_reward_id: a.premioDelAmigo.rewardId ?? '',
    referral_referred_reward_points: a.premioDelAmigo.puntos != null ? String(a.premioDelAmigo.puntos) : '',
    referral_monthly_cap: String(a.topeAlMes),
    referral_pending_expiry_days: String(a.diasDeVencimiento),
    referral_share_message: a.mensaje,
  }
}

/** Lo que manda la pantalla. */
export interface EntradaDeAjustes {
  enabled?: unknown
  premioDeQuienInvita?: unknown
  premioDelAmigo?: unknown
  topeAlMes?: unknown
  diasDeVencimiento?: unknown
  mensaje?: unknown
}

export type ValidacionDeAjustes = { ok: true; ajustes: AjustesDeReferidos } | { ok: false; error: string }

function validarPremio(
  crudo: unknown,
  quien: string,
  premiosDeLaMarca: ReadonlySet<string>
): { ok: true; premio: PremioDeReferido } | { ok: false; error: string } {
  if (crudo == null) return { ok: true, premio: SIN_PREMIO }
  if (typeof crudo !== 'object' || Array.isArray(crudo)) return { ok: false, error: `El premio de ${quien} no se entiende.` }
  const p = crudo as Record<string, unknown>
  if (p.tipo === 'none') return { ok: true, premio: SIN_PREMIO }
  if (p.tipo === 'reward') {
    const id = typeof p.rewardId === 'string' ? p.rewardId.trim() : ''
    if (!id) return { ok: false, error: `Elige del catálogo el premio de ${quien}.` }
    // La regla que importa: el premio tiene que ser de ESTA marca (y estar activo). Un id de
    // otra marca no se guarda nunca, aunque el otorgamiento también lo filtre por marca.
    if (!premiosDeLaMarca.has(id)) {
      return {
        ok: false,
        error: `El premio de ${quien} no está en el catálogo activo de tu marca. Elige otro en Premios para regalar.`,
      }
    }
    return { ok: true, premio: { tipo: 'reward', rewardId: id, puntos: null } }
  }
  if (p.tipo === 'points') {
    const n = typeof p.puntos === 'number' ? p.puntos : typeof p.puntos === 'string' ? Number(p.puntos) : NaN
    if (!Number.isSafeInteger(n) || n < LIMITES.puntos.min || n > LIMITES.puntos.max) {
      return {
        ok: false,
        error: `Los puntos de ${quien} van de ${LIMITES.puntos.min} a ${LIMITES.puntos.max.toLocaleString('es-CO')}.`,
      }
    }
    return { ok: true, premio: { tipo: 'points', rewardId: null, puntos: n } }
  }
  return { ok: false, error: `El premio de ${quien} no se entiende.` }
}

function numeroEn(crudo: unknown, min: number, max: number): number | null {
  const n = typeof crudo === 'number' ? crudo : typeof crudo === 'string' && crudo.trim() ? Number(crudo) : NaN
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null
}

/**
 * Lo que manda la pantalla → los ajustes, o el porqué en español. `premiosDeLaMarca` son los
 * `campaign_rewards.id` ACTIVOS de la marca: es lo único que un selector puede guardar.
 * Encender exige que quien invita gane algo: sin eso, el botón de la tarjeta no tiene qué
 * prometer y no aparece, así que «encendido» no haría nada.
 */
export function validarAjustesDeReferidos(
  entrada: EntradaDeAjustes,
  premiosDeLaMarca: ReadonlySet<string>
): ValidacionDeAjustes {
  const quien = validarPremio(entrada.premioDeQuienInvita, 'quien invita', premiosDeLaMarca)
  if (!quien.ok) return quien
  const amigo = validarPremio(entrada.premioDelAmigo, 'el amigo', premiosDeLaMarca)
  if (!amigo.ok) return amigo

  const tope = numeroEn(entrada.topeAlMes, LIMITES.topeAlMes.min, LIMITES.topeAlMes.max)
  if (tope === null) {
    return { ok: false, error: `El tope al mes va de ${LIMITES.topeAlMes.min} a ${LIMITES.topeAlMes.max}.` }
  }
  const dias = numeroEn(entrada.diasDeVencimiento, LIMITES.dias.min, LIMITES.dias.max)
  if (dias === null) {
    return { ok: false, error: `Los días para venir van de ${LIMITES.dias.min} a ${LIMITES.dias.max}.` }
  }
  const mensaje = typeof entrada.mensaje === 'string' ? entrada.mensaje.trim() : ''
  if (mensaje.length > LIMITES.mensaje) {
    return { ok: false, error: `El mensaje para compartir tiene más de ${LIMITES.mensaje} caracteres.` }
  }

  const enabled = entrada.enabled === true
  if (enabled && quien.premio.tipo === 'none') {
    return {
      ok: false,
      error: 'Para encender los referidos, elige qué gana quien invita: un premio del catálogo o puntos.',
    }
  }

  return {
    ok: true,
    ajustes: {
      enabled,
      premioDeQuienInvita: quien.premio,
      premioDelAmigo: amigo.premio,
      topeAlMes: tope,
      diasDeVencimiento: dias,
      mensaje: mensaje || MENSAJE_DEFAULT,
    },
  }
}

/** ¿El programa está vivo para esta marca? Encendido Y con algo que prometerle a quien invita. */
export function programaActivo(a: AjustesDeReferidos): boolean {
  return a.enabled && a.premioDeQuienInvita.tipo !== 'none'
}

// ═══════════════════════════════════════════════════════════════
// El código
// ═══════════════════════════════════════════════════════════════

/** Sin 0/O ni 1/I/L: se leen igual en voz alta. Espejo del CHECK de la 00075. */
export const ALFABETO_DEL_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const LARGO_DEL_CODIGO = 6
const CODIGO_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,8}$/

/** Un código nuevo. `aleatorio` devuelve enteros ≥ 0 (en el servicio, `crypto.getRandomValues`). */
export function generarCodigo(aleatorio: (n: number) => number[]): string {
  return aleatorio(LARGO_DEL_CODIGO)
    .map((x) => ALFABETO_DEL_CODIGO[x % ALFABETO_DEL_CODIGO.length])
    .join('')
}

/** Lo que llega en la URL o en el cuerpo → el código, o `null` si no puede ser uno. */
export function normalizarCodigo(crudo: unknown): string | null {
  if (typeof crudo !== 'string') return null
  const c = crudo.trim().toUpperCase()
  return CODIGO_RE.test(c) ? c : null
}

// ═══════════════════════════════════════════════════════════════
// Lo que se muestra y lo que se comparte
// ═══════════════════════════════════════════════════════════════

/** «2x1 en rollos» · «50 puntos» · `null` (sin premio). `titulo` = el del catálogo. */
export function textoDelBeneficio(premio: PremioDeReferido, titulo: string | null): string | null {
  if (premio.tipo === 'reward') return titulo?.trim() || null
  if (premio.tipo === 'points' && premio.puntos) return `${premio.puntos.toLocaleString('es-CO')} puntos`
  return null
}

/** El primer nombre: es todo lo que el amigo ve de quien lo invitó. */
export function primerNombre(nombre: string | null | undefined): string {
  const n = (nombre ?? '').trim().split(/\s+/)[0] ?? ''
  return n || 'Un amigo'
}

/**
 * El mensaje que sale por el WhatsApp de quien invita. `{enlace}` siempre termina en el texto:
 * si el dueño lo borró del mensaje, se agrega al final (un mensaje sin enlace no sirve).
 */
export function mensajeParaCompartir(
  plantilla: string,
  datos: { nombre: string; beneficio: string | null; marca: string; enlace: string }
): string {
  const beneficio = datos.beneficio ?? 'una visita especial'
  let texto = plantilla
    .replaceAll('{nombre}', datos.nombre)
    .replaceAll('{beneficio}', beneficio)
    .replaceAll('{marca}', datos.marca)
  if (texto.includes('{enlace}')) texto = texto.replaceAll('{enlace}', datos.enlace)
  else texto = `${texto.trimEnd()} ${datos.enlace}`
  return texto
}

/** `https://wa.me/?text=…`: abre el WhatsApp PERSONAL con el texto listo; el amigo lo elige quien invita. */
export function enlaceDeWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

/**
 * El dominio del enlace (§1.6 del prompt). Con 2+ sedes, el dominio RAÍZ de la marca no puede
 * registrar a nadie (el 409 de D21), así que si quien invita está mirando su tarjeta desde la
 * raíz, el enlace sale con el dominio de la sede donde vino por última vez. Si esa sede no
 * tiene dominio (o no se sabe), sale la raíz: la landing pregunta la sede y conserva el enlace.
 * En un subdominio de sede, o con 0-1 sedes, el host de siempre.
 */
export function dominioDelEnlace(input: {
  host: string
  requiereElegirSede: boolean
  sedes: ReadonlyArray<{ id: string; domain: string | null }>
  sedeDeUltimaVisita: string | null
}): string {
  if (!input.requiereElegirSede || !input.sedeDeUltimaVisita) return input.host
  const sede = input.sedes.find((s) => s.id === input.sedeDeUltimaVisita)
  return sede?.domain?.trim() || input.host
}

export function construirEnlace(dominio: string, codigo: string): string {
  return `https://${dominio}/r/${codigo}`
}

export type EstadoDeReferido = 'pending' | 'completed' | 'expired'

/** El estado que se MUESTRA: un pendiente pasado de fecha ya es vencido, lo haya marcado alguien o no. */
export function estadoVisible(
  fila: { status: EstadoDeReferido; expires_at: string },
  ahora: Date = new Date()
): EstadoDeReferido {
  if (fila.status === 'pending' && new Date(fila.expires_at).getTime() <= ahora.getTime()) return 'expired'
  return fila.status
}

export const ETIQUETA_DEL_ESTADO: Record<EstadoDeReferido, string> = {
  pending: 'Registrado: falta que venga',
  completed: 'Vino',
  expired: 'Venció sin venir',
}
