# Requerimientos — Julio 2026

> **Estado:** 📋 APROBADO — en desarrollo (Bloque 1)
> **Fecha:** 2026-07-11
> **Origen:** solicitud del dueño del producto + auditoría de código previa al desarrollo
> **Método:** AInnovate v2 (Documentation-Driven Development)

Este documento es la **fuente de verdad** de lo pedido en julio 2026. Recoge los requerimientos
textuales, los hallazgos de la auditoría de código que los preceden, las decisiones tomadas y la
descomposición en bloques de trabajo. Cada bloque tiene después su propio spec técnico y su propio
doc de feature.

---

## 1. Contexto: el problema de fondo

> *"Lo que más me preocupa es que los dueños de negocio no están dando uso a la herramienta, por lo
> tanto debemos de volver esto más automático."*

Este es el requerimiento que gobierna a todos los demás. Toda decisión de diseño en este documento se
resuelve a favor de **lo que corre solo** por encima de lo que el dueño tiene que acordarse de
activar. Una palanca manual más no resuelve el problema: agrega otra cosa que nadie va a tocar.

El estado objetivo es que un cliente, en un mes cualquiera y sin que el dueño haga nada, pueda recibir:

- un incentivo de referidos ("trae un amigo y te llevas medio sushi"),
- una reactivación agresiva con premio y fecha límite si dejó de venir,
- una reactivación pasiva si lleva menos tiempo ausente,
- y una promoción puntual si el negocio la necesita.

Todo eso bajo los caps de frecuencia existentes, para que el cliente nunca se sienta spameado.

---

## 2. Requerimientos textuales

### R1 — Incentivo con fecha límite en la reactivación agresiva

> *"Necesito que en las campañas de reactivación agresiva pueda yo seleccionar un incentivo para el
> cliente (premio) para que vuelva y sea por tiempo limitado, o sea vuelve antes de X y recibe tu
> premio (lo cual sí vuelve agresiva la campaña realmente)."*

El dueño elige un premio del catálogo y una ventana de días. El cliente recibe un WhatsApp con su
fecha límite concreta, y el premio le queda **otorgado** hasta que venza.

### R2 — Arreglar la redención de premios

> *"Necesito que por favor arregles el aspecto de redención de premios, al parecer no están apareciendo
> los premios redimidos en el dashboard, porque si el cliente escoge mistery box hay que esperar a que
> reciba su premio y el mesero pueda tocar entregar premio, además de poner no sólo la mesa sino la
> persona que entregó el premio."*

Ver el diagnóstico completo en §3.1. La mesa y el mesero ya existen como columnas y ya se muestran;
el problema real es que la fila de redención casi nunca se crea.

### R3 — Premio visible en la tarjeta del cliente

> *"Al escanear el QR, donde ve sus visitas actuales, pueda ver 'Disponible: X premio o promo' y cuando
> el mesero le escanee le pueda redimir ese premio."*

Requerimiento añadido durante el diseño. Es la pieza que hace que la campaña sea agresiva de verdad:
el cliente **ve** su premio y su cuenta regresiva cada vez que abre su tarjeta, y llega pidiéndolo.

### R4 — Promociones especiales por tiempo limitado

> *"Poder activar promociones especiales para los clientes que vayan redimiendo al ir y que sean por
> tiempo limitado, o sea poder activar una promo que vayan y rediman ciertos clientes o todos los del
> sistema, esto es un sistema parecido al que vamos a usar para los referidos, ¿no? (Este aspecto
> simplemente analízalo y dime si es necesario en este momento)."*

**Análisis y respuesta: sí, es el mismo sistema. Y no, no es necesario ahora.**

Es el mismo sistema que referidos: [`docs/features/referral-program.md`](../features/referral-program.md)
ya diseñó `qr_campaigns` + `qr_campaign_redemptions`, que es exactamente "una promo con ventana de
tiempo que ciertos clientes rediman". Está marcado como PLAN, con cero código.

No se construye ahora por la razón del §1: una promo manual es una palanca que el dueño tiene que
acordarse de activar, y el diagnóstico dice que no las activa. La reactivación agresiva con premio y el
programa de referidos sí corren solos y sí atacan el problema real.

