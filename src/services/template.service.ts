/**
 * Catálogo estándar de plantillas de WhatsApp: estado, edición y promoción.
 *
 * Doc de feature: docs/features/whatsapp-templates.md
 * Requerimiento:  docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §12
 * Migración:      supabase/migrations/00039_template_catalog.sql
 *
 * LA REGLA QUE MANDA SOBRE TODO EL ARCHIVO
 * ----------------------------------------
 * Meta no deja editar in-place una plantilla aprobada. Para el dueño, "editar"
 * es guardar un documento; por debajo es crear una plantilla nueva y esperar el
 * veredicto. Decisión textual del dueño:
 *   "que se cree primero la nueva y una vez quede aprobada se cambie y
 *    automáticamente se modifique, pero luego de aprobarla, para nunca
 *    arriesgarnos a perder un mensaje".
 * De ahí el invariante que este servicio no rompe jamás:
 *
 *   ⛔ NADA cambia `admin_settings.<settings_key>` salvo `promoteVersion()`,
 *      y `promoteVersion()` solo corre cuando Meta ya dijo APPROVED.
 *
 * Mientras Meta revisa, el puntero sigue apuntando a la plantilla vieja y los
 * envíos salen exactamente como salían ayer. Si Meta rechaza, no se toca nada.
 *
 * ALCANCE: solo tenants `messaging_provider='zernio'`. Los 4 tenants Twilio
 * (Sushi Service, Don Alirio, Frangal, Demo) quedan fuera por decisión del dueño
 * — "déjalos así, ni los toques". El guardarraíl es `assertZernioTenant()` y
 * está en el servicio, no en la UI, para que ninguna ruta pueda saltárselo.
 */

import { createClient } from '@supabase/supabase-js'
import { logDbFailure } from '@/lib/db-failure'
import {
  CATALOG_SIZE,
  DEFAULT_TEMPLATE_STYLE,
  TEMPLATE_CATALOG,
  TEMPLATE_CATALOG_BY_KEY,
  TEMPLATE_LANGUAGE,
  buildTemplateBody,
  buildTemplateExample,
  detectTemplateStyle,
  resolveTemplateEmoji,
  validateTemplateBody,
  validateTemplateName,
} from '@/constants/template-catalog'
import { createZernioTemplate, getZernioTemplateStatus } from '@/lib/zernio/templates'
import { ZernioApiError } from '@/lib/zernio/client'
import type { ZernioTemplateStatus } from '@/lib/zernio/templates'
import { resolveBranding } from '@/lib/branding'
import type { Tenant } from '@/types/tenant.types'
import type {
  CatalogTemplate,
  TemplateCatalogEntry,
  TemplateCatalogResponse,
  TemplateKey,
  TemplateVersion,
  TemplateVersionStatus,
} from '@/types/template.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/** Error de negocio con un mensaje que se le puede mostrar tal cual al dueño. */
export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message)
    this.name = 'TemplateError'
  }
}

/** Quién está editando. Se persiste para poder sostener la advertencia después. */
export interface TemplateEditor {
  userId: string
  email: string | null
}

// ─────────────────────────────────────────────────────────────
// Guardarraíles
// ─────────────────────────────────────────────────────────────

/**
 * El catálogo estándar es solo para tenants Zernio (§12 respuesta 6). Un tenant
 * Twilio que llegue aquí es un error de ruteo, no un caso a soportar: sus
 * plantillas se siguen gestionando con la pantalla Twilio de siempre.
 */
export function assertZernioTenant(tenant: Tenant): asserts tenant is Tenant & {
  zernio_account_id: string
} {
  if (tenant.messaging_provider !== 'zernio') {
    throw new TemplateError(
      'El catálogo estándar de plantillas aplica solo a los negocios que envían por Zernio. Este negocio sigue en Twilio y sus plantillas no se tocan.',
      409
    )
  }
  if (!tenant.zernio_account_id) {
    throw new TemplateError(
      'Este negocio todavía no tiene su número de WhatsApp conectado. Conéctalo antes de crear o editar plantillas.',
      409
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Lectura del estado del catálogo
// ─────────────────────────────────────────────────────────────

async function fetchVersions(tenantId: string): Promise<TemplateVersion[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('template_versions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Templates] Error leyendo template_versions:', error.message)
    throw new TemplateError('No se pudo leer el estado de las plantillas.', 500)
  }
  return (data ?? []) as TemplateVersion[]
}

async function fetchPointers(tenantId: string): Promise<Record<string, string>> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('admin_settings')
    .select('key, value')
    .eq('tenant_id', tenantId)
    .in('key', TEMPLATE_CATALOG.map((t) => t.settingsKey))

  const pointers: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.value) pointers[row.key] = row.value
  }
  return pointers
}

