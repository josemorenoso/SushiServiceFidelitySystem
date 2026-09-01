/**
 * Completar el catálogo estándar en un tenant **Twilio** — solo lo que le falte.
 *
 * ═══ POR QUÉ EXISTE ═══
 *
 * El dueño reportó que en el apartado de Plantillas "faltan las plantillas de
 * invitar a restaurante los que piden por domicilio, e invitar a domicilio los
 * que piden por restaurante". Diagnóstico real:
 *
 *   · Las dos SÍ están en el catálogo estándar (`campaign_presencial_to_domicilio`
 *     y `campaign_domicilio_to_presencial` en `src/constants/template-catalog.ts`).
 *   · También están en el script de alta de Twilio
 *     (`scripts/twilio-create-text-templates.mjs`), pero ese script solo corrió
 *     completo en algunas altas — por eso "cada alta terminaba con un set
 *     distinto", que es el problema original de §12.
 *   · Sus presets en `ManualCampaigns.tsx` se ocultan solos cuando su
 *     `admin_settings.*_template_sid` no existe o no apunta a una plantilla
 *     APROBADA (regla §15.2). Sin plantilla creada, el preset no se dibuja y la
 *     campaña de cross-sell no se puede lanzar.
 *
 * Los 4 tenants Twilio (Sushi Service, Don Alirio, Frangal, Demo) siguen sin
 * tocarse en lo que ya tienen — decisión 6, textual: "déjalos así, ni los
 * toques". Este módulo es **estrictamente aditivo**: crea las que FALTAN y
 * nunca reemplaza, reescribe ni re-somete una que ya exista.
 *
 * ═══ EL INVARIANTE DEL PUNTERO ═══
 *
 * `promoteVersion()` (template.service.ts) sigue siendo el único que **cambia**
 * un `admin_settings.*_template_sid` que ya tiene valor, y solo cuando Meta ya
 * aprobó el reemplazo — así ningún negocio se queda 24-72h sin poder enviar un
 * mensaje. Este módulo solo **rellena una clave vacía**, y `fillEmptyPointer()`
 * se niega en redondo si encuentra un valor: rellenar un hueco no puede abrir
 * uno, porque no hay nada que reemplazar.
 *
 * Escribir el puntero antes de la aprobación es seguro y deliberado:
 * `isPresetSendable()` exige que el SID esté además en la lista de APROBADAS de
 * Twilio, así que el preset sigue oculto hasta que Meta responda. El puntero
 * queda listo para ese momento sin que nadie tenga que volver a entrar.
 *
 * Doc: `docs/features/whatsapp-templates.md` · `docs/features/campaigns.md`
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getTenantTwilioCredentials } from '@/lib/twilio/tenant-credentials'
import { resolveBranding } from '@/lib/branding'
import {
  TEMPLATE_CATALOG,
  TEMPLATE_CATALOG_BY_KEY,
  TEMPLATE_LANGUAGE,
  buildTemplateBody,
  buildTemplateExample,
  isTemplateKey,
  resolveTemplateEmoji,
} from '@/constants/template-catalog'
import { DEFAULT_TEMPLATE_STYLE } from '@/constants/template-catalog'
import type { TemplateKey, TemplateStyle } from '@/types/template.types'
import type { Tenant } from '@/types/tenant.types'

const TWILIO_CONTENT_API = 'https://content.twilio.com/v1/Content'

export class TwilioCatalogError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
    this.name = 'TwilioCatalogError'
  }
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * Este módulo es el espejo Twilio de `template.service.ts`, y como aquel exige
 * `messaging_provider = 'zernio'`, este exige lo contrario. Un tenant Zernio que
 * llegara acá crearía plantillas en la cuenta Twilio equivocada.
 */
