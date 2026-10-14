# Feature: Campañas — Control de Tráfico Centralizado

**Última actualización:** 2026-10-14 (ciclo, fase 2 parte C: **la vista por fecha, «Mandar un regalo» y el creador de eventos**; `/dashboard/calendar` redirige; `cycle_enabled` solo del operador también en el servidor; § «La vista por fecha y los creadores»); antes 2026-10-14 (ciclo, fase 2 parte B: **la pantalla «Ciclo» reemplaza a Automáticas, la tira y las burbujas**, § «La pantalla «Ciclo»»); antes 2026-10-13 (S-1: la pestaña «Premios» **salió de Campañas** y vive en Recompensas, § «Novedades v2.10.0»); antes 2026-10-13 (ciclo, fase 1B: **el cron decide y encola por marca** —ciclo apagado: el camino de siempre; encendido: los toques del ciclo—, migración 00071 sin aplicar, ciclo apagado en todas las marcas; § «El ciclo encendido»); antes 2026-10-11 (ciclo, fase 1A: la base del motor, migración 00070, **nada se envía**; § «Fase 1A»); antes 2026-10-10 (ciclo, fase 0.bis: tope de 3 intentos fallidos por toque, la causa real del fallo, lo que salió queda marcado aunque la corrida aborte); antes 2026-10-08 (fase 0: un fallo no calla, el insistente sale una vez, una sola escala de días)

> ⚠️ **El ciclo de recuperación, por marca (2026-10-13).** El cron de reactivación tiene DOS caminos y cada marca va por
> uno: con `cycle_enabled` apagado (las 25 hoy) hace exactamente lo de siempre —el suave y el insistente que describe este
> documento desde § «Objetivo»—; con el ciclo encendido (primero `demo-ventas`, después Don Alirio) decide los toques del
> ciclo y los encola: § «El ciclo encendido». Historia del rediseño: el recorrido de reactivación, las burbujas de riesgo y el
> calendario se reemplazan por **el ciclo de recuperación** (pipeline de 90 días con cinco toques, fatiga a las 6
> comunicaciones, dormido con un toque trimestral, «regalos que vencen», y campañas + calendario en una sola pantalla). El diseño,
> el diagnóstico y las fases están en `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`. **La fase 0 ya
> está (2026-10-08, sin migración):** un envío fallido ya no calla al cliente, el «insistente» sale UNA vez mientras el
> cliente no vuelva (antes se repetía cada ~30 días sin tope) y la pantalla usa una sola escala de días. La medición está en
> `SQL-PARA-CORRER/ciclo-fase-0/`. **La fase 0.bis (2026-10-10, sin migración)** le pone techo al reintento: un toque que
> falla 3 veces no se intenta más (§ «Tope de reintentos»). **La fase 1A (2026-10-11, migración 00070) construyó la
> base del motor sin enviar nada** (§ «Fase 1A»). **La fase 1B (2026-10-13, migración 00071) le dio los envíos**
> (§ «El ciclo encendido»). **La fase 2, parte B (2026-10-14) dibujó la pantalla** (§ «La pantalla «Ciclo»»): ya no
> muestra los días del camino viejo, sino las cajas del motor. **La parte C (2026-10-14) la completó** (§ «La vista por
> fecha y los creadores»): el calendario es la vista «por fecha» de esta pantalla y el botón principal es «Mandar un regalo».

### La pantalla «Ciclo» (fase 2, parte B, 2026-10-14)

`/dashboard/campaigns` es ahora **«Ciclo y campañas»**: dos pestañas, **Ciclo** (la que abre) e **Historial**.
«Mensaje libre (avanzado)» NO es una pestaña: es un botón de arriba que lleva al asistente manual de siempre
(`ManualCampaigns`) con su «Volver al ciclo»; ahí viven también el cupo de la línea (`CupoEnvioCard`, que salió de la
portada: la parte C lo lleva al creador de «Mandar un regalo») y el radar de segmentos (`SegmentRadar`). La vista se lee
de `?vista=` o del viejo `?tab=` con `window.location` + `useSyncExternalStore` (nunca `useSearchParams()`): `?tab=manuales`
abre el mensaje libre, `?tab=historial` el historial, `?tab=automaticas` y lo desconocido el ciclo, `?tab=premios`
redirige a Recompensas (S-1).

**Qué dibuja, de arriba abajo** (todo sale de `GET /api/dashboard/cycle/overview`, el MISMO motor que el cron;
componentes en `src/components/dashboard/cycle/`, lo puro —qué se muestra y qué no— en `src/lib/cycle-screen.ts`):

1. **El estado del ciclo y el ritmo** (`EstadoDelCiclo`). Con el ciclo APAGADO (la mayoría de las marcas) la pantalla
   igual muestra las cajas y lo dice en una línea. **El botón de encender/apagar lo ve y lo usa SOLO el operador de
   Cada1** (`permisos.interruptor`; pide confirmación y escribe `cycle_enabled` por el `PUT` de Ajustes). «Tus clientes
   vuelven cada mes · Calculado con 135 regresos» con «cambiar» (cuatro ritmos o «que lo calcule el sistema») solo con
   permiso de marca (`permisos.aprobar`). Desde la parte C no es solo la pantalla: el `PUT` de Ajustes le contesta 403 a
   quien no es el operador («Encender o apagar el ciclo lo hace el equipo de Cada1», `CLAVES_DEL_OPERADOR`).
2. **Primer uso** (`PrimerUso`, spec §6.0): regalo pequeño · regalo fuerte · «Regalo que vence», con barra, hasta que
   estén los tres. Ninguno bloquea el ciclo; los regalos llevan a Recompensas › Premios para regalar y la plantilla a
   Plantillas.
3. **«Para hoy»** (`ParaHoy`, §6.1): máximo tres tarjetas. OK no escribe nada (lo automático sale solo, A6; el navegador
   recuerda el OK solo por hoy) · Hoy no → `POST /api/dashboard/cycle/hoy-no` (solo con permiso de marca; si falla, la
   tarjeta no dice «listo») · Cambiar/Elegir regalo → Recompensas · Crear evento / Subir foto → abren aquí mismo (parte C)
   el creador de eventos con la fecha y el nombre puestos, o la ficha del evento para subirle la foto; el enlace
   (`/dashboard/campaigns?vista=fecha&fecha=…&nombre=…` / `&evento=<id>`) queda para abrir en otra pestaña.
4. **Tres números** (`NumerosDeArriba`, §6.3): volvieron por un mensaje (con «con mensaje X % · sin mensaje Y %» cuando
   hay grupo de control), en el ciclo · dormidos, próximo evento; debajo, la segunda visita (A12). **Ninguno es
   «enviados».**
