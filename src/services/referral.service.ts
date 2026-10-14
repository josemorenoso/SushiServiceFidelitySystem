/**
 * Referidos — el I/O (2026-10-15).
 *
 * Doc: docs/features/referral-program.md · Migración: 00075_referidos.sql
 * La lógica pura (ajustes, código, mensaje, dominio del enlace): `src/lib/referidos.ts`.
 *
 * EL FLUJO, Y QUIÉN LLAMA CADA PIEZA
 * ──────────────────────────────────
 *   1. Quien invita abre su tarjeta → `GET /api/referral/me` → `obtenerOCrearCodigo()`.
 *   2. El amigo abre `/r/{código}` → `GET /api/referral/{código}` → `vistaPublicaDelCodigo()`.
 *   3. El amigo se registra → `POST /api/check-in` (register) → `prepararReferido()` ANTES de
 *      crear el cliente (decide que su visita #1 queda pendiente del mesero) y
 *      `registrarReferido()` DESPUÉS (la fila pendiente y su regalo en la tarjeta).
 *   4. El mesero lo escanea → `POST /api/check-in` (checkin) → `completarReferidoAlEscanear()`:
 *      la base decide UNA vez (`completar_referido()`) y acá se otorga lo que la base dijo.
 *
 * LO QUE NO SE NEGOCIA
 * ────────────────────
 *   · Todo filtra por `tenant_id`: el código de la marca A no existe en la B, y un premio del
 *     catálogo de otra marca no se otorga aunque alguien lo haya guardado.
 *   · El premio de quien invita sale SOLO con `referrer_rewarded = true` de la base, que lo
 *     devuelve una vez por referido. La base además no deja dos premios del mismo referido
 *     para la misma persona (`idx_reward_grants_referral_once`).
 *   · Un fallo de base no se confunde con «no hay»: se registra con contexto y se propaga o se
 *     dice. Lo único best-effort es lo que ya lo era en el registro: si el regalo no se pudo
 *     otorgar, el cliente queda registrado igual y el log dice por qué.
 */

import { createClient } from '@supabase/supabase-js'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import { leerTodo } from '@/lib/leer-todo'
import {
  ETIQUETA_DEL_ESTADO,
  generarCodigo,
  normalizarAjustesDeReferidos,
  normalizarCodigo,
  primerNombre,
  programaActivo,
  REFERRAL_SETTING_KEYS,
  textoDelBeneficio,
  estadoVisible,
  type AjustesDeReferidos,
  type EstadoDeReferido,
  type PremioDeReferido,
} from '@/lib/referidos'
import { grantReward } from '@/services/reward-grant.service'
import { awardPoints } from '@/services/points.service'
import { getMultipleSettings } from '@/services/settings.service'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/** Un fallo de base que el llamador tiene que poder distinguir de «no hay». */
export class ReferidosDbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReferidosDbError'
  }
}

// ═══════════════════════════════════════════════════════════════
// Ajustes y premios del catálogo
// ═══════════════════════════════════════════════════════════════

/** Los ajustes de la marca. Lanza si la base falla (`getMultipleSettings()`). */
export async function leerAjustesDeReferidos(tenantId: string): Promise<AjustesDeReferidos> {
  return normalizarAjustesDeReferidos(await getMultipleSettings([...REFERRAL_SETTING_KEYS], tenantId))
}

export interface PremioDelCatalogo {
  id: string
  title: string
}

/**
 * El premio del catálogo de ESTA marca, si sigue activo. `null` = no existe, es de otra marca o
 * se retiró: en los tres casos no se otorga nada. Lanza si la base falla.
 */
