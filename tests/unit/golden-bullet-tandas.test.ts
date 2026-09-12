/**
 * Golden Bullet por tandas desde el panel (2026-09-12).
 *
 * Lo que se prueba acá es PURO a propósito: la foto de una base (lo que el
 * dueño mira después de la campaña: cuántos hay, cuántos esperan, quién se
 * registró, quién dijo que no), lo que la tanda siguiente hereda de la
 * anterior, y los items de cola de una tanda. Es lo que garantiza que la base
 * entera se vea aunque la cola esté vacía y que nadie reciba dos mensajes.
 *
 * Ref: docs/features/golden-bullet.md § «Bases y tandas»
 */

import { describe, it, expect } from 'vitest'
import {
  resumirBase,
  heredarDeCampana,
  armarItemsDeCola,
  planBlocks,
  type FilaDeBase,
  type FilaEnCola,
} from '@/services/imported-contacts.service'

const AHORA = new Date('2026-09-12T15:00:00.000Z')
const BASE = 'b-1'

function fila(p: Partial<FilaDeBase> & { status: string }): FilaDeBase {
  return {
    source_batch: BASE,
    source_file: 'recientes.csv',
    message_sent_at: null,
    campaign_id: 'c-1',
    twilio_sid: null,
    created_at: '2026-09-11T10:00:00.000Z',
    ...p,
  }
}

describe('resumirBase — la foto de una base', () => {
  it('la base terminada sigue mostrando registrados y rechazos: es lo que desapareció el 11', () => {
    const filas: FilaDeBase[] = [
      ...Array.from({ length: 6 }, () => fila({ status: 'converted', message_sent_at: '2026-09-11T20:00:00.000Z' })),
      ...Array.from({ length: 30 }, () => fila({ status: 'opted_out' })),
      ...Array.from({ length: 900 }, () => fila({ status: 'sent', message_sent_at: '2026-09-11T20:00:00.000Z' })),
      ...Array.from({ length: 4 }, () => fila({ status: 'bounced' })),
    ]
    const b = resumirBase(BASE, filas, [], new Set(), null, AHORA)

    expect(b.total).toBe(940)
    expect(b.pending).toBe(0)
    expect(b.programmed).toBe(940)
    expect(b.queued).toBe(0)
    expect(b.finished).toBe(true)
    // Esto es lo que tiene que seguir a la vista con la cola vacía.
    expect(b.converted).toBe(6)
    expect(b.optedOut).toBe(30)
    expect(b.bounced).toBe(4)
    expect(b.sent).toBe(906) // sent + converted; los opted_out y bounced no recibieron
    expect(b.sentToday).toBe(0)
  })

  it('separa la base entera de la tanda: total, programados y sin programar', () => {
    const filas: FilaDeBase[] = [
      ...Array.from({ length: 1000 }, () => fila({ status: 'sent', message_sent_at: AHORA.toISOString() })),
      ...Array.from({ length: 6438 }, () => fila({ status: 'valid', campaign_id: null })),
    ]
    const b = resumirBase(BASE, filas, [], new Set(), null, AHORA)

    expect(b.total).toBe(7438)
    expect(b.programmed).toBe(1000)
    expect(b.pending).toBe(6438)
    expect(b.batches).toBe(1)
    expect(b.sentToday).toBe(1000)
    // No terminó: quedan por programar aunque la cola esté vacía.
    expect(b.finished).toBe(false)
  })

  it('cuenta la cola de TODAS las tandas de la base y de ninguna otra campaña', () => {
    const filas: FilaDeBase[] = [
      ...Array.from({ length: 10 }, () => fila({ status: 'queued', campaign_id: 'c-1' })),
      ...Array.from({ length: 10 }, () => fila({ status: 'queued', campaign_id: 'c-2' })),
    ]
    const enCola: FilaEnCola[] = [
      ...Array.from({ length: 10 }, () => ({ campaign_id: 'c-1', not_before: '2026-09-12T00:00:00.000Z' })),
      ...Array.from({ length: 5 }, () => ({ campaign_id: 'c-2', not_before: '2026-09-13T00:00:00.000Z' })),
      ...Array.from({ length: 5 }, () => ({ campaign_id: 'c-2', not_before: '2026-09-14T00:00:00.000Z' })),
      // Otra campaña del tenant que NO es de esta base.
      { campaign_id: 'ajena', not_before: '2026-09-12T00:00:00.000Z' },
    ]
    const b = resumirBase(BASE, filas, enCola, new Set(), null, AHORA)

    expect(b.queued).toBe(20)
    expect(b.batches).toBe(2)
    expect(b.activeCampaignIds.sort()).toEqual(['c-1', 'c-2'])
    expect(b.nextBlockAt).toBe('2026-09-12T00:00:00.000Z')
    expect(b.nextBlockSize).toBe(10)
    expect(b.estimatedEndAt).toBe('2026-09-14T00:00:00.000Z')
    expect(b.paused).toBe(false)
  })

  it('pausada = toda la cola aparcada en el 9999', () => {
    const filas = [fila({ status: 'queued' })]
    const b = resumirBase(BASE, filas, [{ campaign_id: 'c-1', not_before: '9999-12-31T00:00:00.000Z' }], new Set(), null, AHORA)
    expect(b.paused).toBe(true)
    expect(b.nextBlockAt).toBeNull()
  })

  it('entregados: por el SID en message_logs (Zernio) o por el estado delivered', () => {
    const filas: FilaDeBase[] = [
      fila({ status: 'sent', twilio_sid: 'z1' }),
      fila({ status: 'sent', twilio_sid: 'z2' }),
      fila({ status: 'delivered', twilio_sid: 'z3' }),
      fila({ status: 'converted', twilio_sid: 'z4' }),
    ]
    const b = resumirBase(BASE, filas, [], new Set(['z1', 'z4']), null, AHORA)
    expect(b.delivered).toBe(3)
    expect(b.sent).toBe(4)
  })

  it('lo que la próxima tanda heredaría sale de la última campaña', () => {
    const filas = [
      ...Array.from({ length: 3 }, () => fila({ status: 'sent', campaign_id: 'c-1' })),
      ...Array.from({ length: 2 }, () => fila({ status: 'queued', campaign_id: 'c-2' })),
      fila({ status: 'valid', campaign_id: null }),
    ]
    const ultima = heredarDeCampana({
      id: 'c-2',
      filters: { template_sid: 'HX2', promo_text: 'un postre', fallback_name: 'amigo', plan: { blockSize: 2 }, tanda: 2 },
      message_template: 'un postre',
    })
    const b = resumirBase(BASE, filas, [], new Set(), ultima, AHORA)
    expect(b.campaignId).toBe('c-2')
    expect(b.blockSize).toBe(2)
    expect(b.lastBatch).toEqual({ templateSid: 'HX2', promoText: 'un postre', fallbackName: 'amigo', size: 2 })
  })
})

