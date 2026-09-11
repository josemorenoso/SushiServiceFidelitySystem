# Plantillas WhatsApp — Sistema de Puntos + Mystery Box

> Documento de referencia para crear y configurar plantillas en Twilio Content API.
> Aplica a cualquier instancia del sistema (clone-por-restaurante).
> Reemplaza `[Restaurante]` por el nombre del negocio en cada caso.
> **Versión:** v1.0.2 — Sistema de Puntos + Mystery Box
> **Última actualización:** 2026-05-25 — Variables corregidas, opt-out agregado, reactivación agresiva con {{4}}

> **📌 Desde v2.12.0 (2026-08-30) este documento describe el estilo `calido`, que es uno de tres.**
> El catálogo estándar de 13 plantillas (un solo estilo desde el 2026-09-10), la edición desde
> el dashboard y el flujo "crear → esperar aprobación → cambiar puntero" viven en
> **`docs/features/whatsapp-templates.md`**. Los textos ya no se copian a mano: están tipados en
> `src/constants/template-texts.ts`, y la tabla de variables de abajo es la versión en prosa del
> contrato que ahora vive en `src/constants/template-catalog.ts`.
> Este documento sigue siendo la referencia del **tono cálido** y de **qué manda el backend en cada
> `{{n}}`** — eso no cambió. Lo de aquí aplica tal cual a los 4 tenants Twilio.

---

## Tipos de plantilla en este sistema

| Tipo Twilio | Uso | Cómo se crea | Assigned en |
|---|---|---|---|
| `twilio/text` | Comunicaciones operativas (bienvenida, puntos, premios, mystery box, cumpleaños, reactivación, campañas) | Dashboard → Plantillas → formulario | `admin_settings` vía Dashboard → Ajustes |
| `twilio/media` | Invitaciones a eventos del calendario con imagen o video | `scripts/twilio-create-media-templates.mjs` (una sola vez) | `admin_settings` directo en Supabase: `event_template_image_sid` / `event_template_video_sid` |

---

## ⚠️ Requisito de Opt-Out (Obligatorio para Meta)

**TODAS las plantillas categoría MARKETING** deben incluir un mecanismo de opt-out para cumplir con las políticas de Meta (2024).

### Opciones de implementación:

1. **Botón de opt-out nativo de Twilio** (recomendado): Al crear la plantilla en Twilio Content API, agregar un botón "Stop" o "Salir" que envíe el keyword `STOP`.
2. **Texto disimulado al final del mensaje**: Agregar al final de cada plantilla MARKETING:
   > *"Responde SALIR para no recibir más mensajes."*
   
   Formato: texto pequeño, gris, al final del mensaje, sin llamar la atención.

### Plantillas que requieren opt-out:

| Plantilla | Categoría Twilio | Opt-out requerido |
|---|---|---|
| Puntos sumados (lejos) | MARKETING | ✅ Sí |
| Puntos sumados (cerca) | MARKETING | ✅ Sí |
| Tier desbloqueado | MARKETING | ✅ Sí |
| Mystery Box resultado | MARKETING | ✅ Sí |
| Golden Box resultado | MARKETING | ✅ Sí |
| Cumpleaños | MARKETING | ✅ Sí |
| Reactivación suave (21d) | MARKETING | ✅ Sí |
| Reactivación agresiva (25d) | MARKETING | ✅ Sí |
| Campaña manual | MARKETING | ✅ Sí |
| Evento imagen/video | MARKETING | ✅ Sí |
| Bienvenida | UTILITY | ❌ No aplica |

---

## Tabla de Variables por Plantilla (v1.0.2 — Puntos)

Esta tabla es la verdad única del sistema. El backend envía exactamente estas variables para cada slot.