El motor de premios otorgados (`reward_grants`) y el catálogo (`campaign_rewards`) que se construyen en
el Bloque 1 **son exactamente la infraestructura que las promos y los referidos necesitan**. Cuando se
construyan, serán casi gratis: una promo es un `reward_grant` otorgado a un segmento en vez de a un
cliente reactivado. **Diferido, no descartado.**

### R5 — Personalización de umbrales de recompensa

> *"Estoy teniendo muchos problemas para el tema de definición de recompensas, ya que hay negocios que
> quieren cambiar el tema del sistema de puntos [...] estoy con un café y el umbral de 150 puntos que se
> alcanzan en 3 visitas [...] me pidió si esos 150 puntos podíamos alcanzarlos pero ya no en 3 sino en 5
> visitas [...] ¿dejamos esto así para poder darles el gancho psicológico [...] o añadimos una capa extra
> de personalización?"*

**Análisis y respuesta: no hace falta una capa nueva. El sistema ya se autoajusta. Lo que falta es que
el dueño pueda verlo.**

El near-miss del algoritmo es **relativo, no absoluto**. `generateSmartVisitPoints()`
([`src/services/points.service.ts:49-79`](../../src/services/points.service.ts)) deja al cliente corto a
propósito siempre que le falten más de 30 puntos, y le **garantiza** cruzar el umbral cuando le faltan
menos. No está atado a "3 visitas": está atado a la distancia al umbral.

Si al café se le bajan los puntos por visita de 60-90 a 25-35 — que **ya es configurable hoy** en
Dashboard > Ajustes > Sistema de Puntos — el umbral de 150 cae naturalmente en la visita 5, y el
"casi lo logro" aparece solo en la visita 4:

| Visita | Puntos otorgados | Acumulado | Faltan | Caso del algoritmo |
|--------|------------------|-----------|--------|--------------------|
| 1 | 25-35 | ~30 | 120 | Caso 1 (lejos) |
| 2 | 25-35 | ~65 | 85 | Caso 2 (dejar corto) |
| 3 | 25-35 | ~100 | 50 | Caso 2 (dejar corto) |
| 4 | 20-35 | ~125 | **25** | Caso 2 → **near-miss** |
| 5 | ≥25 | **≥150** | 0 | Caso 3 (garantiza cruzar) |

El gancho psicológico se conserva intacto. **No hay que cambiar la mecánica.**

El problema real es que el dueño ve dos inputs de puntos sueltos y **no tiene forma de traducirlos a
visitas**. La solución es un calibrador, no una capa de personalización. Ver Bloque 2.

### R6 — Pop-up de reseñas de Google

> *"En el aspecto de reseñas de Google, la gente no las está dejando [...] un pop up otra vez como estaba
> antes, pero diferente, porque antes estaba la x en la esquina y la gente literal a los 2 segundos que
> salía lo cerraba instintivamente [...] ahora un pop up que diga algo como 'gánate X por dejarnos una
> reseña en Google', y que haya dos botones: uno de dejar reseña y salen los pasos — 1 muéstrale al mesero
> la reseña, 2 redime tu regalo — y al final el botón; y que la recompensa X sea variable y definible en
> los ajustes del dashboard. Y el segundo botón debe ser 'La próxima lo hago' para que no se sientan
> obligados."*

Con tres requisitos adicionales:

- **R6.a** — *"Debemos rastrear quiénes están ingresando en el botón del link de Google para analizar
  efectividad de nuestra estrategia."*
- **R6.b** — *"Luego de que un cliente dejó la reseña y fue al link de Google ya no debe volver a salirle
  esta ventana, a menos que el cliente haya tocado 'La próxima lo hago'."*
- **R6.c** — *"Luego de dejar reseña y volver a la página debe salir: 'gracias por dejarnos tus
  comentarios, te esperamos de regreso'."*

Ver Bloque 3.

---

## 3. Hallazgos de la auditoría de código

Estos son bugs y huecos **encontrados durante la auditoría previa**, no pedidos por el usuario. Se
documentan aquí porque varios son la causa raíz de los síntomas reportados.

