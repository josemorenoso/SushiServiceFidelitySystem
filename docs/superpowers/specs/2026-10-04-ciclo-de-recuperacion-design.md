# Spec — El ciclo de recuperación: pipeline del recorrido del cliente (Bloque 7) — 2026-10-04

> **Estado:** propuesta de diseño, **sin código**. Segunda pasada el mismo día con la revisión del dueño (§12: qué cambió y
> qué se corrigió de la revisión). Es el «spec propio» que pide §16.3 de `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`
> y reemplaza la §3.6 del spec de gobernanza de envío (`2026-08-30-gobernanza-de-envio-design.md`). Cae en la ola **P5**
> del consolidado (`docs/ESTADO-CONSOLIDADO-2026-10-04.md` §9) y absorbe los micro **N3, N4 y N15** de P1.
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
| **Cuánto dura el recorrido automático** | Un toque al día 21 y, por la dedup de 30 días, el «insistente» al día ~51 y **cada 30 días para siempre**, igual texto, igual premio (N4). O nada, si la marca no tiene plantilla | **Cinco toques en ~90 días** con huecos crecientes (12 · 24 · 38 · 56 · 80 para un negocio al que se vuelve cada mes; **un solo ajuste**, el ritmo del negocio, los escala), después **dormido** con un toque trimestral (máx. 2) |
| **Cuándo para** | Nunca para solo (y un fallo de envío lo calla 30 días: N3) | A las **6 comunicaciones sin volver** (regla del dueño, §16.1) o al terminar el ciclo, lo primero que pase |
| **Cuándo se reinicia** | Implícito: `last_visit_at` lo saca del pool | Explícito: toda visita (QR **o domicilio**) abre el **ciclo n+1** y queda anotado **qué toque lo trajo** |
| **Qué dice cada toque** | Dos textos (suave / insistente) | Le recordamos → le regalamos algo (vence el domingo) → le mostramos lo otro (solo si la marca tiene domicilio) → rescate (regalo fuerte) → despedida. **Una sola plantilla nueva** («Regalo que vence»); si la marca no la tiene aprobada, sale con la insistente de siempre y el regalo igual queda en la tarjeta |
| **Juanita (1 visita, día 42) vs Sara (3.ª visita, 3.er ciclo)** | Indistinguibles | Cada etapa se muestra partida en **nuevos / ya volvieron antes**; el ciclo n cambia el regalo y el ritmo; el regalo fuerte tiene **cooldown de 180 días por cliente** |
| **La pantalla** | Automáticas (4 tarjetas) + Manuales (asistente de 669 líneas) + Premios + Historial, burbujas con otra escala de días, y un Calendario aparte que nadie usa | **Una pantalla que abre con sugerencias para aprobar**, no con un botón de crear: «31 dormidos reciben su toque mañana, ¿OK?», «Halloween en 27 días, ¿creamos el evento?». Seis cajas por etapa con nuevos / ya volvieron, el mismo dato girado a **vista por fecha** con la proyección de quién entra a qué etapa qué día, y **mandar un regalo** en tres campos |
| **Lo que decide el dueño** | 21 y 25 días, dos plantillas, un premio | **Una pregunta al activar** («¿cada cuánto vuelve un cliente típico?») y una lista de tres pasos con barra de progreso (regalo pequeño, regalo fuerte, plantilla). Sin eso, el ciclo igual corre con lo que la marca ya tiene |

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
7. **No se mide lo único que importa**: cuántos volvieron **después** de cada toque, y cuántos habrían vuelto solos. Se mide
   «enviados».

---

## 2. Qué hace volver a un cliente (principios, y qué sabemos y qué no)

Lo que está bien establecido y el diseño usa:

- **La recencia manda.** La probabilidad de volver cae con los días sin venir; es el eje de toda segmentación RFM. Por eso
  el ciclo se mide en **días desde la última visita**, no en fechas de calendario, y por eso los huecos entre toques se
  **ensanchan**: a más días sin venir, menos probabilidad por mensaje y más riesgo de bloqueo por mensaje.
- **El ritmo es del negocio, no del sistema.** Para un almuerzo ejecutivo, 12 días sin venir ya es tarde; para un
  restaurante de celebraciones, es spam. Un solo reloj para 25 marcas está mal para 24. Por eso el único ajuste obligatorio
  es «¿cada cuánto vuelve un cliente típico?» (§3.2.bis).
- **La segunda visita es la que más vale.** La mayoría de los programas pierden a la gente entre la visita 1 y la 2. El bono
  de bienvenida (75-90 sobre 150) ya deja al cliente nuevo «a un paso» (efecto de progreso dotado, Nunes & Drèze); el
  primer toque del ciclo 1 tiene que decirle **exactamente cuánto le falta** (`{{2}} puntos`, `{{3}} premio`).
- **Convierte lo concreto y con fecha**, no el «te extrañamos». Un motivo (regalo, evento, cumpleaños), una fecha límite
  que se entienda («vence este domingo» vende más que «en 7 días») y cero fricción (ven y muestra el mensaje). La aversión a
  la pérdida funciona **solo si es verdad**: en este sistema los puntos **no vencen** (y Meta rechaza urgencia falsa, regla
  5 de `template-texts.ts`). Lo que sí vence de verdad es un **regalo con fecha** (`reward_grants` con `expires_at`). Esa
  es la única palanca de urgencia honesta, y ya existe.
- **La hora decide.** Un mensaje de restaurante se lee antes del almuerzo o antes de la cena; a las 15:00 (la hora fija del
  cron de hoy) no es ninguna de las dos. Es un preset por marca (§5).
- **La sorpresa sostiene la atención** (refuerzo variable, la Mystery Box ya lo hace en la visita). Un toque que promete «un
  regalo» sin decir cuál cuesta cero y abre el mensaje.
- **Cadencia:** 2-3 mensajes de marketing al mes por persona y al menos una semana entre ellos es la práctica común del
  canal (también en `Reestructuración.md`). Se conserva tal cual: `FREQUENCY_CAP_DAYS = 7`, `MONTHLY_MARKETING_CAP = 3`.
- **Parar protege la línea.** Quien no responde a seis mensajes es exactamente quien bloquea o reporta. La regla de fatiga
  del dueño (§16.1) no es solo cortesía: cuida el `quality_rating` del número, que es el cupo de todas las campañas.
