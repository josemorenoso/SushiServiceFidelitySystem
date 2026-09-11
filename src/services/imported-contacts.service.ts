/**
 * Imported Contacts Service — Golden Bullet.
 *
 * Importación masiva de contactos externos (CSV) para campañas de UN solo
 * disparo. Estos contactos NO son clientes y NO han dado consentimiento de
 * marketing: reciben UN único mensaje. Si vuelven y se registran, se convierten
 * en customers (trazabilidad vía customers.imported_contact_id).
 *
 * Reglas anti-reenvío: un teléfono que ya existe en imported_contacts NUNCA
 * se vuelve a contactar (evita bloqueos de Twilio/Meta).
 *
 * Ref: docs/features/golden-bullet.md
 */

import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { logDbFailure } from '@/lib/db-failure'
import { enqueueSendBatch } from '@/services/send-queue.service'
import { getLineBudget } from '@/services/line-budget.service'
import { getSettingValue } from '@/services/settings.service'
import { canSendBulk } from '@/services/wallet.service'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

// Tarifa por defecto (Meta + Twilio). Configurable en admin_settings.
const DEFAULT_COST_PER_MESSAGE_USD = 0.0175
const USD_TO_COP = 4200

/** Tarifa de mensajería leída de admin_settings (fallback a la constante). */
export async function getCostPerMessageUsd(tenantId: string): Promise<number> {
  const raw = await getSettingValue('twilio_cost_per_message_usd', tenantId)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_COST_PER_MESSAGE_USD
}

/**
 * Normaliza a 10 dígitos colombianos (quita +57, 0057, espacios, etc.).
 *
 * Mira el número ENTERO, no los últimos diez dígitos. La versión anterior
 * hacía `digits.slice(-10)` y con eso un móvil francés (+33 6…), italiano
 * (+39 3…) o español (+34 6…) cuyos últimos diez dígitos empiezan por 3 pasaba
 * como colombiano: la campaña le escribía a otro país, pagando la tarifa
 * internacional y sin que el CSV lo delatara. Un móvil colombiano es
 * exactamente `3` + 9 dígitos, solo o detrás del indicativo 57.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0057')) digits = digits.slice(4)
  else if (digits.startsWith('57') && digits.length === 12) digits = digits.slice(2)
  return /^3\d{9}$/.test(digits) ? digits : null
}

// ─── CSV parsing ────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue }
    if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += char
  }
  result.push(current.trim())
  return result
}

export interface ParsedContact {
  phone: string
  name: string | null
  email: string | null
}

export type InvalidReason = 'formato_invalido' | 'no_es_movil_colombiano' | 'duplicado' | 'ya_contactado'

export interface CSVValidationResult {
  batch_id: string
  source_file: string
  total_rows: number
  valid: number
  invalid: number
  invalid_reasons: Record<string, number>
  preview: { phone: string; name: string; status: 'valid' | 'invalid'; reason?: string }[]
  /** Contactos válidos y NO contactados previamente — el cliente los reenvía en /confirm */
  valid_contacts: ParsedContact[]
  already_contacted: number
  estimated_cost_usd: number
  estimated_cost_cop: number
  twilio_cost_per_message: number
}

/**
 * Parsea y valida un CSV. NO inserta nada en la DB.
 * Detecta formato inválido, no-móviles colombianos, duplicados internos y
 * números ya contactados previamente (excluidos para evitar bloqueos).
 */
export async function validateCSV(fileText: string, fileName: string, tenantId: string): Promise<CSVValidationResult> {
  const costPerMsg = await getCostPerMessageUsd(tenantId)
  const lines = fileText.split('\n').filter((l) => l.trim())

  const result: CSVValidationResult = {
    batch_id: randomUUID(),
    source_file: fileName,
    total_rows: 0,
    valid: 0,
    invalid: 0,
    invalid_reasons: {},
    preview: [],
    valid_contacts: [],
    already_contacted: 0,
    estimated_cost_usd: 0,
    estimated_cost_cop: 0,
    twilio_cost_per_message: costPerMsg,
  }

  if (lines.length < 2) return result

  const headers = parseCSVLine(lines[0].toLowerCase())
  const phoneIdx = headers.findIndex((h) => h.includes('telefono') || h.includes('phone') || h.includes('celular'))
  const nameIdx = headers.findIndex((h) => h.includes('nombre') || h.includes('name'))
  const emailIdx = headers.findIndex((h) => h.includes('email') || h.includes('correo'))

  if (phoneIdx === -1) {
    result.invalid_reasons['sin_columna_telefono'] = 1
    return result
  }

  const addInvalid = (reason: InvalidReason) => {
    result.invalid++
    result.invalid_reasons[reason] = (result.invalid_reasons[reason] ?? 0) + 1
  }

  const seen = new Set<string>()
  const candidates: ParsedContact[] = []

  for (let i = 1; i < lines.length; i++) {
    result.total_rows++
    const cols = parseCSVLine(lines[i])
    const rawPhone = cols[phoneIdx] ?? ''
    const name = (nameIdx !== -1 ? cols[nameIdx] : '')?.trim() || null
    const email = (emailIdx !== -1 ? cols[emailIdx] : '')?.trim() || null

    const previewName = name ?? ''
    const digits = rawPhone.replace(/\D/g, '')

    if (!digits) {
      addInvalid('formato_invalido')
      if (result.preview.length < 10) result.preview.push({ phone: rawPhone, name: previewName, status: 'invalid', reason: 'formato_invalido' })
      continue
    }

    const normalized = normalizePhone(rawPhone)
    if (!normalized) {
      addInvalid('no_es_movil_colombiano')
      if (result.preview.length < 10) result.preview.push({ phone: rawPhone, name: previewName, status: 'invalid', reason: 'no_es_movil_colombiano' })
      continue
    }

    if (seen.has(normalized)) {
      addInvalid('duplicado')
      if (result.preview.length < 10) result.preview.push({ phone: normalized, name: previewName, status: 'invalid', reason: 'duplicado' })
      continue
    }

    seen.add(normalized)
    candidates.push({ phone: normalized, name, email })
  }

  // Excluir números ya contactados previamente (regla anti-reenvío).
  const existing = await getExistingPhones([...seen], tenantId)
  for (const c of candidates) {
    if (existing.has(c.phone)) {
      result.already_contacted++
      addInvalid('ya_contactado')
      if (result.preview.length < 10) result.preview.push({ phone: c.phone, name: c.name ?? '', status: 'invalid', reason: 'ya_contactado' })
      continue
    }
    result.valid++
    result.valid_contacts.push(c)
    if (result.preview.length < 10) result.preview.push({ phone: c.phone, name: c.name ?? '', status: 'valid' })
  }

  result.estimated_cost_usd = Math.round(result.valid * costPerMsg * 100) / 100
  result.estimated_cost_cop = Math.round(result.valid * costPerMsg * USD_TO_COP)

  return result
}