5. **Las cajas** (`CajasDelCiclo`, §6.2): Recién vino, las etapas que existan para la marca y Dormidos, cada una partida en
   nuevos / ya volvieron, con «hoy entran», el regalo y el retorno con y sin mensaje. Tocar una abre la lista
   (`ListaDeCaja` → `GET …/cycle/customers`, de a 20 con «Ver más»). Debajo, **«Ver por día»** plegado: el histograma
   (`VerPorDia`, con `por_dia` de la portada), cuyo color de barra es la caja según los rangos que mandó el servidor.
   Los colores salen solo de `--brand-*` (`COLOR_DE_CAJA`): ningún hex.
6. **«¿Cómo decide el sistema?»** con el porcentaje REAL del grupo de control (con 0 % no afirma uno).

**Un fallo nunca es un cero.** Si la lectura falla (500, red caída o un 200 con otra forma) la pantalla dice «No pudimos
leer tu ciclo» con «Reintentar» y no dibuja un solo número; una relectura fallida conserva lo que ya se veía y avisa. Los
números que no se pudieron medir son «—» (`cantidad()`, `porcentaje()`), no «0». En modo demostración del panel no se lee
nada: el ciclo es de la marca real.

**Lo que se retiró** (spec §6.7, §7.6): las tarjetas «Automáticas» (cumpleaños y reactivación, con su «Ejecutar Ahora» y la
insignia «Activa», que no miraba la plantilla insistente), la tira «Ciclo de recuperación del cliente», los KPIs del mes
(«mensajes enviados» incluido) y `AtRiskBubbles` de Campañas. `POST /api/dashboard/campaigns/run-auto` sigue existiendo
pero ya no tiene botón. **Se conservan a propósito:** `AtRiskBubbles.tsx` en `/demo` (pública, sin sesión: no hay ciclo
que leer) y `RISK_LEVELS` / `deriveCycleBands()` / `deriveRiskLevels()`, que siguen en uso (`getFullAnalytics()`, la demo,
`ManualCampaigns` y su test). El panel principal (`/dashboard`) trae el **mini-ciclo** (`MiniCiclo`: las mismas cajas sin
detalle, `overview?mini=1`, con enlace a esta pantalla; es de la marca entera).

**Deuda anotada:** `SegmentRadar` y `ManualCampaigns` siguen con la escala vieja
(17 · 21 · 25 días) y `SegmentRadar` ante un fallo del endpoint muestra «NaN clientes» y ceros (`docs/PENDIENTES.md` §5).
Tests: `tests/unit/cycle-pantalla-b.test.ts` (lo puro) y `tests/unit/cycle-pantalla-b-render.test.ts` (los componentes a
HTML, «error ⇒ ningún número», quién ve qué, lo retirado).

### La vista por fecha y los creadores (fase 2, parte C, 2026-10-14)

Arriba de la pantalla: **«Por etapa | Por fecha»** y el botón principal **«🎁 Mandar un regalo»** (solo con permiso de
marca). Todo vive en la pestaña «Ciclo»; la vista por fecha entra como `?vista=fecha` (`vistaDeUrl()`) y
**`/dashboard/calendar` redirige** ahí con `fecha`, `nombre` y `evento` (`destinoDelCalendario()`), así que el menú, los
favoritos y los botones viejos siguen sirviendo. La URL se lee con `useSyncExternalStore`, nunca `useSearchParams()`.

1. **La vista por fecha** (`VistaPorFecha`, spec §6.4): el mes en cuadrícula (lunes a domingo) con, en cada día, los
   eventos (●), las fechas especiales (borde punteado) y la proyección («23 → rescate», `GET …/cycle/projection`, el
   motor del cron). Los días antes de un evento llevan la sombra **«reservado para el evento»** (el blackout, rayas de
   `--brand-primary`). Tocar un día: quiénes entran (nuevos / ya volvieron, «Ver quiénes» → `customers?fecha=`), los
   eventos de ese día (su ficha, con «Subir foto» si no tiene) y **«Crear aquí»** (no en un día que pasó). En el celular
   cada día muestra el número, el punto del evento y cuántos entran; el detalle va debajo.
2. **«Mandar un regalo»** (`MandarRegalo`, spec §6.5): regalo (del catálogo de Recompensas, o «Escribir otro…» y queda en
   el catálogo) · hasta cuándo («Este domingo …» por defecto, 3/7/14 días) · a quién (las cajas, Dormidos, Todos, con el
   **conteo vivo** de quiénes lo reciben y por qué no el resto: regalo vivo, 7 días, tope del mes; «Recién vino» no se
   ofrece) · cuándo (a la hora de la marca, o una fecha). **El cupo vive aquí:** «Hoy puedes mandar 180. Si son más, el
   resto sale en los días siguientes» (`getLineBudget()`). Vista previa del WhatsApp real (el cuerpo del catálogo con la
   marca), con el adaptador dicho en pantalla. Abre también desde la lista de una caja («Mandarles un regalo»).
   **Cómo funciona por dentro:** `POST /api/dashboard/cycle/gift` crea una campaña `source = 'manual'` (fatiga y tope del
   mes como un envío manual) con el regalo en `campaigns.filters.regalo` y encola a la hora de la marca; **el regalo se
   otorga y se fecha AL ENVIAR** (el drenador: `send-governance.md` § «Los regalos del dueño en el drenador»), con el
   MISMO adaptador que el ciclo («Regalo que vence» aprobada, o la insistente). Un regalo vivo por cliente: ni se programa
   ni sale si ya tiene uno, y el ciclo no le apila el suyo encima. No pasa por la Recovery Zone del camino viejo.
3. **«Crear un evento»** (`CrearEvento`, reemplaza a `EventCreateDialog`): nombre · fecha · foto (`MediaUploader`) ·
   **texto sugerido ya escrito y editable** (en una línea: `{{5}}` no admite saltos) · enlace opcional · **«Incluir a los
   dormidos»** (solo con el ciclo encendido, apagada por defecto: `restaurant_events.include_dormant`, 00073). La
   invitación sale el día del evento a la hora de la marca, con la plantilla de evento de siempre. Vista previa idéntica a
   la invitación. Sin foto se guarda igual y «Para hoy» avisa.
4. **«Mensaje libre (avanzado)»** sigue siendo el asistente manual de siempre (`ManualCampaigns`), desde el encabezado y
   desde el creador («También puedes: …»). El cupo grande (`CupoEnvioCard`) se quedó ahí también: es otro lugar donde se
   dispara un envío a mano.

Tests: `tests/unit/cycle-pantalla-c.test.ts` (lo puro), `tests/unit/cycle-pantalla-c-render.test.ts` (los componentes a
HTML), `tests/db/cycle-regalo.test.ts` (ruta, drenador y cron reales sobre Postgres), `tests/unit/blackout-y-audiencia.test.ts`
y `tests/unit/settings-cycle-enabled.test.ts`.

### El ciclo encendido (fase 1B, 2026-10-13): el cron decide y encola, el drenador envía

El mismo cron (`/api/cron/reactivation`, 15:00 de Bogotá, `vercel.json` intacto) decide marca por marca con
`normalizeCycleSettings()`:

| La marca tiene… | Qué hace el cron |
|---|---|
| `cycle_enabled` apagado (default) | El camino de siempre (`processTenant()`), sin cambiar una línea de su comportamiento. Si quedó una fecha de encendido (`cycle_enabled_at`), la borra |
| `cycle_enabled = true` | El camino nuevo (`ejecutarCicloDeLaMarca()`, `src/services/cycle.service.ts`). **El viejo NO corre**: si corrieran los dos, el cliente recibiría la suave de siempre y el toque del ciclo |
| `?dry=1` (cualquier marca) | El camino nuevo como si se encendiera hoy: las mismas decisiones, **cero escrituras y cero envíos**. Es lo que se mira antes de encender |

**El camino nuevo, por marca, en este orden:**

1. **El encendido se anota solo.** La primera corrida que ve la marca encendida guarda `cycle_enabled_at` (clave del
   SISTEMA: el `PUT` del panel no la acepta, `settings-keys.ts`). Dos reglas desde esa fecha: **(1) nada atrasado** —un
   toque solo sale si su día (`cycle_started_at` + el día de la etapa, en días de Bogotá) es igual o posterior al
   encendido; el que ya está entre dos etapas espera la siguiente— y **(2) quien ya pasó la despedida** de su ritmo se
   duerme (`dormido`, `dormant_since = now()`), sin mensaje.
2. **Antes de decidir:** `expireGrants()` (un regalo vencido que sigue `active` bloquearía uno nuevo) y la reconciliación
   de toques (`cycle_reconcile_touches()`, H6).
3. **El ritmo:** el de la marca (`cycle_brand_rhythm_stats()` + `brandRhythm()`) y el de cada cliente
   (`effectiveRhythm(customers.cycle_rhythm, marca)`); la etapa la dice `resolveStage()`. Toda la regla del día vive en
   `src/lib/cycle-touch.ts` (puro): `decidirCliente()` y `resolverToque()`.
4. **Por cliente activo** (`accepts_marketing`, sin opt-out, paginado de a 1.000): se crea el toque de su etapa si no
   tiene fila en este ciclo y pasa la regla (1); `t1` se salta con 5 visitas o más; los toques de etapas anteriores que
   seguían abiertos quedan `cancelled` («la etapa ya pasó»); un `deferred` cuya fecha llegó, un `pending` (encolado que
   falló a medias) y un `failed` con menos de 3 intentos se retoman. **Dormidos:** el trimestral a los `dormant_since` +
   90 × n días (máximo 2, con `cycle_heartbeat_enabled`); con los dos y 90 días desde el segundo, `archivado`, sin
   mensaje. Una despedida que no va a salir (grupo de control, cancelada, 3 fallos) también duerme al cliente.
5. **El regalo:** `t2` el pequeño (el primero válido de `cycle_small_reward_ids`) · `t4` el fuerte
   (`cycle_strong_reward_id`, que cae a `aggressive_reward_id`), o el pequeño si el cooldown de 180 días no lo deja · el
   trimestral, el 1 pequeño y el 2 fuerte. Solo premios activos de ESA marca. Sin regalo configurado, el toque sale igual.
6. **La plantilla (el adaptador):** con regalo, «Regalo que vence» si está APROBADA en esa marca (Zernio y la marca demo:
   el puntero alcanza; Twilio: `isTwilioTemplateApproved()`, una vez por corrida); si no, la insistente con el regalo en
   `{{4}}` y la fecha en `{{5}}`. `t1` → la suave sin oferta · `t3` → la cruzada según `source_channels` · `t5` y un toque
   sin regalo → la insistente sin `{{4}}`/`{{5}}`. **Nunca** las legacy (`reactivation_with_reward_template_sid`,
   `reactivation_template_sid`): esas solo las lee el camino viejo. Etapa sin plantilla → no se crea el toque y la
   respuesta lo cuenta (`saltados.sin_plantilla`).
7. **Por cada toque, en este orden:** blackout de un evento de su audiencia (`getActiveBlackouts()` +
   `findCustomersForEvent()`, la MISMA audiencia que recibirá la invitación) → `deferred` hasta el día siguiente al
   evento · grupo de control (`isHoldout()`, 10 % desde 200 clientes) → `holdout`, sin envío, con su `due_at` · cap de 7
   días a la hora real del envío → `deferred` a `last_campaign_at + 7` · tope de 3 al mes → `deferred` al día 1 del mes
   siguiente · el resto: `INSERT … ON CONFLICT DO NOTHING` y, **solo si insertó**, a la cola con su `cycle_touch_id`,
   `not_before` = la PRÓXIMA hora de la marca (`cycle_send_slot`: la cena, 16:30, sale hoy; el almuerzo, 10:30, ya pasó a
   las 15:00 y sale mañana, H3) y `expires_at` = el cierre del día siguiente. Sede NULL (D12). La campaña del día
   (`source = 'reactivation'`, la pieza `cycle_touch` del motor de piezas) se crea solo si hay algo que encolar.
8. **Nada se envía desde el cron.** La respuesta trae por marca: `por_etapa`, `en_control`, `pospuestos` (evento, siete
   días, tope del mes), `saltados`, `dormidos_por_encendido`, `dormidos_tras_la_despedida`, `archivados`,
   `cancelados_etapa_pasada`, `reconciliados`, `encolados_en_la_cola`; con `?dry=1`, además, hasta 10 `ejemplos`.

**El drenador** envía a la hora de la marca, pone «vence el domingo» en ese momento y otorga el regalo solo si el mensaje
salió: `send-governance.md` § «Los toques del ciclo en el drenador». **El tope de 3 al mes** se corta ahora por mes de
Bogotá (`getMonthBoundaries()`, N-MES). Paso a paso del dueño: `SQL-PARA-CORRER/ciclo-fase-1b/LEEME.md`. Tests:
`tests/unit/cycle-gift.test.ts` y `tests/db/cycle-envios.test.ts` (el cron y el drenador reales contra Postgres).

### Fase 1A (2026-10-11): la base del motor, sin envíos

Lo que agrega (detalle en `docs/features/ritmo-adaptativo.md` §7 y `docs/DB_SCHEMA.md`):

- **La base lleva la cuenta del ciclo** (00070): en qué ciclo está cada cliente, desde cuándo, su ritmo personal y
  cuántos mensajes de marketing lleva sin volver. **Todo `campaign_messages` que se inserta como `sent`/`delivered`
  pasa por el trigger `on_campaign_message_sent`**: si la campaña es `manual`, `calendar` o `reactivation` (por
  `campaigns.source`, nunca por `type`), suma uno; al sexto el cliente pasa a `dormido`. El recordatorio de premio y el
  cumpleaños no cuentan. Desde la 1B lo lee el cron del ciclo en las marcas encendidas; en las apagadas, los crons de
  este documento siguen decidiendo exactamente igual.
