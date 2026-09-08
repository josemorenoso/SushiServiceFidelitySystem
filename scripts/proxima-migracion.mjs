#!/usr/bin/env node
/**
 * ¿Qué número de migración puedo usar?
 *
 * POR QUÉ EXISTE
 * ──────────────
 * El 2026-09-06 dos trabajos chocaron: `feat/tarjeta-visual` numeró su migración
 * 00048 mirando `supabase/migrations/` en SU rama, donde el último era el 00046.
 * Pero el 00048 ya estaba RESERVADO para F9 de multi-sede en su propio spec, y de
 * paso se saltó el 00047, que quedó como un hueco.
 *
 * Ninguna cantidad de "leé 10 archivos antes de empezar" arregla eso de forma
 * fiable: el número libre NO es visible desde el árbol de una rama. Está repartido
 * entre las otras ramas VIVAS y las reservas escritas en los docs. Esto lo junta
 * todo y responde con un número.
 *
 * Una rama cuyos commits ya están enteros en `main` es historia, no trabajo vivo:
 * sus números viejos no se reportan como choque, porque `main` ya los resolvió.
 *
 * QUÉ ES UNA RESERVA (cambiado el 2026-09-07)
 * ────────────────────────────────────────────
 * Hasta el 07 este script leía CUALQUIER `000NN` citado en CUALQUIER doc como
 * reserva. Eso fabricaba huecos solo: Conexiones pidió número, obtuvo 00052, lo
 * escribió en su spec, y al crear el archivo el script vio "00052 reservada" y le
 * dio 00054. Después ESTADO explicó el hueco citándolo, y quedó reservado para
 * siempre. Lo mismo con la 00055: ESTADO la citó como "la que diría el script" y
 * F8 terminó siendo la 00056.
 *
 * Ahora la ÚNICA reserva es la que está en el tablero: ESTADO.md § 2 "En vuelo".
 * Un número citado ahí, en la fila de una sesión viva, está tomado. Un número
 * citado en cualquier otro sitio es historia o conversación, no reserva.
 *
 * USO
 *   node scripts/proxima-migracion.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const sh = (c) => { try { return execSync(c, { encoding: 'utf8' }) } catch { return '' } }
const num = (s) => { const m = /(\d{5})/.exec(s); return m ? parseInt(m[1], 10) : null }
const pad = (n) => String(n).padStart(5, '0')

// ── 1. Ramas VIVAS: main, y las que tengan algo que main no tenga ───────────
const todas = sh('git for-each-ref --format=%(refname:short) refs/heads/ refs/remotes/')
  .split('\n').map((s) => s.trim()).filter(Boolean)
const vivas = todas.filter((r) => {
  if (r === 'main' || r === 'origin/main') return true
  const n = sh(`git rev-list --count main..${r}`).trim()
  return n !== '' && n !== '0'
})

// ── 2. Las que EXISTEN, en cualquier rama viva ──────────────────────────────
const existen = new Map() // numero -> [{archivo, ref}]
for (const ref of vivas) {
  for (const f of sh(`git ls-tree --name-only ${ref} supabase/migrations/`).split('\n')) {
    const n = num(f)
    if (n === null) continue
    const archivo = f.replace('supabase/migrations/', '')
    if (!existen.has(n)) existen.set(n, [])
    if (!existen.get(n).some((x) => x.archivo === archivo)) existen.get(n).push({ archivo, ref })
  }
}

// ── 3. Las RESERVADAS: solo las del tablero (ESTADO.md § 2 "En vuelo") ──────
const reservas = new Map()
{
  let txt = ''
  try { txt = fs.readFileSync('ESTADO.md', 'utf8') } catch { /* sin ESTADO no hay reservas */ }
  const ini = txt.search(/^## 2\./m)
  const fin = txt.search(/^## 3\./m)
  const tablero = ini >= 0 ? txt.slice(ini, fin > ini ? fin : undefined) : ''
  for (const linea of tablero.split('\n')) {
    for (const m of linea.matchAll(/\b(000\d\d)\b/g)) {
      const n = parseInt(m[1], 10)
      if (existen.has(n)) continue // ya existe: es historia, no reserva
      if (!reservas.has(n)) reservas.set(n, `ESTADO.md § 2: ${linea.trim().slice(0, 88)}`)
    }
  }
}

// ── 4. Veredicto ────────────────────────────────────────────────────────────
const maxExiste = Math.max(0, ...existen.keys())
const tomados = new Set([...existen.keys(), ...reservas.keys()])
let libre = Math.max(0, ...tomados) + 1

console.log('\n  EXISTEN %d migraciones en ramas vivas. La mas alta: %s', existen.size, pad(maxExiste))

const choques = [...existen.entries()].filter(([, v]) => v.length > 1)
if (choques.length) {
  console.log('\n  MISMO NUMERO CON ARCHIVOS DISTINTOS — hay que renumerar uno antes de mergear:')
  for (const [n, v] of choques.sort((a, b) => a[0] - b[0])) {
    console.log('    %s', pad(n))
    for (const x of v) console.log('      %s  (%s)', x.archivo.padEnd(44), x.ref)
  }
}

if (reservas.size) {
  console.log('\n  RESERVADAS en el tablero (ESTADO.md § 2; no existen todavia — NO las tomes):')
  for (const [n, d] of [...reservas.entries()].sort((a, b) => a[0] - b[0])) {
    console.log('    %s  %s', pad(n), d)
  }
}

const huecos = []
for (let i = 1; i < maxExiste; i++) if (!tomados.has(i)) huecos.push(i)
if (huecos.length) {
  console.log('\n  Huecos libres: %s', huecos.map(pad).join(', '))
  console.log('    (no los rellenes: un hueco es mas barato que renumerar algo ya aplicado)')
}

console.log('\n  ==> USA LA %s\n', pad(libre))
