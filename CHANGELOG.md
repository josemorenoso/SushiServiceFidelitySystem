# Changelog — RestaurantQR

> Formato: [Semantic Versioning](https://semver.org/)
> Cada entrada incluye: fecha, tipo, archivos afectados, request original.

---

## [docs] — 2026-09-01 — §23: un cliente, varias sedes (mismo recorrido, datos separados)

> Request original: *"cómo hacemos cuando es más de una sede para que independientemente de si
> comparten número o es separado, los clientes tengan el mismo recorrido en las dos sedes, pero
> separemos al mismo tiempo los datos para cada dashboard… si voy a la sede Envigado y acumulo 70
> puntos no voy a ir a la de Laureles a empezar de 0"*.
> **Sin código.** Requerimiento nuevo en `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §23.

Esto **responde la pregunta abierta de §22** (*"¿los puntos son de la marca o de la sede?"*): son de
la marca. §22 ya advertía que esa respuesta implica el cambio de schema más grande de la lista.

Dos hechos verificados contra la base el 2026-09-01, que son los que definen el problema:

1. **La identidad del cliente es por tenant** — `customers_phone_tenant_key UNIQUE (phone, tenant_id)`
   (migración 00028). Como el AIOS modela 1 sede = 1 tenant, la segunda sede arranca en cero. No es
   un bug: es el modelo actual funcionando como se diseñó.
2. **Ningún evento sabe en qué sede ocurrió** — `visits` tiene `tenant_id` pero **no** `location_id`,
   y tampoco lo tienen `point_transactions`, `reward_grants`, `reward_redemptions` ni `review_events`.
   `restaurant_locations` (00014) existe pero solo la consume `/api/dashboard/location`; la geocerca
   del check-in está **comentada** (`src/app/api/check-in/route.ts` ≈226-237).

De ahí la conclusión incómoda: **hoy ninguno de los dos modelos sirve**. Con 1 sede = 1 tenant los
puntos no se comparten; con 1 marca = 1 tenant el dashboard por sede es imposible, porque los eventos
no guardan la sede. Cualquier solución toca la base — no hay atajo de configuración.

§23 deja las dos arquitecturas con sus consecuencias (recomendada: 1 marca = 1 tenant, sede =
`restaurant_locations`), las 5 preguntas que el dueño tiene que responder antes de escribir código, y
el enganche con §14.1/§14.2 del spec de alta, que ya listaban como pendiente quitar el único de
`idx_tenants_zernio_account_id` y desambiguar a qué sede pertenece un mensaje entrante.

Nada se implementó: Mandamiento I — la pregunta 2 (cómo sabe el check-in en qué sede está) decide si
`location_id` se puede llenar de verdad, y sin esa respuesta la columna nacería vacía.

---

## [v2.15.1] — 2026-09-01 — fix(db): el `ALTER` que solo vivía aplicado a mano

> Request original: *"`ALTER FUNCTION is_super_admin() SECURITY DEFINER` se aplicó A MANO a la
> base del producto y no vive en ninguna migración. Si esa base se reconstruye, el AIOS falla
> con 42501 y nadie va a saber por qué. Conviértelo en migración versionada."*
> **Migración nueva: `00040_is_super_admin_security_definer.sql`.** Para la base de producción
> es un **no-op** — el ALTER ya estaba aplicado ahí, verificado el 2026-09-01.

### El fallo que evitaba, y por qué era invisible

`is_super_admin()` (migración 00024) llama a `auth.jwt()`. El rol `aios_constelarys`
(migración 00035 v2) **no tiene USAGE sobre el schema `auth`** — a propósito: es un rol de
solo lectura para un sistema que corre en otra infraestructura. Comprobado contra la base:

```
SELECT has_schema_privilege('aios_constelarys','auth','USAGE');  -- false
SELECT auth.jwt();                                               -- 42501
SELECT current_tenant_id();                                      -- 42501
SELECT is_super_admin();                                         -- false  ← solo porque ya es DEFINER
```

Ese rol tampoco es dueño de `tenants` ni tiene BYPASSRLS (`rolsuper=false`,
`rolbypassrls=false`, sin membresías), así que sus `SELECT` **sí** evalúan las policies. Y
sobre `tenants` conviven dos permisivas, que Postgres combina con OR:

| policy | `USING` | de dónde sale |
|---|---|---|
| `aios_constelarys_select_tenants` | `true` | 00035 v2 |
| `super_admin_all_tenants` | `is_super_admin()` | 00024 |

**Que la primera sea `true` no salva a la segunda.** Postgres no garantiza cortocircuitar el
OR: al evaluar `is_super_admin()` en el contexto del rol que llama, `auth.jwt()` revienta y se
cae el `SELECT` entero — aunque la otra policy lo habría permitido. El panel del AIOS se queda
sin poder leer un solo tenant, con un `permission denied for schema auth` que no apunta a
ninguna línea de código del AIOS ni del producto.

Reconstruir la base desde `supabase/migrations/` reproducía exactamente eso, porque el arreglo
no estaba en ningún archivo.

### Por qué `SECURITY DEFINER` acá no es un agujero

`auth.jwt()` lee `current_setting('request.jwt.claims', true)`: un ajuste de **sesión**, no un
permiso del rol. Correr como `postgres` devuelve **los mismos claims del que llama**, así que
la función sigue respondiendo por el JWT del usuario y no por el del dueño. Lo único que cambia
es que deja de necesitar permiso sobre el schema para leer un valor que ya era suyo. Es el
patrón estándar de Supabase para helpers de RLS.

`search_path` va fijo en `pg_catalog, public` — el mismo valor que ya tenía producción. Es
obligatorio: sin él, quien pueda crear objetos cuela un `jwt()` propio en un schema anterior
del path y secuestra la función.

**La migración no otorga ni revoca nada.** El `EXECUTE` a PUBLIC tiene que seguir: las policies
de `tenants`, `tenant_wallet_transactions`, `reward_grants`, `review_events`, `send_queue` y
compañía llaman a esta función como `anon` y `authenticated`. Un REVOKE dejaría sin leer a la
app entera. `CREATE OR REPLACE` conserva dueño y GRANTs, y el cuerpo es idéntico al de la
00024.

### Deuda que esta entrega NO cierra, a propósito

`current_tenant_id()` tiene **exactamente el mismo defecto** y se deja intacta. Hoy no rompe
nada porque las dos únicas tablas que el AIOS lee tienen policies que solo llaman a
`is_super_admin()`. Pero el patrón dominante del resto del esquema es
`USING (tenant_id = current_tenant_id() OR is_super_admin())`: el día que alguien le agregue a
una de esas tablas una policy `aios_constelarys_select_*` para que el panel la lea, la lectura
muere con el mismo 42501 silencioso.

Cambiarla altera cómo se evalúa el RLS de **cada** tabla multitenant del producto. Eso es una
decisión del dueño con su propia verificación, no un efecto colateral de versionar un ALTER que
ya estaba aplicado (Mandamiento I). Queda anotada en la migración y en `docs/03-security.md`.

### Archivos

- `supabase/migrations/00040_is_super_admin_security_definer.sql` — nueva, idempotente, con bloque de verificación
- `docs/DB_SCHEMA.md` — fila 40 en la tabla de migraciones
- `docs/03-security.md` — sección nueva «Helpers de RLS y el rol del AIOS Constelarys», con las 3 reglas al tocar esto y la deuda abierta

---

## [v2.15.0] — 2026-08-31 — fix: el 🍣 horneado, las campañas de cross-sell que no aparecían, y el opt-out visible

> Request original: *"hay que tener cuidado con que contenga stickers de sushi o algo porque se
> hardcodean para todos · a ese apartado le faltan las plantillas de invitar a restaurante los que
> piden por domicilio e invitar a domicilio los que piden por restaurante · el OPT OUT no hablamos
> de eso pero es extremadamente importante, que el cliente pueda decir Salir y se salga"*.
> Requerimientos: `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §12, §13.
> **Sin migración.** El único cambio de schema es una clave opcional en `tenants.config` (jsonb).

### El emoji de sushi dejó de ir horneado en las plantillas de todos

Los 11 textos del estilo `calido` nacieron para Sushi Service y traían 🍣 **escrito dentro del
texto**. Como Meta aprueba el cuerpo LITERAL, ese sushi le llegaba igual a una barbería o a un salón
de belleza — y no había forma de quitarlo sin volver a someter la plantilla.

Ahora ese lugar lo ocupa un emoji que se resuelve **al construir el cuerpo**, antes de mandarlo a
Meta, exactamente igual que el nombre del negocio:

| Tipo de negocio | Emoji |
|---|---|
| `restaurant` | 🍽️ |
| `barbershop` | 💈 |
| `beauty_salon` | 💅 |
| cualquier otro | ✨ |

Con override por tenant en `tenants.config.template_emoji` para el negocio que quiera el suyo.

**No es una variable `{{n}}` y el contrato de variables no cambió.** El emisor (check-in, crons,
campañas, calendario) sigue mandando exactamente los mismos valores en el mismo orden — era el
requisito explícito del dueño: *"asegúrate que sigamos usando toda nuestra lógica de plantillas y
variables"*. `resolveTemplateEmoji()` nunca devuelve vacío: una cadena vacía dejaría un espacio
suelto dentro de un texto ya aprobado, imposible de arreglar sin re-someterlo.

De paso, `campaign_domicilio_to_presencial` decía "llevarte **la comida** a casa" → "el pedido".

Un test nuevo (`tests/unit/template-catalog.test.ts`) recorre las 39 combinaciones y **falla si
alguien vuelve a hornear un emoji de rubro** (🍣 🍕 🍔 🌮 ☕ 🍜 🥢 💈 💅 🍽️). 33 pruebas en verde.

### Las dos campañas de cross-sell sí existían — pero no en la cuenta de Twilio del negocio

Diagnóstico del reporte *"al apartado le faltan las plantillas de invitar a restaurante…"*:

1. Las dos **están** en el catálogo estándar (`campaign_presencial_to_domicilio` y
   `campaign_domicilio_to_presencial`) y en el script de alta de Twilio.
2. Pero ese script solo corrió completo en algunas altas — que es exactamente el problema que §12
   describe: *"cada alta terminaba con un set de plantillas distinto"*.
3. Y sus presets en `ManualCampaigns.tsx` **se ocultan solos** mientras su
   `admin_settings.*_template_sid` no apunte a una plantilla aprobada (regla §15.2). Sin plantilla,
   la campaña no se dibuja y no había forma de saber por qué.

Se agrega, **solo para negocios en Twilio**, una tarjeta «Del set estándar te faltan N» encima de la
lista de plantillas: dice cuáles faltan, muestra el texto exacto que se crearía y la crea con un
click (creación + envío a Meta + puntero listo).

**Estrictamente aditivo.** Respeta la decisión 6 del dueño (*"los 4 tenants Twilio déjalos así, ni
los toques"*): nunca reemplaza, reescribe ni re-somete una plantilla existente.
`fillEmptyPointer()` se niega a escribir si la clave ya tiene valor —`promoteVersion()` sigue siendo
el único que **cambia** un puntero vivo, y solo tras la aprobación de Meta— así que rellenar un hueco
no puede abrir uno.

### El opt-out ya funcionaba; lo que faltaba era poder verlo

Verificado punta a punta antes de tocar nada, y **estaba completo**: el webhook de Twilio y el de
Zernio persisten `customers.whatsapp_opt_out_at` ante SALIR/STOP/BAJA/CANCELAR,
`sendTemplateMessage()` lo consulta en **las dos ramas de proveedor**, la cola de goteo lo revisa al
encolar y otra vez al drenar (entre las dos cosas pueden pasar días), y las campañas lo filtran. Las
11 plantillas de marketing ya cierran con *"Responde SALIR para no recibir más mensajes."*

Lo que **no** existía era verlo sin depender de Twilio: `/api/dashboard/twilio-metrics` deduce los
opt-outs paginando la API de Mensajes de Twilio, así que a un negocio en Zernio le mostraba **cero**
aunque sus clientes sí hubieran respondido SALIR y el sistema los estuviera respetando.

Panel nuevo **«Clientes que pidieron salir»** en el dashboard, encima del de Twilio: lee la columna
que el envío consulta de verdad, así que cuenta igual con los dos proveedores. Total, % de la base y
los recientes, con aviso cuando pasa del 5% — que es cuando Meta empieza a bajar la calidad del
número y con ella el límite diario.

### Archivos

- `src/constants/template-texts.ts` — 13 usos de `${emoji}`, cero emojis de rubro horneados
- `src/constants/template-catalog.ts` — `resolveTemplateEmoji()`, `TEMPLATE_EMOJI_BY_BUSINESS_TYPE`
- `src/types/tenant.types.ts` — `TenantConfig.template_emoji`
- `src/services/template.service.ts` — `emojiOf(tenant)` en los 3 puntos que construyen o comparan un cuerpo
- `src/services/twilio-catalog.service.ts` **(nuevo)**
- `src/app/api/dashboard/templates/standard/route.ts` **(nuevo)**
- `src/components/dashboard/templates/StandardCatalogGaps.tsx` **(nuevo)**
- `src/components/dashboard/templates/TwilioTemplateManager.tsx` — monta la tarjeta
- `src/app/api/dashboard/opt-outs/route.ts` **(nuevo)**
- `src/components/dashboard/OptOutPanel.tsx` **(nuevo)**
- `src/app/(dashboard)/dashboard/page.tsx` — monta el panel
- `tests/unit/template-catalog.test.ts` — 6 pruebas nuevas del emoji de marca

---

## [v2.14.0] — 2026-08-30 — feat(UI): limpieza del panel, campañas fantasma y tarjeta Black

> Request original: *"§14.1 + §17.1 mover la sección de clientes Black · §14.2 el resumen baja de 20
> a 15 · §15.3 mover las burbujas flotantes a campañas · §15.2 campañas fantasma · §17.2 tarjeta
> Black negra y dorada"*.
> Requerimientos: `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §14, §15.2, §15.3, §17.1, §17.2.
> **UI pura.** No toca base de datos, ni envío, ni plantillas. Sin migración.

### El panel de métricas se vació de lo que no se mira a diario

Dos secciones se **movieron enteras** —mismos datos, mismo comportamiento— al apartado donde
realmente se actúa sobre ellas. Ninguna se borró.

- **`BlackTierSection` → `/dashboard/customers`** (§14.1 la saca, §17.1 la pone; es una sola cosa
  pedida dos veces). Textual: *"la pantalla negra de clientes VIP tiene que quedar dentro del
  apartado de clientes"*. Va arriba del buscador, con los mismos `topCustomers` de analytics y los
  mismos beneficios de `admin_settings.black_benefits`. Al hacer clic en un Black se abre su ficha,
  igual que antes.
- **`AtRiskBubbles` → `/dashboard/campaigns`, pestaña Manuales** (§15.3). Textual: *"considerando el
  día a día del cliente deberíamos eliminar las burbujas flotantes catalogadas por días en el
  dashboard y meterla en el área de campañas"*. Queda encima de `ManualCampaigns` porque hace
  exactamente lo mismo que ella: publicar en `/api/dashboard/campaigns/manual`. Las campañas de
  reactivación que dispara siguen funcionando sin un cambio.

`GrowthChart` pasó a ancho completo en el panel (compartía rejilla con las burbujas).

### El resumen de clientes bajó de 20 a 15 (§14.2)

`customers.slice(0, 20)` → `TOP_CUSTOMERS_LIMIT` (15) en `src/constants/rankings.ts`. Se cambió en
los **dos** sitios que producen ese resumen: `dashboard.service.ts` (datos reales) y
`demo-analytics.ts` (modo demo) — si solo se cambiara el primero, la demo de ventas enseñaría un
panel de 20 filas que el cliente no va a tener. Verificado: ningún componente asumía 20
(`PowerRanking` solo distingue las 3 primeras posiciones).

### Campañas fantasma: la regla genérica de la plantilla (§15.2)

Textual: *"hay campañas como invitar a restaurante los que piden domi o invitar a que pidan domi los
que van a restaurante, que no tienen plantillas y no van a poder usarse, son básicamente de
mentira"*. Los filtros de esos dos presets sí estaban implementados; faltaba la plantilla aprobada.

**No se borró ninguno de los dos**, porque la decisión de fondo (15.b: ¿eliminarlos o crearles
plantilla?) sigue abierta. En su lugar hay una regla que sirve para las dos salidas:

- un preset que declara `templateSettingKey` se dibuja **solo** si esa clave de `admin_settings`
  apunta a un SID que existe y está aprobado;
- un preset sin esa clave es un atajo de segmentación que funciona con cualquier plantilla aprobada
  y se muestra siempre.

`invite_restaurant` y `invite_delivery` apuntan a `campaign_domicilio_to_presencial_template_sid` y
`campaign_presencial_to_domicilio_template_sid` (catálogo estándar de §12). Efecto: **hoy
desaparecen solos**; el día que se les cree y apruebe la plantilla, reaparecen sin tocar código. Si
al final se decide eliminarlos, se borran dos entradas de `PRESETS` y la regla sigue sirviendo.

La predicción es una función pura fuera del JSX (`isPresetSendable()`). Si ningún preset es enviable
la pantalla lo dice y deja los filtros manuales disponibles: no se queda en blanco.

### La tarjeta Black — negra y dorada (§17.2)

Textual: *"al entrar a Black, la tarjeta del cliente en su celular cambia a negro y dorado"*, con
distintivo claro. Fondo negro, borde y halo dorados, pastilla con corona **«Miembro Black»**, nombre
/ puntos / barra / sellos en oro viejo (`#D4AF37`–`#F2D479`; el `#FFD700` puro sobre negro se lee
barato y vibra en AMOLED). Los sellos llenos pasan de blanco con ✓ rojo a dorado con ✓ casi negro,
que sobre negro sí se lee.

Partido en tres para no mezclar lógica con estilos (Mandamiento II):

| Archivo | Qué decide |
|---------|------------|
| `src/lib/black-tier.ts` (nuevo) | Quién es Black. Cero colores |
| `src/constants/wallet-card-theme.ts` (nuevo) | Los colores. Cero negocio |
| `WalletCard.tsx` / `StampsGrid.tsx` | Solo layout |

**El aspecto por defecto no cambió:** la refactorización movió los colores literales que ya tenía la
tarjeta (`text-white/50` → `rgba(255,255,255,0.5)`, …) a `brandWalletCardTheme()`, valor por valor.

⚠️ **Definición de Black usada, y por qué.** Conviven dos: por **visitas** (`POWER_RANKS`, 10+, la
del dashboard y del preset `black_exclusive`) y por **puntos** (`reward_tiers.is_black`). La tarjeta
usa la de puntos porque enseña la escalera de premios por puntos: pintarla de negro por visitas haría
que un cliente con 10 visitas y pocos puntos viera una tarjeta Black encima de una lista que le dice
que Black sigue bloqueado (🔒). **Cuál manda a nivel de producto es la pregunta 17.b, abierta** — por
eso la regla vive en una sola función. El umbral de 10 visitas de `ManualCampaigns.tsx` **no se
tocó**: §17.4 sigue congelado.

**Fuera de alcance por preguntas abiertas, como se pidió:** §17.3 (beneficio permanente, 17.a–17.d),
§17.4 (umbral configurable), §15.1 (rediseño de usabilidad, 15.a) y §16 completo.

### Archivos

| Archivo | Cambio |
|---------|--------|
| `src/app/(dashboard)/dashboard/page.tsx` | 🔄 Salen `BlackTierSection` y `AtRiskBubbles`; `GrowthChart` a ancho completo |
| `src/app/(dashboard)/dashboard/customers/page.tsx` | 🔄 Entra `BlackTierSection` + `useDashboardAnalytics` + beneficios |
| `src/app/(dashboard)/dashboard/campaigns/page.tsx` | 🔄 Entra `AtRiskBubbles` en la pestaña Manuales |
| `src/components/dashboard/ManualCampaigns.tsx` | 🔄 `templateSettingKey` + `isPresetSendable()` + rejilla filtrada |
| `src/constants/rankings.ts` | 🔄 `TOP_CUSTOMERS_LIMIT = 15` |
| `src/services/dashboard.service.ts` | 🔄 `slice(0, TOP_CUSTOMERS_LIMIT)` |
| `src/lib/demo-analytics.ts` | 🔄 `slice(0, TOP_CUSTOMERS_LIMIT)` (espejo del anterior) |
| `src/lib/black-tier.ts` | ✅ Nuevo — `isBlackMember()` / `findBlackTier()` |
| `src/constants/wallet-card-theme.ts` | ✅ Nuevo — paletas de marca y Black |
| `src/components/features/wallet/WalletCard.tsx` | 🔄 Tema por props del tema; distintivo Black |
| `src/components/features/wallet/StampsGrid.tsx` | 🔄 `theme` opcional (default: el de siempre) |
| `docs/features/dashboard.md` | 🔄 Reordenamiento + regla de presets |
| `docs/features/wallet-card.md` | 🔄 Tarjeta Black |
| `CLAUDE.md` | 🔄 Tabla de lookup |

Verificado con `npx tsc --noEmit` (exit 0) y `npx eslint` sobre los archivos tocados (exit 0, sin
avisos). `src/app/(public)/tarjeta/page.tsx` no necesitó cambios: ya le pasaba `tiers` y
`totalPoints` a `WalletCard`.

---

## [v2.13.0] — 2026-08-30 — feat: cola de goteo (Bloque 2) + infraestructura de pruebas

> Request original: *"TAREA 2: montar infraestructura de pruebas... la prueba más importante del spec
> sigue sin existir. TAREA 3: Bloque 2 (cola de goteo)."*
> Spec: `docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md` §3.4, §7 y §9.

### Infraestructura de pruebas — el proyecto no tenía ninguna

`package.json` solo exponía `lint` y `build`. No había vitest, ni jest, ni un solo test — y sin
embargo dos comentarios del código (`src/constants/messaging.ts:11` y el bloque 2 de `00037`)
afirmaban que existía un test `message-class-map.test.ts` verificando que el mapa de clases no
divergiera entre TypeScript y SQL. No existía.

- **vitest + `embedded-postgres`.** Sin Docker, sin `psql`, sin Supabase CLI (esta máquina no tiene
  ninguno): se descarga un binario real de Postgres como dependencia de npm y se arranca en un puerto
  local. La suite entera corre en ~7 s.
- **Las 38 migraciones se replican de verdad** sobre esa base, con un `bootstrap.sql` que recrea el
  trozo de Supabase del que dependen (`auth.jwt()`, `auth.role()`, `auth.users`, `storage.*`, los
  roles `anon`/`authenticated` y las *default privileges*). Efecto lateral valioso: la suite valida
  la migración **antes** de que el dueño la pegue en el SQL Editor.
- **85 pruebas**, incluida la que el spec §9 llama «la prueba más importante»: `reserve_send_slot()`
  con 20 llamadas concurrentes y presupuesto 10 concede **exactamente 10**.
- **Con control negativo.** Una prueba hermana crea la misma función SIN el `pg_advisory_xact_lock`
  y exige que se pase del límite. Sin ella, «exactamente 10» podría salir por accidente si algo
  estuviera serializando las llamadas, y la prueba principal no demostraría nada.

Ver `docs/features/testing.md`.

### 🔒 Agujero de seguridad encontrado y cerrado — `anon` podía llamar las funciones del núcleo

`REVOKE ALL ... FROM PUBLIC` **no basta en Supabase**. Todo proyecto trae
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated,
service_role`, así que cada función nace además con un GRANT EXECUTE **nominal** a `anon` y
`authenticated`. Revocar PUBLIC borra un ACE y deja los otros dos.

Como son `SECURITY DEFINER`, corrían con los privilegios del dueño y la RLS no las frenaba. Con la
`NEXT_PUBLIC_SUPABASE_ANON_KEY` —que viaja en el bundle del navegador— se podía:

- `send_queue_pending_tenants()` → listar los tenants con cola pendiente;
- `claim_send_queue(tenant, 1000)` → **leer la cola completa de cualquier tenant** (teléfonos,
  plantilla, variables) y arrendarla, dejándola sin drenar;
- `enqueue_send_queue(...)` → **inyectar envíos** que el drenador manda de verdad;
- y, en `00036` —**ya aplicada en producción**— `aios_provision_tenant(jsonb)`, que **crea tenants**.

Corregido nombrando los roles (`FROM PUBLIC, anon, authenticated`) en `00037` y `00038`. El bloque 10
de `00038` cierra además las funciones de `00035`/`00036`, porque una migración ya aplicada no se
vuelve a correr. Fijado con `tests/db/permisos.test.ts` — que solo detecta el agujero porque el
bootstrap replica las *default privileges* de Supabase.

### Bloque 2 — la cola de goteo

Antes: una campaña de 380 con presupuesto 180 enviaba 180 y **perdía** los otros 200, marcados
`failed` con `campaign_budget_exhausted`. Ahora se encolan y gotean en los días siguientes.

- **`00038_send_queue_drain.sql`** — arriendo (`claimed_at`), `claim_send_queue()` con
  `FOR UPDATE SKIP LOCKED` (dos drenadores simultáneos se reparten la cola en vez de duplicar
  envíos), `expire_send_queue()`, `send_queue_pending_tenants()`, `send_queue_depth()`,
  `send_queue_finished_campaigns()`, `enqueue_send_queue()` e índices para el round-robin.
- **Anti-duplicado arreglado:** el índice de `00037` era `(tenant_id, phone, campaign_id)` y en
  Postgres dos NULL nunca colisionan, así que los items encolados por un cron **no tenían
  protección**. Ahora usa `COALESCE(campaign_id, centinela)` + `message_type`.
- **`/api/cron/queue-drain`** — vence, lista tenants por urgencia, round-robin con presupuesto de
  ~50 s, re-evalúa las guardas de demanda al enviar (opt-out, frequency cap, Recovery Zone, cap
  mensual), backoff 15 min → 1 h → 4 h y `failed` al tercer intento.
- **Workflow W4** (`n8n/cron_queue-drain.json`), cada 15 min. **No es un cron de Vercel:**
  `vercel.json` tiene `"crons": []` a propósito desde 2026-07-05.
- **`GET /api/dashboard/send-queue`** y **`DELETE /api/dashboard/send-queue/[id]`** (que cancela, no
  borra; y responde 409 si el drenador ya está enviando ese item).
- **La campaña queda `running` mientras gotea** y solo pasa a `completed` cuando su cola se vacía.

### Fix: la otra mitad de D-2 — los tenants Zernio no podían lanzar campañas

`00037` apagó el **cobro** a tenants Zernio, pero `canSendBulk()` seguía **bloqueándolos** por saldo
insuficiente. Como su saldo se queda en 0 para siempre (no entran recargas ni salen débitos),
**toda campaña masiva de todo tenant Zernio se habría rechazado con 409 «Saldo insuficiente»** — un
bloqueo de lanzamiento para los 25. `canSendBulk()` ahora los exime.

### Fix: `npm run build` y `npm run lint` estaban rotos en local

`tsconfig.json` declaraba `exclude: ["node_modules"]`, lo que **reemplaza** la exclusión por defecto
de TypeScript y solo ancla el `node_modules` de la raíz. Con `include: ["**/*.ts"]`, el proyecto
anidado `Level 2.0/aios-constelarys` (repo SEPARADO, en `.gitignore`) entraba al proyecto raíz:
`npm run build` fallaba con `Cannot find module '@/lib/actions/clients'` (un archivo del AIOS) y
`npm run lint` reportaba **11.727 problemas** ajenos. Ahora build pasa y lint reporta 43.

### Investigación: D-4 resuelta (Zernio expone calidad y escalón, pero no por webhook)

Verificado contra la API real con la `ZERNIO_API_KEY`, **solo lectura**:
`GET /v1/whatsapp/number-info` devuelve `quality_rating`, `messaging_limit_tier`, `throughput` y
`health_status`. **No existe evento de webhook para el quality rating** en el catálogo de 50 eventos
— el poll del Bloque 3 es la única fuente. Tres consecuencias documentadas en §10 del spec, incluida
que el congelamiento de Golden Bullet «al primer amarillo» tendrá la latencia del poll.

### Archivos

`supabase/migrations/00038_send_queue_drain.sql` (nuevo), `00037_send_governance.sql` (permisos),
`src/services/send-queue.service.ts` (nuevo), `src/app/api/cron/queue-drain/route.ts` (nuevo),
`src/app/api/dashboard/send-queue/{route.ts,[id]/route.ts}` (nuevos),
`src/app/api/dashboard/line-budget/route.ts`, `src/app/api/dashboard/campaigns/manual/route.ts`,
`src/services/campaign.service.ts`, `src/services/wallet.service.ts`,
`n8n/cron_queue-drain.json` (nuevo), `vitest.config.mts` + `tests/**` (nuevos),
`docs/features/testing.md` (nuevo), `docs/features/send-governance.md`, `tsconfig.json`,
`eslint.config.mjs`, `package.json`.

### Lo que este bloque NO hace

Los crons (`birthday`, `reactivation`, `reward-reminder`, `calendar-dispatch`) **todavía no encolan**.
Tienen variables que caducan (`days_left`, fechas límite) y efectos posteriores (`grantReward()`,
`markReminderSent()`) cuyo diseño exige decisiones del dueño que no se asumieron (Mandamiento I). La
pregunta abierta está al final de `docs/features/send-governance.md`.

---

## [v2.12.0] — 2026-08-30 — feat: catálogo estándar de plantillas + 3 estilos + edición sin huecos

> Request original: *"desde el principio me han cargado como un loco"* (las plantillas). Repriorizado
> por encima de TODO lo demás — primera prioridad del proyecto.
> Requerimiento: `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §12, incluidas las 6 respuestas
> del dueño del 2026-08-30.

### Contexto

Tres problemas en un solo pedido: cada alta terminaba con un set de plantillas distinto según quién lo
armara a mano; no existía el concepto de tono; y editar una plantilla era imposible sin dejar un hueco
de 24-72h, porque Meta no deja editar in-place una plantilla aprobada.

**La decisión que ordena todo el diseño**, textual del dueño: *"que se cree primero la nueva y una vez
quede aprobada se cambie y automáticamente se modifique, pero luego de aprobarla, para nunca
arriesgarnos a perder un mensaje"*. De ahí el invariante del que cuelga la feature entera:

> `promoteVersion()` es el **único** punto del sistema que escribe `admin_settings.<settings_key>`, y
> solo corre cuando Meta ya dijo `APPROVED`. Mientras Meta revisa, los envíos siguen saliendo con la
> plantilla vieja. Si Meta rechaza, no se toca nada.

Doc de feature: `docs/features/whatsapp-templates.md`.

### Agregado

- **`supabase/migrations/00039_template_catalog.sql`** — tabla `template_versions` (vigente +
  pendiente + historial + quién editó y cuándo), seed de `admin_settings.template_style` solo para
  tenants Zernio, RLS por tenant. Tres índices parciales únicos que hacen cumplir los invariantes en
  la base y no solo en la UI. Ver `docs/DB_SCHEMA.md`.
- **`src/constants/template-catalog.ts`** — las 13 plantillas estándar: estructura, contrato de
  variables, validación contra las reglas duras de Meta y render de vista previa.
- **`src/constants/template-texts.ts`** — el banco de 39 textos (13 × 3 estilos). `calido` es un port
  literal del catálogo en producción; `elegante` y `urbano` son nuevos.
- **`src/services/template.service.ts`** — estado del catálogo, guardado de ediciones, re-aplicación
  de estilo y el detector de aprobación.
- **`src/lib/zernio/templates.ts`** — adaptador REST de Zernio (crear / consultar estado).
- **`src/app/api/dashboard/templates/catalog/route.ts`**, **`catalog/[key]/route.ts`**,
  **`style/route.ts`** — los 3 endpoints del dashboard. Ver `docs/API_DOCS.md`.
- **`src/components/dashboard/templates/`** — `TemplateCatalogEditor`, `TemplateEditorDialog`,
  `StyleSelector`, y `TwilioTemplateManager` (la pantalla anterior, movida intacta).
- **`tests/unit/template-catalog.test.ts`** — 27 pruebas. Las 39 combinaciones contra las reglas de
  Meta, sin base de datos ni red.
- **`docs/features/whatsapp-templates.md`** — doc de la feature.

### Modificado

- **`src/app/api/webhook/zernio/route.ts`** — maneja `whatsapp.template.status_updated`. Es el
  disparador del cambio de puntero. Toda la decisión vive en `applyProviderTemplateStatus()`; el
  webhook no escribe ni una fila y siempre responde 200 (un 4xx acumulado hace que Zernio desactive el
  webhook entero tras 10 fallos, y perder los eventos de mensajes sería mucho peor).
- **`src/lib/zernio/webhooks.ts`** — tipo `ZernioWebhookPayloadTemplateStatus`, tomado literal del
  contrato verificado.
- **`src/app/(dashboard)/dashboard/templates/page.tsx`** — se bifurca por proveedor: Zernio ve el
  catálogo nuevo, Twilio ve exactamente la pantalla de antes.

### Decisiones

- **D-1 — el detector de aprobación es un WEBHOOK, no un poll.** El contrato verificado de Zernio
  documenta `whatsapp.template.status_updated` con su payload exacto, incluido el `accountId` que
  resuelve el tenant. **No se implementó poll**: montar un cron duplicado antes de ver fallar el
  webhook en producción es trabajo que puede no hacer falta. `applyProviderTemplateStatus()` es la
  puerta única para que el **Bloque 3 de gobernanza de envío** lo reuse en vez de duplicar la
  promoción; `refreshTemplateStatusFromProvider()` ya deja armado ese camino.
- **D-2 — el versionado va en tabla propia, no en más claves de `admin_settings`.** El puntero vigente
  sigue en `admin_settings.<settings_key>` con el contrato intacto: **no se tocó una sola línea del
  camino de envío**. `admin_settings` es key-value y no tiene dónde registrar autor ni fecha, que es
  requisito duro de la decisión 3 del dueño. Con `template_versions` vacía, el sistema envía como hoy.
- **D-3 — no se borra la plantilla vieja del proveedor.** §12 dice "se borra la vieja" al aprobar la
  nueva, pero el contrato verificado de Zernio **no expone un DELETE de plantillas** y esa doc prohíbe
  inventar rutas. Dejar de apuntarla y marcarla `retired` resuelve el problema real; queda huérfana en
  la WABA, sin costo ni efecto sobre el envío. El gancho para cuando exista el endpoint es
  `retired_at`.
- **D-4 — el estilo `calido` no se tocó,** ni siquiera el 🍣 horneado que arrastra de Sushi Service.
  §12 respuesta 2 es explícita: "sin cambios en el default". Queda anotado como observación para el
  dueño en `docs/features/whatsapp-templates.md` — cambiarlo es decisión suya, no nuestra.
- **D-5 — los 4 tenants Twilio no se tocan.** El guardarraíl (`assertZernioTenant()`) está en el
  servicio, no en la UI, para que ninguna ruta pueda saltárselo.

### Hallazgo durante la implementación

- **10 de los textos `elegante` empezaban con `{{1}}`** — Meta rechaza toda plantilla que empiece con
  una variable. Lo detectó `tests/unit/template-catalog.test.ts` antes de que llegara a Meta, que es
  exactamente para lo que se escribió esa prueba: el fallo real habría aparecido 48 horas después,
  contra la reputación del número del cliente.

### Nota de numeración

La migración es la **00039**, no la 00038: esa numeración ya la tomó `00038_send_queue_drain.sql`
(Bloque 2 de la gobernanza de envío, frente paralelo).

---

## [v2.11.0] — 2026-08-30 — feat: gobernanza de envío — presupuesto de línea + retiro de billetera Zernio

> Request original: *"hay que traer de alguna forma el límite del número para mensajes diarios y tener
> un cap seguro para mensajes del sistema... el cap de 250 que es el de Meta, lo dejamos siempre en 180
> mensajes disponibles para campaña libre"*.

### Contexto

Tras decidir **coexistencia** (los mensajes salen por la línea principal de WhatsApp del restaurante,
no por un número aparte), el riesgo cambió de lugar: una campaña que se pasa del límite de Meta ya no
degrada un número de marketing, degrada la línea de atención al cliente del negocio.

**El encuadre:** el repo ya gobernaba la DEMANDA (`FREQUENCY_CAP_DAYS = 7`, `MONTHLY_MARKETING_CAP = 3`,
blackout pre-evento, opt-out) pero **no gobernaba la OFERTA** — nada sabía que Meta limita cada línea a
N destinatarios **únicos** por 24h **rodantes**, ni que ese límite lo consumen por igual las plantillas
de marketing y las de utility. `BATCH_SIZE = 10` en las campañas era concurrencia, no un tope.

Spec: `docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md`.
Esta entrega cubre el **Bloque 1** (presupuesto) y el **Bloque 8** (billetera).

### Agregado

- **`supabase/migrations/00037_send_governance.sql`** — 5 tablas nuevas (`message_class_map`,
  `send_reservations`, `send_queue`, `line_health_snapshots`, `consent_events`), 6 columnas nuevas en
  `tenants`, y 6 funciones. Ver `docs/DB_SCHEMA.md`.
- **`src/services/line-budget.service.ts`** — reserva, liberación y lectura del presupuesto.
- **`src/constants/messaging.ts`** — espejo en TS de `message_class_map`.
- **`src/app/api/dashboard/line-budget/route.ts`** — cuánto puede emitir hoy la línea del tenant.
- **`docs/features/send-governance.md`** — doc de la feature.

### Modificado

- **`src/services/whatsapp.service.ts`** — guarda de presupuesto en el choke-point único, **después
  del opt-out** en ambas ramas (un cliente que pidió SALIR no debe consumir cupo), y liberación del
  cupo cuando el proveedor rechaza. `is_demo` sigue saliendo antes: un tenant demo no consume cupo.
- **`debit_wallet_on_message_sent()`** (dentro de 00037) — copia fiel de la 00033, **incluido su
  `EXCEPTION WHEN OTHERS`**, con una sola guarda añadida: los tenants Zernio ya no se cobran.

### Decisiones

- **D-1 — Golden Bullet se permite** bajo régimen especial (spec §3.4.1). Sigue apagado por su feature
  flag hasta que exista el Bloque 5.
- **D-2 — se apaga el débito de billetera para tenants Zernio.** Meta le factura los mensajes directo
  al restaurante; cobrarle además $100 COP/mensaje sería cobrarle dos veces. El modelo pasa a
  suscripción mensual variable. **La billetera de los 4 tenants Twilio no se toca.** Lo que lo hace
  posible: la billetera también era el freno de gasto, y el presupuesto de línea la reemplaza en esa
  función — frenando contra el límite real de Meta en vez de contra el saldo.

### Corrección antes de aplicar (misma fecha)

- **`messaging_daily_limit` ya NO trae `DEFAULT 250` en el `ADD COLUMN`.** Un default en el `ADD COLUMN`
  rellena también las filas existentes: habría capado de golpe en 250 a Sushi Service, Don Alirio,
  Frangal y Demo — y Sushi Service mueve del orden de **2.000 mensajes diarios**. Aplicar la migración
  así le habría cortado las campañas a un cliente en producción.
  Ahora la columna nace sin default (existentes → `NULL`) y el `DEFAULT 250` se agrega en una segunda
  sentencia, de modo que solo alcanza a los tenants **nuevos**, donde 250 sí es el valor real de una
  WABA recién creada.
- **`NULL` = límite desconocido:** `line_budget()` devuelve `enforced: false` y `reserve_send_slot()`
  **concede siempre**, pero igual registra la reserva — así se mide el consumo real de esos tenants sin
  bloquearles nada. Es el dato que hace falta para elegir bien su límite después.

### Notas de diseño

- **La reserva es atómica en Postgres, no en TypeScript.** Las campañas envían en paralelo; un patrón
  leer-contar-insertar tiene una carrera que permite pasarse del límite. `reserve_send_slot()` toma un
  `pg_advisory_xact_lock` por tenant. **No quitar ese lock.**
- **La guarda falla CERRADO.** Si no se puede confirmar el cupo, no se envía
  (`error_code = 'budget_check_failed'`). Perder una bienvenida es barato; que Meta le restrinja al
  restaurante su línea principal, no. El `release`, en cambio, es best-effort: desperdiciar un cupo no
  le restringe el número a nadie.
- **Se cuenta `COUNT(DISTINCT phone)` sobre ventana rodante**, no mensajes por día calendario — es como
  Meta cuenta de verdad.

### Verificado

- `npx tsc --noEmit`: **0 errores** en los archivos tocados. Los 43 errores restantes de `src/` son
  `TS1149` (colisión de mayúsculas `Card.tsx`/`card.tsx`), preexistentes y provocados por que
  `Level 2.0/aios-constelarys` importa `@/components/ui/Badge` con mayúscula.
- `npx eslint` sobre los 4 archivos: limpio.
- **NO verificado en base de datos real:** la migración no se ha aplicado (este proyecto no usa
  Supabase CLI — se aplica a mano en el SQL Editor) y el proyecto **no tiene infraestructura de
  pruebas** (sin vitest/jest, sin un solo archivo de test). La prueba de concurrencia de
  `reserve_send_slot()` — 20 llamadas en paralelo con límite 10 deben conceder exactamente 10 — es la
  más importante del spec y **sigue pendiente**.

---

## [v2.10.0] — 2026-08-29 — feat: swap real Twilio → Zernio + funciones de alta del AIOS

> Request original: *"...necesito dar de alta a 25 clientes nuevos... [integración Zernio completa:
> migración de proveedor, funciones de aprovisionamiento del AIOS, webhook entrante, validaciones de
> entorno]."*

### Contexto

Primer swap real de la migración documentada en `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §1.
Hasta v2.9.1, `src/lib/zernio/*` era un módulo aislado sin ningún call-site de negocio conectado. Esta
entrega conecta ese módulo a `whatsapp.service.ts` (el único choke-point de envío de todo el sistema) y
deja lista la escritura del AIOS Constelarys (§11) como funciones `SECURITY DEFINER`, cerrando lo que
`00035_aios_constelarys_role.sql` (v2) había dejado pendiente a propósito.

### Added

- **`supabase/migrations/00036_zernio_provider.sql`** — `tenants` gana `messaging_provider` (default
  `'twilio'`, sin cambiar comportamiento de los tenants actuales), `zernio_profile_id`,
  `zernio_account_id` (índice único parcial, routing de webhooks), `zernio_phone_number`. GRANT SELECT
  de esas 4 columnas a `aios_constelarys` (se suma al de 00035 v2). Tres funciones `SECURITY DEFINER`
  — única vía de escritura del AIOS: `aios_provision_tenant()` (port fiel de
  `scripts/seed-new-tenant.sql`, sin upsert), `aios_activate_whatsapp()`, `aios_set_template_settings()`
  (bloquea sembrar `*_template_sid` en tenants Twilio — el vector de ataque documentado en el propio
  seed).
- **`src/app/api/webhook/zernio/route.ts`** (nuevo) — firma HMAC-SHA256 obligatoria
  (`X-Zernio-Signature`/`X-Late-Signature`), `webhook.test` → 200, `message.received` → resuelve tenant
  por `zernio_account_id`, opt-out/opt-in (mismo criterio que `twilio-incoming`), reenvío a n8n con el
  mismo formato plano `Body`/`From`/`To`/`tenant_slug`; `message.delivered/read/failed` → actualiza
  `message_logs` por `twilio_sid` (primera vez que algo alimenta el status de entrega ahí — Twilio
  nunca tuvo webhook de status conectado).
- **`scripts/zernio-sandbox-test.mjs`** (nuevo, node puro sin imports de `src/`) — prueba manual de
  envío contra el sandbox compartido de Zernio (`+12029087457`), con banner de advertencia de que ese
  número es compartido entre desarrolladores.
- **`docs/features/zernio-messaging.md`** (nuevo) — arquitectura del ruteo por proveedor, contrato con
  el AIOS, invariantes de seguridad, pendientes.

### Changed

- **`src/services/whatsapp.service.ts`** — `sendTemplateMessage()` rutea por
  `tenant.messaging_provider` sin cambiar su firma. Camino Twilio **byte a byte igual** (mismo orden de
  checks: `is_demo` → credenciales → opt-out → envío → reintento 21665). Camino Zernio nuevo
  (`sendViaZernio()`): invariante de seguridad — sin `zernio_account_id`/`zernio_phone_number` NUNCA
  cae al fallback Twilio master, falla con `zernio_not_configured` y no cobra (sin `twilio_sid`).
  `SendTemplateOptions` gana `headerMediaUrl`/`headerMediaType`/`templateLanguage` (solo los usa el
  camino Zernio).
- **`src/services/calendar.service.ts`** — `assertEventTemplateUsable()` provider-aware
  (`listZernioTemplates()` para Zernio, Content API sin cambios para Twilio). El envío del evento pasa
  `options.headerMediaUrl`/`headerMediaType` en vez de la variable `{{6}}` cuando el tenant es Zernio;
  Twilio sigue exactamente igual.
- **`src/types/tenant.types.ts`** — `Tenant` gana `messaging_provider`/`zernio_profile_id`/
  `zernio_account_id`/`zernio_phone_number`. `TenantMessagingContext` (en `whatsapp.service.ts`) gana
  los mismos campos, opcionales.
- **`src/lib/tenant.ts`** — `TENANT_COLUMNS` incluye las 4 columnas nuevas (todos los resolvers de
  tenant las traen automáticamente); nuevo `getTenantByZernioAccountId()` para el webhook.
- **`scripts/validate-env.mjs`** — ya no exige `TWILIO_*` a secas: exige AL MENOS UN proveedor completo
  (Twilio o Zernio); ninguno completo → error explicando ambas opciones; uno parcial → error nombrando
  lo que falta.
- **`.env.example`** — `ZERNIO_*` documentadas como activas (ya no "en evaluación"); nueva
  `ZERNIO_TEMPLATE_LANGUAGE` (opcional, default `'es'`).

### Decisiones tomadas donde la spec dejaba margen

- Orden de checks en `sendTemplateMessage()`: se preservó el orden EXACTO del camino Twilio
  (`is_demo` → config → opt-out → envío) moviendo el opt-out check hacia el branch Zernio en vez de
  hoistearlo por completo, para no alterar por accidente qué error gana cuando dos condiciones
  aplicarían a la vez en un tenant Twilio.
- `assertEventTemplateUsable()` en el camino Zernio es fail-open ante errores de red (mismo criterio
  que el camino Twilio existente), y no valida "media dinámica" (`{{...}}` en la URL) porque esa
  restricción es específica de la Content API de Twilio — Zernio no tiene ese problema (la media viaja
  completa en cada envío, no fija en la plantilla).
- El webhook de Zernio solo reenvía a n8n cuando el remitente es un mesero autorizado
  (`authorized_numbers`), igual que `twilio-incoming` — no se reenvía CUALQUIER mensaje entrante,
  porque el workflow de n8n está diseñado para pedidos de domicilio, no para texto libre de clientes.
- El detector de intención (pedido/horario/ubicación) del webhook de Zernio se dejó solo para logging,
  sin auto-reply real — no existe una función de envío de texto libre vía Zernio en este repo (el
  sistema es "solo plantillas aprobadas" de punta a punta) y crear una estaba fuera del alcance dado.

### Sin poder verificar

- **Envío real de un mensaje vía Zernio de punta a punta** — no hay todavía un tenant real con
  `messaging_provider='zernio'` ni un `zernio_account_id` de un número comprado; `sendViaZernio()` y
  `scripts/zernio-sandbox-test.mjs` están escritos contra el contrato documentado
  (`src/lib/zernio/messaging.ts`, confirmado contra el spec OpenAPI público) pero no probados contra la
  API real en este commit.
- **`Level 2.0/aios-constelarys/docs/zernio-api-contract.md`** se leyó (ya existía, no se modificó —
  regla explícita de no tocar `Level 2.0/`) para confirmar el shape de `account` en los eventos de
  webhook de Zernio; solo está confirmado para `whatsapp.template.status_updated` y eventos de número
  (`{accountId, profileId, ...}`) — el shape exacto para `message.received` no aparece documentado en
  el spec público, así que `extractAccountId()` en el webhook nuevo asume la misma convención con un
  fallback defensivo (`account.id`).
- **npx tsc --noEmit / eslint** no se corrieron en esta sesión (rol de especificación/documentación,
  no de ejecución de build — ver memoria del usuario). Pendiente de que el desarrollador que aplique
  este commit corra la validación de build normal del repo.

### Post-review (7 hallazgos corregidos)

- **F1 (alta, `route.ts`):** `handleDeliveryStatus()` ya no puede degradar un estado más avanzado con un
  webhook fuera de orden — jerarquía `sent < delivered < read`: `read` sin condición, `delivered` con
  `.neq('status','read')`, `failed` con `.not('status','in','(delivered,read)')`.
- **F2 (media, `calendar.service.ts`):** el `errorMessage` fijo `'Twilio error o número no configurado'`
  (falso para tenants Zernio) pasa a un texto neutral de proveedor.
- **F3 (baja, `whatsapp.service.ts`):** `toZernioTemplateParams()` filtra las claves a solo
  `/^\d+$/` antes de calcular el máximo — una clave no numérica ya no produce `NaN` → `[]` silencioso;
  ahora loguea con `console.warn` qué se descartó.
- **F4 (media, `route.ts`):** `handleMessageReceived()` ya no usa `message.sender.id` (BSUID opaco de
  Meta) como fallback de teléfono cuando `phoneNumber` viene null/vacío — corta con log y 200 sin
  opt-out ni forward.
- **F5 (media, `route.ts` + `00036_zernio_provider.sql`):** dedup de webhooks por `event_id` en la
  tabla nueva `webhook_events_seen` (PK `(provider, event_id)`) antes de opt-out/forward — evento
  repetido responde `200 {received:true, duplicate:true}`; fail-open si la tabla no existe (`42P01`).
- **F6 (media, `00036_zernio_provider.sql`):** `aios_set_template_settings()` acepta también
  `event_template_image_sid`/`event_template_video_sid` explícitamente — el regex `_template_sid$` no
  las cubría (terminan en `_image_sid`/`_video_sid`).
- **F7 (baja, `route.ts`):** `POST` revisa `content-length` antes de leer el body — más de 64 KiB
  responde `413 {error:'payload_too_large'}` sin materializarlo en memoria.

---

## [v2.10.1] — 2026-08-29 — docs: reprioridad — Plantillas primero, Campañas segundo

> Request: *"Lo primero que quiero solucionar y ponglo en la lista de § de primerito son las
> plantillas... el apartado de campañas necesito modificarlo también, ese lo dejamos como segundo
> más importante."*

### Contexto

El dueño reprioriza el trabajo pendiente: por encima de las 7 mejoras ya documentadas (§3–§9) y por
delante de seguir puliendo Zernio, van primero **Plantillas** (unificar el catálogo entre tenants +
3 estilos seleccionables — cálido/elegante/urbano — + que editar una plantilla se sienta como editar
para el dueño aunque por debajo el sistema borre y recree) y segundo **Campañas** (sin alcance
definido todavía). Solo documentación — cero código en esta entrada, a pedido explícito.

### Added

- **`docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §12** — requisitos de la unificación de
  plantillas, con un bloque **URGENTE** de 6 preguntas sin responder que bloquean cualquier código en
  ese frente (aprobación pendiente de Meta, si el estilo es por tenant o por plantilla, quién puede
  editar, cómo se redactan los 2 estilos nuevos, si aplica a los tenants Twilio existentes).
- **§13** — placeholder de Campañas, marcado explícitamente sin alcance (a la espera de que el dueño
  lo describa).
- Handoff actualizado: nuevo orden de prioridad (§12 → §13 → §3–§9) y estado real de §1/§10 (ya
  resueltos, con puntero a dónde).

---

## [v2.9.1] — 2026-08-29 — fix: endurecimiento tras code review del WIP (rol AIOS + cliente Zernio)

> Request: *"[antes de commitear el WIP] le paso un code-review con subagentes y te reporto hallazgos."*

### Contexto

Revisión con 3 revisores + verificación adversarial (2 refutadores por hallazgo) sobre todo el
trabajo sin commitear (v2.8.2, v2.8.3, v2.9.0). 6 hallazgos confirmados; los 2 de severidad **alta**
estaban en `supabase/migrations/00035_aios_constelarys_role.sql` (aún sin aplicar en ninguna base,
por eso se corrige el archivo en el sitio en vez de crear una migración correctiva).

### Fixed

- **`00035` (ALTA ×2, reescrita como v2):**
  - El `GRANT SELECT ON tenants` sin lista de columnas dejaba leer
    `twilio_subaccount_auth_token`/`_sid`, `twilio_messaging_service_sid`, `owner_email` y
    `owner_phone` de TODOS los tenants desde el CRM externo → ahora es `GRANT SELECT` **por columnas**
    (id, slug, name, business_type, is_active, is_demo, domain, price_per_message_cop, created_at).
  - Los `GRANT INSERT` + políticas `WITH CHECK (true)` en 4 tablas permitían insertar
    `admin_settings`/`reward_tiers`/`restaurant_locations` apuntando a `tenant_id` de tenants
    EXISTENTES (p. ej. sembrar un `*_template_sid` ajeno y disparar envíos desde el número master) →
    se eliminan los INSERT directos; la escritura pasa a funciones `SECURITY DEFINER` con validación
    interna (`aios_provision_tenant`, `aios_activate_whatsapp`, `aios_set_template_settings`),
    definidas en la migración 00036.
- **`src/lib/zernio/client.ts` (MEDIA ×2):** `zernioFetch()` ahora tiene timeout duro (10 s,
  `AbortController`) y un 2xx con body no-JSON lanza `ZernioApiError` en vez de devolver `null`
  tipado como `T`. También se corrigió el comentario que afirmaba una verificación fechada
  2026-08-30 (fecha futura imposible).

### Conocido y aceptado (sin tocar)

- **BAJA — TOCTOU en `updateEvent()`** (`calendar.service.ts`): dos PATCH concurrentes al mismo
  evento pueden pisarse el `status` recalculado (SELECT previo + UPDATE separado). Probabilidad baja
  (doble clic / dos pestañas); queda anotado para resolver con un UPDATE de una sola sentencia o
  bloqueo optimista cuando se vuelva a tocar el calendario.

### Infra

- `.gitignore`: se ignora `Level 2.0/` (el AIOS Constelarys es un proyecto separado con su propio
  repo/Supabase; la carpeta vive aquí solo como espacio de trabajo).

---

## [v2.9.0] — 2026-08-30 — feat: primer módulo de la migración Twilio → Zernio (aislado, sin conectar todavía)

> Request: *"Vamos a resolver todo lo de la migración a Zernio... necesito que empieces a Desarrollar."*

### Contexto

Primer código real de la migración de mensajería documentada en
`docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §1. Antes de escribir esto se investigó a fondo
`docs.zernio.com` (doc pública + spec OpenAPI) y se hicieron llamadas de solo lectura contra la API
real con la key del dueño, confirmando la forma exacta del request de envío
(`POST /v1/inbox/conversations`), el modelo de cuentas (`Team → Profile → Account`, sin subcuentas
tipo Twilio) y que la firma de webhooks es opcional en Zernio (aquí se exige siempre).

### Added

- **`src/lib/zernio/client.ts`** — cliente base (`zernioFetch`), auth Bearer, `ZernioApiError`.
- **`src/lib/zernio/messaging.ts`** — `sendZernioTemplateMessage()` y `listZernioTemplates()`. Las
  variables de plantilla van como array plano (`templateParams: [...]`), a diferencia del diccionario
  `{'1': ..., '2': ...}` que usa `whatsapp.service.ts` con Twilio — es la diferencia que obliga a
  tocar los ~10 call-sites de negocio cuando se haga el swap real.
- **`src/lib/zernio/webhooks.ts`** — `verifyZernioSignature()` (HMAC-SHA256, `X-Zernio-Signature`,
  comparación en tiempo constante) + tipos del payload (`message.received/delivered/read/failed`,
  `webhook.test`).
- **`ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`** en `.env.example`.
- Fila nueva en la tabla de lookup de `CLAUDE.md` para `src/lib/zernio/*`.

### Explícitamente NO incluido en esta entrega (a propósito)

- **Cero conexión con el resto de la app.** `whatsapp.service.ts` y los ~10 call-sites que lo llaman
  siguen usando Twilio sin ningún cambio — nada del flujo real de negocio pasa por Zernio todavía.
- **No se probó el envío real de un mensaje** (`sendZernioTemplateMessage`) — falta un número de
  destino verificado para probar contra el sandbox de Zernio (`+12029087457`) sin arriesgar mandarle
  un WhatsApp a alguien sin autorización.
- **No se decidió** si los tenants de Cada1 van en la misma cuenta/Team de Zernio del dueño (ya
  compartida con otro proyecto) o en una cuenta aparte — ver la decisión pendiente en
  `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §1.

### Verificado

`npx tsc --noEmit` — 0 errores en los archivos nuevos (el repo ya tenía 157 errores preexistentes sin
relación, no tocados). `npx eslint src/lib/zernio/` — limpio.

---

## [v2.8.3] — 2026-08-21 — fix: el calendario se puede enviar de verdad (callejón sin salida del modo recordatorio)

> Request: *"Anda e inspecciona porque es que el calendario no funciona, arreglalo y dime que plantilla
> debo crear para que empecemos a usarlo, los dueños de negocio necesitan esto ya que es la manera más
> fácil de crear una campaña sin necesidad de crear una plantilla completa."*

### Causa raíz — el camino por defecto no tenía salida

Tercer reporte seguido del mismo síntoma (v2.8.0 y v2.8.1 arreglaron otras piezas). Lo que veía el
dueño del negocio: crea el evento, y no pasa nada, nunca, sin ningún mensaje que lo explique.

`EventCreateDialog` arranca en **"Solo recordarme"** (`send_mode='remind'` → `status='planned'`), y
desde ese estado el evento **no se podía enviar desde ningún punto de la aplicación**: el cron filtra
`auto`+`scheduled`; `POST .../dispatch` devolvía 400 para `remind` y para `planned`; el botón "Enviar
ahora" del drawer ni se renderizaba; y el drawer solo dejaba editar título y descripción, así que
tampoco se podía convertir a auto. Callejón sin salida perfecto.

### Fixed

- **`armEventForDispatch()` en `calendar.service.ts`** — normaliza cualquier evento vivo a
  `send_mode='auto'` + `scheduled_send_at=now()` + `status='scheduled'`, el único estado que
  `executeAutoEvent` acepta. `POST .../events/:id/dispatch` ahora acepta `planned`, `scheduled` y
  `failed`, en modo `auto` o `remind`; solo rechaza `sent` y `cancelled`.
- **`EventDetailDrawer`** — "Enviar ahora" se muestra para **todo evento vivo**, deshabilitado con el
  motivo concreto (falta el flyer / falta `event_template_*_sid`) en vez de esconderse sin explicar.
  Los eventos en modo recordatorio muestran un aviso de que no salen solos.
- **`updateEvent()` realineaba mal el status** — solo cubría "activar auto + fecha en el mismo PATCH".
  Consecuencias reales: pasar de `auto`→`remind` dejaba el evento `scheduled` y **el cron lo enviaba
  igual**; activar `auto` sin fecha lo dejaba `planned` y no salía nunca. Ahora la invariante es
  explícita: `scheduled` ⟺ queda en `auto` **con** fecha; si no, `planned`. `sent`/`cancelled` intactos.
- **Campañas huérfanas** — las validaciones de `media_url` y del path del bucket corrían *después* de
  `createCalendarCampaign`, así que cada dispatch fallido dejaba una fila `campaigns` pendiente
  ensuciando métricas y cap mensual. Ahora validan antes de crear nada.
- **El reintento de variables podía tirar `{{6}}`** — ante un 21665 `sendTemplateMessage` suelta la
  variable de número más alto primero, que en las plantillas de evento es justo el path del flyer:
  habría mandado la plantilla media con la URL sin resolver a toda la audiencia. Nueva opción
  `SendTemplateOptions.keepAllVariables`, activada por el calendario.
- **Path de media plano** (endurecimiento) — `media-upload` generaba `_temp/<uuid>/<ts>_<archivo>.jpg`,
  con barras. Ese valor viaja en `{{6}}` sustituido dentro de una URL ya formada, y el sample que Meta
  aprobó es plano. Ahora genera `<event_id>_<ts>_<archivo>.jpg` para que el primer envío real no
  dependa de si Twilio escapa la barra. Las URLs de eventos viejos siguen resolviendo igual.

### Estado real verificado contra la Content API de Twilio (2026-08-21)

- ✅ **`HXf30219c2b31c3ac1c6eb751d2b4ea689`** (`evento_imagen__sushi_service_barra__v2`) está
  **aprobada** por Meta: `twilio/media`, media `…/event-media/{{6}}` dinámica, sample descargable
  (HTTP 206). **Falta pegarla en Dashboard → Ajustes → `event_template_image_sid`.**
- ⚠️ `HX76a64b…` (v1), `combomundial` y `dia_del_sushi` están approved pero con **media FIJA**: no
  sirven como `event_template_image_sid` (el guard `assertEventTemplateUsable` las rechaza).
- ❌ `evento_video_sushi_service_barra` sigue **rejected** por Meta.
- ❌ La subcuenta de **Don Alirio** (`ACf551…8576`) no tiene **ninguna** plantilla `twilio/media`:
  sus 10 plantillas son `twilio/text`. Para ese tenant hay que crear la de eventos.

### Files

`src/services/calendar.service.ts`, `src/services/whatsapp.service.ts`,
`src/app/api/dashboard/calendar/events/[id]/dispatch/route.ts`,
`src/app/api/dashboard/calendar/media-upload/route.ts`,
`src/components/dashboard/Calendar/EventDetailDrawer.tsx`,
`docs/features/calendar.md`, `docs/API_DOCS.md`.

---

## [v2.8.2] — 2026-08-15 — feat: alta de cliente sin Twilio/WhatsApp en un solo script

> Request: *"Necesito urgente incluir a un nuevo cliente pero ya, este cliente no va a tener
> twilio ni whatsapp aun pero debe acceder a todo lo demás."*

- **Nuevo `scripts/seed-new-tenant.sql`** — alta completa de un tenant parametrizada en un
  solo bloque: fila en `tenants` (twilio_* en NULL), 4 tiers default, `admin_settings` base
  (puntos, check-in, ticket promedio, reactivación) y sede opcional para geolocalización.
  Idempotente. No clona datos de otro tenant.
- **Hallazgo que motivó el diseño:** `getTwilioClient()` cae a las env `TWILIO_*` (cuenta
  master = Sushi Service) cuando el tenant no tiene credenciales propias. Un tenant sin
  Twilio con algún `*_template_sid` cargado enviaría WhatsApp desde el número de Sushi
  Service, cobrado al master y debitado de la billetera del cliente nuevo. El script por eso
  **no siembra ninguna clave `*_template_sid`** (y advierte de no clonar `admin_settings`,
  que es justo lo que hace `seed-demo-tenant.sql` para el demo). Sin plantilla configurada el
  envío se corta antes de llamar a Twilio y no se cobra nada.
- **`docs/04-deployment.md` §6-bis** — procedimiento del cliente sin WhatsApp, qué funciona y
  qué no, y el orden correcto para encender Twilio después (credenciales → billetera →
  plantillas).
- **`config.instagram_url` (nuevo campo de `TenantConfig`)** — contacto alterno para negocios
  que no atienden por WhatsApp. `resolveBranding()` lo expone como `branding.instagramUrl` y
  la página de privacidad usa WhatsApp si existe, si no Instagram, si no remite al
  establecimiento. Antes, un tenant sin WhatsApp no tenía dónde poner su canal de contacto
  (poner el link de Instagram en `whatsapp_link` habría rotulado el enlace como "WhatsApp").
- **Primer cliente con este flujo:** Frangal.mde (`cafe-frangal`), sin Twilio.

Archivos: `scripts/seed-new-tenant.sql` (nuevo), `docs/04-deployment.md`,
`src/types/tenant.types.ts`, `src/lib/branding.ts`, `src/app/(public)/privacidad/page.tsx`.

---

## [v2.8.1] — 2026-08-10 — fix: calendario verificado E2E, redención en hora Bogotá, dispositivos por mesero, plantillas sin fricción

> Request: *"¿Arreglaste el calendario? necesito que funcione correctamente sin ningún problema; revisa
> que el área de redención sirva; he tenido problemas para agregar dispositivos a nombre de meseros;
> me causa fricción la creación de plantillas."*

### Calendario — verificado contra producción (Twilio + Vercel)

- **Diagnóstico real**: la plantilla de imagen aprobada (`evento_imagen_sushi_service_barra`,
  `HX76a64b...`) tenía la **media FIJA** apuntando a `gstatic.com/webp/gallery3/1.png` — sin variable
  `{{6}}`. Todo evento habría enviado la imagen de muestra de Google, jamás el flyer subido. La de
  video estaba **rechazada** por Meta (sample de URL externa inválida). Las plantillas `combomundial`
  y `dia_del_sushi` eran el workaround manual (una plantilla nueva por evento = la fricción reportada).
- **Fix**: creada y enviada a aprobación la plantilla dinámica correcta
  `evento_imagen__sushi_service_barra__v2` = **`HXf30219c2b31c3ac1c6eb751d2b4ea689`** con media
  `<bucket event-media>/{{6}}` y sample real del bucket. **Al aprobarse, pegar ese SID en
  Dashboard → Ajustes → `event_template_image_sid`.** Video: subir un MP4 al bucket y re-ejecutar
  `scripts/twilio-create-media-templates.mjs` (nuevo flag `SKIP_VIDEO=1` usado esta vez).
- **Guard anti-desastre** (`calendar.service.ts` `assertEventTemplateUsable`): antes de cada dispatch
  se verifica contra la Content API que la plantilla sea `twilio/media`, tenga `{{6}}` dinámico y esté
  aprobada. Config mala → evento `failed` con mensaje explícito; nunca más media de muestra a todos.
- **Verificado en producción** (Vercel MCP): n8n dispara `/api/cron/calendar-dispatch` cada 15 min
  exactos con HTTP 200 (proyecto `sushi-service-fidelity-system`). La infraestructura funciona.
- Nota: `.env.local` local está VACÍO (plantilla sin credenciales); `.env.twilio` sí tiene las
  credenciales master usadas para el diagnóstico/creación de plantillas.

### Redención — auditada, 3 fixes de zona horaria

- `getRedemptionSummary.by_hour` usaba la hora del servidor (UTC en Vercel): el análisis de turnos
  salía corrido 5 horas. Ahora convierte a `America/Bogota` (mismo patrón que el heatmap).
- Filtro "Hoy" de `/dashboard/redemptions` usaba fecha UTC: después de las 7pm Colombia apuntaba a
  mañana y la hora pico aparecía vacía. Ahora usa la fecha local del navegador.
- Export CSV "Cuadrar con POS" exportaba timestamps UTC; ahora hora local (`sv-SE`).
- El resto del flujo (anti-doble-entrega por índices únicos, carrera entre meseros → 409 manejado,
  anti-IDOR por tenant, premios pendientes acotados a clientes presentes) se auditó y está correcto.

### Dispositivos a nombre de meseros

- `POST /api/staff/device/register` acepta `assign_staff_phone`: el supervisor sigue autorizando con
  su PIN, pero el dispositivo queda **atribuido al mesero indicado** (device_name = "Dispositivo de
  {mesero}"). En `/mesero` hay checkbox "Asignar a un mesero específico" + campo de celular.
- **Fix de atribución en check-in**: las visitas registradas vía dispositivo de confianza guardaban
  `registered_by_staff_id = NULL` siempre (las dos ramas de auth por `device_token` no leían
  `staff_user_id` del dispositivo). Ahora la visita queda a nombre del dueño del dispositivo.
  `resolveStaffAuth` (redenciones) ya lo hacía bien.

### Plantillas — menos fricción

- `GET /api/dashboard/templates` ahora usa `ContentAndApprovals` (1 llamada en vez de 1+N por
  plantilla — sincronizar era lentísimo) y devuelve `rejection_reason` + `has_media`.
- La UI muestra el **motivo del rechazo** de Meta en las plantillas rechazadas.
- Validación en vivo + server-side de reglas duras de Meta: variable al inicio/fin del cuerpo
  (motivo del rechazo real de `reactivacion_aggresive_new`) y límite de 1024 caracteres. Preview del
  nombre normalizado que se enviará a Meta.
- Los selectores de plantillas de campañas (manuales y burbujas) excluyen las `twilio/media` de
  eventos: enviarlas como campaña fallaría por la variable `{{6}}`.

### Files

`src/services/{calendar,redemption}.service.ts`, `src/app/api/staff/device/register/route.ts`,
`src/app/api/check-in/route.ts`, `src/app/api/dashboard/templates/route.ts`,
`src/app/(public)/mesero/page.tsx`, `src/app/(dashboard)/dashboard/{templates,redemptions,staff}/page.tsx`,
`src/components/dashboard/{ManualCampaigns,AtRiskBubbles}.tsx`, `scripts/twilio-create-media-templates.mjs`

---

## [v2.8.0] — 2026-08-10 — fix+feat: reactivación real desde burbujas, filtro por días y saneo del calendario

> Request: *"las bolitas [de clientes en riesgo] tienen un botón de enviar por WhatsApp inservible [...]
> permitir la capacidad de enviar el mensaje real seleccionando una plantilla; agrega a las campañas
> manuales la forma de filtrar por días sin venir; el calendario no funciona; audita la parte visual y
> funcional y corrige todo lo que puedas sin dañar el flujo productivo."*

### Fixed

- **Burbujas de riesgo enviaban a un endpoint inexistente** (`src/components/dashboard/AtRiskBubbles.tsx`) —
  el botón "WhatsApp →" hacía POST a `/api/dashboard/campaigns/quick`, ruta que nunca existió (404
  silencioso mostrado como éxito). Ahora envía de verdad por `/api/dashboard/campaigns/manual` con el
  rango de días del nivel como filtro, previa selección de una plantilla aprobada.
- **Colores de las burbujas siempre en gris** — el mapa de estilos usaba nombres (`'En Riesgo'`,
  `'Perdidos'`, `'Críticos'`) que no coinciden con los reales de `RISK_LEVELS` (`'Alerta'`, `'En riesgo'`,
  `'Crítico'`, `'Perdido'`). Ahora el estilo se deriva del `color` que ya trae cada grupo.
- **"Ejecutar Ahora" de campañas automáticas devolvía 401 silencioso**
  (`src/app/(dashboard)/dashboard/campaigns/page.tsx`) — hacía POST directo a `/api/cron/*` sin el
  `CRON_SECRET` y mostraba "ejecutada exitosamente" sin verificar la respuesta. Nuevo puente autenticado
  `POST /api/dashboard/campaigns/run-auto` (sesión admin → cron del tenant actual con el secret desde el
  servidor) y el diálogo ahora muestra el resultado real (enviados/fallidos/audiencia) o el error.
- **Calendario: envío programado rechazado por zona horaria** (`src/services/calendar.service.ts`) — la
  validación comparaba contra fin de día UTC, así que programar el envío el mismo día del evento después
  de las 6:59pm (Colombia) fallaba con "scheduled_send_at no puede ser posterior a event_date". Ahora
  compara contra fin de día América/Bogotá (UTC-5).
- **Calendario: eventos auto-envío condenados a fallar** — se podían crear eventos `auto` sin
  imagen/video, que solo reventaban al momento del dispatch (las plantillas de evento son `twilio/media`).
  `EventCreateDialog` ahora lo bloquea con explicación, y `EventDetailDrawer` advierte en eventos
  existentes sin media.
- **Uploader limitaba imágenes a 5 MB** (`MediaUploader.tsx`) cuando el servidor acepta 30 MB y comprime
  automáticamente a JPEG ≤5MB (límite WhatsApp). Límite del cliente alineado a 30 MB + copy actualizado.
- **Estimador de audiencia ignoraba el canal** (`estimate/route.ts`) — el filtro Solo QR / Solo Domicilio
  se aplicaba al enviar pero no al estimar (TODO pendiente); ahora usa el mismo `source_channels`.
- **Campañas manuales contaban opt-outs como "fallidos"** (`manual/route.ts`) — la query ahora excluye
  `whatsapp_opt_out_at` igual que el estimador.
- **Envío manual sin feedback real** (`ManualCampaigns.tsx`) — ignoraba la respuesta (incluido el 409 de
  saldo insuficiente). Ahora muestra enviados/fallidos/protegidos por reglas anti-spam, o el error de saldo.
- Copys desactualizados del calendario ("cuando Meta apruebe...") reemplazados por instrucciones vigentes.

### Added

- **Filtro por días sin venir en campañas manuales** — `minDays`/`maxDays` en
  `estimate/route.ts` + `manual/route.ts` (mín: última visita hace N días o más; máx: hace M días o
  menos; ambos excluyen clientes sin `last_visit_at`). Inputs nuevos en `ManualCampaigns.tsx` + resumen
  en el diálogo de confirmación.
- **Preset "Rescatar Perdidos"** (26+ días, fuera de la zona de recuperación automática) en
  `ManualCampaigns.tsx`.
- **Diálogo de burbujas con datos accionables** — elegibles reales del día (estimador con el rango de
  días del nivel) y desglose post-envío de protegidos por frequency cap / recovery zone / cap mensual.
- **"Ciclo de recuperación del cliente"** en Campañas → Automáticas: strip visual de 5 etapas (Visita →
  Protegido → Ventana manual → Recuperación automática → Rescate) con los días reales de
  `constants/rewards.ts` y los días configurables del tenant.
- **Audiencia estimada en vivo al crear eventos de calendario** (`EventCreateDialog.tsx`), reusando el
  estimador de campañas.
- `POST /api/dashboard/campaigns/run-auto` (`src/app/api/dashboard/campaigns/run-auto/route.ts`).

### Files

`src/components/dashboard/{AtRiskBubbles,ManualCampaigns}.tsx`,
`src/components/dashboard/Calendar/{MediaUploader,EventCreateDialog,EventDetailDrawer}.tsx`,
`src/app/(dashboard)/dashboard/{campaigns,calendar}/page.tsx`,
`src/app/api/dashboard/campaigns/{estimate,manual,run-auto}/route.ts`,
`src/services/calendar.service.ts`

---

## [v2.7.0] — 2026-07-29 — feat: tenant demo para el equipo de ventas

> Request: *"necesito agregar un usuario demo que varios vendedores puedan usar al mismo tiempo sin ser
> capaces de disparar campañas por error a los clientes [...] quiero que tenga los datos de mi cliente
> más antiguo para que vean cómo funciona."*
>
> Feature: `docs/features/demo-tenant.md`

### Added

- **`tenants.is_demo`** (`supabase/migrations/00034_demo_tenant_flag.sql`) — flag boolean, default false.
- **Guard central de envío** (`src/services/whatsapp.service.ts` `sendTemplateMessage()`) — si
  `tenant.is_demo`, nunca llama a Twilio; simula el éxito y registra el mensaje en `message_logs` con
  `twilio_sid=NULL` (no dispara el trigger de débito de billetera). Como es el único embudo de envío de
  todo el sistema, cubre campañas manuales, crons (birthday/reactivation/calendar-dispatch), bienvenida
  QR, mystery box y recordatorios sin tocar cada ruta.
- **`scripts/seed-demo-tenant.sql`** — clona `customers`, `visits`, `reward_tiers`, `campaign_rewards`,
  `restaurant_events`, `admin_settings`, `staff_users`, `authorized_numbers` desde Sushi Service (cliente
  más antiguo) hacia un tenant nuevo `demo-ventas`, con billetera pre-cargada. Idempotente: reutilizable
  como reset (borra lo generado por el uso + lo clonado, y vuelve a clonar).
- `src/types/tenant.types.ts` / `src/lib/tenant.ts` — `is_demo` se propaga automáticamente a toda
  resolución de tenant (`TENANT_COLUMNS`), sin tocar los 14 call-sites de `sendTemplateMessage()`.

### Notas de diseño

- Login único compartido (Supabase Auth soporta sesiones concurrentes) — varios vendedores lo usan a la
  vez sin fricción.
- Datos reales sin anonimizar (decisión del dueño) — no hay riesgo porque nunca sale un mensaje real.
- No confundir con `/demo` (`DemoContext.tsx`, `public/demo-data.json`) — esa es la landing-page teaser
  estática, sin backend real, limitada a Métricas. Este feature es un tenant funcional completo.

---

## [v2.6.0] — 2026-07-15 — feat: billetera prepagada por tenant (débito, corte y recarga manual)

> Request: *"¿Cómo distribuyo ahora el presupuesto? Un cliente me transfirió 50,000 y recargué 100,000 en
> la cuenta matriz, pero ¿cómo la subcuenta se atribuye los 50? ¿Dónde anoto cuando me depositan, cómo
> rastreo cuánto han usado? [...] necesito que cada subcuenta tenga un bloqueo por recarga [...] créame un
> dashboard sencillo donde escoja a los clientes y les asigne la cantidad de dinero."*
>
> Twilio no reparte saldo entre subcuentas (todas consumen del mismo bote matriz), así que la atribución
> del saldo pasa a vivir en nuestra DB. Bloques 1 (débito), 2 (saldo visible + corte) y 3a (recarga
> manual) del spec. Aprobado: débito por trigger, tarifa como columna protegida, tarifa inicial **$100
> COP/msg**, corte mixto, sin cobro retroactivo.
> Spec: `docs/superpowers/specs/2026-07-13-wallet-billing-design.md`
> Feature: `docs/features/wallet-billing.md`

### Added

- **Débito automático por mensaje** (`supabase/migrations/00033_wallet_debits.sql`) — trigger
  `trg_debit_wallet` sobre `message_logs`: cuando un mensaje obtiene `twilio_sid` (Twilio lo aceptó),
  inserta un `debit` negativo en `tenant_wallet_transactions` por `tenants.price_per_message_cop`. Misma
  transacción que el log (no divergen). Idempotente por `UNIQUE (message_log_id)`. No cobra opt-outs,
  fallidos ni avisos `low_balance`. El histórico previo NO se cobra retroactivo.
- **Tarifa y contacto por tenant** (00033) — columnas `price_per_message_cop` (default 100, CHECK > 0),
  `low_balance_threshold_msgs`, `low_balance_notified_at`, `owner_phone`, `owner_email`. La tarifa es
  columna (no `config` jsonb) para que el tenant no pueda editarse su propio precio.
- **`tenant_messages_available()`** (00033) — mensajes disponibles derivados (`saldo ÷ tarifa`), nunca
  almacenados.
- **Corte por saldo en envíos masivos** (`src/services/wallet.service.ts` `canSendBulk` +
  `src/app/api/dashboard/campaigns/manual/route.ts` + `src/services/imported-contacts.service.ts`) — una
  campaña manual o un Golden Bullet sin saldo suficiente responde **409** con el faltante en COP. Los
  transaccionales nunca se bloquean (corte mixto).
- **Panel de billeteras del super-admin** (`/dashboard/admin/wallets` + `SuperAdminWallets.tsx` +
  `GET /api/admin/wallets` + `POST /api/admin/wallet/topup`) — tabla con saldo, mensajes disponibles,
  consumo del mes y última recarga por tenant; diálogo para **asignar saldo manualmente** ("me dieron 50k
  → le asigno 50k"). Idempotente por `UNIQUE (source, external_ref)`.
- **Tarjeta de saldo del tenant** (`WalletCard.tsx` + `GET /api/dashboard/wallet`) — el tenant ve SU saldo
  COP, sus mensajes disponibles y su consumo del mes, con alerta de saldo bajo/negativo.
- **Helpers de super-admin** (`src/lib/admin.ts`) — `isSuperAdmin()` / `requireSuperAdmin()` leen el rol
  del JWT (`app_metadata.role`), el mismo que usa RLS. Link "Billeteras" en el sidebar solo para
  super-admin (layout server-side, sin parpadeo).

### Fixed — security

- **Saldo de la cuenta matriz expuesto a cualquier tenant** (`src/app/api/dashboard/twilio-balance/route.ts`)
  — el endpoint devolvía el balance de la cuenta Twilio **matriz** (inventario del operador) a cualquier
  admin autenticado. Ahora solo el super-admin lo ve; los tenants reciben únicamente las constantes de
  costo (`restricted: true`) y su propio saldo vía `WalletCard`.

### Changed

- **TRM USD→COP centralizada** (`src/constants/wallet.ts`) — estaba hardcodeada (4200) en
  `imported-contacts.service.ts` y `twilio-balance/route.ts`. Ahora es una constante única con override por
  env (`USD_COP_RATE`). Con el modelo prepago la TRM solo afecta el reporte de margen del operador, no al
  tenant.

### Pendiente (documentado en el spec)

- Guard `canSendBulk` en los crons masivos (birthday/reactivation/calendar-dispatch/reward-reminder).
- Bloque 4 (avisos de saldo bajo por WhatsApp) y Bloque 5 (autoservicio con Wompi).

---

## [v2.5.1] — 2026-07-15 — fix: auditoría de código (recall xhigh) sobre los Bloques 1-3

> Request: "Audita todo lo que está por comitear, todos los cambios" → "soluciona todo eso y agrega todo
> a los archivos correspondientes." Revisión multi-ángulo (10 finders + verificación) del diff pendiente
> antes de desplegar. 15 hallazgos; se corrigen los 10 accionables y se documentan 5 decisiones.

### Fixed — correctness

- **Premio de reseña repetible sin límite** (`src/services/review.service.ts`) — `registerReviewClick()`
  no chequeaba `customers.google_review_clicked_at` antes de otorgar. El índice único de la 00031 solo
  bloquea mientras el grant sigue **activo**: una vez redimido o vencido, repetir el POST público
  (`/api/check-in/review-action`) acuñaba un premio nuevo cada vez. Ahora `clicked_at` es el candado
  permanente: si ya fue a Google, se devuelve su premio activo (si existe) sin crear otro.
- **Link vacío no apagaba el pop-up** (`src/services/review.service.ts`) — el gate leía la URL vía
  `resolveBranding()`, que cae al default del entorno (`NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`, el link de la
  cuenta maestra) cuando el tenant tiene el campo vacío. Un tenant que borraba su link seguía mostrando el
  pop-up y mandaba a sus clientes a la ficha de Google de **otro negocio**. Ahora se distingue `undefined`
  (nunca configurado → default de la cuenta maestra) de `''` (vaciado a propósito → pop-up apagado).
- **Premio prometido sin haberse otorgado** (`src/services/review.service.ts` +
  `GoogleReviewModal.tsx`) — ante un `db_error` real, `registerReviewClick()` devolvía igual el
  `rewardTitle` y el modal mostraba "Tu regalo: X" sin un grant que lo respaldara (imposible de redimir).
  Ahora en `db_error` se devuelve `prize_title: null`, y la pantalla de gracias solo promete el premio que
  el servidor **realmente otorgó** (`grantedPrize`, no el teaser). En el caso `duplicate_active` se
  devuelve el premio activo existente **con su `expires_at` real**, no `null` (antes se perdía la cuenta
  regresiva en el reintento).
- **`windowDays: 0` producía un premio permanente** (`src/services/reward-grant.service.ts`) — la
  condición `params.windowDays && params.windowDays > 0` colapsaba `0` con "omitido" → `expires_at: null`
  (no vence nunca). Ahora `null`/`undefined` = no vence; un número (incluido 0) SÍ define ventana (0 o
  negativo = vence de inmediato).
- **Falta de filtro `tenant_id` en la rama de mystery box** (`src/services/redemption.service.ts`) — la
  validación por `mystery_box_result_id` buscaba la fila solo por `id`, a diferencia de la rama de
  `grant_id` justo arriba. Se añade `.eq('tenant_id', tenantId)` para cerrar el hueco de IDOR entre
  tenants de forma consistente.
- **Fecha límite de reactivación en zona horaria equivocada** (`src/app/api/cron/reactivation/route.ts`)
  — `formatDeadline()` usaba `toLocaleDateString` sin `timeZone`; el cron corre en UTC, así que de noche en
  Colombia la fecha del WhatsApp se adelantaba un día respecto al `expires_at` real. Se formatea en
  `America/Bogota` (nueva constante `src/lib/timezone.ts` → `APP_TIMEZONE`).

### Fixed — concurrencia / eficiencia

- **Lost-update al guardar el link de Google** (`src/app/api/dashboard/tenant-config/route.ts` +
  `00032`) — el PUT hacía lectura → merge-en-JS → escritura de `tenants.config` (el jsonb con TODO el
  branding); dos escrituras concurrentes se pisaban. Ahora el merge es **atómico en la base de datos**
  (`config = config || patch`) vía la nueva función `merge_tenant_config(uuid, jsonb)` de la migración
  00032.
- **Carrera en el dedupe de impresiones** (`src/services/review.service.ts` + `00032`) —
  `logReviewShown()` era un check-then-act (SELECT + INSERT, dos idas a la base): dos peticiones casi
  simultáneas inflaban el denominador del funnel. Ahora es **una sola sentencia** (`INSERT ... WHERE NOT
  EXISTS`) vía la función `log_review_shown_deduped(uuid, uuid, int)`: una ida a la base y la ventana de
  carrera reducida a lo que dura la sentencia.
- **Cron de recordatorio secuencial** (`src/app/api/cron/reward-reminder/route.ts`) — enviaba un mensaje
  por candidato con `await` en serie (20-50 premios = 10-25 s). Ahora envía en **lotes paralelos**
  (`BATCH_SIZE=10`, mismo patrón que `campaigns/manual`).

### Fixed — compatibilidad

- **`reward-redeem` volvía a rechazar la entrada manual del mesero** (`src/app/api/reward-redeem/route.ts`)
  — la 00031 empezó a exigir `grant_id` o `mystery_box_result_id`, lo que hacía 400 al shape legacy
  `staff_override` (solo `tier_id` + `prize_title`, sin ancla). Ahora `staff_override` está **exento** del
  requisito de ancla: es un registro de auditoría escrito a mano (p. ej. una integración de POS). El resto
  de orígenes siguen obligados a venir anclados para conservar la protección de doble entrega.

### Changed — reuse / limpieza

- **`percentInt(part, whole)`** (nuevo `src/lib/format/percent.ts`) reemplaza tres copias del helper de
  porcentaje (`review.service`, `reward-grant.service`).
- **`expiryLabel` / `expiryLabelWithDate`** (nuevo `src/lib/format/grant-expiry.ts`) reemplazan tres
  copias del formateador "vence en N días" (`GoogleReviewModal`, `AvailableRewardBanner`,
  `PendingRewardsList`).
- **`NO_GOOGLE_REVIEW_URL`** se exporta desde `src/lib/branding.ts` en vez de repetir el centinela `'#'`.
- **`resolvePhoneRequest()`** (nuevo `src/lib/phone-request.ts`) — tronco común de los endpoints públicos
  identificados por teléfono (validar → rate limit → tenant → cliente). `review-prompt` y `review-action`
  lo comparten; cada uno decide qué HTTP devolver por `reason` (p. ej. `review-prompt` trata al cliente
  desconocido como "no mostrar", no como 404).

### Decisiones (2 hallazgos NO forzados, con motivo)

- **`PointsCalibrator` con `threshold === 0`**: se deja `!threshold`. **La corrección sugerida por el
  auditor era incorrecta**: el motor (`points-engine`) ya retorna vacío para `threshold <= 0` (no se puede
  calibrar a 0 puntos), así que dejar pasar 0 rompería la UI (visitas `undefined`). El estado vacío actual
  es el comportamiento correcto; un tier de umbral 0 no es un escenario real.
- **`review-metrics` re-consulta `reward_grants`**: se deja. "Deduplicar" acoplaría dos endpoints
  independientes que hoy corren en paralelo; la query ya está acotada e indexada (`tenant_id` + `source`).
  No hay forma de mejorarla sin empeorar la arquitectura.

### Verificación

`npx tsc --noEmit` limpio · `npx next build` verde (68 páginas) · `eslint` sin errores nuevos.

### Tarea del dueño

- Las correcciones del lost-update y del dedupe añaden dos funciones a la migración **`00032`**
  (`merge_tenant_config`, `log_review_shown_deduped`). Si ya aplicaste una versión previa de la 00032,
  vuelve a correrla — es idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).

---

## [v2.5.0] — 2026-07-13 — feat: Pop-up de reseñas de Google con premio y tracking (Bloque 3)

> Request: "En el aspecto de reseñas de Google, la gente no las está dejando [...] un pop up otra vez
> como estaba antes, pero diferente, porque antes estaba la x en la esquina y la gente literal a los 2
> segundos que salía lo cerraba instintivamente [...] ahora un pop up que diga algo como 'gánate X por
> dejarnos una reseña en Google', y que haya dos botones: uno de dejar reseña y salen los pasos — 1
> muéstrale al mesero la reseña, 2 redime tu regalo — y al final el botón; y que la recompensa X sea
> variable y definible en los ajustes del dashboard. Y el segundo botón debe ser 'La próxima lo hago'
> para que no se sientan obligados."
>
> Con tres requisitos adicionales: **(R6.a)** "Debemos rastrear quiénes están ingresando en el botón del
> link de Google para analizar efectividad de nuestra estrategia." · **(R6.b)** "Luego de que un cliente
> dejó la reseña y fue al link de Google ya no debe volver a salirle esta ventana, a menos que el cliente
> haya tocado 'La próxima lo hago'." · **(R6.c)** "Luego de dejar reseña y volver a la página debe salir:
> 'gracias por dejarnos tus comentarios, te esperamos de regreso'."

### Contexto — el problema nunca fue el formato, fue que pedir un favor no convierte

Dos intentos previos fracasaron por razones distintas: el modal v1.0 tenía una **X** que la gente cerraba
por reflejo, y la card inline v1.4 dejó de molestar pero también dejó de existir (compite con los puntos y
los tiers, y **no ofrece nada a cambio**). El modal vuelve, pero ahora **ofrece un premio** y no se puede
cerrar por reflejo.

**La decisión que ahorró la mitad del trabajo:** la recompensa por reseña **no necesita infraestructura
nueva**. Reutiliza entero el motor del Bloque 1 — `source: 'review'` ya estaba en el CHECK de la migración
00031. Dejar reseña otorga un `reward_grant` y a partir de ahí todo corre solo: el premio le sale al
cliente en el banner de su tarjeta, le aparece al mesero en `/mesero/rewards`, se entrega con el mismo
botón y cae en las métricas con su atribución de mesa y mesero. **No se tocó la entrega, ni el
vencimiento, ni las métricas.**

### Added

- **`supabase/migrations/00032_review_tracking.sql`** (nueva) — `customers` gana
  `google_review_clicked_at` y `google_review_postponed_at` (la memoria), y se crea `review_events`
  (el funnel). **La memoria va en la DB y no en el navegador** porque el check-in del cliente es
  *stateless* (cero `localStorage`, cero cookies): se identifica solo por teléfono, así que una bandera
  en el navegador se rompería en cuanto abriera su tarjeta desde otro celular.
- **`src/services/review.service.ts`** (nuevo) — el gate (a quién se le muestra), el funnel y la
  delegación del premio a `reward-grant.service`.
- **`src/app/api/check-in/review-prompt/route.ts`** (nuevo) — decide si se muestra el pop-up y sella la
  impresión, **deduplicada a 12h** (recargar la pantalla no debe inflar el denominador del funnel).
- **`src/app/api/check-in/review-action/route.ts`** (nuevo) — `clicked` (sella + otorga el premio) o
  `postponed`. Rate-limited por teléfono.
- **`src/components/features/check-in/GoogleReviewModal.tsx`** (nuevo) — el modal, en cuatro fases:
  oferta → pasos 1/2 → espera → gracias. **Sin X, sin click-fuera, sin Escape.**
- **`src/app/api/dashboard/review-metrics/route.ts`** + **`ReviewFunnelCard.tsx`** (nuevos) — el embudo
  en Dashboard → Redenciones: *se mostró 240 veces → 38 fueron a Google (16%) → 29 reclamaron (76%)*.
- **`src/app/api/dashboard/tenant-config/route.ts`** (nuevo) — **hallazgo 3.8**: el link de Google
  (`tenants.config.google_maps_url`) solo se podía editar por SQL. Ahora tiene UI. Escribe con
  lectura → merge → escritura y **whitelist de claves**: un `UPDATE` directo de `config` borraría el
  branding entero del tenant.

### Changed

- **`src/components/features/check-in/CheckInSuccess.tsx`** — monta el modal y, si el check-in desbloqueó
  un tier, **lo hace esperar** a que el cliente elija su Mystery Box. Taparle la elección del premio con
  una petición de reseña sería cambiar oro por cobre.
- **`src/app/(dashboard)/dashboard/settings/page.tsx`** — sección *Reseñas de Google*: link, recompensa
  (del catálogo `campaign_rewards`) y ventana del premio.

### Removed

- **`src/components/features/check-in/GoogleReviewPopup.tsx`** — **hallazgo 3.6**: código muerto desde
  v1.4.0, cero referencias. Era el modal de la "X".
- **`src/components/features/check-in/GoogleReviewCard.tsx`** — la reemplaza el modal.

### Decisiones que conviene recordar

- **El premio se otorga al tocar el link, sin verificar que la reseña exista.** No es un agujero: el paso 1
  que el cliente lee es *"muéstrale la reseña al mesero"* — **el mesero es el verificador**, igual que con
  cualquier otro premio. Google no expone ninguna API para confirmarlo; cualquier otra cosa sería teatro.
- **La pantalla de gracias se dispara con `visibilitychange`**, cuando el cliente vuelve a la pestaña — no
  al tocar el botón. Decirle "gracias por tu reseña" a alguien que aún no la ha escrito sería mentirle.
- **El CTA final es un `<a target="_blank">` real y el POST no se espera con `await`.** Si abriéramos la
  pestaña con `window.open()` después de un `await`, Safari en iOS lo trataría como pop-up no solicitado y
  lo bloquearía: el cliente tocaría "Ir a Google" y no pasaría nada.
- **El prompt vive en un endpoint propio, no en la respuesta del check-in.** En el flujo real
  (`checkin_mode = staff_verified`) ese POST lo hace el celular **del mesero**; la pantalla del cliente la
  alimenta el polling de `/api/check-in/status`, que corre cada 5 segundos y habría disparado una
  impresión por segundo.
- **Sin premio configurado el pop-up sale igual** (pidiendo el favor). Exigir premio lo apagaría solo si el
  dueño no configura nada — exactamente el problema de fondo del requerimiento.

### Verificación

`npx tsc --noEmit` limpio · `npx next build` verde · `npx eslint` sin errores nuevos (las 4 warnings de
`settings/page.tsx` son preexistentes, de la sección de ubicación "próximamente").

### Tareas del dueño

1. **Aplicar la migración `00032_review_tracking.sql`.**
2. **Pegar el link de Google** en Ajustes → *Reseñas de Google*. **Sin él el pop-up no aparece nunca.**
3. *(Opcional)* **Elegir la recompensa.** Sin ella el pop-up sale, pero sin gancho.

---

## [v2.4.0] — 2026-07-12 — feat: Calibrador de puntos + fix: el shortfall configurable era una configuración fantasma

> Request: "Estoy teniendo muchos problemas para el tema de definición de recompensas, ya que hay
> negocios que quieren cambiar el tema del sistema de puntos [...] estoy con un café y el umbral de
> 150 puntos que se alcanzan en 3 visitas [...] me pidió si esos 150 puntos podíamos alcanzarlos pero
> ya no en 3 sino en 5 visitas [...] ¿dejamos esto así para poder darles el gancho psicológico [...]
> o añadimos una capa extra de personalización?"

### Contexto — no hacía falta una capa de personalización, hacía falta un traductor

La mecánica **ya se autoajusta**: el near-miss de `generateSmartVisitPoints()` es relativo a la
distancia al umbral, no a un número de visitas. Bajando los puntos por visita, el "casi lo logro" se
desplaza solo. Lo que no existía era la **traducción**: el dueño veía seis casillas numéricas sueltas y
ninguna le decía en cuántas visitas cae el premio.

**Hallazgo que invalidaba la receta obvia:** la visita 1 **no otorga puntos de visita**, otorga el
**bono de bienvenida** — `check-in/route.ts` llama a `awardWelcomeBonus()` en el registro, nunca a
`awardVisitPoints()`. Con el default de 75-90 sobre un umbral de 150, **más de la mitad del premio se
regala antes de que el cliente vuelva una sola vez**. Bajar los puntos por visita a 25-35 *dejando el
bono intacto* da el premio en la visita **4**, no en la 5. Por eso el calibrador ajusta el bono junto
con los puntos: si no, promete N visitas y entrega N−1.

**Segundo hallazgo:** la fórmula cerrada (`bono + (N−1) × puntos ≈ umbral`) **falla por una visita**
cuando el cliente aterriza dentro de la banda del shortfall y el algoritmo le inserta un "casi lo logro"
extra. El calibrador por tanto **no despeja: busca**. Barre candidatos, simula cada uno con el algoritmo
real y se queda con el que aterriza el premio exactamente donde se pidió.

### Fixed (hallazgo 3.3 de la auditoría — configuración fantasma)

- **`src/services/points.service.ts`** — `getPointsConfig()` ahora lee `shortfall_min` y `shortfall_max`
  de `admin_settings`. Antes el dashboard los guardaba correctamente y el servicio **los ignoraba**:
  `generateSmartVisitPoints()` usaba siempre las constantes `DEFAULT_POINTS_SHORTFALL_MIN/MAX`. El dueño
  configuraba el "casi lo logro" y no pasaba nada.

### Added

- **`src/lib/points-engine.ts`** (nuevo) — el algoritmo extraído a un módulo **puro, sin I/O**, para que
  el dashboard pueda simularlo en el navegador sin arrastrar el SDK de Supabase al bundle. Expone
  `generateSmartVisitPoints()`, `generateWelcomeBonusPoints()`, `simulateJourney()`,
  `deriveRewardVisit()`, `calibrate()` y `sanitizeConfig()`.
  - **El `rng` inyectable es la pieza clave:** el simulador **no es una copia del algoritmo**, es el
    algoritmo con `rng = () => 0.5` (el "cliente mediano"). La tabla del dashboard no puede
    desincronizarse de producción.
  - `sanitizeConfig()` blinda contra configs corruptas (rangos invertidos, ceros, `NaN`) que llegan de
    una tabla key-value de strings editable a mano.
- **`src/components/dashboard/PointsCalibrator.tsx`** (nuevo) — la perilla: *"¿En cuántas visitas quieres
  que tus clientes se ganen su primer premio?"* + la tabla espejo visita a visita, señalando dónde cae el
  near-miss y dónde el premio. Si la meta no es alcanzable con el umbral actual, muestra el rango posible
  en vez de guardar una promesa falsa.
- **`src/constants/rewards.ts`** — `CALIBRATOR_WELCOME_FACTOR` (1.1 — el bono se mantiene
  proporcionalmente más generoso que una visita, conservando el Endowed Progress Effect a cualquier
  escala), `CALIBRATOR_VISIT_SPREAD`, `CALIBRATOR_WELCOME_SPREAD`, `CALIBRATOR_MIN_VISITS`,
  `CALIBRATOR_MAX_VISITS`, `CALIBRATOR_MAX_SIMULATED_VISITS`.

### Changed

- **`src/app/(dashboard)/dashboard/settings/page.tsx`** — Sistema de Puntos abre con el calibrador. Los
  seis inputs (puntos, bienvenida, shortfall) se pliegan bajo **Ajustes avanzados**, prellenados con lo
  que la perilla decidió y editables a mano — quien los toque ve la tabla recalcularse en vivo. Añadido
  el fetch de `/api/dashboard/reward-tiers` para leer el umbral del primer premio.
- **`src/services/points.service.ts`** — `getPointsConfig()` devuelve un `PointsEngineConfig` completo
  (`visitMin/visitMax/welcomeMin/welcomeMax/shortfallMin/shortfallMax`) en vez de `{min, max,
  welcomeBonusMin, welcomeBonusMax}`. `awardWelcomeBonus()` delega en `generateWelcomeBonusPoints()`.
- **`src/app/api/public/points-range/route.ts`** — adaptado a la nueva forma de `getPointsConfig()`. La
  respuesta pública (`{min, max}`) **no cambia**.

### Sin migración de DB

Las seis keys ya existían en `admin_settings`. No hay endpoints nuevos: el motor es puro y corre en el
navegador, y el umbral sale de `GET /api/dashboard/reward-tiers`, que ya existía.

### Verificación

`npx tsc --noEmit` limpio · `npx next build` verde · `npx eslint` sin errores nuevos. Motor verificado
contra 48 combinaciones de umbral × meta: **si `calibrate()` dice que acierta, la simulación aterriza el
premio exactamente en la visita pedida**. No regresión: con los defaults (60-90 / 75-90 / 5-30, umbral
150) el premio sigue cayendo en la visita 3.

📄 Spec: `docs/superpowers/specs/2026-07-12-points-calibrator-design.md`

---

## [v2.3.0] — 2026-07-11 — feat: Premios Otorgados (reward_grants) + fix: condición de carrera en la redención de premios

> Request: "Necesito que en las campañas de reactivación agresiva pueda yo seleccionar un
> incentivo para el cliente (premio) para que vuelva y sea por tiempo limitado [...] Necesito
> que por favor arregles el aspecto de redención de premios, al parecer no están apareciendo
> los premios redimidos en el dashboard [...] además de poner no sólo la mesa si no la persona
> que entregó el premio"

### Contexto — el bug de redención

Hasta ahora el sistema sabía quién *ganó* un premio (`mystery_box_results`) y qué se *entregó*
(`reward_redemptions`), pero nada en el medio. `RewardAlert` consultaba el premio pendiente
**una sola vez**, en el instante del escaneo del mesero — el momento exacto en que el cliente
**todavía no había elegido** su Mystery Box en su propio celular. La fila de `reward_redemptions`
casi nunca llegaba a crearse, y por eso el dashboard de redenciones salía vacío (con la mesa y
el mesero en blanco, aunque esas columnas ya existían desde v2.0.0). Un segundo hallazgo cerraba
la trampa: `reward_redemptions.tier_id` era `NOT NULL`, así que aunque `source='campaign_reward'`
ya existía en el CHECK, era **literalmente imposible** registrar un premio de campaña (no tiene
tier). `reward_grants` es la pieza que faltaba entre "ganar" y "entregar": un premio que le
PERTENECE a un cliente y queda esperando a que alguien lo reclame, sin ventana de tiempo.

### Fixed (crítico)

- **`src/components/features/staff/RewardAlert.tsx`** — deja de depender de la ventana de 3
  segundos post-escaneo. Ahora lee `active_grants[]` (vía `GET /api/check-in/status`, que hace
  polling cada 3s durante 60s) y registra la entrega contra un `grant_id` real. La garantía ya
  no es esta ventana corta, sino `/mesero/rewards`, donde el premio espera indefinidamente.
- **`supabase/migrations/00031_reward_grants.sql`** — `ALTER TABLE reward_redemptions ALTER
  COLUMN tier_id DROP NOT NULL`. Sin este cambio, un premio de campaña (`source='campaign_reward'`)
  nunca podía insertarse pese a estar permitido por el CHECK existente.

### Added

- **`supabase/migrations/00031_reward_grants.sql`** — tablas `campaign_rewards` (catálogo
  editable de premios de campaña) y `reward_grants` (el premio otorgado: tipo, origen, estado,
  vencimiento opcional). Índices + índice único parcial anti-duplicado
  `(customer_id, source) WHERE status='active' AND grant_type='campaign_prize'` + columna
  `reward_redemptions.grant_id` con su propio índice único parcial anti doble-entrega + trigger
  `mark_grant_redeemed()` + RLS + backfill de los premios ya elegidos y nunca entregados.
- **`src/services/reward-grant.service.ts`** — `grantReward()`, `getActiveGrants()`,
  `getPendingGrantsForPresentCustomers()`, `expireGrants()`, `findGrantsDueForReminder()`,
  `markReminderSent()`, `getGrantMetrics()`.
- **`src/services/campaign-reward.service.ts`** — CRUD del catálogo (`getCampaignRewards`,
  `createCampaignReward`, `updateCampaignReward`, `deactivateCampaignReward`).
- **`src/app/(public)/mesero/rewards/page.tsx`**, **`src/components/features/staff/PendingRewardsList.tsx`**
  y **`src/app/api/staff/pending-rewards/route.ts`** — pantalla **Premios pendientes**: lista los
  `reward_grants` activos de clientes con check-in en las últimas 6h. Es el arreglo real de la
  condición de carrera — el lugar donde el premio espera a que alguien lo entregue.
- **`src/components/features/check-in/AvailableRewardBanner.tsx`** (integrado en
  `CustomerCard.tsx`) — banner "Disponible: X premio — vence en N días" en la tarjeta del cliente,
  con cuenta regresiva para los premios de campaña.
- **`src/app/api/cron/reactivation/route.ts`** — la reactivación agresiva ahora otorga el premio
  del catálogo (`campaign_rewards`) con `expires_at = envío + aggressive_reward_window_days`
  (reloj independiente de los días de reactivación) y agrega `{{5}}` (fecha límite) a la
  plantilla de Twilio.
- **`src/app/api/cron/reward-reminder/route.ts`** (nuevo, disparado por n8n) — barrido de
  premios vencidos (siempre) + recordatorio configurable a quien no ha vuelto, exento del cap de
  frecuencia de 7 días pero sujeto al cap mensual de 3.
- **`src/app/(dashboard)/dashboard/campaign-rewards/page.tsx`** + **`src/app/api/dashboard/campaign-rewards/route.ts`**
  — catálogo de premios de campaña (CRUD, baja lógica).
- **`src/components/dashboard/GrantMetricsCards.tsx`**, **`src/app/api/dashboard/redemptions/summary/route.ts`**
  y **`src/app/(dashboard)/dashboard/redemptions/page.tsx`** — métricas de otorgados/redimidos/
  vencidos/tasa de redención, segmentadas por origen (`by_source`).
- **`src/app/(dashboard)/dashboard/settings/page.tsx`** — configuración del premio de reactivación
  agresiva, ventana en días y recordatorio (`aggressive_reward_id`,
  `aggressive_reward_window_days`, `reward_reminder_enabled`, `reward_reminder_days_before`,
  `reward_reminder_template_sid`). Reemplaza a `reactivation_aggressive_reward_id`, que apuntaba
  a la tabla `rewards` legacy y no tenía UI.

### Changed

- **`src/lib/staff-auth.ts`** (nuevo) — `resolveStaffAuth()` extraído de `check-in` y
  `reward-redeem`, donde vivía duplicado; ahora también lo usa `staff/pending-rewards`.
- **`src/app/api/reward-redeem/route.ts`** — acepta `grant_id` (camino principal); `tier_id` pasa
  a opcional; exige `grant_id` **o** `mystery_box_result_id`; `409 already_redeemed` cuando el
  premio ya fue entregado.
- **`src/app/api/check-in/status/route.ts`** — agrega `active_grants[]` a la respuesta (misma
  llamada de polling que el cliente ya hace cada 5s).
- **`src/app/api/mystery-box/resolve/route.ts`** — otorga el `reward_grant` (`grant_type='tier_prize'`)
  inmediatamente después de resolver el Mystery Box/premio seguro.
- **`src/services/redemption.service.ts`** — `recordRedemption()` acepta `grantId`, valida que el
  grant pertenezca al cliente y siga `active`/no vencido antes de insertar.
- **`src/constants/rewards.ts`** — `MONTHLY_CAP_SOURCES` incluye `reward_reminder`; nuevas
  `DEFAULT_AGGRESSIVE_REWARD_WINDOW_DAYS` (7) y `DEFAULT_REWARD_REMINDER_DAYS_BEFORE` (2).

### Docs

- **`docs/DB_SCHEMA.md`** — tablas `campaign_rewards` y `reward_grants`; `reward_redemptions`
  actualizada (`tier_id` nullable, columna `grant_id` + índice único parcial); `campaigns.source`
  admite `reward_reminder`; migración 00031 en el historial.
- **`docs/API_DOCS.md`** — `GET /api/staff/pending-rewards`, `GET|POST|PATCH|DELETE
  /api/dashboard/campaign-rewards`, `GET|POST /api/cron/reward-reminder` (nuevos);
  `POST /api/reward-redeem`, `GET /api/check-in/status` y `GET|POST /api/cron/reactivation`
  actualizados.

---

## [v2.4.5] — 2026-07-11 — fix: la media de los eventos de calendario nunca era dinámica

> Request: "Twilio permite enviar imágenes variables sin previa aprobación? o sea nuestra plantilla
> de creación de evento en calendario con imagen funciona? porque la creé sola y me cargó una especie
> de imagen de prueba que no tengo idea de dónde salió."

### Contexto — el bug

La plantilla `twilio/media` se creaba con una **URL de media fija** (una imagen de muestra de
`gstatic.com`) y el envío intentaba sustituirla pasando `mediaUrl` al SDK junto con `contentSid`.
Eso **no funciona**: en la API de Mensajes de Twilio, `ContentSid` y `MediaUrl` son **mutuamente
excluyentes** (*"contentSid — required if Body or MediaUrl is not passed"*), así que la media sale
**únicamente** de la definición de la plantilla. Resultado: **todos los clientes habrían recibido la
imagen de muestra**, nunca el flyer del evento. La suposición equivocada estaba escrita como verdad
en `docs/features/calendar.md` ("Twilio usa `mediaUrl` para sobreescribir la URL de ejemplo").

### Fixed

- **`scripts/twilio-create-media-templates.mjs`** — la media ahora es dinámica de verdad. Twilio solo
  admite variables en la URL de media **después del dominio**, así que la plantilla se aprueba con el
  dominio del bucket público como parte fija y `{{6}}` como el **path** del archivo:
  `media: ["<supabase>/storage/v1/object/public/event-media/{{6}}"]`. Además el script **verifica que
  el sample sea públicamente descargable antes de crear nada** (Meta lo descarga para aprobar; si no
  lo alcanza, rechaza la plantilla).
- **`src/services/whatsapp.service.ts`** — se elimina el parámetro `mediaUrl` de `sendTemplateMessage`:
  era inerte con `contentSid` y era el origen del malentendido. De paso desaparece el `as any` del
  payload (Mandamiento IX).
- **`src/services/calendar.service.ts`** — `executeAutoEvent` manda en `{{6}}` el **path dentro del
  bucket** (derivado de `media_url`), no la URL completa. Falla con error explícito si el evento no
  tiene media o si `media_url` apunta fuera del bucket `event-media` — antes habría enviado la imagen
  equivocada en silencio.

### Added

- **`src/lib/twilio/media.ts`** — `EVENT_MEDIA_BUCKET`, `getEventMediaBaseUrl()` y
  `eventMediaPathFromPublicUrl()`: única fuente de verdad de la parte fija de la URL y de la
  derivación del path que viaja en `{{6}}`.

### Changed

- Callers de `sendTemplateMessage` (check-in, delivery webhook, mystery-box, campañas manuales,
  contactos importados, crons de cumpleaños/reactivación) actualizados a la nueva firma. Sin cambio
  de comportamiento: todos pasaban `undefined` en esa posición.
- `docs/features/calendar.md` y `docs/PLANTILLAS.md` — corregida la afirmación falsa sobre `mediaUrl`
  y documentado el patrón real de media dinámica.

### ⚠️ Acción requerida (no es solo código)

Las plantillas ya aprobadas tienen la URL de media **fija**: no se puede editar una plantilla aprobada.
Hay que **recrearlas y volver a pasar por aprobación de Meta (24-72h)**:

1. Subir un archivo de muestra al bucket `event-media` (p.ej. `_samples/sample.jpg` y `_samples/sample.mp4`).
2. Ejecutar `node scripts/twilio-create-media-templates.mjs` (ahora exige `NEXT_PUBLIC_SUPABASE_URL`).
3. Al aprobar, reemplazar `event_template_image_sid` / `event_template_video_sid` en `admin_settings`
   con los SIDs nuevos.

Hasta entonces, los eventos de calendario con imagen **no deben enviarse**: la plantilla vieja manda
la imagen de muestra.

---

## [v2.4.4] — 2026-07-07 — feat: workflow n8n para campañas de calendario (calendar-dispatch)

> Request: "Armalo, ese es urgente" — faltaba el workflow de n8n que dispara
> `/api/cron/calendar-dispatch`. Sin él, las campañas de calendario (eventos auto-programados
> en el dashboard) nunca se enviaban: el endpoint existía pero nadie lo llamaba.

### Added

- **`n8n/cron_calendar-dispatch.json`** — nuevo workflow con el mismo patrón que
  `cron_birthday`/`cron_reactivation` (schedule trigger → HTTP Request con credencial
  `RestaurantQR CRON_SECRET` → log). Diferencia clave: corre **cada 15 min** (`*/15 * * * *`),
  no 1 vez al día, porque `findDueAutoEvents` filtra por `scheduled_send_at <= now` (los eventos
  tienen hora exacta, no solo fecha) — así un evento programado a las 7pm sale cerca de las 7pm
  y no hasta el día siguiente. Un solo workflow dispara TODAS las campañas de calendario de
  TODOS los tenants (multitenant, sin `?tenant=`; `findDueAutoEvents` recorre `restaurant_events`
  con `send_mode=auto` + `status=scheduled`).

### Notas / pendientes

- Falta **importar** el JSON en `https://n8n.almojabananet.me` (el repo no se auto-aplica).
- Para que un evento auto envíe, su tenant necesita `event_template_image_sid` o
  `event_template_video_sid` en `admin_settings`; si no, `executeAutoEvent` no tiene plantilla.

---

## [v2.4.3] — 2026-07-07 — fix: check-in muestra "0 puntos ganados" por carrera del polling (post-multitenant)

> Request: "un cliente me mandó una foto donde dice segunda visita registrada y 0 puntos
> ganados… fue luego de que el mesero escaneó su QR". Auditoría sobre Sushi Service.
> Hallazgo (con evidencia en BD): las 35 visitas `staff_scan` tienen su transacción de
> puntos con valor > 0 — es decir, **los puntos SÍ se guardaron en el saldo del cliente**.
> Lo que falló es lo que vio en pantalla. Causa raíz: **carrera en el polling**. El
> `POST /api/check-in` crea la VISITA (`route.ts:596`) y solo después otorga los puntos
> (actualiza saldo → inserta transacción). El celular del cliente consulta
> `/api/check-in/status` cada 5s; si el poll cae entre "visita creada" y "transacción
> escrita", `status` devolvía `points_awarded: 0` y `hasRecentVisit: true` → el cliente
> saltaba a la pantalla de éxito y **congelaba el "0"** (`CheckInForm.tsx:169-207`, hace
> `return` tras la primera detección). El multitenant ensanchó el hueco al añadir queries
> `.eq('tenant_id')` + RLS entre ambos pasos, por eso empezó a verse "recién".

### Fixed

- **`src/app/api/check-in/status/route.ts`** — `hasRecentVisit` ahora solo se activa cuando
  la transacción de puntos de la visita ya está escrita (`pointsReady`), con un fallback por
  antigüedad de la visita (>8s) para no dejar atrapado al cliente si el sistema de puntos está
  apagado o el insert falló de verdad. Elimina el "0 puntos ganados" prematuro.

### Notas (no incluido en este commit — requiere acción operativa)

- **don-alirio sin sembrar** (detectado en la misma auditoría): el tenant se dio de alta sin
  `reward_tiers` (0) ni `admin_settings` de puntos/plantillas (0). Consecuencia: no entrega
  recompensa/Mystery Box al cruzar un umbral (ej. 150 pts en la 3ª visita) y no envía WhatsApp.
  Los puntos se suman por defaults del código. **Falta seed por-tenant en el onboarding.**
  Ver SQL de seed provisto en la auditoría.

---

## [v2.4.2] — 2026-07-07 — fix: n8n workflows rotos (RESTAURANT_API_URL inexistente + tenant_slug faltante)

> Request: "me dijeron que no está funcionando actualmente" (n8n/crons). Investigando se
> encontraron dos bugs reales en los workflows JSON del repo, no en el código de Vercel:
> (1) `cron_birthday.json`, `cron_reactivation.json` y `domicilios_whatsapp_v4.json` seguían
> apuntando a la variable de n8n `RESTAURANT_API_URL`, que ya no existe — el set compartido
> vigente desde v2.3.0/v2.4.0 es `APP_URL` (`docs/04-deployment.md` §5). Si en n8n solo está
> configurada `APP_URL`, el nodo HTTP Request resuelve una URL vacía y el request falla.
> (2) `domicilios_whatsapp_v4.json` (el workflow activo recomendado) nunca llegó a incluir
> `tenant_slug` en el body que manda a `/api/webhook/delivery` — un pendiente que v2.4.0 ya
> había dejado documentado como "falta un paso manual" pero nunca se hizo en el JSON. Esto
> rompía TODOS los domicilios por WhatsApp con 404 "Tenant no encontrado", no solo los crons.

### Fixed

- **`n8n/domicilios_whatsapp_v4.json`** — nodo "Extraer Remitente y Body" ahora lee
  `tenant_slug` del body entrante (`raw.tenant_slug || raw.body?.tenant_slug`, cubre ambos
  formatos de parseo de n8n); nodo "Parsear Respuesta IA" lo agrega al objeto final; nodo
  "Registrar en RestaurantQR API" lo envía junto con el resto de campos.
- **Se eliminó TODA dependencia de `$env`** en los 3 workflows (antes fallaban porque `$env`
  lee las variables de entorno del **servidor** n8n / docker-compose, que NO son lo mismo que
  "Settings → Variables" de la UI — eso es `$vars`. En producción resolvían vacío → "Invalid
  URL: /api/cron/birthday. URL must start with http"). Nuevo modelo, 100% configurable desde la
  UI de n8n sin tocar docker-compose:
  - **URLs hardcodeadas**: `https://clubsushiservice.constelarys.com/api/...` (no son secretos y
    con multitenant la URL base es idéntica para todos — el tenant se resuelve por `tenant_slug`
    o iterando, no por host). La URL de Supabase también quedó hardcodeada en el nodo de
    validación (endpoint público).
  - **Secretos → n8n Credentials** (almacén encriptado de la UI, referenciados por nombre en el
    JSON, nunca se commitean): `RestaurantQR CRON_SECRET` (Header Auth) para los 2 crons;
    `OpenAI RestaurantQR` (Header Auth) y `RestaurantQR Webhook Delivery` (Header Auth) y
    `Supabase Anon RestaurantQR` (Custom Auth) para domicilios.
- **`n8n/cron_birthday.json`** y **`n8n/cron_reactivation.json`** — el `?tenant=` opcional
  (v2.4.0) sigue intacto — estos workflows no lo usan, así que procesan todos los tenants
  activos en un solo disparo.
- **`docs/04-deployment.md`** §5 (W1) y **`n8n/README.md`** — el aviso de "falta un paso
  manual" para `tenant_slug` se marca resuelto y se corrige el ejemplo de body JSON, que tenía
  campos que nunca existieron en `DeliveryRequestBody` (`phone`/`name`/`city`/`address` en vez
  de `nombre_cliente`/`celular`/`ciudad`/etc.).

### Fixed (follow-up — debug en vivo del flujo de domicilios, misma fecha)

- **Proyecto Supabase equivocado**: el ref cableado era `ijgajxoqmjdveeknabsa` (proyecto DEMO
  "Restaurant Qr"), no `bredfyugmjjctxysnasw` (el real, "Sushi Service FS"). Se coló al
  hardcodear la URL tomándola del `.mcp.json`, que apuntaba al demo. Corregido en
  `n8n/domicilios_whatsapp_v4.json`, `n8n/README.md` y `.mcp.json`. La app en Vercel NO estaba
  afectada (lee el proyecto de sus env vars, no del repo).
- **Nodos de validación de remitente eliminados** de `domicilios_whatsapp_v4.json`
  (`¿Viene de Twilio?`, `Validar Remitente en DB`, `Remitente Autorizado?`, `Responder No
  Autorizado`). Chequeo duplicado y roto: (a) la migración 00026 activó RLS en
  `authorized_numbers` y el rol `anon` ya no puede leerla → la consulta devolvía `[]` y frenaba
  el flujo con "No output data"; (b) `twilio-incoming/route.ts` YA valida al mesero
  (service-role, tenant-scoped) antes de reenviar a n8n, así que sobraba. Flujo nuevo:
  `Extraer Remitente y Body → IA → Parsear → Registrar`.
- **`Parsear Respuesta IA`** ahora lee también `response.text` (además de `.output` y
  `.choices[]`), para soportar el nodo nativo "Basic LLM Chain" de n8n usado en la instancia en
  vivo (devuelve `{ text }`, no `{ choices }`) → mataba el flujo con "La IA no devolvió JSON
  válido" pese a que la extracción era correcta.

### Notas / pendientes

- `n8n/domicilios_whatsapp_v3.json` (legacy, parseo con regex) no se tocó — no está en uso,
  queda como referencia histórica.
- **Estos fixes viven solo en el repo — no se auto-aplican a la instancia n8n en vivo.**
  Falta re-importar los 3 JSON en `https://n8n.almojabananet.me` para que el fix tome efecto.

---

## [v2.4.1] — 2026-07-07 — docs: dos modelos de número Twilio (detectado onboardeando a Don Alirio)

> Request: dar de alta a Don Alirio Café de Origen. Al correr `scripts/twilio-setup.mjs` contra
> su subcuenta, falló con "número no encontrado" pese a tener el número aprobado. Investigando se
> encontró que su cuenta usa el modelo **self-service WhatsApp Senders API** de Twilio (más
> nuevo), donde el número vive en `GET /v2/Channels/Senders` en vez de `IncomingPhoneNumbers` —
> `twilio-setup.mjs` solo soporta el modelo clásico. No requiere Messaging Service:
> `whatsapp.service.ts` ya envía con `from` directo, sin `messagingServiceSid`.

### Docs
- **`docs/04-deployment.md`** §4 — nueva subsección "Dos modelos de aprovisionamiento" con el
  comando `curl` para detectar cuál tiene un cliente nuevo antes de correr el script, y notas en
  "Configurar Messaging Service" / "Alternativa vía API" aclarando que son solo para el modelo
  clásico. Para el modelo Senders API, webhook y opt-out se configuran a mano en Console (los
  pasos de esas dos secciones ya sirven para ambos modelos, sin cambios).

---

## [v2.4.0] — 2026-07-07 — fix: multitenant en n8n/crons (onboarding sin tocar n8n) + opt-out automatizado

> Request: para dar de alta a Don Alirio Café de Origen sin clonar nada, faltaba rediseñar el
> onboarding (env vars, dominio Vercel, workflows n8n, opt-out de WhatsApp por subcuenta Twilio).
> Durante la exploración se detectó que el flujo de domicilios por WhatsApp del mesero estaba
> roto en producción: `/api/webhook/delivery` ya exigía `tenant_slug` (parte de una migración
> multitenant anterior) pero nada lo estaba enviando.

### Fixed
- **`src/app/api/webhook/twilio-incoming/route.ts`** — el reenvío del mensaje del mesero a n8n
  (workflow W1) ahora inyecta `tenant_slug=<slug-del-tenant>` en el body. Antes de este fix,
  toda entrega de domicilios vía WhatsApp devolvía 404 "Tenant no encontrado" en
  `/api/webhook/delivery`. n8n solo necesita reenviar ese campo al armar el body — ver
  `docs/04-deployment.md` §5.

### Changed
- **`src/lib/tenant.ts`** — nuevo `getActiveTenants()` (todos los tenants con `is_active=true`).
- **`src/app/api/cron/birthday/route.ts`** y **`.../cron/reactivation/route.ts`** — `?tenant=`
  pasa a ser opcional. Sin el parámetro, recorren todos los tenants activos en un solo disparo
  (mismo patrón que `calendar-dispatch`, que ya funcionaba así), con `Promise.allSettled` para
  que un tenant con error no tumbe a los demás. Con `?tenant=` se comportan igual que antes
  (100% retrocompatible con lo que ya llama n8n). Efecto: un cliente nuevo empieza a recibir
  birthday/reactivation en cuanto se inserta en `tenants`, sin volver a tocar n8n.
- **`scripts/twilio-setup.mjs`** — agrega `configureOptOutKeywords()`: intenta configurar
  opt-out/opt-in/help vía API de Twilio (`POST /v1/Services/{sid}`) automáticamente al crear el
  Messaging Service de un cliente nuevo; si la API lo rechaza, cae al paso manual (Twilio
  Console) que ya existía como fallback.

### Docs
- **`docs/04-deployment.md`** — reescritura de §2 (env vars: compartidas en Vercel vs.
  por-tenant en la tabla `tenants`), §5 (n8n: variables compartidas, qué se toca una vez), §6
  (onboarding multitenant completo, reemplaza el flujo de clonado), §7 (checklist), §8 (costo de
  implementación bajó de 4-6h a ~2.5-3h), §9 (riesgos).
- **`docs/operaciones/PROCESO_VENTAS_IMPLEMENTACION.md`** — Fase 3 (Setup) y Fase 5
  (Offboarding) reescritas para el flujo multitenant.
- **`docs/API_DOCS.md`** — documentado `tenant_slug` (delivery) y `?tenant=` opcional (crons).
- **`n8n/README.md`** — documentado el campo `tenant_slug` requerido en W1 y las variables de
  n8n ahora compartidas (sin prefijo `[CLIENTE]_`).

---

## [v2.3.0] — 2026-07-06 — feat: branding por-tenant (onboarding de clientes sin clonar)

> Request: para meter al cliente nuevo (Don Alirio Café) al multitenant se necesita que la marca
> (nombre, tagline, reseña Google, WhatsApp, gradientes, label de staff) sea POR TENANT y no una
> variable global de Vercel — de lo contrario todos los restaurantes del deployment compartido
> mostrarían la marca de Sushi Service.

### Added
- **`src/lib/branding.ts`** — reescrito: expone el tipo `Branding`, `DEFAULT_BRANDING` (fallback desde
  las env `NEXT_PUBLIC_BRAND_*`) y `resolveBranding(tenant.config)` que mezcla la config plana del tenant
  (`brand_name`, `staff_role_label`, `google_maps_url`, `whatsapp_link`, `card_bg`, `page_bg`, …) sobre
  los defaults. Un tenant sin un campo → cae al default (idéntico al comportamiento previo).
- **`src/lib/branding-context.tsx`** — `BrandingProvider` + `useBranding()` para componentes cliente.
- **`src/lib/branding-server.ts`** — `getBrandingForHost()` resuelve la marca por dominio (host header),
  memoizado con `cache()` de React (1 sola query por request pese a metadata + layout).

### Changed
- **`src/app/layout.tsx`** — resuelve la marca por dominio e inyecta `BrandingProvider`; `generateMetadata`
  usa el nombre/tagline del tenant. Consecuencia: las páginas pasan a render dinámico (SSR por request),
  necesario para distinguir tenant por dominio.
- **~18 consumidores de marca** migrados de constantes de entorno a `useBranding()` (cliente) o
  `getBrandingForHost()` (server): check-in, tarjeta, wallet, CustomerCard, CheckInSuccess, MysteryBoxResult,
  GoogleReviewCard/Popup, mesero, login, landing, demo, dashboard header/sidebar/qr, y el webhook
  `twilio-incoming` (usa la marca del tenant ya resuelto por número).
- **`src/types/tenant.types.ts`** — `TenantConfig` extendido con `brand_description`, `delivery_phone`,
  `card_bg`, `page_bg`.

### Notas
- Aditivo y seguro para Sushi Service: su `config` ya trae `brand_name`/`staff_role_label`; el resto cae
  al fallback de env → se ve idéntico. Verificado con `tsc` + `next build` en verde.

---

## [v2.2.0] — 2026-07-05 — fix: auditoría de scoping multitenant (docs/superpowers/plans/2026-07-05-multitenant-AUDIT-DELEGABLE.md)

> Request: ejecutar el encargo de auditoría que verifica que CADA query a una tabla con `tenant_id`
> filtre/inserte por el tenant correcto. El 95% del acceso usa `getServiceClient()` (service-role),
> que ignora RLS — sin el filtro explícito en código, un restaurante podía ver/escribir datos de otro.

### Fixed
- **Servicios** (`calendar`, `imported-contacts`, `reward`, `redemption`, `dashboard`, `delivery`) — cada
  función exportada ahora exige `tenantId` (o el objeto `tenant` completo donde se necesitan credenciales
  Twilio) y lo aplica a sus queries. `dashboard.service.ts` era el caso más crítico (15 queries que
  alimentan el dashboard, incluyendo `admin_settings` con PK compuesto `(key, tenant_id)`).
- **Rutas `src/app/api/dashboard/**`** — ~25 rutas resuelven `tenantId` vía `requireTenantId()` (JWT del
  admin) y lo aplican. Varias hacían queries directas a Supabase sin pasar por los servicios (p. ej.
  `settings`, `authorized-numbers`, `staff`, `reward-tiers`, `campaigns/segments`) y no tenían NINGÚN
  filtro de tenant — fuga silenciosa sin error de compilación.
- **Rutas públicas** (`check-in`, `check-in/status`, `(public)/tarjeta`, `public/customer-card`,
  `public/points-range`, `public/reward-tiers`, `mystery-box/resolve`, `reward-redeem`) — resuelven el
  tenant por dominio (`getTenantByDomain(host)`).
- **Webhooks y crons** (`webhook/delivery` por `tenant_slug`, `webhook/twilio-incoming` por el número
  `To` de Twilio, `cron/birthday`/`cron/reactivation` por `?tenant=slug`).
- **Rutas de mesero** (`staff/login`, `staff/me`, `staff/stats`, `staff/device/register`,
  `staff/device/verify`) — resuelven tenant por dominio. **Hallazgo crítico:** `staff_users.phone` dejó
  de ser único global con la migración multitenant; el login por teléfono+PIN ahora filtra también por
  `tenant_id` (antes un mesero de un restaurante podía autenticarse en el dashboard/check-in de otro si
  compartían número).
- `src/app/api/dashboard/calendar/events/[id]/dispatch/route.ts` y `.../[id]/route.ts` (GET) —
  añadida verificación explícita de propiedad (`event.tenant_id === tenantId`) antes de despachar o
  devolver un evento: `getEvent()` es por PK y sin este check un admin podía disparar (y facturar) el
  envío de campaña de OTRO restaurante conociendo el UUID del evento.
- `src/types/database.types.ts` — agregado `tenant_id` a la interfaz `RestaurantEvent` (necesario para
  que `executeAutoEvent` resuelva el tenant del evento).

### Notas / pendientes para revisión (Opus)
- `dashboard/twilio-metrics` y `dashboard/twilio-balance` consultan la API de Twilio con las
  credenciales MAESTRAS (`TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`), no con la subcuenta del tenant — el query
  a `customers` ya quedó filtrado por tenant, pero las métricas/balance en sí reflejan siempre la cuenta
  maestra. Requiere resolver credenciales Twilio por tenant si se quiere métricas realmente aisladas.
- El JWT de mesero (`STAFF_JWT_SECRET`) no lleva `tenant_id` en el payload; la protección actual depende
  de que `staff_users.id` es un UUID globalmente único, por lo que `.eq('id', sub).eq('tenant_id', ...)`
  no puede matchear la fila de otro tenant. Correcto, pero embeber `tenant_id` en el JWT sería defensa
  adicional (falla rápido sin tocar la DB, protege contra un futuro endpoint que olvide el filtro).
- `mystery-box.service.ts` → `getRecentResults(customerId, limit)` no filtra por `tenant_id` (solo
  `customer_id`). Es parte de los servicios "ya hechos" (no tocado), queda para revisión.
- `src/app/api/check-in/route.ts` conserva un bloque de geolocalización comentado (desactivado desde
  v1.0.5-3) que referencia `restaurant_locations`/`admin_settings` sin filtro — si se reactiva, necesita
  `tenant_id`.
- Verificación: `npx tsc --noEmit` sin errores; grep de control sobre las 18 tablas confirma que cada
  `.from(...)` tiene `.eq('tenant_id', ...)` o es acceso por PK `id`.

---

## [v2.1.3] — 2026-07-05 — fix: elimina doble disparo de crons birthday/reactivation (Vercel + n8n)

> Request: el usuario notó que n8n tenía workflows "Cron Birthday" y "Cron Reactivación" publicados
> apuntando a los mismos endpoints que `vercel.json`. Se confirmó el doble disparo diario; el propio
> código lo neutralizaba (`hasRecentCampaignMessage`) sin que el cliente final notara nada, pero se
> decidió dejar un solo disparador (n8n) para simplificar operación y eliminar el riesgo latente de carrera.

### Fixed
- `vercel.json` — `"crons"` vaciado. Antes disparaba `/api/cron/birthday` (0 8 UTC) y
  `/api/cron/reactivation` (0 10 UTC) EN PARALELO con los workflows ya activos de n8n del mismo nombre.
- `docs/04-deployment.md` — Diagrama de arquitectura, sección "Crons en vercel.json" y sección
  "Crons de birthday/reactivation vía n8n" actualizadas: n8n queda documentado como el único
  disparador; se quita la nota "(opcional)" porque ya está en producción, no es hipotético.

### Notas
- No se tocó código de `src/app/api/cron/*` — los endpoints siguen funcionando igual, solo cambia
  quién los llama.
- Pendiente de verificar: la zona horaria real configurada en el Schedule Trigger de cada workflow
  de n8n (puede no ser UTC), para confirmar a qué hora Colombia disparan de verdad.

---

## [v2.1.2] — 2026-07-04 — fix: cierre de hallazgos auditoría 18-Junio (CR-07, CR-03/04, AL-04/05/07/09/10, ME-05)

> Request: solucionar los hallazgos abiertos de la auditoría de código antes de la migración multitenant.

### Fixed
- `src/services/settings.service.ts` — Nuevo `isPointsSystemEnabled()`. Lee `admin_settings.points_system_enabled`, encendido por defecto (solo `'false'` lo apaga).
- `src/services/points.service.ts` — `awardPoints()` respeta el feature flag: si el sistema de puntos está apagado, devuelve balance actual sin otorgar ni registrar transacción. Cierra **CR-07/CR-02** (el toggle "Sistema de Puntos" de Ajustes ahora sí funciona; antes era decorativo).
- `src/app/api/check-in/status/route.ts` — Rate-limit **por teléfono** (40/min) anti-enumeración. El polling del cliente (~12/min) no se ve afectado; no se usa IP para no romper WiFi del local / NAT móvil. Cierra **ME-05/AL-08**.
- `src/app/api/webhook/delivery/route.ts` — `sendDeliveryTemplate` ahora pasa `logContext` (customerId + messageType). Los WhatsApp de domicilio (welcome/tier/puntos) quedan trazados en `message_logs`. Cierra **CR-03**.
- `src/app/api/cron/birthday/route.ts`, `src/app/api/cron/reactivation/route.ts` — `sendTemplateMessage` con `logContext` (`birthday` / `reactivation`). Cierra **CR-04**.
- `src/services/calendar.service.ts` — `executeAutoEvent` pasa `logContext` (`calendar_event`) al enviar. Cierra el remanente de **CR-01**.
- `src/app/api/dashboard/campaigns/manual/route.ts` — Envío manual con `logContext` (`manual`).

### Changed
- `src/services/campaign.service.ts` — `findBirthdayCustomers` y `findInactiveCustomers` excluyen `whatsapp_opt_out_at IS NOT NULL`. Cierra **AL-07**.
- `src/services/calendar.service.ts` — `findCustomersForEvent` excluye opt-out. Cierra **AL-04/AL-10**.
- `src/app/api/dashboard/campaigns/estimate/route.ts` — Estimador de audiencia excluye opt-out (número más fiel al real). Cierra **AL-05/AL-09**.

### Notas
- **Firma Twilio:** verificada — `validateTwilioSignature` (HMAC-SHA1) ya protege `webhook/twilio-incoming`. El webhook de domicilios usa `WEBHOOK_DELIVERY_SECRET` (n8n), diseño correcto. Sin cambios.
- **Pendiente (se agrupa con la migración multitenant):** race condition de `awardPoints` (AL-01) vía RPC atómica; atomicidad de Mystery Box (AL-02); rate-limiter a Redis (AL-03).

---

## [v2.1.1] — 2026-06-25 — fix: bugs wallet card + rate-limit SSR + centralizar gradientes

> Request: corregir bugs detectados en code review de la rama 2.0-qrs-feature antes de merge a main.

### Fixed
- `src/app/(public)/tarjeta/page.tsx` — Rate-limit aplicado al Server Component (30 req/min/IP usando `rateLimit()` + `headers()` de next/headers). Antes el límite solo existía en el API JSON pero no en el path SSR.
- `src/components/features/wallet/WalletCard.tsx` — `remaining` protegido con `Math.max(..., 0)` para evitar puntos negativos si hay inconsistencia de datos.
- `src/components/features/check-in/CustomerCard.tsx` — Overlay dopamina solo se muestra cuando `justEarnedPoints > 0` (antes se activaba con 0, mostrando "+0 puntos ¡Listo!").
- `src/components/features/wallet/StampsGrid.tsx` — `cycleNumber` corregido: `floor((totalVisits - 1) / 10) + 1`. Antes con 10 visitas exactas mostraba "Tarjeta #2" en lugar de "Tarjeta #1".

### Changed
- `src/lib/branding.ts` — Agregadas `BRAND_CARD_BG` y `BRAND_PAGE_BG` como fuente única de los gradientes de la tarjeta wallet.
- `src/components/features/wallet/WalletCard.tsx` — Usa `BRAND_CARD_BG`/`BRAND_PAGE_BG` desde branding (eliminadas constantes locales duplicadas).
- `src/components/features/check-in/CustomerCard.tsx` — Usa `BRAND_CARD_BG`/`BRAND_PAGE_BG` desde branding (eliminadas constantes locales duplicadas).
- `src/app/(public)/tarjeta/page.tsx` — Usa `BRAND_CARD_BG` desde branding (eliminado `WALLET_BG` local con stop position inconsistente).

### Docs
- `docs/features/wallet-card.md` — StampsGrid: fórmula actualizada a visits-based (1 visita = 1 sello), ejemplos de ciclos, cycleNumber correcto documentado.
- `docs/03-security.md` — `/tarjeta` agregada a rutas públicas + sección Rate Limiting con los 3 endpoints y su mecanismo.
- `docs/API_DOCS.md` — Sección completa `GET /api/public/customer-card`: query params, responses (200/400/429/500), rate limit.

---

## [v2.1.0] — 2026-06-18 — feat: rediseño wallet card + tarjeta digital permanente

> Request: transformar la experiencia del cliente de un formulario web a una tarjeta de fidelización estilo Apple/Google Wallet con sellos visuales y ruta permanente.

### Added
- `src/components/features/wallet/StampsGrid.tsx` — Grid 5×2 de sellos circulares. Fórmula: `ptsPerStamp = nextTier.threshold / 10`, `filledStamps = floor(totalPoints / ptsPerStamp)`. Animación `stamp-pop` con delay escalonado por sello.
- `src/components/features/wallet/WalletCard.tsx` — Tarjeta wallet visual pura para vista `/tarjeta` (sin QR). Muestra nombre, puntos grandes, stamps, roadmap de tiers, CTA al check-in.
- `src/components/features/wallet/index.ts` — Barrel export del módulo wallet.
- `src/app/(public)/tarjeta/page.tsx` — Ruta permanente `/tarjeta?phone=XXXX`. Server Component que llama directamente a servicios Supabase (sin auth, datos públicos). Muestra formulario si no hay phone en URL.
- `src/app/api/public/customer-card/route.ts` — `GET /api/public/customer-card?phone=XXX`. Rate-limited (30 req/min/IP). Retorna `{ found, customer, tiers, next_tier }`.
- `docs/features/wallet-card.md` — Feature doc completo con decisiones de diseño, fórmulas, seguridad y limitaciones.
- `docs/superpowers/plans/2026-06-18-wallet-card.md` — Plan de implementación paso a paso.
- `src/app/globals.css` — Keyframe `stamp-pop` + utility `animate-stamp-pop`.

### Changed
- `src/components/features/check-in/CustomerCard.tsx` — Rediseño completo:
  - ❌ Eliminado: `premium-card` blanca flotante, `TiersRoadmap`, barra de progreso numérica
  - ✅ Nuevo: overlay full-screen `fixed inset-0 z-50` con gradient rojo brand (`#7B0D1E → #FF6B6B`)
  - ✅ Nuevo: `StampsGrid` bajo los puntos
  - ✅ Nuevo: banner de acción con `backdrop-blur` (glass effect)
  - ✅ Nuevo: QR sobre card blanca autónoma (sin border pulsante rojo)
  - Dopamina overlay actualizado a `z-[60]` para quedar sobre el wallet

---

## [DOCS] — 2026-07-12 — docs: auditoria completa de código backend (servicios + API + DB)

> Request: auditoria exhaustiva del backend para identificar bugs, race conditions, inconsistencias de seguridad y deuda técnica antes del próximo ciclo de desarrollo.

### Added
- `docs/AUDIT-12-Julio/AUDIT_CODIGO_COMPLETO.md` — Documento maestro con:
  - 2 hallazgos CRÍTICOS (`executeAutoEvent` ignora media_url + no loguea; `points_system_enabled` no se respeta).
  - 5 hallazgos ALTO (race conditions en puntos/mystery box, rate-limiter inefectivo en serverless, filtros de opt-out faltantes).
  - 8 hallazgos MEDIO (feature flags, observabilidad, enumeración de clientes, caps hardcodeados).
  - 3 hallazgos BAJO (zonas horarias, validaciones estrictas, content-type XML).
  - Roadmap de fixes priorizado: inmediato → corto plazo → mediano plazo.

---

## [DOCS] — 2026-06-17 — docs: auditoria completa de ventas, competencia y actualización de pricing

> Request: auditura como dueño de negocio, analizar competencia directa, definir prioridades y actualizar precios a modelo único antes de invertir en pauta publicitaria.

### Added
- `docs/AUDITORIA_VENTAS_COMPETENCIA_JUNIO_2026.md` — Documento maestro con:
  - Estado actual de marca (crisis de identidad RestaurantQR/Constelarys/Cada1).
  - Auditoria de Instagram (@cada_1_: 3 publicaciones, 2 seguidores, link caído).
  - Auditoria de landing page (diseño excelente pero precio desactualizado, sin demo QR, sin sección "Sin apps").
  - Análisis competitivo detallado de 4 rivales: Clubify, TrackingTable, Loyalz Club, Dardo.
  - Matriz comparativa 8×5 con ventajas y debilidades.
  - 4 diferenciadores inimitables de Cada1.
  - Plan de acción en 4 fases (Fundamentos → Instagram → Material de ventas → Autoridad → Pauta).
  - Checklist "Listo para pauta" con 13 items bloqueantes.
  - Mensaje de ventas recomendado con headlines y sección de diferenciadores.

### Changed
- `CONTEXTO_PAGINA_WEB.md` — pricing actualizado de 3 planes ($89K/$149K/$249K) a modelo único: setup $1.200.000 + mensualidad $250.000.
- `docs/operaciones/PROCESO_VENTAS_IMPLEMENTACION.md` — precio de cierre actualizado a $250K/mes + $1.2M setup.
- Tabla comparativa de diferenciadores en `CONTEXTO_PAGINA_WEB.md` — fila "Sin app" fusionada con "Sin Wallet" para enfatizar ventaja sobre Clubify/Loyalz/Dardo.

### Decisiones de negocio documentadas
- Nombre comercial unificado: **Cada1**. `RestaurantQR` y `Constelarys` quedan como técnicos/internos.
- Precio único sin planes: setup $1.200.000 COP + $250.000 COP/mes. Margen operativo alto (costo real ~$8-20 USD/mes por cliente).
- No invertir en pauta hasta completar Fase 0 (5 items bloqueantes) + Fase 1 (Instagram mínimo viable).
- Diferenciador principal a comunicar: **"Sin app, sin wallet, sin depender de Apple ni Google"** — ninguna competencia lo dice.

---

## [2.1.0] — 2026-06-17 — feat: activación del auto-envío del calendario (scheduler n8n + dispatch manual)

> Request: resolver los bloqueantes del calendario de eventos — el cron `calendar-dispatch` nunca corría, la UI mostraba un mensaje obsoleto ("el path de envío no está cableado"), no había forma de disparar/reintentar un evento manualmente, y no se advertía si faltaban las plantillas Twilio. Decisión: disparar el cron desde n8n self-hosted (no Vercel) para no pagar plan Pro.

### Fixed
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx` — eliminado el mensaje obsoleto "El path de envío todavía no está cableado…"; ahora explica que el envío es automático y ofrece envío manual.
- `src/app/api/dashboard/calendar/events/[id]/route.ts` — corregido comentario obsoleto del PATCH que afirmaba que el envío inmediato no estaba disponible.

### Added
- `src/app/api/dashboard/calendar/events/[id]/dispatch/route.ts` — endpoint POST (auth admin) para disparar manualmente el auto-envío de un evento. Acepta status `scheduled` (envío anticipado) y `failed` (reintento, rearmando a `scheduled` antes de ejecutar `executeAutoEvent`).
- `EventDetailDrawer` — botón "Enviar ahora" / "Reintentar envío" para eventos auto en estado `scheduled`/`failed`, con resumen de resultado (enviados/fallidos/excluidos por cap).
- `EventDetailDrawer` — alerta proactiva cuando falta la plantilla Twilio requerida (`event_template_image_sid` / `event_template_video_sid` según `media_type`), leída desde `/api/dashboard/settings`.

### Infra
- El auto-envío del calendario se dispara desde **n8n self-hosted** (Schedule cada 15 min → HTTP POST a `/api/cron/calendar-dispatch` con `Authorization: Bearer CRON_SECRET`). NO se agregó a `vercel.json` a propósito: `*/15` + ser el 3er cron exigiría plan Vercel Pro. `birthday` y `reactivation` siguen en Vercel cron (2 crons diarios → caben en Hobby).
- Requiere `CRON_SECRET` configurado igual en Vercel (prod) y en la credencial Header Auth de n8n.

### Notes
- El envío real con media sigue dependiendo de que Meta apruebe las plantillas `twilio/media`.

---

## [DOCS] — 2026-06-17 — docs: consolidación de documentación de infraestructura en un solo doc central

> Request: purgar y unificar todos los archivos de implementación/despliegue en un único doc central organizado por plataforma (Vercel, Supabase, Twilio, n8n).

### Added
- `docs/04-deployment.md` — doc central único que reemplaza los 4 archivos archivados. Secciones: arquitectura, Vercel (env vars, crons), Supabase (23 migraciones), Twilio (números, Messaging Service, webhooks, opt-out API), n8n (W1 delivery, W2 calendar-dispatch con JSON importable, W3 google-contacts-sync), onboarding paso a paso, checklist, costos y riesgos.

### Removed (archivados en `docs/archive/`)
- `docs/INFRAESTRUCTURA.md` → `docs/archive/INFRAESTRUCTURA-obsolete.md`
- `docs/DEPLOYMENT_GUIDE.md` → `docs/archive/DEPLOYMENT_GUIDE-obsolete.md`
- `docs/CONFIGURACIONES_TWILIO_SISTEMA.md` → `docs/archive/CONFIGURACIONES_TWILIO_SISTEMA-obsolete.md`
- `docs/n8n-workflows/README.md` → `docs/archive/n8n-workflows-README-obsolete.md`

### Changed
- `docs/features/calendar.md` — scheduler actualizado a n8n self-hosted; endpoint dispatch añadido.
- `docs/API_DOCS.md` — añadido `POST .../dispatch`, sección "Cron: Calendar Dispatch".
- `docs/SKILLS.md` — sección "Infraestructura externa" con n8n self-hosted.
- `CLAUDE.md` — lookup table: `src/lib/twilio/*` y `scripts/twilio-setup.mjs` apuntan a `docs/04-deployment.md` (antes apuntaban al doc archivado).
- `.windsurfrules` — mismas correcciones de lookup + entrada nueva para `scripts/twilio-setup.mjs`.
- `METODO_AINNOVATE.md` — nuevo registro en "Historial de Aplicación".

---

## [DOCS] — 2026-06-15 — docs: documento recopilatorio para presentación al cliente (Sushi Service)

> Request: recopilar toda la información del proyecto para que otra IA arme un documento/PDF de presentación al cliente, incluyendo lo logrado en 2 semanas, cómo funciona, características principales y transformación del negocio.

### Added
- `docs/PRESENTACION_CLIENTE_SushiService.md` — Documento recopilatorio completo con:
  - Métricas reales del sistema en producción (193 clientes, 7 visitas hoy, ROI $272.000 COP).
  - Timeline de versiones v1.0.0 a v2.0.0 (hitos en ~2 semanas).
  - Flujo del ecosistema (cliente presencial, domicilio, dashboard admin).
  - Características principales: campañas automáticas, sistema de puntos + Mystery Box, verificación QR por mesero, campañas masivas, control total de clientes, métricas en tiempo real.
  - Sección de transformación del negocio (antes vs. después).
  - Stack técnico y datos clave para la presentación.

### Notes
- Sin cambios de código del sistema. Solo documentación recopilatoria para uso comercial/presentación.

---

## [2.0.0] — 2026-06-12 — feat: tracking de redención física de premios + Golden Bullet (importación masiva)

> Request: desarrollar el requerimiento `docs/features/REQUIREMENT_AUDIT_redemptions_bulk_import.md` — (A) trazabilidad de la entrega física de premios para cuadrar con el POS, y (B) importación masiva de contactos externos con envío de un solo disparo, bloqueo anti-reenvío y ROI automático.

### Added — Feature A: Redención física de premios
- `supabase/migrations/00022_reward_redemptions.sql` — tabla `reward_redemptions` (cliente, premio, mesero, mesa, ref. POS, origen) + índices + RLS + índice único anti-duplicado por `mystery_box_result_id` + trigger `mark_mystery_box_redeemed`. Añade `redeemed`/`redeemed_at` a `mystery_box_results`.
- `src/services/redemption.service.ts` — `recordRedemption()`, `getRedemptions()`, `getRedemptionSummary()`, `getPendingReward()`/`hasPendingReward()`, `getCustomerRedemptions()`.
- `src/app/api/reward-redeem/route.ts` — POST staff (Bearer JWT / X-Device-Token) para registrar la entrega física.
- `src/app/api/dashboard/redemptions/route.ts` + `/summary/route.ts` — listado con filtros y resumen agrupado (por premio/hora/mesero) para cuadrar con POS.
- `src/app/(dashboard)/dashboard/redemptions/page.tsx`, `src/components/dashboard/RedemptionsTable.tsx`, `RedemptionSummaryCards.tsx` — dashboard con filtros de fecha, heatmap de turnos y export CSV.
- `src/components/features/staff/RewardAlert.tsx` — alerta "Cliente tiene premio pendiente" + botón "Registrar Entrega" en la pantalla del mesero (integrada en `/mesero/confirm`).

### Added — Feature B: Golden Bullet (importación masiva)
- `supabase/migrations/00023_imported_contacts.sql` — tabla `imported_contacts` (separada de `customers`) + columna `customers.imported_contact_id` para trazabilidad + RLS + seed feature flag `golden_bullet_enabled` y `twilio_cost_per_message_usd`.
- `src/services/imported-contacts.service.ts` — `validateCSV()` (sin insertar), `confirmImport()` (envío en batches de 10), `listBatches()`, `getBatchStats()`, `getBatchRoi()`, `markConverted()`, bloqueo anti-reenvío vía `getExistingPhones()`.
- `src/app/api/dashboard/imported-contacts/{validate,confirm,stats,roi}/route.ts` + `route.ts` — validar CSV, confirmar/enviar, listar lotes, estadísticas y ROI por lote (todos Admin Cookie + feature flag en los mutantes).
- `src/app/(dashboard)/dashboard/imported-contacts/page.tsx` + `ImportedContactsUploader.tsx`, `ImportedContactsCostEstimator.tsx`, `ImportedContactsHistory.tsx` — wizard de 5 pasos (subir → validar → costo → plantilla → confirmar) e historial con ROI.
- `public/plantilla_golden_bullet.csv` — plantilla descargable.

### Changed
- `src/app/api/check-in/status/route.ts` — añade `pending_reward` y `customer.id` a la respuesta para alimentar la alerta del mesero.
- `src/app/api/check-in/route.ts` — en `action:'register'`, detecta si el teléfono provino de un contacto importado y lo marca como `converted`, guardando `customers.imported_contact_id` (activa el ROI).
- `src/app/api/mystery-box/resolve/route.ts` + `src/services/mystery-box.service.ts` — el resultado incluye `result_id`/`resultId` para vincular la redención física.
- `src/components/layout/DashboardSidebar.tsx` — nuevos ítems "Redenciones" y "Golden Bullet".
- `src/types/database.types.ts` — interfaces `RewardRedemption`, `ImportedContact`, campos `redeemed`/`redeemed_at` en `MysteryBoxResult`, `imported_contact_id` en `Customer`, entradas en `Database['public']['Tables']`.

### Fixed
- Las migraciones 00022/00023 originales usaban `CREATE POLICY IF NOT EXISTS` (sintaxis NO soportada por Postgres) → reescritas con patrón `DROP POLICY IF EXISTS` + `CREATE POLICY`. La 00023 referenciaba `imported_contacts` en una FK de `customers` antes de crear la tabla → reordenado.

### Docs
- `docs/features/redemption-tracking.md` y `docs/features/golden-bullet.md` — nuevos documentos de feature.
- `docs/DB_SCHEMA.md` — tablas `reward_redemptions`, `imported_contacts`, columnas nuevas, migraciones 00022/00023.
- `docs/API_DOCS.md` — nuevos endpoints documentados.

### Notes
- **Acción manual:** ejecutar las migraciones `00022` y `00023` en Supabase.
- **Feature flag:** Golden Bullet viene **desactivado** (`golden_bullet_enabled='false'`); actívalo en `admin_settings` para usarlo.
- La plantilla de Golden Bullet debe ser `MARKETING` aprobada por Meta y SIN link de registro.

---

## [1.8.0] — 2026-06-12 — feat: opt-out persistente de WhatsApp (resuelve auditoría 12-Julio, tarea 8)

> Request: resolver la primera tarea pendiente prioritaria (opt-out persistente) y registrar el resto del pendiente. El sistema detectaba opt-outs pero no los bloqueaba: seguía enviando a quien respondió SALIR, generando errores 21610/63016.

### Added
- `supabase/migrations/00021_customer_whatsapp_opt_out.sql` — columna `customers.whatsapp_opt_out_at` (timestamptz, nullable) + índice parcial `WHERE whatsapp_opt_out_at IS NOT NULL`.
- `src/services/customer.service.ts` — `setWhatsappOptOut(phone)`, `clearWhatsappOptOut(phone)`, `isPhoneOptedOut(phone)`. Todas best-effort (no rompen el flujo; `isPhoneOptedOut` devuelve `false` ante error de DB para no bloquear envíos legítimos).

### Changed
- `src/app/api/webhook/twilio-incoming/route.ts` — al recibir un keyword de **opt-out** (SALIR/STOP/BAJA/CANCELAR/FUERA…) persiste `whatsapp_opt_out_at = now()` y `accepts_marketing = false`; un keyword de **opt-in** (ALTA/START/ACEPTO…) limpia el opt-out y reactiva marketing. Antes solo devolvía 200 sin tocar la base de datos.
- `src/services/whatsapp.service.ts` — `sendTemplateMessage` verifica `isPhoneOptedOut(phone)` **antes de enviar**; si el cliente está en opt-out, omite el envío (no gasta el mensaje ni genera 21610) y lo registra en `message_logs` con `error_code='opted_out_local'`.
- `src/types/database.types.ts` — `whatsapp_opt_out_at` en `Customer` + `Insert`.

### Docs
- `docs/DB_SCHEMA.md` — columna en `customers`, índice y migración 00021.
- `docs/features/twilio-opt-out.md` — sección "Opt-out persistente (v1.8.0)".
- `docs/AUDIT-12-Julio/RESOLUCION.md` — tarea 8 marcada como resuelta; pendiente reordenado por valor neto (tareas 6-7 marcadas como cubiertas por el panel `twilio-metrics`).

### Notes
- **Acción manual:** ejecutar las migraciones `00020` y `00021` en Supabase.
- El opt-out bloquea **todos** los envíos (transaccionales y campañas), coherente con el bloqueo a nivel de cuenta de Twilio. Los premios siguen siendo reclamables vía el fallback visual de la UI (v1.7.0).

---

## [1.7.0] — 2026-06-12 — feat: tracking de mensajes WhatsApp + fallback visible en Mystery Box (resuelve auditoría 12-Julio, bloque 1-4)

> Request: resolver el bloque de tareas 1–4 de la auditoría 12-Julio — el caso del cliente que gana un premio en Mystery Box y nunca recibe el WhatsApp de confirmación, sin que nadie se entere del fallo.

### Added
- `supabase/migrations/00020_message_logs.sql` — **nueva tabla `message_logs`** que persiste TODOS los mensajes WhatsApp (transaccionales y de campaña): `customer_id`, `phone`, `message_type`, `template_sid`, `variables`, `status` (pending/sent/delivered/failed/undelivered), `twilio_sid`, `error_code`, `error_message`, `sent_at`, `delivered_at`. Incluye índices y RLS (admin lee, service inserta/actualiza). La columna `delivered_at` queda lista para el futuro webhook de status callback. _(Tarea 3)_
- `src/services/message-log.service.ts` — servicio `recordMessageLog()` best-effort (un fallo de escritura nunca rompe el envío). _(Tarea 4)_
- `src/types/database.types.ts` — interfaz `MessageLog`, tipos `MessageLogStatus`/`MessageLogType` y entrada `message_logs` en `Database`.

### Fixed
- `src/app/api/mystery-box/resolve/route.ts` — **eliminado el `.catch()` silencioso** que ocultaba los fallos de WhatsApp y respondía `ok:true` aunque el cliente no recibiera nada (causa principal del caso reportado). Ahora el envío se captura y la respuesta incluye `whatsapp_sent: boolean` y `whatsapp_reason`. _(Tarea 1)_

### Changed
- `src/services/whatsapp.service.ts` — `sendTemplateMessage` acepta un `logContext` opcional (`{ customerId, messageType }`) y persiste cada intento en `message_logs` con su estado y código de error de Twilio. Sin `logContext` el comportamiento es idéntico al anterior (retrocompatible). _(Tarea 4)_
- `src/app/api/check-in/route.ts` — `sendCheckinTemplate` ahora propaga `customerId` al `logContext`, de modo que welcome / tier_unlocked / points_earned_near / points_earned_far quedan registrados en `message_logs`. _(Tarea 4)_
- `src/components/features/check-in/CheckInSuccess.tsx` y `MysteryBoxResult.tsx` — **fallback visual**: si `whatsapp_sent=false`, se muestra "No pudimos enviarte el WhatsApp. Muestra esta pantalla al mesero para reclamar tu premio" y se oculta el texto que afirma que el WhatsApp fue enviado. _(Tarea 2)_

### Docs
- `docs/DB_SCHEMA.md` — tabla `message_logs` (índice, ER, sección, migración 00020, resumen RLS).
- `docs/AUDIT-12-Julio/RESOLUCION.md` — documento de seguimiento: qué se resolvió (1-4) y qué queda pendiente (5-15).
- `docs/features/points-mystery-box.md` — nota sobre `whatsapp_sent` y persistencia en `message_logs`.

### Pendiente (siguientes bloques de la auditoría)
- Webhook de status callback (`/api/webhook/twilio-status`) + `statusCallback` en `messages.create` para llenar `delivered_at`. _(Tarea 5)_
- Endpoint `/api/health` + widget de plantillas sin configurar. _(Tareas 6-7)_
- Opt-out persistente, retry con backoff, prechequeo de número, atomicidad en `awardPoints`. _(Tareas 8-12)_

---

## [AUDIT] — 2026-07-12 — audit: auditoria completa del sistema de mensajeria WhatsApp

> Request: un cliente con 3 visitas recibio puntos, llego al premio, escogio mystery box, gano bebida gratis, pero nunca recibio el mensaje de WhatsApp. Auditar todo el sistema de mensajes sin hacer correcciones.

### Audited (sin cambios de codigo)
- `src/services/whatsapp.service.ts` — envio de plantillas Twilio, progressive retry, manejo de errores
- `src/app/api/check-in/route.ts` — flujo completo de check-in, envio de WhatsApp de bienvenida/puntos/tier desbloqueado
- `src/app/api/mystery-box/resolve/route.ts` — resolucion de premio y envio de WhatsApp de confirmacion (safe/mystery/golden)
- `src/app/api/webhook/delivery/route.ts` — webhook de domicilios y envio de WhatsApp
- `src/app/api/cron/birthday/route.ts` — cron de cumpleanos y tracking en campaign_messages
- `src/app/api/cron/reactivation/route.ts` — cron de reactivacion suave/agresiva y tracking en campaign_messages
- `src/app/api/dashboard/campaigns/manual/route.ts` — campanas manuales y tracking en campaign_messages
- `src/services/campaign.service.ts` — tracking de mensajes de campana (campaign_messages)
- `src/services/points.service.ts` — otorgamiento de puntos, transacciones, algoritmo inteligente
- `src/services/mystery-box.service.ts` — pity timer, global caps, seleccion de premios
- `src/services/reward-tiers.service.ts` — evaluacion de tiers y roadmaps
- `src/app/api/webhook/twilio-incoming/route.ts` — manejo de mensajes entrantes, opt-out, forwarding a n8n
- `src/app/api/dashboard/twilio-metrics/route.ts` — consulta pasiva de metricas desde Twilio API
- `src/lib/rate-limit.ts` — rate limiting en memoria
- `docs/PLANTILLAS.md` — documentacion de plantillas v1.0.2
- `docs/features/flujo-plantillas-recompensas-campanas.md` — documentacion legacy v0.23.0
- `docs/DB_SCHEMA.md` — esquema de tablas relevantes a mensajeria

### Hallazgos criticos (documentados)
- **Sin webhook de status callback de Twilio:** no se recibe notificacion de entrega/fallo real. La tabla campaign_messages nunca se actualiza a `delivered`.
- **Mensajes transaccionales no se persisten:** check-in, welcome, tier_unlocked, mystery_box, safe, golden — ninguno se guarda en DB. Si falla, solo queda log efimero de Vercel.
- **`.catch()` silencioso en mystery-box/resolve:** si el envio de WhatsApp falla, la API responde `ok: true` al frontend. El cliente nunca sabe que no le llegara el mensaje.
- **No hay retry automatico:** cualquier fallo es definitivo.
- **Opt-out no persistente:** el webhook entrante maneja keywords pero no marca al cliente en la base de datos.
- **Race condition en puntos:** `awardPoints` hace SELECT -> UPDATE no atomico.
- **Rate limit en memoria:** en Vercel serverless no comparte estado entre instancias.

### Added (docs)
- `docs/AUDIT-12-Julio/AUDIT_WHATSAPP_MENSAJERIA.md` — informe tecnico completo de auditoria (severidad, lineas exactas, recomendaciones).
- `docs/AUDIT-12-Julio/RESUMEN_VISUAL.md` — resumen ejecutivo visual con mapa de calor, checklist de diagnostico y proximos pasos.

---

## [1.6.2] — 2026-06-11 — fix: doble conteo de puntos en primera visita verificada por mesero

> Request: al activar "pedir QR desde el principio" (check-in verificado por mesero), un cliente nuevo terminaba con 138 pts en su primera visita (90 de bienvenida + 48 de la visita) cuando debía recibir solo ~90. Corregir sin alterar el funcionamiento del modo normal.

### Fixed
- `src/app/api/check-in/route.ts` — **register:** cuando la primera visita queda pendiente del escaneo del mesero (`pendingStaffScan=true`, modo `staff_verified` + `checkin_first_visit_free=false`), ya NO se otorga el bono de bienvenida ni se envía el WhatsApp en el registro. El bono previo + los puntos de la visita causaban doble conteo (90+48=138). Ahora los puntos se asignan una sola vez, en el escaneo del mesero.

### Added
- `src/app/api/check-in/route.ts` — **checkin:** en la primera visita verificada por el mesero (`isFirstVisit`, detectado por `total_visits === 0` antes del incremento) se envía la plantilla de **bienvenida** (`welcome_template_sid`) en lugar de la de "sumaste puntos", para que el cliente nuevo no parezca frecuente.
- `src/components/features/check-in/CheckInForm.tsx` — el polling muestra la pantalla de **bienvenida** (no "¡volviste!") cuando detecta que la visita registrada es la primera (`total_visits === 1`).
- `src/app/(public)/check-in/page.tsx` — `handleRegisterSuccess` envuelto en `useCallback` para estabilizar el efecto de polling (ahora también depende de él).

### Notes
- **Sin impacto en el modo `auto` (normal):** `pendingStaffScan` solo es `true` en `staff_verified` + primera visita no libre; en modo auto el cliente nuevo recibe su bono y WhatsApp en el registro exactamente como antes, e `isFirstVisit` nunca se activa en `checkin` (los clientes nuevos ya tienen `total_visits ≥ 1`).
- Para que el WhatsApp de bienvenida salga en este flujo, debe estar configurado `welcome_template_sid` en Dashboard → Ajustes (sin fallback si falta).

---

## [1.5.2] — 2026-06-10 — feat: desglose de fallos por motivo en Mensajería

> Request: entender por qué hay 59 mensajes fallidos — el panel solo contaba los fallos sin explicar la causa.

### Added
- `src/app/api/dashboard/twilio-metrics/route.ts` — agrega `failureBreakdown` al response: agrupa los outbound `failed`/`undelivered` por `error_code` con descripción legible (`describeTwilioError`: número inválido, sin WhatsApp, opt-out, plantilla rechazada, etc.).
- `src/components/dashboard/TwilioMessagesPanel.tsx` — nueva sección "¿Por qué fallaron?" (tabla cantidad/motivo/código) visible solo cuando hay fallos.

---

## [1.5.1] — 2026-06-10 — refactor: Mensajería como panel colapsable dentro de Métricas

> Request: mover la sección de Mensajería al área de Métricas detrás de un botón que se deba presionar para ver (que no esté plenamente visible).

### Added
- `src/components/dashboard/TwilioMessagesPanel.tsx` — panel colapsable con la UI completa de Mensajería WhatsApp (KPIs, gráfico de área, tabla de opt-outs, selector 7/30/90 días, `TwilioWallet`). **Carga diferida:** la consulta a la Twilio Messages API solo se dispara cuando el usuario abre el panel por primera vez, para no penalizar la carga del dashboard.

### Changed
- `src/app/(dashboard)/dashboard/page.tsx` — monta `<TwilioMessagesPanel>` al final de la página de Métricas, colapsado tras un botón "Mensajería WhatsApp".
- `src/components/layout/DashboardSidebar.tsx` y `DashboardHeader.tsx` — removido el nav item "Mensajería" (y el icono `MessageCircle` sin uso); ahora se accede desde Métricas.

### Removed
- `src/app/(dashboard)/dashboard/mensajes/page.tsx` — página standalone eliminada; su contenido vive ahora en el panel colapsable.

---

## [1.5.0] — 2026-06-10 — feat: Dashboard de Métricas de Twilio (Req P2.3)

> Request: desarrollar P2.3 (Dashboard Twilio) de `docs/requerimientos/REQUERIMIENTOS_SISTEMA.md`. Solo este P2.

### Added
- `src/app/api/dashboard/twilio-metrics/route.ts` — endpoint que consulta la Twilio Messages API en tiempo real (hasta 5 páginas × 1000 msgs, rango 1-90 días): conteos por estado (enviados/entregados/leídos/fallidos/no entregados/en tránsito), tasas de entrega y lectura, timeline diario, y detección de opt-outs por doble vía (keyword inbound SALIR/STOP/... + error 21610/63016 outbound) con mapeo a nombres de `customers`. Auth: Admin Cookie. Tipado estricto sin `any`.
- `src/app/(dashboard)/dashboard/mensajes/page.tsx` — página "Mensajería WhatsApp": 4 KPI cards, gráfico de área (recharts, ya en deps) con evolución diaria, tabla de opt-outs con cliente/motivo/fecha, selector de rango 7/30/90 días, advertencia si los datos están truncados, y `TwilioWallet` (saldo) reusado.
- `docs/features/twilio-metrics.md` — doc de la feature (arquitectura, limitaciones, pendientes).

### Changed
- `src/components/layout/DashboardSidebar.tsx` y `DashboardHeader.tsx` — nav item "Mensajería" (`/dashboard/mensajes`, icono `MessageCircle`).
- `docs/API_DOCS.md` — endpoint `/api/dashboard/twilio-metrics` documentado (tabla + sección con response).

### Notes
- Sin cambios de DB: las métricas se leen on-demand de Twilio (no requiere status callbacks ni almacenamiento local).
- Limitación: read rate depende de confirmaciones de lectura del cliente WhatsApp; opt-outs solo detectables dentro del rango consultado (Twilio no expone lista de bloqueados vía API).

---

## [1.4.0] — 2026-06-10 — feat: requerimientos P1 (reactivación configurable, rediseño reseñas, rediseño campañas)

> Request: desarrollar los 3 requerimientos P1 de `docs/requerimientos/REQUERIMIENTOS_SISTEMA.md` (P1.1 días reactivación configurables, P1.2 rediseño review UX, P1.3 rediseño módulo campañas).

### Added
- `src/components/features/check-in/GoogleReviewCard.tsx` — card inline de solicitud de reseña (reemplaza el modal `GoogleReviewPopup`): sin overlay ni X (elimina "instinct close"), CTA a Google siempre habilitado con microcopy explícito, rating interno opcional separado visualmente con disclaimer "NO es la reseña de Google", estado de confirmación post-clic.
- `src/services/settings.service.ts` — `getReactivationDaysConfig()`: lee `reactivation_soft_days`/`reactivation_aggressive_days` de `admin_settings` con fallback a constantes y validación (agresiva > suave, si no → suave+4).
- `docs/features/review-flow.md` — doc de la feature de reseñas.
- `docs/requerimientos/REQUERIMIENTOS_SISTEMA.md` — reorganizado en secciones P1/P2/P3 con checks de desarrollo por requerimiento.

### Changed
- `src/services/campaign.service.ts` — `findInactiveCustomers(reactivationDays?)` ahora acepta días como parámetro (default `REACTIVATION_DAYS`).
- `src/app/api/cron/reactivation/route.ts` — usa días configurables vía `getReactivationDaysConfig()` para cutoffs suave/agresivo; response incluye `reactivation_soft_days` y `reactivation_aggressive_days`. Removido import de `REACTIVATION_AGGRESSIVE_DAYS`.
- `src/app/(dashboard)/dashboard/settings/page.tsx` — nueva sección "Reactivación de Clientes" con inputs de días suave/agresiva, validación en UI (agresiva > suave) y guardado en `admin_settings`.
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — rediseño UX: fila de KPIs del mes (campañas, mensajes, última ejecución), badge de estado real por campaña automática (Activa/Sin plantilla según settings), preview real del body de la plantilla Twilio configurada (en card y en dialog de confirmación), días de reactivación dinámicos en la descripción, botón "Ejecutar Ahora" deshabilitado sin plantilla, estados del historial traducidos al español, link directo a Ajustes.
- `src/components/features/check-in/CheckInSuccess.tsx` — usa `GoogleReviewCard` inline (entre el mensaje de WhatsApp y el botón "Nuevo check-in") en lugar del popup modal; timer de aparición 4s → 2.5s.

### Notes
- `src/components/features/check-in/GoogleReviewPopup.tsx` queda DEPRECADO sin referencias (no se eliminó — pendiente autorización).
- Nuevas keys en `admin_settings` (sin migración — tabla key/value): `reactivation_soft_days`, `reactivation_aggressive_days`. Documentadas en `docs/DB_SCHEMA.md` y `docs/API_DOCS.md`.
- Docs actualizados: `docs/features/campaigns.md`, `docs/features/review-flow.md` (nuevo), `docs/DB_SCHEMA.md`, `docs/API_DOCS.md`.

---

## [1.3.0] — 2026-06-08 — feat: fidelización visual Fase 1 ("a prueba de imbéciles")

> Request: el cliente no entiende que debe mostrar el QR al mesero (visitas fantasma), los premios se ven chiquitos, no se pueden eliminar dispositivos. Objetivo: tarjeta visual estilo wallet, premios grandes, gestión de dispositivos.

### Added
- `src/components/features/check-in/CustomerCard.tsx` — tarjeta tipo wallet que reemplaza la pantalla del QR del cliente: banner rojo imperativo "DILE AL MESERO QUE TE ESCANEE", QR 270px con borde pulsante, termómetro de puntos gigante (h-8) con animación de llenado, camino completo de recompensas (reusa `TiersRoadmap`), y overlay de dopamina "+X pts" cuando el mesero registra la visita.
- `src/app/api/public/points-range/route.ts` — endpoint público que expone el rango de puntos por visita (`{ min, max }`) desde `admin_settings`. Rate limited 60/min por IP, cache 60s. Usado como gatillo de gamificación en el registro.
- `src/app/api/dashboard/staff/device/route.ts` — `PATCH` (revocar, soft → `is_trusted=false`) y `DELETE` (eliminar, hard, solo si ya revocado) de dispositivos de confianza. Protegido por sesión de dashboard.

### Changed
- `src/components/features/check-in/RewardsPreview.tsx` — rediseño completo: tarjetas grandes en carrusel horizontal (emoji 40px, premio, pts), título destacado, badge del rango de puntos por visita, y explicación de la Mystery Box. Ahora se muestra también en el step `register` (antes solo en `phone`).
- `src/components/features/check-in/CheckInForm.tsx` — usa `CustomerCard` para el step `customer_qr`; fetch del rango de puntos; overlay de dopamina ~1.6s antes de pasar a la pantalla de éxito; `RewardsPreview` con `pointsRange` en `phone` y `register`. Removidos imports sin uso (`QRCodeSVG`, `STAFF_LABEL`).
- `src/app/api/public/reward-tiers/route.ts` — el payload público ahora incluye `mystery_box_enabled` (requerido por `TiersRoadmap` en la tarjeta).
- `src/components/features/check-in/TiersRoadmap.tsx` — `mystery_box_enabled` ahora opcional en el tipo (compatibilidad con el payload público).
- `src/app/(dashboard)/dashboard/staff/page.tsx` — columna "Acciones" en la tabla de dispositivos con botones Revocar (si activo) y Eliminar (si revocado), con confirmación y toasts.

### Notes
- Fase 2 (documentada, NO implementada): tarjeta digital permanente accesible fuera del check-in, envío por WhatsApp con link permanente, y tarjetas/cupones personalizados desde el dashboard.
- Decisión de producto: NO se usan "sellos de visitas" — el progreso es solo por puntaje (termómetro), para no confundir con los puntos.
- Spec: `docs/features/visual-loyalty-fase1-spec.md`. Plan: `docs/superpowers/plans/2026-06-08-visual-loyalty-fase1.md`.

---

## [1.2.6] — 2026-06-03 — feat: preview dinámica de recompensas + política de privacidad (Ley 1581)

### Added
- `src/app/api/public/reward-tiers/route.ts` — endpoint público (sin auth) que expone los tiers activos para la preview del check-in. Rate limited 60/min por IP.
- `src/components/features/check-in/RewardsPreview.tsx` — componente que muestra los tiers reales (nombre, puntos, premio seguro) debajo del botón Continuar en el paso del celular. Carga dinámica desde DB; si falla, no bloquea el formulario.
- `src/app/(public)/privacidad/page.tsx` — página de política de privacidad (Ley 1581 Colombia). Usa `BRAND_NAME` para personalización por clon. Link de contacto vía `RESTAURANT_WHATSAPP_LINK`.

### Changed
- `src/components/features/check-in/CheckInForm.tsx` — step 'phone': fetch de tiers al montar, render de `RewardsPreview` si hay tiers disponibles. Checkbox de consentimiento ahora incluye link a `/privacidad` (Política de Privacidad).

---

## [1.2.5] — 2026-06-03 — feat: NEXT_PUBLIC_STAFF_ROLE_LABEL + script validate-env + Notion Paso a Paso

### Added
- `src/lib/branding.ts` — nuevas exportaciones `STAFF_LABEL` y `STAFF_LABEL_PLURAL` leídas de `NEXT_PUBLIC_STAFF_ROLE_LABEL` (default: `Mesero`). Permite adaptar el sistema a cualquier tipo de negocio sin tocar código.
- `scripts/validate-env.mjs` — validador de entorno ejecutable antes de cada deploy. Verifica variables requeridas, formatos (JWT length, prefijo whatsapp:) y conexión real a Supabase.
- `.env.example` — nueva variable `NEXT_PUBLIC_STAFF_ROLE_LABEL=Mesero` documentada.

### Changed
- `src/components/layout/DashboardSidebar.tsx` — nav label "Meseros QR" ahora usa `STAFF_LABEL_PLURAL` (retrocompatible).
- `src/components/layout/DashboardHeader.tsx` — ídem.
- `src/app/(public)/mesero/page.tsx` — título "App del Mesero" → `App del ${STAFF_LABEL}`.
- `src/app/(public)/mesero/dashboard/page.tsx` — badge de sesión usa `STAFF_LABEL`.
- `src/components/features/check-in/CheckInForm.tsx` — textos cliente-facing ("Muéstrale este código a tu mesero") usan `STAFF_LABEL`.
- `src/components/features/check-in/CheckInSuccess.tsx` — ídem.
- `src/components/features/check-in/MysteryBoxResult.tsx` — ídem.

### Notes
- Cambio 100% retrocompatible. Sin `NEXT_PUBLIC_STAFF_ROLE_LABEL` configurada, el sistema se comporta exactamente igual que antes.
- Para barberías: agregar `NEXT_PUBLIC_STAFF_ROLE_LABEL=Barbero` en Vercel.

---

## [1.2.4] — 2026-06-02 — Docs: Sistema de operaciones, pipeline de ventas y guía de delegación

### Added

**Documentos operativos para escalar implementaciones y delegar:**
- `docs/operaciones/PROCESO_VENTAS_IMPLEMENTACION.md` — Pipeline completo de ventas e implementación por cliente nuevo. 5 fases: Lead → Reunión → Setup (2 días) → Cliente Activo → Offboarding. Incluye scripts de mensajes, tiempos estimados, y checklist pre-launch.
- `docs/operaciones/ESTRUCTURA_NOTION.md` — Especificación exacta de 4 bases de datos para Notion: Leads y Clientes, Tareas de Implementación, Inventario Técnico (restringido), y Seguimiento Mensual. Incluye propiedades, vistas, plantillas de tareas pre-creadas, y flujo de trabajo diario/semanal/mensual.
- `docs/operaciones/DELEGACION_GUIDE.md` — 11 tareas delegables a un asistente virtual medio tiempo ($1.5M–$2.5M COP/mes). Cada tarea incluye instrucciones exactas, tiempo estimado, nivel de riesgo, mensajes copy-paste, y lo que NO se puede delegar (cierre de venta, deploy final, fixes técnicos).

---

## [1.2.3] — 2026-06-01 — Feature: ROI demo con 32 reactivados + 23% atracción de campaña

### Added

**Demo ROI desglosado (solo modo demo — dashboard real sin cambios):**
- `src/lib/demo-analytics.ts`: ROI fijo con `DEMO_REACTIVATED = 32` y `DEMO_CAMPAIGN_RATE = 23%`. Calcula `retentionROI`, `campaignROI` y `estimatedROI` combinado.
- `src/components/dashboard/ROICard.tsx`: rediseñado para mostrar desglose en dos filas cuando los datos incluyen `campaignAttractionRate` (solo en modo demo). Modo real queda igual.
- `src/types/analytics.types.ts`: campos opcionales `campaignAttractionRate`, `newFromCampaigns`, `campaignROI`, `retentionROI` en `ROIEstimate`.

### Added

**Credenciales Supabase:**
- `.env.local`: creado con template completo comentado — pegar URL, anon key y service role para operaciones locales y CLI.

---

## [1.2.2] — 2026-06-01 — Config: opt-out keyword SALIR + documentación de replicación

### Changed

**Twilio Console — Opt-Out Management:**
- Agregado `SALIR` como keyword de opt-out en el Messaging Service `SushiService-Fidelity` (vía API REST). Este es el keyword que usan todas las plantillas del sistema para la instrucción de desuscripción.
- Keywords de opt-out ahora: `STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, BAJA, CANCELAR, SALIR`.
- Keywords de opt-in: `START, YES, UNSTOP, ALTA, ACEPTO`.
- Keywords de help: `HELP, INFO, AYUDA`.

### Docs

- **`docs/features/twilio-opt-out.md`** (nuevo): documentación completa del feature con:
  - Estado actual de keywords configurados.
  - Método 1: consola web.
  - Método 2: script PowerShell reproducible vía API REST.
  - Checklist de replicación para nuevo cliente.
- **`docs/CONFIGURACIONES_TWILIO_SISTEMA.md`**: actualizada la sección 3 (Opt-Out) con `SALIR` y el snippet de API REST para replicación rápida.

---

## [1.2.1] — 2026-05-31 — Fix: auditoría del sistema de plantillas WhatsApp

### Fixed

**`src/app/(dashboard)/dashboard/settings/page.tsx`:**
- **Causa raíz (slot huérfano):** el backend (`check-in`, `webhook/delivery`, `check-in-override`) lee y envía `tier_unlocked_template_sid`, pero el Dashboard NUNCA guardaba esa key → al cruzar un tier no salía mensaje en el momento del cruce.
- **Fix:** agregado el selector **"Tier desbloqueado (al cruzar nivel)"** con estado, carga y `saveSetting('tier_unlocked_template_sid', ...)`.

**`src/app/api/check-in/route.ts`:**
- **Visibilidad de fallos:** `sendCheckinTemplate` ahora devuelve `{ sent, templateType, reason }` y la respuesta del check-in incluye un objeto `whatsapp` con el estado real del envío. Antes los fallos de Twilio se tragaban en silencio (puntos subían, mensaje no llegaba, sin rastro).
- **Fallo near→far eliminado:** si el cliente está "cerca" pero `points_earned_near_template_sid` no está configurado, ya NO se manda por error la plantilla "lejos"; se reporta `no_template_configured`.
- **Orden de envío:** el WhatsApp se envía ANTES del sync de Google Contacts (webhook externo) para que su latencia/timeout nunca impida la entrega del mensaje.

**`src/services/whatsapp.service.ts`:**
- En el fallo de envío se loguea el **código de error de Twilio** (`code`/`status`/`moreInfo`) — p.ej. 63016 (opt-out), 21655 (contentSid inválido), 63007 (número fuera de WhatsApp) — para diagnosticar por qué no llega un mensaje.

### Docs
- `docs/PLANTILLAS.md`: documentado el slot `tier_unlocked_template_sid` y aclarado el flujo de **dos mensajes** en el cruce de tier (al cruzar vs. tras elegir premio).

### Nota de configuración
- Tras desplegar, en **Dashboard → Ajustes** hay que asignar la plantilla al nuevo slot "Tier desbloqueado" (si se desea mensaje en el cruce) y verificar que "Puntos sumados (cerca)" siga asignado.

---

## [1.2.0] — 2026-05-31 — Fix: puntos en 0, premio no aparece y crash scan→confirm

### Fixed

**`src/app/api/check-in/status/route.ts`:**
- **Causa raíz (puntos +0):** la consulta a `point_transactions` filtraba por columnas inexistentes `visit_id` y `type`. La tabla usa `reference_id` (id de la visita) y `source`. Resultado: `points_awarded` siempre era `0` aunque el saldo total fuera correcto.
- **Fix:** consulta corregida a `.eq('reference_id', visitId).in('source', ['visit_staff','visit_qr','visit_delivery'])`.
- **Nuevo:** el endpoint ahora calcula y devuelve `tier_unlocked` — el tier de mayor umbral que el cliente superó y aún no reclamó (sin fila en `mystery_box_results`). Esto entrega el flujo de premio al celular del cliente vía polling y auto-recupera unlocks perdidos.

**`src/components/features/check-in/CheckInForm.tsx`:**
- El polling ahora lee `data.tier_unlocked` y emite `message: 'tier_unlocked'` cuando corresponde (antes hardcodeaba `'points_earned'` e ignoraba el tier). El cliente ya ve la elección safe vs Mystery Box.

**`src/app/(public)/mesero/scan/page.tsx`:**
- **Causa raíz (crash / "page couldn't load" / tener que tocar "volver"):** html5-qrcode lanza un error SÍNCRONO `Cannot stop, scanner is not running or paused` al llamar `stop()` cuando el scanner ya no está activo, provocando un `unhandledrejection` que rompía la navegación scan→confirm en móvil.
- **Fix:** nuevo helper `safeStopScanner()` que verifica `getState()` y atrapa la excepción. Se usa en el teardown, al navegar tras escanear, al alternar modo manual.
- El modo manual ahora limpia `sessionStorage` para no mostrar un cliente obsoleto.

**`src/app/(public)/mesero/confirm/page.tsx`:**
- El lazy initializer ya NO borra `sessionStorage` en el primer render (se perdía el nombre del cliente al recargar). Ahora se limpia solo tras registrar la visita con éxito.

### Docs
- `docs/API_DOCS.md`: documentado el campo `tier_unlocked` y la consulta corregida de `point_transactions`.

---

## [1.1.9] — 2026-05-31 — Fix: crash React #310 en check-in de cliente registrado

### Fixed

**`src/components/features/check-in/CheckInForm.tsx`:**
- **Causa raíz:** El `useEffect` del polling automático estaba ubicado DESPUÉS de dos `return` condicionales (`step === 'phone'` y `step === 'register'`), violando las Reglas de Hooks de React.
- En el primer render (`step = 'phone'`) React registraba N hooks; al cambiar a `step = 'customer_qr'` detectaba N+1 hooks y lanzaba el error #310 ("Rendered fewer hooks than expected").
- **Fix:** El `useEffect` del polling se movió ANTES de todos los `return` condicionales, junto con los demás hooks del componente.

**`src/app/(public)/check-in/page.tsx`:**
- `handleCheckInSuccess` envuelto en `useCallback` para evitar que la referencia cambie en cada render y reinicie innecesariamente el intervalo de polling.

---

## [1.1.8] — 2026-05-31 — Fix: selectores de plantillas faltantes en Dashboard > Ajustes

### Fixed

**`src/app/(dashboard)/dashboard/settings/page.tsx`:**
- **Agregados 7 nuevos selectores** de plantillas WhatsApp faltantes para el sistema de puntos + Mystery Box:
  - `reward_safe_template_sid` — Premio seguro (cliente eligió "a la segura")
  - `mystery_box_result_template_sid` — Resultado de Mystery Box normal
  - `golden_box_result_template_sid` — Resultado de Golden Box (pity timer)
  - `points_earned_far_template_sid` — Puntos sumados (lejos del premio)
  - `points_earned_near_template_sid` — Puntos sumados (cerca del premio)
  - `tier_unlocked_template_sid` — Tier desbloqueado (antes de elegir safe/mystery)
  - `reactivation_aggressive_template_sid` — Reactivación agresiva (25d+)
- **Eliminados 3 selectores legacy** que el backend ya no usaba (código muerto que confundía la UI):
  - `welcome_back_near_template_sid` — Visita: cerca de premio (legacy)
  - `welcome_back_far_template_sid` — Visita: lejos de premio (legacy)
  - `reward_template_sid` — Ganaste premio milestone (legacy)
- Los selectores nuevos se agrupan visualmente bajo "Sistema de Puntos + Mystery Box".
- El `handleSaveTemplates` ahora persiste solo las keys activas en `admin_settings`.

**`docs/features/flujo-plantillas-recompensas-campanas.md`:**
- Actualizada la tabla de configuración en sección 8: agregadas las 7 nuevas keys y removidas las 3 legacy.

---

## [1.1.7] — 2026-05-31 — Feat: polling automático para flujo completo del cliente post-QR

### Added

**`src/app/api/check-in/status/route.ts`:**
- Nuevo endpoint `GET /api/check-in/status?phone=XXX` que devuelve el estado del cliente + su visita más reciente (últimos 5 minutos).
- Incluye: `hasRecentVisit`, `customer` (name, total_visits, total_points), `points_awarded`, `next_tier`, `tiers`.

**`src/components/features/check-in/CheckInForm.tsx`:**
- Cuando el cliente está en el step `customer_qr` (mostrando su QR), se inicia polling automático cada 5 segundos al nuevo endpoint.
- Cuando detecta una visita recién registrada (`hasRecentVisit: true`), transiciona automáticamente a `onCheckInSuccess`, mostrando la pantalla de éxito con puntos, visitas y roadmap de tiers.
- Indicador visual "Esperando confirmación del mesero..." mientras hace polling.
- Cleanup del intervalo al desmontar el componente.

---

## [1.1.6] — 2026-05-31 — Fix: accessibility warnings en input de mesa

### Fixed

**`src/app/(public)/mesero/confirm/page.tsx`:**
- Agregado `id="table-number"` y `name="table_number"` al input de número de mesa.
- Agregado `htmlFor="table-number"` al `<label>` para eliminar warnings de accesibilidad del browser.

---

## [1.1.5] — 2026-05-31 — Feat: capturador de errores para diagnosticar crashes del mesero

### Added

**`src/app/(public)/mesero/error.tsx`:**
- Nuevo Next.js Error Boundary para la ruta `/mesero/**` que captura cualquier error de React y muestra el mensaje + stack trace en pantalla, en vez del genérico "This page couldn't load".

**`src/app/(public)/mesero/scan/page.tsx` & `src/app/(public)/mesero/confirm/page.tsx`:**
- `window.addEventListener('error')` y `window.addEventListener('unhandledrejection')` para capturar errores de librerías externas (como `html5-qrcode`) y mostrarlos en la UI del celular.

---

## [1.1.4] — 2026-05-31 — Fix: race condition en scanner QR del mesero

### Fixed

**`src/app/(public)/mesero/scan/page.tsx`:**
- Agregado `navigatingRef` para prevenir que `handleScan` se ejecute múltiples veces si el scanner dispara callbacks duplicados.
- `handleScan` ahora detiene el scanner (`await stop() + clear()`) **antes** de llamar `router.push`, eliminando la race condition que causaba el crash "This page couldn't load" al desmontar el componente mientras `Html5Qrcode` aún estaba activo.
- Reset de `navigatingRef.current = false` cuando el decode del QR falla, permitiendo reintentar.

---

## [1.1.3] — 2026-05-31 — Fix: diagnóstico de error de conexión en lookup de clientes existentes

### Fixed

**`src/components/features/check-in/CheckInForm.tsx`:**
- Catch de `handlePhoneSubmit` ahora loguea el error real en consola y muestra el mensaje original en lugar de ocultarlo bajo "Error de conexión".

**`src/app/api/check-in/route.ts`:**
- Logging en lookup de clientes existentes: console.log antes/después de `generateCustomerQRToken` y console.error en el catch.
- Fallbacks defensivos en la respuesta del cliente: `name || 'Cliente'`, `total_visits ?? 0`, `total_points ?? 0`.

---

## [1.1.2] — 2026-05-30 — Dashboard admin para gestión de meseros QR

### Added

**`src/app/(dashboard)/dashboard/staff/page.tsx` — Frontend CRUD de meseros para admin:**
- Tabla de meseros con nombre, celular, rol, estado, último login.
- Crear mesero con nombre, celular, PIN numérico (4-6 dígitos) y rol (mesero / supervisor / admin).
- Editar mesero: cambiar nombre, rol y restablecer PIN.
- Activar / desactivar mesero con toggle.
- Eliminar mesero con confirmación.
- Tabla de dispositivos de confianza registrados (nombre, activado por, estado, último uso, expiración).

**`src/components/layout/DashboardSidebar.tsx`:**
- Nuevo item de navegación "Meseros QR" (`/dashboard/staff`) con icono `UserCog`.
- Item previo "Meseros" renombrado a "Autorizados Domicilio" para diferenciar sistemas.

### Changed

**`src/app/api/dashboard/staff/route.ts`:**
- Auth unificado de Bearer token a cookie-based (`createClient` de `@/lib/supabase/server`), consistente con todas las demás APIs del dashboard.

---

## [1.1.1] — 2026-05-30 — Auto-checkin eliminado: solo mesero registra visitas

### Changed

**`src/components/features/check-in/CheckInForm.tsx`:**
- Cliente frecuente siempre genera QR dinámico. El auto-checkin directo fue eliminado.
- El mesero es el único que puede registrar visitas escaneando el QR del cliente.

**`src/app/api/check-in/route.ts`:**
- `action: 'checkin'` siempre requiere `source: 'staff_scan'` con autenticación válida de mesero.
- El modo `checkin_mode` ya no determina si el cliente puede auto-registrarse; solo controla si la primera visita de nuevos clientes requiere mesero (`checkin_first_visit_free=false`).

---

## [1.1.0] — 2026-05-30 — Staff QR Scan: verificación presencial mesero-cliente con QR dinámico

### Added

**Sistema de verificación presencial de dos pasos (cliente → mesero):**
- `src/app/(public)/mesero/page.tsx` — Login del mesero (PIN de 4-6 dígitos) + activación de dispositivo de confianza.
- `src/app/(public)/mesero/dashboard/page.tsx` — Dashboard del mesero con stats del día y botón de escaneo.
- `src/app/(public)/mesero/scan/page.tsx` — Escáner QR con `html5-qrcode`, modo manual fallback, linterna.
- `src/app/(public)/mesero/confirm/page.tsx` — Confirmación post-escaneo: datos del cliente + input mesa + registro de visita.
- `src/hooks/useStaffAuth.ts` — Hook de autenticación dual: JWT de mesero (8h) o device_token de confianza.
- `src/lib/utils/qrcode.ts` — Generación y verificación de tokens JWT efímeros (`jose`) para QR dinámico del cliente (TTL 5 min).
- `src/app/api/staff/login/route.ts` — Login mesero: phone + PIN → JWT firmado con `STAFF_JWT_SECRET`.
- `src/app/api/staff/me/route.ts` — Validación de sesión JWT o device_token.
- `src/app/api/staff/stats/route.ts` — Visitas registradas hoy por mesero/dispositivo.
- `src/app/api/staff/device/register/route.ts` — Activar celular/tablet del restaurante como dispositivo de confianza (requiere PIN de supervisor).
- `src/app/api/staff/device/verify/route.ts` — Verificación silenciosa de device_token.
- `src/app/api/dashboard/staff/route.ts` — CRUD de meseros para admin (crear, listar, toggle activo, reset PIN, eliminar).
- `supabase/migrations/00015_staff_qr_scan.sql` — Tablas `staff_users`, `staff_devices`, FK `visits.registered_by_staff_id`, settings `checkin_mode` y `checkin_first_visit_free`, RLS, trigger `updated_at`.

**Modo de check-in configurable:**
- `checkin_mode`: `'auto'` (flujo actual) o `'staff_verified'` (requiere mesero).
- `checkin_first_visit_free`: `'true'` (default) permite primera visita libre; `'false'` requiere mesero incluso para nuevos.

**Rate limit dual:**
- Capa base por IP + capa adicional por `staff_id` o `device_token` cuando `source = 'staff_scan'` (máx 10/min).

**Cap de 24h entre check-ins ELIMINADO:**
- Antes: `getRecentVisit(customer.id, 1440)` rechazaba check-ins del mismo cliente dentro de 24h.
- Ahora: los clientes pueden acumular visitas ilimitadas por día. Cada visita otorga puntos y evalúa tiers.
- La restricción solo existía en `action = 'checkin'` (cliente existente); registro de nuevos clientes nunca tuvo cap.

### Changed

**`/api/check-in/route.ts` — Flujo extendido para staff_verified:**
- `action: 'lookup'` retorna `checkin_mode`, `checkin_first_visit_free` y `customer.id`.
- `action: 'register'` respeta `checkin_first_visit_free=false`: rechaza 403 si no hay auth de mesero en modo `staff_verified`.
- `action: 'checkin'` acepta `source: 'staff_scan'`, `registered_by_staff_id`, `device_token`, `token` (QR JWT).
- Omite validación de geolocalización cuando `source = 'staff_scan'`.
- Rechaza check-in de cliente existente en modo `staff_verified` sin mesero autenticado → 403.
- Valida firma y expiración del QR token (`STAFF_QR_JWT_SECRET`) server-side.

**`src/components/features/check-in/CheckInForm.tsx` — QR dinámico del cliente:**
- En modo `staff_verified`, cliente existente ve QR dinámico con token JWT firmado (`sub: customer_id`).
- Pantalla `customer_qr` con datos del cliente, tier, visitas, puntos.

**Servicios actualizados:**
- `src/services/visit.service.ts` — `source` ampliado a `'qr' | 'delivery' | 'staff_scan'`, `getRecentVisit` sin filtro por source (evita duplicados cruzados).
- `src/services/points.service.ts` — `awardVisitPoints` mapea `staff_scan` → `visit_staff`.
- `src/services/customer.service.ts` — `incrementVisit` acepta `staff_scan`.
- `src/types/database.types.ts` — Tipos `StaffUser`, `StaffDevice`, `PointTransactionSource` con `visit_staff`.

### Security

- QR dinámico no expone datos crudos: payload enmascarado en JWT firmado con expiración 5 min.
- Validación de TTL obligatoriamente en servidor (`/api/check-in`), nunca solo en frontend.
- PIN de mesero hasheado con `bcryptjs` (10 salt rounds).
- Dispositivo de confianza: supervisor activa una vez con PIN, mesero no necesita login diario.
- Traza completa: cada visita `staff_scan` queda ligada a `registered_by_staff_id`.

### Environment

- `.env.example` — Nuevas variables: `STAFF_JWT_SECRET`, `STAFF_QR_JWT_SECRET`.

### Dependencies

- `jose` (v6.2.3) — JWT edge-compatible para auth de meseros y QR dinámico.
- `bcryptjs` (v3.0.3) — Hash de PINs.
- `qrcode.react` (v4.2.0) — QR dinámico del cliente.
- `html5-qrcode` (v2.3.8) — Escaneo QR del mesero.

---

## [1.0.9] — 2026-05-30 — HOTFIX: Webhook de delivery enviaba mensajes con formato legacy de milestones

### Fixed

**Webhook de domicilios migrado al sistema de puntos:**
- `src/app/api/webhook/delivery/route.ts`: Reemplazada toda la lógica legacy de `reward.service.ts` (`checkRewardForVisit`, `getNextReward`, `buildRewardsRoadmap`) por el sistema de puntos (`awardVisitPoints`, `evaluateNewTier`, `getNextTier`, `buildTiersRoadmap`).
- **Otorgamiento de puntos en domicilios**: Ahora las visitas de delivery otorgan puntos aleatorios inteligentes (`awardVisitPoints`) y evalúan si el cliente cruza un nuevo tier (`evaluateNewTier`).
- **Puntos de bienvenida en domicilios**: Los clientes nuevos de delivery ahora reciben `awardWelcomeBonus` (antes no recibían nada).
- **Plantillas WhatsApp actualizadas**: Eliminadas `welcome_back_near/far_template_sid` y `reward_template_sid` (legacy). Ahora se usan `points_earned_near_template_sid`, `points_earned_far_template_sid` y `tier_unlocked_template_sid` — igual que el check-in QR.
- **Variables corregidas**: Los mensajes ahora envían `pointsAwarded`, `newBalance` y `tiersRoadmap` en lugar de `total_visits`, `rewardTitle` y `roadmap` de milestones.
- **Respuesta JSON**: Incluye `total_points` y `tier_unlocked` en lugar de `reward` legacy.

### Archivos afectados
- `src/app/api/webhook/delivery/route.ts`

---

## [1.0.8] — 2026-05-30 — Tiers dinámicos: nombres y emojis editables por el admin

### Changed

**Tiers renombrados y umbrales ajustados:**
- `supabase/migrations/00016_ensure_default_tiers.sql`: Tiers default ahora son **Plata (150 pts) → Oro (300 pts) → Diamante (450 pts) → BLACK (1000 pts)**. Anteriormente eran Bronce/Plata/Oro/BLACK con umbrales 150/350/600/1000.

**Emojis dinámicos por posición, no por nombre:**
- `src/lib/tier-emojis.ts` — **NUEVO**: Utilidad `getTierEmoji(index, isBlack)` que devuelve emojis según la posición ordenada del tier (`🥉`, `🥈`, `🥇`, `💎`, `👑`, `⭐`, `🎯`). El tier BLACK siempre usa `🖤`.
- `src/components/features/check-in/TiersRoadmap.tsx`: Reemplazado mapa hardcodeado `tierEmojis['Bronce']` por `getTierEmoji(index, tier.is_black)`. Ahora el admin puede renombrar tiers (ej: "Diamante 1", "Diamante 2") y los emojis siguen correctos.
- `src/app/(dashboard)/dashboard/rewards/page.tsx`: Mismo cambio — emojis dinámicos en la tabla del dashboard.
- `src/services/reward-tiers.service.ts`: `buildTiersRoadmap()` usa `getTierEmoji()` en lugar de mapa por nombre.

**¿Por qué esto importa?**
El dueño ya puede crear, renombrar y eliminar tiers desde el dashboard (`/dashboard/rewards`). Con emojis dinámicos, cualquier nombre funciona visualmente: "Plata", "Oro", "Diamante", "Diamante VIP", "Esmeralda", etc. No hay límite de cantidad de tiers (más allá del sentido comercial).

### Fixed

**Tiers legacy duplicados en base de datos:**
- `supabase/migrations/00017_cleanup_legacy_tiers.sql` — **NUEVO**: Desactiva tiers duplicados creados porque la migración 00016 usó `ON CONFLICT (point_threshold)` y los umbrales viejos (350, 600) no conflictaron con los nuevos (150, 300, 450). Resultado: aparecían 6 tiers en lugar de 4. Esta migración desactiva los obsoletos y reordena `sort_order`.

### Archivos afectados
- `src/lib/tier-emojis.ts`
- `src/components/features/check-in/TiersRoadmap.tsx`
- `src/app/(dashboard)/dashboard/rewards/page.tsx`
- `src/services/reward-tiers.service.ts`
- `supabase/migrations/00016_ensure_default_tiers.sql`
- `supabase/migrations/00017_cleanup_legacy_tiers.sql`

---

## [1.0.7] — 2026-05-30 — HOTFIX: Check-in duplicados, residuos legacy, permisos RLS

### Fixed

**Cap de 24 horas eliminado (bug crítico):**
- `src/app/api/check-in/route.ts`: `getRecentVisit(customer.id, 0.5)` → `1440`. El comentario "30 segundos para testing" nunca se cambió en producción, permitiendo check-ins ilimitados.

**Residuos del sistema legacy de recompensas por visitas:**
- `src/app/api/check-in/route.ts`: Eliminado import y lógica legacy de `reward.service.ts` (`checkRewardForVisit`, `getNextReward`, `buildRewardsRoadmap`, `getUpcomingRewards`). El endpoint ya no evalúa recompensas basadas en `visit_milestone` ni devuelve `reward`/`roadmap` legacy en la respuesta JSON.
- `src/components/features/check-in/CheckInSuccess.tsx`: Eliminada sección "Tus próximos premios" que mostraba `roadmap` basado en visitas (imágenes del bug: #3 Soda, #4 Postre, etc.). Eliminado `nextRewardHint` legacy.
- `src/app/(public)/check-in/page.tsx`: Eliminados `roadmap` y `nextRewardHint` del estado, handlers y props de `CheckInSuccess`.
- `src/components/features/check-in/CheckInForm.types.ts`: `reward`, `nextReward`, `roadmap` ahora opcionales en `CheckInResult`/`RegisterResult` para reflejar el API actual.
- `src/components/features/check-in/CheckInSuccess.types.ts`: Eliminados `roadmap` y `nextRewardHint` de las props.

**WhatsApp variables mal mapeadas:**
- `src/app/api/check-in/route.ts`: Eliminado el **LEGACY FALLBACK** que usaba plantillas de visitas (`welcome_back_*`) con variables de visitas cuando no había plantillas de puntos configuradas. Este fallback causaba que `{{2}}` = total_visits (ej: 2) apareciera como "+2 puntos" y `{{3}}` = título de recompensa apareciera como saldo. Ahora si no hay template de puntos, solo se loguea advertencia y NO se envía mensaje incorrecto.

**Error `permission denied for table customers`:**
- `supabase/migrations/00015_service_role_policies.sql`: **NUEVA MIGRACIÓN**. Agrega políticas RLS explícitas para `service_role` en `customers` y `visits` (SELECT, INSERT, UPDATE). Las tablas creadas en 00001 no tenían políticas de service role, lo que causaba denegación de permisos en producción cuando el service client intentaba leer/escribir.

**Tier Bronce desaparecido / empieza en Plata:**
- `supabase/migrations/00016_ensure_default_tiers.sql`: **NUEVA MIGRACIÓN**. Inserta o actualiza los 4 tiers default (Bronce 150pts, Plata 350pts, Oro 600pts, BLACK 1000pts) garantizando que existan y estén activos con premios y umbrales correctos. Resuelve el problema donde el primer tier visible era Plata porque Bronce había sido desactivado o eliminado en la DB.

**Webhook opt-out "SALIR":**
- `src/app/api/webhook/twilio-incoming/route.ts`: Agregados `SALIR` y `NO` a la lista de keywords de opt-out. El template de WhatsApp dice "Responde SALIR para no recibir más mensajes" pero el webhook no manejaba esta palabra en español. Ahora devuelve 200 silencioso en lugar del mensaje genérico automático.

### Archivos afectados
- `src/app/api/check-in/route.ts`
- `src/components/features/check-in/CheckInSuccess.tsx`
- `src/components/features/check-in/CheckInSuccess.types.ts`
- `src/app/(public)/check-in/page.tsx`
- `src/components/features/check-in/CheckInForm.types.ts`
- `src/app/api/webhook/twilio-incoming/route.ts`
- `supabase/migrations/00015_service_role_policies.sql`
- `supabase/migrations/00016_ensure_default_tiers.sql`

---

## [1.0.6] — 2026-05-28 — Script bulk para crear plantillas Twilio de texto

### Added

**Script — Creación masiva de plantillas de texto:**
- `scripts/twilio-create-text-templates.mjs` — **NUEVO**: Crea las 11 plantillas `twilio/text` de golpe en Twilio Content API. Lee `NEXT_PUBLIC_BRAND_NAME` del env, reemplaza `[Restaurante]` automáticamente, crea cada plantilla con sus samples correctos, y envía cada una a aprobación de Meta con su categoría (UTILITY/MARKETING). Al finalizar imprime un mapeo `settings_key → SID` listo para copiar a `admin_settings`.

**Documentación:**
- `docs/PLANTILLAS.md`: Checklist actualizado — las plantillas de texto (1-11) ahora se crean vía script bulk, no manualmente por Dashboard.

---

## [1.0.6-1] — 2026-05-28 — Fix: Plantillas twilio/media rechazadas por formato inválido

### Fixed

**Script — twilio-create-media-templates.mjs:**
- `media: ['{{6}}']` → `media: [sampleMediaUrl]`. Twilio Content API **no acepta variables `{{N}}`** dentro del array `media`; requiere una URL real de ejemplo. Este era el motivo del rechazo "(tipo no textual)" sin explicación adicional.

**Backend — whatsapp.service.ts:**
- `sendTemplateMessage()` ahora acepta un cuarto parámetro opcional `mediaUrl`. Cuando se envía una plantilla `twilio/media`, Twilio usa `mediaUrl` para sobreescribir la URL de ejemplo aprobada con la URL dinámica del evento (imagen/video del bucket `event-media`).

**Backend — calendar.service.ts:**
- `executeAutoEvent` ahora pasa `mediaUrl` al enviar mensajes de evento, conectando el pipeline completo de envío con media dinámica.

**Documentación:**
- `docs/features/calendar.md`: Pipeline de envío movido de "pausado" a "implementado (pendiente aprobación Meta)".

---

## [1.0.5-3] — 2026-05-28 — Geolocalización desactivada a STANDBY

### Changed

**Frontend — Geolocalización desactivada:**
- `src/components/features/check-in/CheckInForm.tsx`: El componente ya no pide GPS ni envía `lat`/`lon`. Toda la lógica de `verifyLocation()`, estados de ubicación y bloques visuales están comentados como standby. El check-in fluye normalmente sin fricción.

**Backend — Validación GPS desactivada:**
- `src/app/api/check-in/route.ts`: Toda la sección de validación de geolocalización (consulta a `geo_strict_mode`, `restaurant_locations`, cálculo de distancia Haversine) está comentada como standby. El bloque que guardaba `checkin_lat`/`lon`/`distance` en `customers` también está comentado.

**Dashboard — Sección en "Próximamente":**
- `src/app/(dashboard)/dashboard/settings/page.tsx`: La sección "Ubicación del Local" ahora muestra un overlay oscuro con badge "Próximamente" y el texto "Validación por GPS desactivada temporalmente". Los inputs permanecen debajo (opacity 30%, disabled) como standby visual.

### Archivos afectados
- `src/components/features/check-in/CheckInForm.tsx`
- `src/app/api/check-in/route.ts`
- `src/app/(dashboard)/dashboard/settings/page.tsx`

---

## [1.0.5-2] — 2026-05-28 — GPS opcional + Toggle modo estricto en Dashboard

### Changed

**Frontend — GPS ya no bloquea el check-in:**
- `src/components/features/check-in/CheckInForm.tsx`: Si el GPS falla o el usuario lo niega, el check-in continúa sin `lat`/`lon` en vez de bloquearse. El mensaje de error cambia a advertencia suave (amarillo): "No pudimos verificar tu ubicación. Puedes continuar de todos modos." El botón "Continuar" ya no se deshabilita por falta de GPS.

**Backend — Validación GPS condicional:**
- `src/app/api/check-in/route.ts`: Consulta el setting `geo_strict_mode` desde `admin_settings`. Solo retorna 403 si `geo_strict_mode === 'true'` Y no hay `lat`/`lon` en el body. Por defecto (modo relajado) el check-in siempre permite continuar, con o sin GPS.

**Dashboard — Toggle modo estricto:**
- `src/app/(dashboard)/dashboard/settings/page.tsx`: Checkbox "Modo estricto: requerir GPS para hacer check-in" en la sección de Ubicación del Local. Guardado en `admin_settings` key `geo_strict_mode`. Default: desactivado.

### Archivos afectados
- `src/components/features/check-in/CheckInForm.tsx`
- `src/app/api/check-in/route.ts`
- `src/app/(dashboard)/dashboard/settings/page.tsx`

---

## [1.0.5] — 2026-05-28 — Geolocalización anti QR-scam + Dashboard ubicación

### Added

**Frontend — Geolocalización en CheckInForm:**
- `src/components/features/check-in/CheckInForm.tsx`: Pide GPS antes de enviar formulario. Estados visuales: requesting (amarillo), verified (verde), denied (rojo con botón reintentar). Envía `lat` y `lon` en el body del POST a `/api/check-in` en lookup, checkin y register.

**Backend — Validación de distancia en check-in:**
- `src/app/api/check-in/route.ts`: Recibe `lat` y `lon` del body. Consulta `restaurant_locations` para obtener coordenadas del local. Calcula distancia con `calculateDistanceMeters()`. Si `distance > radius_meters` → retorna 403 "Fuera del local". Guarda `checkin_lat`, `checkin_lon`, `checkin_distance_meters` en `customers` tras check-in exitoso.

**API — Endpoint de ubicación del restaurante:**
- `src/app/api/dashboard/location/route.ts` — **NUEVO**: GET (leer ubicación activa) y PUT (actualizar lat/lon/radius/address) para `restaurant_locations`. Auth requerida.

**Dashboard — Sección de ubicación en Ajustes:**
- `src/app/(dashboard)/dashboard/settings/page.tsx`: Nueva sección "Ubicación del Local" con inputs para latitud, longitud, radio (metros) y dirección. Carga datos desde `/api/dashboard/location` al iniciar. Guarda con PUT al mismo endpoint.

**Documentación:**
- `docs/DB_SCHEMA.md`: Tabla `restaurant_locations`, columnas geolocalización en `customers`, migración 00014.
- `docs/API_DOCS.md`: Endpoints GET/PUT `/api/dashboard/location`.

---

## [1.0.5-1] — 2026-05-28 — Fix: Migración y helper de geolocalización faltantes

### Fixed

**Archivos de geolocalización reconstruidos:**
- `supabase/migrations/00014_geolocation.sql` — **RESTAURADO**: Contiene ALTER TABLE `customers` (columnas `checkin_lat`, `checkin_lon`, `checkin_distance_meters`), CREATE TABLE `restaurant_locations`, índice parcial `idx_customers_checkin_location`, RLS policies, trigger `handle_updated_at` y seed data de la sede principal. Este archivo había desaparecido del directorio de migraciones.
- `src/lib/utils/geolocation.ts` — **CREADO**: Helper con `getCurrentPosition()` (wrapper promisificado de `navigator.geolocation`) y `calculateDistanceMeters()` (fórmula Haversine). El build fallaba porque `check-in/route.ts` y `CheckInForm.tsx` lo importaban pero el archivo no existía.

### Archivos afectados
- `supabase/migrations/00014_geolocation.sql`
- `src/lib/utils/geolocation.ts`

---

## [1.0.4] — 2026-05-25 — Fix plantillas WhatsApp + Customer Journey + Roadmap visual de tiers

### Fixed

**Variables de plantillas WhatsApp corregidas:**
- `src/app/api/cron/birthday/route.ts`: `{{2}}` ahora envía `buildTiersRoadmap(customer.total_points)` (puntos actuales) en vez de `buildRewardsRoadmap(customer.total_visits)` (visitas legacy).
- `src/app/api/cron/reactivation/route.ts` (suave): `{{2}}` ahora envía puntos actuales, `{{3}}` envía premio próximo del tier. Antes solo enviaba 2 variables con roadmap de visitas.
- `src/app/api/cron/reactivation/route.ts` (agresiva): Ahora envía `{{4}}` con recompensa especial configurada (`reactivation_aggressive_reward_id`). Nuevo setting disponible.
- `src/app/api/dashboard/campaigns/manual/route.ts`: `{{2}}` ahora envía `customer.total_points` en vez de `customer.total_visits`.
- `src/app/api/webhook/delivery/route.ts`: Plantilla de bienvenida ahora envía 3 variables (nombre, puntos, roadmap tiers) igual que el check-in QR.

**Customer Journey — Cap mensual y frequency cap:**
- `src/app/api/dashboard/campaigns/manual/route.ts`: Agregado `filterByMonthlyCap()` → campañas manuales ahora respetan el límite de 3 mensajes/marketing por mes por cliente. Reporta `totalSkippedMonthlyCap`.
- `src/app/api/cron/reactivation/route.ts`: Agregado `filterByMonthlyCap()` tanto para clientes suaves (21d) como agresivos (25d+). Reactivaciones ahora cuentan para el cap mensual.
- `src/services/campaign.service.ts`: `getOrCreateTodayCampaign()` ahora establece `source: type` (birthday/reactivation) en vez de dejar el default 'manual'. Esto corrige el conteo del monthly cap.
- `src/app/api/dashboard/campaigns/manual/route.ts`: Agregado `getActiveBlackouts()` para pre-event blackout. Campañas manuales ahora reportan `totalSkippedBlackout`.

**UI Check-in — Roadmap visual de tiers:**
- `src/components/features/check-in/TiersRoadmap.tsx` — **NUEVO** componente visual que muestra todos los tiers con: emoji, nombre, umbral de puntos, premio seguro, indicador Mystery Box, estado visual (✅ alcanzado / 🔥 próximo / 🔒 bloqueado).
- `src/app/api/check-in/route.ts`: Ahora devuelve `tiers: allTiers` en la respuesta de check-in.
- `src/components/features/check-in/CheckInSuccess.tsx`: Integrado `<TiersRoadmap>` debajo de `<PointsDisplay>`. El cliente ve su camino completo de recompensas.

**Documentación:**
- `docs/PLANTILLAS.md`: Agregada sección "Requisito de Opt-Out (Obligatorio para Meta)" con tabla de todas las plantillas que requieren opt-out y opciones de implementación.
- Variables de reactivación agresiva actualizadas: ahora incluye `{{4}}` para recompensa especial.

### Archivos afectados
- `src/app/api/cron/birthday/route.ts`
- `src/app/api/cron/reactivation/route.ts`
- `src/app/api/dashboard/campaigns/manual/route.ts`
- `src/app/api/webhook/delivery/route.ts`
- `src/app/api/check-in/route.ts`
- `src/services/campaign.service.ts`
- `src/components/features/check-in/TiersRoadmap.tsx` *(nuevo)*
- `src/components/features/check-in/CheckInSuccess.tsx`
- `src/components/features/check-in/CheckInSuccess.types.ts`
- `src/components/features/check-in/CheckInForm.types.ts`
- `src/components/features/check-in/index.ts`
- `src/app/(public)/check-in/page.tsx`
- `docs/PLANTILLAS.md`

---

## [1.0.3] — 2026-05-25 — Dashboard: Tiers CRUD + Configuración de Puntos + Mystery Box

### Added

**API REST de Reward Tiers (`src/app/api/dashboard/reward-tiers/route.ts`):**
- Nuevo endpoint GET/POST/PATCH/DELETE para CRUD completo de `reward_tiers`.
- GET lista todos los tiers (incluidos inactivos) ordenados por `sort_order`.
- POST valida umbral único, probabilidades suman 100%, BLACK único activo.
- PATCH actualiza cualquier campo con validación individual.
- DELETE soft-delete (desactiva) si hay clientes, hard-delete si no hay y se pide explícitamente.

**Dashboard de Tiers (`src/app/(dashboard)/dashboard/rewards/page.tsx`):**
- Reescritura completa de la página legacy de milestones por visita.
- Tabla de tiers con columnas: Emoji, Umbral (pts), Premio Seguro, Mystery Box ON/OFF, Estado, Acciones (editar/toggle/eliminar).
- Dialog de creación/edición con: nombre del tier, umbral de puntos, premio seguro, toggle BLACK, toggle Mystery Box.
- Si Mystery Box ON: tabla dinámica de premios con emoji, título y probabilidad %. Validación en tiempo real de que las probabilidades sumen 100%.
- Eliminación con advertencia de soft-delete si hay clientes asociados.

**Configuración de Puntos en Settings (`src/app/(dashboard)/dashboard/settings/page.tsx`):**
- Nueva sección "Sistema de Puntos" con feature flag toggle.
- Campos configurables: puntos por visita (min/max), puntos de bienvenida (min/max), shortfall (min/max), pity timer threshold.
- Todos los valores se guardan en `admin_settings` y se leen por los servicios de backend.

### Changed

**Welcome bonus aleatorio (`src/services/points.service.ts`):**
- `getPointsConfig()` ahora lee `welcome_bonus_points_min` y `welcome_bonus_points_max` (antes era un solo `welcome_bonus_points`).
- `awardWelcomeBonus()` genera puntos aleatorios en el rango `[min, max]` (antes era valor fijo).

**Constantes (`src/constants/rewards.ts`):**
- `DEFAULT_WELCOME_BONUS_POINTS` cambiado de `0` a `75` (mínimo del rango de bienvenida).
- Nuevo `DEFAULT_WELCOME_BONUS_POINTS_MAX = 90`.

### Archivos afectados
- `src/app/api/dashboard/reward-tiers/route.ts` *(nuevo)*
- `src/app/(dashboard)/dashboard/rewards/page.tsx` *(reescrito)*
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/constants/rewards.ts`
- `src/services/points.service.ts`
- `docs/features/points-mystery-box.md`
- `docs/DB_SCHEMA.md`
- `CHANGELOG.md`

### Request original
> Dashboard de Tiers + Configuración de Puntos + Mystery Box. Transformar `/dashboard/rewards` de milestones legacy a CRUD completo de tiers con Mystery Box. Agregar sección de puntos en settings. Welcome bonus aleatorio 75-90.

---

## [1.0.2] — 2026-05-25 — Fix: flujo check-in + gamificación (integración y robustez)

### Fixed

**API de check-in resistente a fallos (`src/app/api/check-in/route.ts`):**
- `buildTiersRoadmap()`, `getAllTiers()`, `evaluateNewTier()`, `getNextTier()`, `getUpcomingRewards()`, `buildRewardsRoadmap()` ahora envueltos en `try/catch`.
- Si el sistema de puntos/tiers falla (tablas no existen, migración 00013 no ejecutada), el registro y check-in básico siguen funcionando en vez de devolver 500.

**Teléfono pasa correctamente al componente de éxito:**
- `CheckInForm` ahora pasa `phone` explícitamente en todos los callbacks (`onLookupResult`, `onRegisterSuccess`, `onCheckInSuccess`).
- Eliminado `lastPhone` y anti-patrón `document.querySelector('input[type="tel"]')` de `page.tsx`.
- `CheckInSuccess` recibe `customerPhone` correctamente → los botones de safe/mystery en `RewardChoice` ahora funcionan.

**Puntos visibles para clientes nuevos (`CheckInSuccess.tsx`):**
- `isPointsBased` ahora incluye `'welcome'`.
- Los clientes que se registran por primera vez ven sus puntos de bienvenida + barra de progreso hacia el primer tier.

**Feedback de errores en Mystery Box (`CheckInSuccess.tsx`):**
- `toast.error()` cuando: no hay teléfono, API responde `ok: false`, o error de red.
- Antes el botón simplemente no hacía nada sin feedback visual.

**Duplicados correctamente manejados:**
- Status 429 de la API ahora se mapea a `message: 'duplicate'` en vez de `'welcome_back'`.
- `page.tsx` maneja el tipo `'duplicate'` mostrando "Ya registraste tu visita hoy".

**Tipos TypeScript:**
- `CheckInResult.message` ahora incluye `'duplicate'`.
- `MysteryBoxResponse` ahora incluye `message?: string`.
- Variables `welcomeRoadmap`, `allTiers`, `upcomingRewards` correctamente tipadas en `route.ts`.

### Archivos afectados
- `src/app/api/check-in/route.ts`
- `src/components/features/check-in/CheckInForm.types.ts`
- `src/components/features/check-in/CheckInForm.tsx`
- `src/app/(public)/check-in/page.tsx`
- `src/components/features/check-in/CheckInSuccess.tsx`

### Request original
> Mira estoy trancado en un problema, analiza mi repo y ve mi codigo original... al entrar en el nuevo desarrollo antes pasabamos de la pagina en la que recopilamos los datos (nombre, celular, ciudad etc) pero no tiraba ruleta ni nada, parecia un desarrollo vacio... ahora ni siquiera pasa de la tabla donde pide los datos.

---

## [1.0.1] — 2026-05-25 — Algoritmo inteligente de puntos + Plantillas dopamínicas v1.0

### Changed

**Algoritmo de puntos inteligente (`points.service.ts`):**
- `generateSmartVisitPoints()` reemplaza al random simple. Visita 1: 60-90 pts (alto, crea ilusión de 2 visitas). Visita 2: sistema limita para dejar 5-30 pts corto del umbral. Visita 3: garantiza cruzar → PREMIO.
- `awardVisitPoints()` ahora consulta tiers para encontrar el próximo umbral y usa el algoritmo inteligente.
- Nuevas constantes: `DEFAULT_POINTS_SHORTFALL_MIN=5`, `DEFAULT_POINTS_SHORTFALL_MAX=30`, `MINIMUM_VISIBLE_POINTS=15`.
- Rango default actualizado: `DEFAULT_POINTS_PER_VISIT_MIN=60`, `DEFAULT_POINTS_PER_VISIT_MAX=90`.

**Plantillas WhatsApp (`docs/PLANTILLAS.md`):**
- Reescritura completa de PLANTILLAS.md para sistema de puntos. 13 plantillas (11 texto + 2 media).
- Tono dopamínico: cálido, cercano, enérgico. Eliminado lenguaje genérico ("estás a un paso 👊").
- Todas las plantillas ahora incluyen puntos actuales, progreso, y anticipación de mystery box.
- Plantilla "cerca": "¡Casi lo lograste! La próxima visita tenés tu bebida o si querés probar suerte, la Mystery Box 🎲"
- Plantilla "lejos": muestra roadmap completo de tiers con emojis.
- Reactivación en 2 niveles: suave (21d) y agresiva (25d+) ambas con puntos.

**Migración seeds:**
- `00013_points_mystery_box.sql` — Seeds actualizados: `points_per_visit_min=60`, `points_per_visit_max=90`.

**Feature doc:**
- `docs/features/points-mystery-box.md` — Sección 2.2 reescrita con matemáticas del algoritmo inteligente y ejemplo paso a paso.

### Archivos afectados
- `src/services/points.service.ts`
- `src/constants/rewards.ts`
- `docs/PLANTILLAS.md` *(reescritura completa)*
- `docs/features/points-mystery-box.md`
- `supabase/migrations/00013_points_mystery_box.sql`
- `CHANGELOG.md`

---

## [1.0.0] — 2026-05-25 — Sistema de Puntos + Mystery Box (reestructuración mayor)

### Added

**Base de datos (migración 00013):**
- `supabase/migrations/00013_points_mystery_box.sql` — Nuevas tablas: `reward_tiers` (progresión acumulativa por puntos), `point_transactions` (historial de puntos), `mystery_box_results` (resultados de cajas), `mystery_box_global_caps` (límites globales de premios altos). Nuevas columnas en `customers`: `total_points`, `current_tier`, `mystery_box_low_streak`, `last_points_awarded_at`. Columnas legacy-compat en `rewards`: `point_threshold`, `tier_id`. Seeds: 4 tiers default (Bronce/Plata/Oro/BLACK), admin_settings de puntos, global cap de platos fuertes.

**Servicios:**
- `src/services/points.service.ts` — Generación de puntos aleatorios con distribución triangular, `awardVisitPoints()`, `awardWelcomeBonus()`, `awardPoints()`, `getPointsConfig()`, `getPointHistory()`.
- `src/services/mystery-box.service.ts` — Resolución de Mystery Box con probabilidades ponderadas, Pity Timer (Golden Box), global caps con redistribución automática, near-miss effect, `resolveMysteryBox()`, `isPityTimerActive()`, `selectPrize()`, `applyGoldenBox()`.
- `src/services/reward-tiers.service.ts` — CRUD de tiers, evaluación de umbrales (`evaluateNewTier()`), roadmap de tiers (`buildTiersRoadmap()`), `getNextTier()`, `getCurrentTier()`.

**Endpoints:**
- `src/app/api/mystery-box/resolve/route.ts` — POST: resuelve mystery box o safe reward, envía plantilla WhatsApp, registra resultado.

**Tipos:**
- `src/types/database.types.ts` — Nuevos tipos: `PointTransaction`, `PointTransactionSource`, `RewardTier`, `MysteryPrize`, `MysteryBoxResult`, `MysteryBoxChoice`, `MysteryBoxGlobalCap`, `GlobalCapPeriod`.

**Constantes:**
- `src/constants/rewards.ts` — `REACTIVATION_AGGRESSIVE_DAYS=25`, `DEFAULT_POINTS_PER_VISIT_MIN/MAX`, `DEFAULT_WELCOME_BONUS_POINTS`, `DEFAULT_EVENT_BONUS_POINTS`, `DEFAULT_PITY_TIMER_THRESHOLD`, `POINT_SOURCES`.

**Documentación:**
- `docs/features/points-mystery-box.md` — Documento de diseño completo: modelo de puntos, reward tiers, mystery box, pity timer, global caps, flujo del cliente, plantillas, plan de implementación.

### Changed
- `src/app/api/check-in/route.ts` — Integrado sistema de puntos: otorga puntos aleatorios por visita, evalúa tier progression, responde con `tier_unlocked` o `points_earned`, mantiene fallback legacy a plantillas de visitas.
- `src/app/api/cron/reactivation/route.ts` — Dos niveles de reactivación: suave (21d) con plantilla original + agresivo (25d+) con puntos y tier info.

### Archivos afectados
- `supabase/migrations/00013_points_mystery_box.sql` *(nuevo)*
- `src/services/points.service.ts` *(nuevo)*
- `src/services/mystery-box.service.ts` *(nuevo)*
- `src/services/reward-tiers.service.ts` *(nuevo)*
- `src/app/api/mystery-box/resolve/route.ts` *(nuevo)*
- `src/types/database.types.ts`
- `src/constants/rewards.ts`
- `src/app/api/check-in/route.ts`
- `src/app/api/cron/reactivation/route.ts`
- `docs/features/points-mystery-box.md` *(nuevo)*

### Request original
> Reestructuración del sistema de fidelización: migrar de milestones lineales por visita a sistema de puntos aleatorios acumulativos con Mystery Box (ruleta de probabilidades), Pity Timer (Golden Box tras racha de premios bajos), global caps para premios de alto valor, reward tiers progresivos (Bronce→Plata→Oro→BLACK), reactivación en dos niveles (21d suave + 25d agresivo), tono dopamínico Meta-compliant.

---

## [0.35.0] — 2026-05-24 — Plantillas WhatsApp con media + auto-compresión + cron calendar-dispatch

### Added

**Auto-compresión de imágenes (`sharp`):**
- `src/app/api/dashboard/calendar/media-upload/route.ts` — Imágenes subidas al bucket se comprimen automáticamente con `sharp`: resize a max 1920×1920px (sin ampliar), output JPEG 80%, progressive. El dueño puede subir hasta 30 MB de entrada; el sistema garantiza que el resultado quede bien bajo el límite de 5 MB de WhatsApp. Videos: se mantiene la validación de 16 MB directa con mensaje de error descriptivo. Respuesta ahora incluye `bytes` (comprimido), `original_bytes`, `compressed` (boolean).
- `package.json` — `sharp ^0.34.5` como dependencia de producción (ya estaba en el lockfile).

**Plantillas de media Twilio (`twilio/media`):**
- `scripts/twilio-create-media-templates.mjs` — Script de setup que crea dos plantillas tipo `twilio/media` en Twilio Content API: `evento_imagen_<brand>` (imagen JPG/PNG) y `evento_video_<brand>` (MP4). Variables: `{{1}}`=nombre cliente, `{{2}}`=restaurante, `{{3}}`=título evento, `{{4}}`=fecha, `{{5}}`=CTA, `{{6}}`=URL del media (dinámica al enviar). Auto-envía para aprobación Meta con categoría MARKETING. Imprime los SIDs para agregar en `admin_settings`.

**Path de envío de eventos del calendario:**
- `src/services/campaign.service.ts` — Nueva función `createCalendarCampaign({ name, templateSid, mediaUrl, mediaType, filters })`: crea campaign con `type='manual'` y `source='calendar'` para que cuente en el cap mensual de marketing.
- `src/services/calendar.service.ts` — Nueva función `executeAutoEvent(eventId)`: idempotente (marca el evento como `sent` antes de enviar para evitar doble despacho), resuelve template SID desde `admin_settings` (`event_template_image_sid` / `event_template_video_sid`), aplica `filterByMonthlyCap`, crea campaign record, envía template con variables `{{1}}-{{6}}`, registra mensajes, finaliza campaign, actualiza `last_campaign_at`. Si falla, rollback a `status='failed'`. Devuelve `{ sent, failed, excluded_monthly_cap, campaign_id }`.

**Cron de despacho automático:**
- `src/app/api/cron/calendar-dispatch/route.ts` — GET/POST protegido con `CRON_SECRET`. Busca eventos `send_mode='auto'` + `status='scheduled'` + `scheduled_send_at <= now()` vía `findDueAutoEvents()`. Llama a `executeAutoEvent()` por cada uno. Idempotente: cada evento ya se auto-marca como `sent` en la primera ejecución. Responde con totales agregados.
- `vercel.json` — Cron `*/15 * * * *` en `/api/cron/calendar-dispatch` (cada 15 minutos, latencia máxima de 15 min desde el `scheduled_send_at` configurado).

### Changed
- `src/services/calendar.service.ts` — Actualizado el jsdoc de alcance (ya no es stub) + imports de `settings.service`, `campaign.service`, `whatsapp.service`.

### Archivos afectados
- `src/app/api/dashboard/calendar/media-upload/route.ts`
- `src/services/campaign.service.ts`
- `src/services/calendar.service.ts`
- `src/app/api/cron/calendar-dispatch/route.ts` *(nuevo)*
- `scripts/twilio-create-media-templates.mjs` *(nuevo)*
- `vercel.json`

### Request original
> Variables de plantilla sin conflicto (cada plantilla tiene su propio scope `{{1}}-{{N}}`). Auto-compresión de imágenes para dueños que no saben cuánto pesa un archivo. Plantillas de festival/promo independientes de las de recompensa. Cron de dispatch de eventos programados.

---

## [0.34.1] — 2026-05-24 — Fix: tipo canónico RestaurantEvent para evitar error de build en Vercel

### Fixed
- `src/app/(dashboard)/dashboard/calendar/page.tsx` — Eliminada interfaz local `RestaurantEvent`; ahora importa el tipo canónico desde `@/types/database.types`. Resuelve error TypeScript de parámetros incompatibles al pasar el evento a `EventDetailDrawer`.
- `src/components/dashboard/Calendar/CalendarMonthView.tsx` — Mismo fix: eliminada interfaz local, importa `RestaurantEvent` desde `@/types/database.types`.
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx` — Eliminada interfaz local + `TYPE_COLORS`/`STATUS_LABELS` locales. Importa `RestaurantEvent`, `EventType`, `EventStatus` desde `@/types/database.types`.

### Archivos afectados
- `src/app/(dashboard)/dashboard/calendar/page.tsx`
- `src/components/dashboard/Calendar/CalendarMonthView.tsx`
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx`

### Request original
> Build de Vercel fallaba: "Type 'RestaurantEvent' is missing the following properties" — tres archivos definían su propia interfaz local, TypeScript las trataba como tipos nominalmente distintos.

---

## [0.34.0] — 2026-05-24 — Calendario operativo de eventos (data layer + UI)

### Added

**Base de datos:**
- `supabase/migrations/00012_calendar_events_and_media.sql` — Tabla `restaurant_events` (id, title, description, event_date, event_time, event_type, send_mode, scheduled_send_at, filters, media_url, media_type, content_sid, campaign_id, status, blackout_days, created_at, updated_at). Índices sobre date, status, scheduled_send_at. RLS activado. Columnas nuevas en `campaigns`: `source`, `media_url`, `media_type`. Bucket público `event-media` en Supabase Storage.

**Constantes:**
- `src/constants/rewards.ts` — `MONTHLY_MARKETING_CAP = 3`, `MONTHLY_CAP_SOURCES`, `DEFAULT_PRE_EVENT_BLACKOUT_DAYS = 5`.

**Tipos:**
- `src/types/database.types.ts` — Tipos `CampaignSource`, `EventType`, `EventSendMode`, `EventStatus`, `EventMediaType`, interfaz `RestaurantEvent`. Extendida interfaz `Campaign` con `source`, `media_url`, `media_type`. Extendida `Database` con `restaurant_events`.

**Servicios:**
- `src/services/calendar.service.ts` — CRUD de eventos: `createEvent`, `listEvents`, `getEvent`, `updateEvent`, `cancelEvent`. Helpers: `findCustomersForEvent`, `findDueAutoEvents`. Sin lógica de envío (path de plantillas con media pausa pendiente aprobación Meta).
- `src/services/campaign.service.ts` — Nuevas funciones: `getCustomersAtMonthlyCap`, `filterByMonthlyCap`, `getActiveBlackouts`.

**Endpoints (API):**
- `src/app/api/dashboard/calendar/events/route.ts` — `GET ?from=&to=` (listar rango), `POST` (crear evento).
- `src/app/api/dashboard/calendar/events/[id]/route.ts` — `GET` (detalle), `PATCH` (actualizar título/descripción), `DELETE` (cancelar).
- `src/app/api/dashboard/calendar/media-upload/route.ts` — `POST` (upload a bucket `event-media`, valida MIME + tamaño), `DELETE` (borrar asset del bucket).

**Frontend:**
- `src/app/(dashboard)/dashboard/calendar/page.tsx` — Página principal del calendario: navegación de mes, barra de stats (total/planeados/programados/enviados), integra `CalendarMonthView`, `EventCreateDialog`, `EventDetailDrawer`.
- `src/components/dashboard/Calendar/CalendarMonthView.tsx` — Grid mensual lunes-first, pills coloreados por tipo de evento, indicadores de blackout, highlight del día actual, leyenda.
- `src/components/dashboard/Calendar/EventCreateDialog.tsx` — Formulario completo: título, descripción, fecha+hora, tipo de evento, modo de envío (remind/auto), fecha de auto-envío, MediaUploader, filtros de audiencia (ciudad, visitas min/max), días de blackout.
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx` — Sheet lateral: preview de media, metadata del evento, edición inline (título/descripción), cancelación suave.
- `src/components/dashboard/Calendar/MediaUploader.tsx` — Drag-drop, validación MIME (JPG/PNG/MP4) y tamaño (5MB/16MB), preview, integración con `/api/dashboard/calendar/media-upload`.
- `src/components/layout/DashboardSidebar.tsx` — Nuevo ítem "Calendario" (con icono `CalendarDays`) entre Campañas y Código QR.

**Documentación:**
- `docs/features/calendar.md` — Feature doc completo: scope, decisiones de diseño, estado actual (qué funciona, qué está pausado pendiente Meta).
- `docs/DB_SCHEMA.md` — Nuevas secciones: tabla `restaurant_events`, columnas nuevas de `campaigns`, bucket `event-media`, migración 00012.
- `docs/API_DOCS.md` — 7 nuevos endpoints del calendario documentados.

### Changed
- `docs/features/gamificacion-y-qr-fisico.md` — Agregado al repo (doc de investigación sobre gamificación y QR físico).

### Notes
- El path de auto-envío (plantillas `twilio/media` + cron `calendar-dispatch`) está deliberadamente excluido de este release. Depende de aprobación de Meta para plantillas con media (24-72h). Ver `docs/features/calendar.md` sección "Pendiente".
- Monthly marketing cap (3 msg/mes/cliente) y pre-event blackout están implementados en servicios pero no aplicados todavía en los endpoints de campañas manuales — se conectarán en el siguiente sprint.

### Request original
> "Desarrolla el calendario, no toques nada de las plantillas. Construye el front end y sube solo a esa repo que te pasé."

---

## [0.33.0] — 2026-05-12 — Nivel BLACK: tier máximo configurable en programa de fidelidad

### Added
- `supabase/migrations/00011_rewards_black_tier.sql` — Columna `is_black` (boolean, default false) en tabla `rewards`. Marca el nivel BLACK (tier máximo del programa).
- `src/types/database.types.ts` — Campo `is_black: boolean` en interfaz `Reward`.
- `src/components/features/check-in/CheckInForm.types.ts` — `is_black?: boolean` en `RoadmapItem` y en el campo `reward` de `CheckInResult`.
- `src/components/features/check-in/CheckInSuccess.types.ts` — `is_black?: boolean` en `RoadmapItem` y en `reward` de `CheckInSuccessProps`.
- `src/services/reward.service.ts` — `getUpcomingRewards` ahora devuelve `is_black`. `buildRewardsRoadmap` muestra `👑 BLACK` con corona cuando el reward es nivel BLACK, tanto si es el siguiente como si aparece en la lista de después.
- `src/app/api/dashboard/rewards/route.ts` — POST acepta `is_black: true`; valida que no exista ya una recompensa BLACK activa (409 si hay conflicto). PATCH acepta `is_black`.
- `src/app/api/check-in/route.ts` — La respuesta del check-in incluye `is_black` en el objeto reward para que el frontend muestre la celebración correcta.
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — Tabla muestra badge dorado `👑 BLACK` en la fila del nivel black; diálogo de creación incluye toggle "Nivel BLACK" con descripción.
- `src/components/features/check-in/CheckInSuccess.tsx` — Pantalla especial dark/gold para cuando el cliente alcanza el nivel BLACK. En el roadmap, el ítem BLACK muestra corona y estilo diferenciado.

### Changed
- `src/app/api/cron/birthday/route.ts` — Ahora incluye `roadmap` como `{{2}}` en las variables de la plantilla de cumpleaños.
- `src/app/api/cron/reactivation/route.ts` — `no_reward` mode: añade `roadmap` como `{{2}}`. `with_reward` mode: corregido gap de variable secuencial; ahora `{{2}}`=premio, `{{3}}`=roadmap (antes enviaba `{{1}}` y `{{3}}` sin `{{2}}`, que Meta rechaza).
- `docs/PLANTILLAS.md` — Documento nuevo con las 8 plantillas, tabla de variables, reglas Meta, flujo completo y checklist.

---

## [0.32.0] — 2026-05-12 — Radar fix, templates con samples, ciudad en delivery, números autorizados

### Fixed
- `src/app/api/dashboard/campaigns/segments/route.ts` — **Radar mostrando 0 clientes**: el query builder de Supabase es mutable; reusar la misma variable `base` en `Promise.all` causaba que los filtros se apilaran en el mismo objeto. Ahora usa `getBase()` que crea un builder fresco por cada query.

### Added
- `src/app/(dashboard)/dashboard/templates/page.tsx` — **Valores de ejemplo para variables**: al crear una plantilla con `{{1}}`, `{{2}}`, etc. aparecen inputs para definir samples obligatorios. Sin esto, Meta aprueba la plantilla solo para mensajes de sesión (24h) pero no para outbound marketing. Botón cambiado de "Crear y Enviar" → "Enviar a Aprobación de WhatsApp".
- `src/app/api/dashboard/authorized-numbers/route.ts` — API GET (listar) + POST (crear) números autorizados de meseros.
- `src/app/api/dashboard/authorized-numbers/[id]/route.ts` — API PATCH (toggle activo) + DELETE (eliminar).
- `src/app/(dashboard)/dashboard/authorized-numbers/page.tsx` — Página completa para gestionar meseros: tabla con toggle activo/inactivo, eliminar, agregar via dialog.
- `src/components/layout/DashboardSidebar.tsx` — Link "Meseros" con icono ShieldCheck en sidebar.
- `src/services/customer.service.ts` — `updateCustomerCityIfNull()` para actualizar ciudad de cliente existente si la recibe desde delivery.

### Changed
- `src/app/api/webhook/delivery/route.ts` — Ahora acepta campo `ciudad` en el payload. Si el cliente es nuevo, se guarda como `city`. Si ya existe y no tiene ciudad, se actualiza.

---

## [0.31.0] — 2026-05-11 — UX: filtros de clientes, edición de cliente, tabs campañas, Settings unificado

### Added
- `src/app/(dashboard)/dashboard/customers/page.tsx` — Barra de filtros por Canal (QR / Domicilio / Ambos), Nivel (Plata / Oro / Platino / Black) y Estado (Activos / Recuperación / Perdidos). Los filtros se envían como query params y se resetea la paginación al cambiar cualquier filtro.
- `src/services/dashboard.service.ts` — `getCustomers` acepta parámetros `source`, `tier` y `status` para filtrar clientes en la DB.
- `src/app/api/dashboard/customers/route.ts` — Extrae y pasa los nuevos parámetros de filtro al servicio.
- `src/app/api/dashboard/customers/[id]/route.ts` — `PATCH` endpoint para editar datos del cliente: `name`, `birthday`, `city`, `accepts_marketing`.
- `src/components/dashboard/CustomerDetailDialog.tsx` — Modo edición activado por botón lápiz en el header. Permite editar nombre, cumpleaños, ciudad y consentimiento de marketing. Guarda vía `PATCH /api/dashboard/customers/[id]`.

### Changed
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — Reestructurado con tabs (shadcn Tabs): **Automáticas** (campañas cron + TwilioWallet), **Manuales** (ManualCampaigns), **Historial** (tabla). El SegmentRadar queda sobre los tabs como vista global.
- `src/app/(dashboard)/dashboard/settings/page.tsx` — Reemplazados todos los `<input>` nativos con shadcn `<Input>`, botones HTML con `<Button>`, y `<select>` estilizado con clases Tailwind consistentes con el design system. Eliminada la dependencia de `input-premium`.

---

## [0.30.0] — 2026-05-10 — Múltiples correcciones post-deploy (heatmap, n8n chat hook, rewards UI, segments radar)

### Fixed
- `src/services/dashboard.service.ts` — Heatmap usaba `getDay()`/`getHours()` en UTC, causando un desfase de 5 horas para Colombia (UTC-5). Ahora convierte a `America/Bogota` via `Intl` nativo antes de extraer día y hora.
- `n8n/domicilios_whatsapp_v4.json` — Nodo `parse_dom_1`: solo buscaba remitente en `From/from/sender` (campos de Twilio). Cuando se usa un n8n Chat Trigger no existe campo `From` → lanzaba error. Ahora también soporta `chatInput`/`message` para el body, y extrae el celular del cuerpo del mensaje si no hay remitente en los campos estándar (regex: `celular: 3XXXXXXXXX`, `+57 3XXXXXXXXX`, o número suelto de 10 dígitos).
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — Eliminada columna "Mensaje WhatsApp" (`message_template`) de la tabla: los mensajes los define la plantilla Twilio, no este campo. Eliminados: `buildPreviewTemplate`, `previewTemplate`, bloque de vista previa verde en el dialog, e import `MessageSquare`.
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — Typo: "autom**á**ticamente" → "automaticamente" (sin acento) en `CardDescription` y `DialogDescription`.
- `src/app/api/dashboard/campaigns/segments/route.ts` — Filtro `accepts_marketing` ahora incluye `NULL` (clientes legacy registrados antes de la migración de consentimiento). Antes `.eq('accepts_marketing', true)` excluía todos los NULL → radar mostraba 0 clientes.
- `src/app/api/dashboard/campaigns/segments/route.ts` — Segmento "Perdidos": `last_visit_at IS NULL` ahora incluido con `.or('last_visit_at.is.null,...')`. Clientes sin ninguna visita registrada ya aparecen en el segmento correcto.

---

## [0.29.0] — 2026-05-10 — Dashboard auto-refresh cada 60 segundos

### Fixed
- `src/hooks/useDashboardAnalytics.ts` — El hook cargaba datos una sola vez al montar. Si clientes se registraban con el dashboard ya abierto, las métricas quedaban desactualizadas hasta recargar la página. Ahora hace polling cada 60 segundos con `cache: 'no-store'`.

---

## [0.28.0] — 2026-05-10 — Consentimiento de marketing desmarcado por defecto (legal)

### Fixed
- `src/components/features/check-in/CheckInForm.tsx` — El checkbox `accepts_marketing` arrancaba marcado (`true`), lo que viola la Ley 1581 de 2012 (Colombia) que exige consentimiento explícito, previo e informado. Ahora inicia desmarcado (`false`) y el botón de registro permanece deshabilitado hasta que el usuario lo acepte activamente.

---

## [0.27.0] — 2026-05-10 — Ciudad con combobox autocomplete

### Changed
- `src/components/features/check-in/CheckInForm.tsx` — Reemplaza el input de texto libre para ciudad por un combobox con lista de ~70 ciudades colombianas. El usuario escribe la primera letra y ve hasta 6 sugerencias filtradas. Elimina errores de ortografía como "Medellin", "Medelli", "Envigdo".

---

## [0.26.0] — 2026-05-10 — Selector de cumpleaños con 3 dropdowns + popup reseña sin incentivo

### Changed
- `src/components/features/check-in/CheckInForm.tsx` — Reemplaza `input[type=date]` (dispara calendario nativo del browser) por 3 selects independientes: Día / Mes / Año. Combina el valor en formato `YYYY-MM-DD` antes de enviarlo a la API. Elimina import `Calendar` de lucide-react.
- `src/components/features/check-in/GoogleReviewPopup.tsx` — Elimina el bloque "INCENTIVO ESPECIAL / rollo cortesía" que prometía un premio no autorizado. Reemplaza con mensaje cálido que valora la opinión sin prometer nada. Limpia el footer "para reclamar el incentivo".

---

## [0.25.0] — 2026-05-09 — Radar de Segmentos en campañas + webhook anti-idiotas mejorado

### Added
- `src/components/dashboard/SegmentRadar.tsx` — Componente de 4 tarjetas que muestra en tiempo real: Disponibles (0-17d), Zona Recuperación (18-25d), Perdidos (25+d), En Espera (<7d cap). Incluye porcentajes y tips de acción para cada segmento. Auto-refresh con botón manual.
- `src/app/api/dashboard/campaigns/segments/route.ts` — Endpoint `GET /api/dashboard/campaigns/segments` que calcula los 4 segmentos usando `FREQUENCY_CAP_DAYS`, `RECOVERY_ZONE_START_DAYS`, `RECOVERY_ZONE_END_DAYS`. Protegido por Supabase Auth.
- `docs/features/campaigns.md` — Documento completo del sistema de campañas y control de tráfico.

### Changed
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — Integra `<SegmentRadar />` en la parte superior de la página de campañas.
- `src/app/api/webhook/twilio-incoming/route.ts` — Auto-responder mejorado con detección de intención (pedido, horario, ubicación) y enlace wa.me configurable via `RESTAURANT_WHATSAPP_LINK`. Manejo defensivo de STOP/BAJA/ALTA.
- `.env.example` — Agrega `RESTAURANT_WHATSAPP_LINK`, `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_SHORT`, `NEXT_PUBLIC_BRAND_TAGLINE`.
- `scripts/twilio-setup.mjs` — CLI para configurar Twilio via REST API (Messaging Service, webhook URL).

---

## [0.24.0] — 2026-05-09 — Control de Tráfico Centralizado (Constelarys Fidelity System)

### Request original
> "Evitar colisión entre campañas manuales y crons automáticos. Implementar: Master Cap global 7 días, Jerarquía de Mensajes con Zona de Recuperación, y Reset por Interacción."

### Problem solved
Los motores de envío (cron reactivación y campañas manuales) operaban sin comunicarse entre sí, permitiendo que un cliente recibiera múltiples mensajes en días consecutivos.

### Added — `src/constants/rewards.ts`
- `FREQUENCY_CAP_DAYS = 7` — Constante única y centralizada para el cap global (antes hardcodeada en manual/route.ts)
- `RECOVERY_ZONE_START_DAYS = 18` — Inicio de la Zona de Recuperación
- `RECOVERY_ZONE_END_DAYS = 25` — Fin de la Zona de Recuperación

### Added — `src/services/campaign.service.ts`
- `updateCustomerLastCampaignAt(customerIds[])` — Bulk update de `last_campaign_at` para todos los enviados de un cron

### Changed — `src/services/campaign.service.ts`
- `findInactiveCustomers()` ahora filtra también por `last_campaign_at`: clientes contactados en los últimos 7 días quedan excluidos del cron de reactivación

### Changed — `src/app/api/cron/reactivation/route.ts`
- Recolecta `sentCustomerIds` durante el loop de envío
- Llama `updateCustomerLastCampaignAt()` antes de `finalizeCampaign()` para actualizar el frequency cap global

### Changed — `src/app/api/cron/birthday/route.ts`
- Mismo patrón: recolecta `sentCustomerIds` y llama `updateCustomerLastCampaignAt()`

### Changed — `src/app/api/dashboard/campaigns/manual/route.ts`
- Importa `FREQUENCY_CAP_DAYS`, `RECOVERY_ZONE_START_DAYS`, `RECOVERY_ZONE_END_DAYS` desde constants (eliminada constante local)
- Añade `last_visit_at` al select de clientes para poder evaluar la Recovery Zone
- Aplica exclusión de Recovery Zone (clientes 18-25 días sin visitar) después del frequency cap
- Response incluye nuevo campo `totalSkippedRecoveryZone`

### Changed — `src/app/api/dashboard/campaigns/estimate/route.ts`
- Aplica frequency cap y Recovery Zone en el count SQL para que el estimado sea exacto

### Added — `docs/features/campaigns.md`
- Documento completo del Control de Tráfico Centralizado: reglas, tabla de decisión, flujos por tipo, constantes

---

## [0.23.0] — 2026-05-07 — Plantillas WhatsApp granulares (near/far + reactivación con/sin regalo)

### Request original
> "Variables {{1}}-{{4}}, visit_milestone NULL, near/far, reactivación con/sin regalo, campañas con rewardId. La plantilla controla el texto, el código sólo pasa el título del premio en {{3}}."

### Added — 4 nuevos settings en `admin_settings`
- `welcome_back_near_template_sid` — Visita con próximo premio en visit+1
- `welcome_back_far_template_sid` — Visita con próximo premio en visit+2 o más
- `reactivation_no_reward_template_sid` — Reactivación "te echamos de menos" (sólo {{1}})
- `reactivation_with_reward_template_sid` — Reactivación "vuelve y gana X" ({{1}}, {{3}})
- `reactivation_reward_id` — UUID del reward fijo a ofrecer en reactivación

### Added — Funciones en `reward.service.ts`
- `getRewardTitle(nextReward)` — devuelve sólo el título (`'más beneficios'` si no hay)
- `getRemainingForReward(currentVisits, nextReward)` — distancia al próximo premio (Infinity si no hay)
- `getRewardById(id)` — fetch reward por uuid

### Changed — Variables de plantillas (BREAKING para plantillas que asumían frase completa en {{3}})
- `{{3}}` ahora es **título del premio** (sin frase). Las plantillas Twilio deben rediseñarse para incluir el contexto: "ganas: {{3}}", "podrás ganar: {{3}}", etc.
- `welcome_back_template_sid` queda como fallback legacy si las near/far no están configuradas.
- `reactivation_template_sid` queda como fallback legacy.

### Changed — Lógica de envío
- `check-in/route.ts`: elige near/far según `remaining === 1` o `≥2`. Pasa `{{3}} = nextReward.title`.
- `webhook/delivery/route.ts`: misma lógica near/far.
- `cron/reactivation/route.ts`: 3 modos (with_reward, no_reward, legacy). Si admin configura `reactivation_reward_id` + `reactivation_with_reward_template_sid` usa el modo with_reward.
- `dashboard/campaigns/manual/route.ts`: body acepta `rewardId?: 'auto' | string | 'none'`.

### Changed — `rewards.visit_milestone` ahora nullable
- Permite crear rewards sin milestone (sólo para reactivación o campañas).
- Migración: `00010_rewards_optional_milestone.sql` — `DROP NOT NULL` + índice único parcial.
- POST `/api/dashboard/rewards`: acepta `visit_milestone === null`.
- PATCH `/api/dashboard/rewards`: ahora también permite actualizar `title` y `visit_milestone`.

### Removed
- `buildRewardTemplate()` en `rewards/route.ts` (generaba texto con `{{name}}` que confundía al admin).

### Deprecated
- `buildRewardHint()` en `reward.service.ts` (reemplazado por `getRewardTitle`). Conservado 1 release de transición.

### Files
- ✏️ `src/services/reward.service.ts`
- ✏️ `src/types/database.types.ts` (Reward.visit_milestone: number | null)
- ✏️ `src/app/api/check-in/route.ts`
- ✏️ `src/app/api/webhook/delivery/route.ts`
- ✏️ `src/app/api/cron/reactivation/route.ts`
- ✏️ `src/app/api/dashboard/campaigns/manual/route.ts`
- ✏️ `src/app/api/dashboard/rewards/route.ts`
- ✏️ `src/app/(dashboard)/dashboard/settings/page.tsx`
- ➕ `supabase/migrations/00010_rewards_optional_milestone.sql`
- ✏️ `docs/DB_SCHEMA.md`, `docs/features/qr-checkin.md`, `docs/features/delivery-webhook.md`, `docs/features/flujo-plantillas-recompensas-campanas.md`

### Operación (admin debe hacer)
1. Ejecutar migración `00010_rewards_optional_milestone.sql` en Supabase.
2. Crear/editar 6 plantillas en Twilio con sintaxis `{{1}}, {{2}}, {{3}}` (no `{{name}}`):
   - `bienvenida_primera_visita` — sólo {{1}}
   - `visita_recurrente_cerca_premio` — {{1}}, {{2}}, {{3}}
   - `visita_recurrente_lejos_premio` — {{1}}, {{2}}, {{3}}
   - `ganaste_premio` — {{1}}, {{2}}, {{3}}
   - `feliz_cumpleanos` — sólo {{1}}
   - `reactivacion_sin_regalo` — sólo {{1}}
   - `reactivacion_con_regalo` — {{1}}, {{3}}
3. En Dashboard > Ajustes, asignar los 7 SIDs nuevos + recompensa de reactivación.

---

## [0.21.0] — 2026-04-16 — TEMPLATE-ONLY WhatsApp + Campañas Black + Google Contacts Doc

### BREAKING — Eliminado free-text WhatsApp por completo
- **Problema:** No existe ventana de 24h porque el cliente NUNCA envía un mensaje WhatsApp al negocio (solo escanea QR). Los mensajes free-text NUNCA serían entregados por Meta.
- **Solución:** Todos los mensajes ahora usan PLANTILLAS APROBADAS vía Twilio Content API.
- Se eliminó `sendWhatsApp()` (free-text) de `whatsapp.service.ts`
- Se eliminaron todas las funciones wrapper (sendWelcomeMessage, sendRewardMessage, etc.)
- Solo queda `sendTemplateMessage(phone, contentSid, variables)` como único punto de envío

### Added — 5 plantillas configurables en Dashboard > Ajustes
- `welcome_template_sid` — Registro nuevo ({{1}}=nombre)
- `welcome_back_template_sid` — Visita recurrente ({{1}}=nombre, {{2}}=visitas, {{3}}=hint)
- `reward_template_sid` — Milestone recompensa ({{1}}=nombre, {{2}}=visitas, {{3}}=premio)
- `birthday_template_sid` — Cron cumpleaños ({{1}}=nombre)
- `reactivation_template_sid` — Cron reactivación ({{1}}=nombre, {{2}}=visitas, {{3}}=hint)
- Componente `TemplateSelector` reutilizable con hint de variables y preview

### Added — Settings service compartido
- Nuevo `src/services/settings.service.ts` con `getSettingValue()` y `getMultipleSettings()`
- Elimina duplicación de código en crons y check-in

### Changed — Cron birthday/reactivation sin fallback free-text
- Si no hay plantilla configurada → NO envía, retorna error claro
- Ya no existe fallback a free-text (que nunca funcionaría)

### Added — Campañas exclusivas Black
- Preset "Exclusiva Black" (minVisits=10) en campañas manuales
- Preset "Cerca de un Premio" (minVisits=2, maxVisits=9) para motivar visitas

### Changed — Delivery webhook migrado a plantillas
- `webhook/delivery/route.ts` ahora usa `sendTemplateMessage` + `getMultipleSettings`
- Añadido Google Contacts sync al delivery

### Added — Documentación Google Contacts sync
- `docs/n8n-workflows/README.md` — Workflow 4: paso a paso para crear en n8n
- Incluye: payload completo, nodos a crear, variable de entorno

### Changed — Documentación actualizada
- `docs/features/flujo-plantillas-recompensas-campanas.md` — Reescrito completamente: eliminada info de 24h, todo refleja plantillas
- Mapeo estándar de variables documentado por tipo de mensaje

**Archivos modificados/creados:**
- `src/services/whatsapp.service.ts` — Solo sendTemplateMessage, eliminado free-text
- `src/services/settings.service.ts` — NUEVO: getSettingValue + getMultipleSettings
- `src/app/api/check-in/route.ts` — Usa plantillas + settings service
- `src/app/api/webhook/delivery/route.ts` — Usa plantillas + Google sync
- `src/app/api/cron/birthday/route.ts` — Sin fallback, usa settings service
- `src/app/api/cron/reactivation/route.ts` — Sin fallback, usa settings service + reward hint
- `src/app/(dashboard)/dashboard/settings/page.tsx` — 5 template selectors + TemplateSelector component
- `src/components/dashboard/ManualCampaigns.tsx` — Presets Black exclusive + cerca de premio
- `docs/features/flujo-plantillas-recompensas-campanas.md` — Reescrito
- `docs/n8n-workflows/README.md` — +Workflow 4 Google Contacts

---

## [0.20.0] — 2026-04-16 — Bug Fix Crítico + Tiers sin Nuevo + Cron Templates + Welcome Hint

### Fixed — Bug Crítico Check-in (registro no avanzaba)
- **Causa raíz:** `createVisit` enviaba `table_number: null` a Supabase, pero migración 00009 no estaba ejecutada → columna inexistente → error 500
- **Fix 1:** `visit.service.ts` ahora solo incluye `table_number` en el insert si es non-null
- **Fix 2:** `check-in/route.ts` register: `createVisit` ahora es best-effort (try/catch), no bloquea el registro si falla
- El cliente se crea correctamente y la UI avanza al éxito aunque la visita falle

### Changed — Tiers: Eliminado "Nuevo", todos inician en Plata
- Plata: 0+ visitas (desde la primera)
- Oro: 4+ visitas
- Platino: 7+ visitas
- Black: 10+ visitas
- **Impacto:** Black se alcanza en 10 visitas (antes eran 12+3 de "Nuevo" = 15 percibidas)

### Added — Beneficios Black editables desde Ajustes
- Nueva sección en Settings con editor de beneficios (agregar/editar/eliminar)
- Se guardan como JSON en `admin_settings` key `black_benefits`
- `BlackTierSection` lee los beneficios dinámicamente desde props
- Dashboard pasa benefits de settings a BlackTierSection

### Added — Campañas automáticas con plantilla seleccionable
- En Settings: selectores de plantilla Twilio aprobada para cumpleaños y reactivación
- Se guardan como `birthday_template_sid` y `reactivation_template_sid` en `admin_settings`
- Cron birthday: si hay template SID, usa `sendTemplateMessage` (funciona fuera de 24h)
- Cron reactivation: mismo patrón; fallback a free-text si no hay template

### Changed — Welcome Back incluye hint de próxima recompensa
- Check-in API: busca `getNextReward()` y envía hint en respuesta
- WhatsApp welcome back: incluye "🎁 En tu visita X ganas: [premio]"
- Pantalla de éxito: muestra card verde con hint de próxima recompensa

### Changed — Google Contacts sync mejorado
- Payload ahora incluye: birthday, city, totalVisits (datos organizados de Supabase)
- El flujo es: QR→Supabase→n8n webhook→Google Contacts (usa datos limpios de DB)

**Archivos modificados:**
- `src/services/visit.service.ts` — Fix: table_number condicional
- `src/app/api/check-in/route.ts` — Fix: createVisit best-effort + nextReward hint
- `src/constants/rankings.ts` — Eliminado Nuevo, Plata(0) Oro(4) Platino(7) Black(10)
- `src/app/(dashboard)/dashboard/settings/page.tsx` — Reescrito: +beneficios Black +plantillas cron
- `src/app/api/cron/birthday/route.ts` — Lee template SID de settings
- `src/app/api/cron/reactivation/route.ts` — Lee template SID de settings
- `src/services/whatsapp.service.ts` — sendWelcomeBackMessage +rewardHint
- `src/services/google-contacts-sync.service.ts` — Payload expandido
- `src/components/dashboard/BlackTierSection.tsx` — Benefits dinámicos + 10 visitas
- `src/components/dashboard/CustomerDetailDialog.tsx` — Gradients actualizados
- `src/components/features/check-in/CheckInSuccess.tsx` — Muestra nextRewardHint
- `src/components/features/check-in/CheckInSuccess.types.ts` — +nextRewardHint
- `src/components/features/check-in/CheckInForm.types.ts` — +nextReward en CheckInResult
- `src/app/(public)/check-in/page.tsx` — Pasa nextRewardHint a CheckInSuccess
- `src/app/(dashboard)/dashboard/page.tsx` — Fetch blackBenefits + useEffect

---

## [0.19.0] — 2026-04-15 — QR Mesa + Power System v2 + Black Tier + Dashboard Reorder

### Added — QR por Mesa
- Cada mesa genera su propio QR con parámetro `?mesa=N`
- Selector de mesas con botones + vista previa por mesa
- Botón "Descargar TODAS las mesas" (batch)
- `table_number` almacenado en cada visita para analytics
- Migración `00009_table_number.sql`
- Anti-fraude: detección de 3+ registros seguidos con misma mesa (preparado)

### Changed — Sistema de Poder v2
- Nuevo: 🥈 Plata(3) → 🥇 Oro(6) → ⚜️ Platino(9) → 👑 Black(12)
- Eliminado: Diamante, Bronce, Nuevo tiene minVisits=0
- Colores Black: fondo negro con dorado (#FFD700)
- `LEVEL_THRESHOLDS` exportado para reuso

### Added — Sección Clientes Black
- Componente `BlackTierSection.tsx` con diseño dark/gold premium
- Lista de clientes Black con avatar, visitas, badge VIP
- Click abre CustomerDetailDialog
- Panel de beneficios: 15% descuento, eventos exclusivos, prioridad
- Empty state elegante cuando no hay clientes Black

### Changed — Dashboard Layout Reordenado
- Arriba: MetricsCards → Tiers + ROI → BlackTierSection
- Medio: VisitsChart → PowerRanking → Growth + AtRisk
- Abajo: Heatmap → AcquisitionChannel → ReactivationRate
- Charts que necesitan datos históricos movidos al final

### Fixed — Ticket Promedio
- Settings PUT: cambiado de upsert a update/insert explícito
- Agregado formato COP en tiempo real debajo del input
- Error handling visible si falla el guardado
- Instrucción clara: "Ingresa en pesos colombianos (ej: 60000)"

### Added — Documentación de flujos
- `docs/features/flujo-plantillas-recompensas-campanas.md`
- Flujo completo: check-in, recompensas, campañas auto/manual
- Sistema de recompensas recomendado (visitas 3,5,6,8,9,10,12,15,20)
- 4 plantillas recomendadas para aprobar en Twilio
- Problemas conocidos documentados

**Archivos creados:**
- `src/components/dashboard/BlackTierSection.tsx`
- `supabase/migrations/00009_table_number.sql`
- `docs/features/flujo-plantillas-recompensas-campanas.md`

**Archivos modificados:**
- `src/constants/rankings.ts` — Power System v2
- `src/app/(dashboard)/dashboard/page.tsx` — Layout reordenado + BlackTierSection
- `src/app/(dashboard)/dashboard/qr/page.tsx` — QR por mesa completo
- `src/app/(dashboard)/dashboard/settings/page.tsx` — Bug fix + formato COP
- `src/app/api/dashboard/settings/route.ts` — update/insert explícito
- `src/app/api/check-in/route.ts` — table_number en flujo
- `src/components/features/check-in/CheckInForm.tsx` — lee ?mesa= de URL
- `src/services/visit.service.ts` — tableNumber param
- `src/types/database.types.ts` — table_number en Visit
- `src/components/dashboard/CustomerDetailDialog.tsx` — gradient colors actualizados

---

## [0.18.0] — 2026-04-15 — Customer Detail + Rewards CRUD + Consent + Frequency Cap

### Added — Customer Detail Dialog
- Componente `CustomerDetailDialog.tsx` con info completa del cliente
- Click en filas de PowerRanking y Clientes abre el detalle
- Muestra: nombre, teléfono, ciudad, cumpleaños, tier, visitas, canal, inactividad
- Muestra próxima recompensa (API `GET /api/dashboard/customers/:id/next-reward`)
- Asignar visitas manualmente (cantidad + razón) desde el dialog
- API `GET /api/dashboard/customers/:id` para detalle individual

### Added — Rewards CRUD (crear/borrar/activar)
- Botón "Nueva Recompensa" → Dialog con visita # + premio
- Auto-genera template de WhatsApp con vista previa en tiempo real
- Toggle activar/desactivar recompensa (PATCH)
- Eliminar recompensa con confirmación (DELETE)
- API: POST, DELETE, PATCH en `/api/dashboard/rewards`

### Added — Consentimiento de comunicaciones
- Checkbox en formulario de registro: "Acepto ser parte de la familia..."
- Campo `accepts_marketing` (boolean, default true) en customers
- Migración `00008_accepts_marketing.sql`
- Icono ✕ en lista de clientes para los que no aceptan marketing
- CustomerDetailDialog muestra estado de opt-in/opt-out

### Changed — Campañas: auto-excluyen clientes sin consentimiento
- Campañas manuales (`/api/dashboard/campaigns/manual`) filtran `accepts_marketing=true`
- Estimación de audiencia (`/api/dashboard/campaigns/estimate`) filtra `accepts_marketing=true`
- Cron reactivación excluye clientes con `accepts_marketing=false`
- Cron cumpleaños NO filtra (transaccional, no marketing)

### Changed — Frequency capping verificado
- Campañas manuales: 7 días entre marketing por cliente via `last_campaign_at`
- Cron birthday/reactivation: NO afectados (usan `hasRecentCampaignMessage` por tipo)
- Solo campañas marketing actualizan `last_campaign_at`

### Changed — Hook `useDashboardAnalytics` con refetch
- Agregado `refetch()` para recargar datos después de acciones admin

**Archivos creados:**
- `src/components/dashboard/CustomerDetailDialog.tsx`
- `src/app/api/dashboard/customers/[id]/route.ts`
- `src/app/api/dashboard/customers/[id]/next-reward/route.ts`
- `supabase/migrations/00008_accepts_marketing.sql`

**Archivos modificados:**
- `src/types/database.types.ts` — accepts_marketing en Customer
- `src/services/customer.service.ts` — createCustomer con accepts_marketing
- `src/app/api/check-in/route.ts` — pasar accepts_marketing
- `src/components/features/check-in/CheckInForm.tsx` — checkbox consentimiento
- `src/components/dashboard/PowerRanking.tsx` — onCustomerClick prop
- `src/app/(dashboard)/dashboard/page.tsx` — CustomerDetailDialog + handleCustomerClick
- `src/app/(dashboard)/dashboard/customers/page.tsx` — rows clickable + opt-out badge
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — CRUD completo
- `src/app/api/dashboard/rewards/route.ts` — POST, DELETE, PATCH
- `src/app/api/dashboard/campaigns/manual/route.ts` — filtro accepts_marketing
- `src/app/api/dashboard/campaigns/estimate/route.ts` — filtro accepts_marketing
- `src/services/campaign.service.ts` — findInactiveCustomers excluye opted-out
- `src/hooks/useDashboardAnalytics.ts` — refetch()

---

## [0.17.0] — 2026-04-15 — Métricas avanzadas + ROI + Heatmap + Ajustes

### Added — 4 nuevas gráficas/métricas + página de Ajustes

**Tasa de Reactivación (`ReactivationRateChart.tsx`):**
- Gráfica ComposedChart: barras (enviados vs volvieron) + línea (tasa %)
- Cruza campaign_messages + visits para medir ROI real de campañas de reactivación
- Últimos 6 meses, badge con tasa promedio global

**Card ROI Estimado (`ROICard.tsx`):**
- Fórmula: clientes_reactivados × ticket_promedio
- Muestra retorno estimado del sistema en COP
- Link directo a /dashboard/settings para ajustar ticket promedio

**Mapa de Calor de Visitas (`VisitHeatmap.tsx`):**
- Heatmap Día × Hora (7 días × horas 8am-10pm)
- Últimos 6 meses de visitas
- Tooltips con conteo, leyenda de colores, diseño responsive

**Canal de Adquisición por Mes (`AcquisitionChannelChart.tsx`):**
- Stacked bar: QR vs Domicilio por mes (últimos 6 meses)
- Basado en customers.source_channels

**Página de Ajustes (`/dashboard/settings`):**
- Configuración de ticket promedio (COP)
- API PUT /api/dashboard/settings para guardar configuración
- Tabla admin_settings (key-value) con RLS

**Navegación:**
- Nuevo item "Ajustes" en sidebar y header mobile

### Migración SQL requerida
- `supabase/migrations/00007_admin_settings.sql` — Ejecutar en Supabase

### Archivos creados
- `src/components/dashboard/ReactivationRateChart.tsx`
- `src/components/dashboard/ROICard.tsx`
- `src/components/dashboard/VisitHeatmap.tsx`
- `src/components/dashboard/AcquisitionChannelChart.tsx`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/api/dashboard/settings/route.ts`
- `supabase/migrations/00007_admin_settings.sql`

### Archivos modificados
- `src/types/analytics.types.ts` — HeatmapCell, AcquisitionChannel, ReactivationData, ROIEstimate
- `src/services/dashboard.service.ts` — getFullAnalytics ampliado (heatmap, acquisition, reactivation, ROI)
- `src/lib/demo-analytics.ts` — Demo data para las 4 nuevas métricas
- `src/app/(dashboard)/dashboard/page.tsx` — Integra los 4 nuevos componentes
- `src/components/layout/DashboardSidebar.tsx` — Nav item Ajustes
- `src/components/layout/DashboardHeader.tsx` — Nav item Ajustes (mobile)

**Build:** ✅ 29 rutas, 0 errores

> **Request original:** Añadir gráficas: Tasa de Reactivación, ROI Estimado, Heatmap Día×Hora, Canal de Adquisición por Mes, y apartado de ticket promedio en Ajustes

---

## [0.16.0] — 2026-04-14 — Demo auto-login

### Added — Ruta /demo para acceso directo al dashboard sin formulario de login

**Archivos creados:**
- `src/app/demo/page.tsx` — Página client que hace signInWithPassword con credenciales demo y redirige a /dashboard
- `docs/features/demo-login.md` — Documentación de la feature

**Variables de entorno requeridas:**
- `NEXT_PUBLIC_DEMO_EMAIL` — Email del usuario demo
- `NEXT_PUBLIC_DEMO_PASSWORD` — Contraseña del usuario demo

**Request original:** Crear link de demo para landing page que auto-loguea al dashboard

---

## [0.15.0] — 2026-04-11 — Rediseño visual premium (Dashboard Métricas)

### Changed — Identidad visual del panel administrativo: glassmorphism, burbujas animadas, sparklines

**Layout y estructura:**
- `src/app/(dashboard)/layout.tsx` — `dashboard-bg` (fondo marfil + gradiente radial al centro), padding generoso `p-6 md:p-8`
- `src/app/(dashboard)/dashboard/page.tsx` — `space-y-8` (32px+ entre secciones), título Playfair Display
- `src/components/layout/DashboardSidebar.tsx` — Glassmorphism `rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px)`, icono CTA con gradiente carmesí, nav items con gradiente en activo
- `src/components/layout/DashboardHeader.tsx` — Glassmorphism idéntico al sidebar, sin border-bottom

**MetricsCards:**
- `src/components/dashboard/MetricsCards.tsx` — `.metric-card` con hover `translateY(-4px)` + sombra profunda, números Inter 700 `letter-spacing: -0.05em`, sparklines animados por card
- `src/components/dashboard/MiniSparkline.tsx` — **NUEVO**: SVG inline 60×22px, animación `stroke-dashoffset` 1→0 en 1.5s ease-out, tipos `up/down/stable`

**Burbujas en Riesgo:**
- `src/components/dashboard/AtRiskBubbles.tsx` — Colores pasteles desaturados (rojo/naranja/violeta), float animation asincrónica (3.1s/3.8s/4.5s), spring `bubble-pop` al click, Dialog premium sin bordes duros con header coloreado según burbuja, botón de envío con gradiente carmesí

**Gráficos y Ranking:**
- `src/components/dashboard/VisitsChart.tsx` — `.dashboard-card` reemplaza `Card` de shadcn, título Playfair
- `src/components/dashboard/GrowthChart.tsx` — `.dashboard-card`, barras `radius={[8,8,0,0]}`
- `src/components/dashboard/CustomerTiers.tsx` — `.dashboard-card`
- `src/components/dashboard/PowerRanking.tsx` — `.dashboard-card`, sin bordes de celda, `.ranking-row` hover suave `rgba(249,248,246,0.9)`

**globals.css — Nuevas clases:**
- `.dashboard-bg`, `.glass-sidebar`, `.glass-header`, `.metric-card`, `.dashboard-card`, `.ranking-row`, `.sparkline-path`, `.bubble-float`
- Keyframes: `float`, `bubble-pop`, `draw-sparkline`
- Utilities: `animate-float`, `animate-bubble-pop`

### Archivos creados
- `src/components/dashboard/MiniSparkline.tsx` — Componente sparkline animado
- `docs/features/design-system.md` — Documentación del sistema de diseño premium
- `docs/features/dashboard-metrics-redesign.md` — Especificación del rediseño

### Archivos modificados
- `src/app/globals.css` — Clases y keyframes del dashboard
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/layout/DashboardSidebar.tsx`
- `src/components/layout/DashboardHeader.tsx`
- `src/components/dashboard/MetricsCards.tsx`
- `src/components/dashboard/AtRiskBubbles.tsx`
- `src/components/dashboard/VisitsChart.tsx`
- `src/components/dashboard/GrowthChart.tsx`
- `src/components/dashboard/CustomerTiers.tsx`
- `src/components/dashboard/PowerRanking.tsx`

### Request original
> Modificar la sección de métricas: 1) Layout "Airy" con fondo #F9F8F6 gradiente radial, sidebar/topnav glassmorphism blur(20px), spacing mínimo 32px. 2) Cards con hover translateY(-4px), sparklines animados 1.5s ease-out, tipografía Inter 700 letter-spacing -0.05em. 3) Burbujas en riesgo: colores pasteles, float animation, spring elastic al click, Quick Action Popover con gradiente carmesí. 4) Gráficas de barras rounded radius:8px, tablas sin bordes, hover por fila completa.

---

## [0.14.0] — 2026-04-11 — Rediseño visual premium (páginas públicas)

### Changed — Identidad visual completa de páginas públicas y login

**Fuentes:**
- `layout.tsx` — Reemplazado Geist Sans por Inter + Playfair Display (Google Fonts)
- `globals.css` — `--font-sans: var(--font-inter)` · `--font-heading: var(--font-playfair-display)`

**Sistema de diseño premium (globals.css):**
- Keyframe `fade-in-up` para entrada suave desde 20px abajo
- Utility `font-playfair` · utility `animate-fade-in-up`
- `.premium-bg` — Fondo marfil `#F9F8F6` con textura noise SVG (opacity 0.02)
- `.premium-card` — `border-radius: 24px`, `box-shadow: 0 10px 40px rgba(0,0,0,0.04)`
- `.btn-premium` — Gradiente `#FF4D6D → #E63946`, hover `scale(1.02)`, transición 300ms cubic-bezier
- `.btn-secondary-premium` — Glassmorphism blanco con backdrop-blur 12px
- `.input-premium` — Ghost border `rgba(226,190,192,0.35)`, focus glow rojo

**Páginas rediseñadas:**
- `src/app/page.tsx` — Landing: orbs decorativos, card premium, badge animado, botón gradiente
- `src/app/(auth)/login/page.tsx` — Login: inputs nativos, sin shadcn Card, Playfair en título
- `src/app/(public)/check-in/page.tsx` — Fondo marfil, header de marca premium
- `src/components/features/check-in/CheckInForm.tsx` — Labels metadata, inputs ghost, botón gradiente
- `src/components/features/check-in/CheckInSuccess.tsx` — Cards con gradiente verde/rojo, ícono dorado para recompensa

**Iconografía:**
- Todos los íconos de páginas públicas: `strokeWidth={1.25}` o `{1.5}` (ultra-thin)

**Git:**
- Branch: `feat/visual-redesign` (main preservado como backup)

### Archivos afectados
- `src/app/layout.tsx` — Fuentes Inter + Playfair Display
- `src/app/globals.css` — Sistema premium completo
- `src/app/page.tsx` — Rediseño landing
- `src/app/(auth)/login/page.tsx` — Rediseño login
- `src/app/(public)/check-in/page.tsx` — Rediseño wrapper check-in
- `src/components/features/check-in/CheckInForm.tsx` — Rediseño formulario
- `src/components/features/check-in/CheckInSuccess.tsx` — Rediseño pantalla de éxito

### Docs afectados
- `docs/features/design-system.md` — CREADO (sistema de diseño premium)

### Request original
> Quiero modificar la pagina principal, todo lo que es la pagina de panel admin/registrar visita - ingresar numero y pagina de registro de visita. Fundamentos Estéticos: Fondo #F9F8F6 (Marfil Suave), Card Central con border-radius 24px, Tipografía Playfair Display para títulos, Botón Primario gradiente #FF4D6D a #E63946 con scale(1.02) en hover, Micro-interacciones: fade-in slide-up 20px.

---

## [0.13.0] — 2026-04-11 10:30

### Added — Lógica de recompensas en plantillas, source_channels, frequency capping

**Variables automáticas en plantillas de campaña:**
- `reward.service.ts` — `getNextReward(visits)` busca siguiente recompensa activa
- `reward.service.ts` — `buildRewardHint(visits, reward)` genera texto: "En tu visita 5 ganas: Sushi Tiger Gratis (te faltan 2)"
- Campañas manuales ahora envían `{{1}}=nombre`, `{{2}}=visitas`, `{{3}}=próxima recompensa` automáticamente

**Envío REAL de mensajes en campañas:**
- `whatsapp.service.ts` — `sendTemplateMessage(phone, contentSid, variables)` usa Twilio Content API
- `campaigns/manual/route.ts` — Reescrito completo: envía mensajes reales, registra twilio_sid, error_message por cada destinatario

**Segmentación por canal de origen:**
- `customers.source_channels` — 'qr' | 'delivery' | 'both'
- Se actualiza automáticamente en check-in (QR) y delivery webhook
- Si un cliente usa ambos canales → se marca como 'both'
- Migración SQL con backfill basado en historial de visitas

**Frequency capping (anti-spam):**
- `customers.last_campaign_at` — Fecha de última campaña marketing recibida
- Campañas manuales excluyen clientes contactados en los últimos 7 días
- Response incluye `totalSkippedFrequencyCap` para transparencia

**Warnings en creación de plantillas:**
- Advertencia desplegable sobre aprobación de Meta + qué evitar
- Recomendaciones desplegables para plantillas exitosas

### Migración SQL requerida
- `00006_source_channels_frequency_cap.sql` — Ejecutar en Supabase

### Archivos afectados
- `src/services/reward.service.ts` — getNextReward, buildRewardHint
- `src/services/whatsapp.service.ts` — sendTemplateMessage (Content API)
- `src/services/customer.service.ts` — source param en createCustomer/incrementVisit
- `src/app/api/dashboard/campaigns/manual/route.ts` — Envío real + freq cap
- `src/app/api/check-in/route.ts` — Pasa source='qr'
- `src/app/api/webhook/delivery/route.ts` — Pasa source='delivery'
- `src/types/database.types.ts` — source_channels, last_campaign_at
- `src/app/(dashboard)/dashboard/templates/page.tsx` — Warnings desplegables
- `supabase/migrations/00006_source_channels_frequency_cap.sql` — Nueva migración
- `docs/DB_SCHEMA.md` — Actualizado

**Build:** ✅ 28 rutas, 0 errores

> **Request original:** Lógica recompensas en variables, segmentador qr/delivery, frequency capping, warnings en plantillas

---

## [0.12.0] — 2026-04-10 23:30

### Fixed — Templates mostrando "Borrador" en dashboard

**Templates approval status (Fix crítico):**
- `api/dashboard/templates/route.ts` — Reescrito parseo de approval status:
  - Intenta `approval_requests.status` (directo)
  - Intenta `approval_requests.whatsapp.status` (nested)
  - Si sigue en "draft" → fetch individual a `/Content/{sid}/ApprovalRequests/whatsapp`
- Ahora retorna ambos nombres de campo: `name`/`friendly_name` y `status`/`approval_status`
- `ManualCampaigns.tsx` ya puede filtrar por `approval_status === 'approved'` correctamente
- Plantillas aprobadas en Twilio ahora se muestran como "Aprobada" en el dashboard

### Changed — Niveles de clientes: metales preciosos

**Tier names actualizados:**
- `constants/rankings.ts` — Diamante(25+) > Platino(18+) > Oro(12+) > Plata(7+) > Bronce(3+) > Nuevo(1+)
- Emojis, gradientes y colores actualizados para cada nivel
- Impacta: CustomerTiers, PowerRanking, analytics

### Archivos afectados
- `src/app/api/dashboard/templates/route.ts` — Fix approval status
- `src/constants/rankings.ts` — Nuevos tier names
- `src/app/(dashboard)/dashboard/templates/page.tsx` — Status map actualizado

**Build:** ✅ 28 rutas, 0 errores

> **Request original:** Plantillas aprobadas en Twilio aparecen como borradores; cambiar tiers anime por metales preciosos

---

## [0.11.0] — 2026-04-10 22:50

### Fixed — Login, QR Preview, Política Meta WhatsApp

**Login múltiples clicks (Fix):**
- `login/page.tsx` — Reemplazado `router.push()` por `window.location.href` para full-page reload
- Las cookies de Supabase Auth ahora se envían correctamente en la primera navegación
- Eliminado `useRouter` innecesario

**QR no aparece en vista previa (Fix):**
- `dashboard/qr/page.tsx` — Reemplazado `<canvas>` por `<img src={dataUrl}>` 
- Eliminada race condition: `QRCode.toCanvas` se llamaba antes de que el canvas estuviera en el DOM
- QR ahora se muestra inmediatamente al cargar la página

**Campañas: Selector de plantillas aprobadas (Fix — Política Meta):**
- `ManualCampaigns.tsx` — Eliminado textarea de "mensaje personalizado" 
- Reemplazado por selector de plantillas aprobadas de Twilio Content API
- Meta/WhatsApp requiere pre-approved templates para mensajes business-initiated fuera del service window de 24h
- Si no hay plantillas aprobadas → muestra advertencia con link a sección Plantillas
- Botón "Sincronizar" para refrescar lista de plantillas desde Twilio

### Added — Rate Limiting Check-in + Admin Override

**Rate limiting check-in (máx 1/día):**
- `api/check-in/route.ts` — Ventana de duplicados aumentada de 60min a 1440min (24h)
- Mensaje claro: "Solo puedes registrar una visita por día"

**Admin override para visitas extra:**
- `api/dashboard/check-in-override/route.ts` — Endpoint protegido (Admin JWT)
- Permite registrar visita adicional con motivo, saltando el rate limit
- La visita queda registrada con nota "Override admin: [razón]"

### Archivos afectados
- `src/app/(auth)/login/page.tsx` — Fix login
- `src/app/(dashboard)/dashboard/qr/page.tsx` — Fix QR preview
- `src/components/dashboard/ManualCampaigns.tsx` — Template selector
- `src/app/api/check-in/route.ts` — Rate limit 24h
- `src/app/api/dashboard/check-in-override/route.ts` — Nuevo endpoint

**Build:** ✅ 28 rutas, 0 errores

> **Request original:** Fix login multi-click, QR vacío, campañas con mensaje libre viola política Meta, agregar rate limit check-in 1/día + admin override

---

## [0.10.0] — 2026-04-10 16:30

### Added — Conexión Twilio Real, Vercel Crons, n8n Workflows, Diagnóstico

**Conexión Twilio Real:**
- Credenciales cargadas en `.env.local` — conexión verificada ($20 USD saldo)
- `api/dashboard/twilio-balance/route.ts` — `force-dynamic`, `cache: no-store`, logging mejorado
- `api/dashboard/templates/route.ts` — `force-dynamic`, `cache: no-store`
- `api/health/twilio/route.ts` — Endpoint diagnóstico sin auth para verificar conexión Twilio

**Vercel Cron Jobs:**
- `vercel.json` — Cron config: birthday 8AM UTC, reactivation 10AM UTC
- `api/cron/birthday/route.ts` — Añadido handler GET (Vercel crons usan GET)
- `api/cron/reactivation/route.ts` — Añadido handler GET

**n8n Workflows:**
- `docs/n8n-workflows/01-delivery-webhook.json` — Workflow importable para registro de domicilios
- `docs/n8n-workflows/README.md` — Guía de setup, variables, y test rápido
- URL n8n: `https://n8n.almojabananet.me`

**Google Maps Review:**
- `.env.example` actualizado con URL real: `https://share.google/XDfNCZIn7QFQaAME9`
- Variable `N8N_BASE_URL` añadida a `.env.example`

### Changed
- `docs/API_DOCS.md` — Añadidos: `/api/health/twilio`, GET en crons, `/api/dashboard/templates`
- `docs/02-architecture.md` — Añadidos: `vercel.json`, variables env faltantes
- `docs/features/dashboard.md` — Templates actualizado de "Beta" a "Twilio Content API"

### Archivos afectados
- 10 archivos modificados/creados

**Build:** ✅ 0 errores

> **Request original:** "Ya cargué las credenciales y reinicié el server" + configurar n8n, crons, Google Maps, y probar conexión Twilio

---

## [0.9.0] — 2026-04-09 10:00

### Added — Twilio MCP, Plantillas Real, Imágenes Japonesas, Checklist Producción

**Twilio MCP Server:**
- `.windsurf/mcp_config.json` — Configuración para `@twilio-alpha/mcp`
- Servicios: `twilio_api_v2010`, `twilio_content_v1`, `twilio_messaging_v1`
- Tags: Messages, Phone Numbers, Balance, Content, ApprovalRequest, Templates
- `docs/TWILIO_MCP_SETUP.md` — Guía paso a paso de configuración
- `.gitignore` actualizado para proteger credenciales MCP

**Plantillas Twilio (producción):**
- `api/dashboard/templates/route.ts` — GET (listar) + POST (crear + auto-submit aprobación)
- Integración con Twilio Content API v1
- Dashboard muestra: SID, nombre, categoría, estado de aprobación (approved/pending/rejected/draft)
- Crear plantilla → se envía automáticamente para aprobación de WhatsApp
- Botón "Sincronizar Twilio" para refrescar estados
- Reemplaza la versión Beta local anterior

**AtRisk Bubbles (fix visual):**
- Revertido de ScatterChart a 4-5 burbujas grandes agrupadas por nivel de riesgo
- Ahora muestra: count, avg visitas, avg días inactivo por grupo
- Click en burbuja → dialog con lista de clientes + envío de campaña directa

**Imágenes japonesas integradas:**
- 5 imágenes copiadas a `public/images/` (bonsai, templo, pagoda, kanji, bambú)
- Landing (`/`): pagoda top-right, bonsai bottom-left como watermarks sutiles
- Check-in (`/check-in`): bonsai top-right, bambú bottom-left
- Login (`/login`): kanji center-right, templo bottom-left
- Fondos mejorados: `bg-gradient-to-br from-red-50 via-white to-stone-50`
- Cards con `backdrop-blur-sm bg-white/90 shadow-xl`

**Checklist de Producción:**
- `docs/PRUEBA_REAL_CHECKLIST.md` — Documento completo de TODO lo necesario para prueba real
- Cubre: Supabase, Twilio, n8n, Cron, Google Maps, Deploy, variables de entorno

### Archivos afectados
- 12 archivos modificados/creados, 1 API nueva (templates), 1 doc nuevo

**Build:** ✅ 26 rutas, 0 errores

---

## [0.8.0] — 2026-04-08 16:15

### Added — Google Reviews, Campañas Manuales, Plantillas, Twilio Wallet, Bubble Chart

**Google Review Popup (post check-in):**
- `GoogleReviewPopup.tsx` — Popup ultra dopamínico con estrellas interactivas, animaciones, incentivo visual
- Aparece 2.5s después del check-in (nuevos + recurrentes, no duplicados)
- Estrellas clicables → abre Google Maps review en pestaña nueva
- Incentivo: "rollo cortesía" por dejar reseña
- Variable env: `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`

**Campo Ciudad en Registro:**
- `CheckInForm.tsx` — Campo ciudad con icono MapPin
- `customer.service.ts` — `createCustomer` acepta `city`
- `check-in/route.ts` + `webhook/delivery/route.ts` — Envían city al crear
- `database.types.ts` — `Customer.city: string | null`
- Migración SQL: `00005_add_city.sql` con índice parcial

**Campañas Manuales (`ManualCampaigns.tsx`):**
- Filtros: ciudad, visitas min/max, edad min/max, tipo de cliente (QR/delivery/todos)
- 2 campañas predefinidas: "Invitar al Restaurante" + "Invitar a pedir Domicilio"
- Estimador de audiencia en tiempo real (debounced 500ms)
- Costo estimado por campaña (USD + COP)
- Dialog de confirmación antes de enviar
- API `/api/dashboard/campaigns/estimate` — cuenta clientes matching
- API `/api/dashboard/campaigns/manual` — crea y ejecuta campaña manual

**Twilio Wallet (`TwilioWallet.tsx`):**
- API `/api/dashboard/twilio-balance` — consulta saldo real de Twilio
- Muestra: saldo USD/COP, costo por mensaje, mensajes disponibles, link a recarga
- `CampaignCostEstimate` — componente reutilizable para estimar costos

**Plantillas de Mensajes (`/dashboard/templates`) — Beta:**
- CRUD local de plantillas con variables ({{name}}, {{visits}}, etc.)
- 6 plantillas predefinidas (bienvenida, recompensa, cumpleaños, reactivación, restaurante, domicilio)
- Vista previa WhatsApp-style con datos de ejemplo
- Categorías: marketing, utilidad, auth
- Badge "Beta" — próxima integración con Twilio Content Templates

**Bubble Chart de Clientes en Riesgo:**
- `AtRiskBubbles.tsx` reescrito con Recharts ScatterChart
- Eje X: días sin visitar, Eje Y: total de visitas, Z (tamaño): visitas acumuladas
- Colores por nivel de riesgo, tooltip con detalle del cliente
- Leyenda clickeable para enviar campaña al grupo

**Navegación:** Nuevo item "Plantillas" en sidebar y header mobile

### Archivos afectados
- 15 archivos modificados/creados, 3 APIs nuevas, 1 migración SQL

**Build:** ✅ 25 rutas, 0 errores

---

## [0.7.0] — 2026-04-08 11:14

### Changed — Branding Sushi Service + Estética Japonesa + Campañas + QR

**Tema Rojo/Blanco Japonés:**
- `globals.css` — Primary color cambiado a rojo japonés (oklch hue 25), secondary/accent/ring ajustados
- Backgrounds de landing, check-in y login: gradiente `from-red-50 to-white`

**Branding "Sushi Service":**
- `layout.tsx` — Metadata: título y descripción actualizados
- `page.tsx` — Landing rebrandeada con UtensilsCrossed icon
- `check-in/page.tsx` — Nombre y subtítulo "Programa de fidelidad"
- `login/page.tsx` — Logo + nombre en card de login
- `DashboardSidebar.tsx` — Nombre + icono en sidebar
- `DashboardHeader.tsx` — Nombre en header y menú mobile

**Campañas Mejoradas (`/dashboard/campaigns`):**
- Sección de campañas automáticas activas (Cumpleaños + Reactivación)
- Cada campaña muestra: descripción, frecuencia cron, template de mensaje, última ejecución
- Botón "Ejecutar Ahora" con dialog de confirmación para disparar campañas manualmente
- Historial de campañas ejecutadas (tabla existente mejorada)

**Generador de QR (`/dashboard/qr`):**
- Generación de QR code con librería `qrcode` (rojo oscuro sobre blanco)
- Vista previa en canvas con branding Sushi Service
- Descarga como PNG (600x600)
- Copiar URL del check-in
- Link para probar el check-in

**Navegación:**
- Nuevo item "Código QR" en sidebar y menú mobile

**Dependencias:** qrcode, @types/qrcode

**Build:** ✅ Compila sin errores (21 rutas)

### Archivos afectados
- 9 archivos modificados, 1 archivo creado

---

## [0.6.0] — 2026-04-08 09:44

### Changed — Dashboard: Rediseño Gamificado con Analytics Avanzados

**Concepto:** Dashboard adictivo con métricas accionables, sistema de poder estilo anime, burbujas de riesgo interactivas y modo demostración.

**Nuevos componentes (src/components/dashboard/):**
- `MetricsCards.tsx` — 7 tarjetas de métricas reales (QR, domicilios, nuevos, frecuentes, cumpleaños)
- `VisitsChart.tsx` — Gráfica de área: visitas diarias QR vs Domicilios (30 días)
- `GrowthChart.tsx` — Gráfica compuesta: nuevos clientes + acumulado (30 días)
- `CustomerTiers.tsx` — Barras de progreso por nivel de poder (Leyenda→Novato)
- `AtRiskBubbles.tsx` — Burbujas interactivas por grupo de riesgo (7-10, 11-15, 16-21, 22+ días)
- `PowerRanking.tsx` — Top 20 clientes con ranking anime (Leyenda, Dios, Maestro, Guerrero, Aprendiz, Novato)
- `DemoToggle.tsx` — Toggle de modo demostración

**Sistema de Rankings (src/constants/rankings.ts):**
- 6 niveles de poder: Leyenda(25+), Dios(20+), Maestro(12+), Guerrero(7+), Aprendiz(3+), Novato(1+)
- 4 niveles de riesgo: Alerta(7-10d), En riesgo(11-15d), Crítico(16-21d), Perdido(22+d)

**Modo Demostración:**
- `src/contexts/DemoContext.tsx` — Estado global con localStorage persistence
- `src/lib/demo-analytics.ts` — Computación client-side de analytics desde JSON
- `src/hooks/useDashboardAnalytics.ts` — Hook unificado (real API o demo data)
- `public/demo-data.json` — Placeholder para datos demo (1500 clientes)
- `src/types/analytics.types.ts` — Tipos compartidos para analytics

**API:**
- `GET /api/dashboard/analytics` — Analytics completos (server-side)
- `src/services/dashboard.service.ts` — getFullAnalytics() con computación de tiers, risk, ranking

**Dependencias:** recharts (gráficas), dialog (shadcn/ui)

**Build:** ✅ Compila sin errores (20 rutas)

### Archivos afectados
- 14 archivos creados, 3 archivos modificados

---

## [0.5.0] — 2026-04-08 08:40

### Added — Feature: Dashboard Administrativo (FASE 5)

**Autenticación:**
- `src/app/(auth)/login/page.tsx` — Página de login con Supabase Auth
- Middleware protege `/dashboard/*` → redirige a `/login`

**Layout:**
- `src/components/layout/DashboardSidebar.tsx` — Sidebar con navegación
- `src/components/layout/DashboardHeader.tsx` — Header con menú mobile + logout
- `src/app/(dashboard)/layout.tsx` — Layout completo con sidebar + header

**Páginas del Dashboard:**
- `/dashboard` — Métricas: total clientes, visitas hoy/semana, cumpleaños, inactivos, últimos registros
- `/dashboard/customers` — Tabla de clientes con búsqueda y paginación
- `/dashboard/rewards` — Tabla de recompensas por visitas
- `/dashboard/campaigns` — Historial de campañas ejecutadas

**API Routes (protegidas por auth):**
- `GET /api/dashboard/metrics` — Métricas generales
- `GET /api/dashboard/customers` — Lista paginada con búsqueda
- `GET /api/dashboard/rewards` — Lista de recompensas
- `GET /api/dashboard/campaigns` — Historial de campañas

**Servicios:**
- `src/services/dashboard.service.ts` — getDashboardMetrics, getCustomers, getRewards

**UI Components (shadcn/ui):**
- table, badge, separator, tabs, skeleton, avatar, dropdown-menu, sheet

**Landing:**
- `src/app/page.tsx` — Reemplazada landing default de Next.js con RestaurantQR home

**Build:** ✅ Compila sin errores (19 rutas)

### Archivos afectados
- 14 archivos creados, 4 archivos modificados

---

## [0.4.0] — 2026-04-08 08:30

### Added — Feature: Campañas y Cron Jobs (FASE 4)

**Migración SQL:**
- `supabase/migrations/00004_campaigns.sql` — Tablas campaigns + campaign_messages + índices + RLS

**Servicios:**
- `src/services/campaign.service.ts` — findBirthdayCustomers, findInactiveCustomers, getOrCreateTodayCampaign, hasRecentCampaignMessage, recordCampaignMessage, finalizeCampaign
- `src/lib/validators/cron.ts` — Validación de CRON_SECRET

**API Routes (Cron Jobs):**
- `src/app/api/cron/birthday/route.ts` — Envía felicitaciones a cumpleañeros del día (1 vez/año)
- `src/app/api/cron/reactivation/route.ts` — Envía reactivación a inactivos 21+ días (1 vez/30 días)

**WhatsApp:**
- `src/services/whatsapp.service.ts` — Nuevas funciones: sendBirthdayMessage, sendReactivationMessage, sendCampaignMessage

**Tipos:**
- `src/types/database.types.ts` — CampaignMessage.error_message añadido

**Build:** ✅ Compila sin errores

### Archivos afectados
- 4 archivos creados, 4 archivos modificados

---

## [0.3.0] — 2026-04-08 08:02

### Added — Feature: Webhook Domicilios + Google Contacts Sync (FASE 3)

**Decisión arquitectónica:** Arquitectura híbrida n8n + Next.js
- n8n = orquestador de Twilio + Google Contacts
- Next.js API = lógica de negocio (DB, visitas, recompensas)

**Migraciones SQL:**
- `supabase/migrations/00002_authorized_numbers.sql` — Tabla authorized_numbers + RLS
- `supabase/migrations/00003_delivery_fields.sql` — Campos delivery en visits (address, payment_method, amount, raw_message)

**Servicios:**
- `src/services/google-contacts-sync.service.ts` — Fire-and-forget trigger a n8n para sync Google Contacts
- `src/services/delivery.service.ts` — Parseo de mensajes WhatsApp + extracción de teléfono
- `src/lib/validators/twilio.ts` — Validación de firma Twilio (utilidad)

**API Route:**
- `src/app/api/webhook/delivery/route.ts` — POST: recibe datos parseados de n8n, crea/actualiza cliente + visita + recompensas

**Actualización Check-in:**
- `src/app/api/check-in/route.ts` — Añadido Google Contacts sync vía n8n en register y checkin

**Workflows n8n:**
- `n8n/domicilios_whatsapp_v3.json` — Twilio → parse → authorized_numbers DB → Google Contacts → nuestra API → TwiML response
- `n8n/google_contacts_sync.json` — Recibe trigger de QR check-in → Google Contacts search/create/update

**Mejoras vs workflow v2 del usuario:**
- Números autorizados ahora se validan contra DB (no hardcodeados)
- Credenciales de Supabase/Google usan env vars de n8n (no hardcodeadas)
- Usa nuestro Supabase unificado
- Integración bidireccional: QR y delivery sincronizan Google Contacts

### Archivos afectados
- 8 archivos creados, 4 archivos modificados
- `docs/features/delivery-webhook.md` — Creado y actualizado
- `docs/DB_SCHEMA.md` — Migraciones 2 y 3 registradas
- `docs/API_DOCS.md` — Endpoint delivery documentado
- `docs/01-project-overview.md` — Estado actualizado
- `src/types/database.types.ts` — Visit type con campos delivery
- `src/services/visit.service.ts` — createVisit con campos delivery
- `.env.example` — Nuevas variables: WEBHOOK_DELIVERY_SECRET, N8N_GOOGLE_CONTACTS_WEBHOOK_URL

**Build:** ✅ Compila sin errores

### Request original
> Necesito que los contactos estén creados/actualizados en Google Contacts

---

## [0.2.0] — 2026-04-07 22:09

### Added — Feature: QR Check-in (FASE 2)

**Migración SQL:**
- `supabase/migrations/00001_initial_schema.sql` — Tablas customers, visits, rewards + RLS + trigger handle_updated_at + seed de 3 recompensas (visita 3, 5, 7)

**Servicios (lógica de negocio):**
- `src/services/customer.service.ts` — findByPhone, create, incrementVisit
- `src/services/visit.service.ts` — createVisit, getRecentVisit (anti-duplicado 1h)
- `src/services/reward.service.ts` — checkRewardForVisit
- `src/services/whatsapp.service.ts` — sendWelcome, sendReward, sendWelcomeBack (Twilio, best-effort)

**API Route:**
- `src/app/api/check-in/route.ts` — POST con 3 acciones: lookup, register, checkin

**UI Components:**
- `src/components/features/check-in/CheckInForm.tsx` — Formulario de celular + registro
- `src/components/features/check-in/CheckInForm.types.ts` — Tipos
- `src/components/features/check-in/CheckInSuccess.tsx` — Pantalla de éxito + recompensa
- `src/components/features/check-in/CheckInSuccess.types.ts` — Tipos
- `src/components/features/check-in/index.ts` — Barrel export
- `src/app/(public)/check-in/page.tsx` — Página completa con flujo de estados

**Utilidades:**
- `src/lib/validators/phone.ts` — Validación celular colombiano + formato WhatsApp

**shadcn/ui componentes añadidos:**
- `src/components/ui/input.tsx`, `card.tsx`, `label.tsx`, `sonner.tsx`

**Build:** ✅ Compila sin errores

### Archivos afectados
- 16 archivos creados
- `docs/features/qr-checkin.md` — Creado (documentación de feature)
- `docs/DB_SCHEMA.md` — Actualizado (migración registrada)
- `docs/API_DOCS.md` — Actualizado (endpoint check-in documentado)
- `docs/01-project-overview.md` — Actualizado (estado de fases)

### Request original
> Sigue con la fase 2 el qr check in

---

## [0.1.0] — 2026-04-07 16:00

### Added — Setup Inicial (Método AInnovate FASE 1)

**Documentación:**
- `docs/01-project-overview.md` — Visión, objetivos, stack (Next.js 16.2.2, React 19.2.4, Supabase, Twilio), estado del proyecto
- `docs/02-architecture.md` — Estructura de carpetas, stack completo con versiones reales, ADRs, convenciones, flujos de datos
- `docs/03-security.md` — Autenticación (Supabase Auth), autorización, variables de entorno, validaciones, reglas
- `docs/04-deployment.md` — Template de deployment (Vercel, pendiente de configurar)
- `docs/DB_SCHEMA.md` — Esquema completo: 6 tablas (customers, visits, rewards, campaigns, campaign_messages, authorized_numbers), diagrama ER Mermaid, RLS, triggers
- `docs/API_DOCS.md` — 9 endpoints documentados (health, check-in, webhook, cron x2, dashboard x4)
- `docs/SKILLS.md` — Registro de 7 skills n8n disponibles en el IDE
- `docs/features/` — Carpeta para features (se llena en FASE 2)

**Reglas para 6 IDEs:**
- `.windsurfrules` — Windsurf/Cascade
- `CLAUDE.md` — Claude Code
- `.cursorrules` — Cursor
- `.clinerules` — Cline/Continue
- `.github/copilot-instructions.md` — GitHub Copilot
- `.aider.conf.yml` — Aider

**Proyecto Next.js:**
- Inicializado con `create-next-app@16.2.2` (App Router, TypeScript, TailwindCSS v4)
- shadcn/ui inicializado (Button + utils generados)
- Dependencias: `@supabase/supabase-js`, `@supabase/ssr`, `twilio`, `lucide-react`
- Estructura de carpetas: `src/app/(public)`, `src/app/(dashboard)`, `src/app/api/`, `src/lib/supabase/`, `src/lib/twilio/`, `src/types/`, `src/constants/`, `src/services/`, `src/hooks/`, `src/components/{ui,layout,features}`
- Supabase client/server/middleware configurados
- Middleware de auth para proteger `/dashboard/*`
- API Routes placeholder: health, webhook/delivery, cron/birthday, cron/reactivation
- Tipos TypeScript para todas las tablas de DB
- `.env.example` con todas las variables necesarias
- `.gitignore` configurado (excluye .env* excepto .env.example)

**Build:** ✅ Compila sin errores (TypeScript + Next.js)

### Archivos creados (32 archivos)
- `docs/` — 7 archivos de documentación + 1 carpeta features
- 6 archivos de reglas para IDEs
- `CHANGELOG.md`, `METODO_AINNOVATE.md`, `.env.example`
- `src/app/(public)/check-in/page.tsx`
- `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/api/health/route.ts`, `src/app/api/webhook/delivery/route.ts`
- `src/app/api/cron/birthday/route.ts`, `src/app/api/cron/reactivation/route.ts`
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- `src/lib/twilio/client.ts`
- `src/middleware.ts`
- `src/types/database.types.ts`
- `src/constants/rewards.ts`

### Request original
> Lee el archivo METODO_AINNOVATE.md completo y sigue las instrucciones de la FASE 1. Mi proyecto es una plataforma integral (Full-Stack) de fidelización, CRM y automatización de marketing para un restaurante. Stack: Next.js (App Router) + Supabase + TailwindCSS + Shadcn/UI + Twilio SDK.