- **El dueño aprueba, no inventa.** Lo que mató al calendario no fue el formulario sino la hoja en blanco. La pantalla
  tiene que abrir con dos o tres cosas ya armadas y un botón en cada una (§6.1).

Lo que **no** sabemos, y el diseño no finge saber:

- **Los días por defecto son un diseño bajo restricciones** (7 días entre toques, 3 al mes, 6 toques, huecos crecientes),
  no un número sacado de un estudio. No hay evidencia pública seria de «el día correcto» para un restaurante por WhatsApp.
- **Un retorno del 14 % no dice nada sin saber cuántos vuelven solos.** Por eso desde la fase 1 el motor deja a un grupo
  pequeño **sin mensaje** en cada toque (§7.1, `holdout`): la única cifra que justifica pagar es «con mensaje vuelven 14 %,
  sin mensaje 6 %».
- **«90 días» no es sagrado.** Sale solo: cinco toques con huecos crecientes y un tope de seis comunicaciones caben en
  ~80-90 días al ritmo mensual; al ritmo semanal el ciclo dura ~52 días y al de «de vez en cuando», ~110.

---

## 3. El ciclo: la máquina de estados

### 3.1 Estados de un cliente (por marca)

```
            visita (QR o domicilio)                 6 toques sin volver, o la despedida enviada
  ┌──────────────────────────────┐              ┌───────────────────────────────┐
  │                              ▼              │                               ▼
  │   ┌────────┐   cinco toques      ┌───────┴────┐   2 toques trimestrales   ┌───────────┐
  └───┤ ACTIVO │ ─────────────────▶  │  DORMIDO   │ ───────sin volver───────▶ │ ARCHIVADO │
      │ ciclo n│ ◀───────────────┐   │ 1 cada 90 d│ ◀──┐                     │ solo cumple│
      └────────┘  visita → n+1   │   └────────────┘    │ visita → n+1        │ y eventos  │
                                 └─────────────────────┴─────────────────────┴─────┬──────┘
                                                                     visita → n+1   │
                                                                     ◀──────────────┘
  Fuera del diagrama, por encima de todo: opt-out (`whatsapp_opt_out_at`) y `accepts_marketing = false`.
```

- **Activo:** dentro de un ciclo. El reloj es `cycle_started_at` = la última visita. Recorre los cinco toques.
- **Dormido:** la marca dejó de insistir. Recibe **cumpleaños** (siempre), **eventos** del calendario solo si el dueño marcó
  «incluir dormidos», y **un toque cada 90 días** (máx. 2): el primero con el regalo pequeño, el segundo con el fuerte.
- **Archivado:** solo cumpleaños y eventos con «incluir dormidos». Ningún automático. **Es un estado del modelo, no de la
  pantalla:** el dueño ve «Dormidos» y, dentro, «sin toques desde hace más de 6 meses». La palabra «archivado» no aparece.
- **Toda visita** —escaneo del mesero, QR de mesa o domicilio— devuelve al cliente a **Activo**, abre el ciclo **n+1** y
  anota qué toque lo trajo (§3.4). Responde 16.d: **el domicilio cuenta** (ya hoy escribe `last_visit_at`).

### 3.2 Los toques del ciclo (ritmo mensual; los otros ritmos en §3.2.bis)

| Toque (como lo ve el dueño) | id | Día | Qué dice | Plantilla | Regalo | Cuenta para «6» |
|---|---|---|---|---|---|---|
| **Le recordamos** | `t1` | 12 | «Tienes {{2}} puntos, te faltan pocos para {{3}}». Sin oferta. En el ciclo 1 es el empujón a la **segunda visita** | `reactivation_no_reward` (existe) | — | sí |
| **Le regalamos algo** | `t2` | 24 | Regalo **pequeño** que vence el domingo siguiente | `gift_expiring` (**nueva**, §4) · sin ella aprobada: `reactivation_aggressive` (existe) y el regalo igual queda en la tarjeta | pequeño | sí |
| **Le mostramos lo otro** | `t3` | 38 | Si solo vino al local → «también llevamos a tu puerta». Si solo pidió → «ven, en el local es otra cosa». Sin oferta. **Solo existe si la marca tiene domicilio** (`tenants.config.has_delivery_webhook`, 00066); si no, el ciclo tiene cuatro toques | `campaign_presencial_to_domicilio` / `campaign_domicilio_to_presencial` (existen) · `source_channels='both'`: se salta | — | sí |
| **Rescate** | `t4` | 56 | Regalo **fuerte** que vence el domingo siguiente (**es la agresiva de hoy**, con su recordatorio 2 días antes) | `gift_expiring` · sin ella: `reactivation_aggressive` | fuerte (cooldown 180 d; en cooldown, el pequeño) | sí (el recordatorio, no) |
| **Despedida** | `t5` | 80 | «Tus puntos siguen ahí, nosotros guardamos tu progreso». Sin oferta. Después, silencio | `reactivation_aggressive` (existe; su texto ya dice eso) | — | sí → **dormido** |

Por qué estos huecos: 12 → 24 → 38 → 56 → 80 son +12, +14, +18, +24. Mes 1: dos toques. Mes 2: dos toques (+ el
recordatorio del regalo del rescate cae en el día ~61, mes 3). Mes 3: recordatorio + despedida. Nunca más de 3 al mes,
nunca menos de 7 días entre dos toques; el recordatorio está exento del cap de 7 por diseño (D5 de `reward-grants.md`) y
sigue contando en el mensual. Si la marca no configura ningún regalo, los toques salen igual con las plantillas que ya tiene:
**el ciclo funciona desde el día uno para las 25 marcas.**

**Validación:** cada toque ≥ 7 días del anterior; ninguna ventana de 30 días con más de 3 toques (contando el recordatorio
del rescate como uno). Vale para los presets y para quien edite los días a mano (opción avanzada, escondida).

### 3.2.bis El ritmo del negocio: una pregunta, no cinco números

Al activar el ciclo (y en Ajustes después), **una sola pregunta**: *«¿Cada cuánto vuelve un cliente típico?»*

