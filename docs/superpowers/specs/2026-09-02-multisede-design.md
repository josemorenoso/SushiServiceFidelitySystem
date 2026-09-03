# Un cliente, varias sedes — diseño técnico

> **Estado:** spec aprobado para implementar. Las 12 decisiones del dueño están tomadas
> (2026-09-02). Falta implementar.
> **Origen:** §23 y §23.bis de `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`.
> **Pedido marco, textual:** *"cada sede debe tener sus datos, es simplemente que los clientes
> conserven su recorrido en las dos sedes; se puede y tiene que funcionar muy bien"*.

---

## 0. Cómo leer esto

El §23 dijo *"no empezar por el schema"* y tenía razón: todo dependía de saber **cómo el
sistema averigua en qué sede está el cliente**. Esa pregunta ya está respondida (D1), así que
este documento sí empieza por el modelo.

Está escrito sobre:

- **8 diseños en paralelo** (una por área del producto), con las decisiones argumentadas.
- **4 sondas de solo lectura** contra la base de producción. Todo `ALTER` de aquí se apoya en
  un hecho verificado, no en el recuerdo de una migración.
- El mapeo de acoplamiento del §23.bis.

**Lo que NO tiene:** la revisión adversarial de cada diseño se lanzó y **falló por límite de
sesión**. La verificación que sí se hizo es la de los supuestos de schema (§13). El DDL de
aquí **no se ha ejecutado todavía**, ni siquiera contra el harness de Postgres de `tests/`.

---

## 1. Las 12 decisiones del dueño

| # | Decisión | Consecuencia principal |
|---|---|---|
| **D1** | Sede = **subdominio por sede + QR por sede** | El QR se arma con `window.location.origin`, así que impreso desde el subdominio de la sede **ya sale con la sede**. Cero cambios en el generador. |
| **D2** | El cliente queda marcado con su **sede de origen** | `customers.origin_location_id`, corregible solo por el admin de marca. |
| **D3** | Premio ganado en una sede se **reclama en otra** | Ya funciona solo. Lo que hay que construir es la **atribución del costo**. |
| **D4** | Billetera y cupo **de la marca**, con **desglose por sede obligatorio** | Exige `message_logs.location_id` — una **sexta** tabla que el §23 no listaba. |
| **D5** | **Ficha de Google por sede** | `tenants.config` se parte: 4 claves bajan a la sede, 10 se quedan en la marca. |
| **D6** | Número de WhatsApp: **sin decidir** | El diseño soporta los dos. Pasar de compartido a por-sede es un `INSERT`; volver, un `DELETE`. |
| **D7** | **Mismos precios y mismo menú** | Regla de escape del dueño: lo genuinamente distinto **se separa en dos tenants**. |
| **D8** | Calendario: **elegir marca o una sede** | `restaurant_events.audience_scope`. El dueño lo marcó vital. |
| **D9** | **Cada sede despacha su zona**; teléfono de domicilios **por sede** | La sede del pedido sale del **número del operador** que manda el cuadro. |
| **D10** | Admin que ve las dos **y** clave propia por sede | **Obligatorio.** Es la parte más cara del spec. |
| **D11** | Cada mesero es de una sede, **nunca se juntan** | Lo impone el `UNIQUE (phone, tenant_id)` que ya existe. |
| **D12** | Rastrear **premios entregados y efectividad por sede** | Dos sedes por premio: dónde se ganó y dónde se entregó. |

**Riesgo aceptado y aplazado por decisión explícita del dueño (2026-09-02):** qué pasa si una
sede se separa, se vende o pasa a franquicia. **No existe función de split** en las 40
migraciones. Fundir es un `INSERT`; separar exige inventar reglas de negocio (de quién son los
puntos, el saldo, los opt-outs, el libro de consentimiento). El diseño deja la puerta lo más
abierta que puede — `origin_location_id`, `visits.location_id`, `consent_events.location_id` y
`tenant_wallet_transactions.location_id` permiten reconstruir quién frecuentaba qué y quién
gastó cuánto — pero **el reparto no está diseñado y no se inventa aquí**.

---

## 2. El modelo, en una página

```
tenants  ──────────────  LA MARCA
  │                      · identidad (brand_name, colores, etiquetas)
  │                      · catálogo de premios y umbrales  (D7: uno solo)
  │                      · billetera y cupo                (D4: de la marca)
  │                      · opt-out y consentimiento        (un solo responsable)
  │
  ├── customers ───────  UNA fila por (teléfono, marca)   ← NO SE TOCA
  │     · total_points, current_tier, total_visits, last_visit_at  = de la MARCA
  │     · origin_location_id  = dónde se registró          (D2)
  │     · last_visit_location_id = su "sede de casa"       (caché)
  │
  └── restaurant_locations ──  LA SEDE   (deja de ser "un punto en el mapa")
        · slug, domain, config (override), is_primary
        · lat/lon ahora OPCIONALES
        · staff_users / staff_devices     (D11: el mesero es de una sede)
        · authorized_numbers              (D9: el operador de domicilios)
        · [opcional] location_messaging   (D6: línea propia)

        y CADA EVENTO lleva location_id NULL:
        visits · point_transactions · reward_grants · reward_redemptions
        review_events · message_logs · tenant_wallet_transactions
        send_queue · consent_events · campaigns · restaurant_events
```

**La regla que sostiene todo:** `customers_phone_tenant_key UNIQUE (phone, tenant_id)` **no se
toca**. Un tenant = una marca ⇒ una fila por persona ⇒ los puntos se unifican **sin escribir
una línea de código**. Verificado: `awardPoints()` es el único escritor de `total_points`, los
puntos nunca se descuentan, y `points-engine.ts` es puro.