export async function premioDelCatalogo(rewardId: string, tenantId: string): Promise<PremioDelCatalogo | null> {
  const { data, error } = await getServiceClient()
    .from('campaign_rewards')
    .select('id, title, is_active')
    .eq('id', rewardId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (isDbFailure(error)) {
    logDbFailure({ scope: 'Referidos', reason: 'reward_lookup_error', error, context: { tenant_id: tenantId, reward_id: rewardId } })
    throw new ReferidosDbError(`No se pudo leer el premio del catálogo: ${error.message}`)
  }
  if (!data || !data.is_active) return null
  return { id: data.id as string, title: data.title as string }
}

/** El texto de lo que se gana («2x1 en rollos», «50 puntos»), o `null` si no hay premio que dar. */
export async function beneficioDe(premio: PremioDeReferido, tenantId: string): Promise<string | null> {
  if (premio.tipo === 'reward') {
    const p = premio.rewardId ? await premioDelCatalogo(premio.rewardId, tenantId) : null
    return textoDelBeneficio(premio, p?.title ?? null)
  }
  return textoDelBeneficio(premio, null)
}

// ═══════════════════════════════════════════════════════════════
// El código de quien invita
// ═══════════════════════════════════════════════════════════════

function aleatorio(n: number): number[] {
  return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(n)))
}

async function codigoExistente(customerId: string, tenantId: string): Promise<string | null> {
  const { data, error } = await getServiceClient()
    .from('referral_codes')
    .select('code')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()
  if (isDbFailure(error)) {
    logDbFailure({ scope: 'Referidos', reason: 'code_lookup_error', error, context: { tenant_id: tenantId, customer_id: customerId } })
    throw new ReferidosDbError(`No se pudo leer el código: ${error.message}`)
  }
  return (data?.code as string | undefined) ?? null
}

/**
 * El código del cliente: el que ya tiene, o uno nuevo. Dos pedidos simultáneos del mismo cliente
 * no crean dos (UNIQUE `(tenant_id, customer_id)`: el segundo relee el del primero), y un código
 * que ya usa otro cliente de la marca se reintenta con otro.
 */
export async function obtenerOCrearCodigo(customerId: string, tenantId: string): Promise<string> {
  const ya = await codigoExistente(customerId, tenantId)
  if (ya) return ya

  for (let intento = 0; intento < 6; intento++) {
    const code = generarCodigo(aleatorio)
    const { data, error } = await getServiceClient()
      .from('referral_codes')
      .insert({ tenant_id: tenantId, customer_id: customerId, code }) // tenant_id SIEMPRE explícito
      .select('code')
      .single()
    if (!error && data) return data.code as string
    if (error?.code === '23505') {
      // O lo creó un pedido simultáneo del mismo cliente, o el código lo tiene otro cliente.
      const otro = await codigoExistente(customerId, tenantId)
      if (otro) return otro
      continue
    }
    logDbFailure({ scope: 'Referidos', reason: 'code_create_error', error, context: { tenant_id: tenantId, customer_id: customerId } })
    throw new ReferidosDbError(`No se pudo crear el código: ${error?.message ?? 'sin respuesta'}`)
  }
  throw new ReferidosDbError('No se pudo crear un código libre después de 6 intentos')
}

/** Quién es el dueño de un código, dentro de la marca. `null` si no existe en ESTA marca. */
async function duenoDelCodigo(
  code: string,
  tenantId: string
): Promise<{ customerId: string; name: string | null; phone: string } | null> {
  const db = getServiceClient()
  const { data: fila, error } = await db
    .from('referral_codes')
    .select('customer_id')
    .eq('tenant_id', tenantId)
    .eq('code', code)
    .maybeSingle()
  if (isDbFailure(error)) {
    logDbFailure({ scope: 'Referidos', reason: 'code_owner_lookup_error', error, context: { tenant_id: tenantId, code } })
    throw new ReferidosDbError(`No se pudo leer el código: ${error.message}`)
  }
  if (!fila) return null

  const { data: cliente, error: errCliente } = await db
    .from('customers')
    .select('id, name, phone')
    .eq('id', fila.customer_id as string)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (isDbFailure(errCliente)) {
    logDbFailure({ scope: 'Referidos', reason: 'code_owner_customer_error', error: errCliente, context: { tenant_id: tenantId, code } })
    throw new ReferidosDbError(`No se pudo leer quién invita: ${errCliente.message}`)
  }
  if (!cliente) return null
  return { customerId: cliente.id as string, name: (cliente.name as string | null) ?? null, phone: cliente.phone as string }
}