function assertTwilioTenant(tenant: Tenant): void {
  if (tenant.messaging_provider === 'zernio') {
    throw new TwilioCatalogError(
      'Este negocio ya está en Zernio: su catálogo se administra desde la pantalla de Plantillas, no desde acá.',
      409
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Lectura: qué le falta
// ─────────────────────────────────────────────────────────────

/**
 * En qué punto está cada plantilla del catálogo para este tenant.
 *
 *   `missing`   → no hay puntero en `admin_settings`. Es la que hay que crear.
 *   `orphan`    → hay puntero, pero Twilio no conoce ese ContentSid (se borró,
 *                 o quedó de otra cuenta). No se toca solo: borrar o repuntar
 *                 un puntero vivo es una decisión, no un automatismo.
 *   `pending`   → creada y esperando el veredicto de Meta.
 *   `approved`  → funcionando. Nada que hacer.
 */
export type StandardTemplateState = 'missing' | 'orphan' | 'pending' | 'approved'

export interface StandardTemplateStatus {
  key: TemplateKey
  label: string
  description: string
  whenSent: string
  settingsKey: string
  category: string
  state: StandardTemplateState
  /** ContentSid al que apunta hoy `admin_settings`, si apunta a alguno. */
  pointer: string | null
  /** Estado de aprobación crudo de Twilio, cuando se pudo leer. */
  approvalStatus: string | null
  /** El texto que se crearía. Se muestra antes de crear: nada a ciegas. */
  body: string
  /** Las 2 de evento llevan media y no se pueden crear desde acá. */
  needsMedia: boolean
}

export interface StandardCatalogReport {
  provider: 'twilio'
  brandName: string
  emoji: string
  style: TemplateStyle
  templates: StandardTemplateStatus[]
  /** Cuántas se pueden crear ahora mismo con un click. */
  missingCount: number
  /** Aviso si no se pudo leer la lista de Twilio (se degrada, no se cae). */
  warning: string | null
}

interface TwilioApprovalSummary {
  sid: string
  status: string
}

/** ContentSid → estado de aprobación, en UNA llamada (igual que la pantalla). */
async function fetchTwilioApprovals(
  basicAuth: string
): Promise<{ bySid: Map<string, TwilioApprovalSummary>; warning: string | null }> {
  const bySid = new Map<string, TwilioApprovalSummary>()
  try {
    const res = await fetch(`${TWILIO_CONTENT_API}AndApprovals?PageSize=100`, {
      headers: { Authorization: basicAuth, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      return {
        bySid,
        warning: `No se pudo leer la lista de plantillas de Twilio (HTTP ${res.status}). Se muestra lo que dice admin_settings.`,
      }
    }
    const data = (await res.json()) as {
      contents?: Array<{ sid: string; approval_requests?: { status?: string } }>
    }
    for (const item of data.contents ?? []) {
      bySid.set(item.sid, {
        sid: item.sid,
        status: (item.approval_requests?.status ?? 'draft').toLowerCase(),
      })
    }
    return { bySid, warning: null }
  } catch (error) {
    console.error('[twilio-catalog] approvals', error)
    return {
      bySid,
      warning:
        'No se pudo conectar con Twilio para leer el estado de las plantillas. Se muestra lo que dice admin_settings.',
    }
  }
}

async function fetchPointers(tenantId: string): Promise<Record<string, string>> {
  const service = getServiceClient()
  const { data, error } = await service
    .from('admin_settings')
    .select('key, value')
    .eq('tenant_id', tenantId)
  if (error) throw error

  const pointers: Record<string, string> = {}
  for (const row of data ?? []) {
    if (typeof row.value === 'string' && row.value.trim()) pointers[row.key] = row.value.trim()
  }
  return pointers
}

/**
 * El estilo con el que se redactan las plantillas nuevas de este tenant.
 *
 * Los tenants Twilio no pasaron nunca por el selector de estilo (es de la
 * pantalla Zernio), así que en la práctica esto es siempre `calido` — que es
 * además el estilo de los textos que ya tienen aprobados. Se lee igual, por si
 * alguien lo fijó a mano, para no mezclar tonos dentro del mismo negocio.
 */
async function resolveStyle(tenantId: string): Promise<TemplateStyle> {
  const pointers = await fetchPointers(tenantId)
  const stored = pointers.template_style
  return stored === 'elegante' || stored === 'urbano' || stored === 'calido'
    ? stored
    : DEFAULT_TEMPLATE_STYLE
}

export async function getStandardCatalogReport(tenant: Tenant): Promise<StandardCatalogReport> {
  assertTwilioTenant(tenant)

  const creds = await getTenantTwilioCredentials(tenant.id)
  if (!creds) {
    throw new TwilioCatalogError(
      'Este negocio no tiene credenciales de Twilio configuradas, así que no se le pueden crear plantillas.',
      400
    )
  }

  const [pointers, style, approvals] = await Promise.all([
    fetchPointers(tenant.id),
    resolveStyle(tenant.id),
    fetchTwilioApprovals(creds.basicAuth),
  ])

  const brandName = resolveBranding(tenant.config).name
  const emoji = resolveTemplateEmoji(tenant.business_type, tenant.config?.template_emoji)

  const templates: StandardTemplateStatus[] = TEMPLATE_CATALOG.map((definition) => {
    const pointer = pointers[definition.settingsKey] ?? null
    const approval = pointer ? approvals.bySid.get(pointer) : undefined

    let state: StandardTemplateState
    if (!pointer) {
      state = 'missing'
    } else if (approvals.warning) {
      // Sin la lista de Twilio no se puede afirmar que esté aprobada NI que
      // esté huérfana. Se asume lo menos alarmante y el aviso lo explica.
      state = 'approved'
    } else if (!approval) {
      state = 'orphan'
    } else if (approval.status === 'approved') {
      state = 'approved'
    } else {
      state = 'pending'
    }

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      whenSent: definition.whenSent,
      settingsKey: definition.settingsKey,
      category: definition.category,
      state,
      pointer,
      approvalStatus: approval?.status ?? null,
      body: buildTemplateBody(definition.key, style, brandName, emoji),
      needsMedia: Boolean(definition.header),
    }
  })

  return {
    provider: 'twilio',
    brandName,
    emoji,
    style,
    templates,
    missingCount: templates.filter((t) => t.state === 'missing' && !t.needsMedia).length,
    warning: approvals.warning,
  }
}

// ─────────────────────────────────────────────────────────────
// Escritura: crear la que falta
// ─────────────────────────────────────────────────────────────

export interface CreateStandardTemplateResult {
  key: TemplateKey
  contentSid: string
  approvalSubmitted: boolean
  approvalError: string | null
  pointerWritten: boolean
}

/** Nombre para Meta: minúsculas, números y guiones bajos. Lo exige Meta. */
function metaName(baseName: string, brandName: string): string {
  const slug = brandName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `${baseName}_${slug}`.slice(0, 512)
}

/**
 * Escribe el puntero SOLO si está vacío. Si ya tiene valor devuelve `false` sin
 * tocar nada: reemplazar un puntero vivo es competencia de `promoteVersion()`,
 * que espera la aprobación de Meta para no dejar al negocio sin ese mensaje.
 */
async function fillEmptyPointer(
  tenantId: string,
  settingsKey: string,
  contentSid: string
): Promise<boolean> {
  const service = getServiceClient()

  const { data: existing, error: readError } = await service
    .from('admin_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', settingsKey)
    .maybeSingle()
  if (readError) throw readError

  if (existing && typeof existing.value === 'string' && existing.value.trim()) {
    return false
  }

  if (existing) {
    const { error } = await service
      .from('admin_settings')
      .update({ value: contentSid, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('key', settingsKey)
    if (error) throw error
  } else {
    const { error } = await service.from('admin_settings').insert({
      tenant_id: tenantId,
      key: settingsKey,
      value: contentSid,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
  }
  return true
}

/**
 * Crea UNA plantilla del catálogo estándar en la cuenta Twilio del tenant, la
 * somete a Meta y deja el puntero listo.
 *
 * Se niega si la plantilla ya tiene puntero: este camino es para huecos, y
 * "reemplazar" es otro problema con otras reglas.
 */
export async function createStandardTemplate(
  tenant: Tenant,
  key: string
): Promise<CreateStandardTemplateResult> {
  assertTwilioTenant(tenant)

  if (!isTemplateKey(key)) {
    throw new TwilioCatalogError(`"${key}" no es una plantilla del catálogo estándar.`, 400)
  }
  const definition = TEMPLATE_CATALOG_BY_KEY[key]

  if (definition.header) {
    throw new TwilioCatalogError(
      `"${definition.label}" lleva imagen o video en la cabecera y se crea con el script de media, no desde acá.`,
      400
    )
  }

  const pointers = await fetchPointers(tenant.id)
  if (pointers[definition.settingsKey]) {
    throw new TwilioCatalogError(
      `"${definition.label}" ya tiene una plantilla asignada. Este camino solo llena huecos: reemplazar una plantilla viva exige esperar la aprobación de la nueva para no dejar al negocio sin ese mensaje.`,
      409
    )
  }

  const creds = await getTenantTwilioCredentials(tenant.id)
  if (!creds) {
    throw new TwilioCatalogError(
      'Este negocio no tiene credenciales de Twilio configuradas.',
      400
    )
  }

  const brandName = resolveBranding(tenant.config).name
  const emoji = resolveTemplateEmoji(tenant.business_type, tenant.config?.template_emoji)
  const style = await resolveStyle(tenant.id)
  const body = buildTemplateBody(definition.key, style, brandName, emoji)
  const examples = buildTemplateExample(definition.key, brandName)

  // Twilio quiere el diccionario posicional `{'1': ..., '2': ...}` — el mismo
  // formato que arma `whatsapp.service.ts` al enviar. Los valores son los
  // ejemplos del catálogo, que es lo que Meta revisa junto al texto.
  const variables: Record<string, string> = {}
  definition.variables.forEach((variable, index) => {
    variables[String(variable.index)] = examples[index] ?? `variable_${variable.index}`
  })

  const headers = {
    Authorization: creds.basicAuth,
    'Content-Type': 'application/json',
  }

  const createRes = await fetch(TWILIO_CONTENT_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      friendly_name: metaName(definition.baseName, brandName),
      language: TEMPLATE_LANGUAGE,
      variables,
      types: { 'twilio/text': { body } },
    }),
  })

  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '')
    console.error('[twilio-catalog] create', createRes.status, detail)
    throw new TwilioCatalogError(
      `Twilio rechazó la creación de "${definition.label}" (HTTP ${createRes.status}).`,
      502
    )
  }

  const created = (await createRes.json()) as { sid: string }

  // Someter a Meta. Si esto falla la plantilla YA existe en Twilio, así que no
  // se aborta: se informa y el dueño la puede reenviar con el botón que ya
  // tiene la pantalla ("Enviar a Meta").
  let approvalSubmitted = false
  let approvalError: string | null = null
  try {
    const approvalRes = await fetch(
      `${TWILIO_CONTENT_API}/${created.sid}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: metaName(definition.baseName, brandName),
          category: definition.category,
        }),
      }
    )
    if (approvalRes.ok) {
      approvalSubmitted = true
    } else {
      approvalError = await approvalRes.text().catch(() => `HTTP ${approvalRes.status}`)
    }
  } catch (error) {
    approvalError = error instanceof Error ? error.message : 'Error desconocido'
  }

  const pointerWritten = await fillEmptyPointer(
    tenant.id,
    definition.settingsKey,
    created.sid
  )

  return {
    key: definition.key,
    contentSid: created.sid,
    approvalSubmitted,
    approvalError,
    pointerWritten,
  }
}