| Respuesta | Toques (días sin venir) | El ciclo dura | Para quién |
|---|---|---|---|
| **Cada semana** | 7 · 14 · 24 · 38 · 52 | ~52 días | almuerzo ejecutivo, cafetería de paso, comida rápida de barrio |
| **Cada quince días** | 10 · 20 · 32 · 46 · 64 | ~64 días | casual de fin de semana |
| **Cada mes** (default) | 12 · 24 · 38 · 56 · 80 | ~80 días | la mayoría: sushi, parrilla, pizzería de salida |
| **De vez en cuando** | 21 · 38 · 56 · 80 · 110 | ~110 días | celebraciones, alta cocina, ocasiones |

Los cuatro cumplen la validación de §3.2 (incluido el recordatorio del rescate). El calibrador automático (fase 3) no
inventa días: **sugiere el preset** mirando la mediana de días entre visitas de los que vuelven, y el dueño confirma.
Las marcas con `reactivation_soft_days`/`aggressive_days` propios entran con el preset más cercano y un aviso.

### 3.3 Las reglas de cadencia

1. `FREQUENCY_CAP_DAYS = 7` entre mensajes de marketing. Igual.
2. `MONTHLY_MARKETING_CAP = 3` (manual + calendario + ciclo + recordatorio). Igual.
3. Cumpleaños fuera de todo cap; dedup 360. Igual.
4. **Fatiga (nueva, §16.1):** al **sexto** mensaje de marketing **desde la última visita** sin que haya vuelto, el cliente
   pasa a **dormido**. Responde 16.b: cuentan `manual`, `calendar` y los toques del ciclo (`reactivation`); **no** cuentan
   el cumpleaños ni el recordatorio de regalo (habla de algo que ya es suyo). Consecuencia buscada: **una campaña manual o
   un evento que el dueño mande durante el ciclo acorta el ciclo automático** en vez de sumarse encima. Responde 16.c: el
   contador **no** se reinicia por tiempo, solo con la visita; para el paso del tiempo está el toque trimestral.
5. **El evento manda sobre el toque (nueva).** Si un cliente está en la audiencia de un evento programado y hoy cae dentro
   del blackout de ese evento (5 días antes, `blackout_days`), **su toque del ciclo se pospone hasta después del evento**.
   Hoy el blackout solo frena campañas manuales; la invitación al evento está **exenta** del cap de 7 días (lo aplicó así
   `executeAutoEvent()` desde siempre, ver `send-governance.md`), así que el riesgo no es que el evento no salga, sino que
   el cliente reciba el rescate el lunes y la invitación el sábado: dos mensajes de marketing en una semana, que es
   exactamente lo que el cap existe para evitar, y además el mensual de 3 sí puede dejar al evento afuera. El evento tiene
   fecha; el toque puede esperar. Es un `WHERE` más en el cron.

### 3.4 Reinicio y atribución

Al escribir `last_visit_at` (hoy en `customer.service.ts:98` y en el alta con `countFirst`), **un trigger de base**
(no código TS, para que QR, mesero, domicilio y cualquier escritor futuro lo disparen igual):

- `cycle_no += 1`, `cycle_started_at = last_visit_at`, `cycle_touches = 0`, `cycle_state = 'activo'`, `dormant_since = NULL`.
- **Atribución:** el último toque del ciclo que se cierra con `sent_at` dentro de los **14 días** anteriores recibe
  `returned_at = now()`; **también los toques `holdout`** (los que no se enviaron a propósito), que es lo que permite
  comparar. «El rescate trajo 31 clientes este mes; sin mensaje habrían vuelto 12» sale de ahí. Es atribución de último
  toque, honesta y barata; compara toques entre sí con la misma vara.

### 3.5 Dormido: un toque cada tres meses

- Entra a dormido al sexto toque **o** tras la despedida (lo primero). `dormant_since = now()`.
- **A los 90 días:** `gift_expiring` con el regalo **pequeño**. **A los 180:** con el regalo **fuerte**. Si no vuelve,
  archivado. El orden no es capricho: con el ritmo mensual el rescate sale el día 56, el dormido empieza el día 80 y el
  primer toque trimestral cae el día ~170: **114 días desde el regalo fuerte, dentro del cooldown de 180**. El segundo
  cae el día ~260, 204 días después: libre. Si se invirtiera, el primer toque saldría sin regalo o no saldría.
- Interruptor por marca `cycle_heartbeat_enabled` (default **encendido**: a un cliente que ya no responde, un mensaje por
  trimestre es el mínimo del canal y el regalo solo cuesta si viene). En pantalla se llama «toque trimestral».
- Cumpleaños sigue saliendo. Eventos: casilla «incluir dormidos» en el evento (default apagada).

### 3.6 Ciclo n: Juanita y Sara

- **Juanita** (1 visita, día 42, ciclo 1): está entre «le mostramos lo otro» y el rescate. Lo que la trae es el regalo
  fuerte del día 56; en la caja de su etapa cuenta como **nueva**.
- **Sara** (3.ª visita, ciclo 3): mismo esquema, pero (a) si su ciclo 2 recibió el regalo fuerte hace menos de **180
  días**, en el rescate recibe el **pequeño** (`strong_offer_last_at`); (b) con ≥ 5 visitas el sistema **salta «le
  recordamos»** (ya conoce el programa; menos mensajes a los fieles); (c) el regalo pequeño **rota** si la marca cargó
  más de uno (`cycle_no % n`). En la caja cuenta como **ya volvió antes**.
- **Por qué no «un mensaje distinto por ciclo»:** cada texto es una aprobación de Meta por marca (24-72 h, 25 marcas). Lo
  que cambia por ciclo es lo que **viaja en las variables** (puntos, premio próximo, regalo, fecha) y qué toques saltan.
- **El freno al efecto Temu está en tres sitios:** la escalera sube **dentro** del ciclo (pequeño → fuerte) y nunca
  **entre** ciclos; el regalo fuerte tiene cooldown de 180 días por cliente; la despedida cierra **sin** oferta.

### 3.7 Cumpleaños y eventos: las interrupciones

Siguen siendo independientes del ciclo: **no mueven el reloj** ni cuentan igual. Cumpleaños: no cuenta para nada.
Eventos: cuentan para la fatiga (§3.3) y **pausan el toque** de su audiencia en el blackout (§3.3 regla 5).

