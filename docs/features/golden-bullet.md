# Feature: Golden Bullet (Importación Masiva de Contactos)

> **Versión:** v3.1.0 — 2026-09-10
> **Estado:** ✅ Implementado (detrás de feature flag)
> **Migraciones:** `00023_imported_contacts.sql` · `00060_golden_bullet_bloques.sql`
> **Ver también:** [`send-governance.md`](send-governance.md) · [`campaigns.md`](campaigns.md)

## Objetivo

Importar bases de contactos externas, validarlas, calcular el costo y despertarlas
**a un ritmo que la línea aguante**, preguntándole a cada persona si quiere estar.

## Qué cambió en la v3.0.0 (leer esto antes que nada)

**Golden Bullet dejó de ser una bala.** Antes disparaba a toda la base dentro del mismo
request HTTP. Con 25.000 contactos eso no funcionaba y no era un detalle de rendimiento:
a diez envíos en paralelo son unos veinte minutos contra un `maxDuration` de 300 s, así
que la función moría a los cinco dejando miles de contactos a medias, la campaña sin
cerrar y ninguna forma de saber quién había recibido qué.

Ahora **encola** (`send_queue`) y el drenador va sacando **bloque por bloque**, al ritmo
del cupo real de la línea. Tres consecuencias que hay que decir en voz alta:

| | Antes | Ahora |
|---|---|---|
| Cuándo sale | Todo en el momento de confirmar | Un bloque por día, el que elija el operador |
| Qué devuelve `confirm` | `sent` | `queued` + el **plan** con fecha de fin |
| Quién manda de verdad | El request del panel | `/api/cron/queue-drain`, cada 15 min |

## El divisor de bloques (D-7)

> *"debemos tomar el total de clientes y poder dividirlos en bloques de la cantidad que
> queramos respetando siempre el límite de la cuenta […] hay restaurantes que van a
> querer cargar hasta 7000 y a estos no van a poder despertarlos en un solo día"*
> — el dueño, `REQUERIMIENTOS_AGOSTO_2026.md` §20 / D-7.

1. El operador ve el total y **elige el tamaño del bloque diario**. No lo elige el sistema.
2. El sistema lo **acota** al cupo real: `bloque = LEAST(elegido, presupuesto_de_campaña)`.
3. La pantalla muestra **cuántos días son y en qué fecha termina**, antes de confirmar.

### Cómo está implementado, y por qué así

Los bloques **no** son un contador ni un estado nuevo: son un **`not_before` escalonado**.
Al encolar, el contacto número *i* recibe `not_before = hoy + floor(i / tamaño_bloque)` días.

Eso vale la pena entenderlo porque explica por qué el cambio es pequeño y seguro:

- El drenador **ya** ordenaba por `not_before` y **ya** releía el presupuesto en cada
  vuelta. No se le tocó una sola línea de su bucle.
- El plan queda **visible y auditable en la tabla**: se puede mirar `send_queue` y ver
  exactamente qué día le toca a cada teléfono.
- Golden Bullet es **P4**, la prioridad más baja de las cinco. Siempre le cede el turno a
  las campañas de clientes que **sí** consintieron.

### La aritmética que hay que mirar antes de prometer nada

| Escalón de Meta | Presupuesto de campaña | 25.000 contactos |
|---|---|---|
| 250 (línea nueva) | 180 | **139 días** |
| 1.000 | ~930 | 27 días |
| 10.000 | ~9.900 | 3 días |

El presupuesto **no** es la constante 180: es `límite − reserva`, y la reserva se
autocalibra contra el consumo transaccional real (ver `send-governance.md`).

**Consecuencia comercial:** una base de 25.000 en una línea de 250 no se despierta —
se despierta en cuatro meses y medio, y solo si la calidad aguanta verde todo ese tiempo.
Ventas tiene que saberlo para no prometer resultados el mismo día.

## La plantilla con botones

La forma de despertar una base fría **no** es una promo a secas: es una **pregunta con dos
botones**.

