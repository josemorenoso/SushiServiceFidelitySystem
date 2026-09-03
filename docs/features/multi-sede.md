# Feature — Multi-sede (un cliente, varias sedes)

> **Pedido marco, textual del dueño:** *"cada sede debe tener sus datos, es simplemente que los
> clientes conserven su recorrido en las dos sedes; se puede y tiene que funcionar muy bien"*.

| | |
|---|---|
| **Diseño técnico completo** | `docs/superpowers/specs/2026-09-02-multisede-design.md` |
| **Contexto de negocio** | `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §23, §23.bis, §23.ter |
| **Estado** | F1 implementada (00041 + 00042 + arreglo del AIOS). F2..F10 pendientes. |

**El diseño ya está decidido: las 12 decisiones del dueño (D1..D12) están tomadas y no se
re-litigan.** Si algo de este doc contradice al spec, manda el spec.

---

## 1. La idea en tres frases

- **`tenants` es LA MARCA.** Los puntos, las visitas, el tier, la billetera, el cupo y el
  opt-out son de la marca. Eso es lo que hace que el cliente conserve su recorrido entre sedes
  **sin escribir una línea de código**: `customers_phone_tenant_key UNIQUE (phone, tenant_id)`
  ya garantiza una fila por persona y por marca. **Esa constraint no se toca.**
- **`restaurant_locations` es LA SEDE.** Dejó de ser "un punto en el mapa" para la geocerca:
  ahora carga el subdominio, la ficha de Google, el teléfono de domicilios, los meseros y toda
  la atribución.
- **Lo que hay que construir no es la unión. Es la separación.**

---

## 2. Fases

| Fase | Contenido | Estado |
|---|---|---|
| **F1** | 00041 + 00042: la sede como entidad, `UNIQUE (id, tenant_id)`, dominio por sede, sede canónica de los tenants vivos + el arreglo del AIOS | ✅ **hecha** |
| **F2** | 00043: `location_id` en las tablas de eventos, todas NULL | 🔜 en curso, sesión aparte |
| **F3** | `resolveHostContext()`, regla de sede única implícita, propagación a los escritores, **borrar la geocerca comentada** | ⏳ |
| **F4** | 00044 + login del mesero por sede (D11) | ⏳ |
| **F5** | 00046 + calendario, crons y domicilios con el interruptor de ≥2 sedes (D8, D9) | ⏳ |
| **F6** | Desglose por sede en el dashboard (D4, D12) | ⏳ |
| **F7** | 00045 + `LocationScope` + selector en el panel (D10) | ⏳ |
| **F8** | 00047 + AIOS: `product_location_id`, wizard de sede 2..N | ⏳ |
| **F9** | 00048: `location_messaging`, cupo por línea, plantillas por línea | ⏳ solo si D6 = número por sede |
| **F10** | 00049: `customer_review_state` | ⏳ confirmar la suposición §7.2 |

**F3 es el cuello de botella**: sin resolución de sede, `location_id` nace vacía.

---

## 3. F1 — lo que ya está en la base

### 3.1 `00041_locations_first_class.sql`

`restaurant_locations` gana:

| Columna | Tipo | Para qué |
|---|---|---|
| `slug` | `text` NULL | Identificador estable de la sede dentro de la marca (`sede-principal`, `laureles`). Único por `(tenant_id, slug)`. |
| `domain` | `text` NULL | Subdominio propio de la sede. Único **GLOBAL**. |
| `config` | `jsonb` NOT NULL `'{}'` | Override por sede de las claves de `tenants.config` que son *"a dónde te mando / cómo te contacto"*. **Vacío = hereda la marca**, que es el comportamiento de hoy bit a bit. |
| `is_primary` | `boolean` NOT NULL `false` | La sede que hereda el dominio y el material impreso de la marca. |
| `sort_order` | `integer` NOT NULL `0` | Orden de presentación. |

Y además:

- **`lat` / `lon` pasan a NULLABLE**, con `CHECK ((lat IS NULL) = (lon IS NULL))`. Media
  coordenada no es una ubicación.
- **`restaurant_locations_id_tenant_key UNIQUE (id, tenant_id)`** — ⚠️ **nombre exacto, es
  contrato con F2.** Redundante para la unicidad (`id` ya es PK), imprescindible para la
  referencia: Postgres exige un índice único que cubra exactamente esas columnas para poder
  declarar la FK compuesta `(location_id, tenant_id)`.
- `idx_restaurant_locations_domain` — único **global**, parcial (`WHERE domain IS NOT NULL`).
- `idx_restaurant_locations_tenant_slug` — único `(tenant_id, slug)`, parcial.
- `trg_restaurant_locations_domain_guard` — unicidad **cruzada** contra `tenants.domain`.
- CHECK de formato de `slug` (kebab-case, 1..63) y de `domain` (hostname minúsculas, ≥2 labels,
  sin esquema ni ruta). Espejo de `isValidSubdomainLabel` / `isValidHostname` del AIOS
  (`Level 2.0/aios-constelarys/src/lib/domains.ts`). Va **también** en la base porque 55
  archivos escriben con `service_role`, que bypasa RLS: una whitelist que vive solo en
  TypeScript es una sugerencia.

**Por qué `lat`/`lon` nullable no es cosmético.** La tabla nació en la 00014 para la geocerca
anti QR-scam, apagada desde v1.0.5-3. Ese `NOT NULL` hacía que el AIOS solo mandara
`locations[]` con las dos coordenadas, y `aios_provision_tenant` (00036:199-213) solo entra a su
bucle si el array existe: **un negocio dado de alta sin coordenadas nacía sin ninguna sede, en
silencio**. Por eso los 4 tenants vivos suman ~1 fila en toda la tabla.

### 3.2 `00042_sede_principal_tenants_vivos.sql`

Migración de **datos**. Por cada tenant que ya existe:

| Sedes que tiene | Qué hace |
|---|---|
| 0 | Crea `'Sede principal'` (`slug='sede-principal'`, `is_primary=true`, `domain = tenants.domain`, sin coordenadas). |
| 1 | **Adopta** esa fila: le pone `slug`/`domain` si le faltan y `is_primary=true`. Con una sola sede, ésa es la principal por definición. |
| ≥2 | **No la toca** y avisa con `RAISE WARNING`. Elegir mal delegaría el subdominio impreso a la sede equivocada. |

Es **idempotente** (los `COALESCE` no pisan nada puesto a mano) y **no toca una sola fila de
historia**.

### 3.3 El subdominio ya impreso baja a la sede

`tenants.domain` **se queda** como dominio principal de la marca e `idx_tenants_domain` (00029)
no se toca. La sede principal **repite** ese mismo dominio. Resultado:
`clubsushiservice.constelarys.com` sigue resolviendo, ahora a marca **+ sede**. **Cero
reimpresión de QR.** Solo la sede *nueva* estrena subdominio y material.

Como un índice único por tabla no puede impedir que la sede de la marca A se quede con el
dominio principal de la marca B, va el trigger cruzado: el solape se permite **solo dentro del
mismo tenant**.

### 3.4 El arreglo del AIOS (otro repo)

`Level 2.0/aios-constelarys/src/lib/actions/provisioning.ts` — **la sede se crea SIEMPRE**. Las
coordenadas pasan a ser un dato opcional más, y van en pareja o no van.

> ⚠️ **ORDEN DE DESPLIEGUE ENTRE REPOS.** La **00041 va primero**, en el Supabase del producto.
> Si el AIOS se despliega antes, `aios_provision_tenant` manda lat/lon NULL contra un `NOT NULL`
> que todavía existe, revienta con **23502** y **el alta entera falla** (la función es atómica).

---

## Columnas de sede en las tablas de eventos

**`00043_location_id_eventos.sql`** le pone la dimensión "sede" a las **13 tablas que registran
hechos**. Son **18 columnas y todas nacen vacías**: nadie las lee todavía, así que después de
aplicarla el sistema se comporta exactamente igual que antes. Quien las **llena** es F3; quien las
**lee**, F5/F6/F7.

| Tabla | Columna(s) | Qué significa |
|---|---|---|
| `visits` | `location_id`, `location_source`, `location_conflict` | Dónde ocurrió **y de dónde salió el dato** |
| `point_transactions` | `location_id` | Dónde se generó el punto |
| `review_events` | `location_id` | Qué ficha de Google se mostró (D5) |
| `reward_grants` | `granted_location_id` | Dónde se **ganó** el premio (D12) |
| `reward_redemptions` | `redeemed_location_id` | Dónde se **entregó** (D3 + D12) |
| `message_logs` | `location_id`, `line_location_id` | A quién se **imputa** / por qué **línea** salió |
| `tenant_wallet_transactions` | `location_id` | La sede del asiento contable (D4) |
| `send_queue` | `location_id` | Que el goteo no pierda la sede |
| `consent_events` | `location_id` | Evidencia, **no permiso** |
| `campaigns` | `location_id` | Quién la lanzó |
| `authorized_numbers` | `location_id` | El operador de domicilios (D9) |
| `restaurant_events` | `location_id` + `audience_scope` | La audiencia del evento (D8) |
| `customers` | `origin_location_id`, `last_visit_location_id` | Sede de origen (D2) + caché de "sede de casa" |

### La regla transversal, sin excepciones

Cada columna de sede es **NULLABLE** y lleva **FK COMPUESTA**:

```sql
(columna, tenant_id) REFERENCES restaurant_locations (id, tenant_id) ON DELETE RESTRICT
```

- **Compuesta**, porque el aislamiento real no lo da el RLS: son 144 `.eq('tenant_id', …)` a mano en
  48 archivos, y el que se olvida uno **no recibe ningún error**. La FK compuesta mueve esa garantía al
  motor: es imposible grabar un hecho de la marca A contra una sede de la marca B. Una FK simple sobre
  `id` lo permitiría y Postgres no diría nada. Se apoya en `restaurant_locations_id_tenant_key`, que
  crea F1.
- **`MATCH SIMPLE`** (el default), a propósito: si alguna columna de la pareja es NULL la FK se da por
  satisfecha, que es justo lo que necesita una visita histórica (`tenant_id` NOT NULL, `location_id`
  NULL). **`MATCH FULL` rechazaría cada fila de historia** de los 4 tenants vivos.
- **`ON DELETE RESTRICT`**, no `SET NULL`: una sede **nunca se borra, se desactiva** con
  `is_active = false`. `SET NULL` degradaría historia a "sede desconocida" **en silencio** y destruiría
  justo el dato que D12 pide medir. Con RESTRICT, borrar una sede con historia falla con `23001`.

Cada columna lleva además un **índice parcial** `(tenant_id, columna) WHERE columna IS NOT NULL`:
Postgres indexa el lado referenciado, nunca el que referencia, así que sin él cada intento de borrar
una sede haría un seq scan de las 15 tablas — y el filtro por sede del dashboard no tendría por dónde
entrar. Hoy son 15 índices prácticamente vacíos.

### `restaurant_events` es la EXCEPCIÓN — leerlo antes de tocarla

⚠️ En **todas** las demás tablas `NULL` significa **"sede desconocida"**. En `restaurant_events`
significaría **"toda la marca"** — dos lecturas opuestas del mismo NULL en el mismo sistema es una
clase entera de bug. Por eso lleva una columna **explícita**:

- `audience_scope = 'brand'` → exige `location_id IS NULL` (evento de toda la marca).
- `audience_scope = 'location'` → exige `location_id IS NOT NULL` (evento de una sede).

Lo amarra el CHECK `restaurant_events_audience_pareja_check`, y el `DEFAULT 'brand'` hace que los
eventos que ya existen **no cambien de comportamiento**.

### `visits.location_source` — la procedencia, no solo la sede

Sin saber **de dónde salió** la sede, una mal resuelta es indistinguible de una bien resuelta y D12 se
apoyaría en un número que nadie puede auditar. Las 7 vías del CHECK: `staff_user`, `staff_device`,
`host`, `host_single`, `qr_token`, `authorized_number`, `manual`. Un segundo CHECK exige que
`location_id` y `location_source` **vayan juntos o no vayan**.

`location_conflict` es **tri-estado** a propósito: `NULL` = no se evaluó (todo el histórico), `false` =
el QR coincidía, `true` = el QR decía otra sede. Poner `NOT NULL DEFAULT false` habría afirmado
"verificado, sin conflicto" sobre ~1581 visitas que nadie verificó nunca.

### Dos columnas en `message_logs`, no una

`line_budget()` calcula el p95 transaccional sobre **14 días de `message_logs`**. Con líneas por sede
ese p95 tiene que ser **por línea**: si no, el volumen de la sede A infla la reserva de la sede B y le
come el presupuesto, en silencio. `send_reservations` no sirve de reemplazo porque se poda a 7 días.

### Cero backfill

El histórico de los 4 tenants vivos (~1581 `visits`, ~991 `point_transactions`, ~685 `review_events`,
~1176 `customers`) **se queda en NULL**, y NULL **se muestra** como un cubo propio llamado *"Sin sede"*:
nunca se reparte ni se esconde. Repartirlo sería adivinar, y el número adivinado terminaría en un
reporte de plata.

### La guarda de dependencia

La 00043 abre comprobando **por forma, no por nombre** que exista un índice único (o el PK) sobre exactamente
`(id, tenant_id)` en `restaurant_locations`. Si falta (F1 sin aplicar), aborta entera con `42830` y un
mensaje que dice qué falta, en vez de fallar 15 veces seguidas o quedar aplicada a medias.

---

## 4. Reglas que valen para todas las fases

- **`location_id` es SIEMPRE nullable**, con **FK compuesta** `(location_id, tenant_id)
  REFERENCES restaurant_locations (id, tenant_id) ON DELETE RESTRICT`. Una FK simple deja grabar
  una visita de la marca A con la sede de la marca B — y el aislamiento del producto hoy no lo
  da el RLS, son 144 `.eq('tenant_id', …)` en 48 archivos y el que se olvida no recibe error.
- **`ON DELETE RESTRICT`, nunca `SET NULL`.** `SET NULL` degradaría historia a "sede
  desconocida" **en silencio** al desactivar una sede. Una sede **nunca se borra: se desactiva**
  con `is_active = false`.
- **NULL no se rellena.** El histórico de los tenants vivos se queda en NULL. **NULL significa
  "sede desconocida" y SE MUESTRA**, como un cubo propio llamado *"Sin sede"*. Nunca se reparte
  ni se esconde: repartirlo sería adivinar, y el número adivinado terminaría en un reporte de
  plata.
- **Excepción:** en `restaurant_events`, NULL significaría "toda la marca" — dos lecturas
  opuestas del mismo NULL. Por eso esa tabla usa `audience_scope ('brand'|'location')`
  explícito.
- **Interruptor de compatibilidad:** todo el comportamiento nuevo se activa **solo si el tenant
  tiene ≥2 sedes activas**. Con 0 o 1, cada cron, campaña y evento corren exactamente como hoy.
- **Nada de `CREATE INDEX CONCURRENTLY`** en estas migraciones: el arnés de tests manda el
  archivo entero en un solo `client.query()`, que el protocolo simple envuelve en transacción
  implícita → muere con 25001.

---

## 5. Deuda conocida y decisiones abiertas

Ninguna de éstas se cierra por cuenta propia: son decisiones del dueño o de una fase posterior.

| # | Qué falta | Por qué quedó abierto |
|---|---|---|
| 1 | **`config` sin whitelist.** El spec pide la columna en §4/00041, pero el CHECK de las 4 claves permitidas (`google_maps_url`, `delivery_phone`, `whatsapp_link`, `instagram_url`) y la función espejo `merge_location_config()` viven en **§7.1, que no lleva número de migración**. | Se agregó la columna y nada más. La whitelist y la función se deciden aparte. |
| 2 | **El trigger cruzado es de UNA dirección** (sede → `tenants.domain`). Falta el simétrico sobre `tenants`: un tenant nuevo podría tomar un `domain` que ya usa la sede de otra marca. | El §3.3 del spec habla de **un** trigger. Hoy no es explotable: ninguna sede tiene `domain` distinto del de su marca hasta que exista la sede 2 (F8). |
| 3 | **`is_primary` no tiene índice único por tenant.** Dos filas con `is_primary = true` son hoy legales. | No está en el spec. La 00042 deja exactamente una por tenant. |
| 4 | **El `## Diagrama ER` de `docs/DB_SCHEMA.md` está obsoleto** por su cuenta (el bloque `customers` ni siquiera tiene `tenant_id`) y es un único bloque mermaid: dos sesiones no lo pueden tocar a la vez. | Se cierra aparte, en una sola sesión, después de F1+F2. |
| 5 | **«Las 37 migraciones originales…»** en `docs/features/testing.md:61` y sus espejos en `tests/setup/`. Hoy son 43. | Ningún test compara ese número (son comentarios sin assert). Deuda aparte. |
| 6 | **La separación de una sede** (venta, franquicia, socio distinto). | Riesgo **aceptado y aplazado por el dueño** (2026-09-02). No hay función de split y no se inventa: fundir es un `INSERT`, separar exige inventar de quién son los puntos, el saldo, los opt-outs y el libro de consentimiento. |
| 7 | **Ningún premio tiene precio en ninguna tabla.** | D12 ("efectividad por sede") solo puede responderse en **conteos y tasas, nunca en pesos**. Hay que decirlo en pantalla. |
| 8 | **Adoptar el histórico** para un tenant de una sola sede es posible y es **irreversible**. | No se ejecuta sin orden explícita del dueño. |

