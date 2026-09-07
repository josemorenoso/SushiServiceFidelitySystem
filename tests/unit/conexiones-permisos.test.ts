import { describe, it, expect } from 'vitest'
import { emailsMatch, ownerDenialMessage } from '@/lib/tenant-owner'
import {
  parseAutoReplySetting,
  projectWhatsappConnection,
  AUTO_REPLY_DEFAULT,
} from '@/services/connection.service'

/**
 * Las dos piezas PURAS de Conexiones C1: quién es el dueño y qué apaga el interruptor.
 *
 * Se prueban aisladas porque de las dos cuelga algo caro. De `emailsMatch()` cuelga quién
 * puede gastar plata comprando una línea; de `parseAutoReplySetting()`, si el sistema le
 * contesta o no a los clientes reales de un restaurante.
 */

describe('emailsMatch — quién es el dueño del negocio', () => {
  it('compara sin distinguir mayúsculas ni espacios sobrantes', () => {
    // El caso real: `owner_email` lo pega el operador en el alta y el email del JWT lo
    // teclea el dueño al registrarse. Un espacio o una mayúscula bastarían para dejarlo
    // fuera de sus propios botones, y la causa sería invisible en pantalla.
    expect(emailsMatch('Dueno@Restaurante.com', '  dueno@restaurante.com ')).toBe(true)
    expect(emailsMatch('dueno@restaurante.com', 'DUENO@RESTAURANTE.COM')).toBe(true)
  })

  it('dos correos distintos no son la misma persona', () => {
    expect(emailsMatch('encargado@restaurante.com', 'dueno@restaurante.com')).toBe(false)
  })

  it('FAIL-CLOSED: sin `owner_email` nadie es el dueño', () => {
    // `owner_email IS NULL` ⇒ el tenant no tiene dueño registrado. La respuesta correcta
    // es "no", no "sí porque no hay con quién comparar": si esto devolviera true, un
    // tenant sin dueño le abriría los botones de compra a cualquier admin.
    expect(emailsMatch('dueno@restaurante.com', null)).toBe(false)
    expect(emailsMatch('dueno@restaurante.com', undefined)).toBe(false)
    expect(emailsMatch('dueno@restaurante.com', '')).toBe(false)
    expect(emailsMatch('dueno@restaurante.com', '   ')).toBe(false)
  })

  it('FAIL-CLOSED: una sesión sin email tampoco es el dueño', () => {
    expect(emailsMatch(null, 'dueno@restaurante.com')).toBe(false)
    expect(emailsMatch('', 'dueno@restaurante.com')).toBe(false)
  })

  it('dos vacíos no se "encuentran" entre sí', () => {
    // El bug clásico de comparar normalizados sin guardas: '' === '' sería true y un
    // usuario sin email quedaría de dueño de un tenant sin dueño.
    expect(emailsMatch('', '')).toBe(false)
    expect(emailsMatch(null, null)).toBe(false)
  })
})

describe('ownerDenialMessage — el 403 dice POR QUÉ', () => {
  it('un tenant sin dueño registrado lo dice, en vez de romperse', () => {
    // Es el criterio de término de C1: la pantalla lo tiene que DECIR.
    expect(ownerDenialMessage('sin_dueno_registrado')).toContain('registrar al dueño')
  })

  it('un admin que no es el dueño recibe otro texto', () => {
    expect(ownerDenialMessage('no_es_el_dueno')).toContain('dueño registrado')
    expect(ownerDenialMessage('no_es_el_dueno')).not.toBe(ownerDenialMessage('sin_dueno_registrado'))
  })

  it('un fallo de lectura no se disfraza de "no tienes permiso"', () => {
    // Fail-closed, pero honesto: la puerta se cierra y el texto invita a reintentar en
    // vez de mandar al dueño a pedirle permisos a nadie.
    expect(ownerDenialMessage('fallo_de_lectura')).toContain('Intenta de nuevo')
  })
})

