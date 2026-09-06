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

// ── 3. Las RESERVADAS en docs: un número citado para algo que aún no existe ──
const reservas = new Map()
for (const f of sh('git ls-files docs/ ESTADO.md CLAUDE.md').split('\n').filter((x) => x.endsWith('.md'))) {
  let txt
  try { txt = fs.readFileSync(f, 'utf8') } catch { continue }
  for (const linea of txt.split('\n')) {
    for (const m of linea.matchAll(/\b(000\d\d)\b/g)) {
      const n = parseInt(m[1], 10)
      if (existen.has(n)) continue // ya existe: es historia, no reserva
      if (!reservas.has(n)) reservas.set(n, `${f}: ${linea.trim().slice(0, 88)}`)
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
  console.log('\n  RESERVADAS en docs (no existen todavia — NO las tomes):')
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