- **El motor de piezas** (`src/lib/communications/registry.ts`): cada comunicación de este documento (reactivación,
  cumpleaños, recordatorio, evento, manual, Golden Bullet) declarada con sus reglas: si cansa, si cuenta para el tope de
  3, si está exenta de los 7 días, si pausa el toque. Un test exige que diga lo mismo que `MONTHLY_CAP_SOURCES`, los
  exentos del drenador, `message_class_map` y el trigger. Desde la 1B el cron del ciclo y el drenador le leen a la pieza
  `cycle_touch` con qué tipo y fuente se graba y qué topes le aplican.
- **Los ajustes** `cycle_*` en la lista cerrada del PUT, con el ciclo **apagado** en todas las marcas.

Lo que la 1A no cambió (y la 1B solo para las marcas encendidas): los crons, el drenador, las plantillas. Ninguna
pantalla cambia todavía: `deriveCycleBands()` sigue siendo la escala de las pantallas hasta la fase 2 (la reemplazará
`bandsFromConfig()`).

---

## Novedades v2.10.0 (2026-10-13) — los premios ya no viven en Campañas (S-1)

- **La pestaña «Premios» salió de Campañas** (decisión A7 del dueño) y es ahora **Recompensas › Premios para regalar**
  (`/dashboard/rewards?tab=premios`). Campañas queda con Automáticas · Manuales · Historial. Los enlaces viejos siguen
  sirviendo: `/dashboard/campaigns?tab=premios` y `/dashboard/campaign-rewards` llevan a la pestaña nueva.
- **Qué premio regala cada campaña ya no se elige en Ajustes** (decisión C1): el regalo de la reactivación insistente (y
  del rescate del ciclo), el regalo pequeño del ciclo y el premio de la reseña se eligen en esa misma pestaña, arriba del
  catálogo. Ajustes deja una tarjeta que lleva allá. Detalle y claves: [`reward-grants.md`](reward-grants.md) § «Dónde vive
  cada premio».
- La tarjeta «Activa» de la reactivación en esta pantalla **sigue sin mirar** el premio de la insistente
  (`aggressive_reward_id`): la reemplaza la fase 2 del ciclo, no se arregló acá.

## Novedades v2.9.0 (2026-09-08)

> _Desde el 2026-10-13 la pestaña «Premios» vive en Recompensas (v2.10.0); lo que sigue es la historia._

- **Pestaña "Premios"** en `/dashboard/campaigns`: el catálogo de premios de campaña (crear,
  listar, retirar/reactivar) que antes vivía en la página propia `/dashboard/campaign-rewards`
  ahora es una pestaña más, junto a Automáticas / Manuales / Historial. El componente se extrajo a
  `src/components/dashboard/CampaignRewardsCatalog.tsx` (mismo comportamiento, misma API
  `/api/dashboard/campaign-rewards`). `/dashboard/campaign-rewards` sigue existiendo pero ahora solo
  redirige a `/dashboard/campaigns?tab=premios` (`redirect()` de `next/navigation`), así que
  cualquier enlace viejo guardado sigue funcionando. La pestaña se preselecciona leyendo
  `window.location.search` en un `useEffect` — no `useSearchParams()`, que fuerza el CSR bailout en
  esta versión de Next.

## Novedades v2.8.0 (2026-08-10)

- **Filtro por días sin venir** en campañas manuales: `filters.minDays` (última visita hace N días o
  más) y `filters.maxDays` (hace M días o menos, día M completo incluido). Aplican en
  `estimate/route.ts` y `manual/route.ts` con el mismo criterio; ambos excluyen clientes sin
  `last_visit_at`. UI: dos inputs nuevos en `ManualCampaigns.tsx` + preset "Rescatar Perdidos" (26+
  días, justo después de la Recovery Zone).
- **Burbujas de riesgo con envío real** (`AtRiskBubbles.tsx`): antes el botón apuntaba a
  `/api/dashboard/campaigns/quick` (endpoint inexistente → 404 silencioso). Ahora el diálogo pide una
  plantilla aprobada, muestra los elegibles reales del día (estimador con el rango de días del nivel;
  hasta el 2026-10-08 Alerta 7-10, En riesgo 11-15, Crítico 16-21, Perdido 22+; desde entonces las
  bandas del ciclo, ver § «Una sola escala de días») y envía por
  `/api/dashboard/campaigns/manual`, respetando frequency cap, recovery zone, cap mensual y saldo.
- **`POST /api/dashboard/campaigns/run-auto`**: puente autenticado para "Ejecutar Ahora" (los crons
  exigen `CRON_SECRET`, que el navegador no conoce; antes el botón recibía 401 y la UI fingía éxito).
  El diálogo del dashboard ahora muestra enviados/fallidos/audiencia o el error real.
- **Paridad estimador ↔ envío**: el estimador ahora aplica también el filtro de canal
  (`source_channels`) y el envío manual excluye opt-outs en la query (antes se contaban como fallidos).
- **Ciclo de recuperación del cliente**: strip visual de 5 etapas en Campañas → Automáticas
  (Visita → Protegido 1-6d → Ventana manual 7-17d → Recuperación automática 18-25d → Rescate 26+d).
  Desde el 2026-09-06 las bandas se derivan de los días configurados por el tenant: los números de
  arriba son los que salen con los defaults (21 / 25). Hasta el 2026-10-08 decía «Protegido 1-7d» y
  el día 7 caía en dos cajas.

---

## Nota de infraestructura (v1.4.1 — 2026-07-05) — ⚠️ superada el 2026-09-02, ver abajo

`/api/cron/birthday` y `/api/cron/reactivation` (lógica de negocio sin cambios, ver más abajo)
eran invocados EN PARALELO por dos disparadores: el cron nativo de Vercel (`vercel.json`) y un
workflow n8n del mismo nombre. El código ya los des-duplicaba vía `hasRecentCampaignMessage()`
(el cliente final nunca recibió mensajes repetidos), pero se decidió dejar **n8n como único
disparador** para simplificar operación y eliminar el riesgo latente de carrera. `vercel.json`
quedó con `"crons": []`. Detalle completo → `docs/04-deployment.md` §2 y §5.

## Nota de infraestructura (2026-09-02) — la vuelta atrás

La decisión de julio se revierte: los **5 crons vuelven a `vercel.json`** (`birthday` a las
`0 13 * * *`, `reactivation` a las `0 15 * * *`, más `reward-reminder`, `calendar-dispatch` y
`queue-drain`). Las cadencias son un calco 1:1 de las que ya tenían los Schedule Trigger de n8n:
**cero cambio de horario y cero cambio de código de negocio** — los endpoints ya exportaban `GET`
y Vercel Cron manda exactamente el `Authorization: Bearer $CRON_SECRET` que valida
`validateCronSecret()`.

**Por qué se revierte** (§25.1 de requerimientos): n8n es un punto único de fallo sin alarma —
si el VPS se cae se detienen cumpleaños, reactivación, recordatorios, calendario y la cola de
goteo, y nadie se entera; el de cumpleaños ni siquiera es recuperable. Y el plan **Hobby de
Vercel prohíbe el uso comercial**, que es exactamente lo que este producto hace.

