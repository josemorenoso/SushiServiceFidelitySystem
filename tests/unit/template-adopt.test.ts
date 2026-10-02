/**
 * `findAdoptable()`: qué plantilla ya aprobada en la WABA se puede conectar a un
 * mensaje del catálogo. Conectar una con otras variables o con otra portada
 * haría fallar cada envío en Meta, así que la regla se fija acá.
 *
 * Caso real: Planeta Wings, 2026-10-02 — el alta creó las 13 en Meta sin
 * registrarlas, quedaron aprobadas y el panel las ofrecía «Enviar a Meta», que
 * chocaba con «Ya existe contenido en Spanish para esta plantilla».
 */

import { describe, expect, it } from 'vitest'
import { findAdoptable } from '@/services/template.service'
import { TEMPLATE_CATALOG_BY_KEY } from '@/constants/template-catalog'
import type { ZernioTemplateSummary } from '@/lib/zernio/messaging'
import type { TemplateVersion } from '@/types/template.types'

const far = TEMPLATE_CATALOG_BY_KEY.points_earned_far
const eventImage = TEMPLATE_CATALOG_BY_KEY.event_image

function waba(
  name: string,
  body: string,
  extra: Partial<ZernioTemplateSummary> & { header?: string } = {}
): ZernioTemplateSummary {
  const { header, ...rest } = extra
  return {
    id: `id_${name}`,
    name,
    status: 'APPROVED',
    category: 'MARKETING',
    language: 'es',
    components: [
      ...(header ? [{ type: 'HEADER', format: header }] : []),
      { type: 'BODY', text: body },
    ],
    ...rest,
  }
}

const FOUR_VARS = '¡{{1}}, sumaste {{2}} puntos! Llevas {{3}}. Te falta: {{4}}. Responde SALIR para no recibir más.'

describe('findAdoptable', () => {
  it('conecta la aprobada con el nombre base y las mismas variables', () => {
    const r = findAdoptable(far, [waba('puntos_sumados_lejos', FOUR_VARS)], [])
    expect(r?.name).toBe('puntos_sumados_lejos')
    expect(r?.body).toBe(FOUR_VARS)
    expect(r?.id).toBe('id_puntos_sumados_lejos')
  })

  it('entre varias versiones gana la _vN más alta', () => {
    const r = findAdoptable(
      far,
      [waba('puntos_sumados_lejos', FOUR_VARS), waba('puntos_sumados_lejos_v3', FOUR_VARS), waba('puntos_sumados_lejos_v2', FOUR_VARS)],
      []
    )
    expect(r?.name).toBe('puntos_sumados_lejos_v3')
  })

  it('no conecta una que no está aprobada', () => {
    expect(findAdoptable(far, [waba('puntos_sumados_lejos', FOUR_VARS, { status: 'PENDING' })], [])).toBeNull()
    expect(findAdoptable(far, [waba('puntos_sumados_lejos', FOUR_VARS, { status: 'PAUSED' })], [])).toBeNull()
  })

  it('no conecta una con otras variables: cada envío fallaría en Meta', () => {
    expect(findAdoptable(far, [waba('puntos_sumados_lejos', 'Hola {{1}}, sumaste {{2}}. SALIR')], [])).toBeNull()
    expect(
      findAdoptable(far, [waba('puntos_sumados_lejos', `${FOUR_VARS} {{5}}`)], [])
    ).toBeNull()
  })

  it('no confunde nombres parecidos de otro mensaje', () => {
    expect(findAdoptable(far, [waba('puntos_sumados_lejos_foto', FOUR_VARS)], [])).toBeNull()
    expect(findAdoptable(far, [waba('puntos_sumados_cerca', FOUR_VARS)], [])).toBeNull()
  })

  it('exige la misma portada que manda el sistema', () => {
    const eventBody = '{{1}} te invita: {{2}} el {{3}} a las {{4}}. {{5}}. Responde SALIR.'.replace(/^/, 'Hola, ')
    expect(findAdoptable(eventImage, [waba('evento_imagen', eventBody, { header: 'IMAGE' })], [])?.name).toBe(
      'evento_imagen'
    )
    expect(findAdoptable(eventImage, [waba('evento_imagen', eventBody)], [])).toBeNull()
    expect(findAdoptable(eventImage, [waba('evento_imagen', eventBody, { header: 'VIDEO' })], [])).toBeNull()
    expect(findAdoptable(far, [waba('puntos_sumados_lejos', FOUR_VARS, { header: 'IMAGE' })], [])).toBeNull()
  })

  it('no resucita una versión que nosotros retiramos', () => {
    const retired = { provider_ref: 'puntos_sumados_lejos_v2', status: 'retired' } as TemplateVersion
    const r = findAdoptable(
      far,
      [waba('puntos_sumados_lejos', FOUR_VARS), waba('puntos_sumados_lejos_v2', FOUR_VARS)],
      [retired]
    )
    expect(r?.name).toBe('puntos_sumados_lejos')
  })

  it('ignora otro idioma', () => {
    expect(findAdoptable(far, [waba('puntos_sumados_lejos', FOUR_VARS, { language: 'en' })], [])).toBeNull()
  })
})