### 3.8 Backfill: cómo entra la base que ya existe (responde 16.e)

**Hacia adelante, sin reescribir historia.** Cada cliente entra al ciclo **en el día en el que ya está**
(`today - last_visit_at`): el del día 42 verá el rescate el día 56; el del día 200 pasa **directo a dormido** con
`dormant_since = hoy` (su primer toque trimestral, dentro de 90 días, con el regalo pequeño). Los 508 «perdidos» de la
captura **no reciben una ráfaga el día del despliegue**. `cycle_no` arranca en 1 para todos.

### 3.9 Lo que NO cambia

Puntos y sellos no vencen (no se amenaza con eso). `reward_grants`, el recordatorio (D5) y el cupo de línea (00037/00038)
siguen iguales. El cumpleaños, igual. `promoteVersion()` sigue siendo el único escritor de `*_template_sid`. El contrato
`{{n}}` de las plantillas existentes no se toca. Nada en pesos (D7).

---

## 4. Mensajes y plantillas (la restricción que manda)

Cada plantilla nueva = una aprobación de Meta **por marca**. Por eso el ciclo entero se arma con lo que ya está aprobado
más **una** plantilla nueva. Se llama **«Regalo que vence»** y no «invitación»: *Invitaciones con premio* ya existe en
Recompensas (el enlace y QR de la 00063) y son dos cosas distintas.

| Clave | Variables | Para qué |
|---|---|---|
| **`gift_expiring` · «Regalo que vence»** (nueva, MARKETING) | `{{1}}` nombre · `{{2}}` regalo · `{{3}}` fecha límite («domingo 11 de octubre») · `{{4}}` camino de niveles | «Le regalamos algo», «Rescate», los dos toques trimestrales, y lo que el dueño mande desde la pantalla. **Es la plantilla que le quita al dueño la necesidad de entrar a Twilio**: una sola, aprobada una vez; el regalo y la fecha cambian solos |

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

**La ruta por defecto el día uno es el adaptador, no la plantilla nueva.** Mientras una marca no tenga `gift_expiring`
**aprobada**, todo lo que la use sale con la **insistente de siempre** (`reactivation_aggressive_template_sid`), el regalo
se otorga igual y aparece en la tarjeta con su fecha («Disponible: ½ rollo gratis, vence el domingo»). Límite honesto: ese
texto no nombra el regalo; la tarjeta sí. Las marcas Twilio cuya insistente ya lleva `{{4}}` regalo y `{{5}}` fecha (Sushi
Service) se mapean directo: mismo significado, otro orden, un adaptador por marca. La pantalla lo dice en vez de
esconderlo: *«Esta marca aún no tiene la plantilla «Regalo que vence»: sale con la insistente. El regalo igual llega.»*
Con esto «mandar un regalo» no falla en silencio en 24 de 25 marcas el primer día.

- **La confusión de los puntos** (problema 6) se ataca donde no cuesta aprobación: la **tarjeta** (`/tarjeta`, premio
  disponible: «reclámalo, tus puntos siguen intactos») y esta plantilla nueva. Los textos `points_earned_*` llevan la
  frase cuando se re-aprueben por otra razón (los textos cálidos no se tocan sin palabra del dueño).
- **Experimento barato** (no es dependencia): someter `gift_expiring` también como UTILITY en una marca. Si Meta la
  acepta, cuesta menos y no pesa como marketing.

---

## 5. Regalos que vencen: fecha, hora y a quién

Hoy «premio con fecha límite» existe solo dentro del cron agresivo. Se **generaliza**: un regalo es
`{ premio del catálogo campaign_rewards, hasta cuándo, audiencia, cuándo sale }` y lo puede disparar el ciclo o el dueño
(desde una caja, desde una fecha del calendario, o a todos).

- **«Vence este domingo».** Por defecto la fecha límite es el **cierre del domingo siguiente**, con un mínimo de 5 días
  (si el domingo está a menos de 5, el siguiente). El dueño puede elegir 3 / 7 / 14 días si quiere. «Vence el domingo»
  da un plan; «vence en 7 días» da una cuenta.
- **La hora es de la marca, no del cron.** Preset `cycle_send_slot`: **almuerzo** (10:30 Bogotá) o **cena** (16:30,
  default). Cómo, sin tocar `vercel.json`: el cron del ciclo (`/api/cron/reactivation`, 15:00 UTC = 10:00 Bogotá) **decide
  y encola** con `not_before` a la hora de la marca, y `queue-drain` (cada 15 min) **envía**. El mismo camino sirve para
  lo que no cabe en el cupo. Nada sale «ahora» desde el cron.
- **Otorgar al enviar, no al encolar.** El drenador **otorga el regalo y calcula la fecha límite en el momento del envío
  real**; el item de la cola guarda `rewardId` y la regla de vencimiento, no la fecha. Responde la pregunta abierta de
  `send-governance.md`.
- **Un regalo activo por cliente** (índice de la 00031): si ya tiene uno vivo, no se le manda otro (ni cuenta como toque).
- **Escalera:** `cycle_small_reward_ids` (uno o varios: rotan) y `cycle_strong_reward_id` (= el `aggressive_reward_id` de
  hoy, con compatibilidad). Sin catálogo, los toques salen sin regalo con las plantillas existentes.
- **El cupo vive en el creador, no en la portada:** «Hoy puedes mandar 180. Si son más, el resto sale en los días
  siguientes.» (`getLineBudget()`, sin recalcular nada).

---

## 6. La pantalla (campañas + calendario en un solo lugar)

> Dibujada y clicleable en `2026-10-04-ciclo-de-recuperacion-mockup.html`. Lo que importa es **qué pregunta contesta
> cada zona** y que el dueño la abre **desde el celular, entre incendios**.

### 6.0 Primer uso: tres pasos con barra de progreso, y una pregunta

Arriba de todo, hasta que estén los tres: **regalo pequeño** elegido · **regalo fuerte** elegido · plantilla **«Regalo
que vence» aprobada** (estado real, por marca, leyendo al proveedor; mientras tanto: «sale con la insistente»). Al lado,
la pregunta del ritmo (§3.2.bis) con su respuesta visible y «cambiar». Ninguno de los tres bloquea el ciclo: lo mejoran.

