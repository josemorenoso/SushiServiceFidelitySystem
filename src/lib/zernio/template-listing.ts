/**
 * Proyección del listado de plantillas de Zernio a la forma que ya consumen
 * las pantallas del panel (`GET /api/dashboard/templates`): el asistente de
 * Golden Bullet, las campañas manuales, las burbujas de riesgo. Esa forma nació
 * con Twilio (`sid`, `friendly_name`, `approval_status`…) y no se cambia: lo
 * que cambia es de dónde salen los valores.
 *
 * Lo único que importa recordar: en Zernio el `sid` ES el nombre. Es lo que
 * `sendTemplateMessage()` manda como `templateName` en el camino Zernio, así que
 * una pantalla que elige una plantilla de acá y la manda como `template_sid`
 * funciona sin saber de qué proveedor vino.
 *
 * PURA: se prueba con el JSON que devuelve `GET /v1/whatsapp/templates`.
 */

import type { ZernioListedTemplateComponent, ZernioTemplateSummary } from './messaging'

export interface ListedTemplateItem {
  sid: string
  friendly_name: string
  name: string
  language: string
  approval_status: string
  status: string
  category: string
  body: string
  has_media: boolean
  media_needs_variable: boolean
  rejection_reason: string | null
  variables: Record<string, string>
  createdAt: string | null
  updatedAt: string | null
  /** Solo Zernio: los títulos de los botones de respuesta rápida, si los hay. */
  buttons?: string[]
}

function componentOf(t: ZernioTemplateSummary, type: string): ZernioListedTemplateComponent | undefined {
  return (t.components ?? []).find((c) => String(c.type ?? '').toUpperCase() === type)
}

/**
 * Meta devuelve el estado en mayúsculas (`APPROVED`); las pantallas comparan
 * contra el minúsculas que dejó Twilio (`approved`, `pending`, `rejected`).
 * `PAUSED`/`DISABLED` se muestran tal cual en minúsculas: no son aprobadas y
 * las pantallas que filtran por `approved` las dejan fuera, que es lo correcto.
 */
export function mapZernioTemplateToItem(t: ZernioTemplateSummary): ListedTemplateItem {
  const body = componentOf(t, 'BODY')
  const header = componentOf(t, 'HEADER')
  const buttons = componentOf(t, 'BUTTONS')
  const headerFormat = String(header?.format ?? '').toUpperCase()
  const hasMedia = headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT'

  const bodyText = typeof body?.text === 'string' && body.text.trim() ? body.text : '(tipo no textual)'
  const variables: Record<string, string> = {}
  for (const m of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) variables[m[1]] = ''

  const titles = (buttons?.buttons ?? [])
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)

  const status = String(t.status ?? 'pending').toLowerCase()

  return {
    sid: t.name,
    friendly_name: t.name,
    name: t.name,
    language: t.language,
    approval_status: status,
    status,
    category: t.category ?? 'MARKETING',
    body: bodyText,
    has_media: hasMedia,
    // En Zernio la media viaja aparte en cada envío (`headerMedia`), nunca como
    // variable dentro de la URL: ninguna plantilla necesita una variable extra.
    media_needs_variable: false,
    rejection_reason: null,
    variables,
    createdAt: null,
    updatedAt: null,
    ...(titles.length > 0 ? { buttons: titles } : {}),
  }
}
