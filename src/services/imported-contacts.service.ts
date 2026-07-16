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
import { sendTemplateMessage } from '@/services/whatsapp.service'
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
const SEND_BATCH_SIZE = 10

/** Tarifa de mensajería leída de admin_settings (fallback a la constante). */
export async function getCostPerMessageUsd(tenantId: string): Promise<number> {
  const raw = await getSettingValue('twilio_cost_per_message_usd', tenantId)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_COST_PER_MESSAGE_USD
}

/** Normaliza a 10 dígitos colombianos (quita +57, espacios, etc.). */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  return /^3\d{9}$/.test(last10) ? last10 : null
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

/** Devuelve el subconjunto de teléfonos que ya existen en imported_contacts. */
export async function getExistingPhones(phones: string[], tenantId: string): Promise<Set<string>> {
  if (phones.length === 0) return new Set()
  const supabase = getServiceClient()
  const found = new Set<string>()
  // Consultar en chunks para no exceder límites de la query .in()
  for (let i = 0; i < phones.length; i += 500) {
    const chunk = phones.slice(i, i + 500)
    const { data } = await supabase.from('imported_contacts').select('phone').eq('tenant_id', tenantId).in('phone', chunk)
    for (const row of data ?? []) found.add(row.phone)
  }
  return found
}

// ─── Confirmar e importar (envío) ───────────────────────────────

export interface ConfirmImportParams {
  batchId: string
  sourceFile: string
  templateSid: string
  /** Texto de la promo que va en {{2}} de la plantilla */
  promoText: string
  /** Nombre genérico para {{1}} cuando el contacto no trae nombre */
  fallbackName?: string
  contacts: ParsedContact[]
  tenant: Tenant
}

export interface ConfirmImportResult {
  campaign_id: string
  inserted: number
  sent: number
  failed: number
  blocked_auto: number
  total_cost_usd: number
  /** Presente si se abortó por saldo insuficiente (spec W-D6). Nada se envió. */
  insufficient_balance?: {
    balanceCop: number
    pricePerMessage: number
    messagesAvailable: number
    recipients: number
    shortfallCop: number
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
  const toImport = params.contacts.filter((c) => !existing.has(c.phone))
  const blockedAuto = params.contacts.length - toImport.length

  // ─── Bloqueo por saldo (spec W-D6) ───
  // Golden Bullet es un envío masivo de un disparo: se bloquea entero sin saldo,
  // ANTES de crear la campaña o insertar contactos. No se envía parcial.
  if (toImport.length > 0) {
    const budget = await canSendBulk(tenantId, toImport.length)
    if (!budget.ok) {
      return {
        campaign_id: '',
        inserted: 0,
        sent: 0,
        failed: 0,
        blocked_auto: blockedAuto,
        total_cost_usd: 0,
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

  // 1. Crear campaña (source 'manual' — 'imported' no está en el CHECK de campaigns.source)
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      name: `Golden Bullet — ${params.sourceFile}`,
      type: 'manual',
      source: 'manual',
      status: 'running',
      message_template: params.promoText,
      filters: { golden_bullet: true, source_file: params.sourceFile, batch_id: params.batchId },
      executed_at: new Date().toISOString(),
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (campaignError || !campaign) {
    throw new Error(`Error creando campaña: ${campaignError?.message}`)
  }

  // 2. Insertar contactos válidos como status 'valid' (aún no enviados)
  let inserted = 0
  if (toImport.length > 0) {
    const rows = toImport.map((c) => ({
      phone: c.phone,
      name: c.name,
      email: c.email,
      source_file: params.sourceFile,
      source_batch: params.batchId,
      status: 'valid' as const,
      campaign_id: campaign.id,
      tenant_id: tenantId,
    }))
    // Insertar en chunks
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { data, error } = await supabase.from('imported_contacts').insert(chunk).select('id')
      if (error) {
        console.error('[GoldenBullet] Error insertando contactos:', error.message)
        continue
      }
      inserted += data?.length ?? 0
    }
  }

  // 3. Enviar en batches de 10 (igual que campañas manuales)
  let sent = 0
  let failed = 0
  const now = new Date().toISOString()

  for (let i = 0; i < toImport.length; i += SEND_BATCH_SIZE) {
    const batch = toImport.slice(i, i + SEND_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (c) => {
        const variables: Record<string, string> = {
          '1': c.name || fallbackName,
          '2': params.promoText,
        }
        const res = await sendTemplateMessage(c.phone, params.templateSid, variables, params.tenant, {
          customerId: null,
          messageType: 'manual',
        })
        return { phone: c.phone, res }
      })
    )

    for (const { phone, res } of results) {
      if (res) {
        sent++
        await supabase
          .from('imported_contacts')
          .update({ status: 'sent', message_sent_at: now, twilio_sid: res.sid })
          .eq('phone', phone)
          .eq('source_batch', params.batchId)
          .eq('tenant_id', tenantId)
      } else {
        failed++
        await supabase
          .from('imported_contacts')
          .update({ status: 'bounced', validation_error: 'envio_fallido' })
          .eq('phone', phone)
          .eq('source_batch', params.batchId)
          .eq('tenant_id', tenantId)
      }
    }
  }

  // 4. Cerrar campaña
  await supabase.from('campaigns').update({ status: 'completed', total_sent: sent }).eq('id', campaign.id)

  return {
    campaign_id: campaign.id,
    inserted,
    sent,
    failed,
    blocked_auto: blockedAuto,
    total_cost_usd: Math.round(sent * costPerMsg * 100) / 100,
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

    const { data: contact } = await supabase
      .from('imported_contacts')
      .select('id, status')
      .eq('phone', normalized)
      .eq('tenant_id', tenantId)
      .maybeSingle()

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