### 6.1 «Para hoy»: aprobar, no crear

Dos o tres tarjetas ya armadas, con un botón cada una. El dueño aprueba. Las genera el motor, ordenadas por lo que
mueven, máximo tres:

| Tarjeta | De dónde sale | Botones |
|---|---|---|
| «**31 dormidos** reciben su toque trimestral **mañana** con *Postre del chef*» | `dormant_since + 90` ∈ próximas 48 h | OK · Cambiar regalo · Hoy no |
| «**Halloween** es en 27 días. ¿Creamos el evento?» | catálogo de fechas especiales (§10) a ≤ 30 días | Crear evento · Este año no |
| «**Noche de sushi** (17 oct) todavía no tiene foto: sin foto no sale» | evento `auto` sin `media_url` | Subir foto |
| «**23 clientes** llegan al rescate esta semana y no hay regalo fuerte elegido» | `t4` en 7 días ∧ `cycle_strong_reward_id` vacío | Elegir regalo |
| «Hoy sobran **120** del cupo y hay **48** en *le regalamos algo* sin regalo configurado» | presupuesto > 50 % ∧ regalo pequeño vacío | Elegir regalo |

Las fechas especiales dejan de ser decoración: son tarjetas con botón.

### 6.2 Seis cajas, no un histograma

El dueño no necesita el día exacto; necesita **cuántos hay en cada etapa y cuántos son nuevos**. Seis cajas grandes de
color, una por etapa (Recién vino · Le recordamos · Le regalamos algo · Le mostramos lo otro · Rescate · Despedida) y una
séptima gris (Dormidos): número total, partido en **nuevos** (ciclo 1) y **ya volvieron antes**, «hoy entran N» y el
retorno del toque. Tocar una caja abre la lista (nombre, ciclo n, visitas, puntos, último toque, si volvió). Contesta
Juanita contra Sara de un vistazo y cabe en un celular en dos columnas. **Una sola escala:** las cajas reemplazan a
`RISK_LEVELS`, a la tira de 5 cajas y a la zona de recuperación (las tres se **derivan** de los días del preset).

El histograma por día queda plegado bajo «Ver por día» (detalle de escritorio), con la tira del mes y los eventos.

### 6.3 Arriba: dos o tres números, ninguno es «enviados»

Volvieron por un mensaje (últimos 30 días; cuando haya grupo de control: «con mensaje 14 %, sin mensaje 6 %») · en el
ciclo y dormidos · el próximo evento. **El cupo de la línea sale de la portada** y entra al creador (§5).

### 6.4 Vista «por fecha» (el calendario, el mismo dato girado)

El mes en cuadrícula. En cada día: los eventos, las fechas especiales sugeridas y la **proyección**: «23 entran al
rescate · 8 a le regalamos algo · 31 al toque trimestral». Tocar un día muestra quiénes (nuevos vs. ya volvieron), y
**«Crear aquí»** abre el creador con esa fecha puesta. El blackout se ve como sombra «reservado para el evento».

### 6.5 Mandar un regalo, en tres campos (y sin modal de «¿qué quieres mandar?»)

El botón principal abre **directo** en «Mandar un regalo»: regalo (del catálogo, o escribirlo y queda) · hasta cuándo
(«este domingo» por defecto, 3 / 7 / 14 días) · a quién (una etapa, dormidos, todos; con el conteo vivo) · cuándo (hoy a
la hora de la marca / una fecha). Vista previa del WhatsApp real. Debajo, en chico: **«Crear un evento»** y **«Mensaje
libre (avanzado)»**.

**El evento recibe el mismo trato**, no «el formulario de hoy sin cambios» (ese es el que nadie usó): nombre · fecha ·
foto · **texto sugerido ya escrito y editable** (el marco `event_image` lo permite: título, fecha y CTA son variables) ·
enlace opcional · incluir dormidos (casilla). La vista previa idéntica.

**Mensaje libre** es la salida de emergencia (`ManualCampaigns` tal cual). Objetivo medible: que «mandar un regalo» cubra
el 90 % de los envíos manuales. Si en un mes nadie usa Mensaje libre, se quita.

### 6.6 Vocabulario: de ingeniero a dueño

| En el código y en este spec | En la pantalla |
|---|---|
| `t1` … `t5` | Le recordamos · Le regalamos algo · Le mostramos lo otro · Rescate · Despedida |
| `activo` / `dormido` / `archivado` | En el ciclo · Dormidos · (Dormidos, «sin toques desde hace más de 6 meses») |
| heartbeat / latido | Toque trimestral |
| `gift_expiring` | Regalo que vence |
| atribución a 14 días | «volvieron en las dos semanas siguientes» |
| blackout | «reservado para el evento» |
| cupo / reserva / presupuesto de línea | «Hoy puedes mandar 180» |
| gotea / cola | «el resto sale en los días siguientes» |
| holdout / grupo de control | «sin mensaje, para comparar» |
| cooldown 180 d | «ya recibió el regalo fuerte este semestre» |

### 6.7 Rutas y lo que se retira

- `/dashboard/campaigns` **se queda** (hay enlaces por todos lados) con el menú «Ciclo y campañas». Pestañas: **Ciclo**
  (default) · **Premios** · **Historial**. Mensaje libre vive como enlace dentro del creador, no como pestaña.
- `/dashboard/calendar` **redirige** a `/dashboard/campaigns?vista=fecha` (patrón `redirect()` + lectura de `?` con
  `useSyncExternalStore`, nunca `useSearchParams()`). `MediaUploader` y `EventDetailDrawer` se reusan; `EventCreateDialog`
  se reemplaza por el creador.
- `AtRiskBubbles` sale del panel principal y lo reemplaza un **mini-ciclo** (las seis cajas, sin detalle) que lleva a la
  pantalla. Las burbujas, su copy y `RISK_LEVELS` se retiran: una sola escala.
- La tira «Ciclo de recuperación del cliente» y las 4 tarjetas de Automáticas desaparecen: las cajas las contienen.
- El cron sigue en **`/api/cron/reactivation`** (misma ruta, `vercel.json` intacto); por dentro decide y encola.

---

## 7. Datos y código

### 7.1 Migración (el número lo da `node scripts/proxima-migracion.mjs` **al construir**; hoy diría 00070, y eso no reserva)

