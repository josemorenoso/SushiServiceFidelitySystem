/**
 * Los textos editables de Golden Bullet (2026-09-11): el cuerpo y los botones
 * de la plantilla, y las respuestas al «sí» y al «no».
 *
 * Todo lo que se prueba acá es PURO a propósito: es exactamente lo que el
 * operador escribe en el panel, y lo que rompería el envío si se escribe mal.
 *
 * Ref: docs/features/golden-bullet.md
 */

import { describe, it, expect } from 'vitest'
import {
  validarCuerpoClub,
  validarBoton,
  variablesDelCuerpo,
  BOTON_MAX,
  CUERPO_MAX,
} from '@/services/golden-bullet-template.service'
import {
  renderClubReply,
  detectClubButton,
  CLUB_PAYLOAD_SI,
  RESPUESTA_SI_DEFECTO,
  RESPUESTA_NO_DEFECTO,
} from '@/services/club-optin.service'
import { plantillaCompatible } from '@/components/dashboard/ImportedContactsUploader'

const MENSAJE_1 =
  'Hola, {{1}} ❤️\nSomos Sushi Service 🍣\n\n' +
  'Hace un tiempo compartiste tus datos con nosotros y estamos actualizando nuestra comunidad.\n\n' +
  'Y como estamos celebrando el mes del Amor y la Amistad, tenemos un regalo especial preparado para ti 🎁\n\n' +
  '¿Quieres seguir siendo parte de nuestra comunidad?'

describe('validarCuerpoClub — lo que tiene que cumplir el mensaje 1', () => {
  it('acepta un mensaje con {{1}} y sin {{2}}', () => {
    expect(validarCuerpoClub(MENSAJE_1)).toBeNull()
  })

  it('acepta {{1}} y {{2}}', () => {
    expect(validarCuerpoClub('Hola {{1}}, te damos {{2}}')).toBeNull()
  })

  it('exige {{1}}: sin nombre el envío rellena una variable que no existe', () => {
    expect(validarCuerpoClub('Hola, tenemos un regalo para ti')).toMatch(/\{\{1\}\}/)
  })

  it('rechaza una tercera variable: el drenador solo rellena dos', () => {
    expect(validarCuerpoClub('Hola {{1}}, tenés {{2}} puntos y {{3}}')).toMatch(/\{\{3\}\}/)
  })

  it('rechaza el vacío y lo que pasa del tope de Meta', () => {
    expect(validarCuerpoClub('   ')).not.toBeNull()
    expect(validarCuerpoClub('{{1}} ' + 'x'.repeat(CUERPO_MAX))).toMatch(/1024/)
  })

  it('el asistente y el servidor ven las mismas variables', () => {
    // `plantillaCompatible` (navegador) y `validarCuerpoClub` (servidor) no
    // pueden divergir: lo que uno acepta el otro tiene que aceptarlo.
    for (const body of [MENSAJE_1, 'Hola {{1}} y {{2}}', 'Solo {{2}}', '{{1}} {{3}}', '']) {
      expect(plantillaCompatible(body)).toBe(validarCuerpoClub(body) === null)
    }
    expect([...variablesDelCuerpo('{{ 1 }} y {{2}}')]).toEqual([1, 2])
  })
})

describe('validarBoton — los títulos de los botones', () => {
  it('«Sí, quiero mi regalo» cabe justo en los 20 de WhatsApp', () => {
    expect([...'Sí, quiero mi regalo'].length).toBe(BOTON_MAX)
    expect(validarBoton('Sí, quiero mi regalo', 'sí')).toBeNull()
  })

  it('con el emoji delante ya no cabe', () => {
    expect(validarBoton('🟢 Sí, quiero mi regalo', 'sí')).toMatch(/20/)
  })

  it('un botón vacío no es un botón', () => {
    expect(validarBoton('   ', 'no')).not.toBeNull()
  })
})