| Slot en Settings | `{{1}}` | `{{2}}` | `{{3}}` | `{{4}}` |
|---|---|---|---|---|
| **Bienvenida** | Nombre | Puntos iniciales | Roadmap tiers | — |
| **Puntos sumados (lejos)** | Nombre | Pts ganados hoy | Pts totales | Roadmap tiers |
| **Puntos sumados (cerca)** | Nombre | Pts ganados hoy | Pts totales | Premio próximo |
| **Tier desbloqueado** | Nombre | Nombre tier | Premio safe | Roadmap tiers |
| **Mystery Box resultado** | Nombre | Nombre tier | Premio ganado | Roadmap tiers |
| **Golden Box resultado** | Nombre | Premio ganado | Roadmap tiers | — |
| **Cumpleaños** | Nombre | Pts actuales | — | — |
| **Reactivación suave (21d)** | Nombre | Pts actuales | Premio próximo | — |
| **Reactivación agresiva (25d)** | Nombre | Pts actuales | Premio próximo | **Recompensa especial** (si configura admin) |
| **Campaña manual** | Nombre | Pts actuales | Premio próximo | — |

Las plantillas de media (eventos) mantienen 6 variables — sin cambios respecto a v0.35.

### Qué es el Roadmap de Tiers

Bloque de texto generado automáticamente por `buildTiersRoadmap()`:

```
🥉 Bronce (150 pts) → Bebida gratis — te faltan 22 pts 🔥
🥈 Plata (350 pts) → Postre gratis
🥇 Oro (600 pts) → Plato fuerte gratis
🖤 BLACK (1000 pts) → Experiencia Chef
```

Si ya alcanzó un tier: `🥉 Bronce (150 pts) → Bebida gratis ✅`

---

## Reglas de Meta (WhatsApp)

- Variables deben ser **secuenciales**: si usas `{{3}}` debes tener `{{1}}` y `{{2}}`.
- Máximo **1024 caracteres** por variable.
- Sin URLs acortadas, sin urgencia falsa, sin mayúsculas excesivas.
- Tiempo de aprobación: **24 a 72 horas**.
- **Tono:** Cálido, cercano, enérgico. NUNCA usar lenguaje de pérdida exagerada o promesas irreales.

---

## Plantilla 1 — Bienvenida

**Slot:** `welcome_template_sid`
**Categoría Twilio:** `UTILITY`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Puntos iniciales · `{{3}}`=Roadmap tiers
**Cuándo se envía:** Primer registro del cliente (QR o domicilio)

```
¡Hola {{1}}! 🎉🍣

Bienvenid@ a *[Restaurante]*, nos alegra que seas parte de nuestro club

En cada visita sumas puntos y recibes premios reales — Hoy recibiste *{{2}} puntos* 🎉

Así funciona tu camino de recompensas 👇

{{3}}

¡Te esperamos pronto!

_— [Restaurante]_
```

**Samples:**
- `{{1}}` → `María`
- `{{2}}` → `0`
- `{{3}}` → `🥉 Bronce (150 pts) → Bebida gratis o Mistery Box ❓ — te faltan 150 pts 🔥 · 🥈 Plata (350 pts) → Postre gratis · 🥇 Oro (600 pts) → Plato fuerte · 🖤 BLACK (1000 pts) → Experiencia Chef`

---

## Plantilla 2 — Puntos Sumados (lejos del premio)

**Slot:** `points_earned_far_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Pts ganados · `{{3}}`=Pts totales · `{{4}}`=Roadmap tiers
**Cuándo se envía:** Check-in + le faltan más de 30 pts para el próximo tier

```
¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia 🍣

Sumaste *+{{2}} puntos* hoy 🔥

Tu saldo: *{{3}} puntos*

Sigue visitándonos y descubre lo que te espera 👇

{{4}}

Cuando llegues a tu próximo nivel podrás elegir entre tu *premio seguro* o la *Mystery Box* 🎲

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Juan`
- `{{2}}` → `78`
- `{{3}}` → `78`
- `{{4}}` → `🥉 Bronce (150 pts) → Bebida gratis — te faltan 72 pts 🔥 · 🥈 Plata (350 pts) → Postre gratis`

---

## Plantilla 3 — Puntos Sumados (cerca — casi lo lograste)

**Slot:** `points_earned_near_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Pts ganados · `{{3}}`=Pts totales · `{{4}}`=Premio próximo
**Cuándo se envía:** Check-in + le faltan 30 pts o menos para el próximo tier