function brandNameOf(tenant: Tenant): string {
  return resolveBranding(tenant.config).name
}

/**
 * El emoji que se hornea en los textos `calido`.
 *
 * Va junto al nombre del negocio en todo lugar que construya o compare un
 * cuerpo: si `detectTemplateStyle()` usara otro emoji que `buildTemplateBody()`,
 * un texto sin editar se detectaría como «personalizado» y la pantalla le diría
 * al dueño que dejó de usar el estilo que sí está usando.
 */
function emojiOf(tenant: Tenant): string {
  return resolveTemplateEmoji(tenant.business_type, tenant.config?.template_emoji)
}

/**
 * Todo lo que la pantalla de Plantillas necesita: la definición de las 13, qué
 * se está enviando hoy, qué hay en revisión y qué texto propone el banco.
 */
export async function getTemplateCatalogState(tenant: Tenant): Promise<TemplateCatalogResponse> {
  const [versions, pointers] = await Promise.all([
    fetchVersions(tenant.id),
    fetchPointers(tenant.id),
  ])

  const brandName = brandNameOf(tenant)
  const emoji = emojiOf(tenant)

  const entries: TemplateCatalogEntry[] = TEMPLATE_CATALOG.map((definition) => {
    const mine = versions.filter((v) => v.template_key === definition.key)
    const current = mine.find((v) => v.is_current) ?? null
    const pending = mine.find((v) => v.status === 'pending') ?? null

    // Solo interesa un rechazo que el dueño todavía no vio resuelto: si después
    // de rechazar mandó otra y esa quedó vigente, el rechazo ya no es noticia.
    const lastRejected =
      mine.find(
        (v) =>
          v.status === 'rejected' &&
          !pending &&
          (!current || new Date(v.created_at) > new Date(current.created_at))
      ) ?? null

    return {
      definition,
      current,
      pending,
      lastRejected,
      suggestedBody: buildTemplateBody(definition.key, brandName, emoji),
      suggestedName: nextProviderRef(definition, mine, pointers[definition.settingsKey] ?? null),
      // Puntero cargado fuera del panel (alta por el AIOS o SQL directo): la
      // plantilla está activa pero no tenemos su texto. La UI lo dice tal cual
      // en vez de inventarse un cuerpo que quizá no es el que se está enviando.
      adoptedRef: current ? null : (pointers[definition.settingsKey] ?? null),
      blockedReason: headerSampleMissingReason(definition),
    }
  })

  return { provider: 'zernio', brandName, entries }
}

// ─────────────────────────────────────────────────────────────
// Nombres en el proveedor
// ─────────────────────────────────────────────────────────────

/**
 * Siguiente `name` libre para una plantilla del catálogo.
 *
 * En Meta el nombre es único por WABA y la plantilla vieja SIGUE EXISTIENDO
 * mientras la nueva se revisa (ese es justamente el punto del flujo), así que
 * cada versión necesita un nombre propio: `bienvenida`, `bienvenida_v2`, ...
 *
 * Mira tanto las versiones que conocemos como el puntero actual de
 * `admin_settings`: un tenant dado de alta por el AIOS tiene el puntero puesto
 * y CERO filas en `template_versions`, y reusar ese nombre haría fallar la
 * creación contra Zernio.
 */
