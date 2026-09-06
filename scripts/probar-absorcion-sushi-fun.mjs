#!/usr/bin/env node
/**
 * probar-absorcion-sushi-fun.mjs — ENSAYO COMPLETO de la absorción, en un Postgres
 * real y desechable. No toca ninguna base viva.
 *
 * Por qué existe: los archivos de SQL-PARA-CORRER/sushi-fun/ se pegan a mano en el
 * SQL Editor de una base de PRODUCCIÓN con clientes reales. "Lo revisé y se ve
 * bien" no es una verificación. Esto los corre de verdad, en orden, contra el
 * esquema que la producción va a tener mañana, y falla ruidoso si algo no cuadra.
 *
 * Usa el mismo `embedded-postgres` del arnés de tests (tests/setup/global-postgres.ts).
 *
 * ⚠️ Aplica las migraciones 00001–00045, NO la 00046: ese es el estado que va a
 *    tener producción el día del corte (la 00046 es de §19 y su aplicación la
 *    decide el dueño aparte). Probar con más migraciones de las que hay sería
 *    probar otra base.
 *
 * Uso:  node scripts/probar-absorcion-sushi-fun.mjs
 */

import EmbeddedPostgres from 'embedded-postgres'
import { Client } from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MIGRATIONS = path.join(ROOT, 'supabase/migrations')
const BOOTSTRAP = path.join(ROOT, 'tests/setup/bootstrap.sql')
const SQLDIR = path.join(ROOT, 'SQL-PARA-CORRER/sushi-fun')
const PORT = Number(process.env.TEST_PG_PORT ?? 55433)
const DATA_DIR = path.join(ROOT, '.pgdata-absorcion')

const TENANT_SF = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'

/**
 * Hasta dónde llega producción el día del corte. Por defecto la 00045: la 00046 es
 * de §19 y su aplicación la decide el dueño aparte. Se puede subir para comprobar
 * que la absorción tampoco se rompe si para mañana ya la aplicó:
 *   HASTA=00046 node scripts/probar-absorcion-sushi-fun.mjs
 */
const HASTA = process.env.HASTA ?? '00045'

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const info = (m) => console.log(`\x1b[36m${m}\x1b[0m`)
let fallos = 0
const mal = (m) => {
  fallos++
  console.error(`  \x1b[31m✗ ${m}\x1b[0m`)
}

/** Sustituye los placeholders del 01 por credenciales de MENTIRA, solo para el ensayo. */
function prepararArchivo01(sql) {
  return sql
    .replace('<<<PEGAR_ACCOUNT_SID_DE_SUSHI_FUN>>>', 'AC' + '0'.repeat(30) + 'ff')
    .replace('<<<PEGAR_AUTH_TOKEN_DE_SUSHI_FUN>>>', 'token-de-mentira-solo-para-el-ensayo')
    .replace('<<<PEGAR_NUMERO_WHATSAPP_DE_SUSHI_FUN>>>', 'whatsapp:+573001112233')
}

async function correr(client, archivo, transformar) {
  let sql = fs.readFileSync(path.join(SQLDIR, archivo), 'utf8')
  if (transformar) sql = transformar(sql)
  const avisos = []
  const onNotice = (n) => avisos.push(n.message)
  client.on('notice', onNotice)
  try {
    await client.query(sql)
    const okFinal = avisos.filter((a) => /^OK /.test(a))
    ok(`${archivo}${okFinal.length ? ' — ' + okFinal[okFinal.length - 1] : ''}`)
    return { ok: true, avisos }
  } catch (e) {
    mal(`${archivo}: ${e.message}`)
    // Cada archivo abre su propio BEGIN;. Si uno revienta, la conexión queda
    // ABORTADA y todo lo que siga falla con un mensaje que no es el suyo.
    await client.query('ROLLBACK').catch(() => {})
    return { ok: false, error: e, avisos }
  } finally {
    client.off('notice', onNotice)
  }
}

/** Espera que un SQL FALLE. Es la mitad que casi nunca se prueba. */
async function debeFallar(client, etiqueta, sql, fragmentoEsperado) {
  try {
    await client.query(sql)
    await client.query('ROLLBACK').catch(() => {})
    mal(`${etiqueta}: se esperaba que FALLARA y pasó.`)
    return false
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    if (fragmentoEsperado && !e.message.includes(fragmentoEsperado)) {
      mal(`${etiqueta}: falló, pero por otra razón: ${e.message}`)
      return false
    }
    ok(`${etiqueta} — rechazado como debe: ${e.message.split('\n')[0].slice(0, 90)}`)
    return true
  }
}