No es una idea de conversión, es de supervivencia de la línea. Un botón «no me interesa»
le da a la persona una salida de un toque, y eso es **mucho** más barato para la
reputación del número que un «Bloquear» — que es lo que hace la gente cuando no tiene
botón. Y el que toca «quiero ser parte» deja un **consentimiento explícito y fechado** que
en una base heredada no existía en ningún lado.

### El texto, listo para copiar

Reemplazá `[MARCA]` por el nombre del restaurante y la línea de procedencia por la que sea
**verdad** (ver la advertencia de abajo).

```
Hola {{1}} 👋

Te escribimos de [MARCA]. [DE DÓNDE SALIÓ SU NÚMERO — una línea, y que sea cierta.]

Estamos abriendo nuestro club de beneficios y queremos empezar contigo: {{2}}

¿Querés hacer parte? Es gratis y salís cuando quieras.
```

**Botones (respuesta rápida):**

| Texto visible | `id` / payload | Largo |
|---|---|---|
| `Quiero ser parte` | **`CLUB_SI`** | 16 / 20 |
| `No, gracias` | **`CLUB_NO`** | 11 / 20 |

> ⚠️ **Los payloads `CLUB_SI` y `CLUB_NO` son un contrato con el código.** Están escritos
> en `src/services/club-optin.service.ts` (`CLUB_PAYLOAD_SI` / `CLUB_PAYLOAD_NO`). Si la
> plantilla se crea con otro `id`, el respaldo por texto visible todavía la salva — pero
> si además cambia el texto, el botón deja de hacer nada. Se cambian los dos lados o ninguno.

### Cómo se crea en Twilio (Content Template Builder)

Tipo **`twilio/quick-reply`**, categoría **MARKETING**, idioma **es**:

```json
{
  "friendly_name": "golden_bullet_club_invite",
  "language": "es",
  "variables": { "1": "Juan", "2": "un postre gratis en tu próxima visita" },
  "types": {
    "twilio/quick-reply": {
      "body": "Hola {{1}} 👋\n\nTe escribimos de [MARCA]. …",
      "actions": [
        { "id": "CLUB_SI", "title": "Quiero ser parte" },
        { "id": "CLUB_NO", "title": "No, gracias" }
      ]
    }
  }
}
```

**El contrato de variables lo impone el código** (`confirmImport()`):

- `{{1}}` = nombre del contacto, o el genérico si el CSV no traía nombre. **Obligatoria.**
- `{{2}}` = el texto de la promo que se escribe en el asistente. **Opcional desde el
  2026-09-11**: un mensaje que dice «tenemos un regalo preparado para ti» no la necesita, y
  el asistente solo pide el texto de la promo si la plantilla elegida la usa. Si no la usa,
  `{{2}}` no viaja en las variables (mandar una que la plantilla no declara también es rechazo).

Una plantilla con tres variables **no sirve**, y el asistente ya no la ofrece.

> ⚠️ **Ninguna plantilla del catálogo estándar sirve para Golden Bullet.** Las MARKETING
> aprobadas de una marca (reactivación, puntos, cumpleaños) llevan **tres o cuatro**
> variables — saldo de puntos, camino de niveles. Elegir una de esas manda un envío con
> variables faltantes que el proveedor rechaza **entero**: fallaría en el 100% de los
> destinatarios, y recién se vería después de confirmar. Desde el 2026-09-10 el paso 4
> **solo ofrece las que usan `{{1}}` (y a lo sumo `{{2}}`)** y lista aparte las que
> descartó, con el motivo (`plantillaCompatible()` en el asistente).

### Qué pasa cuando tocan cada botón

| Botón | Qué ocurre |
|---|---|
| **Quiero ser parte** | Se registra un `opt_in` REAL en `consent_events` (canal `whatsapp_reply`) y se le contesta con un enlace. **Desde el 2026-09-11 ese enlace es una [invitación con premio](invite-campaigns.md)** si el dueño eligió una (Recompensas → Invitaciones → «Usar en Golden Bullet», `admin_settings.golden_bullet_invite_slug`): al registrarse le queda el regalo en la tarjeta y **no** suma la visita #1 hasta que el mesero lo escanea. Sin invitación elegida, el enlace general de la tarjeta, como antes. **No** se le crea el cliente: registrarse pide nombre y cumpleaños, y esos datos no vienen en un toque de botón — inventarlos ensucia la base para siempre. Pasa a `converted` cuando se registra de verdad, en `/api/check-in`, como siempre. |
| **No, gracias** | `opt_out` en `consent_events`, `whatsapp_opt_out_at` si además era cliente, y `imported_contacts.status = 'opted_out'`. Se le confirma que no se le escribe más. |

