# Spec — «Conexiones»: el apartado donde el negocio conecta su WhatsApp (y mañana Google y Meta)

**Fecha:** 2026-09-06, ampliado el 2026-09-07 · **Estado:** DISEÑO — las 8 decisiones del §11 y
§11.bis están **CERRADAS** por el dueño; sin implementar · **Repo:** producto (RestaurantQR/Cada1)
**Verificado contra:** `Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §1–§7,
`…/docs/PARTE-COEXISTENCIA-2026-09-06.md`, `…/src/lib/actions/provisioning.ts`,
`…/src/components/clients/WhatsappWizard.tsx`, `src/app/api/webhook/zernio/route.ts`,
`supabase/migrations/00036_zernio_provider.sql`, `docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`.
**No se llamó a la API de Zernio.** Todo lo de acá es contrato leído y código leído.

---

## 0. La pregunta, y la respuesta corta

> «Si doy de alta un negocio nuevo por el AIOS, ¿dónde entra **el cliente** a hacer el signup de
> WhatsApp, usar coexistencia y conectar su número?»

**Hoy: en ningún lado.** El cliente no tiene ninguna pantalla. El alta entera vive en el panel del
**operador** (`WhatsappWizard`, repo del AIOS), y el único momento en que el dueño del restaurante
participa es **por fuera del producto**:

1. El operador genera el `authUrl` (`ownerStartWhatsappConnect`) y lo **copia y se lo manda** al dueño
   por WhatsApp o correo — el propio mensaje de éxito lo dice: *«Cópialo y envíaselo al dueño»*.
2. El dueño abre el popup de Meta en su navegador y termina el Embedded Signup.
3. Meta le devuelve un `code`… **a él**. El dueño se lo tiene que **dictar de vuelta al operador**,
   que lo pega a mano en el paso 3b (`ownerCompleteWhatsappConnect`).

En el producto no existe ruta, ni API, ni pantalla: `tenants.zernio_profile_id / zernio_account_id /
zernio_phone_number` solo se escriben por `aios_activate_whatsapp()`, y esa función solo la puede
ejecutar el rol `aios_constelarys` (00035/00036). El dashboard del restaurante ni las lee.

Y hay dos cosas rotas que ese rodeo tapa:

- **El `redirect_url` del Embedded Signup no puede recibir a nadie.** `ownerStartWhatsappConnect`
  arma `${PRODUCT_WEBHOOK_BASE_URL}/api/webhook/zernio` y, si esa variable está vacía, manda
  literalmente `https://zernio.com`. Pero `src/app/api/webhook/zernio/route.ts` **solo exporta
  `POST`** y exige firma HMAC: un navegador que aterrice ahí por GET recibe 405. O sea que el
  redirect no es un camino a medias — no existe.
- **`whatsapp.number.verification_required` no tiene dónde verse.** El parte de coexistencia (§7)
  agregó ese evento justamente porque en coexistencia Meta le pide al negocio confirmar por SMS o
  llamada el número que ya usa. Hoy llega al webhook, se loguea, y **nadie lo mira**: el alta se
  queda callada esperando algo que el cliente nunca ve.

Este documento diseña el apartado **Conexiones** para que ese ida y vuelta desaparezca.

---

## 1. Qué es Conexiones (y qué no)

**Conexiones = el único lugar del panel del cliente donde su negocio conecta una cuenta de un
tercero.** Hoy WhatsApp; el norte de §3 de `ESTADO.md` (Google para responder reseñas, Meta para
campañas) entra acá sin rediseñar nada.

Por eso el apartado **no** se llama «WhatsApp». Se diseña como una **lista de tarjetas, una por
proveedor**, cada una con su propio estado y su propio flujo adentro. El día que llegue Google, es
una tarjeta más, no una pantalla nueva.

| Está en Conexiones | NO está en Conexiones |
|---|---|
| Elegir el camino del alta y ejecutarlo | La `ZERNIO_API_KEY` y el webhook del **Team** (son del operador, no del negocio) |
| El número conectado, su estado y su salud | El catálogo y el texto de las plantillas → `/dashboard/templates` |
| El interruptor de la auto-respuesta (§18.e) | Los números autorizados de domicilio → `/dashboard/authorized-numbers` (se enlaza, no se duplica) |
| A qué número llegan los cuadros de pedido (§18.d) | El presupuesto y la cola de envío → gobernanza de envío |
| Las tarjetas futuras de Google y Meta | Cualquier credencial en `tenants.config` (es **público**) |

---

## 2. Los tres caminos — y por qué son tres y no dos

El wizard del AIOS tiene **dos** caminos (`own_number` / `new_number`). Leyendo el §3 del contrato
entero, `new_number` mezcla dos casos que mandan cosas distintas a Zernio, y de ahí sale la pregunta
abierta §6.6 del parte («¿el paso 3 sobra al comprar? ¿daría 409?»). **Partirlo en tres la disuelve
por construcción:**

| | **A · Coexistencia** | **B · Mi número ya está en Cloud API** | **C · Línea nueva de Zernio** |
|---|---|---|---|
| Cómo se lo dice al cliente | «Ya atiendo por WhatsApp desde mi celular» | «Mi número ya está conectado a la API de WhatsApp» | «Quiero una línea nueva» |
| Compra | **Ninguna** | **Ninguna** | Cotiza y compra |
| `onboarding` | `business_app` | `api` | — (no aplica) |
| `isCoexistence` | `true` | `false` | — |
| Embedded Signup | **Sí** (§3.b) | **Sí** (§3.b) | **No** — §3.a lo activa solo con `connectWhatsapp: true` |
| Se sigue por | `code` + eventos | `code` + eventos | `whatsapp.number.activated` |
| Su app de WhatsApp Business | **sigue andando en el teléfono** | ya no la usa | no tiene |
| Caso real | **los 25 restaurantes** | raro, pero existe | el que no tiene número |

`route` se manda **siempre explícito** a Zernio (nunca se confía en su default), y `onboarding` +
`isCoexistence` salen **del mismo dato**, exactamente como quedó en el AIOS: no pueden contradecirse.

**El camino se congela.** Se puede corregir mientras no se haya declarado número ni abierto el
signup; después no, porque cambiarlo deja un número comprado o una coexistencia a medias sin dueño.
En el AIOS eso lo cuida `canChangeOwnerRoute()` en la UI; acá va además **en el motor** (trigger),
porque del lado del cliente una pestaña vieja es mucho más probable.

**`headless=true` se queda en A y B.** El §3.c (credenciales directas de Meta) **no se usa**:
re-suscribe la WABA a un callback de Zernio y **corta el que el negocio ya tuviera**. En
coexistencia, donde el número está vivo y quizá colgado de otra integración del cliente, eso es
inaceptable. Queda como escotilla documentada, no implementada.

---

## 3. La pantalla

`/dashboard/conexiones`, en la barra lateral justo encima de «Ajustes» (icono `PlugZap`).