### 3.1 🔴 CRÍTICO — La redención de premios tiene una condición de carrera (causa raíz de R2)

La **única** forma de que se cree una fila en `reward_redemptions` es que el mesero pulse "Registrar
Entrega" en [`RewardAlert.tsx:122`](../../src/components/features/staff/RewardAlert.tsx). Ese botón solo
aparece si hay un premio pendiente. Pero [`RewardAlert.tsx:59-61`](../../src/components/features/staff/RewardAlert.tsx)
consulta el premio pendiente **una sola vez**, en el `useEffect` de montaje — es decir, en el instante
en que el mesero termina de escanear.

En ese momento el cliente **todavía no eligió su premio**. La secuencia real es:

1. El mesero escanea → `POST /api/check-in` → se otorgan puntos y se desbloquea el tier.
2. El mesero ve su pantalla de confirmación → `RewardAlert` consulta premio pendiente → **no hay
   ninguno todavía** → no renderiza nada → el mesero se va a otra mesa.
3. *Segundos después*, el cliente detecta el `tier_unlocked` en su polling de 5s
   ([`CheckInForm.tsx:217`](../../src/components/features/check-in/CheckInForm.tsx)), ve la animación de
   1.6s, y **toca con su dedo** "Mystery Box" o "A la segura"
   ([`RewardChoice.tsx:28-32`](../../src/components/features/check-in/RewardChoice.tsx)).
4. Recién ahí se dispara `POST /api/mystery-box/resolve` y existe un premio pendiente.
5. Pero `RewardAlert` no vuelve a consultar nunca, y **no existe ninguna otra pantalla en la app** que
   permita registrar la entrega.

**Consecuencia:** `reward_redemptions` queda vacía aunque el negocio sí esté entregando premios. Por eso
el dashboard muestra *"No hay redenciones en el rango seleccionado"*.

**Sobre "poner la mesa y quién entregó" (R2):** las columnas `table_number` y `redeemed_by_staff_id` **ya
existen** en el schema y **ya se muestran** en el dashboard
([`RedemptionsTable.tsx:96-97`](../../src/components/dashboard/RedemptionsTable.tsx)). Están en blanco
únicamente porque la fila nunca se crea. Arreglando la carrera se arreglan solas.

### 3.2 🔴 CRÍTICO — Un premio de campaña es imposible de registrar hoy

`reward_redemptions.source` ya acepta `'campaign_reward'` en su CHECK constraint
([`00022_reward_redemptions.sql`](../../supabase/migrations/00022_reward_redemptions.sql)), pero la
columna **`tier_id` es `NOT NULL`** con FK a `reward_tiers`.

Un premio de campaña (reactivación agresiva, promo, referido) **no tiene tier**. Es decir: el schema
declara soportar premios de campaña y a la vez hace imposible insertarlos. Bloquea R1 de raíz.

**Fix:** hacer `tier_id` nullable (los premios de tier lo siguen llenando; los de campaña, no).

### 3.3 🟠 Configuración fantasma en el sistema de puntos

Dashboard > Ajustes tiene inputs para `shortfall_min` y `shortfall_max`, y los guarda correctamente en
`admin_settings`. Pero `getPointsConfig()`
([`src/services/points.service.ts:89-111`](../../src/services/points.service.ts)) **nunca lee esas dos
keys**. `generateSmartVisitPoints()` usa siempre las constantes `DEFAULT_POINTS_SHORTFALL_MIN/MAX` de
[`src/constants/rewards.ts`](../../src/constants/rewards.ts).

El dueño configura el "casi lo logro" y no pasa nada. Va en el Bloque 2.

### 3.4 🟠 `reactivation_aggressive_reward_id` no tiene UI

El cron de reactivación ya lee `reactivation_aggressive_reward_id`
([`src/app/api/cron/reactivation/route.ts:52-57`](../../src/app/api/cron/reactivation/route.ts)) y lo usa
como variable `{{4}}` de la plantilla agresiva. Pero **no existe ningún campo en Dashboard > Ajustes**
para setearlo: hay que escribirlo a mano en la base de datos. En la práctica, nadie lo usa.

