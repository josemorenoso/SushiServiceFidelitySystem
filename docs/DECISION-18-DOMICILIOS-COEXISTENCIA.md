# Decisión §18 — Domicilios bajo coexistencia

> **Para el dueño.** Cada pregunta trae 2-3 opciones, su costo, qué rompe y qué gana. Ninguna
> propone texto libre por WhatsApp (Zernio no lo permite) ni le pone precio a un premio.
> Verificado contra el código el 2026-09-06 (rama `docs/decision-18`, solo lectura — no se tocó
> nada). Fuente: `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §18,
> `docs/features/delivery-webhook.md`, `docs/features/zernio-messaging.md`,
> `src/app/api/webhook/zernio/route.ts`, `authorized_numbers`.
>
> **Revisado el 2026-09-06 por la tarde** (rama `docs/decision-18-cerrada`, también solo lectura)
> contra tres hechos que no existían cuando se escribió. Dos preguntas quedaron cerradas por el
> código, una cambió de urgencia, y apareció una quinta.
>
> ⚠️ Los dos webhooks tienen **cambios sin commitear** de otra sesión (confirmaciones de
> `SALIR`/`ALTA` por TwiML). No tocan el gate de domicilios ni la auto-respuesta de 18.e, pero
> por eso acá se citan **funciones y no números de línea**: van a moverse.

---

## Lo que cambió desde que se escribió esto

1. **Sushi Fun ya es un tenant del despliegue principal, con su propia cuenta de Twilio.** Es el
   primer caso real de "el restaurante trae su línea". Pero es un caso **Twilio**, no Zernio: su
   alta fija `messaging_provider = 'twilio'` explícito y el `01` **aborta** si quedó en otra cosa
   (`SQL-PARA-CORRER/sushi-fun/01-alta-tenant-y-sede.sql:157,236`). Eso importa para 18.c.
2. **La firma de Twilio ya se valida con el token del tenant dueño del número** (commit `34b30a6`).
   Hasta hoy 17:57 UTC, un tenant con cuenta propia recibía **403 a todo mensaje entrante** — el
   gate de `authorized_numbers` era correcto pero **inalcanzable**. Recién ahora corre de verdad.
3. **El AIOS distingue "traigo mi número" de "compro uno"** (`fix/coexistencia`, paso 0 del wizard,
   `clients.whatsapp_provisioning.route`). El camino `own_number` **no cotiza ni compra nada**, y
   la Server Action lo rechaza del lado del servidor. Ese camino provisiona **Zernio**.

**Una dependencia de afuera que conviene saber:** el parte del AIOS (§8 y §10.1) deja abierto el
nombre del header de la firma HMAC de Zernio. Si está mal, **todos** los webhooks de Zernio
rebotan en 401 y no llega ningún cuadro de pedido — con o sin lo que se decida acá. Eso se
confirma antes que cualquier cosa de 18.c.

---

## Para decidir en 5 minutos

| # | Pregunta | Estado | Qué hacer |
|---|---|---|---|
| 18.a | ¿Por dónde entra el cuadro? | ✅ **RESUELTA por los hechos** | Ya funciona: Sushi Fun entró con su línea, sin comprar nada. Solo falta tu visto bueno a "seguir por WhatsApp, misma línea" |
| 18.b | ¿`authorized_numbers` basta? | ✅ **RESUELTA por el código** | Sí basta, y desde el fix de la firma **por fin es alcanzable**. Cero cambios |
| 18.c | ¿Qué se le responde al operador en Zernio? | 🟡 **Abierta, ya no bloquea** | **Plantilla solo si falla** — someterla a Meta cuando agendes el primer alta por el wizard, no antes: Sushi Fun es Twilio y ya recibe la confirmación completa |
| 18.d | ¿Qué lleva el apartado de Domicilios? | 🟡 **Abierta** | **Explicación + reusar `/dashboard/authorized-numbers`**, y que muestre **a qué número** se manda el cuadro: bajo coexistencia es distinto en cada marca |
| 18.e | ¿La auto-respuesta se queda cuando el número es la línea real? | 🔴 **NUEVA — está viva hoy** | **Apagarla por tenant** en cualquiera que traiga su línea. Hoy el sistema le contesta a los clientes de Sushi Fun que ese número "es exclusivo para mensajes automáticos" |

Lo único que queda por construir si aceptás las cinco: la plantilla de fallo (18.c, cuando llegue
el primer tenant Zernio), la pantalla de explicación (18.d) y el interruptor de la auto-respuesta
(18.e). 18.a y 18.b no requieren ni una línea de código.

---

## La mejor noticia: 18.b ya está resuelta, y nadie lo había notado

**18.b preguntaba:** si el cuadro sigue por WhatsApp, ¿cómo se distingue de un mensaje de un
cliente real ahora que ambos llegan al mismo número? Hoy se distingue por `authorized_numbers`
— la pregunta era si eso *basta* bajo coexistencia.

Leí `handleMessageReceived()` en `src/app/api/webhook/zernio/route.ts:106-247` línea por línea.
El gate es **exclusivamente por el teléfono del remitente** (`message.sender.phoneNumber`
contra `authorized_numbers.phone + tenant_id + is_active`), evaluado **después** del check de
opt-out/opt-in y **antes** de cualquier otra cosa. No mira a qué número llegó el mensaje, no
mira el contenido, no le importa si ese número es "la línea principal" o una alterna. Es el
mismo mecanismo, sin ninguna dependencia de que exista un número separado para domicilios.

**Conclusión: 18.b no bloquea nada. El mecanismo ya funciona bajo coexistencia tal cual está
hoy, sin escribir una línea de código.** El único supuesto del que depende (y que ya era cierto
antes de coexistencia): el número que manda el cuadro debe estar dado de alta en
`authorized_numbers` — que es justamente lo que ya se hace desde `/dashboard/authorized-numbers`.

Queda un matiz menor, no bloqueante: si el celular de un operador autorizado **también** es
cliente de fidelización de ese mismo restaurante, cualquier mensaje suyo se tratará siempre como
pedido, nunca como su propia interacción de cliente. Es un caso de borde que ya existía antes de
coexistencia (un número puede estar en las dos tablas) y no lo cambia esta decisión — se anota
por si el dueño quiere una regla explícita más adelante, no bloquea el onboarding.

> ### Actualización 2026-09-06 — sigue resuelta, y recién ahora es alcanzable
>
> El análisis de arriba era correcto **y estaba muerto en el agua**. `validateTwilioSignature()`
> comparaba siempre contra el token maestro del entorno, pero Twilio firma con el token de la
> cuenta **dueña del número**. Para cualquier tenant con cuenta propia — es decir, para todo
> tenant coexistente por el camino Twilio — la firma jamás cuadraba: **403 a todo entrante**,
> incluido el cuadro de un operador que sí estaba en `authorized_numbers`. El gate se evaluaba
> correctamente… en un código al que el mensaje nunca llegaba.
>
> El commit `34b30a6` invirtió el orden (resolver el tenant por `To`, después validar con **su**
> token) y lo confirmó con un `SALIR` real de un cliente de Sushi Fun. **18.b no cambia de
> respuesta; cambia de "cierto en teoría" a "cierto en producción".**
>
> Lo que sigue sin probarse: **un cuadro de pedido real entrando por una línea propia.** Sushi Fun
> no usa domicilios (`has_delivery_webhook: false`, 0 mensajes de domicilio en 193 —
> `docs/PARTE-SUSHI-FUN-2026-09-06.md` S6), así que lo verificado es el canal, no el flujo.

---

## 18.a — ¿Por dónde entra el cuadro?

**El problema en 3 líneas:** con coexistencia, el número que recibe los mensajes es el mismo con
el que el restaurante habla con sus comensales. El cuadro del pedido y la conversación con
clientes caen en la misma bandeja de WhatsApp. La pregunta es si eso importa y, si sí, qué se
hace en su lugar.

| Opción | Costo | Qué rompe | Qué gana |
|---|---|---|---|
| **A · Seguir por WhatsApp, misma línea (statu quo)** | Cero — es lo que ya funciona hoy (ver 18.b) | Nada técnico. El cuadro se mezcla visualmente con chats de clientes en el WhatsApp del dueño/operador, pero el sistema no necesita distinguirlos por contenido | Cero desarrollo, cero aprobación de Meta, igual a como funcionaba con Twilio |
| **B · Número dedicado a domicilios (segunda línea Zernio)** | Una línea nueva por tenant (US$16-21/mes en Colombia) + su propio Embedded Signup de Meta (la misma fricción que coexistencia buscaba evitar, ver REQUERIMIENTOS §1.5) + wiring de un segundo `zernio_account_id` por tenant | Multiplica el punto de fallo del onboarding self-service: 25 clientes → 25 líneas extra que dar de alta y facturar | Separación visual total del pedido respecto al chat de clientes — pero no resuelve nada que 18.b no resuelva ya |
| **C · Formulario en el dashboard (sin WhatsApp)** | Medio: una pantalla + un endpoint que llame a `registerDeliveryOrder()` con campos estructurados (nombre/celular/dirección/pago/monto) en vez de texto libre parseado por IA — el pipeline de DB ya existe, sería *más* simple que el parseo actual, no más complejo | El operador deja de poder "solo reenviar el mensaje" (hoy cero fricción, cero login) — exige tener el dashboard abierto | Elimina 18.b/18.c de raíz (no hay bandeja compartida ni límite de texto libre); funciona igual para tenants Twilio y Zernio |

**Recomendación: A.** Ya funciona, cuesta cero, y es exactamente el comportamiento que Twilio
tenía. C es una mejora de UX real pero no la pediría el 30 de agosto si A ya resuelve el
problema — dejarla para después, no bloquea el onboarding. B no resuelve nada que A no resuelva
y va en contra del motivo de ser de coexistencia (evitar líneas/números extra).

> ### Actualización 2026-09-06 — RESUELTA por los hechos. Solo falta tu visto bueno.
>
> **A dejó de ser una recomendación: es lo que está corriendo.** Sushi Fun entró al despliegue
> principal con su propia cuenta y su propio número, sin comprar ninguna línea, y sus mensajes
> entrantes ya llegan. Eso es exactamente la opción A en producción.
>
> **B queda descartada por los hechos, no por opinión.** El caso real trajo su número; y el AIOS
> ya construyó el camino `own_number` de forma que **rechaza cotizar y comprar del lado del
> servidor** — no es solo un botón escondido. Proponer una segunda línea comprada iría contra el
> flujo que el otro repo acaba de blindar.
>
> **C sigue siendo la mejora buena para después**, sin cambios: no bloquea nada y sigue siendo la
> única opción que borra 18.c y 18.e de un plumazo.
>
> **Recomendación (una línea): A, confirmado — el primer caso real ya entró por ahí y el AIOS
> hizo imposible el camino de comprar línea.**

---

## 18.c — ¿Qué se le responde al operador en Zernio?

**El problema en 3 líneas:** con Twilio, el operador recibía un TwiML de vuelta en la misma
conversación ("✅ Nuevo cliente: Juan Pérez... " o el motivo del fallo). Zernio no permite
responder con contenido dentro del webhook, y `src/lib/zernio/messaging.ts` solo manda
plantillas aprobadas — nunca texto libre. Hoy, un operador en un tenant Zernio manda el cuadro y
no se entera de nada: ni si funcionó, ni si falló.

| Opción | Costo | Qué rompe | Qué gana |
|---|---|---|---|
| **A · Plantilla de confirmación por cada pedido** | Una plantilla nueva (categoría UTILITY) sometida a Meta (24-72h, o casi instantánea si es "library template" — sin confirmar, ver REQUERIMIENTOS §1). Un call-site nuevo en `delivery.service.ts` que llama `sendZernioTemplateMessage()` con `toPhone = operatorPhone` tras cada intento (éxito o fallo) | Nada técnico — `sendZernioTemplateMessage()` ya acepta cualquier `toPhone` de la cuenta del tenant, no hace falta que sea un cliente | Paridad total con el TwiML de Twilio: el operador sabe si el pedido entró |
| **B · Silencio total, se apoya en el panel de Domicilios (18.d)** | Cero mensajería nueva | El operador no tiene feedback inmediato — si duda de si funcionó, puede reenviar el mismo cuadro y **duplicar** el cliente/visita/puntos (nada en el sistema deduplica un reenvío humano, solo deduplica el mismo evento de Zernio) | Ninguna aprobación de Meta que esperar, se puede lanzar ya |
| **C · Plantilla solo en el fallo** | Una sola plantilla nueva (igual trámite de Meta que A), pero se dispara solo cuando `processDeliveryMessage()` no logra extraer los datos — el éxito queda silencioso | Igual que B para el caso feliz: sin confirmación de éxito | Cubre el caso que más le duele al operador (no saber que algo *no* pasó) gastando una sola aprobación de Meta y muchas menos conversaciones que A |

**Recomendación: C.** El caso que de verdad genera reenvíos duplicados es el fallo silencioso,
no el éxito — un operador que no ve nada tras un pedido que sí funcionó tiende a no reintentar
tan seguido como uno que sospecha que falló. C cubre el riesgo real con una sola plantilla que
someter a Meta, en vez de las dos que pediría A.

> ### Actualización 2026-09-06 — sigue abierta, pero ya no bloquea al primer cliente
>
> **La restricción es de Zernio, no de coexistencia. No son lo mismo, y hasta hoy se confundían.**
> El primer restaurante que trajo su línea — Sushi Fun — es `messaging_provider = 'twilio'`, así
> que su operador recibiría el TwiML completo de `buildDeliveryReply()`
> (`src/app/api/webhook/twilio-incoming/route.ts`): confirmación de éxito con el nombre y
> la visita, y los cinco textos de fallo. **Para él, 18.c ni existe.**
>
> Dónde sí muerde: el wizard del AIOS provisiona **Zernio**. El primer cliente que se dé de alta
> **por el wizard** (no absorbido por SQL, como Sushi Fun) cae de lleno en 18.c y su operador se
> queda mudo. Y antes de eso hay que cerrar el header de la firma HMAC del parte del AIOS §10.1,
> porque con ese mal ni siquiera llega el cuadro.
>
> **Recomendación (una línea): C — plantilla solo si falla, sometida a Meta cuando agendes el
> primer alta por el wizard, porque el trámite tarda 24-72h y Sushi Fun no la necesita.**

---

## 18.d — ¿Qué lleva el apartado nuevo de Domicilios?

**El problema en 3 líneas:** el dueño pidió *"una parte reservada para domicilios para
explicarles cómo funciona y conectar algo si hace falta"*. Hoy no existe ese apartado — solo
existe `/dashboard/authorized-numbers`, que gestiona la lista de operadores pero no explica nada
del flujo ni depende de una decisión de 18.a/18.c primero.

| Opción | Costo | Qué rompe | Qué gana |
|---|---|---|---|
| **A · Solo explicación (texto estático)** | Trivial — una pantalla con el "cómo funciona" y un link a `/dashboard/authorized-numbers` | Nada | Desbloquea la comunicación al cliente ya mismo, sin esperar a nada de 18.a/18.c |
| **B · Explicación + reusa lo que ya existe** | Bajo — la misma pantalla de A, más un botón de "enviar un pedido de prueba" que valida el número del propio dueño contra `authorized_numbers` en caliente | Nada — no crea tablas nuevas | El dueño puede autoservirse (dar de alta operadores, probar) sin pedirle nada a Cada1 |
| **C · B + panel de pedidos recientes / fallidos** | Medio — necesita leer `visits` con `source='delivery'` y los `[Delivery][FALLO]` de log, o esperar a que exista la tabla de §24-B (`docs/features/delivery-webhook.md`, "Abierto") para no duplicar ese trabajo | Nada, pero si se construye ANTES de §24-B hay riesgo de reconstruirlo dos veces | Cierra el loop de 18.c-C: el operador (o el dueño) puede confirmar visualmente que el pedido entró, sin depender de ninguna plantilla |

**Recomendación: B ahora, C cuando llegue §24-B.** B es barato, reusa
`/dashboard/authorized-numbers` tal cual, y no bloquea nada. C es la respuesta correcta a largo
plazo pero construirla ahora duplicaría el trabajo que §24-B (la alarma de silencio) ya tiene
pendiente en el roadmap — mejor una sola vez.

> ### Actualización 2026-09-06 — abierta, con un requisito nuevo que destapó la coexistencia
>
> Sigue sin existir: el dashboard tiene 14 secciones y ninguna es de domicilios. B sigue siendo
> la recomendación, con **una cosa más que la pantalla tiene que mostrar**.
>
> Antes había un solo "número alternativo" y el dueño lo explicaba de memoria. Bajo coexistencia
> **cada marca recibe el cuadro en su propio número**, y el dueño de Cada1 no lo tiene en la
> cabeza para 25 restaurantes. La pantalla debe mostrar, para ese tenant, **a qué número manda el
> operador el cuadro** — el dato ya está en la fila del tenant (`twilio_whatsapp_number` o
> `zernio_phone_number`, según `messaging_provider`), no hay que guardarlo de nuevo.
>
> **Recomendación (una línea): B, y que la pantalla muestre el número receptor de ESA marca,
> porque bajo coexistencia ya no hay un único número que explicar de memoria.**

---

## 18.e — ¿La auto-respuesta se queda cuando el número es la línea real del restaurante? (NUEVA)

**El problema en 3 líneas:** cuando escribe alguien que **no** es operador autorizado, el webhook
de Twilio le contesta con `buildMessage()`
(`src/app/api/webhook/twilio-incoming/route.ts`): *"este número de **MARCA** es exclusivo
para mensajes automáticos 🔔 — para hablar con nosotros: [link]"*. Eso era cierto cuando el número
era una línea de sistema. **Bajo coexistencia es la línea por la que el restaurante atiende**, y
el sistema le está diciendo a un cliente real que ahí no lo atienden y que se vaya a otro lado.

Sale una vez cada 4 horas por número (cooldown), o sea que le pega **justo al primer contacto**.

Esto **solo pasa por el camino Twilio**: el webhook de Zernio no manda ninguna auto-respuesta, solo
loguea la intención (el log final de `handleMessageReceived()`, *"sin auto-reply: pendiente"*).
Y Sushi Fun es Twilio con línea propia — es decir, **está vivo hoy para sus 250 clientes**.

| Opción | Costo | Qué rompe | Qué gana |
|---|---|---|---|
| **A · Dejarla como está** | Cero | Un cliente que le escribe a su restaurante recibe un rebote automático que lo manda a otra parte. Si el link apunta al mismo número, lo manda a sí mismo | Nada que hacer |
| **B · Apagarla por tenant** | Bajo — una clave en `tenants.config` (es una preferencia pública, no un secreto: encaja en el modelo de `config`) y un `if` antes del bloque de cooldown. Se escribe con `merge_tenant_config_deep()` y, si se edita desde el panel, una ruta más en la whitelist de `src/lib/tenant-config-paths.ts` | Nada — los tenants que no la toquen siguen igual | El restaurante que atiende por ese número deja de tener un robot contestando antes que él |
| **C · Reescribirla por tenant** | Medio — B más un texto editable y su validación; hay que decidir qué pasa con el `intent` (pedido/horario/ubicación), que hoy elige entre cuatro textos horneados | Nada técnico, pero es una pantalla más que mantener y traducir a 25 marcas | El restaurante puede poner un "ya te contestamos" real en vez de silencio |

**Recomendación: B, y apagada por defecto en todo tenant que traiga su línea.** Un restaurante que
atiende personalmente por ese número no quiere que el sistema le conteste primero; C es la versión
linda de lo mismo y se puede hacer después sin rehacer B.

**Un dato que hay que saber para decidir:** el producto **no sabe hoy** qué tenants son
coexistentes. Ese dato vive en el AIOS (`clients.whatsapp_provisioning.route`) y no viaja a la
fila del tenant. Por eso B es un interruptor por tenant y no una regla automática: alguien lo tiene
que prender a mano al dar de alta, hasta que el AIOS mande el dato.

**Nota lateral, no es decisión tuya:** `auto_reply_cooldown` **no tiene `tenant_id`** — su PK es el
teléfono solo, y la tabla nació fuera de las migraciones (`docs/04-deployment.md:305`). Con varias
marcas en líneas propias, un cliente que le escribe a la marca A **silencia la auto-respuesta de la
marca B durante 4 horas**. Es un defecto conocido y ya anotado
(`docs/superpowers/specs/2026-09-03-default-puente-tenant.md:158`); si se elige B, deja de importar
para los tenants apagados, pero no se arregla solo.