```
Conexiones
   Tus líneas son de la marca. Todas tus sedes mandan por ellas.   ← §4.1
│
├─ WhatsApp · Línea principal ───────────────────────── [ ● Activa ]
│   +57 300 123 4567 · coexistencia · desde 2026-09-08
│   Tu app de WhatsApp Business sigue funcionando en tu celular.
│   Salud de la línea: ▓▓▓▓▓░░ 412 / 1000 hoy      → Ver plantillas
│   Los pedidos de domicilio llegan a ESTE número.  → Números autorizados
│   [ ] Responder automáticamente a quien escriba   (§18.e)
│
├─ Google  ──────────────────────────── [ Próximamente ]
└─ Meta    ──────────────────────────── [ Próximamente ]
```

Cuando no está conectada, la tarjeta **es el flujo**, un paso a la vez (nunca cinco pasos en gris —
esa fue la queja «siempre me sale que falta el último paso de instalar WhatsApp»):

| Estado | Lo que ve el cliente |
|---|---|
| `sin_empezar` | Las tres opciones del §2, en su idioma, con lo que implica cada una |
| `camino_elegido` | A y B: «¿Cuál es el número?» · C: **precio mensual** y disponibilidad, sin botón de comprar si no está habilitado |
| `kyc_pendiente` | Solo camino C: «Estamos esperando la verificación de tu documentación» (§6.2) |
| `numero_declarado` | Un botón: **«Conectar mi WhatsApp»**. Abre Meta |
| `signup_abierto` | «Terminá el paso en Meta». Debajo, plegada, la escotilla de pegar el `code` |
| `verificacion_pendiente` | **«Meta te va a mandar un SMS o una llamada a +57…»** — hoy este estado es invisible y ahí se traba el alta |
| `conectada` | Conectada, esperando que quede activa |
| `activa` | La tarjeta de arriba |
| `fallida` · `suspendida` · `liberada` | El motivo real de Zernio, y qué hacer |

Y un estado que no es del alta sino del panel: **sin dueño registrado**
(`tenants.owner_email IS NULL`). La tarjeta se ve, pero ningún botón funciona y lo dice: «Para
conectar WhatsApp falta registrar al dueño de este negocio — lo hace tu asesor». Ver §5.

**Regla de honestidad:** un tenant de Twilio (Sushi Fun, Sushi Service, Don Alirio, Frangal) ve una
tarjeta **de solo lectura** derivada de sus columnas `twilio_*` — «WhatsApp por Twilio, cuenta
propia». No se le inventa una fila ni se le ofrece un flujo que no le corresponde.

---

## 4. Datos: migración **00052**

`node scripts/proxima-migracion.mjs` → **00052**. (La 00048 y la 00049 están RESERVADAS para
multi-sede; la 00047 y la 00050 están pendientes de aplicar y van antes.)

**Se aplica en Supabase ANTES de desplegar el código que la usa.** Si no, PostgREST devuelve 42703
y la pantalla responde **403** — parece permisos y no lo es.

```sql
CREATE TABLE tenant_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),          -- explícito SIEMPRE
  -- SIN location_id, a propósito. Ver §4.1: D6 dice que una línea NO tiene sede.
  provider      text NOT NULL CHECK (provider IN ('whatsapp_zernio')),
  label         text NULL,       -- «Línea principal», «Línea nueva (calentando)»

  route         text NULL CHECK (route IN ('coexistence','byo_cloud_api','zernio_number')),
  status        text NOT NULL DEFAULT 'sin_empezar' CHECK (status IN (
                  'sin_empezar','camino_elegido','kyc_pendiente','numero_declarado',
                  'numero_comprado','signup_abierto','verificacion_pendiente',
                  'conectada','activa','fallida','suspendida','liberada')),
  phone_e164    text NULL CHECK (phone_e164 ~ '^\+[0-9]{7,15}$'),
  zernio_profile_id text NULL,
  zernio_account_id text NULL,
  waba_id           text NULL,
  phone_number_id   text NULL,
  signup_nonce      text NULL,      -- NUESTRO, no el `state` de Zernio (§6)
  signup_opened_at  timestamptz NULL,
  is_primary        boolean NOT NULL DEFAULT false,
  purchase_allowed  boolean NOT NULL DEFAULT false,  -- lo habilita el OPERADOR
  monthly_price_cop numeric NULL,   -- TU tarifa, congelada al comprar (§6.1.b). NULL = no se alquila
  last_event        text NULL,
  last_event_at     timestamptz NULL,
  last_error        text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

Índices, cada uno con su motivo:

- `UNIQUE (zernio_account_id) WHERE zernio_account_id IS NOT NULL` — espeja
  `idx_tenants_zernio_account_id` (00036). Sin esto, dos marcas podrían reclamar la misma cuenta y
  el webhook resolvería el tenant equivocado.
- `UNIQUE (tenant_id, provider) WHERE is_primary` — **parcial a propósito**. Es la deuda D3 de
  multi-sede (`is_primary` sin UNIQUE) resuelta desde el día uno. Recordar la trampa: un UNIQUE
  plano **no** sirve, porque *los NULL no colisionan entre sí*.
- `UNIQUE (tenant_id, phone_e164) WHERE phone_e164 IS NOT NULL` — el mismo número no se declara dos veces.

**Una fila por LÍNEA, no un campo por marca.** `tenants.zernio_phone_number` es singular; D6 quedó
cerrada como *N líneas por marca, y la sede no obliga a ninguna*. La tabla nace con esa forma para
que el día que se enrute por línea no haya que rehacerla. **Lo que este diseño NO hace es enrutar:**
`tenants.zernio_*` sigue siendo la **línea principal** y `sendViaZernio()` **no se toca ni una
línea**. La tabla es estado del alta, no del envío.

### 4.0 D6, RE-CERRADA el 2026-09-07 (tarde): **un número por marca, compartido**

El §4.1 de abajo reabrió D6 por la mañana («que cada sede pueda tener su número»). **A la tarde el
dueño la volvió a cerrar**, con el argumento correcto: *«si dos sedes tienen números diferentes eso
implicaría un estado de salud para cada sede, plantillas nuevas para cada sede — es demasiado, no
tiene sentido»*. Es exactamente lo que dice el §4.1: dos números son dos WABA, y eso arrastra
plantillas duplicadas, cupo por línea y resolución del entrante por dos cuentas.

**Vale lo de siempre: una línea para toda la marca.** La 00048 `location_messaging` **vuelve a
quedar reservada y sin usar**. `tenant_connections` sigue soportando N líneas por marca — pero por
la razón ORIGINAL de D6, que es el **cupo** (calentar una línea nueva), **no la geografía**.

El §4.1 se conserva entero, sin borrar: es el análisis de lo que costaría, y es la razón por la que
la respuesta es que no. Si algún día se reabre, ahí está el precio ya calculado.

#### «Si comparten número, ¿las plantillas tienen que cambiar por sede?» — **NO. Verificado.**

Esta era la duda que quedaba, y el catálogo la responde solo. Las variables de las 13 plantillas
(`src/constants/template-catalog.ts`) son **nombre del cliente, puntos ganados, saldo, nombre del
nivel, premio y camino de niveles**. Ninguna lleva sede, dirección ni enlace. Y el nombre del
negocio **no es variable**: se resuelve en el token `{negocio}` *antes* de someter el texto a Meta,
igual que el emoji del rubro.

O sea: **las 13 plantillas hablan del cliente y de sus puntos, que son de la MARCA** — una fila por
persona por marca (`customers_phone_tenant_key`), puntos unificados. No hay nada adentro que dependa
de en qué sede comió.

**No hacen falta dos apartados de plantillas. Hace falta uno solo, el que ya existe.** Lo que sí
tenga que cambiar por sede viaja como **variable en el momento del envío**, no como una plantilla
distinta aprobada aparte — que es justo para lo que sirve que el contrato de `{{n}}` sea fijo. El
precedente ya está: el enlace del evento viaja **dentro de `{{5}}`** (00050) precisamente para no
tener que re-aprobar nada en las 25 marcas.

Y para lo que es «a dónde te mando / cómo te contacto» de cada sede ya existe el mecanismo:
**`restaurant_locations.config`**, override por sede de esas claves de `tenants.config`; vacío =
hereda la marca. No necesita ni una plantilla nueva.

> Regla, entonces: **la plantilla es de la marca. La sede viaja en las variables.** Duplicar
> plantillas solo tendría sentido con una **segunda WABA**, o sea con un segundo número — que es
> justamente lo que se decidió no hacer.

---

### 4.1 El análisis de «cada sede su número» — CONSERVADO, no vigente (ver §4.0)

> «Tengo que poder decidir si usan el mismo número todas, o cada una el suyo. Si una usa
> coexistencia y la otra línea nueva, ¿entendés?»

**Sí, y esto cambia D6.** El 2026-09-05 D6 se cerró como *«N líneas por marca, y la sede **no obliga
a ninguna** — por cuál sale un mensaje se elige al enviar; el eje es el cupo, no la geografía»*
(`multi-sede.md`, deuda 6.bis). Lo que se pide ahora es lo contrario en el eje: **que una sede SÍ
pueda tener su línea**, y que marca y sede puedan mezclar caminos distintos (Laureles en
coexistencia con el número de siempre, Envigado con una línea nueva comprada).

**D6 queda así (2026-09-07):**

> **Lo elige el dueño, por sede.** El default sigue siendo **una línea para toda la marca** —
> es lo que van a usar los 25. Pero una sede puede tener **línea propia**, y el camino de cada
> línea es independiente: una en coexistencia y otra comprada es un caso válido.

**La buena noticia: esto ya estaba diseñado, esperando exactamente esta decisión.** El §6.3 de
`docs/superpowers/specs/2026-09-02-multisede-design.md` («D6 — Los dos modelos, sin decidir por el
dueño») dejó la tabla-overlay **`location_messaging`**, PK `location_id`, con la propiedad que hoy
vale oro:

> **La sola existencia de la fila significa «esta sede tiene su propia línea».** Pasar de compartido
> a por-sede es un `INSERT`; volver, un `DELETE`.

Y es la **migración 00048, ya RESERVADA** para eso. Este pedido no abre una tabla nueva: **destraba
la que estaba esperando.**

#### Cómo encajan las dos tablas

`tenant_connections` (00052) y `location_messaging` (00048) **no compiten**: responden preguntas
distintas.

```
tenant_connections     ── QUÉ LÍNEAS TIENE LA MARCA
  (una fila por línea)    número, camino, estado del alta, cuenta de Zernio, tarifa