```sql
-- customers: el estado del ciclo
ALTER TABLE customers
  ADD COLUMN cycle_no             integer     NOT NULL DEFAULT 1,
  ADD COLUMN cycle_started_at     timestamptz,                 -- backfill: last_visit_at (o created_at)
  ADD COLUMN cycle_touches        integer     NOT NULL DEFAULT 0,
  ADD COLUMN cycle_state          text        NOT NULL DEFAULT 'activo'
                                  CHECK (cycle_state IN ('activo','dormido','archivado')),
  ADD COLUMN dormant_since        timestamptz,
  ADD COLUMN heartbeats_sent      integer     NOT NULL DEFAULT 0,
  ADD COLUMN strong_offer_last_at timestamptz;

-- el libro de toques: idempotencia, atribución y grupo de control
CREATE TABLE customer_cycle_touches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),          -- SIEMPRE explícito (la 00030 no corrió)
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  cycle_no            integer NOT NULL,
  stage               text NOT NULL CHECK (stage IN ('t1','t2','t3','t4','t5','heartbeat')),
  seq                 integer NOT NULL DEFAULT 1,                     -- el trimestral se repite: 1, 2
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','queued','sent','failed','holdout','deferred')),
  holdout             boolean NOT NULL DEFAULT false,                 -- grupo de control: NO se envía, SÍ se atribuye
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

- `deferred` = pospuesto por el blackout de un evento (§3.3 regla 5): se reintenta después del evento.
- `holdout`: el cron elige, por toque, un `cycle_holdout_pct` (default **10 %**, 0 para marcas chicas; decisión 11) por
  hash estable de `customer_id` + `stage`; a esos **no les manda nada** pero registra la fila. La atribución (§3.4) los
  marca igual. Es lo que vuelve comparable «con mensaje» contra «sin mensaje» desde el día uno.

Dos triggers, en SQL, probados con el Postgres embebido (`tests/db/`):

1. **`on_customer_visit`** — `AFTER UPDATE OF last_visit_at ON customers WHEN (NEW.last_visit_at > OLD.last_visit_at)`:
   reinicio (§3.4) + atribución de 14 días (incluidos `holdout`).
2. **`on_campaign_message_sent`** — `AFTER INSERT ON campaign_messages` con `status='sent'` y la campaña en
   `('manual','calendar','reactivation')`: `cycle_touches += 1`; si llega al tope (`cycle_fatigue_touches`, default 6) →
   `cycle_state='dormido'`, `dormant_since=now()`. Emisor-independiente, como el trigger de la billetera (00033).

**Backfill en la misma migración:** `cycle_started_at = COALESCE(last_visit_at, created_at)`; quien lleve más de 90 días
sin venir nace `dormido` con `dormant_since = now()` (§3.8). Sin ráfaga.

### 7.2 El motor: puro, y espejo entre cron y pantalla

`src/lib/cycle-engine.ts` (sin I/O, como `points-engine.ts`): `daysForRhythm(preset)`, `resolveStage(diasSinVenir, config)`,
`validateStageConfig(config)`, `bandsFromConfig(config)`, `shouldSkipT1(visits)`, `strongOfferAllowed(lastAt, now)`,
`heartbeatPrize(seq)`, `expiresOnSunday(sendDate, minDays)`, `isHoldout(customerId, stage, pct)`. Lo consumen el cron, los
endpoints y el navegador: **si la pantalla y el cron calcularan la etapa por separado, anunciarían días distintos**.

### 7.3 El cron (`/api/cron/reactivation`, mismo path): decide y encola

Por marca, paginado de a 1.000 (N7): clientes `activo` con `accepts_marketing`, sin opt-out, con `last_visit_at`;
`diasSinVenir → etapa debida` (preset de la marca; `t3` solo con `config.has_delivery_webhook`); **si está en el blackout de
un evento de su audiencia → `deferred`**; `holdout` por hash; para el resto: `INSERT … ON CONFLICT DO NOTHING` en
`customer_cycle_touches` (`pending`) → si insertó, **encola** en `send_queue` con `not_before` = hoy a la hora del slot de
la marca, `rewardId` y la regla de vencimiento en el item (`queued`). El **drenador** envía a la hora, otorga el regalo y
calcula «vence el domingo» ahí, y marca el toque `sent` con `campaign_message_id` + `grant_id`; un fallo deja `failed` y el
toque **se puede repetir mañana** (N3 muere por construcción). Dormidos: el trimestral por `dormant_since` (pequeño, fuerte).
`getOrCreateTodayCampaign('reactivation', …)` se conserva: el cap mensual y el historial siguen leyendo `source='reactivation'`.

### 7.4 Endpoints

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/dashboard/cycle/overview` | preset y días, conteo por etapa partido en nuevos / ya volvieron, dormidos, «hoy entran» por etapa, retorno a 14 d por etapa con y sin mensaje (30 d), el estado del primer uso (3 pasos), y las **tarjetas «para hoy»** |
| GET | `/api/dashboard/cycle/projection?from&to` | por fecha, cuántos entran a cada etapa (aritmética sobre `last_visit_at`: sin tabla nueva) + eventos + fechas especiales |
| GET | `/api/dashboard/cycle/customers?stage=t4` o `?day=42` o `?state=dormido` | la lista, paginada, con `cycle_no`, visitas, puntos, último toque, `returned_at` |
| POST | `/api/dashboard/cycle/gift` | manda un regalo (§6.5): es la ruta `campaigns/manual` con `preset='gift_expiring'` + `rewardId` + regla de vencimiento + `audience` + `not_before` |
| PUT | `/api/dashboard/settings` | claves nuevas: `cycle_rhythm` (`weekly|biweekly|monthly|occasional`), `cycle_stage_days` (json, solo avanzado), `cycle_small_reward_ids`, `cycle_strong_reward_id`, `cycle_fatigue_touches`, `cycle_heartbeat_enabled`, `cycle_strong_cooldown_days`, `cycle_send_slot`, `cycle_holdout_pct`. Entran a la **lista cerrada** del PUT (ítem de P1) |

Todo con `requireTenantId()` para leer y `exigirAlcanceDeMarca()` para escribir (como `reward-tiers`).