**Lo que hay que construir no es la unión. Es la separación.**

---

## 3. D1 — Cómo se averigua la sede

### 3.1 Las señales, por orden de fuerza

| Orden | Señal | Cubre | ¿La puede falsificar el cliente? |
|---|---|---|---|
| 1 | `staff_users.location_id` del mesero autenticado | check-in con escaneo | No |
| 2 | `staff_devices.location_id` del dispositivo | check-in con escaneo | No |
| 3 | **Host / subdominio** | **registro de cliente nuevo**, tarjeta, QR | Sí, dentro de la marca |
| 4 | `authorized_numbers.location_id` del operador | domicilios | No |
| — | `loc` en el JWT del QR | — | Solo como **detector de conflicto** |

**Por qué el host es imprescindible aunque sea el más débil.** El registro de un cliente nuevo
en modo `auto` (`check-in/route.ts:325-403`) **no pasa por auth de mesero**. Es exactamente el
argumento del dueño: sin el subdominio, solo sabríamos la sede de la segunda visita en
adelante. Las vías no son excluyentes: **se ordenan**.

**Por qué el mesero gana cuando hay las dos.** El caso concreto: un cliente parado en Laureles
abre su enlace guardado de `envigado.marca.com`, genera su QR y se lo muestra al mesero de
Laureles. Si gana el host, la visita se acredita a Envigado y el reporte de D12 miente sin que
nadie lo note. El mesero es de **una** sede por D11, está físicamente donde ocurre la visita, y
su credencial la emite el sistema.

**Hallazgo que lo simplifica:** el mesero postea a `/api/check-in` con URL relativa
(`mesero/confirm/page.tsx:155`), así que **su `Host` también es el de la sede**. El host cubre
las dos rutas de escritura y el dispositivo solo tiene que confirmarlo.

### 3.2 La regla del dominio raíz — «sede única implícita»

Si la marca tiene **exactamente una** sede activa, esa es la sede (`location_source =
'host_single'`). Si tiene 2+, `location = null` y en el registro se responde **409 con la lista
de sedes** para que el cliente elija.

Esto le da a Sushi Service, Don Alirio, Frangal y Demo **atribución perfecta gratis**, sin
subdominio nuevo y sin reimprimir un QR. Y se auto-corrige: el día que uno abra su segunda
sede, el dominio raíz deja de atribuir automáticamente.

### 3.3 El subdominio ya impreso baja a la sede

`tenants.domain` **se queda** como dominio principal de la marca; `idx_tenants_domain` no se
toca. Se agrega `restaurant_locations.domain` con único **global**, y un trigger de unicidad
cruzada que permite el solape **solo dentro del mismo tenant**. La sede principal de cada
tenant vivo **repite** el dominio de la marca.

Resultado: `clubsushiservice.constelarys.com` sigue resolviendo, ahora a marca **+ sede**.
Cero reimpresión. Solo la sede **nueva** estrena subdominio y material. (Responde la pregunta 8
del §23.bis, que es plata y logística.)

### 3.4 Domicilios (D9)

La sede sale de **`authorized_numbers.location_id`** — el celular del operador que manda el
cuadro del pedido, que ya se contrasta contra esa tabla en `twilio-incoming/route.ts:121-127`.
Es una señal **autenticada** (la firma de Twilio ya se valida en `:82-84`), y no exige
configurar nada por cliente en n8n.

**El único cambio en n8n:** reenviar el `remitente` que el workflow **ya calcula y luego
descarta**. Una línea. Crítico, porque hay que replicarlo a 25 clientes.
El workflow vigente es **`domicilios_whatsapp_v4.json`** (`v3` no menciona `tenant_slug` ni una
vez y el webhook lo exige).

### 3.5 La geocerca comentada se BORRA

`check-in/route.ts:209-244`. Como control de acceso ya la reemplazó, con ventaja, la exigencia
de `source === 'staff_scan'`. Como resolver de sede es la peor de las cuatro vías. Y dejarla
comentada es **peligroso**: su query no filtra `tenant_id` y usa `.single()`, así que el
primero que la descomente cuando existan 2 sedes rompe el check-in con `PGRST116` para **todos
los clientes de todos los tenants**.

---

## 4. Modelo de datos — el set consolidado

Las 8 áreas propusieron cada una su propia `00041`. Aquí están consolidadas, ordenadas y sin
choques. **Regla transversal:** `location_id` es **siempre NULLABLE**, con **FK compuesta**
`(location_id, tenant_id) REFERENCES restaurant_locations (id, tenant_id) ON DELETE RESTRICT`.

**Por qué FK compuesta.** El aislamiento real del producto no lo da el RLS: son 144
`.eq('tenant_id', …)` en 48 archivos, y el que se olvida no recibe ningún error. La FK
compuesta mueve esa garantía al motor **para la dimensión nueva**: es imposible grabar una
visita de la marca A con la sede de la marca B. Cuesta un índice.

**Por qué `ON DELETE RESTRICT` en todas.** `SET NULL` degradaría historia a "sede desconocida"
**en silencio** al desactivar una sede — destruye justo el dato que D12 pide. Una sede **nunca
se borra: se desactiva** con `is_active = false`. La base lo impone.

**Por qué NULL no se rellena.** El histórico de los 4 tenants vivos (`visits` ~1581,
`point_transactions` ~991, `review_events` ~685, `customers` ~1176) **se queda en NULL**. NULL
significa "sede desconocida" y **se muestra** como un cubo propio llamado *"Sin sede"*, nunca
se reparte ni se esconde. Repartirlo sería adivinar, y el número adivinado terminaría en un
reporte de plata.

### 00041 — `restaurant_locations` pasa a ser la sede