function nextProviderRef(
  definition: CatalogTemplate,
  existing: TemplateVersion[],
  pointer: string | null
): string {
  const candidates = [...existing.map((v) => v.provider_ref), ...(pointer ? [pointer] : [])]

  let maxVersion = 0
  for (const ref of candidates) {
    if (ref === definition.baseName) {
      maxVersion = Math.max(maxVersion, 1)
      continue
    }
    const match = ref.match(new RegExp(`^${definition.baseName}_v(\\d+)$`))
    if (match) maxVersion = Math.max(maxVersion, Number(match[1]))
  }

  return maxVersion === 0 ? definition.baseName : `${definition.baseName}_v${maxVersion + 1}`
}

/**
 * El motivo humano que viene en un error de Zernio, si lo hay. Zernio envuelve
 * el error de Meta en `{ message }` o `{ error }`; a veces es texto plano.
 */
function zernioErrorDetail(body: unknown): string {
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300)
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    for (const k of ['message', 'error', 'detail']) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300)
      if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).message === 'string') {
        return String((v as Record<string, unknown>).message).slice(0, 300)
      }
    }
  }
  return 'sin detalle del proveedor'
}

/**
 * URL de la media de muestra que Meta revisa junto con la plantilla de evento.
 * No hay forma de inventarla: Meta descarga el archivo. Si no está configurada,
 * las 2 plantillas de evento se omiten con un aviso y las otras 11 siguen su
 * curso — que es mucho mejor que abortar el alta completa del catálogo.
 */
function headerSampleUrl(format: 'image' | 'video'): string | null {
  const env =
    format === 'image'
      ? process.env.ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL
      : process.env.ZERNIO_TEMPLATE_SAMPLE_VIDEO_URL
  return env?.trim() || null
}

/**
 * Lo mismo que arriba, pero en palabras del dueño y ANTES de que apriete nada.
 *
 * La pantalla lo usa para deshabilitar «Enviar a Meta» en las 2 de evento
 * cuando falta la muestra: sin esto el botón se ve normal, se aprieta y devuelve
 * un error de servidor por una configuración que el dueño no puede tocar.
 */
function headerSampleMissingReason(definition: CatalogTemplate): string | null {
  if (!definition.header) return null
  if (headerSampleUrl(definition.header.format)) return null
  const que = definition.header.format === 'image' ? 'una imagen' : 'un video'
  return (
    `Para revisar este mensaje, WhatsApp necesita descargar ${que} de muestra, y todavía no hay ` +
    'ninguna configurada. Avísale al equipo de Cada1: es un ajuste de una sola vez para todos los ' +
    'negocios, no algo tuyo.'
  )
}

// ─────────────────────────────────────────────────────────────
// Guardar una edición (= crear + someter, sin tocar lo vigente)
// ─────────────────────────────────────────────────────────────

export interface SaveTemplateInput {
  tenant: Tenant
  key: TemplateKey
  /** Texto que escribió el dueño. */
  body: string
  editor: TemplateEditor
  /**
   * El dueño aceptó la advertencia de responsabilidad. Sin esto no se guarda:
   * la decisión 3 del dueño ("si se las llegan a bloquear va a ser su culpa")
   * solo se sostiene si queda registro de que la vio y la aceptó.
   */
  acceptedDisclaimer: boolean
  /**
   * `name` que el dueño quiere para la plantilla en Meta. `undefined` = lo elige
   * el servidor (`nextProviderRef`). Va ya normalizado desde el campo; acá se
   * valida contra la regla de Meta y contra los nombres que este negocio ya usó.
   */
  name?: string
}

export interface SaveTemplateResult {
  version: TemplateVersion
  /** Qué se le dice al dueño. En su idioma, sin hablar de Meta ni de versiones. */
  message: string
}

export async function saveTemplateEdit(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  const { tenant, key, editor } = input
  assertZernioTenant(tenant)

  const definition = TEMPLATE_CATALOG_BY_KEY[key]
  if (!definition) throw new TemplateError('Esa plantilla no existe en el catálogo.', 404)

  if (!input.acceptedDisclaimer) {
    throw new TemplateError(
      'Antes de guardar tienes que aceptar la advertencia de responsabilidad sobre el contenido.',
      400
    )
  }

  const body = input.body.trim()
  const brandName = brandNameOf(tenant)

  return submitTemplateBody({
    tenant,
    definition,
    body,
    editor,
    style: detectTemplateStyle(key, body, brandName, emojiOf(tenant)),
    // El texto lo escribió el dueño: la aceptación es real y queda fechada.
    disclaimerAcceptedAt: new Date().toISOString(),
    unchangedError: 'No cambiaste nada: el texto es idéntico al que estás enviando hoy.',
    requestedName: input.name,
  })
}