location_messaging     ── QUÉ SEDE USA CUÁL
  (PK location_id)        sin fila = usa la línea principal de la marca
                          con fila = esta sede tiene la suya
```

**`tenant_connections` sigue SIN `location_id`, y ahora por una razón más fuerte:** una línea no
pertenece a una sede — es al revés, **una sede apunta a una línea**. Una línea compartida por tres
sedes no cabe en una columna; tres filas de `location_messaging` apuntando a la misma línea, sí.

**Corrección al §6.3, que hay que coordinar con multi-sede.** Ese §6.3 baja **14 columnas de
mensajería de `tenants`** a `location_messaging` (las 4 `twilio_*`, `messaging_provider`, las 3
`zernio_*`, límite diario, calidad, estado de línea). Su razonamiento es correcto y no se toca —
*«son de línea por naturaleza: Meta asigna el escalón y la calidad al NÚMERO, y congelar una línea no
puede congelar la otra»*. Lo que cambia es **dónde aterrizan**: en el §6.3 `location_messaging` *era*
la línea, porque no existía una tabla de líneas. Ahora existe. **Esas 14 columnas van a
`tenant_connections`**, y `location_messaging` se queda como lo que su nombre dice: un mapa
`(location_id → connection_id)`.

**Qué son esas 14 columnas, en corto.** Hoy `tenants` (la MARCA) carga datos que en realidad
describen **el teléfono**: con qué proveedor sale, sus credenciales, cuántos mensajes deja mandar
Meta por día, su calificación de calidad y si está congelado. Eso funciona **mientras la marca tenga
un solo número**. Con dos, se rompe solo: **Meta le pone el cupo y la calidad AL NÚMERO, no al
negocio**, así que si Meta castiga la línea A, la B no tiene nada que ver — y con una sola columna
en la marca, castigar una castiga a las dos (o peor: el estado bueno pisa al malo y nadie se entera).
Por eso tienen que vivir donde vive una línea.

**Decisión (la más óptima, 2026-09-07): ahora se AGREGA, no se MUEVE.**

- La **00052 no toca ni una** de esas 14 columnas. `tenant_connections` nace al lado, y
  `tenants.zernio_*` sigue siendo la proyección de la línea principal. **`sendViaZernio()`,
  `line_budget()` y el webhook de entrada no cambian**: con una línea por marca —los 25— el
  comportamiento queda byte a byte igual al de hoy.
- **Mudarlas es parte de C-D6 / F9**, cuando exista una segunda línea de verdad. Ahí van a
  `tenant_connections` (no a `location_messaging`, que se queda como puro mapa).

Mover 14 columnas que hoy usan 5 marcas vivas, para habilitar un caso que hoy no tiene ni un
usuario, es pagar el riesgo antes de recibir el beneficio.

⚠️ **La forma final de la 00048 es territorio de multi-sede.** No se toca por cuenta propia: se
acuerda antes de escribir esa migración. La 00052 no la toca ni la bloquea.

#### Lo que cuesta de verdad tener dos números (y no se ve desde la pantalla)

Mezclar coexistencia y línea nueva es **el caso más caro posible**, porque son **dos WABA distintas**.
Todo esto está verificado en el §6.3 y no es opinión:

1. 🔴 **Las plantillas se duplican, y sin eso la sede nueva NO ENVÍA NADA.** Dos números son dos
   WABA. Hoy `admin_settings` PK `(key, tenant_id)` guarda **un solo puntero por marca**, así que la
   sede B enviaría con el `provider_ref` de la WABA de la sede A — que en la suya no existe:
   **todos sus envíos fallan**. Hace falta el overlay `location_template_pointers`, y además cada
   plantilla hay que **someterla a Meta otra vez** para la segunda WABA (24-72 h cada aprobación).
   Es el costo más grande de todo esto y es de calendario, no de código.
2. 🔴 **El WhatsApp entrante se pierde en silencio.** La resolución del tenant usa `.single()` sobre
   `zernio_account_id` (`tenant.ts:110-121`): con dos cuentas devuelve error, la función devuelve
   `null` y el handler responde 200 **sin ningún efecto**. Eso son **opt-outs que nunca se registran
   (riesgo legal)** y **pedidos de domicilio que se pierden**. La salida no es quitar unicidad: es
   unicidad que abarque las dos tablas, con trigger y `pg_advisory_xact_lock`.
3. 🟡 **El cupo tiene que bajar a la línea.** Con `line_budget()` per-tenant, el volumen de una sede
   **le come el presupuesto a la otra en silencio** — está escrito literalmente en el comentario de
   `message_logs.line_location_id` (00043). Se resuelve con `messaging_line_of(tenant, sede)`, que
   con número compartido se comporta **byte a byte igual que hoy**.
4. ✅ **El opt-out NO se parte por sede, y eso no se negocia.** Bajo la Ley 1581/2012 el
   consentimiento se le da al **responsable del tratamiento**, y dos sedes del mismo tenant son un
   solo responsable. Además, para Meta el opt-out es contra un **número**: revocarle a una sede
   dejando a la otra escribiendo *desde el mismo número* es inimplementable. Se queda en la marca.

#### En pantalla

- **Conexiones lista las líneas de la MARCA.** Con una línea (el caso normal y el de los 25), una
  tarjeta. Con dos, dos, con su `label` — dos números sin nombre no se distinguen.
- **Cada tarjeta dice quién la usa:** *«La usan: todas tus sedes»* o *«La usan: Laureles, Envigado»*.
  Ahí es donde se refleja el mapa, y es el único lugar donde sede y línea aparecen juntas.
- **Asignar sede → línea es un control del dueño**, en la tarjeta de la línea. Un `INSERT` o un
  `DELETE` en `location_messaging`, exactamente como lo pensó el §6.3.
- ⚠️ **Conexiones NO se filtra por el selector de sede del encabezado** (`LocationScope`, F7). Si se
  filtrara, elegir una sede escondería las demás líneas y el cliente no podría comparar ni reasignar.
  La pantalla es de ámbito marca **siempre**.
- Los pedidos de domicilio siguen siendo de la marca: `authorized_numbers` es **por tenant, no por
  sede** (00002). Hay que decirlo así, sin sugerir un desglose que no existe.

**Lo que Conexiones sigue sin hacer: enrutar.** Da de alta líneas y asigna sedes; **elegir por cuál
sale cada mensaje es F9**. Hasta que F9 exista, con dos líneas activas sigue saliendo todo por la
principal (`is_primary`, la que se proyecta a `tenants.zernio_phone_number`) — y por eso **asignarle
una línea propia a una sede no sirve de nada hasta que F9 esté hecha.** Es una fase, no un checkbox.

**Backfill: solo lo que es verdad.** La migración crea una fila `activa` únicamente para los tenants
que ya tengan `zernio_account_id`, con `route = NULL` (= «alta anterior a Conexiones, camino
desconocido»). No se le inventa un camino a nadie, igual que hizo el AIOS con sus filas viejas.

### Quién escribe: un solo cuerpo, dos puertas

Hoy `aios_activate_whatsapp()` es el único escritor de `tenants.zernio_*`. Conexiones **no puede
volverse un segundo escritor con su propia validación** — ahí es donde las invariantes se separan y
un día un tenant queda con `messaging_provider='zernio'` y sin `account_id`, que es exactamente el
caso que `sendViaZernio()` corta con `zernio_not_configured`.

Propuesta: **un cuerpo, dos puertas.**

```
connection_apply_whatsapp(p_tenant uuid, p_profile text, p_account text, p_phone text)
    ↑ SECURITY DEFINER · valida E.164 · escribe tenants.messaging_provider='zernio'
      + los tres campos + la fila de tenant_connections, TODO en una transacción
    ├── aios_activate_whatsapp(slug, …)   → cáscara, mismo contrato, para el rol aios_constelarys
    └── /api/dashboard/conexiones/…       → para el admin del tenant, con su tenant_id de sesión