Añade `slug`, `domain`, `config jsonb`, `is_primary`, `sort_order`. Crea `UNIQUE (id,
tenant_id)` (el soporte de todas las FK compuestas — **hoy no existe**, verificado). Índice
único **global** sobre `domain`, único `(tenant_id, slug)`, y el trigger de unicidad cruzada
contra `tenants.domain`.

**Y quita el requisito de coordenadas.** `lat` y `lon` son `NOT NULL` desde la 00014
(verificado en producción) porque la tabla nació para una geocerca que hoy está apagada.
Pasan a nullable con un CHECK pareado `(lat IS NULL) = (lon IS NULL)`: **una sede sin
coordenadas es legítima**.

Esto no es cosmético. Hoy el AIOS solo manda `locations[]` si vienen **las dos** coordenadas
(`provisioning.ts:719-731`) y la función solo entra al bucle si el array existe (00036:199),
así que **un negocio dado de alta sin coordenadas se crea sin NINGUNA sede**, en silencio —
y por eso `restaurant_locations` tiene ~1 fila entre los 4 tenants. Con este modelo la sede es
lo que carga el subdominio, la ficha de Google, los meseros y toda la atribución: **un tenant
sin sedes es inservible**. Por eso el arreglo son dos cosas, no una — la columna nullable **y**
que el AIOS cree la sede siempre (§9).

### 00042 — Sede canónica de los tenants vivos (migración de datos)

Crea la *"Sede principal"* de los 4 tenants (3 de los 4 no tienen ninguna fila) y le delega el
dominio ya impreso. **No toca una sola fila de historia.**

### 00043 — `location_id` en los eventos

| Tabla | Columna | Semántica |
|---|---|---|
| `visits` | `location_id`, `location_source`, `location_conflict` | dónde ocurrió + **de dónde salió el dato** |
| `point_transactions` | `location_id` | dónde se generó el punto |
| `reward_grants` | `granted_location_id` | **dónde se ganó** (D12) |
| `reward_redemptions` | `redeemed_location_id` | **dónde se entregó** (D3 + D12) |
| `review_events` | `location_id` | qué ficha de Google |
| `message_logs` | `location_id`, `line_location_id` | **a quién se imputa** / **por qué línea salió** |
| `tenant_wallet_transactions` | `location_id` | copiada por el trigger de débito |
| `send_queue` | `location_id` | que el goteo no pierda la sede |
| `consent_events` | `location_id` | evidencia, no permiso |
| `campaigns` | `location_id` | quién la lanzó |
| `restaurant_events` | `location_id` + `audience_scope` | D8 |
| `authorized_numbers` | `location_id` | D9 |
| `customers` | `origin_location_id`, `last_visit_location_id` | D2 + caché de "sede de casa" |

**`location_source`** es un CHECK con las vías (`staff_user`, `staff_device`, `host`,
`host_single`, `qr_token`, `authorized_number`, `manual`) más un CHECK que exige que
`location_id` y `location_source` **vayan juntos o no vayan**. Sin la procedencia, una sede mal
resuelta es indistinguible de una bien resuelta, y D12 se apoyaría en un número que nadie puede
auditar. Con ella el panel puede decir *"el 12% de tus visitas entraron por el dominio raíz"*.

**Dos columnas en `message_logs`, no una.** `line_budget()` calcula el p95 transaccional sobre
**14 días** de `message_logs` (00037:275-288), y con líneas por sede ese p95 tiene que ser **por
línea**. `send_reservations` lleva la línea pero se poda a 7 días, y no alcanza. Sin
`line_location_id`, el volumen de la sede A infla la reserva de la sede B y le come el
presupuesto — en silencio.

**`tenant_wallet_transactions.location_id` se denormaliza, no se deriva.** Verificado en
producción: `tenant_wallet_transactions_message_log_id_fkey` es **`ON DELETE SET NULL`**. Si
algún día se poda `message_logs`, todos los débitos pierden su sede a la vez, de forma
irrecuperable. Un asiento contable no puede colgar de una FK que se anula. Es el mismo criterio
por el que la 00033 ya guarda `unit_price_cop` como snapshot.

**`restaurant_events` usa `audience_scope`, no NULL.** En todas las demás tablas NULL significa
"sede desconocida"; en ésta significaría "toda la marca". Dos lecturas opuestas del mismo NULL
en el mismo sistema es una clase entera de bug. Columna explícita `audience_scope
('brand'|'location')` con CHECK que la amarra a `location_id`, `DEFAULT 'brand'` — los eventos
existentes no cambian de comportamiento.

### 00044 — Meseros por sede (D11)

`staff_users.location_id` y `staff_devices.location_id` con FK compuesta. Un trigger impide que
un dispositivo de una sede quede a nombre de un mesero de otra. Y **se tapa una bomba
verificada**: `staff_devices.device_fingerprint` **no tiene UNIQUE** (solo un índice normal,
00018:41) y cuatro sitios del código hacen `.single()` sobre él.

**`staff_users_phone_tenant_key (phone, tenant_id)` NO se toca.** Es lo que hace cumplir D11 en
el motor: un celular = una fila = una sede. Cambiarlo a `(phone, location_id)` permitiría dos
filas del mismo celular — literalmente *"el mesero trabaja en las dos"*, que es lo prohibido.
Beneficio colateral: `/api/staff/login:38-43` sigue funcionando sin tocar la consulta.

### 00045 — Permisos por sede (D10) → §5

### 00046 — La vista `customer_location_membership`

**Una sola definición de "los clientes de una sede"**, derivada de `visits.location_id`, con dos
criterios sobre la misma fila:

- **`pertenece`** — fue alguna vez a esa sede. La usan los **eventos del calendario** y las
  campañas manuales: una invitación es a un **lugar**, y excluir a quien ya conoce el sitio es
  perder audiencia real.
- **`is_home`** — su última visita fue ahí. La usan los **crons de rescate**: es una
  **partición**, así que la suma de las audiencias de las dos sedes es exactamente la de la
  marca y los porcentajes son comparables — la condición que D12 pone para medir efectividad.

Es la **primera vista SQL del schema**. Al ser vista no hay backfill, ni trigger, ni deriva
posible, y `DROP VIEW` la deshace entera.

> *Alternativa considerada:* una tabla `customer_location_stats` mantenida por trigger, más
> rápida. Se descartó por ahora: la vista es más reversible y con ~1176 clientes por tenant no
> hay problema de rendimiento. Si la lista de "clientes presentes" del mesero se pone lenta, la
> promoción a tabla es aditiva.

### 00047 — Superficie del AIOS → §9

### 00048 — OPCIONAL, requiere D6 → §6.3

### 00049 — OPCIONAL, requiere confirmación → §7.2

---

## 5. D10 y D11 — Permisos

Son **dos sistemas de login independientes** y se resuelven con dos mecanismos distintos.

### 5.1 El dashboard: tabla, no claim en el JWT

**Decisión:** el alcance de sede vive en una tabla `dashboard_user_locations (user_id,
tenant_id, location_id, role)`, **no** en un claim de `app_metadata`.

**Por qué.** El `tenant_id` del JWT hoy se escribe **a mano con un UPDATE sobre `auth.users`**,
no hay Auth Hook, y cada cambio exige re-login. Un claim de sede heredaría los tres problemas y
además haría que un usuario mal aprovisionado fuera indistinguible de un admin legítimo. Una
tabla se corrige en caliente y es legible desde SQL, que es lo que el RLS necesita.

**El fail-safe, recalibrado.** El principio *"sin permiso, nada"* se mantiene, pero el umbral
cambia:

| Situación | Resultado |
|---|---|
| Sin fila y el tenant tiene **≤1 sede activa** | **Ve la marca** (= su única sede) |
| Sin fila y el tenant tiene **≥2 sedes activas** | **403** |
| Fila con `role='brand'` | Ve todas las sedes + el cubo *"Sin sede"* |
| Fila(s) con `role='location'` | Ve **solo** esas sedes, **nunca** las filas con `location_id IS NULL` |

Un fail-safe absoluto dejaría fuera a los admins de los 4 tenants vivos **el día del
despliegue**. Pero un fail-open absoluto es el agujero. La salida es notar que la ausencia solo
es **ambigua cuando hay más de una sede**: con una sola, "marca" y "mi sede" son el mismo
conjunto de filas. Un trigger sobre `restaurant_locations` estampa `role='brand'` a los usuarios
existentes del tenant **en el instante en que nace su segunda sede**, para que el 403 sea la red
y no el camino normal.

### 5.2 Dónde se hace cumplir: en el tipo, no en el RLS

El aislamiento **real** se pone en la capa de consulta con un tipo opaco:

```ts
// Solo requireLocationScope() puede fabricar un LocationScope.
// Las firmas de los servicios pasan de (tenantId: string) a (scope: LocationScope).
// La ruta que se olvide del filtro NO COMPILA.
```

Tres redes, en orden de fuerza: **compilador → nombre feo del escape**
(`getUnscopedServiceClient()`) **→ test de allowlist**. Un test solo no basta: detecta el olvido
*después* de escribirlo y solo si alguien lo mantiene. El tipo lo impide *antes*.

**Y por qué eso importa más que el RLS aquí:** verificado que en toda la app hay **una sola**
lectura de datos por el camino autenticado (`twilio-metrics/route.ts:217`); todo lo demás corre
con `service_role`, que se salta el RLS por definición. Poner el permiso solo en RLS daría una
sensación de seguridad que 55 archivos desmienten.

**Aun así el RLS se actualiza**, como red barata: solo las policies de las tablas que reciban
`location_id`, con un `DO` loop que las **autodescubre por catálogo** (calcado del de 00026:32-52)
en vez de listarlas. Predicado: `is_super_admin() OR (tenant_id = current_tenant_id() AND
can_see_location(location_id))` — un refinamiento estricto del actual, que **no puede conceder
más de lo que concede hoy**. Los helpers nacen **SECURITY DEFINER con `search_path` fijo**, que
es justo lo que a `current_tenant_id()` le falta y por lo que el rol del AIOS revienta con 42501.

### 5.3 El mesero: manda la fila, el host es guardarraíl

La sede del mesero vive en `staff_users.location_id`, **no en su JWT** (que dura 8 horas: con la
sede adentro, reasignar a un mesero tardaría hasta 8 horas en verse y no hay revocación). El
ahorro sería cero: `check-in/route.ts:557-562` **ya** hace un SELECT a `staff_users` en cada
check-in.

Si el host resuelve una sede y **no coincide** con la fila del mesero → **403 con mensaje
explícito** (*"estás en el enlace de otra sede"*). Hoy ese caso devuelve un 401 *"PIN
incorrecto"* que le hace pensar al mesero que olvidó su clave.

### 5.4 Cómo se crea el usuario de sede

**El AIOS encola, el producto ejecuta.** Verificado: el rol `aios_constelarys` **no tiene USAGE
sobre el schema `auth`**, así que no puede tocar `auth.users` — ni debe. `aios_request_location_user()`
(SECURITY DEFINER) escribe en `location_user_requests`; una pantalla de super-admin del producto
la drena con `auth.admin.createUser()` + invitación por correo. **La tabla no guarda contraseñas
jamás.** Es síncrono y con botón, no un cron: §24 trata precisamente del fallo silencioso, y una
cola que se atasca sin que nadie mire es un fallo silencioso nuevo.

