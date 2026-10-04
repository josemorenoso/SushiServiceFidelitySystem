# Spec — El ciclo de recuperación: pipeline del recorrido del cliente (Bloque 7) — 2026-10-04

> **Estado:** propuesta de diseño, **sin código**. Es el «spec propio» que pide §16.3 de
> `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` y reemplaza la §3.6 del spec de gobernanza de envío
> (`2026-08-30-gobernanza-de-envio-design.md`). Cae en la ola **P5** del consolidado
> (`docs/ESTADO-CONSOLIDADO-2026-10-04.md` §9) y absorbe los micro **N3, N4 y N15** de P1.
> **Pedido del dueño (2026-10-04), textual:** *«el objetivo es, en esencia, hacer que vuelvan los clientes… dos
> comunicaciones en un mes y ya se acabó… quiero una línea de tiempo de 90 días donde se vean los estados… que calendario
> y campañas estén en el mismo lugar… más fácil, más visual y dopamínico para el dueño»*.
> **Prototipo navegable:** `2026-10-04-ciclo-de-recuperacion-mockup.html` (al lado de este archivo; se abre en el
> navegador tal cual) y publicado en <https://claude.ai/artifact/EKRPox4mCdvsSwiGbETDB5> (privado hasta que el dueño lo comparta).
> **Prompt para construir:** `docs/prompts/2026-10-04-ciclo-fase-0-y-1.md`.

---

## 0. En una pantalla

| | Hoy | Propuesta |
|---|---|---|
| **Cuánto dura el recorrido automático** | Un toque al día 21 y, por la dedup de 30 días, el «insistente» al día ~51 y **cada 30 días para siempre**, igual texto, igual premio (N4). O nada, si la marca no tiene plantilla | **Cinco toques en 90 días** con huecos crecientes (12 · 24 · 38 · 56 · 80), después **dormido** con un latido trimestral (máx. 2), después archivado |
| **Cuándo para** | Nunca para solo (y un fallo de envío lo calla 30 días: N3) | A las **6 comunicaciones sin volver** (regla del dueño, §16.1) o al terminar el ciclo, lo primero que pase |
| **Cuándo se reinicia** | Implícito: `last_visit_at` lo saca del pool | Explícito: toda visita (QR **o domicilio**) abre el **ciclo n+1** y queda anotado **qué toque lo trajo** |
| **Qué dice cada toque** | Dos textos (suave / insistente) | Progreso → sorpresa pequeña que vence → cruce de canal → rescate fuerte que vence → cierre suave. **Una sola plantilla nueva** («Invitación con premio que vence»); el resto ya existe |
| **Juanita (1 visita, día 42) vs Sara (3.ª visita, 3.er ciclo)** | Indistinguibles | El ciclo n cambia el premio, el tono por variables y el ritmo; la oferta fuerte tiene **cooldown de 180 días por cliente** para que nadie aprenda a esperar |
| **La pantalla** | Automáticas (4 tarjetas) + Manuales (asistente de 669 líneas) + Premios + Historial, burbujas con otra escala de días, y un Calendario aparte que nadie usa | **Una pantalla «Ciclo»**: línea de tiempo de 90 días con los clientes encima, los toques marcados y el retorno de cada uno; el mismo eje girado a **vista por fecha** (el calendario), con la **proyección** de quién entra a qué etapa qué día; **crear en 3 campos** |
| **Lo que decide el dueño** | 21 y 25 días, dos plantillas, un premio | Nada obligatorio: **con los defaults funciona igual para todas las marcas**. Lo que ponga (premios, días, latido) lo mejora |

---

## 1. Lo que pasa hoy de verdad (contra el código, no contra los docs)

Lo que el dueño cree y lo que el código hace no coinciden, y la pantalla (N15) refuerza la creencia.

| El dueño cree | El código hace (`src/app/api/cron/reactivation/route.ts`, `campaign.service.ts`) |
|---|---|
| «Un mensaje al día 21 y otro al 25» | Día 21: suave. Día 25: el agresivo **se salta** para quien recibió el suave, porque `hasRecentCampaignMessage(type='reactivation', 30 días)` no distingue suave de agresivo. El agresivo sale al día **~51**, y de ahí **cada ~30 días sin tope** (N4) |
| «Después de las dos se apaga hasta que yo mande algo» | No se apaga: el agresivo se repite mensualmente, y si tiene premio, otorga el premio (ventana de 7 días) y el `reward-reminder` manda el recordatorio 2 días antes del vencimiento: **dos mensajes al mes a un cliente perdido, para siempre, con el mismo texto y el mismo premio** |
| «Si vuelve por la manual se resetea y recibe las dos» | Vuelve → `last_visit_at` lo saca del pool → día 21 suave → día ~51 agresivo… Correcto, pero sin memoria de que ya recorrió esto antes |
| «El sistema no le manda a nadie que ya recibió algo hace poco» | Cierto para el cap de 7 días. Pero un **envío fallido** también graba `sent_at` y bloquea 30 días la reactivación y 360 el cumpleaños (N3): hay clientes mudos sin que nadie lo sepa |