```

⚠️ **Trampa verificada:** en Postgres, agregarle o cambiarle parámetros a una función **no** es un
`CREATE OR REPLACE`, es una **SOBRECARGA** — y la llamada vieja pasa a ser ambigua (42725) dentro de
un `catch` que solo loguea. Pasó con `log_review_shown_deduped()`. La 00052 hace `DROP FUNCTION
aios_activate_whatsapp(...)` **antes** del `CREATE`, con la firma exacta.

**`activa` exige `zernio_account_id` y `zernio_phone_number`.** Es la misma invariante de
`sendViaZernio()`, y el flip de `messaging_provider` ocurre en esa misma transacción. Nunca antes.

---

## 5. Rutas del producto

Todas exigen sesión de **admin del tenant** y resuelven el `tenant_id` **de la sesión**, jamás de un
parámetro. Ninguna toca `tenants.config`.

| Ruta | Qué hace |
|---|---|
| `GET  /api/dashboard/conexiones` | Estado de todas las tarjetas. **Objeto plano** — la lección de `/api/dashboard/location`, cuyo contrato es un objeto y devolver una lista rompe `settings` en silencio |
| `POST /api/dashboard/conexiones/whatsapp/camino` | Fija `route`. **409** si ya hay número declarado o signup abierto |
| `POST /api/dashboard/conexiones/whatsapp/numero` | Declara el número propio (A y B). Valida E.164 |
| `GET  /api/dashboard/conexiones/whatsapp/cotizacion` | Solo lee precio y disponibilidad (C). No compra jamás |
| `POST /api/dashboard/conexiones/whatsapp/comprar` | Compra (C). Exige `purchase_allowed` **y** confirmación explícita del precio. **Rechaza A y B del lado del servidor** |
| `POST /api/dashboard/conexiones/whatsapp/signup` | Genera el `authUrl` con **nonce propio**; devuelve la URL para abrir Meta |
| `GET  /dashboard/conexiones/whatsapp/callback` | Página del panel que recibe el redirect, valida el nonce y cierra la conexión |
| `POST /api/dashboard/conexiones/whatsapp/code` | La escotilla: pegar el `code` a mano |
| `POST /api/dashboard/conexiones/whatsapp/auto-respuesta` | El interruptor de §18.e |

### Permisos: todos ven, solo el dueño conecta (decisión del dueño, 2026-09-06)

`GET /api/dashboard/conexiones` lo puede llamar **cualquier admin del tenant** — ver por qué número
sale su WhatsApp es la mitad del valor de C1, y el encargado que atiende el día a día lo necesita
cuando algo falla. Todo lo que **cambia estado o gasta** (`camino`, `numero`, `comprar`, `signup`,
`code`) exige ser **el dueño**.

Hoy ese rol **no existe**: el panel solo distingue admin de tenant y super-admin (`src/lib/admin.ts`,
`app_metadata.role === 'super_admin'`). Lo que sí existe es la columna **`tenants.owner_email`**
(00033), que hoy **no la lee ni una línea del producto** — se escribe en el alta y nadie la usa.

Propuesta: **`isTenantOwner()` = `lower(trim(auth.email)) === lower(trim(tenants.owner_email))`.**

- No hace falta tabla ni rol nuevo, y `owner_email` **no vive en `tenants.config`** (que es público
  y lo edita el tenant): es una columna que solo escribe el super-admin, como `price_per_message_cop`.
- **`owner_email IS NULL` → nadie es dueño, y solo el super-admin puede conectar.** Fail-closed, no
  fail-open. No estranda a nadie: el alta la hace el operador de todos modos, y la pantalla lo dice
  con todas sus letras («falta registrar al dueño de este negocio»).
- El super-admin **siempre** puede actuar: es el operador y es quien paga (§6).
- ⚠️ El alta por el AIOS tiene que **empezar a mandar `owner_email`**. Hoy `aios_provision_tenant`
  lo acepta en el payload (`payload->>'owner_email'`, 00036) pero es opcional. Si llega NULL, ese
  cliente nace sin dueño y su pantalla nace bloqueada.

#### ¿Tiene que ser el mismo correo que usan en Meta? **No.**

Son **dos identidades distintas y no se tocan**:

| | `tenants.owner_email` | La cuenta de Meta |
|---|---|---|
| Para qué sirve | Decidir quién, **dentro de nuestro panel**, puede apretar los botones | Aprobar la conexión en el popup de Embedded Signup |
| Contra qué se compara | El email con el que esa persona **entra al panel** (Supabase Auth, `signInWithPassword`) | Nada nuestro — es de Meta |
| Lo vemos | Sí, es columna nuestra | **Nunca.** No llega, no se guarda, no se compara |

Lo único que tiene que coincidir es: **`owner_email` = el email con el que el dueño entra a
`/login`.** El Facebook o Business Manager del restaurante suele estar a nombre de otra cuenta (la
personal de alguien, la de un community manager) y **da igual**.

Dos cosas prácticas que sí importan:

- **En el alta hay que anotar el MISMO correo con el que se le crea el usuario del panel.** Si se
  anota el de facturación y se le crea el usuario con otro, el dueño queda bloqueado de sus propios
  botones y la causa es invisible.
- **Debería ser la misma PERSONA la que hace las dos cosas** (la que entra al panel y la que aprueba
  en Meta), aunque sean correos distintos: es quien tiene que poder decir que sí en el popup.
- Si el restaurante entra con una cuenta compartida (`info@…` que usa todo el mundo), «solo el dueño
  conecta» es nominal. No lo bloquea nada, pero conviene saberlo.

`purchase_allowed` no lo cambia ni el dueño: es del super-admin (mismo criterio que
`/dashboard/admin/wallets`).

### Los eventos que mueven la pantalla

El webhook de Zernio ya existe y ya está firmado; solo hay que **aterrizar** en `tenant_connections`
los seis eventos que el parte agregó y que hoy no tienen destino:

| Evento | `status` |
|---|---|
| `whatsapp.number.verification_required` | `verificacion_pendiente` ← **el que hoy se pierde** |
| `whatsapp.number.activated` | `conectada` → `activa` si están los dos ids |
| `whatsapp.number.suspended` / `.reactivated` / `.released` | `suspendida` / vuelve / `liberada` |
| `whatsapp.number.kyc_submitted` | nota en `last_event` |
| `phone_number.stock_available` | solo camino C |

El handler resuelve el tenant por `account`/`profileId` contra `tenant_connections` **y** conserva el
match actual contra `tenants.zernio_account_id`. Sigue devolviendo **200 siempre** (un 5xx hace que
Zernio desactive el webhook a los 10 fallos, y eso costaría los pedidos de todos los tenants Zernio),
y sigue pasando por el dedup de `webhook_events_seen`.

⚠️ **`registerWebhook()` es idempotente POR URL**: los seis eventos nuevos **no** se aplican solos
sobre un webhook ya creado. Hay que borrarlo y volver a registrarlo (§7 del parte). Sin eso,
`verificacion_pendiente` sigue sin llegar y esta pantalla se queda muda igual que hoy.

---

## 6. Aislamiento y plata

> *Un dato de la marca A jamás se ve ni se atribuye a la marca B.* Acá eso significa: **los mensajes
> de una marca nunca salen por el número de otra.**

1. **El nonce es nuestro.** El `state` que devuelve Zernio
   (`"user123-profile456-timestamp-callbackurl"`) **no es un identificador de tenant confiable**. Se
   genera un nonce propio, se guarda en la fila y se compara al volver. Un `code` que llega sin
   nonce válido → **409, no se cierra la conexión**. Sin esto, un `code` pegado de otra pestaña
   conecta la WABA equivocada y nadie se entera hasta que los mensajes salen por el número de otra.
2. **`expectedPhoneNumber` siempre que haya número declarado** (A y B). Es la única verificación real
   de que se conectó esa línea y no otra. En el AIOS esto ya es un gate; acá se mantiene.
3. **`ZERNIO_API_KEY` es server-only.** La llave nunca llega al navegador, ni siquiera una scoped key
   (§7 del contrato). El navegador del cliente solo habla con **nuestras** rutas.
4. **Nada de esto va a `tenants.config`**, que es público por construcción y viaja al navegador en
   cada página. Los ids de Zernio ya viven en columnas; `config.integrations` sigue reservado para
   metadato **no secreto** de Google y Meta, y los tokens de esos irán a su propia tabla.
5. **La compra es plata real e irreversible.** Cotizar es libre; comprar exige la habilitación del
   operador **y** una confirmación explícita del precio en pantalla. El precio se lee de
   `/v1/phone-numbers/countries` real — el `1800` de la simulación del AIOS **es inventado**.

### 6.1 Quién le paga a quién (pregunta del dueño, 2026-09-06)

> «Ese número me lo va a cobrar Zernio **a mí**, y yo se lo tendría que cobrar a ese cliente aparte,
> ¿no?»

**Sí. Y no es un cobro único: es MENSUAL.** Dos hechos verificados:

1. **Zernio te factura a vos, siempre.** La jerarquía es `Team → Profile → Account` con **una sola
   API key para toda la integración** (`zernio-messaging.md`): no hay subcuenta con saldo propio por
   cliente. Es **exactamente el mismo malentendido que ya resolvió la billetera con Twilio** —
   *«Twilio no reparte saldo entre subcuentas; por eso el saldo de cada tenant lo lleva nuestra base
   de datos»* (`wallet-billing.md`). La línea de Zernio cae del mismo lado: es **inventario del
   operador**, y lo que el cliente debe se lleva acá adentro.
2. **El precio es `monthlyCents`, no un cargo de alta.** `GET /v1/phone-numbers/countries` devuelve
   `{"code":"CO","tier":3,"monthlyCents":500,"needsKyc":true,...}`. O sea que cada línea comprada te
   llega **todos los meses, para siempre**, por cada cliente que la tenga. Con 25 clientes, absorber
   eso en silencio no es un error de un día: es un costo fijo que **crece con cada alta**.

**Decisión de diseño: la línea se cobra por la billetera que ya existe, no por fuera.** Cobrarla por
WhatsApp, por Nequi o «me acuerdo y se lo sumo» es exactamente lo que la billetera vino a impedir.

- Se amplía el `CHECK` de `tenant_wallet_transactions.type` con **`'line_rental'`** (el cargo mensual)
  y, si Zernio cobra algo al comprar, **`'line_purchase'`**. Es el mismo movimiento de siempre:
  negativo, con `unit_price_cop` (snapshot del precio), `quantity`, `source='system'` y
  `external_ref` = el id de la compra o `{connection_id}:{AAAA-MM}` del mes cobrado.
- **La idempotencia sale gratis y ya está construida:** `uq_wallet_txn_source_ref` es
  `UNIQUE (source, external_ref) WHERE external_ref IS NOT NULL`. Con `external_ref` = mes, **el mismo
  mes no se puede cobrar dos veces**, corra el cron una o siete.
- La confirmación del cliente en pantalla **es el momento en que acepta ese cargo recurrente**, y por
  eso la pantalla no dice «$X» sino **«$X al mes, mientras tengas la línea»**, con la tarifa que le
  cobres vos (tu precio, no el de Zernio — el margen y el riesgo cambiario se quedan de tu lado,
  igual que con `price_per_message_cop`).
- Queda registrado **quién confirmó y a qué precio**: la fila del movimiento más `last_event` en
  `tenant_connections`. Sin eso, dentro de tres meses no hay forma de saber quién aceptó qué.

### 6.1.b El cargo mensual se arma solo al comprar (decisión del dueño, 2026-09-07)

> «Si compran línea, que se agregue automáticamente como pago mensual.»

La compra **no deja nada que un humano tenga que acordarse de hacer después**. Al confirmarse:

1. La conexión queda `activa` con su `phone_e164` y su tarifa mensual congelada
   (`monthly_price_cop`, snapshot al momento de comprar — si mañana subís la tarifa, no se le
   re-escribe el precio a quien ya compró).
2. **Un cron mensual** (`/api/cron/line-rental`, `0 5 1 * *`) recorre las conexiones `activa` con
   tarifa y les inserta el `line_rental` del mes.
3. `external_ref = {connection_id}:{AAAA-MM}` y `uq_wallet_txn_source_ref` hacen el resto: **el
   mismo mes no se puede cobrar dos veces**, corra el cron una vez o siete.

Un cron mensual es lo más barato que se le puede agregar a `vercel.json` — ahí ya conviven dos
`*/15`. **Cuidado con la trampa conocida:** un cron acá y su Schedule Trigger en n8n activos a la vez
son **doble disparo**. Este no existe en n8n, así que nace limpio; queda anotado para que nadie lo
duplique después.

**Qué pasa si el cliente se queda sin saldo:** el alquiler **se cobra igual y el saldo queda en
negativo**, que se salda en la próxima recarga. Es exactamente lo que ya hace la billetera con los
mensajes transaccionales, y evita el desastre de liberarle el número a un restaurante que se atrasó
tres días — un número liberado no vuelve. Lo asumo así porque es la lectura de *«se lo agregamos al
dueño y ya está»*; **si preferís que la línea se libere al no pagar, es una línea de código, pero
decidilo a propósito.**

⚠️ **La contracara, que es tuya:** un cliente que no recarga nunca **te sigue costando todos los
meses**. Por eso Billeteras tiene que mostrar, además del saldo, **las líneas activas y lo que
suman** — si no, ese goteo no se ve hasta que alguien sume la factura de Zernio a mano.

### 6.2 KYC: Colombia probablemente lo exige

El mismo endpoint devuelve **`needsKyc: true`**, y el contrato dice que *«Colombia probablemente cae
en tier regulado (3/4)»*. Eso significa que el camino C **no es un botón**: el negocio tiene que
entregar documentos y esperar. El contrato hasta recomienda golpear
`GET /v1/phone-numbers/availability` **antes de iniciar el KYC**, y el evento
`whatsapp.number.kyc_submitted` (uno de los seis que el parte agregó) es justamente el que cuenta esa
espera.

Consecuencia para la pantalla: el camino C tiene un estado propio, **`kyc_pendiente`**, entre
`camino_elegido` y `numero_comprado`. Sin él pasa lo mismo que con `verification_required`: el
cliente confirma, no pasa nada visible, y nadie sabe si se trabó o está esperando a un regulador.

**Los caminos A y B no tienen KYC.** Los 25 restaurantes van por A. Esto es una razón más para que
C viva detrás de `purchase_allowed` y no sea el default de nadie.

---

## 7. Reparto entre el AIOS y el producto

|  | AIOS (operador) | Conexiones (cliente) |
|---|---|---|
| Profile de Zernio | **lo crea** | lo ve |
| Elegir camino | escotilla | **lo hace** |
| Declarar / comprar número | escotilla + habilita la compra | **lo hace** |
| Embedded Signup | escotilla (pegar `code`) | **lo hace, con el redirect real** |
| Plantillas estándar | **las crea y las carga** | las ve en `/dashboard/templates` |
| Webhook del Team | **suyo** | no lo ve |
| Estado del alta | lo **lee** del producto | **es el suyo** |

El wizard del AIOS **no se borra**: queda como escotilla del operador para el cliente que no puede o
no quiere. Pero deja de ser el dueño del estado — el estado canónico pasa a ser `tenant_connections`,
y el AIOS ya sabe leer del producto (`product-db.ts`, rol `aios_constelarys`).

**Consecuencia que hay que aceptar:** `clients.whatsapp_provisioning` (JSONB, base del AIOS) y
`tenant_connections` (base del producto) no pueden ser los dos la verdad. Mientras convivan, el AIOS
**muestra** lo del producto y solo escribe en su JSONB lo que es suyo (profile, plantillas, webhook).

---

## 8. Lo que este apartado arregla, además de existir

1. El `redirect_url` deja de apuntar a un endpoint que solo acepta POST firmado (o a `zernio.com`) y
   pasa a ser **una página real del panel del cliente**.
2. El `code` deja de viajar por fuera del sistema, dictado del dueño al operador. El pegado a mano
   sobrevive **como escotilla**, no como el camino normal — porque el §6.4 del parte deja abierto si
   en modo `headless` el `code` llega por redirect o por `postMessage`, y no se puede quitar la red
   antes de saberlo.
3. `verification_required` por fin tiene pantalla: es **el estado donde hoy se traba el alta en
   silencio**, y en coexistencia es el más probable de todos.
4. La pregunta §6.6 del parte («¿sobra el paso 3 al comprar? ¿daría 409?») **desaparece**: en el
   camino C no hay paso 3 que dar.
5. §18.d y §18.e encuentran su casa: a qué número llegan los cuadros de pedido, y el interruptor de
   la auto-respuesta que hoy le contesta a los clientes reales que el número «es exclusivo para
   mensajes automáticos».

---

## 9. Antes de escribir una línea de código

1. ✅ **El header de la firma HMAC: CONFIRMADO el 2026-09-07, y es `X-Zernio-Signature`.** Lo dice
   el propio panel de Zernio debajo del campo *Secret Key*: «*Used to generate HMAC signature in
   X-Zernio-Signature header*». **Coincide exactamente con `verifyZernioSignature()`: no hay que
   tocar una línea de código.** Queda cerrado el riesgo que este documento traía como prerequisito
   número uno, y queda resuelta de paso la contradicción del §5 del contrato contra sus propias
   notas finales. El alias `X-Late-Signature` que afirma `zernio-messaging.md` **no aparece en el
   panel**: es la quinta mentira de ese doc (§9 del parte de coexistencia).

   ⚠️ **Lo que sí falta es que el secreto COINCIDA.** Verificado contra producción el 2026-09-07:
   `GET https://hooks.constelarys.com/api/webhook/zernio` → **405** (la ruta existe y solo acepta
   POST, correcto) y `POST` sin firma → **401**. O sea que el endpoint está vivo y bien desplegado:
   cuando el «Send test» del panel falla, es **nuestro 401**, y solo puede ser una de dos cosas —
   `ZERNIO_WEBHOOK_SECRET` sin configurar en Vercel, o distinta de la *Secret Key* del panel. Las
   variables de entorno **solo toman efecto en un despliegue nuevo**.

   ⚠️ **Y falta suscribir los eventos que esta pantalla necesita.** El webhook tiene hoy **5**:
   `Message.Received/Delivered/Read/Failed` y `Whatsapp.Template.Status`. **Ninguno de los
   `whatsapp.number.*`**, que son los que mueven Conexiones — sobre todo
   `verification_required` y `activated`. Sin ellos la pantalla no se entera de nada sola. Se
   marcan en la lista *Events* del propio panel (hay que bajar: arriba están los de Posts).
