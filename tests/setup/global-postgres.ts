/**
 * globalSetup de vitest: levanta UN Postgres real para toda la corrida y le
 * replica las 37 migraciones del producto.
 *
 * POR QUÉ UN POSTGRES DE VERDAD Y NO UN DOBLE
 * ────────────────────────────────────────────
 * La prueba central del spec de gobernanza de envío (§9) es:
 *
 *   > `reserve_send_slot()` bajo concurrencia: 20 llamadas en paralelo con
 *   > `limite=10` conceden **exactamente** 10. Esta es la prueba más importante
 *   > del spec.
 *
 * Lo que esa prueba mide es el `pg_advisory_xact_lock` de
 * `00037_send_governance.sql:343`. Un lock solo se puede demostrar con varias
 * CONEXIONES simultáneas peleando por él, así que quedan descartados:
 *   · pg-mem      — no implementa advisory locks.
 *   · PGlite      — un solo backend, una sola conexión: el lock nunca compite.
 *   · un mock     — probaría el mock, no la función.
 *
 * POR QUÉ `embedded-postgres` Y NO DOCKER
 * ───────────────────────────────────────
 * Esta máquina no tiene Docker, ni `psql`, ni Supabase CLI (las migraciones se
 * aplican a mano en el SQL Editor). `embedded-postgres` descarga un binario
 * real de Postgres como dependencia de npm y lo arranca en un puerto local:
 * cero infraestructura, cero permisos de administrador, y aun así es Postgres
 * de verdad con conexiones de verdad.
 *
 * POR QUÉ NO SE PRUEBA CONTRA EL SUPABASE REAL
 * ────────────────────────────────────────────
 * Sería probar contra producción: el mismo proyecto donde opera Sushi Service.
 * Insertar filas en `send_reservations` de un tenant real le consume su ventana
 * de 24 h de verdad. Además el pooler de transacciones (puerto 6543) podría
 * serializar las 20 llamadas por sí solo y hacer que la prueba pase por la
 * razón equivocada.
 *
 * DIFERENCIAS CONOCIDAS CON PRODUCCIÓN (decir la verdad sobre lo que NO cubre)
 * ───────────────────────────────────────────────────────────────────────────
 * 1. Versión: aquí Postgres 18; Supabase corre 15/17. Nada de lo que usa 00037
 *    (advisory locks, percentile_cont, jsonb, índices únicos parciales) cambió
 *    entre esas versiones.
 * 2. RLS: las pruebas corren como superusuario, que se salta RLS. Esto valida
 *    el ESQUEMA y las FUNCIONES, no las políticas. Para probar una política hay
 *    que hacer `SET ROLE authenticated` + `SET LOCAL request.jwt.claims`
 *    explícitamente (el stub de auth.jwt() del bootstrap lo permite).
 * 3. No hay PostgREST: se habla Postgres directo, no RPC por HTTP.
 */

import EmbeddedPostgres from 'embedded-postgres'
import { Client } from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import type { TestProject } from 'vitest/node'

const ROOT = path.resolve(__dirname, '../..')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations')
const BOOTSTRAP = path.join(__dirname, 'bootstrap.sql')

/** Fuera del rango de un Postgres local del desarrollador (5432) para no chocar. */
const PORT = Number(process.env.TEST_PG_PORT ?? 55432)
const DATA_DIR = path.join(ROOT, '.pgdata-test')

export interface PostgresHandle {
  port: number
  connectionString: string
}

let instance: EmbeddedPostgres | null = null

export default async function setup(project: TestProject) {
  // `persistent: false` hace que el directorio de datos se borre al parar, pero
  // si una corrida anterior murió a mitad puede quedar basura que impide el
  // initdb. Limpiar antes es más barato que diagnosticarlo después.
  fs.rmSync(DATA_DIR, { recursive: true, force: true })

  instance = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    // OBLIGATORIO en Windows: sin esto initdb hereda la configuración regional
    // del sistema y crea la base en WIN1252. Las 37 migraciones llevan cajas
    // de comentarios con caracteres Unicode (═, ─, á…) y TODAS fallan con
    // "character with byte sequence 0xe2 0x95 0x90 ... has no equivalent in
    // encoding WIN1252". Supabase es UTF8, así que esto además iguala producción.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })

  await instance.initialise()
  await instance.start()

  const connectionString = `postgresql://postgres:postgres@localhost:${PORT}/postgres`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query(fs.readFileSync(BOOTSTRAP, 'utf8'))

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      try {
        await client.query(sql)
      } catch (err) {
        // Falla ruidoso y nombrando el archivo: una migración rota es
        // exactamente lo que estas pruebas existen para detectar ANTES de que
        // el dueño la pegue en el SQL Editor.
        const detail = err instanceof Error ? err.message : String(err)
        throw new Error(`Migración ${file} falló al aplicarse:\n  ${detail}`)
      }
    }
  } finally {
    await client.end()
  }

  project.provide('postgres', { port: PORT, connectionString } satisfies PostgresHandle)

  return async () => {
    await instance?.stop()
    instance = null
    fs.rmSync(DATA_DIR, { recursive: true, force: true })
  }
}

declare module 'vitest' {
  interface ProvidedContext {
    postgres: PostgresHandle
  }
}