```
¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia 🍣

¡Casi lo lograste! Sumaste *+{{2}} puntos* 🔥

Tu saldo: *{{3}} puntos*

La próxima visita reclama tu *{{4}}* o si quieres probar suerte, selecciona la *Mystery Box* con premios todavía mejores 🎲

¡Vuelve pronto que ya casi es tuyo!

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Camila`
- `{{2}}` → `47`
- `{{3}}` → `128`
- `{{4}}` → `Bebida gratis`

---

## Plantilla 4 — Premio Seguro (después de elegir 'a la segura')

**Slot:** `reward_safe_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Nombre tier · `{{3}}`=Premio ganado · `{{4}}`=Roadmap
**Cuándo se envía:** Cliente alcanza tier y elige premio seguro en la web (lo envía `/api/mystery-box/resolve`)

> **Importante — dos mensajes distintos en el cruce de tier:**
> 1. **Al cruzar el nivel** (en el check-in del mesero) se envía el slot `tier_unlocked_template_sid` (mismas 4 variables que abajo). Si ese slot está vacío en Dashboard → Ajustes, NO se envía nada en el momento del cruce.
> 2. **Después de que el cliente elige** en la web (safe / mystery / golden) se envía el slot correspondiente (`reward_safe_template_sid` / `mystery_box_result_template_sid` / `golden_box_result_template_sid`).
> Configura ambos para que el cliente reciba mensaje aunque cierre la web sin elegir.

```
¡{{1}}, gracias por volver! Alcanzaste el nivel *{{2}}* 🏆🍣

Elegiste ir a la segura y te ganaste: *{{3}}*

Muestra *este mensaje* al mesero para reclamar tu premio 🎁

{{4}}

Sigue sumando puntos para tu próximo nivel.

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Luis`
- `{{2}}` → `Bronce`
- `{{3}}` → `Bebida gratis`
- `{{4}}` → `🥉 Bronce (150 pts) → Bebida gratis ✅ · 🥈 Plata (350 pts) → Postre gratis — te faltan 185 pts 🔥`

---

## Plantilla 5 — Mystery Box Resultado

**Slot:** `mystery_box_result_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Nombre tier · `{{3}}`=Premio mystery · `{{4}}`=Roadmap
**Cuándo se envía:** Cliente abre Mystery Box y recibe su premio

```
¡{{1}}, gracias por volver! Abriste la *Mystery Box* de *{{2}}* 🎲🍣

Tu premio: *{{3}}*

Muestra *este mensaje* al mesero para reclamar tu premio 🎁

{{4}}

¡Sigue sumando puntos, cada visita te acerca a una nueva recompensa!

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Ana`
- `{{2}}` → `Bronce`
- `{{3}}` → `Postre del chef`
- `{{4}}` → `🥉 Bronce (150 pts) → Bebida gratis ✅ · 🥈 Plata (350 pts) → Postre gratis — te faltan 180 pts 🔥`

---

## Plantilla 6 — Golden Box Resultado

**Slot:** `golden_box_result_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Premio golden · `{{3}}`=Roadmap
**Cuándo se envía:** Pity Timer activado — Mystery Box sin el premio más bajo

```
¡{{1}}, gracias por volver! Esperamos hayas disfrutado tu experiencia 🍣

Hoy tenías la *Golden Box* activada ✨🎲

Tu premio: *{{2}}*

Muestra *este mensaje* al mesero para reclamar tu premio 🎁

{{3}}

La suerte está de tu lado, sigue sumando puntos y desbloquea nuevas recompensas 🍀

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Pedro`
- `{{2}}` → `Postre del chef`
- `{{3}}` → `🥉 Bronce (150 pts) → Bebida gratis ✅ · 🥈 Plata (350 pts) → Postre gratis — te faltan 175 pts 🔥`

---

## Plantilla 7 — Cumpleaños

**Slot:** `birthday_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Pts actuales
**Cuándo se envía:** Cron diario a las 8am — detecta clientes con cumpleaños hoy

```
¡Feliz cumpleaños {{1}}! 🎂🎉

En *[Restaurante]* queremos celebrarlo contigo 🎁

Ven esta semana, menciona tu cumple y llévate una *sorpresa especial*

Tus puntos: *{{2}}* — cada visita te acerca más a una nueva recompensa 🔥

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Sofía`
- `{{2}}` → `95`

---