> **El agujero que esto tapó (2026-09-10):** `isPhoneOptedOut()` miraba **solo** la tabla
> `customers`. Todo el que recibía un mensaje era cliente, así que alcanzaba. Golden
> Bullet rompe esa suposición — le escribe a gente que no está en `customers` — y sin la
> segunda consulta el "no" de esas personas **no lo miraba nadie**. Ahora mira los dos sitios.

> ⚠️ **En Zernio el botón «sí» no recibe respuesta.** El webhook de Zernio solo puede
> devolver un 2xx sin cuerpo, y la única salida de envío manda **plantillas aprobadas**: el
> texto libre no es que sea difícil, es que no existe. El efecto de negocio sí ocurre
> entero (queda el consentimiento, queda el opt-out), pero quien consiente **no recibe su
> enlace**. Es hermano del 18.c y necesita una plantilla nueva aprobada por Meta.

### Antes de mandarle esto a Meta

**La línea de procedencia tiene que ser verdad.** Si la base es comprada o de origen
desconocido, no se puede escribir "porque nos visitaste". En Colombia el tratamiento de
datos personales lo rige la **Ley 1581 de 2012** y el consentimiento previo no es un
formalismo. Esa es exactamente la razón por la que la plantilla pregunta en vez de
promocionar: el botón convierte una base sin consentimiento en una lista de gente que sí
lo dio, y deja constancia de quién dijo que no.

## El tablero diario y el botón de parar (v3.1.0)

Un goteo de semanas sin tablero es un goteo a ciegas. La pestaña **«En curso»** —que es la
que abre la pantalla, antes que «Nueva campaña»— contesta tres preguntas:

- **¿Cuánto cupo me comí hoy?** El número grande: mensajes de esta base que salieron hoy.
- **¿Qué sigue?** Cuántos salen en el próximo bloque, qué día, y la fecha estimada de fin.
- **¿Cómo lo paro?** Un botón.

### Cómo está hecha la pausa, y por qué NO es un estado nuevo

Lo obvio sería agregarle `paused` al CHECK de `send_queue.status`. **Sería un error caro.**
El anti-duplicado de la 00038 es un índice único PARCIAL `WHERE status = 'queued'`: en
cuanto un item sale de `queued` **libera su hueco**, así que una campaña pausada se podría
volver a encolar entera y esa gente recibiría el mensaje **dos veces**.

Pausar es poner `not_before` en el año 9999. El item sigue `queued` —el índice sigue
protegiendo— y el drenador ni lo mira, porque `claim_send_queue()` filtra
`not_before <= now()`. Cero estados nuevos, cero cambios en el drenador, cero migración.
Es el mismo mecanismo con el que están hechos los bloques.

| | Qué pasa |
|---|---|
| **Detener** | Lo que falta deja de salir. **No se cancela ni se pierde nada.** Lo que ya salió no se puede deshacer. |
| **Reanudar** | Se reprograma **desde hoy**, y se puede elegir un ritmo **distinto** del original — sin volver a subir el CSV. |

> **Por qué reanudar reprograma en vez de restaurar las fechas viejas:** si estuvo una
> semana parado, esas fechas ya pasaron y **todo saldría de golpe el mismo día** — que es
> exactamente lo que los bloques existen para evitar.

### El control del cupo diario es el tamaño del bloque

No hay un sub-cap aparte, y es deliberado: **D-7 eliminó `golden_bullet_pct` a propósito**.
El freno es el número que elige el operador.

Lo que sí cambió en la v3.1.0 es **qué se propone por defecto: la mitad del cupo, no el
cupo entero.** El techo sigue siendo el presupuesto completo y se puede subir; lo que se
evita es que el valor que aparece solo sea el más agresivo posible.