> ⚠️ Lo de arriba sale de leer el código. **No está verificado contra `message_logs` de producción**: la primera consulta de
> la fase 0 es contar cuántos mensajes `reactivation` recibió cada cliente en los últimos 90 días. Si el agresivo repetido
> no aparece, la causa será otra (plantilla sin configurar, cap mensual), y el diagnóstico cambia pero el diseño no.

Los siete problemas, en orden de costo:

1. **El recorrido no tiene final ni memoria.** No existe «ciclo», ni contador de toques, ni «este cliente ya pasó por aquí».
2. **Hay DOS escalas de días en la misma pantalla y ninguna es la del cron.** Burbujas: 7-10 / 11-15 / 16-21 / 22+
   (`rankings.ts`). Tira del ciclo: 1-7 / 7-17 / 18-25 / 26+. El cron: 21 y 25 (y 51, 81…). El dueño ve tres relojes.
3. **La base está «perdida» y el sistema solo ofrece un botón.** En la captura, 508 de 572 en riesgo son «Perdido 22+». Lo
   único que se les propone es «toca la burbuja y mándales una plantilla».
4. **Crear una campaña cuesta más que entrar a Twilio.** El asistente manual pide filtros, plantilla, variables, horario.
   El dueño lo dijo: prefiere crear la plantilla a mano. El calendario, ni su padre lo usa.
5. **La escalera de ofertas no existe** (suave sin oferta → insistente con el mismo premio siempre), y por lo tanto tampoco
   existe el freno al «efecto Temu».
6. **Los puntos confunden**: en la marca donde mejor funciona, la gente cree que redimir **gasta** puntos y se aguanta las
   recompensas. Ningún texto dice que no se gastan.
7. **No se mide lo único que importa**: cuántos volvieron **después** de cada toque. Se mide «enviados».

---

## 2. Qué hace volver a un cliente (principios, y qué sabemos y qué no)

Lo que está bien establecido y el diseño usa:

- **La recencia manda.** La probabilidad de volver cae con los días sin venir; es el eje de toda segmentación RFM. Por eso
  el ciclo se mide en **días desde la última visita**, no en fechas de calendario, y por eso los huecos entre toques se
  **ensanchan**: a más días sin venir, menos probabilidad por mensaje y más riesgo de bloqueo por mensaje.
- **La segunda visita es la que más vale.** La mayoría de los programas pierden a la gente entre la visita 1 y la 2. El bono
  de bienvenida (75-90 sobre 150) ya deja al cliente nuevo «a un paso» (efecto de progreso dotado, Nunes & Drèze); el
  primer toque del ciclo 1 tiene que decirle **exactamente cuánto le falta** (`{{2}} puntos`, `{{3}} premio`).
- **Convierte lo concreto y con fecha**, no el «te extrañamos». Un motivo (premio, evento, cumpleaños), una fecha límite y
  cero fricción (ven y muestra el mensaje). La aversión a la pérdida funciona **solo si es verdad**: en este sistema los
  puntos **no vencen** (y Meta rechaza urgencia falsa, regla 5 de `template-texts.ts`). Lo que sí vence de verdad es una
  **invitación con premio** (`reward_grants` con `expires_at`). Esa es la única palanca de urgencia honesta, y ya existe.
- **La sorpresa sostiene la atención** (refuerzo variable, la Mystery Box ya lo hace en la visita). Un toque que promete «una
  sorpresa» sin decir cuál cuesta cero y abre el mensaje.
- **Cadencia:** 2-3 mensajes de marketing al mes por persona y al menos una semana entre ellos es la práctica común del
  canal (también en `Reestructuración.md`). Se conserva tal cual: `FREQUENCY_CAP_DAYS = 7`, `MONTHLY_MARKETING_CAP = 3`.
- **Parar protege la línea.** Quien no responde a seis mensajes es exactamente quien bloquea o reporta. La regla de fatiga
  del dueño (§16.1) no es solo cortesía: cuida el `quality_rating` del número, que es el cupo de todas las campañas.

Lo que **no** sabemos, y el diseño no finge saber:

- **Los días exactos (12 · 24 · 38 · 56 · 80) son un default diseñado bajo las restricciones** (7 días entre toques, 3 al
  mes, 6 toques, huecos crecientes), no un número sacado de un estudio. No hay evidencia pública seria de «el día correcto»
  para un restaurante por WhatsApp; depende del ritmo de cada negocio (una cafetería de paso vs. un sushi de fin de mes).
- **Por eso el sistema mide el retorno por toque** (§11) y la fase 3 ajusta los días al ritmo real de cada marca (mediana
  de días entre visitas de los que vuelven). Hasta entonces, el default; después, los datos.
- **«90 días» no es sagrado.** Sale solo: cinco toques con huecos crecientes y un tope de seis comunicaciones caben en
  ~80-90 días. Si el dueño mueve los días, el largo del ciclo se mueve con ellos.

---

## 3. El ciclo: la máquina de estados

### 3.1 Estados de un cliente (por marca)