## Plantilla 8 — Reactivación Suave (21 días)

**Slot:** `reactivation_no_reward_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Pts actuales · `{{3}}`=Premio próximo
**Cuándo se envía:** Cron automático día 21 sin visitar
**Estrategia:** Puntos como gancho + anticipación del premio

```
¡{{1}}, te extrañamos! Hace rato que no te vemos 👋🍣

Tienes *{{2}} puntos* acumulados y estás camino a desbloquear *{{3}}* 🔥

Cada visita te acerca más — vuelve y alcanza más rápido ese premio especial 💪

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Carlos`
- `{{2}}` → `95`
- `{{3}}` → `Bebida gratis o Mystery Box`

---

## Plantilla 9 — Reactivación Agresiva (25+ días)

**Slot:** `reactivation_aggressive_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Pts actuales · `{{3}}`=Premio próximo
**Cuándo se envía:** Cron automático día 25+ sin visitar
**Estrategia:** Más directa, enfatiza lo que tiene acumulado y lo cerca que está

```
{{1}}, tus *{{2}} puntos* llevan tiempo sin moverse 👀🍣

Estás cerca de ganarte *{{3}}* — sería una lástima dejarlo ahí

{{#if {{4}}}}*Vuelve esta semana y te regalamos: {{4}}* 🎁{{/if}}

Vuelve esta semana y sigue sumando, nosotros mantenemos tu progreso 💪

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Daniela`
- `{{2}}` → `128`
- `{{3}}` → `Bebida gratis o Mystery Box`

---

## Plantilla 10 — Campaña: Presencial → Domicilio

**Uso:** Campaña manual desde Dashboard > Campañas
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Pts actuales · `{{3}}`=Premio próximo

```
¡Hola {{1}}! 🛵🍣

¿Sabías que también llevamos *[Restaurante]* hasta tu puerta?

Pide tus favoritos sin salir de casa y los domicilios *también suman puntos* 🔥

Tienes *{{2}} puntos* y vas camino a *{{3}}*

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Felipe`
- `{{2}}` → `78`
- `{{3}}` → `Bebida gratis o Mystery Box`

---

## Plantilla 11 — Campaña: Domicilio → Presencial

**Uso:** Campaña manual desde Dashboard > Campañas
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Pts actuales · `{{3}}`=Premio próximo

```
¡{{1}}, la experiencia en *[Restaurante]* es otro nivel! ♥️🍣

Nos encanta llevarte la comida a casa, pero en el restaurante es una experiencia completamente diferente ✨

Tienes *{{2}} puntos* — ven, suma puntos y desbloquea *{{3}}* 🔥

_— [Restaurante]_

_Responde SALIR para no recibir más mensajes._
```

**Samples:**
- `{{1}}` → `Laura`
- `{{2}}` → `95`
- `{{3}}` → `Bebida gratis o Mystery Box`

---

## Plantilla 12 — Evento con Imagen (Calendar)

**Key en admin_settings:** `event_template_image_sid`
**Tipo Twilio:** `twilio/media` · **Categoría Meta:** `MARKETING` · **Idioma:** `es`

### Cuál usar (verificado contra Twilio el 2026-09-06)

| Cuenta Twilio | SID a pegar en Ajustes | Estado |
|---|---|---|
| Master `ACa5e3…dd7d` — Sushi Service y toda marca **sin** subcuenta propia | **`HXf30219c2b31c3ac1c6eb751d2b4ea689`** (`evento_imagen__sushi_service_barra__v2`) | ✅ **approved**, media dinámica, dominio correcto |
| Master — `HX76a64b…` (v1), `combomundial`, `dia_del_sushi` | — | ❌ **NO USAR**: approved pero con media **FIJA**. Todos los clientes recibirían la imagen de muestra |
| **Sushi Fun** `AC0470…8e87` (cuenta propia) | — | ❌ **No existe ninguna `twilio/media`** en esa cuenta: hay que crearla y esperar a Meta |
| Don Alirio `ACf551…8576` (cuenta propia) | — | ❌ Sin plantilla media (última revisión 2026-08-21) |

**Para revisar cualquier cuenta, incluida una marca nueva del onboarding:**