---

## 6. D4 y D6 — Mensajería y plata

### 6.1 A qué sede se le imputa un mensaje

**Cascada, estampada al enviar y congelada para siempre:**

```
1. sede del acto (check-in, premio, reseña)   →  si la hay
2. customers.last_visit_location_id           →  "su sede de casa"
3. customers.origin_location_id               →  donde se registró
4. NULL = "sin sede", que se MUESTRA
```

**Por qué la última sede y no la de origen.** Un mensaje de reactivación existe para que la
persona **vuelva**, y va a volver a donde viene yendo. Un cliente que se registró en Envigado y
hace ocho meses que solo va a Laureles le cargaría a Envigado toda su reactivación, y Envigado
no tiene nada que ganar con eso.

**Por qué se estampa y no se deriva.** Si la atribución fuera un JOIN vivo contra la última
visita, **el informe de plata de agosto cambiaría en septiembre** porque el cliente cambió de
sede. Un informe de plata que se mueve solo no lo cree nadie.

**Cuánto gasto quedaría sin sede si no se hiciera así:** dejar el cron en NULL deja sin sede el
**100%** de `birthday`, `reactivation`, `reward_reminder`, `calendar_event`, `manual` e `import`
— 6 de los 17 tipos, pero justamente **la clase cara**: una campaña masiva son cientos de
mensajes de golpe; un check-in es uno. D4 dice *"OBLIGATORIAMENTE"*, y un desglose con la mitad
cara del gasto en una columna llamada "sin sede" no es un desglose.

### 6.2 "Consumió" se define por AUDIENCIA, no por línea

`message_logs.location_id` es **la audiencia** (de quién es el cliente) y es lo que copia el
débito. La línea se guarda aparte en `line_location_id`.

**Por qué.** D6 obliga a soportar los dos modelos de número. Si "consumió" significara "salió
por mi número", el mismo informe **cambiaría de significado** el día que la marca compre un
segundo número. Una métrica que cambia de definición según una decisión de infraestructura que
el dueño todavía no tomó no sirve para decidir nada.

### 6.3 D6 — Los dos modelos, sin decidir por el dueño

Tabla-overlay **`location_messaging`** con PK `location_id`. **La sola existencia de la fila
significa "esta sede tiene su propia línea".** No hay bandera aparte: pasar de compartido a
por-sede es un `INSERT`; volver, un `DELETE`. Con el dueño sin decidir, ésa es la propiedad más
valiosa que puede tener el diseño.

Bajan las 14 columnas de mensajería de `tenants` (verificadas): las 4 `twilio_*`,
`messaging_provider`, las 3 `zernio_*`, `messaging_daily_limit`, `messaging_limit_synced_at`,
`quality_rating`, `line_status`, `line_status_reason`, `line_status_changed_at`. Son **de línea
por naturaleza**: Meta asigna el escalón y la calidad **al número**, y congelar una línea no
puede congelar la otra. **NO** bajan `price_per_message_cop`, `is_demo`, `low_balance_*` ni
`owner_*`: son de la marca (D4).

**`idx_tenants_zernio_account_id` NO se quita** (el §14.1 pedía quitarlo, y sería un error
grave). La resolución del entrante usa `.single()` (`tenant.ts:110-121`): con dos filas devuelve
error, la función devuelve `null`, y el handler responde 200 **sin ningún efecto** — el mensaje
entrante **se descarta en silencio**. Eso son opt-outs que nunca se registran (riesgo legal) y
pedidos de domicilio que se pierden. Lo que hace falta no es menos unicidad: es unicidad que
**abarque las dos tablas**, con trigger + `pg_advisory_xact_lock`.

**El cupo baja a la línea, derivado en SQL.** `line_budget()` y `reserve_send_slot()` llaman a
`messaging_line_of(tenant, sede)`, que devuelve la línea o NULL = "la de la marca". El advisory
lock pasa a `hashtext(tenant || ':' || COALESCE(línea, tenant))`. Que la clave del lock la
calcule **la misma función** que cuenta el cupo es lo que impide que la app y la base
discrepen. Con número compartido el comportamiento es **idéntico byte a byte** al de hoy — y de
paso cierra el agujero actual de contar dos veces el mismo número.

**Las plantillas solo bajan si la sede tiene número propio** — no por D5. Verificado: la ficha
de Google vive en `tenants.config` y **ninguna de las 13 plantillas la contiene**. Lo que
obliga es el número: dos números son dos WABA, y hoy `idx_template_versions_provider_ref
(tenant_id, provider_ref, language)` impide crear el mismo nombre para la segunda sede mientras
`admin_settings` PK `(key, tenant_id)` guarda **un solo puntero** para la marca — la sede B
enviaría con el `provider_ref` de la sede A, que no existe en su WABA: **todos sus envíos
fallan**. Overlay `location_template_pointers`, sin tocar la PK de `admin_settings`.

> Los índices se reescriben con `COALESCE(location_id, tenant_id)` (dos NULL nunca colisionan en
> Postgres — la misma trampa que la 00038 arregló en `idx_send_queue_no_dup`). La base es
> **Postgres 17.6**, así que `NULLS NOT DISTINCT` también estaría disponible; se prefiere
> `COALESCE` por consistencia con el patrón que ya existe (Mandamiento XI).

### 6.4 El opt-out se queda en la MARCA

