# Feature — Multi-sede (un cliente, varias sedes)

> **Pedido marco, textual del dueño:** *"cada sede debe tener sus datos, es simplemente que los
> clientes conserven su recorrido en las dos sedes; se puede y tiene que funcionar muy bien"*.

| | |
|---|---|
| **Diseño técnico completo** | `docs/superpowers/specs/2026-09-02-multisede-design.md` |
| **Contexto de negocio** | `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §23, §23.bis, §23.ter |
| **Estado** | F1, F2, F3 y **F4** implementadas. Las migraciones 00041, 00042 y 00043 estan APLICADAS en produccion; la **00044 esta en el repo y NO se ha aplicado todavia**. F5..F10 pendientes. |

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
| **F2** | 00043: `location_id` en las tablas de eventos, todas NULL | ✅ **hecha** (aplicada en produccion) |
| **F3** | `resolveHostContext()`, regla de sede única implícita, propagación a los escritores, **borrar la geocerca comentada** | ✅ **hecha** — ver §3.bis |
| **F4** | 00044 + login del mesero por sede (D11) + las dos funciones SQL que perdian la sede | ✅ **hecha** — ver §3.ter |
| **F5** | 00046 + calendario, crons y domicilios con el interruptor de ≥2 sedes (D8, D9) | ⏳ |
| **F6** | Desglose por sede en el dashboard (D4, D12) | ⏳ |
| **F7** | 00045 + `LocationScope` + selector en el panel (D10) | ✅ **hecha** — ver §3.quater |
| **F8** | ~~00047~~ **`00056`** (`aios_add_location()`, `aios_set_location()`, `aios_provision_tenant()` con sedes de verdad) + AIOS: `product_location_id`, `site_model`, wizard de sede 2..N | 🚧 **en curso 2026-09-07** — ver §2.bis |
| **F9** | 00048: `location_messaging`, cupo por línea, plantillas por línea | ⏳ **D6 decidida 2026-09-05**: N líneas por marca, la sede NO obliga a una línea — ver §5, deuda 6.bis |
| **F10** | 00049: `customer_review_state` | ⏳ confirmar la suposición §7.2 |

~~**F3 es el cuello de botella**~~ — ya no lo es: desde F3 las columnas de la 00043 se llenan
solas en el check-in, el registro y los domicilios. Lo que sigue vacío y por qué está en §3.bis.

### 2.bis — F8 dejó de ser teórica (2026-09-07)

**El AIOS crea un tenant por cada sede.** `siteCreateTenant()` llama
`aios_provision_tenant` una vez por fila de `client_locations`, así que un negocio con dos locales
nace como **dos marcas**. Eso rompe las dos cosas de §1: el número compartido (dos
`zernio_account_id` chocan contra `idx_tenants_zernio_account_id`, que **hace bien** — impide que
dos MARCAS compartan línea) y el recorrido del cliente entre sedes.

**Nada roto en producción**: las 5 marcas vivas son de una sola sede. Lo destapó **Tepuy**
(dos locales), que llega ANTES de tener datos — la única ventana barata, porque unir dos tenants
después es fusionar clientes, puntos y tiers a mano.

Dato que este doc no tenía: **`aios_provision_tenant` YA itera `payload->'locations'`**
(`00036:199-213`). El alta de varias sedes de una marca no necesita función nueva; el AIOS
simplemente nunca le mandó más de una. Lo que SÍ hace falta es **agregar una sede a un tenant que
ya existe**: el rol `aios_constelarys` no tiene INSERT sobre `restaurant_locations` desde la
00035 v2, así que va una `aios_add_location()` `SECURITY DEFINER` con el mismo patrón de la 00036.

⚠️ **Pero ese dato estaba a medias, y la corrección es lo que obligó a tocar más de lo previsto**
(2026-09-07): el bucle itera, sí, pero su `INSERT` escribe solo
`tenant_id, name, address, lat, lon, radius_meters, is_active` — **no escribe `slug` ni `domain`**.
Y por D21 (§3.5) una marca con 2+ sedes activas deja de atribuir por el dominio raíz: el registro
responde **409**. O sea que un alta de dos sedes con la función como estaba **nacía creada pero
MUERTA** — dos sedes sin subdominio, ni un cliente nuevo pudiendo registrarse. Por eso la 00056
**reemplaza** `aios_provision_tenant`, conservando su firma `(payload jsonb)`: la trampa del
42725 aplica a *agregar un parámetro*, no a cambiar el cuerpo, y la migración lo verifica al
final (si quedan dos versiones, aborta).

⚠️ **El número `00047` que este doc reservaba para F8 ya lo tomó `00047_identidad_visual.sql`.**
El de F8 salió de `node scripts/proxima-migracion.mjs`: es la **`00056`**.

### Lo que trae la `00056` (lado producto de F8)

| Qué | Para qué |
|---|---|
| `aios_add_location(p_tenant_slug, payload)` | La sede 2..N de una marca que ya existe. `is_primary` **siempre false** (la principal la fijó la 00042) y `sort_order` se calcula solo |
| `aios_set_location(p_tenant_slug, p_location_id, payload)` | Editar nombre/dirección/estado/orden. Lo que el payload no trae, **no se toca** |
| `aios_validar_sede(...)` | Validación compartida por las dos vías de escritura, en un solo sitio para que no diverjan (mismo criterio que `connection_apply_whatsapp()` en la 00054) |
| `aios_provision_tenant(payload)` | **Reemplazada**: su bucle escribe `slug`, `domain`, `is_primary` y `sort_order`. La PRIMERA sede del array nace principal |
| `GRANT SELECT` **por columnas** + policy | El rol lee `restaurant_locations`. **`config` queda FUERA**: es el espacio de override por sede y mañana puede llevar datos que el AIOS no tiene por qué ver |

**Tres rechazos que valen más que las tres funciones juntas**, porque convierten caídas
silenciosas en errores que dicen qué hacer:

- **`sede_sin_identidad`** — un alta de 2+ sedes en la que alguna venga sin `slug` o sin `domain`.
  Es el caso «nace creada pero muerta» de arriba.
- **`sede_previa_sin_subdominio`** — agregar la sede 2 a una marca cuya sede 1 todavía vive del
  dominio raíz. Mientras es única, la sede 1 se atribuye por «sede única implícita»; el instante
  en que nace la segunda ese atajo **se apaga**, y sin este rechazo el alta de la sede 2 dejaría a
  la sede 1 sin poder registrar un solo cliente nuevo. Es el paso `single → multi`, y se destraba
  con `aios_set_location()` dándole su subdominio a la sede 1.
- **`sede_dominio_es_el_de_la_marca`** — una sede nueva tomando el dominio raíz. El raíz tiene que
  seguir significando «la marca»: con 2+ sedes su trabajo es dar 409 y dejar elegir.

⚠️ **La única excepción al «`domain` se fija al crear»**: `aios_set_location()` sí puede FIJARLO
mientras la sede no tenga uno propio (NULL, o igual al de su marca). Sin eso, `single → multi` no
se puede hacer y `sede_previa_sin_subdominio` sería un callejón sin salida. Una sede que ya
estrenó subdominio queda **congelada** (`sede_dominio_congelado`): ahí sí está impreso en QR.

Pruebas: `tests/db/multisede-aios-sedes.test.ts` — 17 comprobaciones contra Postgres real,
incluidas las dos direcciones del paso `single → multi` y que una sede de otra marca no se puede
editar aunque llegue su uuid.

Brief completo (invariante, qué está mal con archivo y línea, guardrails, 8 criterios de
aceptación): `Level 2.0/aios-constelarys/docs/PROMPT-2026-09-07-multisede-aios.md`.

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

### 3.5 El dominio cruzado, cerrado en las dos direcciones (`00051`)

> **Regla del dueño, 2026-09-06:** *un restaurante con sedes le pone la ciudad al subdominio
> **desde el principio**, y todas las sedes son pares* — `laureles.marca.com`,
> `envigado.marca.com`. No hay una principal con subramas.

Esa regla es la que obligó a cerrar la deuda 2. La 00041 la había dejado abierta con una
condición escrita en su propio bloque 6: *«hoy no es explotable — ninguna sede tiene `domain`
distinto del de su marca hasta que exista la sede 2»*. La regla nueva es exactamente eso.

**Lo que se podía hacer sin el trigger simétrico.** Existe la sede `laureles.marca-a.com`. Se
da de alta la marca B con `tenants.domain = 'laureles.marca-a.com'`:

| Guardarraíl | Por qué no lo frena |
|---|---|
| `idx_tenants_domain` (00029) | Es único **dentro de** `tenants`. |
| `idx_restaurant_locations_domain` (00041) | Es único **dentro de** `restaurant_locations`. |
| `trg_restaurant_locations_domain_guard` (00041) | Vive sobre la **otra** tabla: un INSERT en `tenants` no lo despierta. |

Y entonces `resolveHostContext()` tiene **dos dueños para el mismo host**: su camino 1
(`getTenantByDomain`) contesta la marca B, su camino 2 habría contestado la marca A. Gana el
camino 1, así que el subdominio de una sede de A pasa a servir la marca B entera — su tarjeta,
su catálogo y su check-in.

La `00051` pone `trg_tenants_domain_guard`, espejo exacto del de la 00041. Tres detalles:

- **El solape dentro del mismo tenant se sigue permitiendo.** Es el caso de la 00042: la sede
  principal repite el dominio de su marca, y eso es lo que evita reimprimir un solo QR.
- **No filtra por `is_active`.** Una sede desactivada conserva su `domain` y ningún trigger
  escucha `is_active`, así que permitir tomar el dominio de una sede dormida haría que el
  choque naciera en silencio el día que alguien la reactive.
- **Trae prevuelo.** Si en producción ya hubiera un dominio compartido entre marcas, la
  migración **aborta** en vez de instalar un guardarraíl que lo dejaría congelado e invisible.

Pruebas: `tests/db/multisede-resolucion.test.ts`, bloque *«D2 — un host resuelve a UNA sola
marca»*. Cubre **las dos** direcciones a propósito: la garantía es de los dos triggers o de
ninguno, así que quien borre uno tiene que ver fallar esto.

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

## 3.bis — F3: cómo se averigua la sede (lo que ya corre)

> Spec: §3 completo. Código: `src/lib/location-resolver.ts` (puro) + `resolveHostContext()`
> en `src/lib/tenant.ts` (el I/O). **F3 no llevó migración**: todas las columnas ya existían
> desde la 00043.

### La precedencia, exacta

```
staff_users.location_id  →  staff_devices.location_id  →  host  →  NULL
```

El **mesero autenticado GANA sobre el host**. El caso que lo justifica: un cliente parado en
Laureles abre su enlace guardado de `envigado.marca.com`; si ganara el host, la visita se
acreditaría a Envigado y el reporte de D12 mentiría sin que nadie lo note. El mesero es de UNA
sede (D11), está físicamente donde ocurre la visita y su credencial la emite el sistema.

El claim **`loc` del JWT del QR NUNCA decide** la sede: lo arma el navegador del cliente con el
subdominio que tenga abierto. Solo pone `visits.location_conflict`.

> ✅ **Las dos vías más fuertes YA TIENEN FUENTE** desde F4 (§3.ter): la 00044 creó
> `staff_users.location_id` y `staff_devices.location_id`, y el check-in las pide en su
> `SELECT`. Un mesero o un dispositivo **sin sede asignada** manda `null` y la precedencia
> cae al host, exactamente igual que antes de F4.
>
> ⚠️ **Orden de despliegue, no negociable:** la **00044 se aplica ANTES** de desplegar el
> código de F4. Al revés, el `SELECT` pide una columna que no existe, PostgREST devuelve
> `42703`, `staff` queda `null` y el check-in responde **403 a todos los meseros del producto**.

### La regla del dominio raíz — «sede única implícita»

| Host | Sedes activas | Resultado | `location_source` |
|---|---|---|---|
| subdominio de una sede | cualquiera | esa sede | `host` |
| dominio raíz de la marca | **1** | esa sede | `host_single` |
| dominio raíz de la marca | **2+** | **sin sede** + `409` con la lista | — |
| dominio raíz de la marca | 0 | sin sede, sin preguntar | — |
| host desconocido | — | sin marca → 404 | — |

Esto le da a Sushi Service, Don Alirio, Frangal y Demo **atribución perfecta y gratis**: sin
subdominio nuevo y **sin reimprimir un solo QR**. Y se auto-corrige — el día que uno abra su
segunda sede, el dominio raíz deja de atribuir automáticamente.

El dominio raíz manda **aunque la sede principal repita ese mismo dominio** (que es lo que hace
la 00042). Resolver por coincidencia exacta de `domain` haría que la marca con 2 sedes le
siguiera atribuyendo todo a la principal, en silencio.

`resolveHostContext()` además resuelve la marca por **dos** caminos: `tenants.domain` (lo de
siempre) y `restaurant_locations.domain` (el subdominio de la sede 2..N). Sin el segundo,
`laureles.marca.com` devolvería 404. **`getTenantByDomain` conserva su firma intacta.**

### El 409 del registro

`POST /api/check-in` con `action: 'register'` responde **409 `"Sede requerida"`** con
`locations[]` (id, name, slug, domain). El cliente abre el `domain` de su sede y repite: ese
host resuelve por `host` y no se vuelve a preguntar. **El endpoint no acepta un `location_id`
en el body** — ver la deuda #9.

Con **0 o 1** sedes activas este 409 **no se dispara nunca**: es el interruptor de
compatibilidad del §8.3 del spec.

### Qué columna llena cada camino

| Escritor | Columnas que llena | Procedencia |
|---|---|---|
| `POST /api/check-in` · `register` | `visits.location_id/location_source`, `customers.origin_location_id`, `customers.last_visit_location_id`, `point_transactions.location_id`, `message_logs.location_id` | `host` / `host_single` |
| `POST /api/check-in` · `checkin` | las mismas + `visits.location_conflict` | `host` / `host_single` (y `staff_user`/`staff_device` cuando llegue F4) |
| `POST /api/webhook/delivery` | las mismas (sin conflicto) | `authorized_number` |
| `POST /api/check-in/review-action` | `review_events.location_id` | la del host |

`visits.location_source` y `location_id` **van juntos o no van** — lo impone el CHECK, y el
resolver lo cumple por construcción: nunca asigna uno sin el otro.
`location_conflict` es **TRI-ESTADO**: `NULL` = no se evaluó (no hubo claim `loc`, o no se
resolvió sede) · `false` = el QR coincidía · `true` = el QR decía otra sede. **Nunca se escribe
`false` por defecto.**

### La geocerca comentada: BORRADA

El bloque que dormía comentado en `src/app/api/check-in/route.ts:209-244` **ya no está**
(spec §3.5). Como control de acceso lo reemplazó, con ventaja, la exigencia de
`source === 'staff_scan'`. Y dejarlo era peligroso: su query no filtraba `tenant_id` y usaba
`.single()`, así que el primero que lo descomentara con 2 sedes activas rompería el check-in
con `PGRST116` para **todos los clientes de todos los tenants**. `lat`/`lon` se siguen
aceptando en el body y se ignoran.

### 3.quinquies — Lo PÚBLICO también resuelve por la sede (2026-09-08)

F3 y F4 cambiaron el check-in y la superficie del mesero a `resolveHostContext()`, pero
**la superficie pública se quedó en `getTenantByDomain()`**, que solo mira `tenants.domain`.
Con el subdominio propio de una sede eso devuelve `null`: la tarjeta,
`/api/check-in/status`, `/api/mystery-box/resolve` y las tres rutas de `/api/public/*`
respondían **404**, y `getBrandingForHost()` caía a `DEFAULT_BRANDING` — las
`NEXT_PUBLIC_BRAND_*` del despliegue. O sea: **el cliente escanea el QR impreso de su sede
y ve el nombre y los colores de otro restaurante.**

No se notó antes porque ninguna marca viva tenía dos sedes. Lo destapó **Tepuy**.

La resolución vive ahora en **`getTenantByHost()`** (`src/lib/tenant.ts`), que es el cuerpo
que `resolveHostContext()` usa para llegar a la marca: quien solo necesita la marca paga una
consulta menos, y los dos caminos no pueden divergir. `getTenantByDomain()` conserva su firma
y sus llamadores.

### 3.sexies — El AIOS no podía LEER las sedes (`00057`, 2026-09-08)

La `00056` le dio al rol `aios_constelarys` un `GRANT SELECT` por columnas sobre
`restaurant_locations` y su propia policy `USING (true)`. Aun así, leer la tabla devolvía
**`42501: permission denied for schema auth`**, y con eso el paso 3 del alta («Verificar el
subdominio») fallaba en TODO negocio con dos locales.

No faltaba el GRANT: fallaba **evaluar las otras policies**. Las de la `00026` se crearon
**sin cláusula `TO`**, así que aplican a `PUBLIC` —el rol del AIOS incluido— y su `USING`
llama a `current_tenant_id()` (`00024:32`), que es `LANGUAGE sql STABLE`, **no**
`SECURITY DEFINER`, y por dentro hace `auth.jwt()`. Sin `USAGE` sobre el esquema `auth`,
Postgres revienta ahí y ni llega a mirar la policy permisiva del AIOS.

La `00057` mueve la lectura a **`aios_list_locations(p_tenant_slug)`**, `SECURITY DEFINER`
como todo lo demás que el AIOS usa: corre como su dueño, no pasa por las policies y no
necesita nada de `auth`. Devuelve las mismas columnas que el GRANT de la 00056 autorizaba —
**`config` sigue fuera**, y al pasar a función esa lista de retorno es lo ÚNICO que la
protege, así que hay un test que lo vigila.

> ⚠️ **La primera versión de la 00057 hacía `GRANT USAGE ON SCHEMA auth` y no sirve.** En
> Supabase el esquema `auth` es de `supabase_auth_admin`: un `GRANT` que el ejecutor no
> tiene derecho a otorgar sale como **WARNING, no como ERROR** — parece exitoso y no hace
> nada. Lo cazó el bloque de verificación de la propia migración. Es una trampa que vuelve:
> que el motor no se queje no significa que algo haya pasado.
>
> Tampoco se tocó `current_tenant_id()`: volverla `SECURITY DEFINER` arreglaría esto y más,
> pero esa función la evalúa CADA policy del sistema, y cambiarle el modo de ejecución por
> un permiso del AIOS es mover el suelo de todo el aislamiento por un problema de una esquina.

### Cómo se verifica

- `tests/unit/location-resolver.test.ts` — la **decisión**: precedencia, sede única implícita,
  el flag del 409 y el tri-estado, sin base de datos.
- `tests/db/multisede-resolucion.test.ts` — el **contrato con el schema**, contra el Postgres
  embebido con las 43 migraciones aplicadas: que lo que el resolver produce es exactamente lo
  que los CHECK aceptan, que media pareja se rechaza con `23514`, que el tri-estado se guarda
  como tri-estado, que la FK compuesta rechaza con `23503` la visita de la marca A contra la
  sede de la marca B, y que una sede con historia no se puede borrar (`23001`).

Las sedes se leen en el test con **la misma consulta** que `getActiveLocations()`, para que si
las dos se separan, se separen a la vista.

---


## 3.ter — F4: el mesero es de UNA sede (D11)

> Spec: §4 (bloque 00044) y §5.3. Migración: `supabase/migrations/00044_meseros_por_sede.sql`.
> **Literal del dueño (D11):** *«cada mesero es de cada sede, no se juntan jamás»*.

### Lo que la 00044 pone en la base

| Cosa | Para qué |
|---|---|
| `staff_users.location_id` | La **vía 1** de la precedencia, la más fuerte. NULLABLE + FK compuesta `(location_id, tenant_id)` ON DELETE RESTRICT + índice parcial |
| `staff_devices.location_id` | La **vía 2**. Misma regla transversal. La **hereda del mesero dueño** al registrarse |
| `staff_devices_fingerprint_tenant_key` | `UNIQUE (device_fingerprint, tenant_id)`. Tapa la bomba: ver abajo |
| `trg_staff_devices_sede_coherente` | Un dispositivo nunca a nombre de un mesero de otra **sede** ni de otra **marca** |
| `trg_staff_users_sede_coherente` | La dirección simétrica: mover de sede a un mesero con dispositivos en la sede vieja se rechaza |

**`staff_users_phone_tenant_key (phone, tenant_id)` NO se toca.** Es lo que hace cumplir D11
**en el motor**: un celular = una fila = una sede. Relajarlo a `(phone, location_id)` permitiría
dos filas del mismo celular — literalmente *"el mesero trabaja en las dos"*, que es lo prohibido.

### Qué pasa con los meseros que YA existen — la decisión, explícita

**Se quedan con `location_id` NULL, y NULL significa «mesero sin sede asignada». No se
backfillea, no se adivina, y SE MUESTRA.**

Es la misma regla transversal de toda la fase, y aquí tiene un motivo extra: adivinar la sede de
un mesero es adivinar la sede de **cada visita que ese mesero registre a partir de mañana**, y ese
número termina en el reporte de efectividad por sede (D12).

Lo que importa es que **un mesero con NULL sigue trabajando exactamente igual que antes de F4**:

- No aporta señal → la precedencia cae al host → el mismo `location_source` de siempre
  (`host` / `host_single`).
- El **403 del §5.3 no lo toca**: solo se dispara cuando el host resuelve una sede **y** el
  mesero tiene una **y** son distintas. Con cualquiera de las dos en NULL, pasa.
- Su dispositivo hereda NULL y tampoco aporta señal.

O sea: **la migración no puede sacar del trabajo a nadie.** Asignarles sede es una acción
deliberada del dueño, vía `PATCH /api/dashboard/staff` con `location_id`.

### El login por sede (§5.3)

`POST /api/staff/login` pasa a resolver el host con `resolveHostContext()` en vez de
`getTenantByDomain()`. Sin ese cambio no hay login por sede posible: el mesero de la sede 2 abre
`laureles.marca.com/mesero` y recibe un 404 *"Restaurante no reconocido"*, porque
`getTenantByDomain` solo mira `tenants.domain`. Por lo mismo cambiaron `me`, `stats`,
`device/register`, `device/verify`, `pending-rewards` y `reward-redeem`: son la misma superficie
del mesero, y el cambio es **estrictamente aditivo** (`resolveHostContext` empieza llamando a
`getTenantByDomain`, así que para los 4 tenants vivos resuelve exactamente lo mismo).

Con la marca resuelta, el guardarraíl: **si el host dice una sede y la fila del mesero dice otra
→ 403 «Estás en el enlace de otra sede»**, con ese texto. Antes ese caso salía como un 401
*"PIN incorrecto"*, que le hace pensar al mesero que olvidó su clave.

Va **después** de validar el PIN a propósito: contestar *"estás en otra sede"* antes de comprobar
la clave le diría a cualquiera qué celulares existen y en qué sede están.

### El 403 del login NO es el mismo caso que el check-in

Es la distinción que más fácil se lee como una contradicción, así que queda escrita:

| | Qué pasa si el host dice una sede y el mesero es de otra |
|---|---|
| **`POST /api/staff/login`** | **403.** El mesero se equivocó de enlace y hay que decírselo |
| **`POST /api/check-in`** | **Gana el mesero, sin bloquear nada.** La discrepancia se REGISTRA en `visits.location_conflict` |

No se contradicen: en el login **el actor es el mesero** y el enlace equivocado es su error. En el
check-in **el actor es el cliente**, que perfectamente puede llegar con un enlace guardado de otra
sede — y ése es justo el caso para el que existe la precedencia. Bloquear ahí sería negarle el
check-in a un cliente que está de pie frente al mesero.

### La sede NO va en el JWT del mesero

Vive en la fila de `staff_users` y se relee en cada petición (§5.3). Meterla en el token —que dura
8 horas— haría que reasignar de sede a un mesero tardara hasta 8 horas en verse, sin forma de
revocarlo. Y el ahorro sería **cero**: el check-in ya hacía ese `SELECT` a `staff_users` de todos
modos. Se devuelve en la respuesta de `login` y de `me` solo **para mostrarla**, nunca para
autorizar.

### La bomba del `device_fingerprint`

`staff_devices.device_fingerprint` solo tenía un índice **normal** (00018:41) y **siete** sitios
del código hacen `.single()` sobre él (`staff-auth.ts`, `check-in` ×2, `device/register`,
`device/verify`, `staff/me`, `staff/stats`). `.single()` exige exactamente una fila: con dos,
PostgREST responde `PGRST116` y el mesero ve *"dispositivo no reconocido"* — **para siempre**, sin
que el mensaje diga nada de la causa. El `UNIQUE (device_fingerprint, tenant_id)` lo cierra.

Compuesto con `tenant_id` y no global, por el mismo criterio con el que la 00028 recreó los
uniques que la 00025 tuvo que soltar: el fingerprint lo genera el navegador del dispositivo y dos
marcas podrían coincidir sin que eso sea error de nadie.

⚠️ Si al aplicar la 00044 **ya existen duplicados**, la migración **ABORTA nombrándolos** en vez
de deduplicar por su cuenta: borrar una fila de `staff_devices` saca del trabajo al dispositivo de
alguien, y eso lo decide el dueño.

### Las dos funciones SQL que perdían la sede (deudas #10 y #11)

| Función | Qué cambia | Por qué exigía migración |
|---|---|---|
| `enqueue_send_queue(jsonb)` (00038) | Copia `location_id` de cada item a `send_queue.location_id` | La firma **no cambia**, así que es un `CREATE OR REPLACE` de verdad: conserva el `REVOKE ALL … FROM PUBLIC, anon, authenticated` de 00038:334 |
| `log_review_shown_deduped` (00032) | 4º parámetro `p_location_id uuid DEFAULT NULL` → `review_events.location_id` del evento `'shown'` | ⚠️ **Exige `DROP` primero.** Añadir un parámetro NO reemplaza la función: crea una **sobrecarga**, y la llamada de 3 argumentos del servicio pasaría a ser **ambigua (42725)**. Un `CREATE OR REPLACE` aquí habría roto el registro de impresiones en producción, dentro de un `catch` que solo escribe en consola |

El `DEFAULT NULL` al final hace que el **orden de despliegue deje de importar**: el código viejo,
que llama con tres argumentos, sigue funcionando contra la función nueva.

> ⚠️ **El dedupe de `'shown'` SIGUE siendo por `(tenant, cliente)` y NO por sede** — decisión, no
> olvido. Meterle la sede subiría un número que el panel ya reporta hoy, y cambiar hacia arriba una
> métrica existente al pasar una migración es justo lo que este diseño evita. **Consecuencia para
> F6:** si el mismo cliente ve el recuerdo en dos sedes dentro de la ventana de 12h, cuenta **una
> vez** y se le atribuye a la **primera**. Hay que decirlo en pantalla cuando F6 dibuje el embudo
> por sede.

### `/api/dashboard/location` — la deuda #14, cerrada

El bug **no era el `.single()`**, y por eso conviene dejarlo escrito: era que el `PUT`
**descartaba el error** de su sonda de existencia (`const { data: existing } = await …`, sin
`error`). Con 2 sedes, `.single()` devuelve error y `data = null` → `existing` queda null → el
flujo cae al `else` → **INSERT de una TERCERA fila**, en silencio, con `is_primary = false` y
`slug`/`domain` en NULL. Esa sede fantasma entra en `getActiveLocations()`, y con ella el dominio
raíz de la marca deja de resolver «sede única implícita»: rompe la atribución de **todo** el
producto para ese tenant.

Cambiar `.single()` por `.maybeSingle()` **no habría arreglado nada** — con 2 filas eso también
devuelve error y `null`. Lo que se hizo:

- Elegir la fila de forma **determinista**, con el **mismo orden que `getActiveLocations()`**
  (`is_primary` DESC → `sort_order` ASC → `name` ASC) + `limit(1)`.
- **Comprobar el error** en los dos handlers. Ante un fallo de lectura el PUT **no inserta nada**:
  insertar "por si acaso" es la operación irreversible.
- Envolver `requireTenantId()`, que **lanza** cuando el JWT del admin no trae `tenant_id`: antes
  eso salía como un 500 sin cuerpo; ahora es un 401 que dice que hay que volver a entrar.

⚠️ **El contrato NO cambia:** sigue devolviendo un objeto plano. Devolver la lista rompería
`dashboard/settings/page.tsx` en silencio (`locationData.lat` → `undefined` → campos vacíos).
Editar una sede **distinta de la principal** necesita un selector, y el selector es **F7**.

### Cómo se verifica

`tests/db/multisede-meseros.test.ts` — **28 comprobaciones** contra el Postgres embebido con las
44 migraciones aplicadas: la FK compuesta rechaza con `23503` el mesero de la marca A contra la
sede de la marca B, una sede con meseros o con dispositivos no se borra (`23001`), los dos
triggers rechazan con `23514`, el `UNIQUE` del fingerprint rechaza con `23505` dentro de la marca
y permite el mismo fingerprint entre marcas, `staff_users_phone_tenant_key` sigue impidiendo dos
filas del mismo celular, la precedencia leída de filas REALES pone `staff_user` por encima del
host, y las dos funciones SQL escriben la sede (incluida la llamada de 3 argumentos, que sigue
viva).

---

## 3.quater — F7: permisos de sede y el selector del panel (D10)

Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §5.1, §5.2 y §8.4. Migración:
`supabase/migrations/00045_permisos_por_sede.sql`. El dueño marcó esta fase **OBLIGATORIA**.

### La tabla, no un claim del JWT

`dashboard_user_locations (user_id, tenant_id, location_id, role)`. El `tenant_id` del JWT hoy se
escribe a mano con un `UPDATE` sobre `auth.users` (00028) y exige re-login; un claim de sede
heredaría los mismos tres problemas. Una tabla se corrige en caliente y el RLS la puede leer.

`role='brand'` exige `location_id IS NULL`; `role='location'` exige `location_id NOT NULL` — CHECK
de pareja, igual que `restaurant_events.audience_scope`. `location_id` lleva la FK COMPUESTA
`(location_id, tenant_id) → restaurant_locations (id, tenant_id) ON DELETE RESTRICT`, la regla
transversal de siempre: una FK simple dejaría darle a un admin de la marca A permiso sobre una
sede de la marca B.

### El fail-safe recalibrado — §5.1, la tabla literal

| Situación | Resultado |
|---|---|
| Sin fila y el tenant tiene **≤1 sede activa** | **Ve la marca** (= su única sede) |
| Sin fila y el tenant tiene **≥2 sedes activas** | **403** |
| Fila con `role='brand'` | Ve todas las sedes + el cubo *"Sin sede"* |
| Fila(s) con `role='location'` | Ve **solo** esas sedes, **nunca** `location_id IS NULL` |

Implementado DOS VECES a propósito, en dos motores distintos: `can_see_location()` en SQL (helper
`SECURITY DEFINER`, para el RLS) y `decideLocationScope()` en TypeScript puro (para el camino
`service_role`, que es el que realmente aísla — ver más abajo). `tests/db/multisede-permisos.test.ts`
prueba el primero contra Postgres real; `tests/unit/location-scope.test.ts` prueba el segundo sin
base de datos. Las cuatro filas están escritas en ambos sitios porque un fail-safe absoluto
("sin fila, nada") dejaría fuera a los admins de los 4 tenants vivos el día del despliegue, y un
fail-open absoluto es el agujero — la ausencia de fila solo es ambigua con ≥2 sedes.

`trg_restaurant_locations_estampa_marca` (AFTER INSERT/UPDATE OF `is_active`, `tenant_id` en
`restaurant_locations`) estampa `role='brand'` a los usuarios existentes del tenant **en el
instante** en que su sede activa nº2 nace (`tenant_active_location_count() >= 2`), para que el 403
sea la red y no el camino normal. Es idempotente (no pisa a un usuario al que ya se le asignó
`role='location'` a mano) y cubre también reactivar una sede apagada o dar de alta la 3ª, 4ª, N.

### `LocationScope` — el tipo opaco, y por qué importa más que el RLS aquí

`src/lib/location-scope.ts`. `LocationScope` lleva una marca de un `Symbol()` real (no un
`declare const : unique symbol`, que no tiene valor en runtime y revienta al usarlo como clave
computada) creado y **no exportado** en ese módulo: ningún otro código puede fabricar un
`LocationScope` con un literal ni con un `as`. La única fábrica es `requireLocationScope(request)`,
que resuelve marca + usuario + sede **siempre en el servidor** contra `dashboard_user_locations` —
nunca contra lo que mande el navegador.

Las firmas de los servicios pasan de `(tenantId: string)` a `(scope: LocationScope)`. Tres redes,
en orden de fuerza:

1. **El compilador.** Una ruta que se olvide del filtro no compila — no hay forma de conseguir un
   `LocationScope` sin pasar por `requireLocationScope()`.
2. **El nombre feo del escape.** `getUnscopedServiceClient()` (`src/lib/supabase/unscoped.ts`) es
   el `service_role` sin alcance, para las lecturas que son de la marca a propósito (customers,
   tiers, ROI). El nombre existe para que el costo se vea en el `import`.
3. **Un test de allowlist.** `tests/unit/location-scope-allowlist.test.ts` falla si aparece un
   import nuevo de `getUnscopedServiceClient()` fuera de la lista revisada. Detecta el olvido
   DESPUÉS de escribirlo, y solo si alguien mantiene el test — por eso es la red más débil, no la
   principal.

**Esto importa más que el RLS aquí:** verificado que en toda la app hay **una sola** lectura de
datos por el camino autenticado (`src/app/api/dashboard/twilio-metrics/route.ts:217`, sobre
`customers`, que ni tiene `location_id`); las otras ~55 corren con `service_role`. Poner el permiso
solo en RLS daría una sensación de seguridad que la app entera desmiente.

### El RLS, como red barata — policies RESTRICTIVE autodescubiertas

La 00045 recorre por catálogo toda tabla de `public` con `tenant_id` **y** `location_id` a la vez
(EXCLUYE `restaurant_events`: ahí NULL significa "toda la marca", no "sede desconocida") y le crea
una policy `AS RESTRICTIVE`, no una permisiva nueva:

```sql
CREATE POLICY sede_visible_<tabla> ON <tabla> AS RESTRICTIVE FOR ALL TO authenticated
  USING      (is_super_admin() OR can_see_location(location_id))
  WITH CHECK (is_super_admin() OR can_see_location(location_id));
```

Postgres combina las permisivas con OR y les aplica AND con las restrictivas, así que sobre la
`tenant_all_*` de la 00026 (`T ∨ S`) esto da `(T ∨ S) ∧ (S ∨ C) ≡ S ∨ (T ∧ C)` — exactamente el
predicado del spec, sin **DROPear ni reescribir** una sola policy existente. Importa por dos
motivos: el loop de la 00026 (que autodescubre **policies**, no tablas — la lista de 18 tablas está
escrita a mano) se llevaría por delante `aios_constelarys_select_wallet_txn` si se copiara ese
gesto; y una RESTRICTIVE es matemáticamente incapaz de conceder, solo de quitar filas — el "no
puede conceder más de lo que concede hoy" pasa de promesa a propiedad del motor.

`current_dashboard_user_id()`, `tenant_active_location_count()` y `can_see_location()` nacen
`SECURITY DEFINER` con `search_path` fijo — exactamente lo que le falta a `current_tenant_id()`
(00024) y por lo que el rol del AIOS revienta con `42501` (`docs/03-security.md`). A los tres se
les **conserva** el `EXECUTE` a PUBLIC (regla nº2 de esa misma sección): las policies los invocan
como `anon`/`authenticated`, y un `REVOKE` los dejaría sin leer.

### El selector — §8.4

El alcance viaja como `?location_id=` (ausente / `all` / uuid / `unknown`) sobre las rutas que ya
existen, resuelto siempre en el servidor. **"Todas" significa "todas las que este usuario puede
ver"** — si la ausencia significara "toda la marca", cada ruta que olvidara el scope filtraría de
más. La opción *"Todas las sedes"* solo se dibuja si el usuario es de marca; el cubo *"Sin sede"*
solo si `canSeeUnassigned`.

El transporte NO usa `useSearchParams()` de Next.js: la encuesta de esta fase encontró que
`(dashboard)` no tiene `loading.tsx`/Suspense en ninguna de sus 14 páginas, y meter la sede ahí
forzaría un CSR bailout de todo el segmento (el mismo bug que `/mesero` ya pelea dos veces). En
vez de eso, la selección vive en `LocationScopeContext` (`src/contexts/LocationScopeContext.tsx`),
persistida en `localStorage` — mismo patrón que `DemoContext` — y cada `fetch()` a una ruta ya
escrita la anexa como query string. La URL del navegador no cambia.

`GET /api/dashboard/location-scope` expone `toScopeView()` (rol, selección, sedes visibles) para
que `LocationSelector` (`src/components/layout/LocationSelector.tsx`, montado en
`DashboardHeader`) se dibuje. Con una sola opción posible no se dibuja: un `role='location'` de
UNA sede sin "Todas" ni "Sin sede" no tiene nada entre qué elegir.

### `getDashboardMetrics` / `getFullAnalytics` — partidos en `{ brand, location }`

Las métricas que salen de `customers` (total de clientes, en riesgo, tiers, Black, ROI del Golden
Bullet, y también nuevos-hoy/nuevos-semana/adquisición-por-mes: **todas** derivan de `customers`,
no solo las cuatro nombradas por el dueño) viven bajo `.brand` — de la marca para siempre, no por
limitación sino porque el dueño pidió que el cliente conserve su recorrido entre sedes. Las que
salen de `visits` (visitas hoy, QR, domicilios, el heatmap) viven bajo `.location`. Con el tipo
partido, mezclar numerador de sede con denominador de marca deja de poder hacerse por descuido — no
compila. `reactivationRate` queda en `.brand` a propósito (§8.2: el reloj de reactivación es de la
marca), leyendo la misma consulta de `visits` de 6 meses SIN el recorte de sede que sí usa el
heatmap — `locationMatches()` existe justo para sostener las dos vistas de una sola lectura sin
duplicar la consulta.

`getDashboardMetrics`/`/api/dashboard/metrics` se partió igual por completitud, pero es la ruta
**muerta**: ningún componente del panel la consume (`getFullAnalytics`/`/api/dashboard/analytics`,
vía `useDashboardAnalytics()`, es la que alimenta las 3 páginas reales). Se deja dicho por si algún
día se reactiva.

### Qué rutas quedaron con filtro, y cuáles no

De las rutas que leen tablas con `location_id`, quedaron cableadas a `requireLocationScope()` +
`applyLocationFilter()`: `metrics`, `analytics`, `authorized-numbers` (GET/PATCH/DELETE),
`redemptions`, `redemptions/summary`, `review-metrics`, `send-queue/[id]` (DELETE), `campaigns`
(GET) y `campaigns/efficiency`. Sus servicios (`dashboard.service.ts`, `redemption.service.ts`,
`reward-grant.service.ts`, `review.service.ts`, `send-queue.service.ts`) cambiaron la firma de
`tenantId: string` a `scope: LocationScope` en las funciones que llaman esas rutas — **y solo
esas**: `getQueueDepth()` sigue en `tenantId` porque también la usa `line-budget` (D6, per-línea,
no per-sede) y cambiarla ahí habría sido inventar un comportamiento nuevo fuera de F7.

⚠️ **`reward_grants.granted_location_id` y `reward_redemptions.redeemed_location_id` siguen
SIEMPRE NULL** (deuda #13: llenarlas es F6). El filtro sobre esas dos columnas es hoy un no-op
para `role='brand'` (los 4 tenants vivos) y, para un futuro `role='location'`, deja la lista
**vacía** en vez de mostrar TODO — fail *closed*, no fail *open*, mientras F6 no exista. Lo mismo
aplica a `campaigns.location_id` (deuda #12).

Quedaron **deliberadamente sin cablear**, con la razón anotada en el código: `send-queue` GET
(el `available:false` de degradación para un super-admin sin tenant en el JWT no tiene un
equivalente limpio en `requireLocationScope()`, que siempre exige tenant); `check-in-override`
(su atribución de sede ya la resuelve F3/F4, y tocarla es terreno del 409 de la deuda #9, no de
F7); `campaigns/manual` y `imported-contacts/confirm` (rutas de escritura que crean campañas —
atribuir esa escritura a una sede es F6); `campaigns/run-auto` (proxya a `/api/cron/*`, no lee
nada directamente); las dos rutas de `calendar/events` (`audience_scope` es F5).

### La red del bootstrap de tests — un hueco que esta fase encontró

`tests/setup/bootstrap.sql` creaba el rol `authenticated` pero nunca le daba `USAGE ON SCHEMA
auth` — en Supabase real SÍ lo tiene (es lo que permite que una policy de RLS llame `auth.jwt()`
evaluándose como ese rol). El propio `docs/features/testing.md` avisaba del hueco ("el stub... está
escrito para permitirlo, pero todavía no hay pruebas que lo usen"): `tests/db/multisede-permisos.test.ts`
es la primera, y el `GRANT` se agregó al bootstrap para que la prueba mida RLS de verdad y no un
falso negativo del arnés.

### Cómo se verifica

`tests/db/multisede-permisos.test.ts` — 13 comprobaciones contra Postgres real: las 4 filas del
fail-safe (incluida la variante de "varias filas `role='location'`" y la de "0 sedes activas"), el
trigger de estampado (con la variante de idempotencia y la de "no pisa una fila explícita"), la FK
compuesta rechazando con `23503` el permiso de la marca A sobre la sede de la marca B, el CHECK de
pareja rechazando con `23514` las dos combinaciones inválidas, y una lectura REAL de `visits` como
`authenticated` que confirma que `role='location'` nunca ve `location_id IS NULL` mientras
`role='brand'` sí. `tests/unit/location-scope.test.ts` — 23 comprobaciones de `decideLocationScope()`,
`applyLocationFilter()`, `locationMatches()` y `toScopeView()`, sin base de datos.
`tests/unit/location-scope-allowlist.test.ts` — la tercera red, comprobándose a sí misma.

---

## 3.septies — F9: la sede pasa a ser DEL CLIENTE (`00058`, 2026-09-08)

> **De dónde sale.** El dueño, 2026-09-08: *"el cliente debe poder ver sus sedes,
> seleccionarlas y modificarlas desde un solo lugar, punto final"*, *"cada sede tiene su
> propio google maps, tiene su propia info, lo que se comparten son los clientes"*, y
> *"necesito poder agregar super usuarios y administradores desde el AIOS y también desde
> configuración desde el dashboard"*.

Hasta esta fase, multi-sede era una función **nuestra**: el cliente podía FILTRAR por sede
(F7) pero no editar ninguna salvo la principal, y solo sus cinco columnas de geocerca.

### Qué estaba roto, y por qué no era un olvido

Tres huecos que se tapaban entre sí:

1. **`restaurant_locations.config` existía pero no se podía escribir.** La 00041 creó la
   columna y su propio comentario lo dice —*"Acá va la COLUMNA y nada más"*—, dejando la
   whitelist y la función de escritura para «después». Consecuencia: las dos sedes de una
   marca mandaban a reseñar **la misma ficha de Google**, así que la ficha de la segunda
   sede nacía muerta. Lo destapó Tepuy.
2. **No había pantalla para la sede 2.** `/api/dashboard/location` (singular) elige la
   principal y su comentario remite a un selector que era F7 — y F7 hizo el selector para
   FILTRAR, no para editar. Nadie cerró el círculo.
3. **`dashboard_user_locations` no tenía escritor.** La 00045 modeló los dos roles con su
   CHECK, sus dos únicos parciales y su FK compuesta, y la única fila que alguien escribía
   era la que `/api/aios/tenant-admin` crea sola cuando hay 2+ sedes. Un restaurante con
   tres locales no podía darle a cada encargado su acceso.

### 1. `restaurant_locations.config`, usable

- **`location_config_es_valida()`** — el CHECK de whitelist, en la BASE. No solo en
  TypeScript: 55 archivos escriben con `service_role`, que se salta el RLS, así que una
  whitelist que viviera solo en TS sería una sugerencia.
- **`merge_location_config_deep(tenant_id, location_id, patch)`** — espejo de
  `merge_tenant_config_deep()` (00047) salvo por una cosa que no es cosmética: **filtra por
  `tenant_id` además del id**, porque el uuid de la sede llega del navegador. La
  comprobación vive en la misma sentencia que la escritura para que no exista una segunda
  ruta que la olvide. Devuelve NULL si la sede no es de esa marca.
- **`resolveBranding(marca, sede)`** mezcla la sede ENCIMA de la marca, así que la tarjeta,
  el flujo de reseñas y domicilios lo heredan sin tocar ninguno. `getBrandingForHost()`
  pasó de `getTenantByHost()` a `resolveHostContext()`: cuesta una consulta más y esa
  consulta es la que trae el `config` de la sede.

**Qué baja a la sede y qué no.** El criterio no es *"qué podría variar"* sino *"qué es
coherente con lo que el cliente ya ve"*:

| Se queda en la MARCA | Baja a la SEDE |
|---|---|
| `brand_name`, `tagline`, `short` | `google_maps_url` · `card.google_profile_url` |
| `branding.*` (logo, colores) | `card.address` · `card.hours` |
| `card.stamp_icon`, `card.motif` | `whatsapp_link` · `delivery_phone` |
| `card.description`, `card.policies` | `card.contact_phone` · `card.contact_email` |
| `qr_studio.*` | `instagram_url` · `card.facebook_url` / `tiktok_url` / `website_url` |

La tarjeta muestra puntos y sellos que son **de la marca**: un cliente que juntó 8 sellos
en Laureles y abre su tarjeta en Envigado tiene que ver el mismo nombre y el mismo logo,
porque sus 8 sellos siguen ahí. Si la identidad cambiara con la sede, **la tarjeta
mentiría**. Lo de la derecha es literalmente *"dónde estoy y cómo me contactás"*.

La whitelist de TypeScript (`src/lib/location-config-paths.ts`) **no es una lista nueva**:
es un SUBCONJUNTO de `EDITABLE_PATHS`, elegido por nombre, así que las validaciones son las
mismas funciones. `tests/unit/location-config-paths.test.ts` compara la lista contra el SQL
del CHECK, leyendo la migración de verdad.

### 2. Las dos pantallas

**`/dashboard/sedes`** — ver, elegir y editar cualquier sede.
- Con **una sola sede la palabra «sede» no aparece**: sin lista, sin selector, título «Mi
  local». Es el interruptor de compatibilidad del §8.3 llevado a la pantalla.
- Cada campo dice qué pasa si se deja vacío, **con el valor heredado escrito**. Responde la
  única pregunta real de un dueño con dos locales: *¿esto es de la marca o de este local?*
- El subdominio **se enseña** aunque no se pueda cambiar, y dice por qué (está impreso en
  los QR). Esconderlo hace que lo busquen en otro lado o que llamen.
- **Crear y borrar sedes NO está acá**, a propósito: abrir un local cambia lo que el
  restaurante paga y lo que hay que imprimir. Eso sigue en el AIOS.

**`/dashboard/accesos`** — quién entra y qué ve. Los dos roles del cliente son
`role='brand'` («super usuario», todas las sedes) y `role='location'` («administrador»,
solo las suyas) de la 00045: **no hubo que inventar ningún modelo**, faltaba el escritor.

> **No hay un botón de inicio de sesión por rol, y es a propósito.** Se entra por el mismo
> `/login`. El rol se resuelve en el servidor y decide lo que se ve. Dos botones serían una
> pregunta que el usuario no puede contestar («¿yo soy super usuario o administrador?») y
> una pista de qué roles existen para quien no debería saberlo.

Reglas que no se saltan: solo un super usuario administra accesos (uno de sede que pudiera
crear usuarios se ascendería solo); nunca se otorga `super_admin` (ese es el operador de
Cada1 y ve las 25 marcas); nunca se reatribuye un correo de otra marca; **nadie se toca a
sí mismo** y **la marca no se queda sin super usuarios**.

### 3. El agujero de las contraseñas — el que más fricción causaba

Hasta el 2026-09-08 **nadie podía cambiar una contraseña**. `/api/aios/tenant-admin` se
niega a propósito, y la tarjeta del AIOS remitía a *"olvidé mi contraseña en su propio
panel"* — un flujo que **no existe**: no hay un solo `resetPasswordForEmail` en el producto
y `/login` no tiene enlace de recuperación (verificado por grep sobre `src/app` y
`src/lib`). La única salida era entrar al Supabase a mano.

Ahora hay dos caminos, ninguno dependiente del SMTP:
- **El cliente**: un super usuario le pone una contraseña nueva a quien la perdió, desde
  «Accesos». Se enseña una vez y no se guarda.
- **Nosotros**: `reset_password: true` en `POST /api/aios/tenant-admin`, con una casilla en
  la tarjeta «Usuario del panel». Va después de las tres negativas (super-admin, marca
  ajena, huérfano): pisar una contraseña es lo último que se hace.

> ⚠️ **Sigue faltando el autoservicio** («olvidé mi contraseña» en `/login`), que es lo que
> saca a un humano del medio. Va aparte porque depende del SMTP del proyecto de Supabase,
> que es una incógnita que no se descubre el día del despliegue. Anotado en `ESTADO.md` §3.

### 4. Recompensas por sede — la base, y lo que falta

`reward_tiers`, `rewards` y `campaign_rewards` llevan `location_id` nullable con FK
COMPUESTA `(location_id, tenant_id) ON DELETE RESTRICT`. **`NULL` = de la marca.**

**La trampa que esto activaba sola:** los NULL no colisionan entre sí. Agregar una columna
nullable al único `(point_threshold, tenant_id) WHERE is_active` habría permitido dos
niveles DE LA MARCA con el mismo umbral, **en silencio**. Los índices se recalculan con un
centinela — `COALESCE(location_id, '000…0'::uuid)` — que no puede ser una sede real (la FK
lo rechazaría), así que «de la marca» pasa a ser un valor concreto que colisiona consigo
mismo.

**La regla de resolución** vive en `elegirFilasDeSede()` y es una sola frase: *una sede que
definió al menos una fila propia usa las suyas y solo las suyas; una sede que no definió
ninguna usa las de la marca.* Reemplaza, **no mezcla** — porque «tenés los de la marca
excepto los que redefiniste» no se le puede explicar a un restaurantero, y porque mezclar
impide que una sede tenga MENOS niveles que la marca.

**El cuello de botella no eran los llamadores de `getAllTiers`**, sino tres funciones
intermedias con 18 call-sites entre ellas: `evaluateNewTier`, `getNextTier` y
`buildTiersRoadmap`. Las tres reciben ahora un `locationId` **opcional**, así que ningún
llamador rompe y el que no conoce su sede se queda con los premios de la marca.

Dónde se enhebró, y de dónde sale la sede en cada sitio:

| Dónde | La sede sale de | Nota |
|---|---|---|
| `points.service` | el `locationId` que **ya era un parámetro** | solo se usaba para atribuir el movimiento de puntos |
| `check-in` (registro) | `regLocation.locationId` | `resolveVisitLocation()`: mesero → aparato → host |
| `check-in` (visita) | `visitLocation.locationId` | ídem; el QR nunca decide, solo marca conflicto |
| `delivery.service` | `deliveryLocation.locationId` | ya resuelta 90 líneas antes |
| tarjeta · `check-in/status` · `public/customer-card` · `public/reward-tiers` | `resolveHostContext(host)` | los cuatro usaban `getTenantByHost()`, que tira la sede |
| `mystery-box/resolve` | `tier.location_id` | el nivel que se canjea ya dice de qué local es |

**Dos sitios se quedan con los premios de la MARCA a propósito**, y está escrito en el
código para que no se lea como un olvido:

- **`check-in-override`** — un admin concede una visita a mano desde el panel: no hay
  mesero, no hay QR y no hay host de sede, así que **no existe una «sede del acto»**.
  Inferirla del cliente sería atribuir un hecho a una sede donde no ocurrió, que es
  justo lo que este proyecto no hace: `location_id` NULL significa «desconocida» y se
  muestra.
- **`cron/birthday`** (y el de reactivación) — un envío programado no tiene sede del acto.
  La cascada `last_visit_location_id` → `origin_location_id` está diseñada y
  explícitamente aplazada a **F6** (`whatsapp.service.ts` §6.1).

**Dos trampas que aparecieron al hacerlo:**

1. **`/api/public/reward-tiers` cachea 60 s en público** y su contenido pasó a variar por
   sede — o sea, por host. Le faltaba `Vary: Host`: una caché compartida que no keyee por
   host podía servirle a Envigado los niveles de Laureles durante un minuto.
2. **El GET de `/api/dashboard/reward-tiers` sigue devolviendo un ARRAY.** Tiene DOS
   consumidores —la pantalla de Recompensas y `dashboard/settings:226`, que hace
   `r.ok ? r.json() : []`—, así que envolverlo en un objeto para mandar metadatos habría
   dejado el selector de premios de Ajustes vacío **en silencio**. Es la misma trampa que
   `/api/dashboard/location` ya tiene documentada. El panel deduce si está heredando:
   pidió una sede y todo lo que volvió tiene `location_id === null`.

**El modo de fallo caro de la regla de reemplazo, y cómo se tapa.** Sin nada más, el primer
premio propio que alguien creara en una sede la haría dejar de heredar y quedarse **con ese
solo**: el restaurante vería desaparecer sus otros tres sin haber borrado nada. Por eso
existe `POST /api/dashboard/reward-tiers/copiar`, que le da a la sede una copia de los de la
marca para que edite desde ahí, y por eso «Nuevo Tier» está **apagado mientras hereda**.

### 5. Quién puede CAMBIAR los premios (2026-09-09, sin migración)

Lo destapó la auditoría adversarial del 09 y era el más caro de lo que quedó sin juzgar:
**los cuatro verbos de `/api/dashboard/reward-tiers` autenticaban con `requireTenantId()`**,
que solo comprueba que el JWT traiga una marca. Un **administrador de UNA sede**
(`role='location'`) pasaba esa puerta igual que el dueño, y como su alcance por defecto en
esa pantalla es «la marca», podía editar y borrar los premios de la marca **y los de sus
sedes hermanas** — y la pantalla se lo ofrecía. Con una sola sede daba lo mismo; con doce, el
encargado de Laureles le cambiaba los premios a Envigado sin salir de su pantalla.

**La regla ahora: los premios son de la MARCA.** `exigirAlcanceDeMarca()` guarda POST, PATCH
y DELETE; el GET no. Que el guardián esté escrito UNA vez y los tres verbos lo llamen es lo
que evita que el cuarto se olvide.

**El GET se queda con `requireTenantId()`, y no es comodidad.** Dos razones, las dos
verificadas:

1. **Leer no cruza marcas.** Cada consulta filtra por `tenant_id`, que es el aislamiento
   real (`service_role` se salta el RLS). Lo más que ve un administrador de sede son los
   premios de una sede hermana de SU marca.
2. **Exigir alcance ahí rompería el panel.** La pantalla pide `?location_id=brand`, y
   `brand` no es un valor que `decideLocationScope()` acepte —espera `all`, `unknown` o un
   uuid—: contestaría **403 «Sede no válida»** a todo el mundo, incluido el dueño. Y el
   segundo consumidor, `dashboard/settings:226`, hace `r.ok ? r.json() : []`, así que ese
   403 dejaría el selector de premios **vacío en silencio**.

Dejar que un administrador edite los premios de SU sede es una decisión de producto, no una
corrección, y hoy choca de frente con 0.GAMMA (una sede con premios propios le devuelve el
«ya reclamé» a toda la base de clientes). Está en ESTADO §3.

**La trampa del super-admin, que había que comprobar antes de tocar la autenticación.**
`requireLocationScope()` no tiene el `OR` del operador de Cada1, y en SQL sí lo tiene: las
policies de la 00045 son `is_super_admin() OR can_see_location(...)`. El operador **no tiene
fila en `dashboard_user_locations`** de las marcas de sus clientes, así que en una marca de
dos sedes la fábrica le contesta 403 — y como el camino real del panel corre con
`service_role`, sin ese `OR` en TypeScript perdía en el panel lo que el motor sí le concede.
Por eso la decisión vive en `puedeEscribirEnLaMarca()` (`src/lib/location-scope.ts`), que es
**pura** y toma dos entradas: el `LocationScope` (`null` si no se pudo resolver) y
`esSuperAdmin` (de `isSuperAdmin()`). `null` nunca autoriza por sí solo: sin sesión, sin
marca en el JWT, sin alcance con 2+ sedes **o con la base caída**, no se escribe. Y cuando
no se pudo resolver se devuelve lo que dijo la fábrica —401, 403 o **500**—, nunca un 403
genérico: confundir un fallo de base con «no tenés permiso» manda a alguien a revisar los
accesos durante media hora.

`requireTenantId()` sigue importado a propósito: lee el MISMO `app_metadata.tenant_id` que
el alcance, y es de donde sale la marca en el único caso en que no hay alcance que leer —el
operador de Cada1.

**Hay un gemelo que NO se unificó**: `requireBrandScope()` en
`src/app/api/dashboard/users/route.ts` exige `role === 'brand'` sin el `OR` del super-admin.
Se dejó como está porque quién puede crear usuarios de una marca ajena es una decisión del
dueño, y unificarlas de paso se la habría respondido sola.

**Con 0 o 1 sede activa nada cambia para las 5 marcas vivas**: sin filas de alcance, la fila
1 del §5.1 las resuelve como `role='brand'`.

### 6. El panel vacío del administrador de sede (0.DELTA)

Un `role='location'` **nunca** ve las filas con `location_id IS NULL` (fila 4 del §5.1), y
todo el histórico anterior a multi-sede es NULL: nadie lo atribuyó a una sede porque cuando
ocurrió no había sedes. O sea que el primer administrador de sede que entre **ve CERO
clientes y CERO visitas**, y no porque algo esté roto.

Hay dos salidas y **la elección es del dueño** (ESTADO §3, punto 0.DELTA):

- **(a)** darle a `role='location'` el cubo NULL de las sedes que ya tiene asignadas mientras
  el histórico no esté atribuido. Toca `decideLocationScope()`, o sea los **dos espejos** —el
  TS y `can_see_location()` de la 00045, que `tests/db/multisede-permisos.test.ts` vigila— y
  ensancha lo que ve un rol restringido. No se hace por cuenta propia.
- **(b)** avisarlo, que es lo implementado: la pantalla de **Accesos** muestra el aviso en el
  momento de elegir «Administrador de sede», antes de marcar las sedes. Es reversible y no
  toca una sola fila de permisos.

Lo que **no** se hace es backfillear el histórico: `location_id` NULL significa «sede
desconocida» y se muestra (§ *Cero backfill*).

### Cómo se verifica

- `npx vitest run tests/unit/reward-tiers-permisos.test.ts` — quién puede escribir los
  premios, incluido el fail-closed y el `OR` del operador de Cada1.
- `npx vitest run tests/unit/location-config-paths.test.ts` — la whitelist contra el SQL.
- Con una marca de UNA sede: el selector del encabezado **no se dibuja** y
  `/dashboard/sedes` dice «Mi local».
- Con una marca de dos: cargar el `google_maps_url` de una sede, abrir su subdominio y
  comprobar que la reseña apunta a ESA ficha y que la otra sede conserva la suya.
- Crear un administrador de sede en «Accesos», entrar con él y comprobar que no ve el
  selector completo ni la pantalla de accesos.
- Al elegir «Administrador de sede» en «Accesos», el aviso de que esa persona **verá su sede
  desde hoy, no el histórico**, tiene que aparecer antes de marcar las sedes.
- Con ese mismo usuario, abrir «Recompensas»: se ven los premios, el cartel explica que son
  de la marca, y crear/editar/borrar están apagados. Un `PATCH` a mano contra
  `/api/dashboard/reward-tiers` tiene que responder **403**, no 200.

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
| 2 | ✅ **CERRADA el 2026-09-06 por la `00051`.** El trigger cruzado ya es de las **dos** direcciones. | Se cerró cuando dejó de valer la condición que la mantenía abierta — ver §3.5. |
| 3 | **`is_primary` no tiene índice único por tenant.** Dos filas con `is_primary = true` son hoy legales. | No está en el spec. La 00042 deja exactamente una por tenant. |
| 4 | **El `## Diagrama ER` de `docs/DB_SCHEMA.md` está obsoleto** por su cuenta (el bloque `customers` ni siquiera tiene `tenant_id`) y es un único bloque mermaid: dos sesiones no lo pueden tocar a la vez. | Se cierra aparte, en una sola sesión, después de F1+F2. |
| 5 | **«Las 37 migraciones originales…»** en `docs/features/testing.md:61` y sus espejos en `tests/setup/`. Hoy son 43. | Ningún test compara ese número (son comentarios sin assert). Deuda aparte. |
| 6 | **La separación de una sede** (venta, franquicia, socio distinto). | Riesgo **aceptado y aplazado por el dueño** (2026-09-02). No hay función de split y no se inventa: fundir es un `INSERT`, separar exige inventar de quién son los puntos, el saldo, los opt-outs y el libro de consentimiento. |
| 6.bis | **La línea de WhatsApp: DECIDIDA el 2026-09-05.** El modelo NO es "un número por sede". Es: **N líneas por marca, y la sede no obliga a ninguna** — por cuál sale un mensaje se elige **en el momento del envío**. Por defecto y en la práctica habrá **una sola línea para todas las sedes**. | Textual del dueño: *"lo más seguro es que usemos una sola para todas, pero imaginate que tengamos un Waha Business con muy pocos mensajes diarios y no alcance, tendríamos que calentarlo y usarlo"*. El caso real es **calentar una línea nueva**: mientras sube su cupo con Meta, el resto del tráfico sigue saliendo por la línea buena. Por eso el eje de la línea es el **cupo**, no la geografía, y `getQueueDepth()` hace bien en seguir siendo per-línea y no per-sede. Consecuencia: `message_logs.line_location_id` (deuda 13) deja de esperar a D6 — pasa a ser "por qué línea salió", que es otra pregunta. |
| 7 | **Ningún premio tiene precio en ninguna tabla.** | D12 ("efectividad por sede") solo puede responderse en **conteos y tasas, nunca en pesos**. Hay que decirlo en pantalla. |
| 8 | **Adoptar el histórico** para un tenant de una sola sede es posible y es **irreversible**. | No se ejecuta sin orden explícita del dueño. |
| 9 | **El 409 de sede no acepta una elección por `location_id`.** El spec define el 409 y la lista de sedes «para que el cliente elija», pero **no dice qué `visits.location_source` le correspondería** a una sede elegida a mano: las 7 vías del CHECK no contemplan ese caso (`manual` es «corrección explícita de un admin»). | No se inventa una vía nueva ni se reutiliza una que significa otra cosa. Hoy la elección se hace **abriendo el subdominio de la sede**, que resuelve por `host` y ya está especificado. Decisión del dueño o de F7 (cuando exista el selector). |
| ~~10~~ | ~~**`send_queue.location_id` sigue vacía.**~~ **CERRADA en F4 (00044).** El único INSERT posible pasa por la función SQL `enqueue_send_queue()` (00038:271-291), que no tiene esa columna en su lista. | Llenarla exige `CREATE OR REPLACE` de esa función, o sea **una migración**. F3 no lleva migración (la 00044 está reservada para F4). Va con F5/F6. |
| ~~11~~ | ~~**`review_events.location_id` no se llenaba en `shown`.**~~ **CERRADA en F4 (00044).** Queda una consecuencia viva, que NO es deuda sino decision: el dedupe sigue siendo por `(tenant, cliente)` y no por sede, asi que el mismo cliente en dos sedes dentro de la ventana cuenta UNA vez, atribuido a la primera. F6 tiene que decirlo en pantalla. Texto original: El evento `shown` lo escribe la función SQL `log_review_shown_deduped()` (00032:97-115), que no recibe sede. | Mismo caso que #10: es un `CREATE OR REPLACE` en una migración. Mientras tanto, el **denominador** del embudo de reseñas por sede queda incompleto — hay que decirlo en pantalla cuando F6 lo dibuje. |
| 12 | **`message_logs.location_id` solo la llena la «sede del acto»** (check-in, registro, domicilio). Las campañas masivas (`birthday`, `reactivation`, `reward_reminder`, `calendar_event`, `manual`, `import`) siguen en NULL. | La cascada de respaldo del §6.1 (`last_visit_location_id` → `origin_location_id`) es **F6**: toca el desglose de plata (D4), y F3 tiene prohibido cambiar lecturas de dashboard. `customers.last_visit_location_id` ya se está llenando, así que F6 tendrá de dónde leer. |
| 13 | **`message_logs.line_location_id`, `tenant_wallet_transactions.location_id`, `campaigns.location_id`, `reward_grants.granted_location_id`, `reward_redemptions.redeemed_location_id` y `consent_events.location_id` siguen vacías.** | Fuera del alcance de F3. `line_location_id` depende de **D6**, que el dueño no decidió (F9). Las de premios son F6 (la matriz origen→destino de D12). `consent_events` **no tiene un solo escritor en TypeScript** — la tabla existe desde la 00037 y nadie inserta en ella. |
| ~~14~~ | ~~**`src/app/api/dashboard/location/route.ts` sigue con su `.single()`.**~~ **CERRADA en F4.** Y con una correccion al diagnostico: el bug NO era el `.single()`, era que el `PUT` **descartaba el error** de su sonda — por eso cambiarlo a `.maybeSingle()` no habria arreglado nada. Ver §3.ter. Texto original: Filtra solo por tenant: con 2 sedes activas devuelve 500, y su `PUT` inserta una tercera fila en vez de actualizar. Este doc decía «se arregla en F3». | **NO se arregló en F3**: el alcance de la sesión de F3 excluyó explícitamente tocar lecturas y pantallas de dashboard (eso es F6/F7). Contradicción real entre este doc y el alcance ejecutado, dejada por escrito a propósito. Ningún tenant vivo tiene 2 sedes, así que hoy no es explotable. |
| 15 | **`staff_devices.staff_user_id` es una FK SIMPLE** a `staff_users(id)` (00018:31, `ON DELETE CASCADE`): nada en la BASE impide atribuir un dispositivo de la marca A a un mesero de la marca B. | **Mitigado, no cerrado.** El trigger `trg_staff_devices_sede_coherente` de la 00044 lo rechaza (23514) buscando al mesero DENTRO de la marca del dispositivo, pero un trigger es mas facil de saltar que una FK. Convertirla en compuesta `(staff_user_id, tenant_id)` exige un `UNIQUE (id, tenant_id)` en `staff_users` que hoy no existe, y eso no esta en el spec. |
| ~~16~~ | ~~**No hay control en el panel para asignarle sede a un mesero.**~~ **CERRADA en F7.** `/dashboard/staff` ya dibuja el `<select>` de sede en Crear y Editar (`assignableLocations`, tomado del mismo `LocationScopeProvider` del header — cero fetch nuevo), la tabla muestra la sede de cada mesero como badge (`location_id` NULL → "Sin sede", nunca se adivina), y el aviso de D11 (mover de sede con dispositivos en otra se rechaza, 23514) queda escrito en la propia pantalla. Texto original: La API ya lo acepta (`POST`/`PATCH /api/dashboard/staff` con `location_id`) y el `GET` ya lo devuelve, pero el formulario de `/dashboard/staff` no dibuja el selector. | F4 entregó el MECANISMO, F7 la pantalla — ver §3.quater. El `<select>` solo se dibuja si la marca tiene al menos una sede activa (`assignableLocations.length > 0`); con `role='location'` el admin solo ve SUS sedes, que es la restricción correcta: no debería poder asignar meseros a una sede que no administra. |
| 17 | ⚠️ **PARCIALMENTE CERRADA por la `00056` (2026-09-07).** Ya existe la superficie de escritura de sedes para el AIOS: `aios_add_location()` y `aios_set_location()` (§2.bis). **Lo que sigue abierto es el PRODUCTO**: desde el panel del cliente las sedes se siguen sin poder crear ni editar — solo la principal y solo sus coordenadas (`PUT /api/dashboard/location`), que necesita el selector de F7 para llegar a las demás. | La escritura desde el AIOS era lo que bloqueaba a Tepuy y es lo que abrió la 00056. Que el dueño de un restaurante administre sus propias sedes desde `/dashboard` es otra pantalla y otra fase: no se adelanta acá. |

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
| `supabase/migrations/00043_location_id_eventos.sql` | 18 columnas de sede en 13 tablas de hechos. **Aplicada en producción.** |
| `src/lib/location-resolver.ts` | **F3.** La decisión pura: precedencia, sede única implícita y tri-estado. Cero imports, cero I/O. |
| `src/lib/tenant.ts` | **F3.** `resolveHostContext()` + `getActiveLocations()`. `getTenantByDomain` **conserva su firma**: cambiarla toca 16 archivos de golpe. |
| `src/lib/utils/qrcode.ts` | **F3.** Claim `loc` **opcional** en el JWT del QR. Los tokens ya emitidos no lo traen → `location_conflict` queda en `NULL`, que es «no se evaluó». |
| `src/app/api/check-in/route.ts` | **F3.** Resuelve marca+sede, el 409 de sede, propaga a visits/customers/puntos/mensajes. Aquí se **borró** la geocerca comentada. |
| `src/app/api/webhook/delivery/route.ts` | **F3.** Sede del pedido por `authorized_numbers.location_id` (D9). |
| `n8n/domicilios_whatsapp_v4.json` | **F3, una línea.** Reenvía el `remitente` que ya calculaba y descartaba. ⚠️ **El dueño tiene que desplegarlo a mano en n8n** — este repo no despliega n8n. |
| `tests/unit/location-resolver.test.ts` · `tests/db/multisede-resolucion.test.ts` | **F3.** La decisión y el contrato con el schema. |
| `supabase/migrations/00044_meseros_por_sede.sql` | **F4.** `staff_users.location_id` + `staff_devices.location_id` (D11), el UNIQUE que tapa la bomba del `device_fingerprint`, los 2 triggers de coherencia, y el `CREATE OR REPLACE` / `DROP+CREATE` de las 2 funciones que perdían la sede. **Aún NO aplicada en producción.** |
| `src/app/api/staff/login/route.ts` | **F4.** Login del mesero **por sede**: `resolveHostContext()` + el 403 «Estás en el enlace de otra sede» del §5.3. La sede **no** entra al JWT. |
| `src/app/api/staff/*` · `src/app/api/reward-redeem/route.ts` | **F4.** Toda la superficie del mesero resuelve la marca con `resolveHostContext()`, para que `laureles.marca.com/mesero` no sea un 404. Cambio **aditivo**. |
| `src/app/api/staff/device/register/route.ts` | **F4.** El dispositivo **hereda la sede de su mesero dueño**. Es la única fuente que no hay que inventar. |
| `src/app/api/dashboard/staff/route.ts` | **F4.** `location_id` en el `GET`, el `POST` y el `PATCH`, con validación de que la sede sea **activa y de esta marca**. El 23514 del trigger sale como **409**. El selector en la pantalla es F7 — deuda #16 CERRADA. |
| `src/app/api/check-in/review-prompt/route.ts` | **F4.** Pasa la sede a `logReviewShown()` → `review_events.location_id` del evento `'shown'` (deuda #11). |
| `src/services/send-queue.service.ts` · `src/services/review.service.ts` | **F4.** `EnqueueItem.locationId` y el 4º argumento de `log_review_shown_deduped` (deudas #10 y #11). |
| `src/app/api/dashboard/location/*` | **F4 — deuda #14 CERRADA.** Elige la sede principal con el mismo orden que `getActiveLocations()` y **comprueba el error** de la sonda: el PUT ya no puede insertar una tercera fila. El contrato (objeto plano) **no cambia**. |
| `tests/db/multisede-meseros.test.ts` | **F4.** 28 comprobaciones contra Postgres real: FK compuesta, RESTRICT, los 2 triggers, el UNIQUE del fingerprint y las 2 funciones SQL. |
| `supabase/migrations/00045_permisos_por_sede.sql` | **F7.** `dashboard_user_locations`, los 3 helpers `SECURITY DEFINER`, el trigger de estampado, y las policies `RESTRICTIVE sede_visible_*` autodescubiertas por catálogo. |
| `src/lib/location-scope.ts` | **F7.** El tipo opaco `LocationScope`, `requireLocationScope()` (única fábrica), `decideLocationScope()` (el fail-safe en TS puro), `applyLocationFilter()`, `locationMatches()`, `toScopeView()`. |
| `src/lib/location-scope-shared.ts` | **F7.** Los tipos/constantes seguros para el navegador (`LocationScopeView`, `LOCATION_QUERY_PARAM`, `LOCATION_ALL`, `LOCATION_UNKNOWN`) — separados porque `location-scope.ts` importa `next/headers` vía `@/lib/supabase/server`, y Next.js empaqueta por archivo: cualquier import desde un Client Component arrastraba el módulo entero y `next build` lo rechazaba. |
| `src/lib/supabase/unscoped.ts` | **F7.** `getUnscopedServiceClient()` — el nombre feo del escape (red nº2 del §5.2). |
| `src/contexts/LocationScopeContext.tsx` · `src/components/layout/LocationSelector.tsx` | **F7.** El selector (§8.4): estado de sesión de navegador (`localStorage`, mismo patrón que `DemoContext`), NUNCA en la URL — evita el CSR bailout que `useSearchParams()` habría forzado en `(dashboard)`, que no tiene `loading.tsx` en ninguna página. |
| `src/app/api/dashboard/location-scope/route.ts` | **F7.** Lo que el selector necesita para dibujarse (`toScopeView()`). |
| `src/services/dashboard.service.ts` | **F7.** `getFullAnalytics()`/`getDashboardMetrics()` parten su retorno en `{ brand, location }` (§8.4). |
| `tests/db/multisede-permisos.test.ts` | **F7.** 13 comprobaciones contra Postgres real: las 4 filas del fail-safe, el trigger de estampado (con idempotencia), la FK compuesta (`23503`), el CHECK de pareja (`23514`), y una lectura real de `visits` como `authenticated` que prueba que `role='location'` nunca ve `location_id IS NULL`. |
| `tests/unit/location-scope.test.ts` | **F7.** 23 comprobaciones de `decideLocationScope()`/`applyLocationFilter()`/`locationMatches()`/`toScopeView()`, sin base de datos. |
| `tests/unit/location-scope-allowlist.test.ts` | **F7.** La tercera red del §5.2: falla si aparece un import nuevo de `getUnscopedServiceClient()` fuera de la lista revisada. |
| `tests/setup/bootstrap.sql` | **F7.** `GRANT USAGE ON SCHEMA auth TO anon, authenticated` — el hueco que `docs/features/testing.md` ya avisaba (ningún test corría RLS completo como `authenticated`; éste es el primero). |
| `src/app/(dashboard)/dashboard/staff/page.tsx` | **F7 — deuda #16 CERRADA.** El `<select>` de sede en Crear/Editar mesero, y el badge de sede en la tabla (`location_id` NULL → "Sin sede"). Reutiliza `LocationScopeProvider`, cero fetch nuevo. |