```bash
node --env-file=<env de esa cuenta> scripts/verificar-plantillas-evento.mjs
```

Es **solo lectura, no envía nada**, y comprueba las tres condiciones que hacen daño en silencio si
fallan: que sea `twilio/media`, que la media lleve `{{6}}` **dinámico** y que esté **approved**.
Imprime al final qué SID pegar. Son los mismos tres chequeos que `assertEventTemplateUsable()` hace
en caliente antes de despachar un evento.

### Estructura exacta de la aprobada (copiada de la Content API, no de memoria)

**Variables:** `{{1}}`=Nombre · `{{2}}`=Restaurante · `{{3}}`=Título del evento · `{{4}}`=Fecha legible ·
`{{5}}`=CTA · `{{6}}`=**path del archivo dentro del bucket `event-media`** (NO la URL completa)

**Media:**

```
https://bredfyugmjjctxysnasw.supabase.co/storage/v1/object/public/event-media/{{6}}
```

**Samples con los que Meta aprobó la Twilio:**

```json
{"1":"María","2":"\"Sushi Service Barra\"","3":"Festival Gastronómico",
 "4":"sábado 14 de junio","5":"¡Te esperamos con tu familia! 🍽️","6":"5103017800669793459.jpg"}
```

**Cuerpo, literal — SOLO Twilio (los 4 tenants viejos):**

```
¡Hola {{1}}! 🎉

*{{2}}* tiene el placer de invitarte a vivir una noche especial:
*{{3}}* 🍽️

📅 {{4}}

{{5}}

¡Te esperamos con tu familia!

_Responde SALIR para no recibir más mensajes._
```

⚠️ **En la Twilio, `{{5}}` NO es la última línea.** Debajo van el cierre fijo y el aviso de SALIR.
Como el enlace del evento (`link_url`, 00050) se pega al final de `{{5}}`, en el teléfono aparece
**en medio**, no al final. Se queda así: está aprobada y tocarla cuesta otra revisión de Meta.

### Zernio (catálogo estándar) — el cuerpo NUEVO, 2026-09-10

Los tenants Zernio nacen con **otro texto**, reescrito contra el formulario del calendario por
decisión del dueño. Vive una sola vez en `EVENT_INVITE_TEXTS`
([`src/constants/template-texts.ts`](../src/constants/template-texts.ts)) y lo comparten las dos
claves: **`event_image` y `event_video` dicen exactamente lo mismo**, y lo único que las separa es
el formato del header, que Meta congela al aprobar (una aprobada con header de imagen rechaza un
MP4 al enviar, y al revés — por eso son dos registros y no uno).

Es **un marco, no un mensaje**. Decisión del dueño, textual: *"el que decide qué mensaje contiene
es el cliente, por eso le pedimos que ingrese un título, una descripción, un link y una
imagen/video"*. Así que el texto fijo se redujo a lo que Meta **obliga**, y ni una palabra más:

- una plantilla no puede ser solo variables, ni empezar ni terminar con una → el saludo;
- toda MARKETING lleva la salida → la línea de SALIR;
- `{{2}}` (la marca) va en su propia línea bajo el saludo, sin una frase que la presente.

**El texto** (el emoji lo pone el
`business_type` del tenant — 🍽️ restaurante, 💈 barbería, 💅 salón, ✨ el resto):

```
¡Hola {{1}}! 🎉🍽️
_{{2}}_

*{{3}}*
📅 {{4}}

{{5}}

_Responde SALIR para no recibir más mensajes._
```

⚠️ **La marca va arriba, no como firma al final, por una razón dura: las variables tienen que ir en
orden ASCENDENTE.** Con la firma abajo el cuerpo quedaba `1,3,4,5,2` — el único caso desordenado de
las 39 combinaciones del banco. Meta numera en orden de aparición y un rechazo por eso no se ve al
crear la plantilla: se ve 24-72h después, con las 25 cuentas ya sometidas. Hay una prueba que barre
el banco entero.

Sacando variables, firma y opt-out, lo que ponemos nosotros es **«¡Hola!»**: seis caracteres.
Hay una prueba que lo mide y se cae si alguien vuelve a meter relleno.

**Qué se fue del texto viejo** — todo era literal aprobado por Meta, o sea imposible de arreglar
después:

