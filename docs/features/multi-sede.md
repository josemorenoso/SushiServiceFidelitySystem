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
| **F8** | 00047 + AIOS: `product_location_id`, wizard de sede 2..N | ⏳ |
| **F9** | 00048: `location_messaging`, cupo por línea, plantillas por línea | ⏳ solo si D6 = número por sede |
| **F10** | 00049: `customer_review_state` | ⏳ confirmar la suposición §7.2 |

~~**F3 es el cuello de botella**~~ — ya no lo es: desde F3 las columnas de la 00043 se llenan
solas en el check-in, el registro y los domicilios. Lo que sigue vacío y por qué está en §3.bis.

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
| 9 | **El 409 de sede no acepta una elección por `location_id`.** El spec define el 409 y la lista de sedes «para que el cliente elija», pero **no dice qué `visits.location_source` le correspondería** a una sede elegida a mano: las 7 vías del CHECK no contemplan ese caso (`manual` es «corrección explícita de un admin»). | No se inventa una vía nueva ni se reutiliza una que significa otra cosa. Hoy la elección se hace **abriendo el subdominio de la sede**, que resuelve por `host` y ya está especificado. Decisión del dueño o de F7 (cuando exista el selector). |
| ~~10~~ | ~~**`send_queue.location_id` sigue vacía.**~~ **CERRADA en F4 (00044).** El único INSERT posible pasa por la función SQL `enqueue_send_queue()` (00038:271-291), que no tiene esa columna en su lista. | Llenarla exige `CREATE OR REPLACE` de esa función, o sea **una migración**. F3 no lleva migración (la 00044 está reservada para F4). Va con F5/F6. |
| ~~11~~ | ~~**`review_events.location_id` no se llenaba en `shown`.**~~ **CERRADA en F4 (00044).** Queda una consecuencia viva, que NO es deuda sino decision: el dedupe sigue siendo por `(tenant, cliente)` y no por sede, asi que el mismo cliente en dos sedes dentro de la ventana cuenta UNA vez, atribuido a la primera. F6 tiene que decirlo en pantalla. Texto original: El evento `shown` lo escribe la función SQL `log_review_shown_deduped()` (00032:97-115), que no recibe sede. | Mismo caso que #10: es un `CREATE OR REPLACE` en una migración. Mientras tanto, el **denominador** del embudo de reseñas por sede queda incompleto — hay que decirlo en pantalla cuando F6 lo dibuje. |
| 12 | **`message_logs.location_id` solo la llena la «sede del acto»** (check-in, registro, domicilio). Las campañas masivas (`birthday`, `reactivation`, `reward_reminder`, `calendar_event`, `manual`, `import`) siguen en NULL. | La cascada de respaldo del §6.1 (`last_visit_location_id` → `origin_location_id`) es **F6**: toca el desglose de plata (D4), y F3 tiene prohibido cambiar lecturas de dashboard. `customers.last_visit_location_id` ya se está llenando, así que F6 tendrá de dónde leer. |
| 13 | **`message_logs.line_location_id`, `tenant_wallet_transactions.location_id`, `campaigns.location_id`, `reward_grants.granted_location_id`, `reward_redemptions.redeemed_location_id` y `consent_events.location_id` siguen vacías.** | Fuera del alcance de F3. `line_location_id` depende de **D6**, que el dueño no decidió (F9). Las de premios son F6 (la matriz origen→destino de D12). `consent_events` **no tiene un solo escritor en TypeScript** — la tabla existe desde la 00037 y nadie inserta en ella. |
| ~~14~~ | ~~**`src/app/api/dashboard/location/route.ts` sigue con su `.single()`.**~~ **CERRADA en F4.** Y con una correccion al diagnostico: el bug NO era el `.single()`, era que el `PUT` **descartaba el error** de su sonda — por eso cambiarlo a `.maybeSingle()` no habria arreglado nada. Ver §3.ter. Texto original: Filtra solo por tenant: con 2 sedes activas devuelve 500, y su `PUT` inserta una tercera fila en vez de actualizar. Este doc decía «se arregla en F3». | **NO se arregló en F3**: el alcance de la sesión de F3 excluyó explícitamente tocar lecturas y pantallas de dashboard (eso es F6/F7). Contradicción real entre este doc y el alcance ejecutado, dejada por escrito a propósito. Ningún tenant vivo tiene 2 sedes, así que hoy no es explotable. |
| 15 | **`staff_devices.staff_user_id` es una FK SIMPLE** a `staff_users(id)` (00018:31, `ON DELETE CASCADE`): nada en la BASE impide atribuir un dispositivo de la marca A a un mesero de la marca B. | **Mitigado, no cerrado.** El trigger `trg_staff_devices_sede_coherente` de la 00044 lo rechaza (23514) buscando al mesero DENTRO de la marca del dispositivo, pero un trigger es mas facil de saltar que una FK. Convertirla en compuesta `(staff_user_id, tenant_id)` exige un `UNIQUE (id, tenant_id)` en `staff_users` que hoy no existe, y eso no esta en el spec. |
| ~~16~~ | ~~**No hay control en el panel para asignarle sede a un mesero.**~~ **CERRADA en F7.** `/dashboard/staff` ya dibuja el `<select>` de sede en Crear y Editar (`assignableLocations`, tomado del mismo `LocationScopeProvider` del header — cero fetch nuevo), la tabla muestra la sede de cada mesero como badge (`location_id` NULL → "Sin sede", nunca se adivina), y el aviso de D11 (mover de sede con dispositivos en otra se rechaza, 23514) queda escrito en la propia pantalla. Texto original: La API ya lo acepta (`POST`/`PATCH /api/dashboard/staff` con `location_id`) y el `GET` ya lo devuelve, pero el formulario de `/dashboard/staff` no dibuja el selector. | F4 entregó el MECANISMO, F7 la pantalla — ver §3.quater. El `<select>` solo se dibuja si la marca tiene al menos una sede activa (`assignableLocations.length > 0`); con `role='location'` el admin solo ve SUS sedes, que es la restricción correcta: no debería poder asignar meseros a una sede que no administra. |
| 17 | **Las sedes NO se pueden crear ni editar desde el producto**, solo la principal y solo sus coordenadas (`PUT /api/dashboard/location`). | Dar de alta la sede 2..N es el wizard del AIOS, **F8** (00047). No se adelanta: `restaurant_locations` es la 00041 y su superficie de escritura la define esa fase. |

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