// ═══════════════════════════════════════════════════════════════
// La landing del amigo
// ═══════════════════════════════════════════════════════════════

export interface VistaPublicaDelCodigo {
  codigo: string
  /** Solo el primer nombre de quien invita. */
  nombre: string
  /** El regalo del amigo («2x1 en rollos», «50 puntos»), o `null` si la marca no regala nada. */
  beneficio: string | null
  /** Días que tiene para venir. */
  dias: number
}

/**
 * Lo que la landing `/r/{código}` puede saber: el primer nombre de quien invita y el regalo. `null`
 * = el código no existe en ESTA marca o el programa está apagado: la landing muestra la de siempre.
 */
export async function vistaPublicaDelCodigo(codigoCrudo: string, tenantId: string): Promise<VistaPublicaDelCodigo | null> {
  const codigo = normalizarCodigo(codigoCrudo)
  if (!codigo) return null
  const ajustes = await leerAjustesDeReferidos(tenantId)
  if (!programaActivo(ajustes)) return null
  const dueno = await duenoDelCodigo(codigo, tenantId)
  if (!dueno) return null
  return {
    codigo,
    nombre: primerNombre(dueno.name),
    beneficio: await beneficioDe(ajustes.premioDelAmigo, tenantId),
    dias: ajustes.diasDeVencimiento,
  }
}

// ═══════════════════════════════════════════════════════════════
// El registro del amigo
// ═══════════════════════════════════════════════════════════════

export type MotivoSinReferido =
  | 'apagado'
  | 'codigo_invalido'
  | 'codigo_no_existe'
  | 'auto_referencia'
  | 'telefono_ya_referido'
  | 'error_base'

export interface ContextoDeReferido {
  codigo: string
  referrerCustomerId: string
  ajustes: AjustesDeReferidos
}

export type PreparacionDeReferido = { ok: true; ctx: ContextoDeReferido } | { ok: false; motivo: MotivoSinReferido }

/**
 * ¿Este registro cuenta como referido? Se llama ANTES de crear el cliente, porque si cuenta su
 * visita #1 queda pendiente del mesero (se registró desde su casa, como con una invitación).
 *
 * No cuenta —y el registro sigue EXACTAMENTE como uno normal— si el programa está apagado, el
 * código no existe en esta marca, es su propio código, o el teléfono ya fue referido en la marca.
 * Un cliente que YA existe ni llega acá: el registro le contesta 409 antes.
 */
export async function prepararReferido(input: { codigo: unknown; tenantId: string; phone: string }): Promise<PreparacionDeReferido> {
  const codigo = normalizarCodigo(input.codigo)
  if (!codigo) return { ok: false, motivo: 'codigo_invalido' }
  try {
    const ajustes = await leerAjustesDeReferidos(input.tenantId)
    if (!programaActivo(ajustes)) return { ok: false, motivo: 'apagado' }

    const dueno = await duenoDelCodigo(codigo, input.tenantId)
    if (!dueno) return { ok: false, motivo: 'codigo_no_existe' }
    if (dueno.phone === input.phone) return { ok: false, motivo: 'auto_referencia' }

    const { data: ya, error } = await getServiceClient()
      .from('referrals')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('referred_phone', input.phone)
      .maybeSingle()
    if (isDbFailure(error)) {
      logDbFailure({ scope: 'Referidos', reason: 'phone_check_error', error, context: { tenant_id: input.tenantId } })
      return { ok: false, motivo: 'error_base' }
    }
    if (ya) return { ok: false, motivo: 'telefono_ya_referido' }

    return { ok: true, ctx: { codigo, referrerCustomerId: dueno.customerId, ajustes } }
  } catch (err) {
    // Ya quedó en el log con su contexto (`ReferidosDbError` / `getMultipleSettings()`).
    console.error('[Referidos] No se pudo preparar el referido; el registro sigue sin él:', err)
    return { ok: false, motivo: 'error_base' }
  }
}