/**
 * Devuelve el subconjunto de teléfonos que ya existen en imported_contacts.
 *
 * Esta es LA regla anti-reenvío del archivo (ver el comentario de cabecera): un
 * teléfono que ya está aquí NUNCA se vuelve a contactar. `confirmImport()` la usa
 * ANTES de mandar el Golden Bullet — un fallo de base en un chunk devolvía menos
 * teléfonos de los que en realidad existen, y los que se "perdían" del Set volvían
 * a recibir el mensaje. Eso no es solo spam: reenviar a quien ya se le envió es
 * justo el patrón que Twilio/Meta penaliza en la calidad de la línea. Se LANZA en
 * vez de devolver un Set incompleto en silencio.
 */
export async function getExistingPhones(phones: string[], tenantId: string): Promise<Set<string>> {
  if (phones.length === 0) return new Set()
  const supabase = getServiceClient()
  const found = new Set<string>()
  // Consultar en chunks para no exceder límites de la query .in()
  for (let i = 0; i < phones.length; i += 500) {
    const chunk = phones.slice(i, i + 500)
    const { data, error } = await supabase.from('imported_contacts').select('phone').eq('tenant_id', tenantId).in('phone', chunk)
    if (error) {
      logDbFailure({
        scope: 'GoldenBullet',
        reason: 'existing_phones_lookup_error',
        error,
        context: { tenant_id: tenantId, chunk_start: i, chunk_size: chunk.length },
      })
      throw new Error(`No se pudo verificar teléfonos ya contactados: ${error.message}`)
    }
    for (const row of data ?? []) found.add(row.phone)
  }
  return found
}

// ─── El divisor de bloques (D-7) ────────────────────────────────

/**
 * Una base grande no se despierta en un día, y el techo no lo pone este
 * sistema: lo pone Meta. Esta función traduce "tengo 25.000 contactos" a
 * "salen N por día durante D días y termina el <fecha>", que es lo que el dueño
 * tiene que ver ANTES de decir que sí — y lo que ventas tiene que saber para no
 * prometer resultados el mismo día.
 *
 * Ref: REQUERIMIENTOS_AGOSTO_2026.md §20 / D-7.
 *
 * Es PURA a propósito: la aritmética de "cuántos días son" es justo lo que hay
 * que poder probar sin base de datos ni proveedor.
 */
export interface BlockPlan {
  totalContacts: number
  /** Lo que pidió el operador. */
  requestedBlockSize: number
  /** Lo que de verdad va a salir por día: `LEAST(pedido, presupuesto)`. */
  blockSize: number
  /** Techo de la línea. `null` = no se conoce el límite de Meta todavía. */
  campaignBudget: number | null
  /** true = el bloque se recortó contra el cupo real. */
  cappedByBudget: boolean
  days: number
  /** ISO. Cuándo sale el primer bloque (ya). */
  startsAt: string
  /** ISO. Cuándo sale el ÚLTIMO bloque, si la calidad aguanta verde. */
  endsAt: string
}