async function main() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })

  info('\n▸ Levantando Postgres desechable…')
  await pg.initialise()
  await pg.start()

  const client = new Client({ connectionString: `postgresql://postgres:postgres@localhost:${PORT}/postgres` })
  await client.connect()

  try {
    // ── 1. El esquema que va a tener producción mañana ──────────────────────
    info(`\n▸ Replicando el esquema de producción (bootstrap + migraciones hasta la ${HASTA})`)
    await client.query(fs.readFileSync(BOOTSTRAP, 'utf8'))
    const migs = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && f.slice(0, 5) <= HASTA)
      .sort()
    for (const f of migs) {
      try {
        await client.query(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
      } catch (e) {
        throw new Error(`Migración ${f} falló: ${e.message}`)
      }
    }
    ok(`${migs.length} migraciones aplicadas (00001 … ${HASTA})`)

    const { rows: base } = await client.query('SELECT slug FROM tenants ORDER BY slug')
    ok(`tenants de partida: ${base.map((r) => r.slug).join(', ') || '(ninguno)'}`)

    // ── 2. Los negativos: lo que TIENE que ser rechazado ────────────────────
    info('\n▸ Pruebas negativas (lo que el 01 debe impedir)')

    const sql01 = fs.readFileSync(path.join(SQLDIR, '01-alta-tenant-y-sede.sql'), 'utf8')

    await debeFallar(
      client,
      'placeholders de Twilio sin reemplazar',
      sql01,
      'placeholders'
    )

    // Twilio a medias: 2 de 3. Es el caso silencioso — `??` es campo por campo.
    await debeFallar(
      client,
      'twilio_whatsapp_number en NULL (2 de 3)',
      prepararArchivo01(sql01).replace(
        "p_twilio_number text := 'whatsapp:+573001112233';",
        'p_twilio_number text := NULL;'
      ),
      ''
    )

    // Marca vacía: la tarjeta diría "Sushi Service".
    await debeFallar(
      client,
      'config.brand_name vacío',
      prepararArchivo01(sql01).replace("p_brand_name       text := 'Sushi Fun';", 'p_brand_name       text := NULL;'),
      'brand_name'
    )

    // ── 3. La corrida buena, en orden ───────────────────────────────────────
    info('\n▸ Corrida completa, en el orden del runbook')
    const orden = [
      ['00-PREVUELO.sql', null],
      ['01-alta-tenant-y-sede.sql', prepararArchivo01],
      ['02-catalogo.sql', null],
      ['03-equipo.sql', null],
      ['04-clientes.sql', null],
      ['05-campanas.sql', null],
      ['06-hechos.sql', null],
      ['07-mensajes.sql', null],
      ['08-VERIFICACION-FINAL.sql', null],
      ['09-ACTIVAR.sql', null],
    ]
    for (const [archivo, tf] of orden) {
      const r = await correr(client, archivo, tf)
      if (!r.ok) throw new Error(`La corrida se detuvo en ${archivo}.`)

      // Entre el 01 y el 09, el tenant tiene que estar APAGADO. Es lo único que
      // impide el doble envío mientras el Vercel viejo siga con sus crons, y es
      // justo el tipo de cosa que se rompe sin que nadie lo note.
      if (archivo === '01-alta-tenant-y-sede.sql') {
        const { rows } = await client.query('SELECT is_active FROM tenants WHERE id = $1', [TENANT_SF])
        if (rows[0]?.is_active === false) ok('     …y nació APAGADO (no entra a los crons hasta el 09)')
        else mal('el tenant nació ACTIVO: riesgo de doble envío con el Vercel viejo')
      }
    }

    // ── 4. Lo que el 08 no puede ver desde adentro ──────────────────────────
    info('\n▸ Comprobaciones independientes')

    // El tenant tiene que haber nacido APAGADO: es lo que impide el doble envío
    // mientras el Vercel viejo siga con sus crons. Se comprueba al revés —
    // cargando de nuevo y mirando el estado ANTES del 09— en el bloque de abajo.
    const { rows: act } = await client.query('SELECT is_active FROM tenants WHERE id = $1', [TENANT_SF])
    if (act[0]?.is_active) ok('el 09 dejó a Sushi Fun activo')
    else mal('el 09 no encendió el tenant')

    const { rows: cuenta } = await client.query(
      `SELECT
         (SELECT count(*) FROM customers          WHERE tenant_id = $1) AS clientes,
         (SELECT count(*) FROM visits             WHERE tenant_id = $1) AS visitas,
         (SELECT count(*) FROM point_transactions WHERE tenant_id = $1) AS puntos,
         (SELECT count(*) FROM message_logs       WHERE tenant_id = $1) AS mensajes,
         (SELECT count(*) FROM tenant_wallet_transactions WHERE tenant_id = $1) AS billetera`,
      [TENANT_SF]
    )
    const c = cuenta[0]
    const esperado = { clientes: '250', visitas: '268', puntos: '268', mensajes: '193', billetera: '0' }
    for (const [k, v] of Object.entries(esperado)) {
      if (String(c[k]) === v) ok(`${k}: ${c[k]}`)
      else mal(`${k}: ${c[k]} (se esperaba ${v})`)
    }

    // Ni una fila de Sushi Fun se fue a otra marca por el DEFAULT puente.
    const { rows: fuga } = await client.query(
      `SELECT count(*)::int AS n FROM visits v
        JOIN customers cu ON cu.id = v.customer_id
       WHERE cu.tenant_id <> v.tenant_id`
    )
    if (fuga[0].n === 0) ok('cero visitas atribuidas a una marca distinta a la de su cliente')
    else mal(`${fuga[0].n} visitas cruzan de marca`)

    // El trigger de billetera volvió.
    const { rows: trg } = await client.query(
      `SELECT tgenabled FROM pg_trigger
        WHERE tgname = 'trg_debit_wallet' AND tgrelid = 'message_logs'::regclass`
    )
    if (trg[0]?.tgenabled && trg[0].tgenabled !== 'D') ok('trg_debit_wallet quedó ACTIVO')
    else mal(`trg_debit_wallet quedó en estado "${trg[0]?.tgenabled}"`)

    // El mesero tiene sede — si no, no sale en ninguna lista del escáner.
    const { rows: mesero } = await client.query(
      `SELECT s.name, l.name AS sede FROM staff_users s
         LEFT JOIN restaurant_locations l ON l.id = s.location_id
        WHERE s.tenant_id = $1`,
      [TENANT_SF]
    )
    if (mesero[0]?.sede) ok(`mesero "${mesero[0].name}" asignado a "${mesero[0].sede}"`)
    else mal('el mesero quedó sin sede')

    // El teléfono repetido entre marcas NO colisiona: es la promesa de
    // customers_phone_tenant_key (phone, tenant_id). Se prueba de verdad.
    const { rows: unTel } = await client.query(
      `SELECT phone FROM customers WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_SF]
    )
    const otroTenant = base.find((r) => r.slug !== 'sushi-fun')
    if (unTel[0] && otroTenant) {
      const { rows: idOtro } = await client.query('SELECT id FROM tenants WHERE slug = $1', [otroTenant.slug])
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO customers (phone, name, tenant_id) VALUES ($1, 'Homónimo de otra marca', $2)`,
          [unTel[0].phone, idOtro[0].id]
        )
        await client.query('ROLLBACK')
        ok(`el celular ${unTel[0].phone} convive en dos marcas sin colisionar (confirmado, no supuesto)`)
      } catch (e) {
        await client.query('ROLLBACK')
        mal(`el mismo celular en otra marca fue rechazado: ${e.message}`)
      }
    }

    // La segunda corrida tiene que ABORTAR, no duplicar.
    info('\n▸ Idempotencia: correr el 04 dos veces')
    await debeFallar(
      client,
      '04-clientes.sql por segunda vez',
      fs.readFileSync(path.join(SQLDIR, '04-clientes.sql'), 'utf8'),
      'ya tiene'
    )

    // ── 5. El rollback ──────────────────────────────────────────────────────
    info('\n▸ Rollback')
    const r99 = await correr(client, '99-ROLLBACK.sql', null)
    if (!r99.ok) throw new Error('El rollback falló.')

    const { rows: post } = await client.query(
      `SELECT count(*)::int AS n FROM tenants WHERE id = $1`,
      [TENANT_SF]
    )
    if (post[0].n === 0) ok('tras el rollback no queda rastro de Sushi Fun')
    else mal('el tenant sobrevivió al rollback')

    // Y las otras marcas siguen enteras.
    const { rows: despues } = await client.query('SELECT slug FROM tenants ORDER BY slug')
    if (despues.map((r) => r.slug).join() === base.map((r) => r.slug).join()) {
      ok('las otras marcas quedaron exactamente como estaban')
    } else {
      mal(`el rollback alteró la lista de tenants: ${despues.map((r) => r.slug).join(', ')}`)
    }

    // Y se puede volver a empezar desde cero.
    const rePrev = await correr(client, '00-PREVUELO.sql', null)
    if (rePrev.ok) ok('el pre-vuelo vuelve a dar OK: la absorción se puede reintentar')
  } finally {
    await client.end()
    await pg.stop()
    fs.rmSync(DATA_DIR, { recursive: true, force: true })
  }

  console.log(
    fallos === 0
      ? '\n\x1b[32m✓ ENSAYO COMPLETO EN VERDE — los archivos corren, verifican y se deshacen.\x1b[0m\n'
      : `\n\x1b[31m✗ ${fallos} problema(s). NO entregar hasta arreglarlos.\x1b[0m\n`
  )
  process.exit(fallos ? 1 : 0)
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e.message}\x1b[0m\n`)
  process.exit(1)
})