// ─────────────────────────────────────────────────────────────
// Enviar el texto del catálogo TAL CUAL (el alta de un negocio nuevo)
// ─────────────────────────────────────────────────────────────

/**
 * Somete a Meta el texto que el catálogo propone, sin pasar por el editor.
 *
 * POR QUÉ EXISTE: un tenant recién dado de alta nace con las 13 sin configurar
 * (`aios_provision_tenant` no siembra ningún `*_template_sid`). Sin este botón
 * eran 13 ediciones a mano para mandar textos que nadie quería cambiar.
 *
 * ⚠️ NO PIDE LA ADVERTENCIA DE RESPONSABILIDAD, y no es un descuido. La decisión
 * 3 del dueño ("si se las llegan a bloquear va a ser su culpa") es sobre el texto
 * que ESCRIBE ÉL; acá el texto es el nuestro, salido de `template-texts.ts`. No
 * hay nada que el dueño pueda aceptar sobre una redacción que no es suya, así
 * que `disclaimer_accepted_at` queda NULL en vez de estampar una aceptación que
 * nunca ocurrió. Quién apretó el botón sí queda, en `edited_by`.
 */
export async function submitSuggestedTemplate(input: {
  tenant: Tenant
  key: TemplateKey
  editor: TemplateEditor
}): Promise<SaveTemplateResult> {
  const { tenant, key, editor } = input
  assertZernioTenant(tenant)

  const definition = TEMPLATE_CATALOG_BY_KEY[key]
  if (!definition) throw new TemplateError('Esa plantilla no existe en el catálogo.', 404)

  const body = buildTemplateBody(key, brandNameOf(tenant), emojiOf(tenant))

  return submitTemplateBody({
    tenant,
    definition,
    body,
    editor,
    style: DEFAULT_TEMPLATE_STYLE,
    disclaimerAcceptedAt: null,
    unchangedError:
      'Este mensaje ya se está enviando con este mismo texto. Si quieres cambiarlo, usa Editar.',
  })
}

/**
 * El tronco común de los dos caminos por los que un texto llega a Meta: «Enviar
 * a Meta» (el del catálogo, tal cual) y «Editar» (el que escribió el dueño).
 *
 * Comparten TODAS las guardas —texto válido, una sola pendiente por plantilla,
 * no re-someter lo que ya se está enviando— y se diferencian solo en de dónde
 * sale el texto y en si hubo una advertencia que aceptar.
 */