export function planBlocks(
  totalContacts: number,
  requestedBlockSize: number,
  campaignBudget: number | null,
  now: Date = new Date()
): BlockPlan {
  const total = Math.max(0, Math.floor(totalContacts))
  const pedido = Math.max(1, Math.floor(requestedBlockSize))

  // `campaignBudget` null significa "no sabemos el límite de esta línea".
  // Entonces NO hay con qué acotar y el tamaño que eligió el operador es el
  // único freno que existe. La pantalla tiene que decirlo con todas las letras;
  // encenderle un tope inventado le cortaría campañas a quien sí tenía cupo.
  const tope = campaignBudget !== null && campaignBudget > 0 ? campaignBudget : null
  const blockSize = tope !== null ? Math.min(pedido, tope) : pedido

  const days = total === 0 ? 0 : Math.ceil(total / blockSize)

  const startsAt = new Date(now)
  const endsAt = new Date(now)
  // El bloque 0 sale hoy, así que el último sale D-1 días después.
  endsAt.setDate(endsAt.getDate() + Math.max(0, days - 1))

  return {
    totalContacts: total,
    requestedBlockSize: pedido,
    blockSize,
    campaignBudget: tope,
    cappedByBudget: tope !== null && pedido > tope,
    days,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  }
}

/**
 * Cuánto vive un item de Golden Bullet en la cola antes de rendirse.
 *
 * DECISIÓN (2026-09-10, de la sesión que construyó esto — conviene revisarla):
 * 30 días desde el día que le tocaba. Sin vencimiento, una base encolada podría
 * gotear durante un año si la línea se congela; con un vencimiento corto, una
 * semana de línea congelada evaporaría la base entera en silencio. 30 días es
 * el punto donde un mensaje ya no tiene sentido (la promo que anuncia venció)
 * pero un incidente normal de calidad no borra el trabajo.
 */
const IMPORT_TTL_DIAS = 30

// ─── Confirmar e importar (envío) ───────────────────────────────

export interface ConfirmImportParams {
  batchId: string
  sourceFile: string
  templateSid: string
  /** Texto de la promo que va en {{2}} de la plantilla. Vacío si la plantilla no la usa. */
  promoText: string
  /** Nombre genérico para {{1}} cuando el contacto no trae nombre */
  fallbackName?: string
  contacts: ParsedContact[]
  tenant: Tenant
  /**
   * Cuántos mensajes por día. LO ELIGE EL OPERADOR (D-7), no el sistema — el
   * sistema solo lo acota al cupo real de la línea.
   */
  blockSize: number
  /**
   * El texto EXACTO de la advertencia que la persona aceptó al confirmar.
   * Se guarda literal, no un booleano: las advertencias cambian de redacción y
   * lo que hay que poder demostrar es qué decía la que esta persona leyó.
   */
  consentText?: string
  /** Quién aceptó la advertencia. */
  acceptedByEmail?: string
  /**
   * Cuántos contactos entran en ESTA tanda (los primeros N del archivo, en su
   * orden). El resto no se inserta ni se encola: vuelve a subirse el mismo CSV
   * cuando se quiera seguir, y la regla anti-reenvío deja pasar solo a los que
   * todavía no se programaron. Existe porque la billetera cobra la base entera
   * por adelantado (W-D6) y el dueño quiere pagar de a tandas (2026-09-11).
   */
  maxContacts?: number
}

export interface ConfirmImportResult {
  /** Contactos válidos que quedaron fuera de esta tanda por el tope. Se mandan subiendo el mismo CSV otra vez. */
  left_out?: number
  campaign_id: string
  /** Contactos escritos en `imported_contacts`. */
  inserted: number
  /**
   * Items que entraron de verdad en `send_queue`.
   *
   * OJO: NO es "enviados". Desde 2026-09-10 Golden Bullet NO envía dentro del
   * request — encola y el drenador va sacando bloque por bloque. Antes sí
   * enviaba en el mismo request, y con 25.000 contactos eso reventaba: a diez
   * en paralelo son unos veinte minutos contra un `maxDuration` de 300s, así
   * que la función moría a los cinco dejando miles de contactos a medias y la
   * campaña sin cerrar.
   */
  queued: number
  blocked_auto: number
  /** Costo del plan COMPLETO, no de lo que sale hoy. */
  total_cost_usd: number
  /** El reparto en bloques. `null` si no se llegó a planificar nada. */
  plan: BlockPlan | null
  /** Presente si se abortó por saldo insuficiente (spec W-D6). Nada se encoló. */
  insufficient_balance?: {
    balanceCop: number
    pricePerMessage: number
    messagesAvailable: number
    recipients: number
    shortfallCop: number
  }
  /**
   * Presente si la puerta de calidad lo frenó (spec §3.4.1). Nada se encoló.
   * No es un error: es el sistema negándose a echarle una base fría encima a
   * una línea que Meta ya tiene marcada.
   */
  blocked_by_quality?: {
    lineStatus: string
    qualityRating: string
  }
}

