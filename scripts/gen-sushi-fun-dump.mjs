#!/usr/bin/env node
/**
 * gen-sushi-fun-dump.mjs — genera los INSERT de SQL-PARA-CORRER/sushi-fun/ leyendo
 * el Supabase STANDALONE de Sushi Fun por PostgREST (SOLO GET, nunca escribe).
 *
 * Por qué existe: la absorción mueve ~1.100 filas entre DOS proyectos Supabase
 * distintos. No hay dblink entre ellos, así que el traslado se hace con INSERT
 * literales. Escribirlos a mano es inviable, y escribirlos UNA sola vez tampoco
 * sirve: Sushi Fun sigue VIVO y sus conteos se mueven. Este script se vuelve a
 * correr justo antes del corte y regenera los archivos con la foto del momento.
 *
 * Uso:
 *   SUSHIFUN_URL=https://xxx.supabase.co SUSHIFUN_SERVICE_KEY=... \
 *     node scripts/gen-sushi-fun-dump.mjs
 *
 * NUNCA hardcodear la service key acá: viaja por entorno y no se versiona.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL_BASE = process.env.SUSHIFUN_URL
const KEY = process.env.SUSHIFUN_SERVICE_KEY
if (!URL_BASE || !KEY) {
  console.error('Faltan SUSHIFUN_URL y/o SUSHIFUN_SERVICE_KEY en el entorno.')
  process.exit(1)
}

const TENANT = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'
const SEDE = 'd6798a6e-40f1-4d1a-91be-5d30770c1448'
const OUT = join(process.cwd(), 'SQL-PARA-CORRER', 'sushi-fun')
mkdirSync(OUT, { recursive: true })

// ── Tipos por columna, sacados del swagger de PostgREST ──────────────────────
let SCHEMA = {}
async function loadSchema() {
  const r = await fetch(`${URL_BASE}/rest/v1/`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  const s = await r.json()
  SCHEMA = s.definitions || {}
}

/**
 * Columnas que el DESTINO tiene y el ORIGEN no, así que no salen del swagger de
 * Sushi Fun. Sin esto se emitirían como texto y el literal iría sin `::uuid`.
 */
const TIPOS_DESTINO = {
  'staff_users.location_id': 'uuid',
  'staff_devices.location_id': 'uuid',
}