2. 🔴 **La prueba E2E de Zernio** con la cuenta ya limpia (ESTADO §3.3). Nada de coexistencia se ha
   ejercido contra la API real.
3. ✅ **`select-phone-number` (§3.b.3): NO se implementa** (decisión del dueño, 2026-09-06). El
   supuesto es que ninguno de los 25 tiene una WABA con dos o más números, y el alta **siempre va
   acompañada por el equipo** — la implementación es un servicio que se cobra aparte.
   **Lo que sí es obligatorio:** que la pantalla **detecte** `step=select_phone_number` y, en vez de
   dejar al cliente colgado, muestre «esto lo termina tu asesor» y **le avise al operador**. Es la
   diferencia entre una deuda declarada y un callejón sin salida. El caso es raro, pero cuando
   aparece, aparece del lado del cliente.
4. 🟡 **Re-registrar el webhook** para que tome los seis eventos nuevos (§5 de acá, §7 del parte).
5. La **00047** y la **00050** van antes que la 00052, y cada una se aplica **antes** de su código.

---

## 10. Entrega por fases

| Fase | Qué | Depende de |
|---|---|---|
| **C1** | La pantalla en **solo lectura** + `isTenantOwner()` + el interruptor de §18.e + los enlaces a plantillas y autorizados | Nada de Zernio. Vale desde el día uno, incluso para los tenants Twilio |
| **C2** | 00052 + los eventos aterrizados en `tenant_connections` + camino, número y Embedded Signup (**A y B**), con el aviso de `select_phone_number` | Prerequisitos 1, 2 y 4 del §9 |
| **C3** | Camino C: cotizar, KYC, comprar, y el **alquiler mensual en la billetera** (§6.1) | Precio real de Colombia + qué pasa si el cliente no paga |
| **C-D6** | **Línea por sede** (§4.1): 00048 `location_messaging` + el mapa en pantalla + los 4 costos del §4.1 | **Es F9 de multi-sede, no una fase de Conexiones.** Se acuerda con esa hoja de ruta antes de escribir la 00048 |
| **C4** | Tarjetas de Google y Meta | El norte de `ESTADO.md` §3 |