```
            visita (QR o domicilio)                 6 toques sin volver, o T5 enviado
  ┌──────────────────────────────┐              ┌───────────────────────────────┐
  │                              ▼              │                               ▼
  │   ┌────────┐    toques T1…T5     ┌───────┴────┐   2 latidos sin volver   ┌───────────┐
  └───┤ ACTIVO │ ─────────────────▶  │  DORMIDO   │ ───────────────────────▶ │ ARCHIVADO │
      │ ciclo n│ ◀───────────────┐   │ latido/90d │ ◀──┐                     │ solo cumple│
      └────────┘  visita → n+1   │   └────────────┘    │ visita → n+1        │ y eventos  │
                                 └─────────────────────┴─────────────────────┴─────┬──────┘
                                                                     visita → n+1   │
                                                                     ◀──────────────┘
  Fuera del diagrama, por encima de todo: opt-out (`whatsapp_opt_out_at`) y `accepts_marketing = false`.
```

- **Activo:** dentro de un ciclo. El reloj es `cycle_started_at` = la última visita. Recorre T1…T5.
- **Dormido:** la marca dejó de insistir. Recibe **cumpleaños** (siempre), **eventos** del calendario solo si el dueño marcó
  «incluir dormidos», y un **latido** cada 90 días (máx. 2) con la invitación fuerte. Nada más.
- **Archivado:** solo cumpleaños y eventos con «incluir archivados». Ningún automático.
- **Toda visita** —escaneo del mesero, QR de mesa o domicilio— devuelve al cliente a **Activo**, abre el ciclo **n+1** y
  anota qué toque lo trajo (§3.4). Responde 16.d: **el domicilio cuenta** (ya hoy escribe `last_visit_at`).

### 3.2 Los toques del ciclo (defaults; editables por marca con validación)

| Toque | Día | Intención | Plantilla | Premio | Cuenta para «6» |
|---|---|---|---|---|---|
| **T1 · Progreso** | 12 | «Tienes {{2}} puntos, te faltan pocos para {{3}}». Sin oferta. En el ciclo 1 es el empujón a la **segunda visita** | `reactivation_no_reward` (existe) | — | sí |
| **T2 · Sorpresa** | 24 | Invitación con premio **pequeño** que vence en 7 días | `invite_expiring` (**nueva**, §4) · sin premio configurado: `reactivation_aggressive` (existe) | pequeño | sí |
| **T3 · Cruce de canal** | 38 | Si solo vino al local → «también llevamos a tu puerta». Si solo pidió → «ven, en el local es otra cosa». Sin oferta | `campaign_presencial_to_domicilio` / `campaign_domicilio_to_presencial` (existen) · si `both`: `reactivation_no_reward` | — | sí |
| **T4 · Rescate** | 56 | Invitación con premio **fuerte** que vence en 7 días (**es la agresiva de hoy**, con su recordatorio 2 días antes) | `invite_expiring` · sin premio: `reactivation_aggressive` | fuerte (cooldown 180 d) | sí (el recordatorio, no) |
| **T5 · Cierre suave** | 80 | «Tus puntos siguen ahí, nosotros guardamos tu progreso». Sin oferta. Después, silencio | `reactivation_aggressive` (existe; su texto ya dice eso) | — | sí → **dormido** |

Por qué estos huecos: 12 → 24 → 38 → 56 → 80 son +12, +14, +18, +24. Mes 1: dos toques. Mes 2: dos toques (+ el
recordatorio del premio de T4 cae en el día 61, mes 3). Mes 3: recordatorio + T5. Nunca más de 3 al mes, nunca menos de
7 días entre dos toques; el recordatorio está exento del cap de 7 por diseño (D5 de `reward-grants.md`) y sigue contando en
el mensual. Si la marca no configura ningún premio, los cinco toques salen igual con las plantillas que ya tiene: **el ciclo
funciona desde el día uno para las 25 marcas**.

**Validación al editar los días:** cada toque ≥ 7 días del anterior; ningún tramo de 30 días con más de 3 toques
(contando el recordatorio de T4 como uno). La pantalla no deja guardar una configuración que el cron no podría cumplir.

### 3.3 Las tres reglas de cadencia (no cambian) y la cuarta (nueva)

1. `FREQUENCY_CAP_DAYS = 7` entre mensajes de marketing. Igual.
2. `MONTHLY_MARKETING_CAP = 3` (manual + calendario + ciclo + recordatorio). Igual.
3. Cumpleaños fuera de todo cap; dedup 360. Igual.
4. **Fatiga (nueva, §16.1):** al **sexto** mensaje de marketing **desde la última visita** sin que haya vuelto, el cliente
   pasa a **dormido**. Responde 16.b: cuentan `manual`, `calendar` y los toques del ciclo (`reactivation`); **no** cuentan
   el cumpleaños ni el recordatorio de premio (habla de algo que ya es suyo). Consecuencia buscada: **una campaña manual o
   un evento que el dueño mande durante el ciclo acorta el ciclo automático** en vez de sumarse encima. Responde 16.c: el
   contador **no** se reinicia por tiempo, solo con la visita; para el paso del tiempo está el latido.

### 3.4 Reinicio y atribución

Al escribir `last_visit_at` (hoy en `customer.service.ts:98` y en el alta con `countFirst`), **un trigger de base**
(no código TS, para que QR, mesero, domicilio y cualquier escritor futuro lo disparen igual):

