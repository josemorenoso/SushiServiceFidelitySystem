/**
 * El banco de textos de plantillas, contra las reglas duras de Meta.
 *
 * POR QUÉ IMPORTA: cada uno de los 39 textos (13 plantillas × 3 estilos) es una
 * aprobación de Meta aparte, y el veredicto tarda 24-72h. Un texto que empieza
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
  TEMPLATE_STYLES,
  CATALOG_SIZE,
  DEFAULT_TEMPLATE_STYLE,
  assertCatalogTextsAreValid,
  buildTemplateBody,
  buildTemplateExample,
  detectTemplateStyle,
  renderTemplatePreview,
  validateTemplateBody,
} from '@/constants/template-catalog'
import { OPT_OUT_LINE } from '@/constants/template-texts'

const MARCA = 'Sabor Urbano'

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
  it('las 39 combinaciones pasan las reglas de Meta', () => {
    expect(assertCatalogTextsAreValid(MARCA)).toEqual([])
  })

  it('toda plantilla MARKETING cierra con la línea de opt-out', () => {
    for (const t of TEMPLATE_CATALOG) {
      if (t.category !== 'MARKETING') continue
      for (const style of TEMPLATE_STYLES) {
        expect(buildTemplateBody(t.key, style, MARCA).trim().endsWith(OPT_OUT_LINE), `${t.key}/${style}`).toBe(true)
      }
    }
  })

  it('la bienvenida es UTILITY y NO lleva opt-out', () => {
    const welcome = TEMPLATE_CATALOG_BY_KEY.welcome
    expect(welcome.category).toBe('UTILITY')
    for (const style of TEMPLATE_STYLES) {
      expect(buildTemplateBody('welcome', style, MARCA)).not.toContain('SALIR')
    }
  })

  it('los 3 estilos producen textos distintos entre sí', () => {
    for (const t of TEMPLATE_CATALOG) {
      const bodies = TEMPLATE_STYLES.map((s) => buildTemplateBody(t.key, s, MARCA))
      expect(new Set(bodies).size, t.key).toBe(TEMPLATE_STYLES.length)
    }
  })

  it('el estilo cálido es un port literal del catálogo en producción', () => {
    // Muestra de control: si alguien "mejora" el default sin decisión del dueño,
    // esto se cae. §12 respuesta 2: "Sin cambios en el default".
    expect(buildTemplateBody('welcome', 'calido', MARCA)).toBe(
      `¡Hola {{1}}! 🎉🍣\n\nBienvenid@ a *${MARCA}*, nos alegra que seas parte de nuestro club\n\nEn cada visita sumas puntos y recibes premios reales — Hoy recibiste *{{2}} puntos* 🎉\n\nAsí funciona tu camino de recompensas 👇\n\n{{3}}\n\n¡Te esperamos pronto!\n\n_— ${MARCA}_`
    )
  })

  it('el nombre del negocio queda interpolado, sin marcadores sueltos', () => {
    for (const t of TEMPLATE_CATALOG) {
      for (const style of TEMPLATE_STYLES) {
        const body = buildTemplateBody(t.key, style, MARCA)
        expect(body, `${t.key}/${style}`).not.toContain('${')
        expect(body, `${t.key}/${style}`).not.toContain('{negocio}')
      }
    }
  })

  it('las plantillas de evento NO hornean la marca: viaja en {{2}}', () => {
    for (const key of ['event_image', 'event_video'] as const) {
      for (const style of TEMPLATE_STYLES) {
        expect(buildTemplateBody(key, style, MARCA), `${key}/${style}`).not.toContain(MARCA)
      }
      expect(buildTemplateExample(key, MARCA)[1]).toBe(MARCA)
    }
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
    for (const style of TEMPLATE_STYLES) {
      expect(detectTemplateStyle('birthday', buildTemplateBody('birthday', style, MARCA), MARCA)).toBe(style)
    }
  })

  it('marca personalizado en cuanto el dueño toca una palabra', () => {
    const editado = buildTemplateBody('birthday', DEFAULT_TEMPLATE_STYLE, MARCA).replace('Feliz', 'Felicísimo')
    expect(detectTemplateStyle('birthday', editado, MARCA)).toBe('personalizado')
  })
})

describe('renderTemplatePreview', () => {
  it('sustituye cada variable por su valor de muestra', () => {
    const body = buildTemplateBody('birthday', 'calido', MARCA)
    const preview = renderTemplatePreview('birthday', body, MARCA)
    expect(preview).not.toMatch(/\{\{\d+\}\}/)
    expect(preview).toContain('Sofía')
    expect(preview).toContain('95')
  })

  it('deja intacta una variable inventada en vez de romperse', () => {
    expect(renderTemplatePreview('birthday', 'Hola {{1}} y {{7}} fin', MARCA)).toBe('Hola Sofía y {{7}} fin')
  })
})