**C1 no depende de nada** y ya responde la mitad de la pregunta: hoy el cliente no tiene dónde ver
por qué número sale su WhatsApp.

**C2 es el alcance acordado para el onboarding de los 25**, porque los 25 van por el camino A
(coexistencia) **con una sola línea para toda la marca**. Ni C3 ni C-D6 bloquean una sola de las
altas agendadas.

⚠️ **C-D6 no se puede meter «de paso» en C2.** Sus cuatro costos (§4.1) son de otra escala: las
plantillas hay que volver a someterlas a Meta por cada WABA (24-72 h cada una), y el entrante y el
cupo tocan `tenant.ts`, `line_budget()` y el webhook — código que hoy está vivo y andando para las
5 marcas. Intentar las dos cosas contra el deadline del ~09-10 es la forma más cara de llegar tarde
a las dos.

---

## 10.bis Territorio exacto de C1 + C2 — para no pisarse

Todo en el **repo del producto**. Rama `feat/conexiones`. Este es el contrato con cualquier otra
sesión: lo de la izquierda es mío, lo de la derecha **no lo toco**.

### Archivos NUEVOS (nadie más los tiene abiertos)

| Archivo | Qué |
|---|---|
| `supabase/migrations/00052_conexiones.sql` | `tenant_connections` + `connection_apply_whatsapp()` + `aios_activate_whatsapp()` como cáscara |
| `src/app/(dashboard)/dashboard/conexiones/page.tsx` | La pantalla |
| `src/app/(dashboard)/dashboard/conexiones/whatsapp/callback/page.tsx` | El aterrizaje del redirect de Meta |
| `src/components/dashboard/conexiones/*.tsx` | Tarjetas y flujo |
| `src/app/api/dashboard/conexiones/route.ts` | GET del estado (objeto plano) |
| `src/app/api/dashboard/conexiones/whatsapp/{camino,numero,signup,code,auto-respuesta}/route.ts` | Las 5 acciones |
| `src/lib/zernio/connect.ts` | Cliente server-only de `/v1/connect/whatsapp*` |
| `src/lib/tenant-owner.ts` | `isTenantOwner()` |
| `src/services/connection.service.ts` | La lógica, con `error` destructurado siempre |
| `tests/db/conexiones.test.ts` · `tests/unit/conexiones-nonce.test.ts` | Aislamiento por nonce y por tenant |
| `docs/features/conexiones.md` | El doc de la feature |