describe('parseAutoReplySetting — el interruptor de §18.e', () => {
  it('la clave ausente deja el default, y el default es PRENDIDA', () => {
    // El producto no sabe hoy qué tenants son coexistentes (ese dato vive en el AIOS).
    // Un default "apagada" cambiaría en silencio el comportamiento vivo de las marcas de
    // Twilio.
    expect(AUTO_REPLY_DEFAULT).toBe(true)
    expect(parseAutoReplySetting(null)).toBe(true)
  })

  it("solo el literal 'false' apaga", () => {
    expect(parseAutoReplySetting('false')).toBe(false)
    expect(parseAutoReplySetting('true')).toBe(true)
  })

  it('un valor raro NO apaga: se prefiere seguir contestando a callar por accidente', () => {
    expect(parseAutoReplySetting('')).toBe(true)
    expect(parseAutoReplySetting('FALSE')).toBe(true)
    expect(parseAutoReplySetting('0')).toBe(true)
    expect(parseAutoReplySetting('no')).toBe(true)
  })
})

describe('projectWhatsappConnection — la pantalla carga para Twilio y para Zernio', () => {
  const ZERNIO_OK = {
    messaging_provider: 'zernio',
    twilio_whatsapp_number: null,
    zernio_account_id: 'acc_123',
    zernio_phone_number: '+573001234567',
  }

  it('un tenant Zernio ve su número y la tarjeta NO es de solo lectura', () => {
    const v = projectWhatsappConnection(ZERNIO_OK, true)
    expect(v.provider).toBe('zernio')
    expect(v.phone).toBe('+573001234567')
    expect(v.configured).toBe(true)
    expect(v.readOnly).toBe(false)
  })

  it('Zernio con número pero SIN cuenta no está "activa"', () => {
    // Es la invariante exacta que corta `sendViaZernio()` con `zernio_not_configured`.
    // Pintar "activa" acá le diría al cliente que todo está bien mientras no sale ni un
    // mensaje.
    const v = projectWhatsappConnection({ ...ZERNIO_OK, zernio_account_id: null }, true)
    expect(v.configured).toBe(false)
  })

  it('un tenant Twilio ve una tarjeta de SOLO LECTURA con su propio número', () => {
    const v = projectWhatsappConnection(
      {
        messaging_provider: 'twilio',
        twilio_whatsapp_number: 'whatsapp:+573009998877',
        zernio_account_id: null,
        zernio_phone_number: null,
      },
      true
    )
    expect(v.provider).toBe('twilio')
    expect(v.readOnly).toBe(true)
    expect(v.configured).toBe(true)
    // El dato se devuelve TAL CUAL está guardado; el prefijo `whatsapp:` solo se le quita
    // al pintarlo. La pantalla no reescribe columnas de mensajería.
    expect(v.phone).toBe('whatsapp:+573009998877')
  })

  it('la auto-respuesta solo APLICA por el camino Twilio', () => {
    // El webhook de Zernio nunca mandó una auto-respuesta. Sin este dato, la pantalla le
    // ofrecería a un tenant Zernio apagar algo que no está prendido.
    expect(projectWhatsappConnection(ZERNIO_OK, true).autoReplyApplies).toBe(false)
    expect(
      projectWhatsappConnection(
        { messaging_provider: 'twilio', twilio_whatsapp_number: '+57300', zernio_account_id: null, zernio_phone_number: null },
        true
      ).autoReplyApplies
    ).toBe(true)
  })

  it('un `messaging_provider` desconocido o nulo cae en Twilio, que es el default de la columna', () => {
    expect(
      projectWhatsappConnection(
        { messaging_provider: null, twilio_whatsapp_number: null, zernio_account_id: null, zernio_phone_number: null },
        true
      ).provider
    ).toBe('twilio')
  })

  it('una marca sin ninguna línea lo dice: `configured: false`', () => {
    const v = projectWhatsappConnection(
      { messaging_provider: 'twilio', twilio_whatsapp_number: null, zernio_account_id: null, zernio_phone_number: null },
      true
    )
    expect(v.configured).toBe(false)
    expect(v.phone).toBeNull()
  })
})