**Estado real:** el commit es local y sin push. Hoy el disparador vivo **sigue siendo n8n**; el
disparo por Vercel empieza al desplegar a producción con plan Pro activo.

> **La lección de julio no se tira, se convierte en regla:** por cada entrada que se agrega a
> `vercel.json` se apaga su Schedule Trigger en n8n **en el mismo movimiento**, y se comprueba en
> la UI de n8n. Los dos encendidos a la vez = doble disparo. Y ojo: `hasRecentCampaignMessage()`
> protege a `birthday` y `reactivation`, pero `calendar-dispatch` no tiene equivalente.

---

## Objetivo

Coordinar el envío de mensajes entre campañas automáticas (cumpleaños, reactivación) y manuales (masivas) para evitar que un cliente reciba múltiples mensajes en periodos cortos, preservando la experiencia y la efectividad del flujo de fidelización.

---

## Arquitectura: Tres Reglas de Validación

### Regla 1 — Master Cap Global (7 días)

**Campo:** `customers.last_campaign_at` (timestamptz)

**Principio:** Ningún cliente puede recibir un mensaje (manual ni automático) si fue contactado hace menos de `FREQUENCY_CAP_DAYS` días.

**Implementación:**
- `findInactiveCustomers()` filtra por `last_campaign_at IS NULL OR last_campaign_at < now - 7d`
- `manual/route.ts` filtra en JS post-query con el mismo criterio
- `estimate/route.ts` aplica el mismo filtro en la query SQL (count exacto)
- **Todo envío exitoso** actualiza `customers.last_campaign_at` via `updateCustomerLastCampaignAt()`

---

### Regla 2 — Jerarquía de Mensajes / Zona de Recuperación

**Principio:** Los clientes dentro de la ventana de recuperación están en el radar del cron de reactivación. Las campañas manuales los excluyen automáticamente para no interrumpir ese flujo personalizado de mayor conversión.

**La ventana NO es fija (desde 2026-09-06).** Se DERIVA por tenant de los días de reactivación que el dueño configuró en Ajustes, vía `getRecoveryZoneConfig(tenantId)` → `deriveRecoveryZone(soft, aggressive)`:

```
startDays = max(FREQUENCY_CAP_DAYS, soft - RECOVERY_ZONE_LEAD_DAYS)   // lead = 3
endDays   = max(aggressive, startDays)
```

Con los defaults (21 / 25) da exactamente **18-25**, los mismos valores fijos de antes: ningún tenant que no haya tocado sus días cambia de comportamiento. Pero si baja el toque suave a 15, la zona baja a **12-20** con él. Antes no se movía, y los días 15-17 quedaban sin proteger: una campaña manual podía pisarle el mensaje al cron el mismo día del toque.

**Zona de Recuperación:** `last_visit_at < now - startDays AND last_visit_at >= now - endDays`

**Implementación** (los cuatro sitios leen la MISMA ventana del tenant; si divergen, el panel miente sobre lo que se envía):
- `manual/route.ts` excluye clientes en la zona de recuperación y reporta `totalSkippedRecoveryZone`
- `estimate/route.ts` aplica el mismo filtro para que el estimado sea exacto
- `queue-drain/route.ts` la re-evalúa al momento del envío (el cliente pudo volver mientras esperaba en la cola)
- `segments/route.ts` la usa para los conteos del radar de segmentos
- Los crons automáticos NO aplican esta restricción (ellos son la razón de la zona)

---

### Regla 3 — Reset por Interacción (ya existente)

**Principio:** Si un cliente hace check-in o pide domicilio, `last_visit_at` se actualiza y lo excluye automáticamente del cron de reactivación.

**Implementación:** Ya funciona. `findInactiveCustomers()` filtra `last_visit_at < now - suave` (los días del suave de la marca; 21 por defecto), por lo que cualquier visita reciente los saca del pool automáticamente. Y como el tope del insistente se cuenta **desde la última visita**, quien vuelve empieza un recorrido nuevo con su suave y su insistente.

---

## Flujo de Toma de Decisiones (por tipo de campaña)

### Cron Reactivación (`/api/cron/reactivation`) — el camino de las marcas con el ciclo APAGADO

Corre todos los días a las **20:00 UTC = 15:00 Bogotá** (`vercel.json`). «Ejecutar ahora» llama a esta
misma ruta (`/api/dashboard/campaigns/run-auto`), así que obedece las mismas reglas. Lo que sigue es lo que hace con una
marca **con el ciclo apagado**; con el ciclo encendido, § «El ciclo encendido».

```
getReactivationDaysConfig()            → { suave, insistente }   (21 / 25 por defecto)
findInactiveCustomers(suave)
  → last_visit_at < suave días atrás, accepts_marketing, sin opt-out
  → last_campaign_at IS NULL OR < 7 días atrás          [cap de frecuencia]
Se parten en dos por last_visit_at:
  menos de `insistente` días → PASS 1 (suave)
  más de `insistente` días   → PASS 2 (insistente)
filterByMonthlyCap()                                    [3 al mes, en cada pass]

PASS 1 — suave, por cliente:
  → hasRecentCampaignMessage(type=reactivation, 30d)    [dedup: solo lo que SALIÓ]
  → agotoLosIntentosDelSuave()                          [3 fallidos en este ciclo → no más]
  → sendTemplateMessage() → recordCampaignMessage()     [si falló: causaDelFallo()]

PASS 2 — insistente, por cliente (solo si hay plantilla insistente):
  → yaRecibioElInsistente(last_visit_at, insistente)    [UNA vez mientras no vuelva]
  → agotoLosIntentosDelInsistente()                     [3 fallidos → no más hasta que vuelva]
  → sendTemplateMessage() → recordCampaignMessage() → grantReward() si hay premio

En un finally (aunque la corrida aborte): updateCustomerLastCampaignAt(enviados)
Si terminó bien: finalizeCampaign()
```

**El insistente sale una sola vez mientras el cliente no vuelva** (N4, 2026-10-08). Antes el PASS 2 usaba
la misma dedup de 30 días que el suave: contaba el suave (el insistente salía al día ~51 en vez del 25) y
después lo dejaba repetirse cada ~30 días **para siempre**, con su premio y su recordatorio. Como suave e
insistente comparten `campaigns.type` y `message_type` (`'reactivation'`), `yaRecibioElInsistente()` los
distingue por **cuándo** salieron: un mensaje de reactivación que salió después de
`last_visit_at + insistente` días solo puede ser el insistente, porque el suave solo sale antes. Filtra
`campaigns.source = 'reactivation'` para no contar el recordatorio de premio (que es `type =
'reactivation'` con `source = 'reward_reminder'`). Si la marca sube sus días de insistente después de un
envío, un insistente viejo puede quedar por debajo del umbral nuevo y salir **uno** más: es el borde
aceptado hasta la fase 1, que guarda cada toque con su etapa.

**El día real del insistente.** El cap de 7 días separa los dos toques: quien recibió el suave al día 21
recibe el insistente al día 28 o 29, no al 25. Por eso la pantalla dice «insistente al día 25, una sola
vez (y nunca a menos de 7 días del suave)».