### Archivos MODIFICADOS (los pocos que sí son compartidos)

| Archivo | Qué le hago | Riesgo de choque |
|---|---|---|
| `src/components/layout/DashboardSidebar.tsx` | **Una línea**: el ítem «Conexiones» encima de «Ajustes» | 🟡 **El único archivo de UI compartido.** Si otra sesión toca el menú, se resuelve a mano en 10 segundos |
| `src/app/api/webhook/zernio/route.ts` | **Solo agrego** los 6 handlers de `whatsapp.number.*`. **No toco** `handleMessageReceived()`, ni el opt-out, ni domicilios, ni el dedup, ni el 200-siempre | 🟡 Alto tráfico de sesiones. Es aditivo: casos nuevos en el switch |
| `src/lib/zernio/webhooks.ts` | Tipos de los 6 eventos nuevos. Nada de la firma | 🟢 |
| `ESTADO.md` · `CHANGELOG.md` | El cierre de sesión de siempre | 🟡 Los toca todo el mundo |
| `docs/features/zernio-messaging.md` | Corrijo las 4 mentiras del §9 del parte de coexistencia | 🟢 |

### Lo que NO toco — garantía explícita

**Envío:** `sendTemplateMessage()`, `sendViaZernio()`, `whatsapp.service.ts`, `constants/messaging.ts`.
**Las 14 columnas de `tenants`** y la semántica de `messaging_provider` (§4.1).
**Gobernanza:** `line_budget()`, `reserve_send_slot()`, `send_queue`, `line-budget`, crons.
**Multi-sede:** `location-scope*`, `restaurant_locations`, `resolveHostContext()`, **00048 y 00049**.
**Tenant:** `getTenantByDomain()` y su firma, `tenant.ts`, `tenants.config`, `tenant-config-paths.ts`.
**Plantillas:** `admin_settings`, `promoteVersion()`, `fillEmptyPointer()`, `template-catalog.ts`,
`/dashboard/templates` (solo la enlazo).
**Otras pantallas:** `/dashboard/authorized-numbers` (solo la enlazo), `qr-*`, `marca`, `staff`.
**AIOS:** nada de código. Solo queda pedido que su alta mande `owner_email` (§5) — decisión aparte.
**Migraciones:** solo la 00052. La 00047 y la 00050 siguen siendo tuyas y van antes.