describe('detectClubButton — reconoce los títulos que eligió el operador', () => {
  it('sin payload, el título elegido lo salva', () => {
    const labels = { si: 'Sí, quiero mi regalo', no: 'No, gracias' }
    expect(detectClubButton('Sí, quiero mi regalo', null, labels)).toBe('opt_in')
    expect(detectClubButton('sí, quiero mi regalo', null, labels)).toBe('opt_in')
  })

  it('el payload sigue mandando aunque el título sea otro', () => {
    expect(detectClubButton('Sí, quiero mi regalo', CLUB_PAYLOAD_SI)).toBe('opt_in')
  })

  it('sin etiquetas guardadas, un título nuevo NO se reconoce por texto', () => {
    // Es lo esperado: el respaldo por texto es exacto a propósito, para no
    // confundir un «sí» de un cliente de domicilios con un opt-in.
    expect(detectClubButton('Sí, quiero mi regalo')).toBeNull()
  })
})

describe('renderClubReply — los comodines de las respuestas', () => {
  const ctx = { nombre: 'Daniela', enlace: 'https://clubsushiservice.constelarys.com/c/amor', marca: 'Sushi Service' }

  it('rellena nombre, enlace y marca', () => {
    const t = renderClubReply('🥰 ¡Qué alegría tenerte por aquí, {nombre}!\nRegistrate acá: {enlace}\n— {marca}', ctx)
    expect(t).toBe('🥰 ¡Qué alegría tenerte por aquí, Daniela!\nRegistrate acá: https://clubsushiservice.constelarys.com/c/amor\n— Sushi Service')
  })

  it('sin nombre, se va con la coma: «por aquí!» y no «por aquí, !»', () => {
    const t = renderClubReply('¡Qué alegría tenerte por aquí, {nombre}!', { ...ctx, nombre: null })
    expect(t).toBe('¡Qué alegría tenerte por aquí!')
  })

  it('sin nombre, {nombre|¿cómo estás?} usa el alternativo y conserva la coma', () => {
    const t = renderClubReply('¡Qué alegría tenerte por aquí, {nombre|¿cómo estás?}', { ...ctx, nombre: null })
    expect(t).toBe('¡Qué alegría tenerte por aquí, ¿cómo estás?')
  })

  it('con nombre, el alternativo no aparece', () => {
    const t = renderClubReply('Hola, {nombre|¿cómo estás?}!', ctx)
    expect(t).toBe('Hola, Daniela!')
  })

  it('un alternativo vacío se comporta como {nombre} a secas', () => {
    expect(renderClubReply('Hola, {nombre|}!', { ...ctx, nombre: null })).toBe('Hola!')
  })

  it('sin enlace, se va la línea entera del enlace', () => {
    const t = renderClubReply('Gracias.\nAbrí este enlace:\n{enlace}\nNos vemos.', { ...ctx, enlace: null })
    expect(t).toBe('Gracias.\nAbrí este enlace:\nNos vemos.')
    expect(t).not.toContain('{enlace}')
  })

  it('los textos de defecto salen completos con todo', () => {
    const si = renderClubReply(RESPUESTA_SI_DEFECTO, ctx)
    expect(si).toContain('Daniela')
    expect(si).toContain(ctx.enlace)
    expect(si).toContain('Sushi Service')
    expect(si).not.toMatch(/\{(nombre|enlace|marca)\}/)
    const no = renderClubReply(RESPUESTA_NO_DEFECTO, { nombre: null, enlace: null, marca: 'Sushi Service' })
    expect(no).toContain('Sushi Service')
    expect(no).not.toMatch(/\{(nombre|enlace|marca)\}/)
  })

  it('no deja tres saltos de línea seguidos cuando desaparece una línea', () => {
    const t = renderClubReply('Hola\n\n{enlace}\n\nChau', { ...ctx, enlace: null })
    expect(t).toBe('Hola\n\nChau')
  })
})