async function submitTemplateBody(args: {
  tenant: Tenant
  definition: CatalogTemplate
  body: string
  editor: TemplateEditor
  style: TemplateVersion['style']
  disclaimerAcceptedAt: string | null
  /** Qué decirle al dueño si el texto es idéntico al que ya está enviando. */
  unchangedError: string
  /** Nombre elegido por el dueño para Meta; `undefined` = lo elige `nextProviderRef`. */
  requestedName?: string
}): Promise<SaveTemplateResult> {
  const { tenant, definition, body, editor } = args
  assertZernioTenant(tenant)

  const requestedName = args.requestedName?.trim() || undefined
  if (requestedName) {
    const nameIssues = validateTemplateName(requestedName)
    if (nameIssues.length > 0) throw new TemplateError(nameIssues.join(' '), 400)
  }

  const issues = validateTemplateBody(body, {
    category: definition.category,
    expectedVariables: definition.variables.length,
  })
  if (issues.length > 0) {
    throw new TemplateError(issues.join(' '), 400)
  }

  const versions = await fetchVersions(tenant.id)
  const mine = versions.filter((v) => v.template_key === definition.key)

  // Una edición a la vez por plantilla: dos pendientes competirían por el mismo
  // puntero al aprobarse. La base también lo impide (índice parcial único).
  if (mine.some((v) => v.status === 'pending')) {
    throw new TemplateError(
      'Ya hay un cambio de esta plantilla esperando aprobación. Espera a que se resuelva antes de hacer otro.',
      409
    )
  }

  const current = mine.find((v) => v.is_current) ?? null
  if (current && current.body.trim() === body) {
    throw new TemplateError(args.unchangedError, 400)
  }

  const pointers = await fetchPointers(tenant.id)

  // Un nombre que este negocio ya usó —en cualquier mensaje, con cualquier
  // resultado— casi seguro sigue existiendo en la WABA: Meta lo rechazaría
  // por repetido. Se corta acá con un mensaje que dice qué hacer, en vez de
  // dejar que Zernio devuelva un 400 genérico.
  if (requestedName) {
    const taken =
      versions.some((v) => v.provider_ref === requestedName) ||
      Object.values(pointers).includes(requestedName)
    if (taken) {
      throw new TemplateError(
        `El nombre "${requestedName}" ya está usado en este negocio. Escribe uno distinto (por ejemplo, agrégale un número al final).`,
        409
      )
    }
  }

  return createAndSubmit({
    tenant,
    definition,
    body,
    brandName: brandNameOf(tenant),
    style: args.style,
    editor,
    existing: mine,
    pointer: pointers[definition.settingsKey] ?? null,
    hasCurrent: Boolean(current) || Boolean(pointers[definition.settingsKey]),
    disclaimerAcceptedAt: args.disclaimerAcceptedAt,
    requestedName,
  })
}

interface CreateAndSubmitInput {
  tenant: Tenant & { zernio_account_id: string }
  definition: CatalogTemplate
  body: string
  brandName: string
  style: TemplateVersion['style']
  editor: TemplateEditor
  existing: TemplateVersion[]
  pointer: string | null
  hasCurrent: boolean
  /**
   * Cuándo aceptó el dueño la advertencia de responsabilidad, o `null` si no
   * hubo nada que aceptar porque el texto no lo escribió él (ver
   * `submitSuggestedTemplate`). Antes esto era un `now` literal, y estampaba
   * una aceptación que en el camino «Enviar a Meta» nunca ocurrió.
   */
  disclaimerAcceptedAt: string | null
  /** Ya validado y libre en este negocio. `undefined` = `nextProviderRef`. */
  requestedName?: string
}

/**
 * El paso irreversible: crear la plantilla en el proveedor y dejarla registrada
 * como pendiente. NO toca el puntero — eso lo hace `promoteVersion()` cuando
 * Meta aprueba.
 */