| Se fue | Por qué |
|---|---|
| «vivir una **noche** especial» | El calendario no filtra por hora y su campo *Tipo* incluye promo, activación y aniversario: una promo de mediodía salía invitando a una noche |
| Cierre fijo «¡Te esperamos con **tu familia**!» después de `{{5}}` | `{{5}}` **es** el llamado a la acción que el dueño escribió: el cierre se lo pisaba |
| Muestra de `{{5}}` = ese mismo cierre | La muestra es lo que revisa Meta y lo que el dueño ve en la vista previa: mostraba la frase repetida dos veces en vez del dato real. Ahora es `¡Promo 2×1 todo el día! Te esperamos. 👉 https://…` |

**La aridad es la misma** (`{{1}}`..`{{5}}`), así que `calendar.service.ts` manda lo mismo a los dos
proveedores y no se tocó ni una línea del camino de envío. Hay cinco pruebas que lo vigilan en
`tests/unit/template-catalog.test.ts`: que las dos claves compartan cuerpo y variables, que debajo de
`{{5}}` no quede una sola palabra nuestra, que el texto no hornee un momento del día ni una compañía,
que lo fijo no pase de 20 caracteres, y que en TODO el banco las variables vayan en orden ascendente.

Para sacar de circulación las viejas de un tenant Zernio:
[`SQL-PARA-CORRER/plantillas-evento-viejas/`](../SQL-PARA-CORRER/plantillas-evento-viejas/LEEME.md).

### Media dinámica — cómo funciona

Twilio solo admite variables en la URL de media **después del dominio**. Por eso la plantilla se
aprueba con el dominio del bucket como parte **FIJA** y `{{6}}` como el **path** del archivo:

```
media: ["https://<proj>.supabase.co/storage/v1/object/public/event-media/{{6}}"]
→ al enviar: contentVariables { "6": "1720000000_flyer.jpg" }
```

Meta aprueba la **estructura** (header de imagen + texto), no la imagen concreta: una vez aprobada,
cada evento manda su propia imagen **sin re-aprobar nada**.

⚠️ El dominio es fijo → **todo flyer debe vivir en el bucket `event-media` de ESE proyecto**. Una
plantilla creada contra otro Supabase entrega 404 a Meta.

⚠️ El path que manda `/api/dashboard/calendar/media-upload` es **plano** (sin subcarpetas), igual que
el sample aprobado: el valor se sustituye dentro de una URL ya formada y una barra dependería de que
Twilio no la escape.

⚠️ `ContentSid` y `MediaUrl` son **mutuamente excluyentes**: la media sale únicamente de la plantilla
y no se puede sobreescribir al enviar.

⚠️ El **sample** de `{{6}}` debe ser un archivo real y público del bucket — Meta lo descarga para
revisar la plantilla.

### El contrato de 6 variables NO se amplía

El enlace opcional del evento se compone **dentro de `{{5}}`** (`"<CTA> 👉 <link>"`), no en un `{{7}}`:
una variable nueva obliga a crear y re-aprobar una plantilla en las 25 cuentas, 24-72h cada una. Y
`{{5}}` no puede llevar saltos de línea — Twilio los rechaza con **21656** y eso tumba el envío de la
audiencia entera, no el de un cliente. Ver `docs/features/calendar.md` § "Enlace del evento".

---

## Plantilla 13 — Evento con Video (Calendar)

**Key en admin_settings:** `event_template_video_sid`
**Tipo Twilio:** `twilio/media` · **Idéntica a la 12 pero con HEADER video MP4.**

En Zernio comparte el cuerpo con la 12 **palabra por palabra** (`EVENT_INVITE_TEXTS`); en Twilio
comparte la estructura vieja. En los dos casos lo único que cambia es el formato del header.

🔴 **Hoy no existe en ninguna cuenta.** La única que se intentó (`evento_video_sushi_service_barra`,
master) está **rejected** por Meta: *"Error downloading invalid media URL"* — el sample apuntaba a un
MP4 de `storage.googleapis.com` que Meta no pudo bajar. Para reintentar: subir un MP4 real al bucket
`event-media` y correr `scripts/twilio-create-media-templates.mjs` **sin** `SKIP_VIDEO`, con
`SAMPLE_VIDEO_PATH` apuntando a ese archivo.