export async function confirmImport(params: ConfirmImportParams): Promise<ConfirmImportResult> {
  const supabase = getServiceClient()
  const tenantId = params.tenant.id
  const costPerMsg = await getCostPerMessageUsd(tenantId)
  const fallbackName = params.fallbackName?.trim() || 'cliente'

  // Re-filtrar contra DB por seguridad (carrera entre dos importaciones).
  const phones = params.contacts.map((c) => c.phone)
  const existing = await getExistingPhones(phones, tenantId)
  const sinRepetidos = params.contacts.filter((c) => !existing.has(c.phone))
  const blockedAuto = params.contacts.length - sinRepetidos.length

  // La tanda: los primeros N que quedaron, en el orden del archivo. Los que
  // quedan fuera NO son bloqueados: son los de la próxima subida.
  const tope = Number.isInteger(params.maxContacts) && (params.maxContacts as number) > 0 ? (params.maxContacts as number) : null
  const leftOut = tope !== null && sinRepetidos.length > tope ? sinRepetidos.length - tope : 0
  const toImport = leftOut > 0 ? sinRepetidos.slice(0, tope as number) : sinRepetidos

  // ─── Puerta de calidad (spec §3.4.1, conservada por D-7) ───
  // Golden Bullet es la ÚNICA clase que le escribe a gente que no dio
  // consentimiento, y por eso es la primera sospechosa de una caída de
  // calidad. Si la línea ya está tocada, no se le suma una base fría encima.
  //
  // D-7 eliminó la puerta del escalón (`messaging_daily_limit > 250`): a 250
  // también se puede, más lento. La de CALIDAD se conserva sin cambios.
  const presupuesto = await getLineBudget(tenantId)
  if (
    presupuesto.lineStatus !== 'active' ||
    presupuesto.qualityRating === 'yellow' ||
    presupuesto.qualityRating === 'red'
  ) {
    return {
      campaign_id: '',
      inserted: 0,
      queued: 0,
      blocked_auto: blockedAuto,
      total_cost_usd: 0,
      plan: null,
      blocked_by_quality: {
        lineStatus: presupuesto.lineStatus,
        qualityRating: presupuesto.qualityRating,
      },
    }
  }

  // ─── Bloqueo por saldo (spec W-D6) ───
  // Se cobra por la base ENTERA por adelantado, aunque salga goteando durante
  // meses. Es el comportamiento que ya existía y no se cambia acá: cambiarlo es
  // una decisión comercial, no un detalle de implementación.
  if (toImport.length > 0) {
    const budget = await canSendBulk(tenantId, toImport.length)
    if (!budget.ok) {
      return {
        campaign_id: '',
        inserted: 0,
        queued: 0,
        blocked_auto: blockedAuto,
        total_cost_usd: 0,
        plan: null,
        insufficient_balance: {
          balanceCop: budget.balanceCop,
          pricePerMessage: budget.pricePerMessage,
          messagesAvailable: budget.messagesAvailable,
          recipients: toImport.length,
          shortfallCop: budget.shortfallCop,
        },
      }
    }
  }

  // ─── El plan de bloques ───
  const plan = planBlocks(toImport.length, params.blockSize, presupuesto.campaignBudget)

  // 1. Crear campaña (source 'manual' — 'imported' no está en el CHECK de campaigns.source)
  //
  // La campaña nace 'running' y se queda así mientras la cola gotee. La cierra
  // `cerrarCampanasTerminadas()` del drenador cuando no le quedan items:
  // marcarla 'completed' hoy, con 25.000 pendientes, le mentiría al operador.
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      name: `Golden Bullet — ${params.sourceFile}`,
      type: 'manual',
      source: 'manual',
      status: 'running',
      // NOT NULL en la tabla. Si la plantilla no usa {{2}}, queda el SID.
      message_template: params.promoText || `plantilla ${params.templateSid}`,
      filters: {
        golden_bullet: true,
        source_file: params.sourceFile,
        batch_id: params.batchId,
        plan,
        // La advertencia aceptada vive ACÁ y no en `consent_events`.
        //
        // El spec §3.4.1 pedía guardarla en `consent_events` con channel
        // 'import'. No se hace, y la razón importa: `consent_events` es el
        // libro de evidencia de que UNA PERSONA consintió, y estas personas NO
        // consintieron — de eso trata todo el régimen especial de Golden
        // Bullet. Escribir 25.000 filas 'opt_in' porque el OPERADOR marcó una
        // casilla fabricaría exactamente la evidencia que el libro existe para
        // poder demostrar. Lo que sí es cierto, y queda escrito, es que una
        // persona identificada aceptó el riesgo tal día.
        //
        // `consent_events` sí recibe un opt_in REAL cuando alguien toca el
        // botón «quiero ser parte» de la plantilla.
        consent_warning: {
          text: params.consentText ?? null,
          accepted_by: params.acceptedByEmail ?? null,
          accepted_at: new Date().toISOString(),
        },
      },
      executed_at: new Date().toISOString(),
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (campaignError || !campaign) {
    throw new Error(`Error creando campaña: ${campaignError?.message}`)
  }

  // 2. Insertar los contactos como 'queued': están en la cola, todavía sin salir.
  //    Se piden de vuelta `id` y `phone` porque el item de la cola guarda
  //    `imported_contact_id`, que es lo que después deja marcar el contacto
  //    cuando el drenador lo envía de verdad.
  let inserted = 0
  const idPorTelefono = new Map<string, string>()

  if (toImport.length > 0) {
    const rows = toImport.map((c) => ({
      phone: c.phone,
      name: c.name,
      email: c.email,
      source_file: params.sourceFile,
      source_batch: params.batchId,
      status: 'queued' as const,
      campaign_id: campaign.id,
      tenant_id: tenantId,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { data, error } = await supabase.from('imported_contacts').insert(chunk).select('id, phone')
      if (error) {
        logDbFailure({
          scope: 'GoldenBullet',
          reason: 'insert_contacts_error',
          error,
          context: { tenant_id: tenantId, batch_id: params.batchId, chunk_start: i },
        })
        continue
      }
      for (const row of data ?? []) idPorTelefono.set(row.phone as string, row.id as string)
      inserted += data?.length ?? 0
    }
  }

  // 3. Encolar, repartido en bloques.
  //
  // EL TRUCO, Y POR QUÉ ES ASÍ: los bloques NO se implementan con un contador
  // ni con estado nuevo, sino escalonando `not_before` — el bloque k no se
  // puede intentar antes del día k. El drenador YA ordena por `not_before` y ya
  // respeta el presupuesto de la línea en cada vuelta, así que el divisor de
  // bloques no le cambia una sola línea de código al drenador, y de paso queda
  // visible y auditable: se puede mirar la cola y ver qué día le toca a cada uno.
  //
  // Golden Bullet es P4, la prioridad más baja, así que siempre cede el turno a
  // las campañas de clientes que SÍ consintieron.
  const items = toImport
    .map((c, indice) => {
      const idContacto = idPorTelefono.get(c.phone)
      if (!idContacto) return null // no se pudo insertar: no se encola

      const bloque = Math.floor(indice / plan.blockSize)
      const notBefore = new Date(plan.startsAt)
      notBefore.setDate(notBefore.getDate() + bloque)

      const expiresAt = new Date(notBefore)
      expiresAt.setDate(expiresAt.getDate() + IMPORT_TTL_DIAS)

      return {
        tenantId,
        phone: c.phone,
        customerId: null,
        importedContactId: idContacto,
        campaignId: campaign.id as string,
        // 'import' y no 'manual': es lo que lo hace P4 y lo que permite frenarlo
        // aparte del resto de las campañas (spec §3.3).
        messageType: 'import',
        templateSid: params.templateSid,
        // `{{2}}` solo viaja si hay promo: mandar una variable que la
        // plantilla no declara es tan rechazable como que falte una.
        variables: (params.promoText
          ? { '1': c.name || fallbackName, '2': params.promoText }
          : { '1': c.name || fallbackName }) as Record<string, string>,
        notBefore,
        expiresAt,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const { enqueued } = await enqueueSendBatch(items)

  return {
    campaign_id: campaign.id,
    inserted,
    queued: enqueued,
    blocked_auto: blockedAuto,
    left_out: leftOut,
    // El costo es del plan COMPLETO, no de lo que sale hoy: es la plata que esta
    // importación va a gastar de acá a que termine.
    total_cost_usd: Math.round(enqueued * costPerMsg * 100) / 100,
    plan,
  }
}

// ─── Control diario: mirar y parar ──────────────────────────────

/**
 * La fecha con la que se "aparca" un envío pausado.
 *
 * POR QUÉ UNA FECHA IMPOSIBLE Y NO UN ESTADO `paused`
 * ───────────────────────────────────────────────────
 * Tentador: agregarle 'paused' al CHECK de `send_queue.status`. Sería un error,
 * y uno caro. El anti-duplicado de la 00038 es un índice único PARCIAL
 * `WHERE status = 'queued'`: en cuanto un item sale de 'queued' **libera su
 * hueco**, así que una campaña pausada se podría volver a encolar entera y esa
 * gente recibiría el mensaje dos veces. Pausar no puede abrir esa puerta.
 *
 * Con `not_before` en el año 9999 el item sigue siendo 'queued' —el índice
 * sigue protegiendo— y el drenador ni lo mira, porque `claim_send_queue()`
 * filtra `not_before <= now()`. Cero cambios en el drenador, cero estados
 * nuevos, cero migración. Es el mismo mecanismo con el que están hechos los
 * bloques.
 */
const PAUSA_SENTINELA = '9999-12-31T00:00:00.000Z'

export interface BatchProgress {
  batchId: string
  campaignId: string | null
  sourceFile: string
  /** Contactos de este lote que ya recibieron el mensaje. */
  sent: number
  /** Los que salieron HOY. Es el número que contesta "¿cuánto cupo me comí?". */
  sentToday: number
  /** Todavía en la cola. */
  queued: number
  /** El proveedor los rechazó tres veces. */
  bounced: number
  /** Pidieron salir por el botón. */
  optedOut: number
  /** Volvieron y se registraron. */
  converted: number
  total: number
  paused: boolean
  /** Cuándo sale el próximo bloque. `null` si no queda nada o está pausado. */
  nextBlockAt: string | null
  /** Cuántos salen en ese próximo bloque. */
  nextBlockSize: number
  /** Fecha estimada del último bloque, al ritmo actual. */
  estimatedEndAt: string | null
  blockSize: number | null
}

/**
 * La foto de un lote HOY.
 *
 * Existe porque un goteo de semanas sin tablero es un goteo a ciegas: el dueño
 * pidió "ir viendo a diario qué mensajes enviamos y poder detenerlo". Sin esto,
 * la única forma de saber qué pasó ayer es contar filas a mano.
 */
export async function getBatchProgress(
  batchId: string,
  tenantId: string
): Promise<BatchProgress | null> {
  const supabase = getServiceClient()

  const { data: contactos, error } = await supabase
    .from('imported_contacts')
    .select('status, message_sent_at, source_file, campaign_id')
    .eq('source_batch', batchId)
    .eq('tenant_id', tenantId)

  if (error) {
    logDbFailure({
      scope: 'GoldenBullet',
      reason: 'progress_lookup_error',
      error,
      context: { batch_id: batchId, tenant_id: tenantId },
    })
    throw new Error(`No se pudo leer el avance del lote: ${error.message}`)
  }
  if (!contactos || contactos.length === 0) return null

  const inicioDeHoy = new Date()
  inicioDeHoy.setHours(0, 0, 0, 0)

  let sent = 0
  let sentToday = 0
  let bounced = 0
  let optedOut = 0
  let converted = 0

  for (const c of contactos) {
    const st = c.status as string
    if (st === 'sent' || st === 'delivered' || st === 'converted') {
      sent++
      if (c.message_sent_at && new Date(c.message_sent_at as string) >= inicioDeHoy) sentToday++
    }
    if (st === 'bounced') bounced++
    if (st === 'opted_out') optedOut++
    if (st === 'converted') converted++
  }

  const campaignId = (contactos[0].campaign_id as string | null) ?? null

  // El plan y la pausa viven en la campaña; la cola viva, en send_queue.
  let blockSize: number | null = null
  if (campaignId) {
    const { data: campana } = await supabase
      .from('campaigns')
      .select('filters')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const filtros = (campana?.filters ?? {}) as { plan?: { blockSize?: number } }
    blockSize = filtros.plan?.blockSize ?? null
  }

  const { data: enCola } = await supabase
    .from('send_queue')
    .select('not_before')
    .eq('tenant_id', tenantId)
    .eq('campaign_id', campaignId ?? '')
    .eq('status', 'queued')
    .order('not_before', { ascending: true })

  const filas = enCola ?? []
  const queued = filas.length
  const paused = queued > 0 && filas.every((f) => new Date(f.not_before as string).getFullYear() >= 9999)

  let nextBlockAt: string | null = null
  let nextBlockSize = 0
  let estimatedEndAt: string | null = null

  if (queued > 0 && !paused) {
    nextBlockAt = filas[0].not_before as string
    // El "próximo bloque" son los que comparten el mismo not_before que el
    // primero: así el número que se muestra es el que de verdad va a salir,
    // no el tamaño teórico del plan.
    nextBlockSize = filas.filter((f) => f.not_before === filas[0].not_before).length
    estimatedEndAt = filas[filas.length - 1].not_before as string
  }

  return {
    batchId,
    campaignId,
    sourceFile: (contactos[0].source_file as string) ?? '',
    sent,
    sentToday,
    queued,
    bounced,
    optedOut,
    converted,
    total: contactos.length,
    paused,
    nextBlockAt,
    nextBlockSize,
    estimatedEndAt,
    blockSize,
  }
}

/**
 * Los lotes que TODAVÍA están goteando.
 *
 * Es la lista que abre el tablero diario: normalmente son cero o uno, así que
 * llamar a `getBatchProgress()` por cada uno no es caro. Si algún día son
 * muchos, esto es lo que hay que convertir en una sola consulta agregada.
 */
export async function getActiveBatches(tenantId: string): Promise<BatchProgress[]> {
  const supabase = getServiceClient()

  // Los batches con cola viva salen de `send_queue`, no de `imported_contacts`:
  // la cola es la que sabe qué falta por salir.
  const { data: enCola, error } = await supabase
    .from('send_queue')
    .select('campaign_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'queued')
    .eq('message_type', 'import')
    .not('campaign_id', 'is', null)

  if (error) {
    logDbFailure({
      scope: 'GoldenBullet',
      reason: 'active_batches_error',
      error,
      context: { tenant_id: tenantId },
    })
    return []
  }

  const campanas = [...new Set((enCola ?? []).map((r) => r.campaign_id as string))]
  if (campanas.length === 0) return []

  const { data: contactos } = await supabase
    .from('imported_contacts')
    .select('source_batch, campaign_id')
    .eq('tenant_id', tenantId)
    .in('campaign_id', campanas)

  const batches = [...new Set((contactos ?? []).map((c) => c.source_batch as string))]

  const progresos: BatchProgress[] = []
  for (const batchId of batches) {
    const p = await getBatchProgress(batchId, tenantId)
    if (p) progresos.push(p)
  }
  return progresos
}

export interface PauseResult {
  affected: number
  paused: boolean
}

/**
 * Frena en seco lo que queda por salir de un lote.
 *
 * NO cancela nada y NO pierde nada: los items siguen 'queued' y vuelven a la
 * vida con `resumeBatch()`. Lo ÚNICO que se pierde es el calendario original —
 * al reanudar se reprograma desde hoy, que es lo que uno quiere de todos modos
 * después de haber parado unos días.
 *
 * Lo que YA salió no se puede deshacer: un mensaje entregado es un mensaje
 * entregado. Esto para el resto.
 */
export async function pauseBatch(campaignId: string, tenantId: string): Promise<PauseResult> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('send_queue')
    .update({ not_before: PAUSA_SENTINELA })
    .eq('campaign_id', campaignId)
    .eq('tenant_id', tenantId)
    .eq('status', 'queued')
    .select('id')

  if (error) {
    logDbFailure({
      scope: 'GoldenBullet',
      reason: 'pause_error',
      error,
      context: { campaign_id: campaignId, tenant_id: tenantId },
    })
    throw new Error(`No se pudo pausar el envío: ${error.message}`)
  }

  const affected = data?.length ?? 0
  console.warn(`[GoldenBullet] Lote pausado: ${affected} items de la campaña ${campaignId}`)
  return { affected, paused: true }
}

/**
 * Reanuda un lote pausado, reprogramándolo DESDE HOY al ritmo que se le indique.
 *
 * Se reprograma en vez de restaurar las fechas viejas a propósito: si estuvo
 * una semana parado, las fechas originales ya pasaron y todo saldría de golpe
 * el mismo día — que es exactamente lo que los bloques existen para evitar.
 *
 * Es también la puerta para CAMBIAR el ritmo: se puede reanudar con un bloque
 * más chico si el primero resultó muy agresivo, sin volver a subir el CSV.
 */
export async function resumeBatch(
  campaignId: string,
  tenantId: string,
  blockSize: number
): Promise<PauseResult> {
  const supabase = getServiceClient()
  const tam = Math.max(1, Math.floor(blockSize))

  const { data: filas, error } = await supabase
    .from('send_queue')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('tenant_id', tenantId)
    .eq('status', 'queued')
    .order('enqueued_at', { ascending: true })

  if (error) {
    logDbFailure({
      scope: 'GoldenBullet',
      reason: 'resume_lookup_error',
      error,
      context: { campaign_id: campaignId, tenant_id: tenantId },
    })
    throw new Error(`No se pudo leer la cola para reanudar: ${error.message}`)
  }

  const pendientes = filas ?? []
  if (pendientes.length === 0) return { affected: 0, paused: false }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  // Se agrupa por día y se actualiza un día por viaje, en vez de una fila por
  // viaje: reanudar 15.000 items son ~15 UPDATE, no 15.000.
  const porDia = new Map<number, string[]>()
  pendientes.forEach((fila, indice) => {
    const dia = Math.floor(indice / tam)
    const lista = porDia.get(dia)
    if (lista) lista.push(fila.id as string)
    else porDia.set(dia, [fila.id as string])
  })

  let affected = 0
  for (const [dia, ids] of porDia) {
    const cuando = new Date(hoy)
    cuando.setDate(cuando.getDate() + dia)
    // En trozos: un `.in()` con 15.000 ids no pasa por PostgREST.
    for (let i = 0; i < ids.length; i += 500) {
      const { data: upd, error: errUpd } = await supabase
        .from('send_queue')
        .update({ not_before: cuando.toISOString() })
        .in('id', ids.slice(i, i + 500))
        .select('id')
      if (errUpd) {
        logDbFailure({
          scope: 'GoldenBullet',
          reason: 'resume_update_error',
          error: errUpd,
          context: { campaign_id: campaignId, dia },
        })
        continue
      }
      affected += upd?.length ?? 0
    }
  }

  console.warn(`[GoldenBullet] Lote reanudado: ${affected} items a ${tam}/día desde hoy`)
  return { affected, paused: false }
}

// ─── Marcado desde el drenador ──────────────────────────────────

/**
 * Cierra el círculo del goteo: el drenador envía y acá se anota el resultado.
 *
 * POR QUÉ EXISTE: desde que Golden Bullet encola en vez de enviar, quien manda
 * de verdad el mensaje es `/api/cron/queue-drain`, horas o semanas después —
 * y el drenador solo sabía escribir en `campaign_messages`, que exige
 * `customer_id`. Un contacto importado NO es cliente, así que sin esta función
 * los contactos se quedaban en 'queued' para siempre: el panel diría "0
 * enviados" con la base entera ya despachada, y el ROI no tendría de dónde
 * contar.
 *
 * Best-effort a propósito: un fallo acá no puede tumbar un drenaje que ya
 * mandó los mensajes. Lo que se pierde es una etiqueta, no un envío.
 */
export async function markImportedContactsResult(
  enviados: { id: string; sid: string | null }[],
  rebotados: string[]
): Promise<void> {
  if (enviados.length === 0 && rebotados.length === 0) return

  const supabase = getServiceClient()
  const ahora = new Date().toISOString()

  // Los enviados van de a uno porque cada cual lleva su propio SID del
  // proveedor, que es el hilo para rastrear el mensaje si alguien reclama.
  for (const { id, sid } of enviados) {
    const { error } = await supabase
      .from('imported_contacts')
      .update({ status: 'sent', message_sent_at: ahora, twilio_sid: sid })
      .eq('id', id)
    if (error) {
      logDbFailure({
        scope: 'GoldenBullet',
        reason: 'mark_sent_error',
        error,
        context: { imported_contact_id: id },
      })
    }
  }

  if (rebotados.length > 0) {
    const { error } = await supabase
      .from('imported_contacts')
      .update({ status: 'bounced', validation_error: 'envio_fallido' })
      .in('id', rebotados)
    if (error) {
      logDbFailure({
        scope: 'GoldenBullet',
        reason: 'mark_bounced_error',
        error,
        context: { count: rebotados.length },
      })
    }
  }
}

// ─── Listados y estadísticas ────────────────────────────────────

export interface ImportedBatchSummary {
  source_batch: string
  source_file: string
  total: number
  sent: number
  converted: number
  created_at: string
}

/** Lista los lotes importados agrupados (resumen por batch). */
export async function listBatches(tenantId: string): Promise<ImportedBatchSummary[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('imported_contacts')
    .select('source_batch, source_file, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  const map = new Map<string, ImportedBatchSummary>()
  for (const row of data) {
    const key = row.source_batch
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        source_batch: row.source_batch,
        source_file: row.source_file,
        total: 1,
        sent: ['sent', 'delivered', 'converted'].includes(row.status) ? 1 : 0,
        converted: row.status === 'converted' ? 1 : 0,
        created_at: row.created_at,
      })
    } else {
      existing.total++
      if (['sent', 'delivered', 'converted'].includes(row.status)) existing.sent++
      if (row.status === 'converted') existing.converted++
    }
  }

  return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export interface BatchStats {
  batch_id: string
  total: number
  sent: number
  converted: number
  conversion_rate: number
  blocked: number
}

export async function getBatchStats(batchId: string, tenantId: string): Promise<BatchStats> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('imported_contacts')
    .select('status')
    .eq('source_batch', batchId)
    .eq('tenant_id', tenantId)

  const rows = data ?? []
  const sent = rows.filter((r) => ['sent', 'delivered', 'converted'].includes(r.status)).length
  const converted = rows.filter((r) => r.status === 'converted').length
  const blocked = rows.filter((r) => r.status === 'blocked').length

  return {
    batch_id: batchId,
    total: rows.length,
    sent,
    converted,
    conversion_rate: sent > 0 ? Math.round((converted / sent) * 10000) / 100 : 0,
    blocked,
  }
}

// ─── ROI ────────────────────────────────────────────────────────

export interface BatchRoi {
  batch_id: string
  enviados: number
  convertidos: number
  conversion_rate: number
  visitas_generadas: number
  avg_ticket: number
  ingreso_estimado_cop: number
  costo_campana_cop: number
  roi_neto_cop: number
  multiplo_retorno: number
}

export async function getBatchRoi(batchId: string, tenantId: string): Promise<BatchRoi> {
  const supabase = getServiceClient()

  // Contactos del lote + visitas de los convertidos (join customers)
  const { data: contacts } = await supabase
    .from('imported_contacts')
    .select('status, converted_to_customer_id, customers:converted_to_customer_id(total_visits)')
    .eq('source_batch', batchId)
    .eq('tenant_id', tenantId)

  const rows = contacts ?? []
  const enviados = rows.filter((r) => ['sent', 'delivered', 'converted'].includes(r.status)).length
  const convertidos = rows.filter((r) => r.status === 'converted').length

  let visitasGeneradas = 0
  for (const r of rows) {
    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
    if (cust?.total_visits) visitasGeneradas += cust.total_visits
  }

  const avgTicketRaw = await getSettingValue('avg_ticket', tenantId)
  const avgTicket = avgTicketRaw ? Number(avgTicketRaw) : 35000
  const costPerMsg = await getCostPerMessageUsd(tenantId)

  const ingresoEstimado = visitasGeneradas * avgTicket
  const costoCampana = Math.round(enviados * costPerMsg * USD_TO_COP)
  const roiNeto = ingresoEstimado - costoCampana
  const multiplo = costoCampana > 0 ? Math.round((ingresoEstimado / costoCampana) * 10) / 10 : 0

  return {
    batch_id: batchId,
    enviados,
    convertidos,
    conversion_rate: enviados > 0 ? Math.round((convertidos / enviados) * 10000) / 100 : 0,
    visitas_generadas: visitasGeneradas,
    avg_ticket: avgTicket,
    ingreso_estimado_cop: ingresoEstimado,
    costo_campana_cop: costoCampana,
    roi_neto_cop: roiNeto,
    multiplo_retorno: multiplo,
  }
}

// ─── Conversión (cuando un contacto importado se registra) ───────

/**
 * Si el teléfono pertenece a un contacto importado con status 'sent'/'delivered',
 * lo marca como 'converted' y lo vincula al nuevo customer. Devuelve el
 * imported_contact_id (para guardarlo en customers.imported_contact_id) o null.
 * Best-effort: no lanza.
 */
export async function markConverted(phone: string, customerId: string, tenantId: string): Promise<string | null> {
  try {
    const supabase = getServiceClient()
    const normalized = normalizePhone(phone) ?? phone.replace(/\D/g, '').slice(-10)

    const { data: contact, error } = await supabase
      .from('imported_contacts')
      .select('id, status')
      .eq('phone', normalized)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    // Best-effort a propósito (ver doc de la función): un fallo aquí no debe tumbar el
    // check-in del cliente. Pero se registra — antes se confundía con "este teléfono
    // nunca fue un contacto importado" y el ROI del lote perdía la conversión sin rastro.
    if (error) {
      logDbFailure({
        scope: 'GoldenBullet',
        reason: 'mark_converted_lookup_error',
        error,
        context: { tenant_id: tenantId, customer_id: customerId },
      })
      return null
    }

    if (!contact) return null
    // Solo convertir si ya se le había enviado el mensaje (ROI real).
    if (!['sent', 'delivered'].includes(contact.status)) return contact.id

    await supabase
      .from('imported_contacts')
      .update({ status: 'converted', converted_to_customer_id: customerId })
      .eq('id', contact.id)

    return contact.id
  } catch (err) {
    console.error('[GoldenBullet] Error marcando conversión:', err instanceof Error ? err.message : err)
    return null
  }
}
