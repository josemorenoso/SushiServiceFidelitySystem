import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Configuración de pruebas — Método AInnovate, Mandamiento X (validar antes de entregar).
 *
 * Ver `docs/features/testing.md` para el porqué de cada decisión.
 *
 * DOS COSAS QUE PARECEN DETALLE Y NO LO SON:
 *
 * 1. `exclude` tiene que nombrar 'Level 2.0/**' explícitamente. `tsconfig.json`
 *    declara `exclude: ["node_modules"]`, lo cual REEMPLAZA la exclusión por
 *    defecto de TypeScript y solo ancla el `node_modules` de la raíz. Como
 *    `include` trae `**\/*.ts`, el proyecto anidado `Level 2.0/aios-constelarys`
 *    (repo SEPARADO, ver .gitignore) y su node_modules entero caen dentro del
 *    proyecto. Sin este exclude, vitest intentaría correr los tests internos de
 *    zod y de pg-protocol.
 *
 * 2. `alias` duplica el `paths` de tsconfig.json. `moduleResolution: "bundler"`
 *    hace que TypeScript resuelva `@/*` en tiempo de compilación, pero vitest
 *    resuelve en tiempo de ejecución y no lee ese campo.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'Level 2.0/**', '.next/**'],

    // Las pruebas de base de datos arrancan un Postgres real y replican las 37
    // migraciones. Eso tarda del orden de 10-20 s la primera vez.
    globalSetup: ['./tests/setup/global-postgres.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,

    // `forks` en vez de `threads`: el driver `pg` abre sockets y los workers de
    // hilos comparten el event loop del proceso, lo que enmascara la
    // concurrencia real que la prueba de `reserve_send_slot()` necesita medir.
    pool: 'forks',
  },
})
