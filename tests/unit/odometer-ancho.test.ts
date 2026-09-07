import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * El odómetro de puntos no puede recortar sus propios dígitos.
 *
 * QUÉ PASÓ (2026-09-07, en producción)
 * ────────────────────────────────────
 * `Odometer` apila la tira 0…9 dentro de una columna con `overflow: hidden` y la
 * desplaza en vertical. Pero `overflow: hidden` recorta los DOS ejes: si la
 * columna es más angosta que el dígito, le come los costados.
 *
 * La columna salió con `width: '0.62ch'` —copiado de una demo con otra
 * tipografía— y llegó a producción así. En la tarjeta del cliente, que es donde
 * los puntos son el elemento más grande de la pantalla, `322` se veía mordido:
 * cada dígito perdía casi el 40 % de su ancho.
 *
 * `1ch` es exactamente el avance de un dígito, y como el componente pide
 * `tabular-nums` todos los dígitos miden igual: no sobra ni falta un píxel.
 *
 * POR QUÉ ESTE TEST MIRA EL FUENTE Y NO EL DOM
 * ────────────────────────────────────────────
 * El arnés no tiene jsdom ni testing-library (los 31 archivos son de lógica
 * pura), y sumar esas dependencias para vigilar un valor es desproporcionado.
 * Es el mismo patrón que ya usa el test que prohíbe hornear emojis de rubro en
 * `template-texts.ts`: leer el archivo y afirmar sobre lo que dice.
 *
 * Si el día de mañana entra un arnés de componentes, este test se reemplaza por
 * uno que mida el ancho renderizado, que es lo que de verdad importa.
 */

const ODOMETER = resolve(process.cwd(), 'src/components/ui/odometer.tsx')

describe('Odometer — la columna no puede recortar el dígito', () => {
  const source = readFileSync(ODOMETER, 'utf8')

  it('la columna mide exactamente 1ch', () => {
    expect(source).toContain("width: '1ch'")
  })

  it('no queda ningún ancho de columna por debajo de 1ch', () => {
    // Cualquier `width: '<n>ch'` con n < 1 vuelve a morder los dígitos.
    const anchos = [...source.matchAll(/width:\s*'([\d.]+)ch'/g)].map((m) => Number(m[1]))

    expect(anchos.length).toBeGreaterThan(0)
    for (const ancho of anchos) {
      expect(ancho).toBeGreaterThanOrEqual(1)
    }
  })

  it('sigue recortando en vertical, que es lo que hace rodar la tira', () => {
    expect(source).toContain('overflow-hidden')
  })
})