Además apunta a la tabla `rewards` **legacy** (la de `visit_milestone`), que es un concepto distinto al
que R1 necesita. Se reemplaza por el catálogo `campaign_rewards` en el Bloque 1.

### 3.5 🟡 El filtro de blackout de campañas manuales está muerto

En [`src/app/api/dashboard/campaigns/manual/route.ts:128-137`](../../src/app/api/dashboard/campaigns/manual/route.ts),
`getActiveBlackouts()` se consulta pero el predicado del filtro **siempre devuelve `true`**. El campo
`totalSkippedBlackout` de la respuesta es siempre 0. El blackout pre-evento se reporta como aplicado sin
aplicarse nunca.

**Fuera de alcance de estos bloques.** Se documenta como deuda conocida.

### 3.6 🟡 `GoogleReviewPopup.tsx` es código muerto

[`src/components/features/check-in/GoogleReviewPopup.tsx`](../../src/components/features/check-in/GoogleReviewPopup.tsx)
sigue en el repo sin una sola referencia (fue reemplazado por `GoogleReviewCard.tsx` en v1.4.0). Se
elimina o se reescribe en el Bloque 3.

### 3.7 🟡 No existe tracking de eventos del cliente

No hay tabla de eventos ni integración de analytics (PostHog/GA/Mixpanel: cero resultados en el repo).
`message_logs` es lo más cercano, pero es específico de WhatsApp. R6.a (rastrear clicks al link de
Google) requiere construir la persistencia desde cero.

### 3.8 🟡 El link de Google no tiene UI

`tenants.config.google_maps_url` solo se puede editar por SQL. No hay formulario en el dashboard. Se
añade en el Bloque 3.

---

## 4. Decisiones tomadas

| # | Decisión | Alternativas descartadas |
|---|----------|--------------------------|
| D1 | **Pantalla "Premios pendientes"** en la app del mesero, acotada a clientes con check-in reciente. | Polling en la alerta actual (frágil: el mesero se va de la pantalla). Escaneo de código del cliente (paso extra, depende de que el cliente colabore). |
| D2 | **Ventana en días desde el envío** (`expires_at = envío + N días`). Cada cliente tiene SU fecha. | Fecha fija global (hay que renovarla a mano cada mes — justo lo que no queremos). |
| D3 | **Catálogo propio `campaign_rewards`**, editable en el dashboard, reutilizable por referidos y promos. | Reusar `reward_tiers` (devalúa el sistema de puntos: regalar gratis un premio que se gana con puntos). Texto libre (no medible, el mesero no tiene nada estructurado que entregar). |
| D4 | **La lista del mesero solo muestra clientes presentes hoy.** Los premios de campaña de clientes que aún no han venido existen y le aparecen al cliente en su tarjeta, pero solo saltan a la pantalla del mesero cuando llegan y los escanean. | Mostrar todos los premios activos (convierte la pantalla en una guía telefónica durante el servicio y permite entregar premios a gente que no vino). |
| D5 | **El recordatorio de vencimiento es exento del cap de frecuencia de 7 días, pero sujeto al cap mensual de 3 mensajes de marketing.** | Respetar el cap de 7d (con ventanas de 5-7 días el recordatorio nunca se enviaría). Hacer el cap configurable (perilla peligrosa: bajarla es la vía rápida al opt-out masivo). |
| D6 | **El vencimiento del premio es independiente de los días de reactivación.** Son dos relojes distintos: subir la reactivación agresiva de 25 a 45 días no toca la ventana del premio. | Derivar la ventana de los días de reactivación (acopla dos conceptos que no tienen por qué moverse juntos). |
| D7 | **Las promos manuales (R4) se difieren**, pero se construye la infraestructura que necesitan. | Construirlas ahora (otra palanca manual que nadie va a activar). |
| D8 | **No se cambia la mecánica de puntos (R5).** Se construye un calibrador que traduce "quiero el premio en N visitas" a puntos por visita. | Añadir una capa de personalización de la mecánica (innecesaria: el near-miss ya es relativo al umbral). |

---

## 5. Descomposición en bloques