Mientras tanto, un evento con `media_type='video'` **falla al despachar** con el error explícito de
que falta `event_template_video_sid`. No envía nada equivocado.

---

## Cómo el Sistema Elige la Plantilla Correcta

```
CLIENTE NUEVO → Escanea QR
└── Plantilla 1 (Bienvenida con puntos + roadmap)

CLIENTE FRECUENTE → Escanea QR → Recibe puntos aleatorios
├── ¿Desbloqueó un tier?
│   ├── SÍ → Web muestra choice (safe vs mystery box)
│   │   ├── Eligió SAFE → Plantilla 4 (Tier desbloqueado)
│   │   ├── Eligió MYSTERY → Plantilla 5 (Mystery Box resultado)
│   │   └── Golden Box activa → Plantilla 6 (Golden Box resultado)
│   └── NO → ¿Cuántos puntos faltan para el próximo tier?
│       ├── Faltan ≤30 pts → Plantilla 3 (Cerca — "casi lo lograste")
│       └── Faltan >30 pts → Plantilla 2 (Lejos — "seguí sumando")

AUTOMATIZACIONES
├── Cumpleaños (cron 8am)     → Plantilla 7
├── Día 21 sin visitar        → Plantilla 8 (Reactivación suave)
├── Día 25+ sin visitar       → Plantilla 9 (Reactivación agresiva)
└── Evento programado (*/15m) → Plantilla 12 o 13 (Calendar)

CAMPAÑAS MANUALES
├── Presencial → Domicilio → Plantilla 10
└── Domicilio → Presencial → Plantilla 11
```

---

## Configuración en Dashboard > Ajustes (v1.0.0)

| Key en admin_settings | Tipo de mensaje | Variables |
|---|---|---|
| `welcome_template_sid` | Bienvenida (registro) | {{1}}=nombre, {{2}}=pts iniciales, {{3}}=roadmap |
| `points_earned_far_template_sid` | Puntos sumados (lejos) | {{1}}=nombre, {{2}}=pts ganados, {{3}}=pts total, {{4}}=roadmap |
| `points_earned_near_template_sid` | Puntos sumados (cerca) | {{1}}=nombre, {{2}}=pts ganados, {{3}}=pts total, {{4}}=premio |
| `tier_unlocked_template_sid` | Tier desbloqueado (al cruzar nivel, antes de elegir) | {{1}}=nombre, {{2}}=tier, {{3}}=premio safe, {{4}}=roadmap |
| `reward_safe_template_sid` | Premio seguro (después de elegir 'a la segura') | {{1}}=nombre, {{2}}=tier, {{3}}=premio, {{4}}=roadmap |
| `mystery_box_result_template_sid` | Mystery Box resultado | {{1}}=nombre, {{2}}=tier, {{3}}=premio, {{4}}=roadmap |
| `golden_box_result_template_sid` | Golden Box resultado | {{1}}=nombre, {{2}}=premio, {{3}}=roadmap |
| `birthday_template_sid` | Cumpleaños | {{1}}=nombre, {{2}}=pts actuales |
| `reactivation_no_reward_template_sid` | Reactivación suave (21d) | {{1}}=nombre, {{2}}=pts actuales, {{3}}=premio |
| `reactivation_aggressive_template_sid` | Reactivación agresiva (25d) | {{1}}=nombre, {{2}}=pts actuales, {{3}}=premio, {{4}}=recompensa especial (opcional) |

### Slots legacy (mantener si la instancia aún no migró a puntos)

| Key | Uso |
|---|---|
| `reward_template_sid` | Ganaste premio por visita (legacy) |
| `welcome_back_near_template_sid` | Cerca de premio por visita (legacy) |
| `welcome_back_far_template_sid` | Lejos de premio por visita (legacy) |
| `welcome_back_template_sid` | Fallback universal (legacy) |
| `reactivation_with_reward_template_sid` | Reactivación con regalo fijo (legacy) |
| `reactivation_reward_id` | UUID del reward fijo (legacy) |
| `reactivation_template_sid` | Reactivación legacy única |

---

