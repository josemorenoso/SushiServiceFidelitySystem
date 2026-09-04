/**
 * Multi-sede F7 (§5.2) — la TERCERA red, la más débil de las tres.
 *
 * El spec pide, en orden de fuerza: **compilador → nombre feo del escape
 * (`getUnscopedServiceClient()`) → test de allowlist**. Las dos primeras ya
 * existen: el tipo opaco `LocationScope` (`src/lib/location-scope.ts`) y el
 * nombre deliberadamente incómodo del cliente sin alcance
 * (`src/lib/supabase/unscoped.ts`). Esta prueba es la tercera: no puede
 * IMPEDIR un uso nuevo de `getUnscopedServiceClient()` bajo `api/dashboard/**`
 * —eso es trabajo del compilador—, pero sí puede negarse a pasar en silencio
 * cuando aparece uno que nadie revisó.
 *
 * Si esta prueba falla porque agregaste un import legítimo: añádelo a
 * `ALLOWLIST` con un comentario que diga POR QUÉ ese archivo necesita leer sin
 * alcance de sede (normalmente: mezcla una lectura de `customers` —de la marca
 * para siempre— con una de `visits` —de la sede— en la misma función, como
 * hace `getFullAnalytics()`).
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')

/**
 * Los únicos archivos con permiso de importar `getUnscopedServiceClient()`.
 * Rutas relativas a `src/`, con `/` (no `\`) para que la prueba corra igual en
 * Windows y en CI.
 */
const ALLOWLIST = new Set([
  // La propia fábrica de LocationScope: tiene que leer `dashboard_user_locations`
  // y `restaurant_locations` ANTES de que exista ningún alcance que aplicar —
  // es el huevo-y-la-gallina de este diseño, no un escape.
  'lib/location-scope.ts',
  // `getFullAnalytics()`/`getDashboardMetrics()` leen `customers` (de la marca
  // para siempre, §8.4) Y `visits` (de la sede) en la MISMA función — el filtro
  // de sede se aplica campo por campo con `applyLocationFilter()`/
  // `locationMatches()`, no con un cliente ya acotado.
  'services/dashboard.service.ts',
  // Mismo patrón que dashboard.service.ts, pero para el listado de campañas:
  // `applyLocationFilter()` se aplica explícitamente sobre `campaigns.location_id`.
  'app/api/dashboard/campaigns/route.ts',
])

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(full)
    }
  }
  return out
}

function importsUnscopedClient(fileContent: string): boolean {
  return /from ['"]@\/lib\/supabase\/unscoped['"]/.test(fileContent)
}

describe('multi-sede F7 — allowlist de getUnscopedServiceClient()', () => {
  it('solo los archivos de ALLOWLIST importan @/lib/supabase/unscoped', () => {
    const offenders: string[] = []

    for (const file of listTsFiles(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/')
      const content = fs.readFileSync(file, 'utf8')
      if (importsUnscopedClient(content) && !ALLOWLIST.has(rel)) {
        offenders.push(rel)
      }
    }

    expect(
      offenders,
      `Archivo(s) nuevos importando getUnscopedServiceClient() sin pasar por la allowlist: ${offenders.join(', ')}. ` +
        'Si el uso es legítimo (lee una tabla de marca Y una de sede en la misma función), ' +
        'agrégalo a ALLOWLIST en tests/unit/location-scope-allowlist.test.ts con el porqué.'
    ).toEqual([])
  })

  it('la propia fábrica de LocationScope (src/lib/location-scope.ts) sigue en la allowlist', () => {
    // Contra-prueba: si esto falla, la prueba de arriba dejó de ejecutarse de
    // verdad (por ejemplo, `listTsFiles` empezó a saltarse `src/lib`).
    const content = fs.readFileSync(path.join(SRC, 'lib/location-scope.ts'), 'utf8')
    expect(importsUnscopedClient(content)).toBe(true)
    expect(ALLOWLIST.has('lib/location-scope.ts')).toBe(true)
  })

  it('cada entrada de ALLOWLIST corresponde a un archivo que existe y SÍ importa el cliente sin alcance', () => {
    // Evita que la allowlist acumule fantasmas: una entrada que ya no importa
    // el cliente (porque se refactorizó) debería salir de la lista.
    for (const rel of ALLOWLIST) {
      const full = path.join(SRC, rel)
      expect(fs.existsSync(full), `${rel} está en ALLOWLIST pero no existe`).toBe(true)
      const content = fs.readFileSync(full, 'utf8')
      expect(
        importsUnscopedClient(content),
        `${rel} está en ALLOWLIST pero ya no importa @/lib/supabase/unscoped — sácalo de la lista`
      ).toBe(true)
    }
  })
})
