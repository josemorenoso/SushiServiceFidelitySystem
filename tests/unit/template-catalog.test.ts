/**
 * El banco de textos de plantillas, contra las reglas duras de Meta.
 *
 * POR QUÉ IMPORTA: cada uno de los 13 textos es una aprobación de Meta aparte,
 * y el veredicto tarda 24-72h. Un texto que empieza
 * con una variable, que pierde un `{{n}}` que el backend sí manda, o que se
 * olvida la línea de opt-out en una plantilla MARKETING, no falla aquí: falla
 * dos días después, en producción, contra la reputación del número del cliente.
 * Esta prueba mueve ese fallo al momento de escribir el texto.
 *
 * No toca base de datos ni red.
 */

import { describe, it, expect } from 'vitest'
import {
  TEMPLATE_CATALOG,
  TEMPLATE_CATALOG_BY_KEY,
  CATALOG_SIZE,
  DEFAULT_TEMPLATE_STYLE,
  FALLBACK_TEMPLATE_EMOJI,
  TEMPLATE_EMOJI_BY_BUSINESS_TYPE,
  assertCatalogTextsAreValid,
  buildTemplateBody,
  resolveTemplateEmoji,
  buildTemplateExample,
  detectTemplateStyle,
  renderTemplatePreview,
  validateTemplateBody,
  normalizeTemplateName,
  validateTemplateName,
} from '@/constants/template-catalog'
import { OPT_OUT_LINE } from '@/constants/template-texts'

const MARCA = 'Sabor Urbano'
const RESTAURANTE = TEMPLATE_EMOJI_BY_BUSINESS_TYPE.restaurant

describe('catálogo estándar', () => {
  it('tiene exactamente las 13 plantillas que declara CATALOG_SIZE', () => {
    expect(TEMPLATE_CATALOG).toHaveLength(CATALOG_SIZE)
  })

  it('no repite settingsKey ni baseName — los dos son identificadores', () => {
    const settingsKeys = TEMPLATE_CATALOG.map((t) => t.settingsKey)
    const baseNames = TEMPLATE_CATALOG.map((t) => t.baseName)
    expect(new Set(settingsKeys).size).toBe(settingsKeys.length)
    expect(new Set(baseNames).size).toBe(baseNames.length)
  })

  it('todos los baseName cumplen el regex de nombre de Meta/Zernio', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.baseName, t.key).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('las variables de cada plantilla son 1..n sin huecos', () => {
    for (const t of TEMPLATE_CATALOG) {
      const indices = t.variables.map((v) => v.index)
      expect(indices, t.key).toEqual(indices.map((_, i) => i + 1))
    }
  })
})