### 7.5 Tests (lo que falla contra el código viejo)

- `tests/unit/cycle-engine.test.ts`: los cuatro presets pasan la validación (7 entre toques, ≤ 3 por 30 contando el
  recordatorio); etapa por día; bandas derivadas; cooldown; salto de t1 con ≥ 5 visitas; `heartbeatPrize(1)` = pequeño,
  `(2)` = fuerte; `expiresOnSunday` con el mínimo de 5; `isHoldout` estable para el mismo cliente y etapa.
- `tests/db/cycle-triggers.test.ts` (Postgres real): visita → `cycle_no+1`, reset, atribución a 14 días y no a 15 (también
  a un `holdout`); sexto mensaje → dormido; cumpleaños y recordatorio no cuentan; el UNIQUE rechaza el segundo toque de la
  misma etapa (8 inserciones concurrentes, gana una, como `calendar-claim.test.ts`).
- `tests/unit/template-catalog.test.ts`: `gift_expiring` pasa las 5 reglas y la proporción de palabras por variable.
- `tests/unit/cycle-gift.test.ts`: otorgar al drenar, no al encolar; fecha calculada al enviar; `duplicate_active` no
  cuenta como toque; en blackout de evento el toque queda `deferred`; sin `has_delivery_webhook` no existe `t3`.

### 7.6 Lo que se deprecia

`RISK_LEVELS` y `getCustomerRank()` por riesgo (quedan `POWER_RANKS`) · `deriveRecoveryZone()` → derivada del preset (la
**zona reservada** pasa a ser «±3 días alrededor de cada toque») · `hasRecentCampaignMessage()` para `reactivation` (el
cumpleaños la sigue usando) · `reactivation_soft_days` / `aggressive_days` → el preset más cercano · la tira de 5 cajas,
las 4 tarjetas de Automáticas, `AtRiskBubbles`, `EventCreateDialog` · el copy que miente (N15).

---

## 8. Fases

| Fase | Qué | Sesiones | Migración | Qué necesita del dueño |
|---|---|---|---|---|
| **0 · Parar la sangría** | N3 (un fallo no bloquea), N4 (tope: máx. 1 insistente por ciclo), N15 (copy), `RISK_LEVELS` = bandas del ciclo (una escala), **consulta de solo lectura** sobre `message_logs` para medir cuántos recibieron el insistente repetido | 1 Sonnet | no | leer el resultado de la consulta |
| **1 · El motor** | migración + triggers + backfill, `cycle-engine.ts` con los cuatro presets, el cron que decide y encola (hora por marca, blackout → `deferred`, `holdout`, `t3` con bandera), el drenador que otorga al enviar y calcula el domingo, `gift_expiring` en el catálogo + adaptador por defecto, settings, tests | 2 Sonnet (1 base + 1 cron/drenador) | sí (1) | **aplicar la migración antes del deploy**; crear `gift_expiring` por marca (1 aprobación; mientras tanto sale con la insistente); contestar la pregunta del ritmo por marca; elegir regalo pequeño y fuerte (o nada) |
| **2 · La pantalla** | overview/projection/customers/gift, primer uso, «para hoy», seis cajas, vista por fecha con proyección y fechas especiales, mandar un regalo en tres campos, evento con texto sugerido, redirect de `/calendar`, mini-ciclo en el panel, retiro de burbujas y tarjetas | 2-3 Sonnet (endpoints · cajas y para hoy · fecha y creador) | no | mirar el prototipo y decir qué sobra |
| **3 · Afinar** | calibrador que **sugiere** el preset (mediana de días entre visitas), rotación de regalos pequeños, salto de «le recordamos» a frecuentes, reporte «con mensaje vs sin mensaje» por toque, texto del evento generado con el LLM | 1-2 Sonnet | no | leer el reporte y apagar lo que no traiga a nadie |
| **4 · Futuro** (§10) | fechas especiales por rubro completas, ruleta, IG | — | — | decisiones de producto |

Orden de despliegue de la fase 1 (regla de la casa): **migración en Supabase → deploy**. Al revés, el cron escribe en
columnas que no existen y PostgREST devuelve 42703 en silencio.

---

## 9. Decisiones del dueño (con el default: si no dice nada, se construye así)

| # | Pregunta | Default propuesto | Por qué |
|---|---|---|---|
| 1 (16.a) | Días de los toques | **Una pregunta por marca** (§3.2.bis); default «cada mes» = 12 · 24 · 38 · 56 · 80 | Un reloj para 25 marcas está mal para 24; cinco números editables es lo que nadie va a tocar |
| 2 (16.b) | Qué cuenta para las «6» | manual + calendario + ciclo; **no** cumpleaños ni recordatorio | El recordatorio habla de lo que ya es suyo; el cumpleaños es relación, no marketing |
| 3 (16.c) | ¿Se reinicia el contador por tiempo? | **No.** Solo con la visita. El tiempo activa el toque trimestral | Reiniciar por tiempo reabre el drip a quien ya dijo que no con su silencio |
| 4 (16.d) | ¿Domicilio reinicia? | **Sí** | Ya lo hace; y es una venta |
| 5 (16.e) | Backfill | Hacia adelante; > 90 días → dormido de entrada | Sin ráfaga a 508 personas el día del deploy |
| 6 | Toque trimestral a dormidos | Encendido, 90 (pequeño) y 180 (fuerte) días, máx. 2 | Mínimo del canal; el regalo cuesta solo si viene; el orden esquiva el cooldown |
| 7 | Cooldown del regalo fuerte | 180 días por cliente | Freno al «espero a que me llegue algo mejor» |
| 8 | ¿Los eventos van a dormidos? | No, salvo casilla en el evento | Un festival grande puede valer la excepción |
| 9 | `gift_expiring` también como UTILITY | Probar en una marca | Barato; si pasa, más barato aún |
| 10 | ¿Puntos extra por volver? | **No se construye** | Segunda moneda; los puntos los da la visita |
| 11 | Grupo de control (`holdout`) | **10 %** por toque; 0 en marcas con < 200 clientes | Sin él, el 14 % no dice nada; con 50 clientes, 10 % es ruido |
| 12 | Hora de envío por marca | **Cena (16:30 Bogotá)**; almuerzo (10:30) como alternativa | Un restaurante se decide antes de la comida, no a las 15:00 |
| 13 | «Le mostramos lo otro» | Solo con `has_delivery_webhook`; si no, cuatro toques | Una marca sin domicilio no puede decir «pide a tu puerta» |
| 14 | Mensaje libre | Se queda un mes como salida de emergencia; si nadie lo usa, se quita | El objetivo es que «mandar un regalo» cubra el 90 % |