- `cycle_no += 1`, `cycle_started_at = last_visit_at`, `cycle_touches = 0`, `cycle_state = 'activo'`, `dormant_since = NULL`.
- **Atribución:** el último toque del ciclo que se cierra con `sent_at` dentro de los **14 días** anteriores recibe
  `returned_at = now()`. «T4 trajo 31 clientes este mes» sale de ahí. Es una atribución de último toque, honesta y barata;
  no pretende causalidad (un cliente pudo volver solo), pero compara toques entre sí con la misma vara.

### 3.5 Dormido: el latido

- Entra a dormido al sexto toque **o** tras T5 (lo primero). `dormant_since = now()`.
- **Latido:** a los 90 y 180 días de `dormant_since`, `invite_expiring` con el premio fuerte (respeta su cooldown). Si no
  vuelve, **archivado**. Interruptor por marca `cycle_heartbeat_enabled` (default **encendido**: a un cliente que ya no
  responde, un mensaje por trimestre es el mínimo del canal y el premio solo cuesta si viene).
- Cumpleaños sigue saliendo. Eventos: casilla «incluir dormidos» en el evento (default apagada).

### 3.6 Ciclo n: Juanita y Sara

- **Juanita** (1 visita, día 42, ciclo 1): está entre T3 y T4. Lo que la trae es el premio fuerte de T4 el día 56; la
  pantalla la muestra como «ciclo 1 · 1 visita» en el día 42 de la línea.
- **Sara** (3.ª visita, ciclo 3): mismo esquema, pero (a) si su ciclo 2 recibió el premio fuerte hace menos de **180 días**,
  en T4 recibe el **pequeño** (`strong_offer_last_at`); (b) con ≥ 5 visitas el sistema **salta T1** (ya conoce el programa;
  menos mensajes a los fieles); (c) el premio pequeño **rota** si la marca cargó más de uno (`cycle_no % n`).
- **Por qué no «un mensaje distinto por ciclo»:** cada texto es una aprobación de Meta por marca (24-72 h, 25 marcas). Lo
  que cambia por ciclo es lo que **viaja en las variables** (puntos, premio próximo, premio de la invitación, fecha) y qué
  toques saltan. Mismo marco, contenido distinto, cero aprobaciones nuevas.
- **El freno al efecto Temu está en tres sitios:** la escalera sube **dentro** del ciclo (pequeño → fuerte) y nunca
  **entre** ciclos; la oferta fuerte tiene cooldown de 180 días por cliente; T5 cierra **sin** oferta (lo último que el
  cliente lee no es «la mejor oferta llega si espero», sino «tu progreso está guardado»).

### 3.7 Cumpleaños y eventos: las interrupciones

Siguen siendo independientes del ciclo y así deben seguir: **no mueven el reloj** del ciclo ni cuentan igual.
Cumpleaños: no cuenta para nada. Eventos: cuentan para la fatiga (§3.3) y respetan sus caps de siempre. La pantalla los
pinta como pines sobre la línea de fecha para que el dueño vea qué más le cae a un cliente esa semana.

### 3.8 Backfill: cómo entra la base que ya existe (responde 16.e)

**Hacia adelante, sin reescribir historia.** Cada cliente entra al ciclo **en el día en el que ya está**
(`today - last_visit_at`): el del día 42 verá T4 el día 56; el del día 200 pasa **directo a dormido** con
`dormant_since = hoy` (latido a los 90 días). Los 508 «perdidos» de la captura **no reciben una ráfaga el día del
despliegue**; reciben, como mucho, un latido dentro de tres meses. `cycle_no` arranca en 1 para todos (no se reconstruyen
ciclos pasados: `visits` daría el número, pero no vale la migración).

### 3.9 Lo que NO cambia

Puntos y sellos no vencen (no se amenaza con eso). `reward_grants`, el recordatorio (D5) y el cupo de línea (00037/00038)
siguen iguales. El cumpleaños, igual. `promoteVersion()` sigue siendo el único escritor de `*_template_sid`. El contrato
`{{n}}` de las plantillas existentes no se toca. Nada en pesos (D7).

---

## 4. Mensajes y plantillas (la restricción que manda)

Cada plantilla nueva = una aprobación de Meta **por marca**. Por eso el ciclo entero se arma con lo que ya está aprobado
más **una** plantilla nueva:

| Clave | Variables | Para qué |
|---|---|---|
| **`invite_expiring` · «Invitación con premio que vence»** (nueva, MARKETING) | `{{1}}` nombre · `{{2}}` premio · `{{3}}` fecha límite («18 de octubre») · `{{4}}` camino de niveles | T2, T4, el latido, las invitaciones que el dueño cree desde la pantalla y el envío desde una banda. **Es la plantilla que le quita al dueño la necesidad de entrar a Twilio**: una sola, aprobada una vez, y cada envío cambia premio y fecha por variables |

Texto propuesto (cálido, cumple las 5 reglas; se escribe en `template-texts.ts` y pasa por los tests del catálogo):

```
¡Hola {{1}}! Tenemos algo para ti 🎁${emoji}

Te guardamos *{{2}}*. Ven antes del *{{3}}*, muestra este mensaje y es tuyo.

Así vas en tu camino de premios:

{{4}}

Tus puntos siguen intactos: los premios se desbloquean, no se gastan 💪

_— ${brand}_

_Responde SALIR para no recibir más mensajes._
```