---

## 6. Cómo se verifica

`tests/setup/global-postgres.ts` levanta un Postgres embebido y aplica **todas** las migraciones
en orden con `readdirSync(...).sort()`. Una migración rota revienta ahí, nombrando el archivo.

> ⚠️ **`.pgdata-test` es una ruta FIJA dentro del repo** y `global-postgres.ts` la borra con
> `rmSync` al arrancar. **Dos corridas de `vitest` a la vez se destruyen la base entre sí**, y
> cambiar `TEST_PG_PORT` no sirve porque el directorio no es parametrizable. Si hay otra sesión
> trabajando sobre el mismo árbol: anunciar antes de correr los tests, o usar un worktree
> separado.

F1 se verificó además con un arnés **aislado** (su propio `embedded-postgres`, su propio
directorio y su propio puerto): **62 comprobaciones en verde**, incluida una FK compuesta real
declarada contra `restaurant_locations_id_tenant_key` que acepta el evento con la sede de su
propia marca, acepta `location_id` NULL y **rechaza con 23503 el evento de la marca A con la
sede de la marca B**.

---

## 7. Archivos

| Archivo | Qué es |
|---|---|
| `supabase/migrations/00041_locations_first_class.sql` | La sede como entidad. |
| `supabase/migrations/00042_sede_principal_tenants_vivos.sql` | Sede canónica de los tenants vivos. |
| `Level 2.0/aios-constelarys/src/lib/actions/provisioning.ts` | La sede se crea siempre (**repo aparte**: `Cada1_AIOS`). |
| `src/app/api/dashboard/location/*` | ⚠️ Hace `.single()` sobre `restaurant_locations` filtrando **solo por tenant**: con 2 sedes activas devuelve 500, y su PUT inserta una tercera fila en vez de actualizar. **Se arregla en F3, no antes.** |
| `src/lib/tenant.ts` | `getTenantByDomain` **conserva su firma** — la sede viaja por `resolveHostContext()` (F3). Cambiar la firma toca 16 archivos de golpe. |