**Un fallo no calla** (N3, 2026-10-08). Las dos dedups cuentan solo `status IN ('sent','delivered')`
(`ESTADOS_QUE_SALIERON`). Los crons graban el envío fallido con `sent_at`, y antes eso bastaba para
callar al cliente 30 días (reactivación) o 360 (cumpleaños). Un fallo de base en cualquiera de las dos
**lanza** (log `[Campaign][FALLO]`): la marca sale con `ok: false` en la respuesta del cron, en vez de
volver a escribirle a quien ya recibió el mensaje.

### Cron Cumpleaños (`/api/cron/birthday`)

Corre todos los días a las **18:00 UTC = 13:00 Bogotá** (`vercel.json`).

**El saludo sale hasta DOS DÍAS ANTES del cumpleaños** (dueño, 2026-09-24) — **pero solo con la
plantilla que lo dice bien** (2026-10-04). El texto aprobado de siempre dice «¡Feliz cumpleaños!», y
mandarlo dos días antes es decirlo mal. Por eso son dos plantillas y el cron elige por marca
(`elegirPlantillaDeCumpleanos()`, `src/services/campaign.service.ts`):

| La marca tiene… | Plantilla | A quién saluda |
|---|---|---|
| `birthday_upcoming_template_sid` **aprobada** | «Cumpleaños — dos días antes» | quien cumple entre hoy y dentro de `BIRTHDAY_LEAD_DAYS` (= 2) días |
| solo `birthday_template_sid` (o la nueva en revisión) | «¡Feliz cumpleaños!» | quien cumple hoy, como siempre |
| ninguna | — | nadie (`ok: false` con el motivo) |

En Zernio el puntero solo existe aprobado. En Twilio se escribe al crear la plantilla, así que el cron
le pregunta a Twilio (`isTwilioTemplateApproved()`); ante la duda, usa la vieja. **El cambio es solo**:
el día que Meta aprueba la nueva, esa marca pasa a saludar dos días antes.

**Una ventana, no un día exacto.** Con «hoy + 2» exacto, el día del cambio se quedaba sin saludo quien
cumplía mañana o pasado. Con la ventana `[hoy, hoy+2]` ese día entran los tres y cada uno recibe un
saludo; después, cada cliente entra a la ventana dos días antes y la dedup impide repetirlo. Si el cron
falla un día, al siguiente igual saluda.

```
elegirPlantillaDeCumpleanos()        → { sid, diasDeAnticipacion: 2 | 0 }
findBirthdayCustomers(diasDeAnticipacion)
  → cumpleaños (mes-día) entre hoy y hoy + diasDeAnticipacion
  → accepts_marketing = true, sin opt-out, paginado de a 1.000
  (NO aplica frequency cap — cumpleaños tiene prioridad absoluta)

Por cada cliente:
  → hasRecentCampaignMessage(type=birthday, BIRTHDAY_DEDUPE_DAYS = 360d)   [dedup anual, solo lo que SALIÓ]
  → agotoLosIntentosDelCumpleanos()                                       [3 fallidos de este cumpleaños → no más]
  → sendTemplateMessage()
  → recordCampaignMessage()                                               [si falló: causaDelFallo()]

En un finally (aunque la corrida aborte):
  → updateCustomerLastCampaignAt(sentCustomerIds)
  → respuesta por marca con `plantilla: 'se_acerca' | 'el_dia'` y `skipped_retry_cap`
```

### Tope de reintentos y la causa real del fallo (fase 0.bis, 2026-10-10)

La fase 0 hizo que un fallido dejara de contar como enviado, así que se reintenta en la corrida siguiente.
Sin techo, un número que falla siempre, o una línea muerta (la de Twilio de Sushi Service hacia el 12-10),
recibía un intento **todos los días**: el fallo no toca `last_campaign_at` y el tope mensual solo cuenta
los `sent`. Ahora cada toque admite **`MAX_INTENTOS_FALLIDOS_POR_TOQUE` = 3** fallidos
(`src/constants/rewards.ts`; tres, como el drenador de `send_queue`). Se cuenta cualquier fallo, sin
importar la causa, y los fallidos viejos (los de antes de este arreglo) cuentan:

| Toque | Función | Cuenta los `failed` de… |
|---|---|---|
| Suave | `agotoLosIntentosDelSuave()` | reactivación (`source='reactivation'`) desde `last_visit_at + suave` |
| Insistente | `agotoLosIntentosDelInsistente()` | reactivación desde `last_visit_at + insistente`; no se intenta más hasta que el cliente vuelva |
| Cumpleaños | `agotoLosIntentosDelCumpleanos()` | cumpleaños en los últimos `BIRTHDAY_DEDUPE_DAYS` (este cumpleaños, no el del año pasado) |
| Recordatorio de premio | `agotoLosIntentosDelRecordatorio()` | `source='reward_reminder'` desde que el premio entró en su ventana de aviso (`expires_at − reward_reminder_days_before`) |

Si el cliente vuelve, `last_visit_at` se mueve y la cuenta empieza de cero. Un fallo de base al contar
**lanza** (`[Campaign][FALLO] reason=tope_de_reintentos_error`). Cada cron devuelve `skipped_retry_cap`
por marca. Con `BIRTHDAY_LEAD_DAYS = 2` el cron ve a un cumpleañero tres días, así que el techo del
cumpleaños casi nunca se toca: es la guarda para el día que la anticipación crezca. `campaign_messages`
no guarda el premio: con dos premios del mismo cliente venciendo a la vez, sus fallos se suman.

**Antes del tope, la plantilla tiene que estar aprobada (PL-2-a, 2026-10-12).** En Twilio el puntero se
escribe al CREAR la plantilla, con Meta todavía revisándola (24-72 h). Sin esta guarda, el recordatorio de
premio intentaba cada día de revisión, Meta rechazaba, cada rechazo contaba como fallido y al tercero ese
premio se quedaba **sin recordatorio para siempre**, aunque la plantilla se aprobara al día siguiente. Ahora
el cron `reward-reminder` le pregunta a Twilio (`isTwilioTemplateApproved()`, una vez por corrida y solo si
hay premios por avisar): si no está aprobada, o Twilio no contesta, ese día **no se intenta, no se graba nada**
(ni campaña ni fallidos) y queda un `console.warn` con la marca, la plantilla y el motivo; la respuesta trae
`skipped_template_pending`. Zernio (su puntero solo existe aprobado) y la marca demo (su envío es simulado)
no preguntan.

**La causa real** (`campaign_messages.error_message`). Los tres crons grababan «Twilio no configurado o
error de envío» para todo fallo, también en las marcas de Zernio (Planeta Wings, 5 y 6 de octubre).
`sendTemplateMessage()` devuelve `null` para todo modo de fallo pero deja la causa en `message_logs`;
`causaDelFallo()` la lee de ahí (la fila `failed` más reciente de ese cliente y esa plantilla) y graba
`proveedor · código · mensaje`, por ejemplo `twilio · 63016 · …`, `zernio · 400 · …`,
`twilio · opted_out_local · …` o el código del cupo de la línea. Si no hay fila, al menos el proveedor
real. No se tocó el contrato de `sendTemplateMessage()`.