- Las marcas Twilio cuya «insistente» ya tiene `{{4}}` premio y `{{5}}` fecha (Sushi Service) pueden mapearse a esta clave
  sin crear nada: mismo significado, distinto orden; lo resuelve un adaptador por marca, no una plantilla.
- **La confusión de los puntos** (problema 6) se ataca donde no cuesta aprobación: la **tarjeta** (`/tarjeta`, premio
  disponible: «reclámalo, tus puntos siguen intactos») y esta plantilla nueva. Los textos `points_earned_*` llevan la
  frase cuando se re-aprueben por otra razón (decisión del dueño: los textos cálidos no se tocan sin su palabra).
- **Experimento barato** (no es dependencia): someter `invite_expiring` también como UTILITY en una marca. Si Meta la
  acepta, cuesta menos y no pesa como marketing. Encaja con la pregunta abierta «probar UTILITY» del consolidado.

---

## 5. Invitaciones que vencen y recompensas por recorrido

Hoy «premio con fecha límite» existe solo dentro del cron agresivo. Se **generaliza**: una invitación es
`{ premio del catálogo campaign_rewards, ventana en días, audiencia, cuándo }` y la puede disparar el ciclo (T2, T4,
latido) o el dueño (desde una banda, desde una fecha del calendario, o a todos).

- **Otorgar al enviar, no al encolar.** Responde la pregunta abierta de `send-governance.md`: si la invitación se difiere por
  cupo, el drenador **otorga el premio y calcula la fecha límite en el momento del envío real**. La cola guarda
  `windowDays` y `rewardId` en el item, no la fecha. Un premio cuya ventana corre sin que el cliente lo sepa es un premio
  perdido y una tasa de redención mentirosa.
- **Una invitación activa por cliente** (índice de la 00031): si ya tiene una viva, no se le manda otra (ni se cuenta como
  toque). Esto ya protege contra el premio doble; se conserva.
- **Escalera:** `cycle_small_reward_id` (uno o varios: rotan) y `cycle_strong_reward_id` (= el `aggressive_reward_id` de
  hoy, renombrado con compatibilidad). Sin catálogo, los toques salen sin premio con las plantillas existentes.
- **Recompensas por recorrido (lo que el dueño llamó «algo como la agresiva pero mejorado»):** es esto mismo: el premio
  depende de la **etapa** y del **ciclo**, no es un botón. Lo que **no** se construye: puntos extra por volver (sería una
  segunda moneda; los puntos los da la visita).

---

## 6. La pantalla «Ciclo» (campañas + calendario en un solo lugar)

> Lo que sigue está dibujado y clicleable en `2026-10-04-ciclo-de-recuperacion-mockup.html`. Lo que importa no es el
> dibujo sino **qué pregunta contesta cada zona**.

### 6.1 Arriba: cuatro números, ninguno es «enviados»

Volvieron por un mensaje (últimos 30 días) · retorno por toque (%) · en el ciclo / dormidos · cupo de la línea hoy
(reusa `CupoEnvioCard`). Todo lo demás es secundario.

### 6.2 La línea de tiempo (vista «por día del ciclo»)

- Eje horizontal: **días sin venir, 0 → 90**, y al final una caja «Dormidos» y otra «Archivados».
- Bandas de color por etapa: Reciente (0-11, verde) · T1 (12-23) · T2 (24-37) · T3 (38-55) · T4 (56-79) · T5 (80-90) ·
  Dormido (gris). **Una sola escala**: reemplaza a `RISK_LEVELS`, a la tira de 5 cajas y a la zona de recuperación
  (las tres se **derivan** de los días de los toques).
- Encima, una barra por día con cuántos clientes están ahí (histograma), y en cada toque un marcador con: **hoy entran N**,
  qué manda, qué premio, **retorno a 14 días** (la cifra que le dice al dueño qué toque funciona), interruptor on/off.
- Tocar una banda o un día abre la lista: nombre, **ciclo n · visitas**, puntos, último toque y si volvió. Es donde
  Juanita y Sara se ven distintas.
- Debajo, la **tira del mes** (hoy marcado), que avanza sola cada día; los eventos del calendario aparecen como pines.

### 6.3 Vista «por fecha» (el calendario, el mismo dato girado)

El mes en cuadrícula. En cada día: los eventos, y la **proyección**: «entran 23 a T3 · 8 a T4 · 31 al latido». Tocar un día
muestra quiénes (ciclo 1 vs. frecuentes), y el botón **«Crear aquí»** abre el creador con esa fecha puesta. Responde
literalmente: *«ver qué clientes van a entrar cuando programemos una fecha»*. El blackout pre-evento se ve como sombra
sobre los días que cubre.

### 6.4 Crear en tres campos

Un botón «Crear», tres tarjetas:

| | Campos | Qué hace por dentro |
|---|---|---|
| **Invitación** | premio (del catálogo, o escribirlo y queda en el catálogo) · vence en (3 / 5 / 7 / 14 días) · a quién (una banda, dormidos, todos; con el conteo vivo) · cuándo (ahora / una fecha) | `invite_expiring` + `reward_grants` al enviar. Respeta cap de 7, mensual, blackout, cupo; lo que no cabe gotea |
| **Evento** | título · fecha · foto · texto con enlace | El evento de calendario de hoy, tal cual (`event_image`) |
| **Mensaje libre** | la pantalla manual de hoy, para quien sepa | `ManualCampaigns` sin cambios |

Vista previa del WhatsApp real a la derecha de cada formulario. **Cero elección de plantilla**: la invitación ya sabe cuál.

### 6.5 Los toques automáticos, editables donde se ven

Cada marcador se edita en su sitio: día, premio, encendido/apagado. La validación de §3.2 es la única guardia. Un enlace a
«¿Cómo decide el sistema?» con el diagrama de §3.1 en lenguaje de dueño.

### 6.6 Rutas y lo que se retira

- `/dashboard/campaigns` **se queda** (hay enlaces por todos lados) con el menú «Ciclo y campañas». Pestañas: **Ciclo**
  (default) · **Mensaje libre** · **Premios** · **Historial**.
- `/dashboard/calendar` **redirige** a `/dashboard/campaigns?vista=fecha` (patrón `redirect()` + lectura de `?` con
  `useSyncExternalStore`, nunca `useSearchParams()`). `EventCreateDialog`, `EventDetailDrawer`, `MediaUploader` se reusan.
- `AtRiskBubbles` sale del panel principal y lo reemplaza un **mini-ciclo** (la línea, sin detalle) que lleva a la pantalla.
  Las burbujas, su copy y `RISK_LEVELS` se retiran: una sola escala.
- La tira «Ciclo de recuperación del cliente» y las 4 tarjetas de Automáticas desaparecen: el ciclo las contiene.
- El cron sigue en **`/api/cron/reactivation`** (misma ruta, `vercel.json` intacto, 15:00 Bogotá) para que el despliegue no
  toque crons; por dentro corre el motor del ciclo.

---

## 7. Datos y código

### 7.1 Migración (el número lo da `node scripts/proxima-migracion.mjs` **al construir**; hoy diría 00070, y eso no reserva)

```sql
-- customers: el estado del ciclo
ALTER TABLE customers
  ADD COLUMN cycle_no            integer     NOT NULL DEFAULT 1,
  ADD COLUMN cycle_started_at    timestamptz,                 -- backfill: last_visit_at (o created_at)
  ADD COLUMN cycle_touches       integer     NOT NULL DEFAULT 0,
  ADD COLUMN cycle_state         text        NOT NULL DEFAULT 'activo'
                                 CHECK (cycle_state IN ('activo','dormido','archivado')),
  ADD COLUMN dormant_since       timestamptz,
  ADD COLUMN heartbeats_sent     integer     NOT NULL DEFAULT 0,
  ADD COLUMN strong_offer_last_at timestamptz;

-- el libro de toques: idempotencia y atribución
CREATE TABLE customer_cycle_touches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),          -- SIEMPRE explícito (la 00030 no corrió)
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  cycle_no            integer NOT NULL,
  stage               text NOT NULL CHECK (stage IN ('t1','t2','t3','t4','t5','heartbeat')),
  seq                 integer NOT NULL DEFAULT 1,                     -- el latido se repite: 1, 2
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at             timestamptz,
  campaign_message_id uuid REFERENCES campaign_messages(id) ON DELETE SET NULL,
  grant_id            uuid REFERENCES reward_grants(id) ON DELETE SET NULL,
  returned_at         timestamptz,
  location_id         uuid,                                           -- nullable, FK COMPUESTA, RESTRICT (regla de la casa)
  created_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (location_id, tenant_id) REFERENCES restaurant_locations(id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (customer_id, cycle_no, stage, seq)                          -- un toque por etapa por ciclo: el anti-doble-disparo
);
-- RLS como el resto (tenant_id), índices por (tenant_id, sent_at) y (customer_id, cycle_no).
```

Dos triggers, en SQL, probados con el Postgres embebido (`tests/db/`):

1. **`on_customer_visit`** — `AFTER UPDATE OF last_visit_at ON customers WHEN (NEW.last_visit_at > OLD.last_visit_at)`:
   reinicio (§3.4) + atribución de 14 días. Un solo punto de verdad para QR, mesero y domicilio.
2. **`on_campaign_message_sent`** — `AFTER INSERT ON campaign_messages` con `status='sent'` y la campaña en
   `('manual','calendar','reactivation')`: `cycle_touches += 1`; si llega al tope (`admin_settings.cycle_fatigue_touches`,
   default 6) → `cycle_state='dormido'`, `dormant_since=now()`. Emisor-independiente: la manual, el calendario, el
   drenador y el ciclo lo disparan sin saberlo (como el trigger de la billetera en la 00033).

**Backfill en la misma migración:** `cycle_started_at = COALESCE(last_visit_at, created_at)`; quien lleve más de 90 días
sin venir nace `dormido` con `dormant_since = now()` (§3.8). Sin ráfaga.

### 7.2 El motor: puro, y espejo entre cron y pantalla