Sin cambiar una sola línea de código. **Argumento legal primero:** bajo la Ley 1581/2012 el
consentimiento se otorga al **responsable del tratamiento**, y la política pública del producto
declara responsable a `brand_name`. Dos sedes del mismo tenant son un solo responsable. Un
opt-out por sede significaría que revocarle a Envigado deja a Laureles habilitado para seguir
escribiendo — **posiblemente desde el mismo número**. No se sostiene ante nadie.

**De plataforma:** para Meta el opt-out es contra un **número**; con número compartido, un
opt-out parcial es inimplementable.

Se agrega `consent_events.location_id` — **evidencia, no permiso**: registra por dónde entró
cada consentimiento. Es lo único que permitiría partir el libro con evidencia el día que una
sede se separe.

---

## 7. D5 y D9 — Reseñas, ficha de Google y contacto

### 7.1 `tenants.config` se parte campo por campo

El criterio no es "qué podría variar" sino **"qué es coherente con lo que el cliente ya ve"**.

| Se queda en la MARCA (10) | Baja a la SEDE como override (4) |
|---|---|
| `brand_name`, `tagline`, `short`, `description` | `google_maps_url` **(D5)** |
| `card_bg`, `page_bg`, `template_emoji` | `delivery_phone` **(D9)** |
| `staff_role_label`, `visit_label`, `station_label` | `whatsapp_link` *(activable con D6)* |
| | `instagram_url` — **no se usa**, queda por simetría |

La tarjeta pública muestra puntos y visitas que **son de la marca**, así que la identidad que
la envuelve tiene que ser la de la marca o **la tarjeta miente**. En cambio los cuatro de la
derecha son literalmente *"a dónde te mando / cómo te contacto"*.

Se implementa como `restaurant_locations.config jsonb` con **whitelist en un CHECK de la base**,
no solo en TypeScript: 55 archivos escriben con `service_role`, que bypasa RLS — una whitelist
que vive solo en TS es una sugerencia. `merge_location_config` es el espejo literal de
`merge_tenant_config` (00032:79-88): el sistema no gana un concepto nuevo.

**Sede vacía = hereda la marca**, que es el comportamiento de hoy bit a bit.

### 7.2 El recuerdo de reseña — **suposición marcada**

> **SUPOSICIÓN.** El dueño dijo *"me parece bien el recuerdo de reseña"* justo después de pedir
> ficha por sede, y pidió explicación de qué se necesitaba aquí. Se diseña **por sede**: si
> fuera de la marca, quien reseñó Envigado nunca vería el pop-up de Laureles y **la segunda
> ficha nace muerta**. Invertirlo es no aplicar la 00049.

El cambio **no** puede derivarse de `review_events`. Verificado: `customers.google_review_clicked_at`
no es un flag de UI, es **el candado permanente** que impide acuñar un segundo premio
(`review.service.ts:208-220`) — el índice único de la 00031 solo protege mientras el grant está
`active`. Y `logReviewEvent` **se traga sus errores** a propósito (`review.service.ts:151-153`).
Un log que puede perder filas en silencio, gobernando un endpoint público que otorga premios, es
una máquina de acuñar.

**Tabla nueva `customer_review_state (customer_id, location_id)`** con UNIQUE, y el sello pasa
de *check-then-act* (SELECT → UPDATE) a **una sola sentencia con `ON CONFLICT`**, arreglando de
paso una carrera que hoy existe.

**Regla con NULL:** un `clicked` de **sede desconocida** frena el pop-up en **todas** las sedes
(conservador: el histórico de los 4 tenants vivos no vuelve a ser molestado). Un `clicked` de
sede identificada frena **solo esa sede**.

**Pendiente de decisión aparte:** `idx_reward_grants_unique_active_campaign` es por
`(customer_id, source)` (verificado), así que quien reseñe las dos sedes recibe **de vuelta el
premio de Envigado**, no uno nuevo. Permitir dos premios de reseña activos a la vez es una
decisión de negocio (cuesta dos premios por cliente) y **no se aplica sin orden del dueño**.

---

## 8. D8 y D12 — Calendario, crons y dashboard

### 8.1 El calendario elige audiencia (D8, «vital»)

`restaurant_events.audience_scope` + `location_id`. La audiencia se arma con el criterio
**`pertenece`** de `customer_location_membership`.

**El filtro `city` no sirve de reemplazo** y hay que decirlo: es la ciudad **del cliente**, así
que Envigado y Laureles quedan iguales.

### 8.2 Corrección al §23.bis sobre el cron de reactivación

El §23.bis afirmó que *"el cron de rescate se apaga solo para la segunda sede"*. **Ese
encuadre era incorrecto** y el diseño lo corrige: el reloj de inactividad se queda **de la
marca**.

Un cliente que come en Envigado todos los viernes **no está inactivo para la marca**: mandarle
*"hace 20 días que no te vemos"* firmado por Laureles es falso, quema un mensaje, cuenta para la
regla de las 6 comunicaciones y consume cupo. Con el reloj de marca, cada cliente entra en
**una** audiencia y recibe **un** mensaje.

Lo que se parte por sede es la **atribución**: quién manda y quién paga, vía `is_home`. Como la
partición se hace **sobre** la lista de inactivos de la marca, `findInactiveCustomers()` no
cambia ni una línea y el frequency cap sigue siendo el de hoy.

Y el efecto que el §23.bis quería evitar **sí se resuelve, sin silencio**: la sede que perdió al
cliente lo ve en un panel de *"fuga entre sedes"* y puede forzarle una campaña manual con
criterio `pertenece`.

### 8.3 El interruptor de compatibilidad

**Todo el comportamiento nuevo se activa solo si el tenant tiene ≥2 sedes activas.** Con 0 o 1,
cada cron, cada campaña y cada evento corren **exactamente como hoy**.