⚠️ **`aios_activate_whatsapp()` pasa a ser cáscara** de `connection_apply_whatsapp()` en la 00052.
Mismo nombre, misma firma, mismo error, mismo comportamiento para el AIOS — con el `DROP FUNCTION`
antes del `CREATE`, porque cambiarle el cuerpo con parámetros distintos crearía una **sobrecarga**
(42725) y no un reemplazo.

---

## 11. Decisiones del dueño — 2026-09-06 (CERRADAS)

| # | Decisión | Qué significa en el código |
|---|---|---|
| 1 | **La compra: el operador habilita, el cliente confirma** | `purchase_allowed` por tenant, solo super-admin. Cotizar es libre. `comprar` rechaza A y B **del lado del servidor** |
| 2 | **El wizard del AIOS se queda como escotilla** | Deja de ser dueño del estado: el canónico es `tenant_connections`. El AIOS lo lee y solo escribe lo suyo (profile, plantillas, webhook) |
| 3 | **`select-phone-number` NO se implementa** | Se asume que ningún cliente tiene WABA con 2+ números. El alta va acompañada por el equipo y la implementación se cobra aparte. **Pero la pantalla detecta el caso y avisa** |
| 4 | **Todos ven, solo el dueño conecta** | `isTenantOwner()` por `tenants.owner_email`. Sin dueño registrado → solo el super-admin. Fail-closed (§5) |

## 11.bis Decisiones del dueño — 2026-09-07 (CERRADAS)

| # | Decisión | Qué significa en el código |
|---|---|---|
| 5 | **El camino normal es A (coexistencia), siempre.** C existe para cuando hace falta una línea **compartida entre varias sedes** | C no es el default de nadie: vive detrás de `purchase_allowed`. Y la línea comprada **se comparte, no se le asigna a una sede** (§4.1) |
| 6 | **Al comprar, el cargo mensual se arma solo** | `monthly_price_cop` congelado al comprar + cron mensual `line_rental`, idempotente por `{connection}:{AAAA-MM}` (§6.1.b). Nadie tiene que acordarse de nada |
| 7 | **`owner_email` va en el alta, sin objeciones** | `isTenantOwner()`. Y **no** tiene que ser el correo de Meta: son dos identidades que no se tocan (§5) |
| 8 | **Multi-sede: ~~todas las sedes usan la misma línea~~ → CORREGIDA por la 9** | Sobrevive lo estructural: `tenant_connections` **no lleva `location_id`** y Conexiones **no se filtra por el selector de sede** (§4.1) |
| 9 | **D6 SE REABRE: lo elige el dueño, por sede.** Default = una línea para toda la marca (los 25). Pero una sede puede tener línea propia, y cada línea su propio camino: una en coexistencia y otra comprada es válido | Destraba la **00048 `location_messaging`**, que el §6.3 de multi-sede dejó reservada esperando justo esta decisión. `tenant_connections` = qué líneas hay; `location_messaging` = qué sede usa cuál. **Enrutar el envío sigue siendo F9** (§4.1) |

### Lo único que queda abierto

1. **¿A cuánto le revendés la línea?** El `monthlyCents` de Zernio es tu **costo**, no su tarifa —
   igual que los ~$73,5 de Twilio contra los $100 de `price_per_message_cop`. Sin ese número la
   pantalla del camino C no puede decir un precio. **Es de C3: no bloquea a ninguno de los 25.**
2. **Si preferís que la línea se libere cuando el cliente no paga**, decilo. El diseño asume que
   **no** se libera (el saldo queda en negativo y se salda en la próxima recarga, como los
   transaccionales), porque un número liberado no vuelve — pero es una decisión tuya, no mía.

### Y una que la decisión 4 obliga a arreglar aguas arriba

**El AIOS tiene que mandar `owner_email` en el alta.** Hoy `aios_provision_tenant` lo acepta pero es
opcional, y ningún tenant vivo lo tiene cargado. Si no se corrige, cada cliente nuevo nace con la
pantalla de Conexiones bloqueada — que es fail-closed y por eso es seguro, pero también es una
llamada tuya por cada alta.