`src/lib/cycle-engine.ts` (sin I/O, como `points-engine.ts`): `resolveStage(diasSinVenir, config)`,
`validateStageConfig(config)`, `bandsFromConfig(config)`. Lo consumen el cron, los endpoints y el navegador: **si la
pantalla y el cron calcularan la etapa por separado, anunciarían días distintos** (la lección de
`normalizeReactivationDays()`).

### 7.3 El cron (`/api/cron/reactivation`, mismo path)

Por marca, paginado de a 1.000 (N7): clientes `activo` con `accepts_marketing`, sin opt-out, con `last_visit_at`;
`diasSinVenir → etapa debida`; para cada uno: `INSERT … ON CONFLICT DO NOTHING` en `customer_cycle_touches`
(`pending`) → si insertó, envía → `sent` + `campaign_message_id` (+ `grant_id`) · si falló, `failed` **y se borra o se
marca para reintentar mañana** (N3 muere por construcción: un fallo no bloquea). Dormidos: el latido por `dormant_since`.
Variables de T2/T4 (fecha límite) **se calculan al enviar**; si el envío va a la cola, el item lleva `windowDays` y
`rewardId` y el drenador otorga al drenar (§5). `getOrCreateTodayCampaign('reactivation', …)` se conserva: el cap mensual
y el historial siguen leyendo `source='reactivation'`.