Sin esto, un split aplicado sin condición dejaría a los 4 tenants vivos con toda su audiencia en
el bucket NULL, y si alguien lo descartara "porque no tiene sede", la reactivación de Sushi
Service, Don Alirio, Frangal y Demo **se apagaría por completo, en silencio**. Es el modo de
fallo más caro del §23.bis. El interruptor hace que las migraciones se puedan desplegar hoy sin
que cambie **ni un envío**.

### 8.4 Dashboard (D12)

El alcance viaja como **`?location_id=`** sobre las 47 rutas que ya existen (valores: ausente /
`all` / un uuid / `unknown`), resuelto **siempre en el servidor** con `requireLocationScope()`.
De las 47: **17 necesitan filtro**, 28 son configuración de marca, 2 dependen de D6.

**"Todas" significa "todas las que este usuario puede ver"** — el servidor colapsa la ausencia
al conjunto permitido, y la opción *"Todas las sedes"* solo se dibuja si el usuario es de marca.
Si "ausente" significara "toda la marca", cada ruta que olvidara el scope filtraría de más.

**Dos sedes por premio.** `granted_location_id` × `redeemed_location_id` en una **matriz
origen → destino**: es lo que convierte D3 de política invisible en número. *"Cuántos premios
entrega cada sede"* es la de entrega; *"su efectividad"* es la de origen.

**Advertencia dura que hay que poner en pantalla:** **ningún premio tiene precio en ninguna
tabla**. La "efectividad" solo puede ser **conteos y tasas, nunca pesos**. El dashboard de
Laureles podrá decir *"entregué 14 premios"*, nunca *"me costaron $X"*.

**Las métricas que salen de `customers`** (total de clientes, en riesgo, tiers, Black, ROI del
Golden Bullet) **son de la MARCA para siempre** — no por limitación, sino porque separarlas
contradiría el pedido del dueño. Para que nadie las lea mal, el tipo de retorno de
`getDashboardMetrics` **se parte en `{ brand, location }`**: mezclar numerador de sede con
denominador de marca deja de poder hacerse por descuido, porque no compila.

---

## 9. El AIOS — dar de alta la sede 2..N

Hoy hay **tres candados**, todos deliberados: `idx_client_locations_tenant_slug` UNIQUE en el
AIOS, el `RAISE 'tenant_ya_existe'` de `aios_provision_tenant`, y 3 validaciones de aplicación.

**Camino nuevo:** la sede 2..N **no crea tenant**. Llama a `aios_add_location(payload jsonb)
RETURNS jsonb` — función **SECURITY DEFINER nueva**, idempotente por `(tenant_slug, slug)`, que
devuelve el `restaurant_locations.id` creado. El AIOS lo guarda en una columna nueva
`client_locations.product_location_id`.

`aios_provision_tenant` **no se toca**: una función nueva no puede romper lo que ya funciona; un
`CREATE OR REPLACE` de sus 140 líneas sí.

**Cero GRANT nuevo de tabla.** El rol `aios_constelarys` no tiene ni un privilegio de tabla
(verificado: solo SELECT por columna sobre 18 columnas y EXECUTE sobre 5 funciones). La
**lectura** también tiene que ser función (`aios_list_locations`), porque el rol no puede hacer
SELECT a `restaurant_locations`. Y todas llevan **`REVOKE` nombrando a `anon` y `authenticated`**:
en Supabase las default privileges conceden EXECUTE nominal a esos roles — el patrón de la 00038,
que descubrió que `aios_provision_tenant()` (¡crea tenants!) estaba abierta con la anon key.

`aios_set_location_domain` va **separada** de `aios_add_location` porque el DNS y el dominio en
Vercel se configuran **después**: si van juntas, un fallo de DNS deja la sede sin crear.

**El otro arreglo obligatorio en el AIOS:** `provisioning.ts:719-731` solo arma `locations[]`
si vienen **lat y lon**; si falta alguna manda `[]` y el tenant nace **sin ninguna sede**. Con
este modelo eso es inservible: la sede es lo que carga el subdominio, la ficha de Google, los
meseros y la atribución. **La sede se crea SIEMPRE**; las coordenadas pasan a ser un dato
opcional más (§4/00041), no la condición para que la sede exista.

**Bug a arreglar de camino:** `rollupCredits()` (`credits.ts:217-241`) sumaría el mismo saldo
**una vez por sede**. Deduplica por unidad de facturación, y la tarjeta de cada sede dice
*"compartido con N sedes"* — las dos sedes **sí** giran contra el mismo saldo, así que
mostrárselo a las dos es correcto; lo que estaba mal era sumarlo dos veces en el total.

**`clients.billing_mode` (per_site / consolidated) no se toca.** Gobierna los `payments` de la
suscripción mensual de Cada1, **no** la billetera de mensajes. Son dos cobros distintos que hoy
se confunden por el nombre; el motor de cobros se apoya en `client_locations.id` y
`clients.billing_day`, jamás en `tenant_slug`, así que **sobrevive intacto**.

---

## 10. Fases