El trabajo se parte en tres bloques independientes, cada uno con su spec técnico y su doc de feature.
**El calendario queda explícitamente fuera** (lo resuelve otro equipo).

### Bloque 1 — Premios otorgados, entrega y reactivación agresiva 🔨 EN DESARROLLO

Cubre **R1, R2, R3** y los hallazgos **3.1, 3.2, 3.4**.

Introduce el concepto que falta en el sistema: el **premio otorgado** (`reward_grants`) — un premio que
le pertenece a un cliente y está pendiente de reclamar. Hoy el sistema sabe quién *ganó* un premio
(`mystery_box_results`) y qué se *entregó* (`reward_redemptions`), pero no tiene nada en medio. Por eso
el mesero no tiene dónde tocar y por eso un premio de campaña no cabe en ningún lado.

- Tabla `reward_grants` (premio con dueño, estado y vencimiento opcional).
- Tabla `campaign_rewards` (catálogo editable de premios de campaña).
- `reward_redemptions.tier_id` pasa a nullable.
- Pantalla "Premios pendientes" en la app del mesero, con mesa y atribución automática al mesero.
- El premio activo se muestra en la tarjeta del cliente, con cuenta regresiva.
- El premio activo salta en la pantalla del mesero al escanear.
- El cron de reactivación agresiva otorga el premio con `expires_at` y lo nombra en el WhatsApp.
- Cron nuevo de recordatorio de vencimiento (disparado por n8n), configurable en Ajustes.
- Métricas en el dashboard: otorgados / redimidos / vencidos / tasa de redención por origen.

📄 Spec: [`docs/superpowers/specs/2026-07-11-reward-grants-design.md`](../superpowers/specs/2026-07-11-reward-grants-design.md)
📄 Feature: [`docs/features/reward-grants.md`](../features/reward-grants.md)

### Bloque 2 — Calibrador de puntos y umbrales ⏳ PENDIENTE

Cubre **R5** y el hallazgo **3.3**.

- Arreglar la configuración fantasma: que `getPointsConfig()` lea `shortfall_min`/`shortfall_max`.
- Calibrador en Ajustes: el dueño dice *"quiero que el premio se gane en 5 visitas"* y el sistema calcula
  y propone los puntos por visita, mostrando la simulación visita a visita (incluido dónde cae el
  near-miss) antes de guardar.

### Bloque 3 — Pop-up de reseñas de Google con tracking ⏳ PENDIENTE

Cubre **R6, R6.a, R6.b, R6.c** y los hallazgos **3.6, 3.7, 3.8**.

- Modal sin "X" (la salida es un botón explícito, no un gesto reflejo).
- Recompensa configurable en Ajustes — reutiliza el catálogo `campaign_rewards` del Bloque 1: dejar
  reseña otorga un `reward_grant`, que el mesero entrega por el mismo camino que todo lo demás.
- Botón "Dejar reseña" → pasos 1/2 → link de Google. Botón "La próxima lo hago" → sin culpa.
- Persistencia del estado del cliente (`reviewed` / `postponed`) para no volver a mostrarlo a quien ya
  reseñó, pero sí a quien lo pospuso.
- Tracking del click al link para medir efectividad.
- Pantalla de agradecimiento al volver de Google.
- UI en Ajustes para el link de Google (hoy solo editable por SQL).

---

## 6. Fuera de alcance

| Ítem | Motivo |
|------|--------|
| Plantilla y campañas de **calendario** | Lo está resolviendo otro equipo. Explícitamente excluido. |
| **Promos manuales por tiempo limitado** (R4) | Diferido por decisión D7. La infraestructura queda lista. |
| **Programa de referidos** | Sigue como PLAN en [`referral-program.md`](../features/referral-program.md). Se beneficiará del catálogo y de `reward_grants`. |
| **Blackout muerto** en campañas manuales (hallazgo 3.5) | Deuda conocida, no bloquea nada de lo pedido. |

---

## 7. Registro de cambios de este documento

| Fecha | Cambio |
|-------|--------|
| 2026-07-11 | Creación. Requerimientos R1-R6, hallazgos de auditoría 3.1-3.8, decisiones D1-D8, descomposición en 3 bloques. |