**Lo que salió queda marcado aunque la corrida aborte.** Las dedups lanzan ante un fallo de base y
abortan la marca. Antes eso se llevaba por delante `updateCustomerLastCampaignAt()` (reactivación y
cumpleaños) y `markReminderSent()` (recordatorio): a los que ya habían recibido no se les marcaba, y una
campaña manual podía escribirles dentro de los 7 días, o el recordatorio se repetía al día siguiente.
Ahora van en un `finally`, el cliente se anota en cuanto el envío sale (antes de grabarlo) y el error
sigue su camino. Un envío que **salió** pero no se pudo grabar ya no se graba como `failed`: aborta la
marca en vez de seguir mandando sin dejar rastro.

### Un fallo de base no es «nadie» (ola P1-a, 2026-10-11)

- **Tope de 3 al mes** (`getCustomersAtMonthlyCap()`, N7). Metía todos los uuid en UN `.in()` (con
  miles, la URL revienta) y ante un error devolvía «nadie llegó al tope» con un `console.error` suelto:
  el tope se dejaba de aplicar justo con las marcas grandes. Ahora va en lotes de
  `LOTE_DEL_TOPE_MENSUAL` = 150, cada lote paginado de a 1.000, cuenta los que salieron
  (`ESTADOS_QUE_SALIERON`) y un error **lanza** (`[MonthlyCap][FALLO] reason=monthly_cap_error`). Qué
  pasa entonces: reactivación y recordatorio abortan esa marca (las demás siguen, `allSettled`); la
  campaña manual responde 500; el evento del calendario queda `failed` con el motivo; el drenador
  devuelve la tanda a la cola con backoff (`send-governance.md`). Nadie recibe un cuarto mensaje por un
  timeout.
- **`findInactiveCustomers()`** pagina de a 1.000 (`leerTodo()`, orden por `id`): con más de mil
  inactivos, PostgREST cortaba en silencio y el resto no entraba nunca a la reactivación.
  `findBirthdayCustomers()` ya paginaba; las dos dejan log (`[Campaigns][FALLO]`) además de lanzar.
- **`getActiveTenants()`** (N8) lanza ante un error: los tres crons respondían
  `ok: true, tenants_processed: 0`, un día sin cumpleaños ni reactivación que parecía «no hay marcas».
  Ahora es un 500 con la causa en el log.
- **Las burbujas de riesgo** (`AtRiskBubbles.tsx`, N3-quater) leen el 500 del estimador como «no sé»:
  «Elegibles hoy: —» y el botón deshabilitado, igual que `ManualCampaigns` desde la fase 0.bis. Con 0
  elegibles el botón también queda deshabilitado.

### Campaña Manual (`/api/dashboard/campaigns/manual`)
```
Fetch clientes con filtros (ciudad, visitas, edad, canal)
  → accepts_marketing = true

Post-filtro en JS:
  1. Frequency Cap: excluir si last_campaign_at < 7 días atrás
  2. Recovery Zone: excluir si last_visit_at cae en la ventana del tenant
     (derivada de sus días de reactivación; 18-25 con los defaults)

sendTemplateMessage() en batches de 10
  → bulk update last_campaign_at para enviados
  → bulk insert campaign_messages

Response incluye:
  - totalSent
  - totalFailed
  - totalSkippedFrequencyCap
  - totalSkippedRecoveryZone   ✅ NUEVO
```

---

## Constantes y Settings Configurables

Definidas en `src/constants/rewards.ts` (fallbacks):

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `REACTIVATION_DAYS` | 21 | Fallback: días para reactivación suave |
| `REACTIVATION_AGGRESSIVE_DAYS` | 25 | Fallback: días para reactivación agresiva |
| `FREQUENCY_CAP_DAYS` | 7 | Mínimo de días entre mensajes por cliente |
| `RECOVERY_ZONE_START_DAYS` | 18 | Fallback: inicio zona de recuperación (la real se deriva por tenant) |
| `RECOVERY_ZONE_END_DAYS` | 25 | Fallback: fin zona de recuperación (la real se deriva por tenant) |
| `RECOVERY_ZONE_LEAD_DAYS` | 3 | Días que la zona abre antes del toque suave |

> `rewards.ts` también aloja las constantes del pop-up de reseñas (`DEFAULT_REVIEW_REWARD_WINDOW_DAYS`,
> `REVIEW_SHOWN_DEDUPE_HOURS`): pertenecen a **[review-flow.md](review-flow.md)**, no a este doc.

### Días de Reactivación Configurables (v1.4.0 — Req 6A)

Los días de reactivación ya NO están fijos: se leen de `admin_settings` vía
`getReactivationDaysConfig()` en `src/services/settings.service.ts`:

| Setting key | Default (fallback) | Editable en |
|-------------|--------------------|-------------|
| `reactivation_soft_days` | 21 | Dashboard > Ajustes > Reactivación de Clientes |
| `reactivation_aggressive_days` | 25 | Dashboard > Ajustes > Reactivación de Clientes |

Reglas de validación:
- Ambos deben ser enteros positivos; si no, se usa el fallback.
- La agresiva debe ser > suave; si no, el backend la fuerza a `suave + 4` y la UI bloquea el guardado.
- `findInactiveCustomers(reactivationDays)` ahora acepta el valor como parámetro (default `REACTIVATION_DAYS`).
- La normalización (parseo, fallbacks, `agresiva > suave`) vive en `normalizeReactivationDays()` en
  `src/constants/rewards.ts`, no en el service: la tarjeta del ciclo de recuperación corre en el
  navegador y tiene que llegar al mismo número que el cron. Con dos copias de la regla, la pantalla
  anunciaría un día distinto del que se envía.

**Lo que arrastran estos dos valores (2026-09-06):** la Recovery Zone se deriva de ellos
(`deriveRecoveryZone()`, ver Regla 2) y las cinco bandas del "Ciclo de recuperación del cliente" en
Campañas → Automáticas se calculan con esa derivación. Cambiar los días en Ajustes ahora mueve
las tres cosas a la vez: el mensaje del cron, la ventana protegida y lo que muestra el panel.

### Una sola escala de días (2026-10-08)

Hasta hoy el dueño veía tres relojes en la misma pantalla: las burbujas (`RISK_LEVELS`, fijas: 7-10 /
11-15 / 16-21 / 22+), la tira «Ciclo de recuperación» (derivada de sus días) y el cron (21 y 25). Ahora
las bandas salen de **una** función, `deriveCycleBands()` (`src/constants/rankings.ts`), que usa las
mismas que el cron (`normalizeReactivationDays()` → `deriveRecoveryZone()`):