| Fase | Contenido | ¿Desplegable sola? | ¿Imprescindible para 2 sedes? |
|---|---|---|---|
| **F1** | 00041 + 00042: la sede como entidad, `UNIQUE (id, tenant_id)`, dominio por sede, sede canónica de los 4 vivos | Sí — nadie la lee todavía | Sí |
| **F2** | 00043: `location_id` en los eventos, todas NULL | Sí — no cambia ningún comportamiento | Sí |
| **F3** | Resolución de la sede: `resolveHostContext()`, la regla de sede única implícita, propagación a los escritores, **borrar la geocerca** | Sí | **Sí — sin esto las columnas nacen vacías** |
| **F4** | 00044 + login del mesero por sede (D11) | Sí | Sí |
| **F5** | 00046 + calendario, crons y domicilios con el interruptor de ≥2 sedes (D8, D9) | Sí | Sí |
| **F6** | 00043 (parte plata) + desglose por sede en el dashboard (D4, D12) | Sí | Sí |
| **F7** | 00045 + `LocationScope` + selector en el panel (D10) | Sí | **Sí — el dueño lo marcó obligatorio** |
| **F8** | 00047 + AIOS: quitar el UNIQUE, `product_location_id`, wizard de sede 2..N | No — depende de F1 | Sí |
| **F9** | 00048: `location_messaging`, cupo por línea, plantillas por línea | Sí | **No — solo si D6 = número por sede** |
| **F10** | 00049: `customer_review_state` | Sí | No — confirmar suposición §7.2 |

**F3 es el cuello de botella.** El §23 lo dijo y sigue siendo cierto: sin resolución de sede,
`location_id` nace vacía y se paga el cambio entero para quedarse con la mitad del pedido.

---

## 11. Conflictos entre áreas, y cómo se resolvieron

Las 8 áreas se diseñaron en paralelo y **discreparon en 8 puntos**. Queda escrito qué ganó y
por qué, para que nadie lo re-litigue:

| # | Discrepancia | Resolución |
|---|---|---|
| 1 | Permiso de sede: ¿RLS, o capa de consulta? | **Las dos, con papeles distintos.** El tipo opaco es el aislamiento real (la app corre con `service_role`); el RLS es red barata, solo en las tablas con `location_id`, autodescubiertas. |
| 2 | ¿Claim en el JWT o tabla? | **Tabla.** El JWT se escribe a mano y exige re-login. |
| 3 | ¿`tenant_wallet_transactions` lleva sede? | **Sí, denormalizada.** El `ON DELETE SET NULL` está **verificado en producción**: el JOIN pierde la sede al podar. |
| 4 | ¿El reloj de reactivación es de marca o de sede? | **De la marca**, con atribución por sede. Corrige el §23.bis (§8.2). |
| 5 | `restaurant_events`: ¿NULL = marca, o columna explícita? | **`audience_scope` explícito.** NULL ya significa otra cosa en todas las demás tablas. |
| 6 | "Clientes de una sede": ¿vista o tabla con trigger? | **Vista.** Más reversible y sin deriva; la tabla queda como optimización aditiva. |
| 7 | Precedencia de la sede en el check-in | **Actor autenticado → host → NULL.** El QR solo detecta conflictos. |
| 8 | `message_logs`: ¿una columna de sede o dos? | **Dos.** El p95 de `line_budget()` se calcula sobre 14 días de esa tabla y tiene que ser por línea. |

---

## 12. Lo que este spec NO resuelve

- **La separación de una sede** (venta, franquicia, socio distinto). Riesgo aceptado y aplazado
  por el dueño. No hay función de split y no se inventa.
- **Cuánto cuesta un premio en pesos.** Ninguna tabla tiene precio de premio. D12 solo puede
  responderse en conteos y tasas.
- **El histórico de los 4 tenants vivos.** Se queda en NULL y se muestra como *"Sin sede"*. Si
  el dueño crea una clave de sede para Sushi Service, ese usuario abre el dashboard y **ve cero
  visitas históricas**. Adoptar el histórico es posible (solo para un tenant de una sola sede),
  es **irreversible**, y no se ejecuta sin orden explícita.
- **Cocina central.** D9 dice que cada sede despacha su zona; el diseño resuelve por el número
  del operador y funciona con los dos modelos, pero si hay cocina central alguien tiene que
  asignar esa sede a mano.
- **Tests.** `tests/` tiene 6 archivos y **ninguno** toca clientes, visitas, puntos, check-in ni
  redención. Además `tests/setup/bootstrap.sql:8` declara derivarse de *"los 37 archivos de
  supabase/migrations"* y hoy hay **40** — con este spec serían 49. **Esa deriva hay que cerrarla
  antes de escribir el primer test**, o los tests corren contra un schema que no es el de
  producción.

---

## 13. Cómo se verificó

**Contra la base de producción**, con 4 sondas de solo lectura (rol `aios_constelarys`,
`pg_catalog`, ni un `INSERT`):

- `restaurant_locations`: `lat`/`lon` son `NOT NULL`; **no existe** `UNIQUE (id, tenant_id)`.
- `tenant_wallet_transactions_message_log_id_fkey` es **`ON DELETE SET NULL`**.
- `staff_devices.device_fingerprint`: solo índice normal, **sin UNIQUE**.
- `reward_tiers_threshold_tenant_unique`, `admin_settings_pkey (key, tenant_id)`,
  `idx_template_versions_provider_ref`, `idx_reward_grants_unique_active_campaign`: **confirmados
  con su definición exacta**.
- `message_logs`, `restaurant_events`, `authorized_numbers`, `send_queue`, `consent_events`: **sin
  ninguna columna de sede**.
- `tenants`: **14 columnas de mensajería**, confirmadas una a una.
- Postgres **17.6**.

**Lo que no se pudo verificar:** si ya hay teléfonos repetidos entre tenants distintos. El rol
del AIOS no puede leer `customers` (42501) y el `.env.local` del producto no tiene
`SUPABASE_SERVICE_ROLE_KEY`. No es bloqueante: con 0 negocios multi-sede,
`customers_phone_tenant_key` no está en riesgo.

**Lo que no se revisó:** la revisión adversarial de los 8 diseños y el chequeo de coherencia
automático **fallaron por límite de sesión**. La consolidación de §4 y los 8 conflictos de §11
se resolvieron a mano. **El DDL no se ha ejecutado.**
