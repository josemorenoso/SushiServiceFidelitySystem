# Requerimientos — Julio 2026

> **Estado:** 🔨 EN CURSO — Bloque 1 ✅ COMPLETO · Bloque 2 ✅ COMPLETO · Bloque 3 ⏳
> **Fecha:** 2026-07-11 (actualizado 2026-07-12)
> **Origen:** solicitud del dueño del producto + auditoría de código previa al desarrollo
> **Método:** AInnovate v2 (Documentation-Driven Development)

Este documento es la **fuente de verdad** de lo pedido en julio 2026. Recoge los requerimientos
textuales, los hallazgos de la auditoría de código que los preceden, las decisiones tomadas y la
descomposición en bloques de trabajo. Cada bloque tiene después su propio spec técnico y su propio
doc de feature.

> **📌 ¿Eres una IA que retoma este trabajo?**
> Lee la **[§8 Handoff](#8-handoff--contexto-para-retomar-el-trabajo)** al final. Contiene todo el
> contexto de arquitectura, gotchas y decisiones ya tomadas para que puedas desarrollar los Bloques 2
> y 3 **sin releer el repo entero**.

---

## 0. Estado actual (2026-07-12)

| Bloque | Estado | Commit |
|--------|--------|--------|
| **1 — Premios otorgados, entrega y reactivación agresiva** | ✅ Código completo, typecheck + build verdes | `66ceada` |
| **2 — Calibrador de puntos y umbrales** | ✅ Código completo, typecheck + build verdes. **Sin migración, sin tareas del dueño: funciona al desplegar.** | v2.4.0 |
| **3 — Pop-up de reseñas de Google con tracking** | ⏳ Diseñado, sin código | — |

### ⚠️ 4 tareas que debe hacer el dueño para que el Bloque 1 funcione en producción

El código está listo, pero **no hace nada hasta que estas cuatro cosas ocurran**. Ninguna la puede
hacer la IA.

| # | Tarea | Por qué | Si no se hace |
|---|-------|---------|---------------|
| 1 | **Aplicar la migración `supabase/migrations/00031_reward_grants.sql`** en Supabase | Crea `reward_grants` y `campaign_rewards`, hace `tier_id` nullable, y hace el **backfill** de los premios pendientes históricos | `/mesero/rewards` y el catálogo dan error (la UI degrada con un toast, no revienta) |
| 2 | **Crear y aprobar las plantillas de Twilio** | La agresiva ahora usa `{{4}}` = premio y `{{5}}` = fecha límite. El recordatorio es una **plantilla nueva** (`{{1}}` nombre · `{{2}}` premio · `{{3}}` días restantes) | La agresiva sigue funcionando con 4 variables (Twilio 21665 → reintento con una menos), pero **sin fecha límite**. El recordatorio no sale nunca |
| 3 | **Importar `n8n/cron_reward-reminder.json`** en n8n y activarlo | Es el único disparador del cron (`vercel.json` está en `"crons": []`) | Los premios **nunca vencen** (se quedan `active` para siempre) y no sale ningún recordatorio |
| 4 | **Crear los premios** en Dashboard → *Premios de campaña*, y elegir uno en Dashboard → *Ajustes → Premio de Reactivación Agresiva* | Sin premio en el catálogo, `grantsEnabled = false` | La reactivación agresiva manda el mensaje pero **no otorga ningún premio**. Es solo un recordatorio, no una campaña agresiva |

**El orden importa:** 1 → 4 → 2 → 3. Sin la migración, el catálogo del paso 4 ni siquiera carga.

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

El gancho psicológico se conserva a cualquier escala de puntos. **No hay que cambiar la mecánica.**

El problema real es que el dueño ve seis inputs de puntos sueltos y **no tiene forma de traducirlos a
visitas**. La solución es un calibrador, no una capa de personalización. Ver Bloque 2.

> #### ⚠️ Corrección (2026-07-12) — este análisis tenía la cuenta mal
>
> La versión original de esta sección afirmaba que bajar los puntos por visita a 25-35 hacía caer el
> premio en la visita 5, con una tabla donde la visita 1 otorgaba 25-35 puntos. **Es falso.**
>
> **La visita 1 no otorga puntos de visita: otorga el bono de bienvenida.**
> [`check-in/route.ts:410`](../../src/app/api/check-in/route.ts) llama a `awardWelcomeBonus()` en el
> registro y **nunca** a `awardVisitPoints()`. El bono default es 75-90 — sobre un umbral de 150, **más
> de la mitad del premio se regala antes de que el cliente vuelva una sola vez**.
>
> Con el bono intacto en 75-90 y los puntos por visita en 25-35, el premio cae en la visita **4**:
>
> | Visita | Otorga | Acumulado | Faltan |
> |--------|--------|-----------|--------|
> | 1 | **bono 75-90** | ~82 | 68 |
> | 2 | 25-35 (lejos) | ~112 | 38 |
> | 3 | 25-35 (lejos) | ~142 | **8** |
> | 4 | cruza | **≥150** | — |
>
> Y con un umbral de 150, metas de 6+ visitas serían **imposibles** sin tocar el bono.
>
> **Por eso el calibrador del Bloque 2 ajusta el bono de bienvenida junto con los puntos por visita.**
> Uno que solo moviera `points_per_visit_min/max` prometería N visitas y entregaría N−1 — exactamente el
> pecado del hallazgo 3.3. La conclusión de fondo (*no hay que cambiar la mecánica, hay que traducirla*)
> **se sostiene**; lo que estaba mal era la aritmética.

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

### Bloque 1 — Premios otorgados, entrega y reactivación agresiva ✅ COMPLETO (`66ceada`)

Cubre **R1, R2, R3** y los hallazgos **3.1, 3.2, 3.4**.

Introdujo el concepto que faltaba en el sistema: el **premio otorgado** (`reward_grants`) — un premio
que le pertenece a un cliente y está pendiente de reclamar. El sistema sabía quién *ganó* un premio
(`mystery_box_results`) y qué se *entregó* (`reward_redemptions`), pero no tenía nada en medio. Por eso
el mesero no tenía dónde tocar y por eso un premio de campaña no cabía en ningún lado.

```
  GANAR                    TENER                      ENTREGAR
  mystery_box_results  →   reward_grants          →   reward_redemptions
  cron reactivación    →   ← LA PIEZA NUEVA           (mesa + mesero)
```

**Qué se construyó:**

| Pieza | Archivo |
|-------|---------|
| Tablas `reward_grants` + `campaign_rewards`, `tier_id` nullable, `grant_id` con índice único (anti doble-entrega), trigger `mark_grant_redeemed`, backfill | `supabase/migrations/00031_reward_grants.sql` |
| Motor de premios otorgados | `src/services/reward-grant.service.ts` |
| Catálogo de premios de campaña | `src/services/campaign-reward.service.ts` |
| Pantalla "Premios pendientes" del mesero | `src/app/(public)/mesero/rewards/page.tsx` + `src/components/features/staff/PendingRewardsList.tsx` + `src/app/api/staff/pending-rewards/route.ts` |
| Banner "Disponible: X — vence en N días" en la tarjeta del cliente | `src/components/features/check-in/AvailableRewardBanner.tsx` |
| Alerta de premio al escanear (reescrita: lee grants, soporta varios, polling corto) | `src/components/features/staff/RewardAlert.tsx` |
| Reactivación agresiva otorga el premio con `expires_at` + `{{5}}` = fecha límite | `src/app/api/cron/reactivation/route.ts` |
| Cron de recordatorio (barrido de vencidos + aviso) | `src/app/api/cron/reward-reminder/route.ts` + `n8n/cron_reward-reminder.json` |
| Catálogo en el dashboard | `src/app/(dashboard)/dashboard/campaign-rewards/page.tsx` + `src/app/api/dashboard/campaign-rewards/route.ts` |
| Config (premio, ventana, recordatorio) | `src/app/(dashboard)/dashboard/settings/page.tsx` |
| Métricas: otorgados / redimidos / vencidos / tasa de redención por origen | `src/components/dashboard/GrantMetricsCards.tsx` |
| `resolveStaffAuth` extraído (estaba duplicado en 2 rutas, iba por la 3ª) | `src/lib/staff-auth.ts` |

**Verificación:** `npx tsc --noEmit` limpio · `npx next build` verde · `npx eslint` sin errores nuevos
(el árbol limpio ya tenía 14 errores preexistentes en `useDashboardAnalytics.ts` y `useStaffAuth.ts`).

**⚠️ NO está desplegado.** Ver las [4 tareas del dueño](#4-tareas-que-debe-hacer-el-dueño-para-que-el-bloque-1-funcione-en-producción) en §0.

📄 Spec: [`docs/superpowers/specs/2026-07-11-reward-grants-design.md`](../superpowers/specs/2026-07-11-reward-grants-design.md)
📄 Feature: [`docs/features/reward-grants.md`](../features/reward-grants.md)

### Bloque 2 — Calibrador de puntos y umbrales ✅ COMPLETO (v2.4.0)

Cubre **R5** y el hallazgo **3.3**.

No hacía falta una capa de personalización de la mecánica: hacía falta un **traductor**. El dueño veía
seis casillas numéricas sueltas y ninguna le decía en cuántas visitas cae el premio.

**Qué se construyó:**

| Pieza | Archivo |
|-------|---------|
| Motor puro (algoritmo + simulador + calibrador), sin I/O, compartido entre producción y el navegador | `src/lib/points-engine.ts` |
| La perilla *"¿en cuántas visitas se gana el premio?"* + tabla espejo visita a visita | `src/components/dashboard/PointsCalibrator.tsx` |
| Sistema de Puntos abre con el calibrador; los seis inputs se pliegan bajo *Ajustes avanzados* | `src/app/(dashboard)/dashboard/settings/page.tsx` |
| **Fix 3.3:** `getPointsConfig()` por fin lee `shortfall_min`/`shortfall_max` | `src/services/points.service.ts` |
| Constantes del calibrador | `src/constants/rewards.ts` |

**Dos hallazgos que cambiaron el diseño:**

1. **La visita 1 otorga el bono de bienvenida, no puntos de visita** (ver la corrección en §2/R5). El bono
   es la palanca dominante, así que el calibrador **tiene** que ajustarlo junto con los puntos por visita.
2. **La fórmula cerrada falla por una visita** cuando el cliente aterriza dentro de la banda del
   shortfall. El calibrador por tanto **no despeja: busca** — barre candidatos, simula cada uno con el
   algoritmo real, y se queda con el que aterriza el premio exactamente donde se pidió.

**El simulador no es una copia del algoritmo.** Es el algoritmo, con el `rng` inyectado en `() => 0.5`
(el "cliente mediano"). La tabla del dashboard **no puede desincronizarse** de producción.

**Verificación:** `npx tsc --noEmit` limpio · `npx next build` verde · `npx eslint` sin errores nuevos.
48 combinaciones de umbral × meta cumplen la invariante (`achieved ⇒ el premio cae en la visita pedida`).
Sin regresión: con los defaults, el premio sigue cayendo en la visita 3.

**✅ Sin migración de DB y sin tareas del dueño.** Las seis keys ya existían en `admin_settings` y no hay
endpoints nuevos. **Funciona en cuanto se despliegue.**

📄 Spec: [`docs/superpowers/specs/2026-07-12-points-calibrator-design.md`](../superpowers/specs/2026-07-12-points-calibrator-design.md)
📄 Feature: [`docs/features/points-mystery-box.md`](../features/points-mystery-box.md) (§2.3 y §2.4)

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
| 2026-07-11 | Bloque 1 completado (`66ceada`). Añadidas §0 (estado + 4 tareas del dueño) y §8 (handoff). |
| 2026-07-12 | Bloque 2 completado (v2.4.0). **Corregida la tabla de R5**, que ignoraba el bono de bienvenida y por eso daba 5 visitas donde el código da 4. Actualizados §0, §5, §8.2 (gotcha 8) y §8.3. |

---

## 8. Handoff — contexto para retomar el trabajo

> Esta sección existe para que una IA pueda desarrollar los Bloques 2 y 3 **sin releer el repo**.
> Todo lo de aquí está verificado contra el código a 2026-07-11.

### 8.1 Lo mínimo que hay que saber de la arquitectura

**Stack:** Next.js 16 (App Router) + React 19 + Supabase (Postgres + Auth) + TailwindCSS 4 + shadcn/ui
+ Twilio (WhatsApp). Deploy en Vercel. TypeScript estricto, cero `any`.

**Multitenant — y esto es lo más importante de todo:**

> El 95% del acceso a datos usa el **service-role client** (`getServiceClient()`), que **ignora RLS por
> diseño**. El aislamiento entre restaurantes es responsabilidad del **código**: cada query debe llevar
> `.eq('tenant_id', tenantId)` a mano. **Sin excepción.** Olvidarlo filtra datos entre restaurantes.
> Ref: `docs/DB_SCHEMA.md`, sección de RLS.

Cómo se resuelve el tenant, según el contexto (todo en `src/lib/tenant.ts`):

| Contexto | Función |
|----------|---------|
| Rutas públicas (`/check-in`, `/mesero`) | `getTenantByDomain(host)` — por `tenants.domain` |
| Dashboard admin | `requireTenantId()` — lee `app_metadata.tenant_id` del JWT de Supabase Auth |
| Crons | `getTenantBySlug(slug)` con `?tenant=`, o `getActiveTenants()` para recorrer todos |
| Webhooks de Twilio | `getTenantByMessagingService()` / `getTenantByWhatsappNumber()` |

**Configuración del negocio:** vive en `admin_settings`, una tabla **key-value** con PK compuesta
`(key, tenant_id)`. No son columnas tipadas. Se lee con `getSettingValue()` / `getMultipleSettings()`
(`src/services/settings.service.ts`) y se escribe desde el dashboard con `PUT /api/dashboard/settings`.
**Todos los valores son strings** — hay que parsear (`Number(...)`, `=== 'true'`).

**Branding por tenant:** `tenants.config` (jsonb) → `resolveBranding()` en `src/lib/branding.ts`,
consumido en cliente con `useBranding()`. Ahí vive `google_maps_url` (el link de reseñas), que **no
tiene UI todavía** — hoy solo se edita por SQL.

**Auth del mesero:** `resolveStaffAuth(request, tenant)` en `src/lib/staff-auth.ts` (extraído en el
Bloque 1). Dos escenarios: `Bearer <staff JWT>` o `X-Device-Token`. Devuelve `{ valid, staffId }` — el
`staffId` es lo que permite **atribuir** una acción a un mesero concreto. En el cliente, el hook es
`useStaffAuth()` con `getAuthHeaders()`.

**Crons:** `vercel.json` está en `"crons": []` **a propósito**. **n8n es el único disparador.** Los
workflows viven en `n8n/*.json`. Todo cron valida `validateCronSecret(request)`, acepta `?tenant=<slug>`
para un solo tenant, y sin ese parámetro recorre `getActiveTenants()` con `Promise.allSettled` (un
tenant que falle no debe tumbar a los demás). Copia el patrón de
`src/app/api/cron/reward-reminder/route.ts`, que es el más reciente y limpio.

**Sistema de caps de marketing** (`src/constants/rewards.ts`):
- `FREQUENCY_CAP_DAYS = 7` — mínimo entre mensajes de marketing por cliente (vía `customers.last_campaign_at`).
- `MONTHLY_MARKETING_CAP = 3` — máximo al mes, contado sobre `MONTHLY_CAP_SOURCES = ['manual', 'calendar', 'reactivation', 'reward_reminder']` con `filterByMonthlyCap()`.
- Cumpleaños y el recordatorio de premio están **exentos del cap de 7 días** pero **sujetos al mensual**.

### 8.2 Gotchas que te van a morder

| # | Trampa | Qué hacer |
|---|--------|-----------|
| 1 | **Twilio error 21665** — `sendTemplateMessage()` reintenta con **una variable menos** si la plantilla no tiene tantas. Degrada en silencio. | Nunca asumas que una variable llegó. Si añades `{{N}}`, el tenant con la plantilla vieja **no falla**: simplemente pierde esa variable. |
| 2 | **Saltos de línea en plantillas** — Twilio revienta (21656). `sendTemplateMessage()` convierte `\n` → `·` automáticamente. | No pelees con esto, ya está resuelto. |
| 3 | **`campaigns.type`** solo acepta `manual \| birthday \| reactivation`. `campaigns.source` acepta además `calendar` y `reward_reminder`. | Si creas un tipo de campaña nuevo, usa `getOrCreateTodayCampaign(type, template, tenantId, source)` — el 4º parámetro separa `source` de `type` sin tocar el CHECK. |
| 4 | **La próxima migración es la `00032`.** | No reutilices el 00031. |
| 5 | **RLS de tablas nuevas:** el patrón es `CREATE POLICY tenant_all_<tabla> ... USING (tenant_id = current_tenant_id() OR is_super_admin())`. Postgres **no** soporta `CREATE POLICY IF NOT EXISTS`. | Usa `DROP POLICY IF EXISTS` + `CREATE POLICY`. Copia `00031_reward_grants.sql`. |
| 6 | **El check-in del cliente es stateless en el navegador.** Cero `localStorage`, cero cookies. El cliente se identifica **solo por teléfono**. | Para el Bloque 3 ("no volver a mostrarle el pop-up al que ya reseñó"), la persistencia **tiene que ir en la DB** (columna en `customers` o tabla propia). `localStorage` no sirve: el cliente vuelve desde otro teléfono y se rompe. |
| 7 | **No hay sistema de analytics/eventos.** Ni PostHog, ni GA, ni tabla `events`. Lo más parecido es `message_logs`, que es solo de WhatsApp. | El tracking del click al link de Google (R6.a) hay que **construirlo desde cero**. |
| 8 | ~~`getPointsConfig()` no lee `shortfall_min`/`shortfall_max`~~ — **arreglado en el Bloque 2 (v2.4.0).** Ojo con lo otro: **la visita 1 otorga el bono de bienvenida, NO puntos de visita** (`awardWelcomeBonus`, no `awardVisitPoints`). | El bono es la palanca dominante del sistema de puntos. Ignorarlo hace que cualquier cuenta de "en cuántas visitas se gana el premio" salga mal — le pasó al análisis original de R5. |
| 9 | **Puede haber otra IA trabajando en el mismo árbol.** El 2026-07-11 había cambios sin commitear en `calendar.service.ts`, `whatsapp.service.ts`, `check-in/route.ts`, `PLANTILLAS.md`, `media.ts`. | **Stagea solo tus archivos por ruta explícita.** Nunca `git add -A` ni `git add .`. |

### 8.3 Bloque 2 — Calibrador de puntos y umbrales (✅ HECHO, v2.4.0)

**Cubrió:** R5 (§2) + hallazgo 3.3. Ver §5 para el detalle de lo construido. Lo que necesitas saber si
tocas el sistema de puntos:

- **El algoritmo ya no vive en `points.service.ts`.** Vive en **`src/lib/points-engine.ts`**, puro y sin
  I/O, porque lo importa también un componente de cliente (`PointsCalibrator.tsx`) que no puede arrastrar
  el SDK de Supabase al navegador. `points.service.ts` lo re-exporta para no romper imports.
- **`generateSmartVisitPoints()` cambió de firma:** ahora es
  `(currentPoints, nextThreshold, config: PointsEngineConfig, rng?)`. El `rng` inyectable es lo que
  permite simular con el **mismo código** que corre en producción (`rng = () => 0.5` → el cliente
  mediano). **No escribas nunca una segunda copia del algoritmo.**
- **`getPointsConfig()` ya lee `shortfall_min`/`shortfall_max`** (era el hallazgo 3.3) y devuelve un
  `PointsEngineConfig` completo, no `{min, max, welcomeBonusMin, welcomeBonusMax}`.
- **La visita 1 otorga el BONO DE BIENVENIDA, no puntos de visita.** Es la trampa que hizo que el
  análisis original de R5 tuviera la cuenta mal (ver la corrección en §2/R5). Si razonas sobre "en
  cuántas visitas se gana el premio" e ignoras el bono, te vas a equivocar.
- Cambiar los puntos **no** recalcula el historial. Los clientes que ya tienen puntos los conservan. La
  UI lo advierte.

### 8.4 Bloque 3 — Pop-up de reseñas de Google con tracking (⏳ después)

**Cubre:** R6, R6.a, R6.b, R6.c (§2) + hallazgos 3.6, 3.7, 3.8.

**Estado actual del código:**
- Hoy hay una **card inline** (no modal): `src/components/features/check-in/GoogleReviewCard.tsx`,
  montada en `CheckInSuccess.tsx` tras un `setTimeout` de 2.5s.
- `src/components/features/check-in/GoogleReviewPopup.tsx` **existe pero es código muerto** — cero
  referencias. Fue el modal viejo (el de la "X" en la esquina que la gente cerraba por reflejo). Se puede
  reescribir o borrar.
- **Ya existe un doc de diseño previo**: `docs/features/review-flow.md` propone una v1.5.0 con modal
  sticky. **Nunca se implementó.** Léelo, pero la fuente de verdad de lo que el dueño quiere ahora es
  R6 en §2 de este documento.
- El link de Google vive en `tenants.config.google_maps_url` → `useBranding().googleReviewUrl`. **Sin UI.**

**Lo que el dueño pidió, textual (R6):** modal **sin la "X"** (la gente la cerraba a los 2 segundos por
reflejo). Copy tipo *"gánate X por dejarnos una reseña en Google"*. **Dos botones**: uno de dejar reseña
que despliega los pasos (1. muéstrale la reseña al mesero · 2. redime tu regalo) y al final el link; y
otro que diga **"La próxima lo hago"** — para que no se sientan obligados. La recompensa X debe ser
**configurable en Ajustes**.

**Cómo encaja con el Bloque 1 (esto ahorra la mitad del trabajo):**

> La recompensa por reseña **no necesita infraestructura nueva**. Reutiliza el catálogo
> `campaign_rewards` y el motor `reward_grants`: dejar reseña llama a
> `grantReward({ grantType: 'campaign_prize', source: 'review', ... })` — el `source: 'review'` **ya
> está en el CHECK de la migración 00031**. El premio aparece solo en `/mesero/rewards`, el mesero lo
> entrega por el mismo camino que todo lo demás, y cae solo en las métricas de
> `/dashboard/redemptions` con su tasa de redención. **No toques la entrega, la atribución al mesero,
> el vencimiento ni las métricas: ya funcionan.**

**Lo que sí hay que construir:**

1. **Persistencia del estado del cliente** (R6.b). Nueva columna o tabla — recomendado: columnas en
   `customers` (`google_review_clicked_at`, `google_review_postponed_at`), porque el navegador es
   stateless (gotcha #6) y el cliente se identifica por teléfono. Migración `00032`.
   - Tocó "Dejar reseña" y fue al link → **nunca más** se le muestra.
   - Tocó "La próxima lo hago" → **sí** se le vuelve a mostrar.
2. **Tracking del click** (R6.a). Endpoint nuevo (ej. `POST /api/check-in/review-click`) que sella la
   columna y **otorga el grant**. Es lo que permite medir efectividad. No existe nada de analytics: hay
   que construirlo (gotcha #7).
3. **Pantalla de agradecimiento** al volver de Google (R6.c): *"Gracias por dejarnos tus comentarios, te
   esperamos de regreso"*.
4. **UI en Ajustes** para el link de Google (hallazgo 3.8, hoy solo por SQL) y para elegir la recompensa
   por reseña del catálogo `campaign_rewards`.

**Ojo con el diseño del modal:** el flujo público de check-in **no usa shadcn/Dialog**. Usa clases
propias definidas en `src/app/globals.css` (`.premium-card`, `.btn-premium`, `.premium-bg`) con estilos
inline para los gradientes de marca. Es un sistema visual paralelo al del dashboard. Respétalo — es el
Mandamiento VII.

### 8.5 Deuda conocida (no bloquea nada, pero está ahí)

| Deuda | Dónde |
|-------|-------|
| **El filtro de blackout de campañas manuales está muerto**: `getActiveBlackouts()` se consulta pero el predicado siempre devuelve `true`; `totalSkippedBlackout` es siempre 0. Se reporta como aplicado sin aplicarse. | `src/app/api/dashboard/campaigns/manual/route.ts:128-137` |
| **`GoogleReviewPopup.tsx` es código muerto** (cero referencias). | `src/components/features/check-in/GoogleReviewPopup.tsx` |
| **`reactivation_aggressive_reward_id` (legacy)** apunta a la tabla `rewards` vieja y no tiene UI. El Bloque 1 lo reemplazó por `aggressive_reward_id` (catálogo), pero **dejó el fallback vivo** para no romper tenants que lo tuvieran seteado a mano. Se puede retirar cuando se confirme que nadie lo usa. | `src/app/api/cron/reactivation/route.ts` |
| **`docs/01-project-overview.md` y `docs/02-architecture.md` no reflejan el estado multitenant.** `DB_SCHEMA.md` sí. | — |
| **14 errores de ESLint preexistentes** (`react-hooks/set-state-in-effect`) en `useDashboardAnalytics.ts` y `useStaffAuth.ts`. No los introdujo el Bloque 1. | — |

### 8.6 Reglas del proyecto que hay que cumplir (no son opcionales)

Están en `CLAUDE.md` y `METODO_AINNOVATE.md`. Las que más se olvidan:

1. **Documentar ANTES de codear.** Crea/actualiza `docs/features/[feature].md` antes de escribir código.
2. **Actualizar `CHANGELOG.md`** en cada request, citando el request original textual.
3. **Actualizar `docs/DB_SCHEMA.md`** si tocas la DB y `docs/API_DOCS.md` si tocas endpoints.
4. **Actualizar la tabla de lookup de `CLAUDE.md`** con los archivos nuevos.
5. **Nada hardcodeado**: credenciales en `.env`, config de negocio en `admin_settings`.
6. **TypeScript estricto, cero `any`.**
7. **Verificar antes de entregar**: `npx tsc --noEmit` y `npx next build`.
8. **Nunca `git add -A`** (gotcha #9).