async function createAndSubmit(input: CreateAndSubmitInput): Promise<SaveTemplateResult> {
  const { tenant, definition, body, brandName, editor, disclaimerAcceptedAt } = input
  const supabase = getServiceClient()
  const providerRef =
    input.requestedName ?? nextProviderRef(definition, input.existing, input.pointer)
  const now = new Date().toISOString()

  let header: { format: 'image' | 'video'; sampleUrl: string } | undefined
  if (definition.header) {
    const sampleUrl = headerSampleUrl(definition.header.format)
    if (!sampleUrl) {
      throw new TemplateError(
        `Esta plantilla lleva ${definition.header.format === 'image' ? 'una imagen' : 'un video'} de portada y no hay un archivo de muestra configurado para enviarle a WhatsApp. Avísale al equipo de Cada1 antes de continuar.`,
        409
      )
    }
    header = { format: definition.header.format, sampleUrl }
  }

  let providerTemplateId: string | null = null
  let providerStatus: ZernioTemplateStatus = 'PENDING'

  try {
    const created = await createZernioTemplate({
      accountId: tenant.zernio_account_id,
      name: providerRef,
      category: definition.category,
      language: TEMPLATE_LANGUAGE,
      bodyText: body,
      bodyExample: buildTemplateExample(definition.key, brandName),
      header,
    })
    providerTemplateId = created.template?.id ?? null
    providerStatus = created.template?.status ?? 'PENDING'
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[Templates] Zernio rechazó la creación de ${providerRef}:`, detail)

    // Se registra el intento fallido: sin esto, el dueño ve "no pasó nada" y no
    // hay rastro de por qué. `failed` no compite por el índice de pendientes.
    await supabase.from('template_versions').insert({
      tenant_id: tenant.id,
      template_key: definition.key,
      settings_key: definition.settingsKey,
      provider: 'zernio',
      provider_ref: providerRef,
      language: TEMPLATE_LANGUAGE,
      category: definition.category,
      style: input.style,
      body,
      status: 'failed' satisfies TemplateVersionStatus,
      rejection_reason: detail.slice(0, 500),
      edited_by: editor.userId,
      edited_by_email: editor.email,
      disclaimer_accepted_at: disclaimerAcceptedAt,
      submitted_at: now,
      resolved_at: now,
    })

    // Un 400 NO es transitorio: es Meta diciendo que ese nombre ya existe en la
    // cuenta (con otra categoría, con otro texto) o que algo del contenido no
    // pasa. Invitar a «reintentar más tarde» era mentira (Planeta Wings,
    // 2026-09-12 05:13 UTC): se le dice el motivo y qué hacer.
    if (err instanceof ZernioApiError && err.status === 400) {
      throw new TemplateError(
        `WhatsApp no aceptó la plantilla "${providerRef}": ${zernioErrorDetail(err.body)}. Si dice que ya existe una con ese nombre, ábrela con Editar y ponle otro nombre.`,
        400
      )
    }

    throw new TemplateError(
      'WhatsApp no aceptó el cambio en este momento. Tu mensaje actual sigue funcionando igual; vuelve a intentarlo más tarde.',
      502
    )
  }

  // Una "library template" vuelve APPROVED al instante. Hoy el catálogo no usa
  // ninguna, pero si algún día se usa, esto la promueve sin esperar webhook.
  const approvedOnCreate = providerStatus === 'APPROVED'

  const { data, error } = await supabase
    .from('template_versions')
    .insert({
      tenant_id: tenant.id,
      template_key: definition.key,
      settings_key: definition.settingsKey,
      provider: 'zernio',
      provider_ref: providerRef,
      provider_template_id: providerTemplateId,
      language: TEMPLATE_LANGUAGE,
      category: definition.category,
      style: input.style,
      body,
      status: 'pending' satisfies TemplateVersionStatus,
      edited_by: editor.userId,
      edited_by_email: editor.email,
      disclaimer_accepted_at: disclaimerAcceptedAt,
      submitted_at: now,
    })
    .select('*')
    .single()

  if (error || !data) {
    // La plantilla YA existe en el proveedor pero no la registramos: es el peor
    // desenlace posible, porque el nombre queda quemado. Se grita en el log con
    // el nombre exacto para poder repararlo a mano.
    console.error(
      `[Templates] ⚠️ ${providerRef} se creó en Zernio pero NO se guardó en template_versions:`,
      error?.message
    )
    throw new TemplateError(
      'El cambio se envió pero no se pudo registrar. Avísale al equipo de Cada1 antes de volver a intentarlo.',
      500
    )
  }

  const version = data as TemplateVersion

  if (approvedOnCreate) {
    await promoteVersion(version)
    return {
      version: { ...version, status: 'approved', is_current: true },
      message: 'Listo, tu mensaje quedó actualizado.',
    }
  }

  return {
    version,
    message: input.hasCurrent
      ? 'Guardado. WhatsApp está revisando el cambio (suele tardar entre 1 y 3 días). Mientras tanto tus clientes siguen recibiendo el mensaje anterior, sin interrupciones.'
      : 'Guardado. WhatsApp está revisando el mensaje (suele tardar entre 1 y 3 días). Te avisamos apenas quede activo.',
  }
}

// ─────────────────────────────────────────────────────────────
// Re-aplicar un estilo a todo el catálogo (§12 respuesta 4)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Detector de aprobación — el punto donde cambia el puntero
// ─────────────────────────────────────────────────────────────

/**
 * Promueve una versión aprobada a vigente. ES EL ÚNICO LUGAR del sistema que
 * escribe `admin_settings.<settings_key>`.
 *
 * Orden deliberado — retirar la vieja, promover la nueva, mover el puntero:
 *  · El índice único parcial `idx_template_versions_one_current` obliga a
 *    liberar el puesto antes de ocuparlo.
 *  · El puntero se mueve AL FINAL. Si algo se cae a mitad de camino, el puntero
 *    sigue apuntando a la plantilla vieja, que sigue existiendo en la WABA: los
 *    mensajes se siguen enviando. El peor caso es cosmético (la pantalla no
 *    muestra vigente) y se repara reprocesando el evento.
 */
async function promoteVersion(version: TemplateVersion): Promise<void> {
  const supabase = getServiceClient()
  const now = new Date().toISOString()

  const { error: retireError } = await supabase
    .from('template_versions')
    .update({ is_current: false, status: 'retired', retired_at: now })
    .eq('tenant_id', version.tenant_id)
    .eq('settings_key', version.settings_key)
    .eq('is_current', true)
    .neq('id', version.id)

  if (retireError) {
    console.error('[Templates] No se pudo retirar la versión vigente:', retireError.message)
    throw new TemplateError('No se pudo cambiar la plantilla vigente.', 500)
  }

  const { error: promoteError } = await supabase
    .from('template_versions')
    .update({ status: 'approved', is_current: true, resolved_at: now, rejection_reason: null })
    .eq('id', version.id)

  if (promoteError) {
    console.error('[Templates] No se pudo promover la versión aprobada:', promoteError.message)
    throw new TemplateError('No se pudo cambiar la plantilla vigente.', 500)
  }

  const { error: pointerError } = await supabase
    .from('admin_settings')
    .upsert(
      {
        key: version.settings_key,
        value: version.provider_ref,
        tenant_id: version.tenant_id,
        updated_at: now,
      },
      { onConflict: 'key,tenant_id' }
    )

  if (pointerError) {
    console.error(
      `[Templates] ⚠️ ${version.provider_ref} quedó aprobada pero admin_settings.${version.settings_key} NO se actualizó:`,
      pointerError.message
    )
    throw new TemplateError('No se pudo cambiar la plantilla vigente.', 500)
  }

  console.log(
    `[Templates] Puntero actualizado: ${version.settings_key} → ${version.provider_ref} (tenant ${version.tenant_id})`
  )
}

export type TemplateStatusOutcome =
  | { handled: false; reason: string }
  | {
      handled: true
      action: 'promoted' | 'rejected' | 'noted'
      templateKey: TemplateKey
      /** Por qué se anotó sin actuar. Solo lo llena `noted`, para el log. */
      reason?: string
    }

export interface ProviderTemplateStatusInput {
  provider: 'zernio' | 'twilio'
  tenantId: string
  /** `name` en Zernio / ContentSid en Twilio. */
  providerRef: string
  language: string
  status: ZernioTemplateStatus
  /** Motivo de rechazo tal cual lo manda el proveedor. */
  reason?: string | null
}

/**
 * ⭐ EL DETECTOR DE APROBACIÓN — puerta de entrada ÚNICA.
 *
 * Todo lo que sepa que Meta cambió el estado de una plantilla entra por aquí, y
 * solo por aquí. Hoy la llama el webhook `whatsapp.template.status_updated`
 * (`src/app/api/webhook/zernio/route.ts`), que el contrato verificado de Zernio
 * documenta con el payload exacto — por eso no hace falta poll.
 *
 * Está detrás de una función a propósito: el Bloque 3 de la gobernanza de envío
 * (`docs/features/send-governance.md`) necesita leer el estado de las plantillas
 * para el mismo tenant, y cuando exista su `/api/cron/line-health` tiene que
 * llamar a ESTA función con lo que le devuelva `GET /v1/whatsapp/templates`, no
 * escribir su propia promoción. `refreshTemplateStatusFromProvider()` (abajo)
 * ya deja armado ese camino para una plantilla suelta.
 *
 * NO hay poll periódico implementado, y es deliberado: el webhook es el camino
 * documentado y montar un cron duplicado antes de verlo fallar en producción es
 * trabajo que puede no hacer falta.
 */
export async function applyProviderTemplateStatus(
  input: ProviderTemplateStatusInput
): Promise<TemplateStatusOutcome> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('template_versions')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('provider', input.provider)
    .eq('provider_ref', input.providerRef)
    .eq('language', input.language)
    .maybeSingle()

  if (error) {
    console.error('[Templates] Error buscando la versión del evento:', error.message)
    return { handled: false, reason: 'error de lectura' }
  }
  if (!data) {
    // Normal: el tenant puede tener plantillas creadas fuera del panel (alta por
    // el AIOS, pruebas manuales). No es un fallo.
    return { handled: false, reason: `sin versión registrada para ${input.providerRef}` }
  }

  const version = data as TemplateVersion
  const now = new Date().toISOString()

  if (input.status === 'APPROVED') {
    if (version.is_current) {
      return { handled: true, action: 'noted', templateKey: version.template_key }
    }
    // Una versión RETIRADA no vuelve. `retired` significa que ya la reemplazó
    // otra (o que se la retiró a mano para rehacer el texto): promoverla acá
    // pisaría el puntero con el mensaje viejo y degradaría a la vigente, sin
    // que nadie apretara nada. Pasa de verdad — Meta aprueba con 24-72h de
    // retraso, y en ese hueco cabe una edición entera.
    if (version.status === 'retired') {
      return {
        handled: true,
        action: 'noted',
        templateKey: version.template_key,
        reason: `${input.providerRef} ya estaba retirada: se ignora la aprobación tardía`,
      }
    }
    await promoteVersion(version)
    return { handled: true, action: 'promoted', templateKey: version.template_key }
  }

  if (input.status === 'REJECTED') {
    // La vigente NO se toca: sigue enviándose. Paso 4 del flujo del §12.
    const { error: rejectError } = await supabase
      .from('template_versions')
      .update({ status: 'rejected', rejection_reason: input.reason ?? null, resolved_at: now })
      .eq('id', version.id)
      .eq('status', 'pending')

    // El envío sigue a salvo (la vigente no se tocó), pero sin esto el webhook devolvía
    // `handled: true, action: 'rejected'` aunque el UPDATE hubiera fallado: la versión se
    // quedaba en `pending` para siempre y el dueño nunca ve el motivo del rechazo de Meta.
    if (rejectError) {
      logDbFailure({
        scope: 'Templates',
        reason: 'reject_version_update_error',
        error: rejectError,
        context: { tenant_id: input.tenantId, provider_ref: input.providerRef, version_id: version.id },
      })
    }

    console.warn(
      `[Templates] Meta rechazó ${input.providerRef} (tenant ${input.tenantId}): ${input.reason ?? 'sin motivo'}`
    )
    return { handled: true, action: 'rejected', templateKey: version.template_key }
  }

  // PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION: Meta puede pausar una
  // plantilla YA vigente por baja calidad. El §12 no dice qué hacer con eso y no
  // se inventa una política aquí (Mandamiento I): se deja constancia visible y
  // el puntero no se toca. Es material del Bloque 3 de gobernanza de envío.
  console.warn(
    `[Templates] ${input.providerRef} pasó a ${input.status} (tenant ${input.tenantId}) — puntero sin cambios`
  )
  return { handled: true, action: 'noted', templateKey: version.template_key }
}

/**
 * Camino de respaldo del detector: pregunta el estado de UNA plantilla pendiente
 * y lo procesa por la misma puerta. Sirve para reprocesar a mano un evento que
 * se perdió, y es el gancho que el Bloque 3 puede reutilizar sin duplicar la
 * lógica de promoción.
 */
export async function refreshTemplateStatusFromProvider(
  tenant: Tenant,
  version: TemplateVersion
): Promise<TemplateStatusOutcome> {
  assertZernioTenant(tenant)
  const detail = await getZernioTemplateStatus(
    tenant.zernio_account_id,
    version.provider_ref,
    version.language
  )
  return applyProviderTemplateStatus({
    provider: 'zernio',
    tenantId: tenant.id,
    providerRef: version.provider_ref,
    language: version.language,
    status: detail.template.status,
    reason: detail.template.rejected_reason ?? null,
  })
}

export { CATALOG_SIZE }