⚠️ **La razón concreta, que hay que entender antes de subirlo:** los cumpleaños y los
recordatorios de premio **no pasan por esta cola** — salen de su propio cron (13:00 y 11:00
de Bogotá). Si el goteo vacía el presupuesto de campaña de madrugada, **esos mensajes
fallan**. Golden Bullet es P4 y cede el turno dentro de la cola, pero contra un cron que
envía directo no hay prioridad que valga: el cupo ya se gastó.

Con una línea de 2.000 (Sushi Service): presupuesto ≈ 1.930, bloque propuesto ≈ 965, y
quedan ~965 para todo lo demás. 15.000 contactos a ese ritmo son **16 días**.

## Los tres textos se escriben en el panel (2026-09-11)

La pestaña **«Plantilla»** tiene los tres mensajes del flujo, y **ninguno está horneado**:

1. **Mensaje 1 — la plantilla con botones.** Se escribe el cuerpo entero (`{{1}}`
   obligatoria, `{{2}}` opcional, tope 1.024) y los títulos de los dos botones (tope 20,
   contados como los cuenta WhatsApp: «Sí, quiero mi regalo» cabe justo; con un emoji
   delante, no). Se crea en la cuenta Twilio del negocio y se somete a Meta sin que nadie
   copie un token. Lo que antes era un campo aparte —**de dónde salió su número, y tiene que
   ser verdad**— ahora es parte del texto: el panel lo recuerda, el servidor no puede
   verificarlo. Sin texto propio sale el de defecto (`buildClubInviteBody()`).
2. **Mensaje 2 — la respuesta al «sí».** Texto con `{nombre}`, `{enlace}` y `{marca}`, más
   una **foto** (la del regalo) que se sube desde ahí mismo. El enlace es el de la
   invitación con premio si hay una elegida; la pantalla avisa en ámbar cuando no la hay,
   porque entonces **quien se registra no recibe regalo**.
3. **La respuesta al «no».** Texto con `{marca}`.

Todo vive en `admin_settings` de la marca (`CLUB_SETTING_KEYS` en `club-optin.service.ts`):
`golden_bullet_reply_si_text`, `golden_bullet_reply_no_text`, `golden_bullet_reply_si_image_url`,
y los títulos `golden_bullet_button_si` / `golden_bullet_button_no`, que el `POST` de la
plantilla guarda al crearla para que `detectClubButton()` los reconozca por texto cuando el
proveedor no manda payload. Vacío = el texto de defecto del servidor (`RESPUESTA_*_DEFECTO`).

`renderClubReply()` rellena los comodines y es pura: sin nombre, `{nombre}` se va **con la
coma** («por aquí, {nombre}!» → «por aquí!») y `{nombre|¿cómo estás?}` pone el alternativo en
su lugar; sin enlace, se va la línea entera. El nombre sale de `imported_contacts.name` y, si
no, de `customers.name`. **En el mensaje 1 no hay alternativo posible**: `{{1}}` es una
variable de Meta y no puede ir vacía, así que los sin nombre reciben el «nombre genérico» que
se escribe en el paso 4 del asistente (`fallback_name`; «¿cómo estás?» sirve). La foto viaja como `<Media>`
en el TwiML de `twilio-incoming` (Zernio sigue sin poder contestar: ver arriba).

> `POST /api/dashboard/imported-contacts/template` crea **y somete**. `GET` de la misma
> ruta devuelve los defectos, los topes y las respuestas guardadas, y **no toca Twilio ni Meta**.
> La foto sube por `POST /api/dashboard/imported-contacts/reply-image` (bucket `brand-assets`,
> path con `tenant_id` delante, recomprimida a JPEG) y el panel guarda la URL en el ajuste.

## Las dos puertas que siguen cerradas

**1 · Puerta de calidad** (spec §3.4.1, conservada por D-7). El asistente **bloquea** si:

```
line_status  ≠ 'active'   →  la línea está estrangulada o congelada
quality_rating ∈ {yellow, red}  →  Meta ya la tiene marcada
```

Golden Bullet es la única clase que le escribe a gente sin consentimiento, así que es la
primera sospechosa de una caída de calidad — y la primera que se apaga.

