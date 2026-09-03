# Spec — Migración 00030: quitar el DEFAULT puente de `tenant_id`

> **Este documento es una AUDITORÍA, no un plan de ejecución aprobado.** No se corrió SQL contra
> ninguna base para producirlo. No se creó ni se tocó ningún archivo en `supabase/migrations/`.
> El dueño decidió explícitamente que la 00030 **no se corre junto con las demás migraciones
> pendientes** — merece su propia ventana. Este doc reúne lo que hace falta saber para abrirla.

| | |
|---|---|
| **Fecha del hallazgo** | 2026-09-03 (verificado por el dueño contra la base de producción) |
| **Migración auditada** | `supabase/migrations/00030_drop_tenant_defaults.sql` (existe en el repo, **nunca se aplicó**) |
| **Migración que introdujo el problema** | `supabase/migrations/00028_seed_sushi_service.sql` |
| **Alcance de esta auditoría** | Lectura de `supabase/migrations/*.sql`, `src/**`, `scripts/*.sql`, `n8n/*.json`, `docs/**`. Cero SQL ejecutado contra la base. |
| **Autor** | Sesión de auditoría en paralelo a la F3 de multi-sede (ver `docs/features/multi-sede.md`) |

---

## 1. El hallazgo, en una frase

`customers.tenant_id` (y otras 17 columnas) tiene un `DEFAULT` apuntando al UUID de Sushi
Service (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`). Es un puente deliberado que la migración
**00028** dejó a propósito en 2026-07-04 para que el código pre-multitenant siguiera
funcionando sin tocar cada `INSERT`. La migración **00030**, escrita el 2026-07-05 para quitar
ese puente, **quedó en el repo sin aplicarse nunca**. Mientras siga así, cualquier `INSERT` en
esas 18 tablas que por descuido no lleve `tenant_id` no falla — cae calladito en Sushi Service.

---

## 2. Qué hace exactamente la 00030

Archivo completo: `supabase/migrations/00030_drop_tenant_defaults.sql` (57 líneas). Es un único
bloque `DO $$ ... $$`, sin transacción explícita adicional (el `DO` corre dentro de la
transacción implícita del statement — si algo dispara `RAISE EXCEPTION`, el bloque entero se
aborta y no queda nada aplicado).

**Paso 1 — guarda de seguridad (líneas 33-40):** recorre el mismo array de 18 tablas que 00028 y
cuenta filas con `tenant_id IS NULL` en cada una. Si encuentra aunque sea una, aborta con
`RAISE EXCEPTION 'ABORTADO: % filas sin tenant_id en la tabla %...'` y **no llega a tocar ningún
DEFAULT** (líneas 35-40):

```sql
FOREACH t IN ARRAY tables
LOOP
  EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id IS NULL', t) INTO v_null_count;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % filas sin tenant_id en la tabla %. Revisar antes de quitar el DEFAULT.', v_null_count, t;
  END IF;
END LOOP;
```

**Paso 2 — quita el DEFAULT (líneas 43-47):** solo si el paso 1 no abortó, recorre las mismas 18
tablas y ejecuta `ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT` en cada una:

```sql
FOREACH t IN ARRAY tables
LOOP
  EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT', t);
  RAISE NOTICE 'DEFAULT quitado de %', t;
END LOOP;
```

**Eso es TODO lo que hace.** No toca `NOT NULL` (ya está activo desde 00028), no agrega
constraints nuevas, no toca ninguna tabla fuera de la lista, no hace backfill ni borra datos. Es
un cambio de catálogo puro (`ALTER COLUMN ... DROP DEFAULT` es una operación de metadatos —
bloqueo `ACCESS EXCLUSIVE` brevísimo, no reescribe la tabla, no hay downtime perceptible).

**Efecto de negocio, no técnico:** después de la 00030, un `INSERT` a cualquiera de las 18 tablas
que omita `tenant_id` deja de "funcionar en silencio contra Sushi Service" y pasa a fallar con
`23502 null value in column "tenant_id" violates not-null constraint`. Es el cambio de "fuga
silenciosa" a "error ruidoso" que pide el Mandamiento I (no alucinar) — un INSERT sin tenant no
debe *adivinar* a quién pertenece.

**Las 18 tablas afectadas** (idénticas en 00025, 00028 y 00030 — el mismo array literal las tres
veces): `customers`, `visits`, `rewards`, `authorized_numbers`, `campaigns`,
`campaign_messages`, `admin_settings`, `restaurant_events`, `restaurant_locations`,
`reward_tiers`, `point_transactions`, `mystery_box_results`, `mystery_box_global_caps`,
`staff_users`, `staff_devices`, `message_logs`, `reward_redemptions`, `imported_contacts`.

---

## 3. Confirmado: 00028 es la ÚNICA fuente del DEFAULT puente

Búsqueda: `grep -rniE "SET DEFAULT|DEFAULT.*tenant|tenant.*DEFAULT" supabase/migrations/` sobre
las 41 migraciones del repo. Los únicos `ALTER COLUMN tenant_id SET DEFAULT` en todo el
historial están en:

- `supabase/migrations/00028_seed_sushi_service.sql:49` — `EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT %L', t, v_tenant)`, dentro del mismo bucle de 18 tablas (líneas 42-52), después del backfill (línea 47) y antes del `NOT NULL` (línea 48).
- `supabase/migrations/00030_drop_tenant_defaults.sql` — el que lo quita (arriba).

Ninguna otra migración pone un `DEFAULT` de `tenant_id` en ninguna tabla nueva (`reward_grants`
00031, `review_events` 00032, `template_versions` 00039, `send_queue` 00037/00038,
`tenant_wallet_transactions` 00027/00033, `webhook_events_seen` 00036 — todas nacen con
`tenant_id` explícito por fila, sin puente, o directamente sin columna `tenant_id`). Los otros
hits de `DEFAULT` que aparecen en el grep (00036:56 mensaje de comentario, 00037:44 y 00037:59
`messaging_daily_limit`) son de una columna distinta, sin relación con el puente de tenant.
**`customers` no es la única tabla — son 18, ni una más ni una menos, y la lista sigue siendo
correcta hoy: ninguna migración posterior a la 00030 agregó una tabla nueva a ese conjunto.**

`00025_add_tenant_id.sql` (líneas 9-23) es la que agrega la columna `tenant_id` **nullable** a
las 18 tablas — el DEFAULT llega recién en 00028, dos migraciones después, junto con el
`NOT NULL`. Confirma la secuencia: 00025 (columna) → 00028 (backfill + puente + NOT NULL) → 00030
(quita el puente, nunca aplicada).

---

## 4. Inventario de escrituras — qué se rompería si se quita el DEFAULT mañana

Se recorrió **todo `src/`** buscando `.insert(`, `.upsert(` y `.rpc(` (35 ocurrencias de
insert/upsert en 27 archivos, 14 llamadas `.rpc(`), más los 3 scripts SQL de onboarding manual
(`scripts/seed-new-tenant.sql`, `scripts/alta-frangal.sql`, `scripts/seed-demo-tenant.sql`) y la
función `aios_provision_tenant` de la 00036 (la única vía de escritura del AIOS). Ningún acceso
directo a Postgres fuera de `supabase-js` (`grep` de `require('pg')`/`new Client(` sin
resultados) y ningún `.from()` con nombre de tabla dinámico salvo Supabase Storage (irrelevante
aquí).

**Resultado central: las 26 escrituras a las 18 tablas en riesgo pasan `tenant_id` explícito, sin
excepción.** Tabla completa:

| Tabla | Archivo:línea | Campo que pasa `tenant_id` |
|---|---|---|
| `authorized_numbers` | `src/app/api/dashboard/authorized-numbers/route.ts:69` | `tenant_id: tenantId` |
| `campaigns` | `src/app/api/dashboard/campaigns/manual/route.ts:75` | `tenant_id: tenantId` |
| `campaigns` | `src/services/campaign.service.ts:156` (`getOrCreateCampaign`) | `tenant_id: tenantId` |
| `campaigns` | `src/services/campaign.service.ts:402` (`createCalendarCampaign`) | `tenant_id: params.tenantId` |
| `campaigns` | `src/services/imported-contacts.service.ts:267` (Golden Bullet) | `tenant_id: tenantId` |
| `campaign_messages` | `src/app/api/cron/queue-drain/route.ts:348` (`registrosCampana`) | `tenant_id: tenantId` (armado en línea 310) |
| `campaign_messages` | `src/app/api/dashboard/campaigns/manual/route.ts:369` (`messageRecords`) | `tenant_id: tenantId` |
| `campaign_messages` | `src/services/campaign.service.ts:190` (`recordCampaignMessage`) | `tenant_id: params.tenantId` |
| `admin_settings` | `src/app/api/dashboard/settings/route.ts:72` | `tenant_id: tenantId` |
| `admin_settings` | `src/services/template.service.ts:135` (upsert `template_style`) | `tenant_id: tenantId` |
| `admin_settings` | `src/services/template.service.ts:641` (upsert puntero de plantilla) | `tenant_id: version.tenant_id` |
| `admin_settings` | `src/services/twilio-catalog.service.ts:331` (`fillEmptyPointer`) | `tenant_id: tenantId` |
| `restaurant_events` | `src/services/calendar.service.ts:115` | `tenant_id: tenantId` |
| `restaurant_locations` | `src/app/api/dashboard/location/route.ts:85` | `tenant_id: tenantId` |
| `reward_tiers` | `src/app/api/dashboard/reward-tiers/route.ts:136` | `tenant_id: tenantId` |
| `rewards` | `src/app/api/dashboard/rewards/route.ts:107` | `tenant_id: tenantId` |
| `staff_users` | `src/app/api/dashboard/staff/route.ts:80` | `tenant_id: tenantId` |
| `staff_devices` | `src/app/api/staff/device/register/route.ts:127` | `tenant_id: tenant.id` |
| `customers` | `src/services/customer.service.ts:44` (`createCustomer`) | `tenant_id: params.tenantId` |
| `imported_contacts` | `src/services/imported-contacts.service.ts:300` (chunks de 500) | `tenant_id: tenantId` (por fila, armado en línea 293) |
| `message_logs` | `src/services/message-log.service.ts:45` (`recordMessageLog`) | `tenant_id: params.tenantId` |
| `mystery_box_results` | `src/services/mystery-box.service.ts:245` (choice `safe`) | `tenant_id: tenantId` |
| `mystery_box_results` | `src/services/mystery-box.service.ts:293` (choice `mystery`) | `tenant_id: tenantId` |
| `point_transactions` | `src/services/points.service.ts:115` | `tenant_id: params.tenantId` |
| `reward_redemptions` | `src/services/redemption.service.ts:109` | `tenant_id: tenantId` |
| `visits` | `src/services/visit.service.ts:47` (`createVisit`) | `tenant_id: params.tenantId` (línea 27 del `insertPayload`) |

**Ni una fila de esta tabla se apoya en el DEFAULT.** Cada `.insert()`/`.upsert()` a las 18 tablas
en riesgo, verificado línea por línea, trae su propio `tenant_id`.

### 4.1 Lo que se descartó y por qué (mismo grep, tablas FUERA de las 18)

Estas escrituras aparecieron en el mismo barrido pero **no están en riesgo por 00030** porque su
tabla nunca tuvo el DEFAULT puente (confirmado en §3):

| Tabla | Archivo:línea | Por qué no aplica |
|---|---|---|
| `auto_reply_cooldown` | `src/app/api/webhook/twilio-incoming/route.ts:185` | **No tiene columna `tenant_id`.** Nace fuera de las migraciones (`docs/04-deployment.md:304-307`, SQL manual: `phone TEXT PRIMARY KEY, last_sent_at`). Riesgo aparte, no relacionado con 00030 — ver nota §4.2. |
| `webhook_events_seen` | `src/app/api/webhook/zernio/route.ts:91` | Creada en `00036_zernio_provider.sql:334-338` sin columna `tenant_id` (PK `(provider, event_id)`). |
| `review_events` | `src/services/review.service.ts:142` | Creada en `00032_review_tracking.sql` con `tenant_id` propio, sin puente. |
| `reward_grants` | `src/services/reward-grant.service.ts:75` | Creada en `00031_reward_grants.sql`, sin puente. |
| `campaign_rewards` | `src/services/campaign-reward.service.ts:68` | Igual que arriba. |
| `template_versions` | `src/services/template.service.ts:426,457` | Creada en `00039_template_catalog.sql`, sin puente. |
| `tenant_wallet_transactions` | `src/services/wallet.service.ts:192` | Creada en `00027_wallet.sql`, explícitamente "NO tiene `tenant_id` propio de las 18 tablas de negocio" (comentario de `00028:...` línea del historial en `DB_SCHEMA.md`). |
| `send_queue` | vía `db.rpc('enqueue_send_queue', ...)` en `src/services/send-queue.service.ts:150` | Función `SECURITY DEFINER`, tabla creada en 00037/00038 sin puente. No se auditó el cuerpo SQL de la función a fondo porque la tabla nunca tuvo DEFAULT — fuera del alcance de esta migración. |

### 4.2 Hallazgo colateral (fuera del alcance de esta auditoría, no se toca)

`auto_reply_cooldown` (usada por `src/app/api/webhook/twilio-incoming/route.ts:169-185`) es
**global**, sin `tenant_id` en absoluto: el cooldown de 4 horas se comparte entre TODOS los
tenants por número de teléfono. Con 4 tenants operando, un cliente que le escribe a Sushi Service
y minutos después a Don Alirio desde el mismo celular puede quedarse sin auto-reply en el segundo
por el cooldown del primero. Es un problema real, pero es de **otra tabla, sin relación con el
DEFAULT de 00028/00030** — se anota aquí para que quede escrito en algún lado (Mandamiento I),
no se investiga más ni se propone fix: no es del alcance de esta ventana.

---

## 5. Funciones y triggers de la base — ¿qué pasa el día que se aplique?

**`aios_provision_tenant(payload jsonb)`** (`supabase/migrations/00036_zernio_provider.sql:90-217`,
`SECURITY DEFINER`, la única vía de escritura del AIOS para dar de alta un tenant real) inserta en
cuatro de las 18 tablas, y **las cuatro llevan `tenant_id` explícito**:

- `tenants` (línea 148-156) — no es una de las 18, pero es donde nace `v_tenant`.
- `reward_tiers` (líneas 159-174) — `INSERT INTO reward_tiers (tenant_id, ...) VALUES (v_tenant, ...)` × 4 filas.
- `admin_settings` (líneas 177-195) — `SELECT s.key, s.value, v_tenant, now() FROM (VALUES ...) AS s(key, value)`.
- `restaurant_locations` (líneas 199-213, solo si `payload->'locations'` trae array) — `INSERT INTO restaurant_locations (tenant_id, ...) VALUES (v_tenant, ...)`.

`aios_set_template_settings` (líneas 261-317) también inserta en `admin_settings` (línea 306-310,
`INSERT INTO admin_settings (key, value, tenant_id, updated_at) VALUES (v_key, v_value #>> '{}', v_tenant, now())`)
— explícito. `aios_activate_whatsapp` (líneas 224-253) solo hace `UPDATE tenants`, no toca
ninguna de las 18. **Ningún camino del AIOS depende del DEFAULT.**

**Triggers revisados** (`grep` de `CREATE TRIGGER` + `INSERT INTO` en las 41 migraciones):
`trg_reward_redemptions_insert` (00022), `trg_reward_redemptions_grant` (00031) y
`trg_debit_wallet` (00033, dispara sobre `message_logs`) leen `tenant_id` de la fila `NEW` ya
insertada — no insertan tenant_id nuevo, propagan el que ya llegó. `trg_debit_wallet`
(`supabase/migrations/00033_wallet_debits.sql:95-98`) incluso tiene su propia guarda:
`IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF` — hoy esa rama es letra muerta porque
`message_logs.tenant_id` nunca es `NULL` (cae al puente); si algún día un INSERT sin tenant_id
llegara a colarse, hoy factura silenciosamente a Sushi Service, y después de 00030 el INSERT
fallaría antes de que el trigger se dispare.

**Los 3 scripts de onboarding manual** (`scripts/seed-new-tenant.sql`, usado para altas sin AIOS;
`scripts/alta-frangal.sql`, ya ejecutado para el cliente Frangal; `scripts/seed-demo-tenant.sql`,
tenant Demo) — los tres pasan `tenant_id`/`v_tenant` explícito en cada `INSERT INTO` (`tenants`,
`reward_tiers`, `admin_settings`, `restaurant_locations`, y en `seed-demo-tenant.sql` también
`customers`, `visits`, `campaign_rewards`, `restaurant_events`, `campaigns`, `campaign_messages`,
`staff_users`, `authorized_numbers`, `tenant_wallet_transactions`). El paso manual C de
`seed-new-tenant.sql` (dar de alta un mesero) también trae `tenant_id` explícito en su plantilla
de `INSERT INTO staff_users`.

**Conclusión de las secciones 4 y 5:** con el código y las funciones de base auditadas hoy
(2026-09-03), **quitar el DEFAULT es un no-evento para todo camino de escritura conocido.** El
riesgo real de 00030 no es "romper el alta de un cliente hoy" — es la ausencia de una red de
seguridad para el día en que alguien (código nuevo, un script ad-hoc, una edición a mano en el
Table Editor de Supabase) se olvide de pasar `tenant_id`. Sin la 00030, ese olvido no avisa: cae
en Sushi. Con la 00030 aplicada, avisa con un 500 ruidoso.

**Nota para quien siga tocando estas 18 tablas** (incluida la sesión de F3 de multi-sede corriendo
en paralelo): mientras el DEFAULT siga puesto, un `INSERT` que agregue una columna nueva de sede
pero olvide `tenant_id` seguiría escribiendo — mal atribuido, pero sin error. La 00030 es también
la red de seguridad para el trabajo que se está haciendo ahora mismo en `src/`.

---

## 6. SQL de solo lectura — detección de datos ya contaminados

**Advertencia de lectura: TODO lo de esta sección es SOLO LECTURA.** Ningún `UPDATE`, `INSERT`,
`DELETE` ni `ALTER`. Pensado para pegar en el SQL Editor de Supabase, un bloque a la vez, y leer
el resultado a mano — no arroja una respuesta binaria de "contaminado / limpio", da candidatos
para que el dueño los revise.

### 6.1 Estado actual del DEFAULT en las 18 tablas (línea base antes de tocar nada)

```sql
-- SOLO LECTURA
SELECT table_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'tenant_id'
ORDER BY table_name;
```
**Cómo se lee:** hoy (antes de la ventana) se esperan las 18 filas con
`column_default = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid`. Si alguna tabla YA aparece con
`NULL`, alguien aplicó 00030 parcialmente por fuera de este proceso — investigar antes de seguir.
Después de la ventana se esperan las 18 en `NULL`. (Es la misma idea que ya usa
`CHECK_MIGRACIONES_1.sql` en la raíz del repo, pero ese archivo solo prueba `customers` — esta
consulta cubre las 18 de una vez.)

### 6.2 Fotografía de filas por tenant, ANTES de la ventana

```sql
-- SOLO LECTURA — correr y GUARDAR el resultado antes de aplicar 00030
SELECT 'customers' t, tenant_id, count(*) FROM customers GROUP BY tenant_id
UNION ALL SELECT 'visits', tenant_id, count(*) FROM visits GROUP BY tenant_id
UNION ALL SELECT 'rewards', tenant_id, count(*) FROM rewards GROUP BY tenant_id
UNION ALL SELECT 'authorized_numbers', tenant_id, count(*) FROM authorized_numbers GROUP BY tenant_id
UNION ALL SELECT 'campaigns', tenant_id, count(*) FROM campaigns GROUP BY tenant_id
UNION ALL SELECT 'campaign_messages', tenant_id, count(*) FROM campaign_messages GROUP BY tenant_id
UNION ALL SELECT 'admin_settings', tenant_id, count(*) FROM admin_settings GROUP BY tenant_id
UNION ALL SELECT 'restaurant_events', tenant_id, count(*) FROM restaurant_events GROUP BY tenant_id
UNION ALL SELECT 'restaurant_locations', tenant_id, count(*) FROM restaurant_locations GROUP BY tenant_id
UNION ALL SELECT 'reward_tiers', tenant_id, count(*) FROM reward_tiers GROUP BY tenant_id
UNION ALL SELECT 'point_transactions', tenant_id, count(*) FROM point_transactions GROUP BY tenant_id
UNION ALL SELECT 'mystery_box_results', tenant_id, count(*) FROM mystery_box_results GROUP BY tenant_id
UNION ALL SELECT 'mystery_box_global_caps', tenant_id, count(*) FROM mystery_box_global_caps GROUP BY tenant_id
UNION ALL SELECT 'staff_users', tenant_id, count(*) FROM staff_users GROUP BY tenant_id
UNION ALL SELECT 'staff_devices', tenant_id, count(*) FROM staff_devices GROUP BY tenant_id
UNION ALL SELECT 'message_logs', tenant_id, count(*) FROM message_logs GROUP BY tenant_id
UNION ALL SELECT 'reward_redemptions', tenant_id, count(*) FROM reward_redemptions GROUP BY tenant_id
UNION ALL SELECT 'imported_contacts', tenant_id, count(*) FROM imported_contacts GROUP BY tenant_id
ORDER BY t, tenant_id;
```
**Cómo se lee:** guardar este resultado (copiar/exportar) antes de la ventana. Repetirlo después
de aplicar 00030 y del smoke test (§7) — los conteos deben ser IGUALES salvo por el tráfico real
que haya pasado durante la ventana. Un conteo que sube en una tabla sin que nadie haya generado
esa actividad a propósito es la señal más barata de que algo seguía dependiendo del DEFAULT.

### 6.3 Colisión de teléfono entre Sushi Service y otro tenant (customers)

```sql
-- SOLO LECTURA
SELECT
  c_sushi.phone,
  c_sushi.id          AS id_lado_sushi,
  c_sushi.created_at  AS creado_lado_sushi,
  t_otro.slug         AS tenant_otro_slug,
  c_otro.id           AS id_lado_otro,
  c_otro.created_at   AS creado_lado_otro,
  t_otro.created_at   AS tenant_otro_existe_desde
FROM customers c_sushi
JOIN customers c_otro
  ON c_otro.phone = c_sushi.phone
 AND c_otro.tenant_id <> c_sushi.tenant_id
JOIN tenants t_otro ON t_otro.id = c_otro.tenant_id
WHERE c_sushi.tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
ORDER BY c_sushi.created_at DESC;
```
**Cómo se lee:** cada fila es un candidato a revisar A MANO, no una confirmación automática — el
mismo celular puede ser, de verdad, la misma persona visitando dos negocios sin relación. La
bandera roja es `creado_lado_sushi` **posterior** a `tenant_otro_existe_desde`: ese cliente pudo
haberse registrado ya en la era multitenant y, por un `INSERT` que se apoyó en el DEFAULT (por
ejemplo un código viejo en caché, un despliegue a medio camino), cayó en Sushi en vez de en el
tenant correcto.

### 6.4 La prueba fuerte: una visita cuyo tenant no coincide con el tenant de su cliente

```sql
-- SOLO LECTURA — si esto devuelve UNA SOLA fila, hay un bug activo, no solo un residuo histórico
SELECT
  v.id AS visit_id, v.tenant_id AS visit_tenant, v.created_at AS visit_created_at,
  c.id AS customer_id, c.phone, c.tenant_id AS customer_tenant, t.slug AS customer_tenant_slug
FROM visits v
JOIN customers c ON c.id = v.customer_id
JOIN tenants t ON t.id = c.tenant_id
WHERE v.tenant_id <> c.tenant_id;
```
**Cómo se lee:** con el código auditado en §4 (`createVisit()` y `createCustomer()` siempre
reciben el mismo `tenantId` desde el mismo caller — ver `src/app/api/webhook/delivery/route.ts:117-140`
y el check-in de `src/services/customer.service.ts`/`visit.service.ts`), esto **no debería
devolver filas nunca**. Si devuelve algo, hay un camino de escritura que esta auditoría no
detectó y hay que investigarlo antes de la ventana, no después.

### 6.5 `admin_settings` de Sushi con punteros de plantilla sospechosos

```sql
-- SOLO LECTURA
SELECT key, value, updated_at
FROM admin_settings
WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  AND key LIKE '%template_sid%'
ORDER BY key;
```
**Cómo se lee:** cruzar a mano contra `docs/PLANTILLAS.md` y el catálogo real de Sushi Service en
Twilio. Un puntero que no corresponde a ninguna plantilla conocida de Sushi es señal de una fila
sembrada para el tenant equivocado.

---

## 7. Secuencia segura de la ventana

**Precondición ya verificada por esta auditoría:** el código de `src/`, las funciones del AIOS y
los 3 scripts de onboarding manual pasan `tenant_id` explícito en el 100% de los `INSERT`/`UPSERT`
a las 18 tablas. Esto reduce la ventana a un cambio de bajo riesgo técnico — pero sigue siendo un
cambio de comportamiento en producción y merece el mismo cuidado.

1. **Congelar escrituras manuales.** Nada de altas nuevas por `scripts/*.sql` ni ediciones a mano
   en el Table Editor de Supabase mientras dure la ventana (10-15 minutos deberían bastar).
2. **Correr §6.1** (estado del DEFAULT en las 18 tablas) — confirmar que efectivamente sigue
   puesto en las 18, tal como afirma el dueño. Si alguna ya está en `NULL`, parar y entender por
   qué antes de seguir.
3. **Correr §6.2** (fotografía de filas por tenant) y **guardar el resultado** — es la línea base
   contra la que se compara después.
4. **Correr §6.3, §6.4 y §6.5** (candidatos de contaminación) — revisar cualquier fila que
   aparezca ANTES de tocar el DEFAULT. Si `§6.4` devuelve algo, **detener la ventana**: es un bug
   activo, no un problema que 00030 resuelva.
5. **Aplicar la 00030** — pegar el bloque `DO $$ ... $$` completo (líneas 24-51 del archivo,
   reproducido en §2 de este doc) en el SQL Editor de Supabase. Si el guard del paso 1 interno de
   la migración aborta con `ABORTADO: % filas sin tenant_id en la tabla %`, **no aplicó nada** —
   la tabla que reporta es la que hay que sanear (backfill de esas filas) antes de reintentar.
6. **Verificar** con la consulta que ya trae la propia 00030 al final del archivo (líneas 54-59):
   ```sql
   SELECT table_name, column_default
   FROM information_schema.columns
   WHERE column_name = 'tenant_id' AND table_schema = 'public'
   ORDER BY table_name;
   -- Esperado: column_default = NULL en las 18 tablas.
   ```
7. **Smoke test en producción**, en este orden — cada uno ejercita un camino de escritura distinto
   de la tabla de §4:
   - Un check-in real por QR (`customers`, `visits`).
   - Una campaña manual de una fila a un número de prueba (`campaigns`, `campaign_messages`).
   - Un pedido de domicilio de prueba por el flujo de n8n → `/api/webhook/delivery` (mismo camino
     que `customers`/`visits`, pero por el webhook en vez del check-in).
   - Un ajuste desde Dashboard → Recompensas o → Configuración (`rewards`/`reward_tiers`/
     `admin_settings`) para confirmar que el panel sigue guardando.
8. **Repetir §6.2** y comparar contra la fotografía del paso 3 — los conteos deben cuadrar salvo
   por el tráfico real generado en el paso 7.
9. **Monitorear logs de Vercel/Supabase 24-48h** buscando `23502` (`null value in column
   "tenant_id"`) en cualquiera de las 18 tablas — cualquier aparición es un camino de escritura
   que esta auditoría no cubrió (código muerto reactivado, un cron que no se probó, etc.).

### Cómo revertir

`ALTER COLUMN ... DROP DEFAULT` no es destructivo ni irreversible: no borra datos, no cambia
filas existentes. Si el smoke test del paso 7 encuentra un `INSERT` real que dependía del
DEFAULT, la vuelta atrás es instantánea — re-poner el DEFAULT solo en la tabla afectada (no hace
falta revertir las 18):

```sql
-- REVERSIÓN — solo si el smoke test encuentra un INSERT roto.
-- Sustituir customers por la tabla que falló; repetir por cada una que haga falta.
ALTER TABLE customers
  ALTER COLUMN tenant_id SET DEFAULT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

Es el mismo bloque `SET DEFAULT` que ya corrió 00028 (línea 49), acotado a una tabla. Después de
revertir, arreglar el `INSERT` que lo necesitó (agregarle `tenant_id` explícito) y reintentar
`DROP DEFAULT` en esa tabla sola cuando el fix esté desplegado.

---

## 8. Observaciones que no cambian la recomendación pero quedan escritas

- **`docs/DB_SCHEMA.md` no menciona la 00030 en absoluto** — la tabla "Historial de Migraciones"
  salta de la 29 a la 31 sin fila para la 30, y además su columna "Estado" muestra "Pendiente"
  para prácticamente toda migración desde la 2 en adelante (incluidas varias que sí están
  aplicadas en producción, según `CHECK_MIGRACIONES_1.sql`) — esa columna no es confiable como
  fuente de verdad de qué está aplicado. `docs/DB_SCHEMA.md` es territorio de la sesión de F3, así
  que esta auditoría NO lo edita — se deja anotado para quien lo mantenga.
- El comentario original de 00030 (línea 12-14) menciona "2) Importar los datos de Sushi Fun
  (todos con tenant_id)" como precondición — "Sushi Fun" era el tenant #2 del plan multitenant de
  julio (`docs/superpowers/plans/2026-07-05-multitenant-MASTER.md`), anterior al modelo actual de
  Zernio + 25 clientes. Ese tenant específico nunca se dio de alta con ese nombre; los tenants
  reales de hoy son Sushi Service, Don Alirio, Frangal (`scripts/alta-frangal.sql`) y Demo
  (`scripts/seed-demo-tenant.sql`). La precondición sigue siendo válida en espíritu (que cualquier
  dato de otro tenant ya esté con su propio `tenant_id`, nunca en NULL) — el guard interno de la
  propia 00030 (§2, paso 1) la hace cumplir automáticamente sin depender de que este documento
  esté actualizado.
- Los archivos `CHECK_MIGRACIONES_1.sql` y `CHECK_MIGRACIONES_2_datos.sql` (raíz del repo,
  actualmente sin trackear en git) ya existen con el mismo espíritu de solo-lectura que §6 de este
  doc — el primero prueba qué migraciones dejaron rastro en el catálogo (incluida la 00030, línea
  del `WITH probe`), el segundo mira 4 chequeos de datos puntuales. No se tocaron ni se
  duplicaron a propósito; son complementarios a §6, no reemplazados por este doc.

---

## 9. Recomendación

**No es una emergencia que tumbe nada hoy** — la auditoría de §4 y §5 no encontró un solo camino
de escritura, en código o en función de base, que dependa del DEFAULT. Bajo el código actual,
aplicar 00030 es, en la práctica, un cambio de comportamiento sin efecto observable.

**Pero tampoco es prudente dejarla esperando indefinidamente.** El riesgo que cierra no es "algo
se rompe" — es "algo se cuela en silencio", y ese riesgo crece con cada tenant nuevo: sin la
00030, cualquier lapsus futuro (un `INSERT` nuevo que alguien olvide pasar por el patrón
`tenant_id: tenantId`, un script ad-hoc, una edición manual en el Table Editor durante una de las
3 altas que vienen) no avisa — atribuye el dato a Sushi Service para siempre, sin error, sin log,
sin manera de notarlo hasta que alguien lo vea en el dashboard equivocado.

**Recomendación: aplicarla en una ventana corta y controlada, ANTES de que entren las 3
instalaciones nuevas — no necesita esperar a después de la presentación**, porque:
1. Es una operación de metadatos (`DROP DEFAULT`), no reescribe tablas, sin downtime.
2. La propia migración se auto-protege (aborta sola si hay filas sin `tenant_id`).
3. Revertir una tabla puntual es una sola línea de SQL, sin pérdida de datos.
4. El inventario de código (§4) ya demostró que no hay nada que se vaya a romper HOY.

Si el dueño prefiere no tocar producción tan cerca de la presentación, la alternativa razonable es
correr primero §6.1-§6.5 (todo de solo lectura, cero riesgo) para tener la fotografía y los
candidatos de contaminación ya en mano, y reservar el `ALTER` mismo (§7 paso 5 en adelante) para
la primera ventana tranquila después — pero cuanto más tarde, más altas nuevas quedan expuestas al
mismo riesgo silencioso que esta migración existe para cerrar.