describe('banco de textos', () => {
  it('los 13 textos pasan las reglas de Meta', () => {
    expect(assertCatalogTextsAreValid(MARCA)).toEqual([])
  })

  it('toda plantilla MARKETING cierra con la línea de opt-out', () => {
    for (const t of TEMPLATE_CATALOG) {
      if (t.category !== 'MARKETING') continue
      expect(buildTemplateBody(t.key, MARCA).trim().endsWith(OPT_OUT_LINE), t.key).toBe(true)
    }
  })

  it('la bienvenida es UTILITY y NO lleva opt-out', () => {
    const welcome = TEMPLATE_CATALOG_BY_KEY.welcome
    expect(welcome.category).toBe('UTILITY')
    expect(buildTemplateBody('welcome', MARCA)).not.toContain('SALIR')
  })

  it('el texto sigue siendo el port literal, con el emoji del negocio', () => {
    // Muestra de control: si alguien "mejora" el default sin decisión del dueño,
    // esto se cae. §12 respuesta 2: "Sin cambios en el default".
    // Lo ÚNICO que cambió respecto al texto original de Sushi Service es que el
    // 🍣 dejó de estar horneado — ahora lo pone el tipo de negocio.
    expect(buildTemplateBody('welcome', MARCA, RESTAURANTE)).toBe(
      `¡Hola {{1}}! 🎉${RESTAURANTE}\n\nBienvenid@ a *${MARCA}*, nos alegra que seas parte de nuestro club\n\nEn cada visita sumas puntos y recibes premios reales — Hoy recibiste *{{2}} puntos* 🎉\n\nAsí funciona tu camino de recompensas 👇\n\n{{3}}\n\n¡Te esperamos pronto!\n\n_— ${MARCA}_`
    )
  })

  it('el nombre del negocio queda interpolado, sin marcadores sueltos', () => {
    for (const t of TEMPLATE_CATALOG) {
      const body = buildTemplateBody(t.key, MARCA)
      expect(body, t.key).not.toContain('${')
      expect(body, t.key).not.toContain('{negocio}')
    }
  })

  it('las plantillas de evento NO hornean la marca: viaja en {{2}}', () => {
    for (const key of ['event_image', 'event_video'] as const) {
      expect(buildTemplateBody(key, MARCA), key).not.toContain(MARCA)
      expect(buildTemplateExample(key, MARCA)[1]).toBe(MARCA)
    }
  })

  it('las dos de evento dicen EXACTAMENTE lo mismo: solo cambia el header', () => {
    // Meta congela el formato del header al aprobar, así que la invitación tiene
    // que registrarse dos veces (imagen y video). El texto, no: dos literales
    // gemelos se despegan al primer retoque y el cliente recibe un mensaje
    // distinto según haya subido un JPG o un MP4.
    expect(buildTemplateBody('event_video', MARCA, RESTAURANTE)).toBe(
      buildTemplateBody('event_image', MARCA, RESTAURANTE)
    )
    expect(TEMPLATE_CATALOG_BY_KEY.event_video.variables).toEqual(
      TEMPLATE_CATALOG_BY_KEY.event_image.variables
    )
  })

  it('en las de evento, después de {{5}} no hay UNA palabra nuestra', () => {
    // El mensaje lo escribe el dueño en el formulario: {{5}} es su descripción
    // con el enlace pegado. El texto viejo remataba con "¡Te esperamos con tu
    // familia!" DESPUÉS de eso, o sea que le pisaba el llamado a la acción que
    // acababa de escribir. Debajo de {{5}} solo puede quedar el aviso de SALIR,
    // que es lo único que Meta obliga a poner ahí.
    for (const key of ['event_image', 'event_video'] as const) {
      const cuerpo = buildTemplateBody(key, MARCA, RESTAURANTE)
      expect(cuerpo.trim().endsWith(`{{5}}\n\n${OPT_OUT_LINE}`), key).toBe(true)
    }
  })

  it('TODO el banco tiene texto fijo suficiente para Meta: 3 palabras por variable + 1', () => {
    // Meta rechaza con INVALID_FORMAT ("too many variable parameters relative
    // to the message length"). La proporción documentada es 3×N+1 palabras
    // fijas para N variables. El primer "marco mínimo" de evento tenía 8
    // palabras para 5 variables y Meta lo rechazó en segundos (2026-09-11).
    // Esto es lo contrario de "menos texto es mejor": hay un piso.
    const palabras = (body: string) =>
      body.replace(/\{\{\d+\}\}/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
    for (const t of TEMPLATE_CATALOG) {
      const body = buildTemplateBody(t.key, MARCA, RESTAURANTE)
      const minimo = 3 * t.variables.length + 1
      expect(palabras(body), `${t.key}: ${palabras(body)} palabras, mínimo ${minimo}`).toBeGreaterThanOrEqual(minimo)
    }
  })

  it('las de evento no hornean un momento del día ni una compañía', () => {
    // El calendario no filtra por hora y su campo Tipo incluye promo,
    // activación y aniversario: "vivir una noche especial" salía igual en una
    // promo de mediodía. Y "con tu familia" no lo decide el texto: lo decide el
    // dueño en la descripción, que viaja en {{5}}.
    const PROHIBIDOS = ['noche', 'familia', 'mediodía', 'tarde']
    for (const key of ['event_image', 'event_video'] as const) {
      const cuerpo = buildTemplateBody(key, MARCA, RESTAURANTE).toLowerCase()
      for (const palabra of PROHIBIDOS) {
        expect(cuerpo, `${key} hornea "${palabra}"`).not.toContain(palabra)
      }
    }
  })

  it('en TODO el banco las variables van en orden ascendente', () => {
    // Los 11 de texto ya cumplían esto sin que nadie lo hubiera escrito. Las 2
    // de evento no: con la firma de la marca al final el
    // cuerpo quedaba `1,3,4,5,2`. Meta numera en orden de aparición y un rechazo
    // por esto no se ve al crear la plantilla — se ve 24-72h después, cuando ya
    // se sometió en las 25 cuentas.
    for (const t of TEMPLATE_CATALOG) {
      const orden = [...buildTemplateBody(t.key, MARCA, RESTAURANTE).matchAll(/\{\{(\d+)\}\}/g)]
        .map((m) => Number(m[1]))
      const ascendente = [...orden].sort((a, b) => a - b)
      expect(orden, `${t.key}: ${orden.join(',')}`).toEqual(ascendente)
    }
  })
})

describe('emoji de marca', () => {
  it('cada tipo de negocio tiene el suyo y ninguno es de comida japonesa', () => {
    expect(resolveTemplateEmoji('restaurant')).toBe('🍽️')
    expect(resolveTemplateEmoji('barbershop')).toBe('💈')
    expect(resolveTemplateEmoji('beauty_salon')).toBe('💅')
  })

  it('un tipo desconocido cae en el neutro, nunca en vacío', () => {
    expect(resolveTemplateEmoji(null)).toBe(FALLBACK_TEMPLATE_EMOJI)
    expect(resolveTemplateEmoji('gimnasio')).toBe(FALLBACK_TEMPLATE_EMOJI)
    // Vacío significa "no configurado", no "sin emoji": un emoji vacío dejaría
    // un espacio suelto dentro de un texto ya aprobado por Meta.
    expect(resolveTemplateEmoji('restaurant', '   ')).toBe('🍽️')
  })

  it('el override del tenant manda sobre el tipo de negocio', () => {
    expect(resolveTemplateEmoji('restaurant', '🍣')).toBe('🍣')
  })

  it('NINGÚN texto del banco trae un emoji de rubro horneado', () => {
    // La regresión concreta: los textos `calido` nacieron para Sushi Service con
    // 🍣 escrito a mano, y como Meta aprueba el texto literal, ese sushi le
    // llegaba igual a una barbería.
    const PROHIBIDOS = ['🍣', '🍕', '🍔', '🌮', '☕', '🍜', '🥢', '💈', '💅', '🍽️']
    for (const t of TEMPLATE_CATALOG) {
      const body = buildTemplateBody(t.key, MARCA, '§')
      for (const emoji of PROHIBIDOS) {
        expect(body, `${t.key} trae ${emoji} horneado`).not.toContain(emoji)
      }
    }
  })

  it('el emoji viaja de verdad al cuerpo: dos negocios distintos, textos distintos', () => {
    const barberia = buildTemplateBody('welcome', MARCA, resolveTemplateEmoji('barbershop'))
    const restaurante = buildTemplateBody('welcome', MARCA, RESTAURANTE)
    expect(barberia).not.toBe(restaurante)
    expect(barberia).toContain('💈')
    expect(restaurante).toContain('🍽️')
  })

  it('detectTemplateStyle sigue reconociendo el texto del banco con el emoji del negocio', () => {
    // Si el detector usara otro emoji que el constructor, un texto SIN editar se
    // marcaría "personalizado" y la pantalla le mentiría al dueño.
    const emoji = resolveTemplateEmoji('barbershop')
    const body = buildTemplateBody('points_earned_far', MARCA, emoji)
    expect(detectTemplateStyle('points_earned_far', body, MARCA, emoji)).toBe(DEFAULT_TEMPLATE_STYLE)
  })
})

describe('validateTemplateBody', () => {
  it('rechaza empezar o terminar con variable', () => {
    const opciones = { category: 'UTILITY', expectedVariables: 1 }
    expect(validateTemplateBody('{{1}} bienvenido', opciones).join()).toContain('EMPEZAR')
    expect(validateTemplateBody('Bienvenido {{1}}', opciones).join()).toContain('TERMINAR')
  })

  it('rechaza que falte una variable que el backend sí manda', () => {
    const issues = validateTemplateBody('Hola {{1}}, gracias por venir.', {
      category: 'UTILITY',
      expectedVariables: 3,
    })
    expect(issues.join()).toContain('{{2}}')
    expect(issues.join()).toContain('{{3}}')
  })

  it('rechaza una variable que la plantilla no tiene', () => {
    const issues = validateTemplateBody('Hola {{1}}, tu premio es {{9}} y ya.', {
      category: 'UTILITY',
      expectedVariables: 1,
    })
    expect(issues.join()).toContain('{{9}}')
  })

  it('exige el opt-out solo en MARKETING', () => {
    const texto = 'Hola {{1}}, gracias por tu visita.'
    expect(validateTemplateBody(texto, { category: 'MARKETING', expectedVariables: 1 }).join()).toContain('SALIR')
    expect(validateTemplateBody(texto, { category: 'UTILITY', expectedVariables: 1 })).toEqual([])
  })

  it('rechaza pasarse de 1024 caracteres', () => {
    const largo = `Hola {{1}} ${'x'.repeat(1100)} fin.`
    expect(validateTemplateBody(largo, { category: 'UTILITY', expectedVariables: 1 }).join()).toContain('1024')
  })
})

describe('detectTemplateStyle', () => {
  it('reconoce un texto que salió tal cual del banco', () => {
    expect(detectTemplateStyle('birthday', buildTemplateBody('birthday', MARCA), MARCA)).toBe(DEFAULT_TEMPLATE_STYLE)
  })

  it('marca personalizado en cuanto el dueño toca una palabra', () => {
    const editado = buildTemplateBody('birthday', MARCA).replace('Feliz', 'Felicísimo')
    expect(detectTemplateStyle('birthday', editado, MARCA)).toBe('personalizado')
  })
})

describe('renderTemplatePreview', () => {
  it('sustituye cada variable por su valor de muestra', () => {
    const body = buildTemplateBody('birthday', MARCA)
    const preview = renderTemplatePreview('birthday', body, MARCA)
    expect(preview).not.toMatch(/\{\{\d+\}\}/)
    expect(preview).toContain('Sofía')
    expect(preview).toContain('95')
  })

  it('deja intacta una variable inventada en vez de romperse', () => {
    expect(renderTemplatePreview('birthday', 'Hola {{1}} y {{7}} fin', MARCA)).toBe('Hola Sofía y {{7}} fin')
  })
})

// El nombre con que la plantilla queda en Meta lo puede escribir el dueño desde
// el 2026-09-12 (13 creadas de golpe por el AIOS quedaron pegadas «en revisión»
// y la salida fue crearlas de a una con otro nombre). Estas dos funciones son
// lo único que separa lo que tipea de lo que Meta acepta.
describe('nombre de la plantilla en Meta', () => {
  it('normaliza lo que el dueño tipea a lo que Meta acepta', () => {
    expect(normalizeTemplateName('Bienvenida Planeta Wings')).toBe('bienvenida_planeta_wings')
    expect(normalizeTemplateName('Cumpleaños-2')).toBe('cumpleanos_2')
    expect(normalizeTemplateName('reactivación  suave!!')).toBe('reactivacion_suave')
    expect(normalizeTemplateName('evento__video')).toBe('evento_video')
  })

  it('el resultado de normalizar siempre pasa la validación (o queda vacío)', () => {
    for (const raw of ['Hola Mundo', 'ÁÉÍÓÚ ñ', 'x-y-z', 'ya_valido', '   ']) {
      const name = normalizeTemplateName(raw)
      if (name && /^[a-z]/.test(name)) expect(validateTemplateName(name)).toEqual([])
    }
  })

  it('rechaza vacío, mayúsculas, empezar por número y pasarse de largo', () => {
    expect(validateTemplateName('')).toHaveLength(1)
    expect(validateTemplateName('Bienvenida')).toHaveLength(1)
    expect(validateTemplateName('2bienvenida')).toHaveLength(1)
    expect(validateTemplateName('a'.repeat(513))).toHaveLength(1)
    expect(validateTemplateName('bienvenida_pw')).toEqual([])
  })

  it('los 13 nombres base del catálogo pasan la misma validación que el dueño', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(validateTemplateName(t.baseName), t.key).toEqual([])
    }
  })
})