D-7 **eliminó** la puerta del escalón (`messaging_daily_limit > 250`): a 250 también se
puede, más lento.

**2 · Saldo** (spec W-D6). Se cobra la base **entera por adelantado**, aunque salga
goteando durante meses. Es el comportamiento que ya existía; cambiarlo es una decisión
comercial, no un detalle de implementación.

## Modelo de datos

### `imported_contacts`
`phone` (único), `name?`, `email?`, `source_file`, `source_batch`, `status`,
`validation_error?`, `message_sent_at?`, `twilio_sid?`, `converted_to_customer_id?`,
`campaign_id?`.

Estados (`00060` agregó los dos últimos):

| Estado | Significa |
|---|---|
| `pending` / `valid` / `invalid` | del parseo del CSV |
| **`queued`** | en `send_queue`, esperando su bloque. Pueden ser semanas |
| `sent` / `delivered` / `bounced` | resultado del envío |
| `converted` | volvió y se registró: ya es customer |
| `blocked` | no se le escribió por la regla anti-reenvío. **Decisión nuestra** |
| **`opted_out`** | pidió salir. **Decisión suya** — es evidencia y no se mezcla con `blocked` |

### Reglas anti-reenvío (CRÍTICO)
- Un teléfono que **ya existe** en `imported_contacts` NUNCA se vuelve a contactar. Se
  excluye en `validate` y **otra vez** en `confirm` (carrera entre dos importaciones).
- Los duplicados dentro del mismo CSV se descartan (solo el primero cuenta).

## Flujo (asistente de 5 pasos)

1. **Subir CSV** — columnas `telefono` (req), `nombre`, `email`.
2. **Validar** — `POST /validate`, **sin insertar**; devuelve conteos, razones y la lista de válidos.
3. **Costo** — `válidos × tarifa` + saldo.
4. **Plantilla y bloque** — plantilla MARKETING aprobada + **cuántos por día**, con la
   fecha de fin calculada.