## Checklist para Implementar en un Restaurante Nuevo

**Plantillas de texto (1-11) — Script bulk:**
- [ ] Ejecutar `node scripts/twilio-create-text-templates.mjs` (crea las 11 de golpe)
- [ ] Esperar aprobación de Meta (24-72h)
- [ ] En Dashboard → Ajustes, asignar cada plantilla a su slot correspondiente
- [ ] Configurar reward tiers en Dashboard → Recompensas (puntos + mystery box prizes)
- [ ] Verificar envío con un check-in de prueba (debe mostrar puntos ganados)
- [ ] Verificar que al llegar a 150 pts muestra opción safe/mystery box

**Plantillas de media (12-13) — Script de setup:**
- [ ] **Antes de nada:** subir un JPG real al bucket `event-media` y pasarlo en `SAMPLE_IMAGE_PATH`.
      Meta lo descarga para aprobar; si no es público, rechaza. El script lo comprueba y aborta antes
      de crear nada. Usar path **plano** (sin subcarpetas).
- [ ] Ejecutar `node scripts/twilio-create-media-templates.mjs` con `SKIP_VIDEO=1`
      (la de video no se puede aprobar sin un MP4 de muestra real — ver Plantilla 13)
- [ ] Esperar aprobación de Meta (24-72h)
- [ ] **Verificar antes de pegar el SID:** `node --env-file=<env de la cuenta> scripts/verificar-plantillas-evento.mjs`
      (solo lectura). Si dice `[NO]`, **no la pegues**: una plantilla con media fija manda la imagen
      de muestra a toda la audiencia y eso no se ve hasta que ya salió.
- [ ] Agregar el SID que el script marque `[SIRVE]` en `admin_settings.event_template_image_sid`
- [ ] Verificar con evento de prueba (audiencia filtrada a un solo cliente)

> ⚠️ Una marca con **cuenta Twilio propia** necesita SU propia plantilla: las de la master no le
> sirven. Es lo que hoy deja a Sushi Fun sin poder enviar eventos con imagen.

---

---

## Multitenant — resolución de credenciales (2026-07-08)

La Content API de Twilio (`content.twilio.com`) y la Messages API (`api.twilio.com`)
son **por-cuenta**: cada subcuenta ve solo SUS plantillas y mensajes.

Tras la migración multitenant, los endpoints del dashboard deben autenticar con la
**subcuenta del tenant** (`tenants.twilio_subaccount_sid` + `_auth_token`), no con la
cuenta master (env `TWILIO_*` = Sushi Service). De lo contrario, el dashboard de un
cliente (p.ej. Don Alirio) listaría las plantillas de Sushi Service.

Helper único: `getTenantTwilioCredentials()` en
[`src/lib/twilio/tenant-credentials.ts`](../src/lib/twilio/tenant-credentials.ts).
Resuelve el tenant desde el JWT (`app_metadata.tenant_id`), devuelve el header
`Authorization` (Basic) de la subcuenta. La cuenta del env (`TWILIO_*`) la usa **solo** el
tenant cuyo id es `TWILIO_MASTER_TENANT_ID` (Sushi Service); cualquier otro sin subcuenta
recibe `null` → «Twilio no configurado» (regla `resolveTwilioAccount()`, desde el 2026-09-10:
antes caía a la master y un tenant nuevo del AIOS veía las plantillas de Sushi Service).
Exige SID **y** token de la subcuenta juntos (nunca mezcla SID de subcuenta con token master).

Endpoints que lo usan:
- `GET/POST /api/dashboard/templates` — listar / crear plantillas
- `POST /api/dashboard/templates/[sid]/submit` — enviar a aprobación de Meta
- `GET /api/dashboard/twilio-metrics` — métricas de mensajería por tenant

> ⚠️ Requiere que el admin del tenant haya re-logueado tras la migración para que el
> JWT traiga `tenant_id`. Sin él no hay credenciales: la lista sale vacía.

---

*Última actualización: v1.0.4 — 2026-07-08 — Multitenant: endpoints de plantillas y métricas usan la subcuenta Twilio del tenant*
*Última actualización previa: v1.0.3 — 2026-05-28 — Script bulk para plantillas de texto*