| Banda | Días (fórmula) | Con los defaults 21 / 25 | Con 15 / 20 |
|---|---|---|---|
| Reciente | 0 … `FREQUENCY_CAP_DAYS`−1 | 0-6 | 0-6 |
| Ventana | `FREQUENCY_CAP_DAYS` … inicio de la zona − 1 | 7-17 | 7-11 |
| Recuperación | la zona del cron | 18-25 | 12-20 |
| Perdido | fin de la zona + 1 … | 26+ | 21+ |

La leen el panel (`getFullAnalytics()` arma `atRiskGroups` con los días de la marca, que lee de
`admin_settings` en la misma consulta que `avg_ticket`), el demo (`RISK_LEVELS` = las bandas con los
defaults) y `ManualCampaigns`. **Desde el 2026-10-14 ya no la leen la tira ni las burbujas de Campañas**: la pantalla
«Ciclo» dibuja las cajas del motor del ciclo (`boxOf()`, los días del ritmo de la marca) y no esta escala; la escala
vieja queda solo donde se sigue usando (las burbujas ya solo viven en `/demo`). Si el suave es muy temprano (≤ 10)
la Ventana queda vacía y no se muestra. Test: `tests/unit/ciclo-fase-0-una-escala.test.ts`.

**Lo que todavía NO lee esta escala** (fuera del alcance de la fase 0): el preset «Rescatar Perdidos»
de `ManualCampaigns.tsx` (`minDays: '26'` fijo), el filtro Activo / Inactivo / Perdido de Clientes
(`getCustomers()`, 18 y 25 fijos) y el contador de inactivos de `getDashboardMetrics()` (21 fijo). Con
los defaults dicen lo mismo; con días propios, no.

### Rediseño UI del Módulo de Campañas (v1.4.0 — Req 5): reemplazado el 2026-10-14

Los KPIs del mes, la insignia `Activa`/`Sin plantilla`, la vista previa de la plantilla, los días dinámicos de las tarjetas,
«Ejecutar Ahora» y la separación Automáticas / Manuales / Historial **ya no existen**: los reemplaza la pantalla «Ciclo»
(§ «La pantalla «Ciclo»», arriba). Lo que se conserva es el **historial traducido** (Finalizada / En curso / Borrador /
Fallida), ahora en `HistorialDeCampanas.tsx`, que se monta solo al abrir la pestaña y ante un fallo de lectura dice «no
pudimos leer el historial» en vez de «no hay campañas».

---

## Archivos Involucrados

| Archivo | Responsabilidad |
|---------|----------------|
| `src/constants/rewards.ts` | Constantes de timing |
| `src/services/campaign.service.ts` | `findInactiveCustomers()`, `updateCustomerLastCampaignAt()`, las dedups (`hasRecentCampaignMessage()`, `yaRecibioElInsistente()`) |
| `src/constants/rankings.ts` | `deriveCycleBands()` / `deriveRiskLevels()` — la escala única de días |
| `src/services/settings.service.ts` | `getReactivationDaysConfig()` — días configurables |
| `src/app/api/cron/reactivation/route.ts` | Cron reactivación: por marca, el camino viejo (días configurables) o el ciclo |
| `src/lib/cycle-touch.ts` | El ciclo, puro: qué toque le toca hoy a cada cliente, regalo, adaptador, hora, guardas del drenador |
| `src/services/cycle.service.ts` | El ciclo con I/O: el cron de una marca encendida y lo que el drenador necesita |
| `src/app/(dashboard)/dashboard/settings/page.tsx` | UI de configuración de días |
| `src/app/(dashboard)/dashboard/campaigns/page.tsx` | «Ciclo y campañas»: pestañas Ciclo · Historial, y el enlace «Mensaje libre (avanzado)» (`?tab=premios` redirige a Recompensas) |
| `src/components/dashboard/cycle/` | La pantalla «Ciclo» (`CicloPantalla`, `EstadoDelCiclo`, `PrimerUso`, `ParaHoy`, `NumerosDeArriba`, `CajasDelCiclo`, `ListaDeCaja`, `VerPorDia`, `ComoDecide`; desde la parte C, además `VistaPorFecha` y los creadores), el mini-ciclo del panel (`MiniCiclo`) y `HistorialDeCampanas` |
| `src/lib/cycle-screen.ts` | Lo puro de la pantalla: qué se muestra y qué no (formatos, «un fallo no es un cero», quién ve qué, rutas, colores `--brand-*`) |
| `src/services/cycle-overview.service.ts` + `src/app/api/dashboard/cycle/*` | Los datos de la pantalla (parte A): `docs/API_DOCS.md` § «Ciclo de recuperación: la pantalla» |
| `src/services/cycle-gift.service.ts` + `src/app/api/dashboard/cycle/gift` | «Mandar un regalo» (parte C): la vista previa, programar y lo que el drenador necesita (el regalo vive en `campaigns.filters.regalo`) |
| `src/components/dashboard/cycle/{VistaPorFecha,MandarRegalo,CrearEvento,CreadorDelCiclo}.tsx` | La vista por fecha y los creadores (parte C) |
| `src/components/dashboard/CampaignRewardsCatalog.tsx` | Catálogo de premios para regalar (vive en Recompensas › Premios para regalar desde 2026-10-13) |
| `src/app/(dashboard)/dashboard/campaign-rewards/page.tsx` | Ruta vieja: redirige a `rewards?tab=premios` |
| `src/app/api/cron/birthday/route.ts` | Cron cumpleaños |
| `src/app/api/dashboard/campaigns/manual/route.ts` | Campañas manuales |
| `src/app/api/dashboard/campaigns/estimate/route.ts` | Estimado de audiencia |

---

## Tabla de Decisión de Envío

| Situación del cliente | Cron Reactivación | Cron Cumpleaños | Campaña Manual |
|-----------------------|:-----------------:|:---------------:|:--------------:|
| Antes de la zona (< 18 días con los defaults) | ❌ no inactivo | según cumpleaños | ✅ elegible |
| Dentro de la zona (18-25 con los defaults) | ✅ elegible* | según cumpleaños | ❌ excluido |
| Pasada la zona (> 25 días con los defaults) | ✅ elegible* | según cumpleaños | ✅ elegible |
| Recibió mensaje hace < 7 días | ❌ excluido | ❌ excluido** | ❌ excluido |
| Ya recibió el insistente desde su última visita | ❌ excluido (solo el insistente) | según cumpleaños | ✅ elegible |
| Un envío anterior FALLÓ | ✅ se reintenta | ✅ se reintenta | según filtros |
| `accepts_marketing = false` | ❌ excluido | ❌ excluido | ❌ excluido |

*Sujeto al frequency cap de 7 días
**El cron de cumpleaños usa dedup por `campaign_messages` (`BIRTHDAY_DEDUPE_DAYS`, 360 días), no por `last_campaign_at`.
La ventana es de 360 y no de 365 **a propósito**: el año en que el envío se adelantó dos días el hueco
contra el saludo anterior es de 363, y 365 habría saltado a todo cliente saludado el año pasado sin
registrar un solo error — la campaña habría quedado muda un año entero
