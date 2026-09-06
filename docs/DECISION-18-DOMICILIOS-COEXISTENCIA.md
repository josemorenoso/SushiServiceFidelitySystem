# Decisión §18 — Domicilios bajo coexistencia

> **Para el dueño.** Cada pregunta trae 2-3 opciones, su costo, qué rompe y qué gana. Ninguna
> propone texto libre por WhatsApp (Zernio no lo permite) ni le pone precio a un premio.
> Verificado contra el código el 2026-09-06 (rama `docs/decision-18`, solo lectura — no se tocó
> nada). Fuente: `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §18,
> `docs/features/delivery-webhook.md`, `docs/features/zernio-messaging.md`,
> `src/app/api/webhook/zernio/route.ts`, `authorized_numbers`.

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

---

## Resumen para decidir en 5 minutos

| # | Pregunta | Recomendación | Por qué en una línea |
|---|---|---|---|
| 18.a | ¿Por dónde entra el cuadro? | **A — seguir por WhatsApp, misma línea** | Ya funciona hoy, cuesta cero |
| 18.b | ¿`authorized_numbers` basta? | **Ya resuelto — sí basta, sin cambios** | El gate es por remitente, no por número receptor ni contenido |
| 18.c | ¿Qué se le responde al operador en Zernio? | **C — plantilla solo si falla** | Cubre el riesgo real (duplicados por reintento) con una sola aprobación de Meta |
| 18.d | ¿Qué lleva el apartado nuevo? | **B — explicación + reusa lo existente; C cuando llegue §24-B** | Barato ahora, evita reconstruir el panel de pedidos dos veces |

Si el dueño acepta las cuatro recomendaciones, lo único que queda pendiente de construir es: la
plantilla de fallo (18.c) sometida a Meta, y la pantalla de explicación + link a
`/dashboard/authorized-numbers` (18.d). 18.a y 18.b no requieren ni una línea de código.