describe('heredarDeCampana — lo viejo y lo nuevo', () => {
  it('una campaña nueva trae todo en filters', () => {
    const h = heredarDeCampana({
      id: 'c',
      filters: { template_sid: 'HXn', promo_text: '', fallback_name: 'cliente', plan: { blockSize: 500 }, tanda: 3 },
      message_template: 'plantilla HXn',
    })
    expect(h).toMatchObject({ templateSid: 'HXn', promoText: '', fallbackName: 'cliente', blockSize: 500, tanda: 3 })
  })

  it('una campaña de antes del 12 sin promo: el SID se recupera del literal «plantilla HX…»', () => {
    const h = heredarDeCampana({ id: 'c', filters: { plan: { blockSize: 965 } }, message_template: 'plantilla HXviejo' })
    expect(h.templateSid).toBe('HXviejo')
    expect(h.promoText).toBe('')
    expect(h.tanda).toBe(1)
    expect(h.blockSize).toBe(965)
  })

  it('una campaña de antes del 12 CON promo: el SID se perdió y hay que pedirlo', () => {
    const h = heredarDeCampana({ id: 'c', filters: {}, message_template: 'un postre gratis' })
    expect(h.templateSid).toBeNull()
    expect(h.promoText).toBe('un postre gratis')
  })
})

describe('armarItemsDeCola — la tanda en la cola', () => {
  it('escalona not_before por bloque y rellena {{1}} con el nombre o el genérico', () => {
    const plan = planBlocks(5, 2, null, AHORA)
    const items = armarItemsDeCola(
      [
        { id: 'a', phone: '3001', name: 'Ana' },
        { id: 'b', phone: '3002', name: null },
        { id: 'c', phone: '3003', name: 'Cé' },
        { id: 'd', phone: '3004', name: null },
        { id: 'e', phone: '3005', name: 'Eli' },
      ],
      plan,
      { tenantId: 't', campaignId: 'c', templateSid: 'HX', promoText: '', fallbackName: '¿cómo estás?' }
    )
    expect(items).toHaveLength(5)
    expect(items.map((i) => i.notBefore!.getDate() - AHORA.getDate())).toEqual([0, 0, 1, 1, 2])
    expect(items[1].variables).toEqual({ '1': '¿cómo estás?' })
    expect(items[0].variables).toEqual({ '1': 'Ana' })
    expect(items.every((i) => i.messageType === 'import' && i.campaignId === 'c' && i.customerId === null)).toBe(true)
    expect(items[0].importedContactId).toBe('a')
  })

  it('{{2}} viaja solo si hay promo', () => {
    const plan = planBlocks(1, 1, null, AHORA)
    const [con] = armarItemsDeCola([{ id: 'a', phone: '3001', name: 'Ana' }], plan, {
      tenantId: 't', campaignId: 'c', templateSid: 'HX', promoText: 'un postre', fallbackName: 'cliente',
    })
    expect(con.variables).toEqual({ '1': 'Ana', '2': 'un postre' })
  })
})