### 7.4 Endpoints

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/dashboard/cycle/overview` | config de etapas, conteo por día (0-90+), dormidos/archivados, «hoy entran» por toque, retorno a 14 d por toque (30 d) |
| GET | `/api/dashboard/cycle/projection?from&to` | por fecha, cuántos entran a cada etapa (es aritmética sobre `last_visit_at`: no hay tabla nueva) |
| GET | `/api/dashboard/cycle/customers?day=42` o `?stage=t4` o `?state=dormido` | la lista, paginada, con `cycle_no`, visitas, puntos, último toque, `returned_at` |
| POST | `/api/dashboard/cycle/invitation` | crea la invitación (§6.4): es la ruta `campaigns/manual` con `preset='invite_expiring'` + `rewardId` + `windowDays` + `audience` |
| PUT | `/api/dashboard/settings` | claves nuevas: `cycle_stage_days` (json), `cycle_small_reward_ids`, `cycle_strong_reward_id`, `cycle_fatigue_touches`, `cycle_heartbeat_enabled`, `cycle_strong_cooldown_days`. Entran a la **lista cerrada** del PUT (ítem de P1) |

Todo con `requireTenantId()` para leer y `exigirAlcanceDeMarca()` para escribir (como `reward-tiers`).

### 7.5 Tests (lo que falla contra el código viejo)

- `tests/unit/cycle-engine.test.ts`: etapa por día, validación de días (7 entre toques, ≤ 3 por 30), bandas derivadas,
  cooldown de la fuerte, salto de T1 con ≥ 5 visitas.
- `tests/db/cycle-triggers.test.ts` (Postgres real): visita → `cycle_no+1`, reset, atribución a 14 días y no a 15;
  sexto mensaje → dormido; cumpleaños y recordatorio no cuentan; el UNIQUE rechaza el segundo toque de la misma etapa
  (8 inserciones concurrentes, gana una, como `calendar-claim.test.ts`).
- `tests/unit/template-catalog.test.ts`: la nueva pasa las 5 reglas y la prueba de palabras por variable.
- `tests/unit/cycle-invitation.test.ts`: otorgar al enviar, no al encolar; `duplicate_active` no cuenta como toque.

### 7.6 Lo que se deprecia

`RISK_LEVELS` y `getCustomerRank()` por riesgo (quedan `POWER_RANKS`) · `deriveRecoveryZone()` → derivada de
`cycle_stage_days` (la **zona reservada** pasa a ser «±3 días alrededor de cada toque», misma idea, un solo origen) ·
`hasRecentCampaignMessage()` para `reactivation` (el cumpleaños la sigue usando) · `reactivation_soft_days` /
`reactivation_aggressive_days` → migran a `cycle_stage_days` (T2 = suave, T4 = agresiva, para que ninguna marca cambie de
día sin querer) · la tira de 5 cajas y las 4 tarjetas de Automáticas · el copy que miente (N15).

---

## 8. Fases

| Fase | Qué | Sesiones | Migración | Qué necesita del dueño |
|---|---|---|---|---|
| **0 · Parar la sangría** | N3 (un fallo no bloquea), N4 (tope: máx. 1 insistente por ciclo y nunca a < 30 días del anterior), N15 (copy), `RISK_LEVELS` = bandas del ciclo (una escala), **consulta de solo lectura** sobre `message_logs` para medir cuántos recibieron el insistente repetido | 1 Sonnet | no | leer el resultado de la consulta |
| **1 · El motor** | migración + triggers + backfill, `cycle-engine.ts`, el cron sobre `/api/cron/reactivation`, `invite_expiring` en el catálogo, otorgar-al-enviar en el drenador, tests | 2 Sonnet (1 base + 1 cron) | sí (1) | **aplicar la migración antes del deploy**; crear `invite_expiring` por marca (1 aprobación); elegir premio pequeño y fuerte por marca (o nada) |
| **2 · La pantalla** | overview/projection/customers, la línea de tiempo, vista por fecha con proyección, crear en 3 campos, redirect de `/calendar`, mini-ciclo en el panel, retiro de burbujas y tarjetas | 2-3 Sonnet (endpoints · línea · calendario+crear) | no | mirar el prototipo y decir qué sobra |
| **3 · Ritmo y escalera** | calibrador de ritmo (mediana de días entre visitas de los que vuelven → sugiere los días), rotación de premios pequeños, salto de T1 a frecuentes, latido | 1-2 Sonnet | no | encender el latido (default sí) |
| **4 · Futuro** (§10) | fechas especiales, ruleta, IG | — | — | decisiones de producto |

Orden de despliegue de la fase 1 (regla de la casa): **migración en Supabase → deploy**. Al revés, el cron escribe en
columnas que no existen y PostgREST devuelve 42703 en silencio.

---

## 9. Decisiones del dueño (con el default: si no dice nada, se construye así)

| # | Pregunta | Default propuesto | Por qué |
|---|---|---|---|
| 1 (16.a) | Días de los toques | 12 · 24 · 38 · 56 · 80 | Caben 7/3/6; huecos crecientes; T2 y T4 cerca de los 21/25 de hoy |
| 2 (16.b) | Qué cuenta para las «6» | manual + calendario + ciclo; **no** cumpleaños ni recordatorio | El recordatorio habla de lo que ya es suyo; el cumpleaños es relación, no marketing |
| 3 (16.c) | ¿Se reinicia el contador por tiempo? | **No.** Solo con la visita. El tiempo activa el latido | Reiniciar por tiempo reabre el drip a quien ya dijo que no con su silencio |
| 4 (16.d) | ¿Domicilio reinicia? | **Sí** | Ya lo hace; y es una venta |
| 5 (16.e) | Backfill | Hacia adelante; > 90 días → dormido de entrada | Sin ráfaga a 508 personas el día del deploy |
| 6 | Latido a dormidos | Encendido, 90 y 180 días, máx. 2, con el premio fuerte | Mínimo del canal; el premio cuesta solo si viene |
| 7 | Cooldown de la oferta fuerte | 180 días por cliente | Freno al «espero a que me llegue algo mejor» |
| 8 | ¿Los eventos van a dormidos? | No, salvo casilla en el evento | Un festival grande puede valer la excepción |
| 9 | `invite_expiring` también como UTILITY | Probar en una marca | Barato; si pasa, más barato aún |
| 10 | ¿Qué hacer con el bono por volver / puntos extra? | **No se construye** | Segunda moneda; los puntos los da la visita |

---

## 10. Lo que queda fuera y cómo queda la puerta abierta

- **Fechas especiales por país y rubro** (San Valentín, Amor y Amistad, Madre, Padre, Halloween, Navidad, Día del Sushi…):
  un catálogo estático (`src/constants/fechas-especiales.ts`, por país y `business_type`) que la vista por fecha pinta como
  **pines fantasma** con «Crear evento desde aquí». No necesita IA en la v1; después, un borrador de texto con el LLM. Es
  una tarde de trabajo encima de la fase 2.
- **Ruleta / sorteo / cliente del mes:** la ruleta es una **invitación con premio aleatorio**: la landing `/c/{slug}` ya
  existe y el motor de probabilidades de la Mystery Box también. Es combinar, no inventar. Clasificaciones del mes salen de
  `POWER_RANKS` + un evento.
- **Instagram:** publicar desde el sistema exige la Graph API de Instagram con cuenta de negocio, una app de Meta con
  revisión (`instagram_content_publish`) y un token por marca que **nunca** va a `tenants.config` (regla de la casa:
  `tenant_integration_secrets`). Es un proyecto propio; el ciclo no lo necesita y no lo bloquea.
- **Calibrador de ritmo por marca** (fase 3): el dato ya está en `visits`; la fase 1 solo tiene que no hornear los días.
- **Puntos por consumo (POS):** no cambia nada aquí; el ciclo es agnóstico de cómo se ganan los puntos.

---

## 11. Cómo sabremos si funciona (métricas, en orden)

1. **Retorno por toque a 14 días** (`returned_at` / `sent`), por marca y por etapa. Es el número de la pantalla.
2. **Segunda visita:** % de clientes de ciclo 1 que abren el ciclo 2 dentro de 60 días. El número más importante de
   cualquier programa de fidelización; hoy no se mide.
3. **Retorno del ciclo:** % que vuelve antes de dormirse.
4. **Reactivados desde dormido** por latido (y cuántos latidos costó).
5. **Salud:** opt-outs por cada 1.000 mensajes (meta < 5) y `quality_rating` de la línea; si suben, el ciclo está mal
   calibrado, no la base.
6. **Premios:** otorgados / redimidos / vencidos por etapa (**conteos, nunca pesos**, D7).

Un mes después de la fase 1 se compara el retorno por toque con el **antes** (el mismo cálculo sobre `campaign_messages`
+ `visits` de los 90 días previos: la atribución de 14 días se puede reconstruir hacia atrás). Si T3 no trae a nadie, se
apaga y quedan cuatro. Si T1 trae más que T4, el premio fuerte está mal puesto. Eso es lo que el diseño compra: poder
equivocarse con los días y corregir con datos en vez de con opiniones.