function colType(table, col) {
  const forzado = TIPOS_DESTINO[`${table}.${col}`]
  if (forzado) return forzado
  const p = SCHEMA[table]?.properties?.[col]
  if (!p) return 'text'
  const f = p.format || ''
  if (f.startsWith('timestamp')) return 'timestamptz'
  if (f === 'date') return 'date'
  if (f === 'time without time zone') return 'time'
  if (f === 'uuid') return 'uuid'
  if (f === 'jsonb' || f === 'json') return 'jsonb'
  if (f === 'boolean') return 'bool'
  if (f === 'integer' || f === 'smallint' || f === 'bigint') return 'int'
  if (f === 'numeric' || f === 'double precision' || f === 'real') return 'num'
  return 'text'
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function lit(table, col, v) {
  if (v === null || v === undefined) return 'NULL'
  const t = colType(table, col)
  switch (t) {
    case 'bool':
      return v ? 'true' : 'false'
    case 'int':
    case 'num':
      return String(v)
    case 'jsonb':
      return `${q(JSON.stringify(v))}::jsonb`
    case 'uuid':
      return `${q(v)}::uuid`
    case 'timestamptz':
      return `${q(v)}::timestamptz`
    case 'date':
      return `${q(v)}::date`
    case 'time':
      return `${q(v)}::time`
    default:
      return q(v)
  }
}

async function fetchAll(table, order) {
  const rows = []
  const step = 1000
  for (let from = 0; ; from += step) {
    const url = `${URL_BASE}/rest/v1/${table}?select=*&order=${order}.asc&limit=${step}&offset=${from}`
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const page = await r.json()
    rows.push(...page)
    if (page.length < step) break
  }
  return rows
}

/**
 * Un INSERT multi-fila por tabla, con la lista de columnas EXPLÍCITA y `tenant_id`
 * SIEMPRE entre ellas. Es la regla dura del proyecto: la 00030 nunca se aplicó y el
 * DEFAULT puente de la 00028 manda a Sushi Service todo INSERT que lo omita.
 */
function insertBlock(table, rows, cols) {
  if (rows.length === 0) return `-- ${table}: 0 filas en el origen — nada que insertar.\n`
  if (SCHEMA[table]?.properties?.tenant_id && !cols.includes('tenant_id')) {
    throw new Error(`${table}: la tabla tiene tenant_id y la lista de columnas lo omite. ABORTA.`)
  }
  const head = `INSERT INTO ${table} (\n  ${cols.join(', ')}\n) VALUES\n`
  const body = rows.map((r) => `  (${cols.map((c) => lit(table, c, r[c])).join(', ')})`).join(',\n')
  return head + body + ';\n'
}

/** Guard + INSERT + verificación de conteo. El patrón de la 00044. */
function bloque(table, rows, cols, opts = {}) {
  const n = rows.length
  const nota = opts.nota || ''
  let s = ''
  s += `-- ─────────────────────────────────────────────────────────────\n`
  s += `-- ${table} — ${n} fila(s) en el origen\n`
  if (nota) s += `-- ${nota}\n`
  s += `-- ─────────────────────────────────────────────────────────────\n`
  s += `DO $guard$\nDECLARE v int;\nBEGIN\n`
  s += `  SELECT count(*) INTO v FROM ${table} WHERE tenant_id = '${TENANT}'::uuid;\n`
  s += `  IF v <> 0 THEN\n`
  s += `    RAISE EXCEPTION '${table}: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;\n`
  s += `  END IF;\nEND $guard$;\n\n`
  s += insertBlock(table, rows, cols)
  s += `\nDO $ver$\nDECLARE v int;\nBEGIN\n`
  s += `  SELECT count(*) INTO v FROM ${table} WHERE tenant_id = '${TENANT}'::uuid;\n`
  s += `  IF v <> ${n} THEN RAISE EXCEPTION '${table} FALLO: se esperaban ${n} filas y hay %.', v; END IF;\n`
  s += `  RAISE NOTICE 'OK ${table}: % filas de Sushi Fun.', v;\nEND $ver$;\n\n`
  return s
}

const LINEA = '-- ═══════════════════════════════════════════════════════════════'

function cabecera(num, titulo, extra) {
  return (
    `${LINEA}\n` +
    `-- ${num} · ${titulo}\n` +
    `-- Absorción de Sushi Fun al despliegue principal — generado 2026-09-06\n` +
    `-- GENERADO por scripts/gen-sushi-fun-dump.mjs. No editar a mano: regenerar.\n` +
    `--\n` +
    `-- Se pega en el SQL Editor del Supabase PRINCIPAL (el de Sushi Service).\n` +
    `-- Los archivos se corren EN ORDEN. Cada uno aborta si ya se corrió.\n` +
    `--\n` +
    `-- tenant_id de Sushi Fun: ${TENANT}\n` +
    (extra || '') +
    `${LINEA}\n\nBEGIN;\n\n`
  )
}

const PIE = '\nCOMMIT;\n'

async function main() {
  await loadSchema()

  const TABLAS = [
    'reward_tiers',
    'rewards',
    'mystery_box_global_caps',
    'admin_settings',
    'authorized_numbers',
    'staff_users',
    'staff_devices',
    'imported_contacts',
    'customers',
    'campaigns',
    'campaign_rewards',
    'visits',
    'point_transactions',
    'mystery_box_results',
    'reward_grants',
    'reward_redemptions',
    'review_events',
    'campaign_messages',
    'message_logs',
    'restaurant_events',
  ]

  // Orden estable para que dos corridas seguidas produzcan el mismo archivo.
  // No todas las tablas tienen `created_at` (campaign_messages no lo tiene).
  const orden = (tabla) => {
    const cols = Object.keys(SCHEMA[tabla].properties)
    if (cols.includes('created_at')) return 'created_at'
    if (cols.includes('id')) return 'id'
    return cols[0]
  }

  const t = {}
  for (const tabla of TABLAS) {
    t[tabla] = await fetchAll(tabla, tabla === 'admin_settings' ? 'key' : orden(tabla))
    process.stderr.write(`  ${tabla}: ${t[tabla].length}\n`)
  }

  // Guard duro: toda fila leída tiene que ser de Sushi Fun. Si el origen trajera
  // otra marca, todo lo de abajo sería una fuga y no un traslado.
  for (const tabla of TABLAS) {
    const ajenas = t[tabla].filter((r) => 'tenant_id' in r && r.tenant_id !== TENANT)
    if (ajenas.length > 0) {
      throw new Error(`${tabla}: ${ajenas.length} fila(s) con un tenant_id que no es Sushi Fun. ABORTA.`)
    }
  }

  const C = (tabla) => Object.keys(SCHEMA[tabla].properties)

  // ── 02 · catálogo ──────────────────────────────────────────────────────────
  let s02 = cabecera('02', 'Catálogo de la marca (premios, ajustes, números autorizados)')
  s02 += bloque('reward_tiers', t.reward_tiers, C('reward_tiers'), {
    nota: '2 de los 6 vienen con is_active=false (duplicados legacy). Se copian tal cual: son historia, y no se ven.',
  })
  s02 += bloque('rewards', t.rewards, C('rewards'))
  s02 += bloque('mystery_box_global_caps', t.mystery_box_global_caps, C('mystery_box_global_caps'))
  s02 += bloque('admin_settings', t.admin_settings, C('admin_settings'), {
    nota: 'Trae los *_template_sid de la cuenta Twilio PROPIA de Sushi Fun. Ver el aviso 🔴 del runbook.',
  })
  s02 += bloque('authorized_numbers', t.authorized_numbers, C('authorized_numbers'))
  s02 += PIE
  writeFileSync(join(OUT, '02-catalogo.sql'), s02)

  // ── 03 · equipo ────────────────────────────────────────────────────────────
  const extra03 =
    `--\n` +
    `-- staff_users.location_id se llena con la sede principal EN EL INSERT. No es un\n` +
    `-- backfill de historia: es la regla D11 (un mesero es de UNA sede), y sin ella el\n` +
    `-- mesero no sale en NINGUNA lista del escáner. La 00044 ya creó la columna y su FK\n` +
    `-- COMPUESTA (location_id, tenant_id), que es la que impide atribuirlo a otra marca.\n` +
    `-- Ojo: trg_staff_users_sede_coherente es BEFORE UPDATE, no BEFORE INSERT — acá el\n` +
    `-- que verifica es la FK compuesta, no el trigger.\n` +
    `--\n` +
    `-- staff_devices.location_id se deja NULL a propósito: un dispositivo es un aparato\n` +
    `-- FÍSICO, y trg_staff_devices_sede_coherente (00044) solo compara sedes cuando las\n` +
    `-- DOS están puestas. Con NULL pasa el trigger y no se inventa nada.\n`
  let s03 = cabecera('03', 'Equipo (meseros y dispositivos)', extra03)
  const staffCols = C('staff_users').concat(C('staff_users').includes('location_id') ? [] : ['location_id'])
  s03 += bloque(
    'staff_users',
    t.staff_users.map((r) => ({ ...r, location_id: SEDE })),
    staffCols
  )
  const devCols = C('staff_devices').concat(C('staff_devices').includes('location_id') ? [] : ['location_id'])
  s03 += bloque(
    'staff_devices',
    t.staff_devices.map((r) => ({ ...r, location_id: null })),
    devCols
  )
  s03 += PIE
  writeFileSync(join(OUT, '03-equipo.sql'), s03)

  // ── 04 · clientes ──────────────────────────────────────────────────────────
  const extra04 =
    `--\n` +
    `-- customers_phone_tenant_key es UNIQUE (phone, tenant_id) — verificado en\n` +
    `-- 00028_seed_sushi_service.sql:68. Un cliente de Sushi Fun con el mismo celular que\n` +
    `-- uno de Sushi Service NO colisiona: son dos filas, cada una con SU tenant_id.\n` +
    `--\n` +
    `-- origin_location_id y last_visit_location_id se quedan en NULL = "sede desconocida",\n` +
    `-- que es exactamente lo que son. Repartir historia a una sede es adivinar, y el\n` +
    `-- número adivinado termina en un reporte de plata.\n`
  let s04 = cabecera('04', 'Clientes', extra04)
  s04 += bloque('imported_contacts', t.imported_contacts, C('imported_contacts'), {
    nota: 'Va ANTES de customers: customers.imported_contact_id la referencia.',
  })
  s04 += bloque('customers', t.customers, C('customers'))
  s04 += PIE
  writeFileSync(join(OUT, '04-clientes.sql'), s04)

  // ── 05 · campañas ──────────────────────────────────────────────────────────
  let s05 = cabecera('05', 'Campañas')
  s05 += bloque('campaigns', t.campaigns, C('campaigns'))
  s05 += bloque('campaign_rewards', t.campaign_rewards, C('campaign_rewards'))
  s05 += PIE
  writeFileSync(join(OUT, '05-campanas.sql'), s05)

  // ── 06 · hechos ────────────────────────────────────────────────────────────
  const extra06 =
    `--\n` +
    `-- Todas las columnas de sede nacen NULL y SE QUEDAN en NULL. En visits eso además\n` +
    `-- lo exige un CHECK: visits_location_pareja_check obliga a que location_id y\n` +
    `-- location_source sean los dos NULL o los dos NOT NULL (00043:248). Ambos NULL vale.\n` +
    `-- visits.location_conflict es TRI-ESTADO: NULL = "no se evaluó", que es la verdad.\n`
  let s06 = cabecera('06', 'Hechos (visitas, puntos, premios, reseñas, envíos de campaña)', extra06)
  s06 += bloque('visits', t.visits, C('visits'))
  s06 += bloque('point_transactions', t.point_transactions, C('point_transactions'))
  s06 += bloque('mystery_box_results', t.mystery_box_results, C('mystery_box_results'))
  s06 += bloque('reward_grants', t.reward_grants, C('reward_grants'))
  s06 += bloque('reward_redemptions', t.reward_redemptions, C('reward_redemptions'))
  s06 += bloque('review_events', t.review_events, C('review_events'))
  s06 += bloque('campaign_messages', t.campaign_messages, C('campaign_messages'))
  s06 += bloque('restaurant_events', t.restaurant_events, C('restaurant_events'))
  s06 += PIE
  writeFileSync(join(OUT, '06-hechos.sql'), s06)

  // ── 07 · mensajes ──────────────────────────────────────────────────────────
  const conSid = t.message_logs.filter((r) => r.twilio_sid !== null).length
  const extra07 =
    `--\n` +
    `-- 🔴 POR QUÉ ESTE ARCHIVO DESACTIVA UN TRIGGER\n` +
    `-- trg_debit_wallet (00033) dispara AFTER INSERT sobre message_logs y COBRA cada\n` +
    `-- fila cuyo twilio_sid no sea NULL. De estas ${t.message_logs.length} filas, ${conSid} traen twilio_sid.\n` +
    `-- Sin desactivarlo, cargar el HISTORIAL le debitaría a Sushi Fun ${conSid} mensajes que\n` +
    `-- ya pagó en SU propia cuenta Twilio. El guard "v_price IS NULL" del trigger no\n` +
    `-- salva: la 00033 define price_per_message_cop NOT NULL DEFAULT 100 — nunca es NULL.\n` +
    `--\n` +
    `-- El DISABLE/ENABLE va DENTRO de la misma transacción: si algo falla, el ROLLBACK\n` +
    `-- devuelve el trigger y nunca queda desactivado. Toma un lock breve sobre\n` +
    `-- message_logs, así que se corre con los restaurantes cerrados.\n`
  let s07 = cabecera('07', 'Historial de mensajes (con el trigger de billetera DESACTIVADO)', extra07)
  s07 += `ALTER TABLE message_logs DISABLE TRIGGER trg_debit_wallet;\n\n`
  s07 += bloque('message_logs', t.message_logs, C('message_logs'))
  s07 += `ALTER TABLE message_logs ENABLE TRIGGER trg_debit_wallet;\n\n`
  s07 +=
    `-- Verificación: el trigger volvió, y NO se le cobró nada a Sushi Fun.\n` +
    `DO $ver$\n` +
    `DECLARE v_hab boolean; v_txn int;\n` +
    `BEGIN\n` +
    `  SELECT tgenabled <> 'D' INTO v_hab\n` +
    `    FROM pg_trigger\n` +
    `   WHERE tgname = 'trg_debit_wallet' AND tgrelid = 'message_logs'::regclass;\n` +
    `  IF NOT COALESCE(v_hab, false) THEN\n` +
    `    RAISE EXCEPTION '07 FALLO: trg_debit_wallet quedo DESACTIVADO. No cerrar sin reactivarlo.';\n` +
    `  END IF;\n\n` +
    `  SELECT count(*) INTO v_txn FROM tenant_wallet_transactions\n` +
    `   WHERE tenant_id = '${TENANT}'::uuid;\n` +
    `  IF v_txn <> 0 THEN\n` +
    `    RAISE EXCEPTION '07 FALLO: se le crearon % movimiento(s) de billetera a Sushi Fun al cargar historial.', v_txn;\n` +
    `  END IF;\n\n` +
    `  RAISE NOTICE 'OK 07: trigger reactivado y billetera de Sushi Fun intacta (0 movimientos).';\n` +
    `END $ver$;\n`
  s07 += PIE
  writeFileSync(join(OUT, '07-mensajes.sql'), s07)

  // ── 08 · verificación final ────────────────────────────────────────────────
  // Se genera junto con los datos para que los conteos esperados NO puedan
  // quedar desfasados de lo que realmente se insertó.
  const esperados = TABLAS.map((tabla) => `    ('${tabla}', ${t[tabla].length})`).join(',\n')

  // Pares (hijo → padre) para probar la coherencia de marca. Si una fila de Sushi
  // Fun se hubiera ido a otro tenant por el DEFAULT puente, el hijo y el padre
  // quedarían en marcas distintas y esto lo caza sin listar 1.100 UUID.
  const PADRES = [
    ['visits', 'customer_id', 'customers'],
    ['visits', 'registered_by_staff_id', 'staff_users'],
    ['point_transactions', 'customer_id', 'customers'],
    ['review_events', 'customer_id', 'customers'],
    ['campaign_messages', 'customer_id', 'customers'],
    ['campaign_messages', 'campaign_id', 'campaigns'],
    ['message_logs', 'customer_id', 'customers'],
    ['mystery_box_global_caps', 'tier_id', 'reward_tiers'],
    ['rewards', 'tier_id', 'reward_tiers'],
    ['staff_devices', 'staff_user_id', 'staff_users'],
    ['staff_users', 'location_id', 'restaurant_locations'],
    ['customers', 'imported_contact_id', 'imported_contacts'],
  ]
  const paresSql = PADRES.map(([h, fk, p]) => `    ('${h}', '${fk}', '${p}')`).join(',\n')

  let s08 = `${LINEA}
-- 08 · VERIFICACIÓN FINAL — solo lee, no escribe nada
-- Absorción de Sushi Fun al despliegue principal — generado 2026-09-06
-- GENERADO por scripts/gen-sushi-fun-dump.mjs junto con los datos, para que los
-- conteos esperados no puedan desfasarse de lo que realmente se insertó.
--
-- Se pega en el SQL Editor del Supabase PRINCIPAL, DESPUÉS del 07.
-- Si termina con el NOTICE final, la absorción cuadra.
${LINEA}

DO $final$
DECLARE
  v_sf   uuid := '${TENANT}';
  r      record;
  v_n    bigint;
  v_mal  bigint;
  v_err  text := '';
  v_tot  bigint := 0;
BEGIN
  -- ── 1. Conteo tabla por tabla ─────────────────────────────────────────────
  RAISE NOTICE '───────── CONTEOS DE SUSHI FUN EN EL DESTINO ─────────';
  FOR r IN
    SELECT * FROM (VALUES
${esperados}
    ) AS e(tabla, esperado)
    ORDER BY tabla
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', r.tabla)
      INTO v_n USING v_sf;
    v_tot := v_tot + v_n;
    IF v_n <> r.esperado THEN
      v_err := v_err || format('  · %s: hay %s y se esperaban %s', r.tabla, v_n, r.esperado) || chr(10);
      RAISE NOTICE '%', format('  %-26s %6s   FALLA (esperaba %s)', r.tabla, v_n, r.esperado);
    ELSE
      RAISE NOTICE '%', format('  %-26s %6s   ok', r.tabla, v_n);
    END IF;
  END LOOP;
  RAISE NOTICE '%', format('  %-26s %6s', 'TOTAL', v_tot);

  IF v_err <> '' THEN
    RAISE EXCEPTION E'08 FALLO: los conteos no cuadran.\\n%\\nSi el origen crecio desde que se generaron los archivos, hay que regenerarlos y cargar el delta.', v_err;
  END IF;

  -- ── 2. Ninguna fila de Sushi Fun atribuida a otra marca ───────────────────
  -- Esta es LA verificación del encargo. No se listan 1.100 UUID: se prueba el
  -- invariante que un escape rompería igual — hijo y padre en la misma marca.
  -- Si un INSERT hubiera olvidado tenant_id, el DEFAULT puente lo habría mandado
  -- a Sushi Service y su padre seguiria en Sushi Fun: la fila saldria aca.
  RAISE NOTICE '───────── COHERENCIA DE MARCA (hijo vs. padre) ─────────';
  FOR r IN
    SELECT * FROM (VALUES
${paresSql}
    ) AS p(hijo, fk, padre)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I h JOIN %I p ON p.id = h.%I WHERE h.%I IS NOT NULL AND p.tenant_id <> h.tenant_id',
      r.hijo, r.padre, r.fk, r.fk
    ) INTO v_mal;
    IF v_mal > 0 THEN
      v_err := v_err || format('  · %s.%s -> %s: %s fila(s) cruzan de marca', r.hijo, r.fk, r.padre, v_mal) || chr(10);
    END IF;
  END LOOP;

  IF v_err <> '' THEN
    RAISE EXCEPTION E'08 FALLO: hay filas atribuidas a la marca equivocada.\\n%', v_err;
  END IF;
  RAISE NOTICE '  Cero cruces entre marcas en % relaciones.', ${PADRES.length};

  -- ── 3. Nada quedo sin marca ───────────────────────────────────────────────
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id IS NULL', r.table_name) INTO v_mal;
    IF v_mal > 0 THEN
      v_err := v_err || format('  · %s: %s fila(s) sin tenant_id', r.table_name, v_mal) || chr(10);
    END IF;
  END LOOP;
  IF v_err <> '' THEN
    RAISE EXCEPTION E'08 FALLO: hay filas sin marca.\\n%', v_err;
  END IF;

  -- ── 4. La billetera de Sushi Fun sigue intacta ────────────────────────────
  SELECT count(*) INTO v_mal FROM tenant_wallet_transactions WHERE tenant_id = v_sf;
  IF v_mal <> 0 THEN
    RAISE EXCEPTION '08 FALLO: Sushi Fun tiene % movimiento(s) de billetera. Cargar historial no debe cobrarle nada (ver 07).', v_mal;
  END IF;

  -- ── 5. El trigger de billetera volvio a su sitio ──────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_debit_wallet'
       AND tgrelid = 'message_logs'::regclass
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION '08 FALLO: trg_debit_wallet sigue DESACTIVADO en message_logs. Los envios de TODAS las marcas dejarian de cobrarse. Reactivalo YA: ALTER TABLE message_logs ENABLE TRIGGER trg_debit_wallet;';
  END IF;

  -- ── 6. Exactamente una sede activa ────────────────────────────────────────
  SELECT count(*) INTO v_n FROM restaurant_locations WHERE tenant_id = v_sf AND is_active;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '08 FALLO: Sushi Fun tiene % sedes activas y debe tener 1.', v_n;
  END IF;

  -- ── 7. El mesero tiene sede (si no, no sale en ninguna lista) ─────────────
  SELECT count(*) INTO v_n FROM staff_users WHERE tenant_id = v_sf AND is_active AND location_id IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '08 FALLO: % mesero(s) activos de Sushi Fun sin sede. No apareceran en el escaner.', v_n;
  END IF;

  -- ── 8. Twilio propio, otra vez (por si alguien edito la fila entre medio) ──
  IF EXISTS (
    SELECT 1 FROM tenants
     WHERE id = v_sf
       AND (twilio_subaccount_sid IS NULL
            OR twilio_subaccount_auth_token IS NULL
            OR twilio_whatsapp_number IS NULL)
  ) THEN
    RAISE EXCEPTION '08 FALLO: alguna columna twilio_* de Sushi Fun quedo en NULL. Sus WhatsApp saldrian del numero de Sushi Service.';
  END IF;

  -- ── 9. Foto final por marca, para pegarle al dueno ───────────────────────
  RAISE NOTICE '───────── CLIENTES POR MARCA (comparar con el 00) ─────────';
  FOR r IN
    SELECT t.slug, count(c.id) AS clientes
      FROM tenants t LEFT JOIN customers c ON c.tenant_id = t.id
     GROUP BY t.slug ORDER BY t.slug
  LOOP
    RAISE NOTICE '%', format('  %-22s %s', r.slug, r.clientes);
  END LOOP;

  RAISE NOTICE '───────────────────────────────────────────────────────────';
  RAISE NOTICE 'OK 08: la absorcion cuadra. % filas de Sushi Fun, cero cruces de marca.', v_tot;
END $final$;
`
  writeFileSync(join(OUT, '08-VERIFICACION-FINAL.sql'), s08)

  // ── la foto, para el resto de los entregables ──────────────────────────────
  const conteos = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.length]))
  conteos.__message_logs_con_twilio_sid = conSid
  writeFileSync(
    join(OUT, 'CONTEOS-ORIGEN.json'),
    JSON.stringify({ generado: new Date().toISOString(), tenant: TENANT, conteos }, null, 2) + '\n'
  )
  console.log(JSON.stringify(conteos, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