5. **Confirmar** — se acepta la advertencia → `POST /confirm`: inserta como `queued`,
   crea la campaña y **encola** en bloques.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/dashboard/imported-contacts/validate` | Validar CSV (multipart `file`), sin insertar |
| POST | `/api/dashboard/imported-contacts/confirm` | Insertar + **encolar**. Body: `{ batch_id, source_file, template_sid, promo_text?, block_size, consent_text?, fallback_name?, contacts[] }` (`promo_text` solo si la plantilla usa `{{2}}`) |
| GET | `/api/dashboard/imported-contacts` | Lotes o contactos de un `batch_id` |
| GET | `/api/dashboard/imported-contacts/stats` | Estadísticas por `batch_id` |
| GET | `/api/dashboard/imported-contacts/roi` | ROI por `batch_id` |
| GET | `/api/dashboard/imported-contacts/progress` | Con `batch_id`, la foto de ese lote. **Sin** `batch_id`, todo lo que sigue goteando |
| POST | `/api/dashboard/imported-contacts/pause` | `{ campaign_id, action: 'pause' \| 'resume', block_size? }` |
| GET/POST | `/api/dashboard/imported-contacts/template` | `GET` = defectos, topes y respuestas guardadas (no toca nada). `POST` = crea en Twilio y somete a Meta. Body: `{ body, boton_si?, boton_no?, promo_ejemplo? }` |
| POST | `/api/dashboard/imported-contacts/reply-image` | Sube la foto de la respuesta al «sí» (multipart `file`, JPG/PNG/WebP) y devuelve su URL pública |

**Topes de `confirm`:** `409` si la puerta de calidad frena · `409` si no hay saldo ·
**`413` si el lote pasa de 30.000 contactos**. Ese último no es una regla de negocio: es
el tamaño del cuerpo de la petición, porque `validate` no persiste y los contactos vuelven
a viajar en el POST. Pasado ese número hay que partir el CSV — cada archivo conserva su
propio plan y la regla anti-reenvío impide que un repetido reciba dos mensajes.

## Dónde se anota el resultado

El que manda de verdad es el **drenador**, semanas después, y solo sabía escribir en
`campaign_messages` — que exige `customer_id`. Un contacto importado no es cliente, así
que `markImportedContactsResult()` es lo que cierra el círculo: marca `sent` con su SID, o
`bounced` **solo al rendirse** (3.er intento). Un fallo reintentable no marca nada: el
contacto sigue en cola y todavía puede salir.

## Feature flag y costo
- `admin_settings.golden_bullet_enabled` (`'true'`/`'false'`, default `false`). **Se enciende
  desde la propia pantalla** (`/dashboard/imported-contacts`, el aviso ámbar de arriba tiene el
  botón «Encender Golden Bullet», que hace `PUT /api/dashboard/settings`). Mientras esté en
  `false`, `validate`, `confirm` y `template` responden **403** y el selector de archivo está
  deshabilitado. Hasta el 2026-09-11 el 403 decía «actívalo en Ajustes», Ajustes no tenía la
  casilla y la página no montaba `<Toaster>`: el CSV «no cargaba» y nadie veía por qué.
- `admin_settings.twilio_cost_per_message_usd` (default `0.0175`).

## Qué acepta como celular (`normalizePhone()`)
Exactamente `3` + 9 dígitos, solo o detrás del indicativo (`+57`, `57`, `0057`). Mira el número
**entero**: la versión anterior se quedaba con los últimos diez dígitos y un móvil francés
(`+33 6…`), italiano (`+39 3…`) o cualquier extranjero cuyos últimos diez empezaran por 3 pasaba
como colombiano. El test que lo fija: `tests/unit/golden-bullet-telefonos.test.ts`.

## Decisiones tomadas en la v3.0.0 (revisables)

- **TTL de 30 días por item** (`IMPORT_TTL_DIAS`). Sin vencimiento, una base encolada
  gotearía un año si la línea se congela; con uno corto, una semana de línea congelada
  evaporaría la base entera en silencio. 30 días es donde el mensaje ya no tiene sentido
  (la promo que anuncia venció) pero un incidente normal de calidad no borra el trabajo.
- **La advertencia aceptada NO va a `consent_events`.** El spec §3.4.1 lo pedía; no se
  hizo. `consent_events` es el libro de que **una persona** consintió, y estas personas no
  consintieron — de eso trata todo el régimen especial. Escribir 25.000 filas `opt_in`
  porque el **operador** marcó una casilla fabricaría exactamente la evidencia que el libro
  existe para poder demostrar. Vive en `campaigns.filters.consent_warning`, con el texto
  exacto, quién lo aceptó y cuándo.

## Archivos

- `supabase/migrations/00023_imported_contacts.sql`, `00060_golden_bullet_bloques.sql`
- `src/services/imported-contacts.service.ts` (`planBlocks()`, `confirmImport()`, `markImportedContactsResult()`)
- `src/services/club-optin.service.ts` — los dos botones
- `src/services/golden-bullet-template.service.ts` — crea la plantilla y la somete a Meta
- `src/components/dashboard/ImportedContactsProgress.tsx` — el tablero diario y el botón de parar
- `src/components/dashboard/ImportedContactsTemplate.tsx` — crear la plantilla sin salir del panel
- `src/app/api/dashboard/imported-contacts/{route,validate,confirm,stats,roi}.ts`
- `src/app/(dashboard)/dashboard/imported-contacts/page.tsx`
- `src/components/dashboard/ImportedContactsUploader.tsx`, `ImportedContactsCostEstimator.tsx`, `ImportedContactsHistory.tsx`
- `tests/unit/golden-bullet-bloques.test.ts`, `tests/unit/golden-bullet-telefonos.test.ts`, `tests/unit/golden-bullet-respuestas.test.ts`
- `src/app/api/dashboard/imported-contacts/reply-image/route.ts` — la foto del mensaje 2
- `public/plantilla_golden_bullet.csv`
- Wiring: `src/app/api/cron/queue-drain/route.ts` (envío y marcado),
  `src/app/api/webhook/twilio-incoming/route.ts` y `webhook/zernio/route.ts` (botones),
  `src/services/customer.service.ts` (`isPhoneOptedOut` mira los dos sitios),
  `src/app/api/check-in/route.ts` (conversión)