---

## 10. Lo que queda fuera y cómo queda la puerta abierta

- **Fechas especiales por país y rubro** (San Valentín, Amor y Amistad, Madre, Padre, Halloween, Navidad, Día del Sushi…):
  un catálogo estático (`src/constants/fechas-especiales.ts`, por país y `business_type`). **En la fase 2 ya alimenta las
  tarjetas «para hoy»** («Halloween en 27 días, ¿creamos el evento?») y los pines del calendario; la fase 3 le pone el texto
  sugerido con el LLM. No necesita IA en la v1.
- **Ruleta / sorteo / cliente del mes:** la ruleta es un regalo con premio aleatorio: la landing `/c/{slug}` ya existe y el
  motor de probabilidades de la Mystery Box también. Es combinar, no inventar. Clasificaciones del mes salen de
  `POWER_RANKS` + un evento.
- **Instagram:** publicar desde el sistema exige la Graph API de Instagram con cuenta de negocio, una app de Meta con
  revisión (`instagram_content_publish`) y un token por marca que **nunca** va a `tenants.config` (regla de la casa:
  `tenant_integration_secrets`). Es un proyecto propio; el ciclo no lo necesita y no lo bloquea.
- **Puntos por consumo (POS):** no cambia nada aquí; el ciclo es agnóstico de cómo se ganan los puntos.

---

## 11. Cómo sabremos si funciona (métricas, en orden)

1. **Retorno por toque a 14 días, con mensaje y sin mensaje** (`returned_at` / `sent` vs. `returned_at` / `holdout`), por
   marca y por etapa. Es el número de la pantalla y la única cifra que justifica pagar.
2. **Segunda visita:** % de clientes de ciclo 1 que abren el ciclo 2 dentro de 60 días. El número más importante de
   cualquier programa de fidelización; hoy no se mide.
3. **Retorno del ciclo:** % que vuelve antes de dormirse.
4. **Reactivados desde dormido** por toque trimestral (y con cuál regalo).
5. **Salud:** opt-outs por cada 1.000 mensajes (meta < 5) y `quality_rating` de la línea; si suben, el ciclo está mal
   calibrado, no la base.
6. **Regalos:** otorgados / redimidos / vencidos por etapa (**conteos, nunca pesos**, D7).
7. **Uso:** cuántos envíos manuales salieron por «mandar un regalo» y cuántos por «mensaje libre». Si el segundo es cero
   en un mes, se quita.

Un mes después de la fase 1 se compara el retorno por toque con el **antes** (el mismo cálculo sobre `campaign_messages`
+ `visits` de los 90 días previos). Si «le mostramos lo otro» no trae a nadie, se apaga. Si «le recordamos» trae más que
el rescate, el regalo fuerte está mal puesto. Eso es lo que el diseño compra: poder equivocarse con los días y corregir con
datos en vez de con opiniones.

---

## 12. Segunda pasada (2026-10-04): qué cambió con la revisión del dueño

Lo que la revisión dejó como está: un solo reloj · fatiga a 6 contando manuales y eventos · una sola plantilla nueva ·
otorgar al enviar · backfill sin ráfaga · «volvieron por un mensaje» como KPI · el calendario como el mismo dato girado.

| Cambio pedido | Aplicado en |
|---|---|
| De «crear» a «aprobar»: sugerencias armadas con botón, fechas especiales como tarjetas | §2, §6.1, §7.4 (`overview` las devuelve), §10 |
| Vocabulario de dueño; «archivado» no aparece; el cupo sale de la portada | §3.1, §3.2, §5, §6.3, §6.6 |
| Seis cajas partidas en nuevos / ya volvieron en vez del histograma de 91 barras | §6.2 (el histograma queda plegado como detalle) |
| Un solo ajuste: el ritmo del negocio (cuatro presets) | §3.2.bis, §7.2, §9 #1 |
| Primer uso: tres pasos con barra de progreso y estado real de la plantilla | §6.0, §7.4 |
| El adaptador como ruta por defecto, dicho en pantalla | §4 |
| Sin modal: abrir en «mandar un regalo»; el evento con el mismo trato (texto sugerido) | §6.5, §6.7 |
| El evento manda sobre el toque: pausa en el blackout | §3.3 regla 5, §7.1 (`deferred`), §7.3 |
| Toque trimestral: primero el pequeño, después el fuerte | §3.5, §9 #6 |
| «Le mostramos lo otro» solo con domicilio; cuatro toques por defecto si no | §3.2, §9 #13 |
| Hora por marca (almuerzo / cena) y «vence este domingo» | §5, §7.3, §9 #12 |
| Grupo de control desde la fase 1 | §2, §3.4, §7.1 (`holdout`), §9 #11, §11 |
| «Regalo que vence» en vez de «Invitación con premio» (choca con la 00063) | §4, en todo el documento |
| Mensaje libre como salida de emergencia con fecha de caducidad | §6.5, §9 #14, §11 |

Dos cosas de la revisión que el código contradice, y cómo quedaron:

- **«El cliente que recibe el rescate el lunes queda bloqueado 7 días y no recibe el evento del sábado.»** No: la
  invitación al evento está **exenta** del cap de 7 días desde siempre (`executeAutoEvent()` nunca lo aplicó, y
  `queue-drain` lo respeta; `send-governance.md` § «Qué encola hoy»). Lo que sí pasa es peor para la línea: **recibe los
  dos**, y además el cap mensual de 3 sí puede dejar el evento afuera. La solución pedida (pausar el toque en el blackout)
  se adopta igual, por esas dos razones.
- **«El latido choca con el cooldown.»** Confirmado con la cuenta (día 56 → día 170 = 114 < 180). Resuelto con el orden
  pequeño → fuerte; con el ritmo semanal (rescate día 38, dormido día 52, trimestral día 142: 104 días) pasa lo mismo y la
  misma regla lo cubre.