export type RegistroDeReferido =
  | { ok: true; referralId: string; regalo: { tipo: 'reward' | 'points'; texto: string } | null }
  | { ok: false; motivo: MotivoSinReferido }

/**
 * Después de crear al amigo: la fila pendiente (vence a los N días de HOY) y, si su regalo es un
 * premio del catálogo, el premio en su tarjeta desde ya (`reward_grant`, se entrega cuando el
 * mesero lo escanea, como una invitación). Si su regalo son puntos, se le suman en esa misma
 * visita, no ahora: puntos desde el sofá es justo lo que la regla de la visita #1 evita.
 */
export async function registrarReferido(
  ctx: ContextoDeReferido,
  amigo: { id: string; phone: string },
  tenantId: string,
  /** La sede del registro (F3), para `granted_location_id` del regalo. `null` = desconocida. */
  locationId: string | null
): Promise<RegistroDeReferido> {
  const dias = ctx.ajustes.diasDeVencimiento
  const { data, error } = await getServiceClient()
    .from('referrals')
    .insert({
      tenant_id: tenantId, // SIEMPRE explícito
      referrer_customer_id: ctx.referrerCustomerId,
      referred_customer_id: amigo.id,
      referred_phone: amigo.phone,
      code: ctx.codigo,
      expires_at: new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    if (error?.code === '23505') return { ok: false, motivo: 'telefono_ya_referido' }
    if (error?.code === '23514') return { ok: false, motivo: 'auto_referencia' }
    logDbFailure({ scope: 'Referidos', reason: 'referral_insert_error', error, context: { tenant_id: tenantId, customer_id: amigo.id } })
    return { ok: false, motivo: 'error_base' }
  }
  const referralId = data.id as string

  const premio = ctx.ajustes.premioDelAmigo
  if (premio.tipo === 'points' && premio.puntos) {
    return { ok: true, referralId, regalo: { tipo: 'points', texto: `${premio.puntos.toLocaleString('es-CO')} puntos` } }
  }
  if (premio.tipo !== 'reward' || !premio.rewardId) return { ok: true, referralId, regalo: null }

  try {
    const delCatalogo = await premioDelCatalogo(premio.rewardId, tenantId)
    if (!delCatalogo) {
      console.warn(`[Referidos] El regalo del amigo (${premio.rewardId}) ya no está activo en la marca: el amigo queda sin regalo.`)
      return { ok: true, referralId, regalo: null }
    }
    const res = await grantReward(
      {
        customerId: amigo.id,
        grantType: 'campaign_prize',
        source: 'referral',
        prizeTitle: delCatalogo.title,
        campaignRewardId: delCatalogo.id,
        referralId,
        windowDays: dias,
        grantedLocationId: locationId,
      },
      tenantId
    )
    if (!res.ok) {
      console.error(`[Referidos] No se pudo poner el regalo en la tarjeta de ${amigo.id}: ${res.error}`)
      return { ok: true, referralId, regalo: null }
    }
    return { ok: true, referralId, regalo: { tipo: 'reward', texto: delCatalogo.title } }
  } catch (err) {
    console.error('[Referidos] Error otorgando el regalo del amigo:', err)
    return { ok: true, referralId, regalo: null }
  }
}

// ═══════════════════════════════════════════════════════════════
// El escaneo del mesero
// ═══════════════════════════════════════════════════════════════

export type ResultadoDeLaBase = 'sin_referido' | 'ya_resuelto' | 'vencido' | 'completado' | 'tope'

export interface ResultadoDeCompletar {
  resultado: ResultadoDeLaBase | 'error'
  referralId?: string
  /** Lo que se le dio a quien invitó en ESTE escaneo. */
  premioDeQuienInvita?: 'reward' | 'points' | null
  /** Puntos que se le sumaron al amigo en este escaneo (su regalo, si eran puntos). */
  puntosDelAmigo?: number
}

/**
 * El mesero acaba de validar una visita de `customerId`. Si llegó por un referido pendiente, la
 * base lo completa (una vez) y acá se otorga lo que decidió: el premio de quien invitó (solo con
 * `referrer_rewarded`), con `granted_location_id` = la sede de ESTA visita; y los puntos del amigo
 * si su regalo eran puntos. Nunca lanza: el check-in del mesero no se cae por esto, y lo que falle
 * queda en el log con su contexto.
 */
export async function completarReferidoAlEscanear(input: {
  tenantId: string
  customerId: string
  ajustes: AjustesDeReferidos
  /** La sede de la visita (F3/F4). `null` = sede desconocida. */
  locationId: string | null
}): Promise<ResultadoDeCompletar> {
  const { tenantId, customerId, ajustes, locationId } = input
  const { data, error } = await getServiceClient().rpc('completar_referido', {
    p_tenant_id: tenantId,
    p_referred_customer_id: customerId,
    p_monthly_cap: ajustes.topeAlMes,
    p_reward_referrer: ajustes.premioDeQuienInvita.tipo !== 'none',
  })
  if (error) {
    logDbFailure({ scope: 'Referidos', reason: 'complete_rpc_error', error, context: { tenant_id: tenantId, customer_id: customerId } })
    return { resultado: 'error' }
  }

  const r = (data ?? {}) as {
    resultado?: ResultadoDeLaBase
    referral_id?: string
    referrer_customer_id?: string
    referrer_rewarded?: boolean
  }
  const resultado = r.resultado ?? 'sin_referido'
  if (resultado !== 'completado' && resultado !== 'tope') return { resultado, referralId: r.referral_id }

  const referralId = r.referral_id as string
  const out: ResultadoDeCompletar = { resultado, referralId, premioDeQuienInvita: null, puntosDelAmigo: 0 }

  // ── El premio de quien invitó ──
  if (r.referrer_rewarded && r.referrer_customer_id) {
    const premio = ajustes.premioDeQuienInvita
    try {
      if (premio.tipo === 'points' && premio.puntos) {
        await awardPoints({
          customerId: r.referrer_customer_id,
          points: premio.puntos,
          source: 'referral',
          tenantId,
          referenceId: referralId,
          locationId,
        })
        out.premioDeQuienInvita = 'points'
      } else if (premio.tipo === 'reward' && premio.rewardId) {
        const delCatalogo = await premioDelCatalogo(premio.rewardId, tenantId)
        if (!delCatalogo) {
          console.warn(`[Referidos] El premio de quien invita (${premio.rewardId}) ya no está activo: referido ${referralId} sin premio.`)
        } else {
          const res = await grantReward(
            {
              customerId: r.referrer_customer_id,
              grantType: 'campaign_prize',
              source: 'referral',
              prizeTitle: delCatalogo.title,
              campaignRewardId: delCatalogo.id,
              referralId,
              windowDays: ajustes.diasDeVencimiento,
              grantedLocationId: locationId,
            },
            tenantId
          )
          // `duplicate_active` acá = ya tenía el premio de ESTE referido (el freno de la base).
          if (res.ok || res.code === 'duplicate_active') out.premioDeQuienInvita = 'reward'
          else console.error(`[Referidos][FALLO] reason=referrer_grant_error referral=${referralId} detalle="${res.error}"`)
        }
      }
    } catch (err) {
      console.error(`[Referidos][FALLO] reason=referrer_reward_error referral=${referralId}:`, err)
    }
  }

  // ── Los puntos del amigo, si su regalo eran puntos (el premio del catálogo ya está en su tarjeta) ──
  const delAmigo = ajustes.premioDelAmigo
  if (delAmigo.tipo === 'points' && delAmigo.puntos) {
    try {
      const res = await awardPoints({
        customerId,
        points: delAmigo.puntos,
        source: 'referral',
        tenantId,
        referenceId: referralId,
        locationId,
      })
      out.puntosDelAmigo = res.pointsAwarded
    } catch (err) {
      console.error(`[Referidos][FALLO] reason=referred_points_error referral=${referralId}:`, err)
    }
  }

  return out
}

// ═══════════════════════════════════════════════════════════════
// Los vencidos (sin cron: al leer)
// ═══════════════════════════════════════════════════════════════

/**
 * Marca `expired` los pendientes que pasaron su fecha. No hay cron nuevo (`vercel.json` no se
 * toca): se llama al leer —el panel y la tarjeta de quien invita— y `completar_referido()` hace
 * lo mismo al escanear. Lo que se MUESTRA no depende de esto (`estadoVisible()`); esto deja la
 * base al día para quien la consulte por SQL.
 */
export async function vencerPendientes(tenantId: string, referrerCustomerId?: string): Promise<void> {
  let q = getServiceClient()
    .from('referrals')
    .update({ status: 'expired', expired_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString())
  if (referrerCustomerId) q = q.eq('referrer_customer_id', referrerCustomerId)
  const { error } = await q
  if (error) {
    logDbFailure({ scope: 'Referidos', reason: 'expire_error', error, context: { tenant_id: tenantId } })
  }
}

// ═══════════════════════════════════════════════════════════════
// Quien invita: sus invitados
// ═══════════════════════════════════════════════════════════════

export interface InvitadoVisible {
  /** Solo el primer nombre del amigo. */
  nombre: string
  estado: EstadoDeReferido
  etiqueta: string
  registrado: string
  /** ¿Ganó quien invita con este amigo? `false` en un «vino» = tope del mes o la marca sin premio. */
  gano: boolean
}

/** Los invitados de un cliente, los más nuevos primero (hasta 50). Lanza si la base falla. */
export async function invitadosDe(referrerCustomerId: string, tenantId: string): Promise<InvitadoVisible[]> {
  await vencerPendientes(tenantId, referrerCustomerId)
  const db = getServiceClient()
  const { data, error } = await db
    .from('referrals')
    .select('referred_customer_id, status, referrer_rewarded, created_at, expires_at')
    .eq('tenant_id', tenantId)
    .eq('referrer_customer_id', referrerCustomerId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    logDbFailure({ scope: 'Referidos', reason: 'invitees_error', error, context: { tenant_id: tenantId } })
    throw new ReferidosDbError(`No se pudieron leer los invitados: ${error.message}`)
  }
  const filas = (data ?? []) as Array<{
    referred_customer_id: string
    status: EstadoDeReferido
    referrer_rewarded: boolean
    created_at: string
    expires_at: string
  }>
  if (filas.length === 0) return []

  const { data: clientes, error: errNombres } = await db
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', filas.map((f) => f.referred_customer_id))
  if (errNombres) {
    logDbFailure({ scope: 'Referidos', reason: 'invitee_names_error', error: errNombres, context: { tenant_id: tenantId } })
    throw new ReferidosDbError(`No se pudieron leer los invitados: ${errNombres.message}`)
  }
  const nombres = new Map((clientes ?? []).map((c) => [c.id as string, c.name as string | null]))

  return filas.map((f) => {
    const estado = estadoVisible(f)
    return {
      nombre: primerNombre(nombres.get(f.referred_customer_id)),
      estado,
      etiqueta: ETIQUETA_DEL_ESTADO[estado],
      registrado: f.created_at,
      gano: f.referrer_rewarded,
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// El panel: los números (conteos, nunca pesos)
// ═══════════════════════════════════════════════════════════════

export interface NumerosDeReferidos {
  /** Amigos que se registraron con un enlace. */
  registrados: number
  /** Los que vinieron (el mesero validó su primera visita). */
  vinieron: number
  pendientes: number
  vencidos: number
  /** Premios que ganó quien invita (los del tope no cuentan). */
  premiosGanados: number
  /** De esos, los que el mesero ya entregó (solo los del catálogo: los puntos se suman solos). */
  premiosEntregados: number
  /** Regalos de bienvenida del amigo entregados por el mesero. */
  regalosEntregados: number
  /** Los que más traen: nombre y cuántos vinieron (y se registraron). Hasta 10. */
  top: Array<{ nombre: string; vinieron: number; registrados: number }>
}

/** Los números del programa en la marca. Lanza si la base falla: el panel lo convierte en 500. */
export async function numerosDeReferidos(tenantId: string): Promise<NumerosDeReferidos> {
  await vencerPendientes(tenantId)
  const db = getServiceClient()

  const referidos = await leerTodo<{
    id: string
    referrer_customer_id: string
    referred_customer_id: string
    status: EstadoDeReferido
    referrer_rewarded: boolean
    expires_at: string
  }>((desde, hasta) =>
    db
      .from('referrals')
      .select('id, referrer_customer_id, referred_customer_id, status, referrer_rewarded, expires_at')
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(desde, hasta)
  )
  if (referidos.error) {
    logDbFailure({ scope: 'Referidos', reason: 'stats_referrals_error', error: referidos.error, context: { tenant_id: tenantId } })
    throw new ReferidosDbError(`No se pudieron leer los referidos: ${referidos.error.message}`)
  }

  const premios = await leerTodo<{ id: string; customer_id: string; referral_id: string | null; status: string }>((desde, hasta) =>
    db
      .from('reward_grants')
      .select('id, customer_id, referral_id, status')
      .eq('tenant_id', tenantId)
      .eq('source', 'referral')
      .order('id', { ascending: true })
      .range(desde, hasta)
  )
  if (premios.error) {
    logDbFailure({ scope: 'Referidos', reason: 'stats_grants_error', error: premios.error, context: { tenant_id: tenantId } })
    throw new ReferidosDbError(`No se pudieron leer los premios de referidos: ${premios.error.message}`)
  }

  const porId = new Map(referidos.data.map((r) => [r.id, r]))
  const n: NumerosDeReferidos = {
    registrados: referidos.data.length,
    vinieron: 0,
    pendientes: 0,
    vencidos: 0,
    premiosGanados: 0,
    premiosEntregados: 0,
    regalosEntregados: 0,
    top: [],
  }
  const porReferidor = new Map<string, { vinieron: number; registrados: number }>()
  for (const r of referidos.data) {
    const e = estadoVisible(r)
    if (e === 'completed') n.vinieron++
    else if (e === 'expired') n.vencidos++
    else n.pendientes++
    if (r.referrer_rewarded) n.premiosGanados++
    const t = porReferidor.get(r.referrer_customer_id) ?? { vinieron: 0, registrados: 0 }
    t.registrados++
    if (e === 'completed') t.vinieron++
    porReferidor.set(r.referrer_customer_id, t)
  }
  for (const g of premios.data) {
    if (g.status !== 'redeemed' || !g.referral_id) continue
    const r = porId.get(g.referral_id)
    if (!r) continue
    if (g.customer_id === r.referrer_customer_id) n.premiosEntregados++
    else if (g.customer_id === r.referred_customer_id) n.regalosEntregados++
  }

  const top = [...porReferidor.entries()]
    .filter(([, t]) => t.vinieron > 0 || t.registrados > 0)
    .sort((a, b) => b[1].vinieron - a[1].vinieron || b[1].registrados - a[1].registrados)
    .slice(0, 10)
  if (top.length > 0) {
    const { data: clientes, error } = await db
      .from('customers')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', top.map(([id]) => id))
    if (error) {
      logDbFailure({ scope: 'Referidos', reason: 'stats_names_error', error, context: { tenant_id: tenantId } })
      throw new ReferidosDbError(`No se pudieron leer los nombres: ${error.message}`)
    }
    const nombres = new Map((clientes ?? []).map((c) => [c.id as string, (c.name as string | null) ?? 'Cliente']))
    n.top = top.map(([id, t]) => ({ nombre: nombres.get(id) ?? 'Cliente', ...t }))
  }
  return n
}
