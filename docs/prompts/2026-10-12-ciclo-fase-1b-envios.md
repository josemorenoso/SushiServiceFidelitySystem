# Prompt — Ciclo de recuperación, fase 1B: los envíos y el piloto (2026-10-12)

> Escrito por el comandante (Opus 5.5) después de revisar la 1A contra el código y con sus dos consultas de producción
> leídas (`SQL-PARA-CORRER/ciclo-fase-1a/LEEME.md` § Resultados). Todas las decisiones del dueño están tomadas
> (`docs/PENDIENTES.md` §8, bloque A ✅). **Modelo recomendado: Opus** (toca el cron y el drenador por donde salen TODAS
> las campañas, y trae una migración: los errores son caros). Una sesión. Pegar entero en una sesión nueva abierta en la
> raíz del repo. Lo que viene después (la pantalla, fase 2) lleva prompt aparte.

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Tu trabajo es la **FASE 1B del ciclo de recuperación: los
envíos**. La 1A dejó la base (migración 00070, aplicada en producción el 12-10; `src/lib/cycle-engine.ts`;
`src/lib/communications/registry.ts`; las claves `cycle_*`). Tú haces que el motor **decida, encole y envíe**: el cron
elige qué toque le toca a cada cliente y lo encola a la hora de la marca; el drenador lo envía, otorga el regalo y escribe
el resultado en el libro de toques. **El ciclo sigue apagado en todas las marcas** (`cycle_enabled = false`): lo enciende
el dueño, primero en la marca demo y después en el piloto, **Don Alirio**. Una migración, que **no aplicas**. Sin push,
sin deploy, sin mandar ningún WhatsApp.

## 1. Antes de tocar nada (obligatorio, CLAUDE.md § "Cada sesión")

1. Lee `ESTADO.md` entero. Si en §2 hay una fila viva que toque tus archivos, NO arranques y avísame.
2. Corre `node scripts/proxima-migracion.mjs` (el 12-10 decía 00071; manda lo que diga HOY). Anota tu fila en §2 con:
   «Ciclo fase 1B: los envíos (cron que decide y encola, drenador que otorga, piloto)», tu modelo, los archivos de la
   sección 4 y **el número que dio el script** (esa fila es la única reserva). Commitea SOLO `ESTADO.md`.
3. Lee, en este orden y enteros:
   - `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`: **§3, §4, §5, §7, §13 y §14**. Si algo choca,
     manda §14, después §13, después este prompt.
   - `docs/PENDIENTES.md` **§2.4** (lo que la 1A dejó para ti: cada punto de ahí tiene que quedar resuelto o explicado).
   - `docs/features/ritmo-adaptativo.md` §7 y `supabase/migrations/00070_ciclo_motor_base.sql` entera (triggers y
     comentarios: ahí están las decisiones que no son literales del spec).
   - `docs/features/campaigns.md`, `docs/features/send-governance.md` (§ «El drenador» y § «Qué encola hoy»),
     `docs/features/reward-grants.md` y `docs/features/testing.md` (Postgres embebido en `TEST_PG_PORT=55432`; **una
     corrida de vitest a la vez**).
   - El código que vas a tocar: `src/app/api/cron/reactivation/route.ts`, `src/app/api/cron/queue-drain/route.ts`,
     `src/services/send-queue.service.ts`, `src/services/reward-grant.service.ts`,
     `src/app/api/cron/reward-reminder/route.ts` y `getMonthBoundaries()` en `src/services/campaign.service.ts`.
   - Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Qué construir

### 2.1 La migración (el número del script)

Lo mínimo para que el cron y el drenador se entiendan. Los nombres son propuesta; si eliges otros, dilo y por qué.

- **`customer_cycle_touches`** (00070) gana: `attempts integer NOT NULL DEFAULT 0` (el tope de 3 fallidos por toque de
  la fase 0.bis, `MAX_INTENTOS_FALLIDOS_POR_TOQUE`); `reason text` (por qué se pospuso, se canceló o falló, en palabras);
  `reward_id uuid` → `campaign_rewards(id) ON DELETE SET NULL` (el regalo elegido al decidir); `gift_size text` (`small`
  | `strong` | NULL); `template_key text` (qué plantilla del catálogo salió: `gift_expiring`, `reactivation_aggressive`,
  `reactivation_no_reward`, `campaign_presencial_to_domicilio`, `campaign_domicilio_to_presencial`). El estado admite
  además **`cancelled`** (el cliente volvió, la etapa ya pasó, la marca apagó el ciclo, opt-out). Respeta los dos CHECK
  del grupo de control de la 00070 (un `holdout` nunca queda `queued`, `sent` ni `failed`).
- **`send_queue.cycle_touch_id uuid NULL`** → `customer_cycle_touches(id) ON DELETE SET NULL`, y
  **`enqueue_send_queue(p_items jsonb)` lo lee**. Su cuerpo vigente es el de la **00044** (no el de la 00038): parte de
  ese. Misma firma → `CREATE OR REPLACE` sirve; si cambias la firma, `DROP` primero (una sobrecarga deja la llamada vieja
  ambigua, 42725). Sin esto la sede ya se perdió una vez en silencio (ver el comentario de `enqueueSendBatch()`).
- **`reward_grants.skip_reminder boolean NOT NULL DEFAULT false`** (H2: el regalo pequeño no lleva recordatorio). **No**
  sellar `reminder_sent_at` para lograrlo: diría que salió un recordatorio que nunca salió.
- Cada función nueva o cambiada: si es `SECURITY DEFINER`, su `REVOKE` de `anon` y `authenticated`
  (`tests/db/ola0-seguridad.test.ts` lo exige). Idempotente. Bloque de verificación al final que falle si falta algo
  (como la 00070).
- **Nada de esto cambia el comportamiento de hoy**: con `cycle_enabled = false` en todas las marcas nadie escribe las
  columnas nuevas. Igual, la regla de la casa: la aplica el dueño ANTES del push.

### 2.2 El cron decide y encola (`/api/cron/reactivation`, misma ruta, `vercel.json` intacto)

Por marca, con `normalizeCycleSettings()`:

- **Ciclo apagado → el código de hoy, sin cambiar una línea de su comportamiento.** Las 24 marcas que no están en el
  piloto no notan nada. **Ciclo encendido → el camino nuevo, y el viejo NO corre** (si corrieran los dos, el cliente
  recibiría la suave de siempre y el toque del ciclo).
- **El encendido se anota solo.** La primera corrida que ve la marca encendida guarda la fecha (`cycle_enabled_at` en
  `admin_settings`, en la lista cerrada de `settings-keys.ts`) y ese mismo día aplica las dos reglas del encendido
  (`docs/PENDIENTES.md` §2.4): **(1) nada atrasado**: un toque solo sale si su día (`cycle_started_at` + el día de la
  etapa, en días de Bogotá) es igual o posterior al día del encendido; el que ya está entre dos etapas espera la
  siguiente. **(2) quien ya pasó el último toque de su ritmo** sin estar dormido pasa a `dormido` con
  `dormant_since = now()`, **sin mensaje**. Apagar la marca borra esa fecha (el próximo encendido la vuelve a anotar).
- **Antes de decidir:** `expireGrants()` de la marca (un regalo vencido que sigue `active` bloquea uno nuevo por el índice
  único de la 00031) y la **reconciliación** del punto 2.3 (H6).
- **El ritmo:** el de la marca con `cycle_brand_rhythm_stats()` + `brandRhythm()`; el de cada cliente con
  `effectiveRhythm(customers.cycle_rhythm, marca)`. Nada de lógica de etapa fuera de `cycle-engine.ts`.
- **Activos** (paginado de a 1.000, orden total; `accepts_marketing`, sin opt-out, `cycle_state = 'activo'`): la etapa es
  `resolveStage(díasDesde(cycle_started_at), ritmo, { tieneDomicilio: config.has_delivery_webhook, canalesDelCliente })`.
  Se crea el toque solo si esa etapa no tiene fila en este `cycle_no` y su día pasa la regla (1). `t1` se salta con
  `shouldSkipT1(total_visits)`. Por cada toque, en este orden:
  1. **Blackout de un evento de su audiencia** (`getActiveBlackouts()` + `findCustomersForEvent()`): fila `deferred`
     con `due_at` = el día siguiente al evento (spec §3.3 regla 5).
  2. **Grupo de control:** `isHoldout(customerId, stage, cycleNo, holdoutPct)` → fila `holdout`, sin envío, con su
     `due_at` (H4, H5).
  3. **Cap de 7 días o tope del mes** (`passesFrequencyCap()`, `filterByMonthlyCap()`): fila `deferred` con `due_at` =
     `last_campaign_at` + 7 días, o el día 1 del mes siguiente (H6).
  4. **El resto:** `INSERT … ON CONFLICT DO NOTHING` (el UNIQUE de la 00070 es el anti-doble-disparo); **solo si insertó**,
     `enqueueSendBatch()` con `cycle_touch_id`, `campaign_id` de `getOrCreateTodayCampaign('reactivation', …)`,
     `not_before` = **la próxima** hora de la marca (`cycle_send_slot`: la cena, 16:30, sale hoy; el almuerzo, 10:30, ya
     pasó a las 15:00 y sale **mañana**: H3) y `expiresAt` = el cierre del día siguiente al `not_before`. La fila queda
     `queued` con `due_at = not_before`. `location_id` NULL en el toque y en la cola (D12: la sede de una campaña masiva
     es F6).
- **Los `deferred` y los `failed` vuelven:** un `deferred` cuyo `due_at` llegó se reevalúa por el mismo camino; un
  `failed` con `attempts < 3` se reintenta al día siguiente; si mientras tanto el cliente pasó a una etapa posterior, el
  toque viejo queda `cancelled` («la etapa ya pasó») y sale el nuevo.
- **Dormidos:** el toque trimestral (`stage = 'heartbeat'`, `seq = heartbeats_sent + 1`) a los `dormant_since` + 90 × seq
  días, máximo 2 (`HEARTBEAT_MAX`), solo con `cycle_heartbeat_enabled`. Regalo con `heartbeatPrize(seq)`. El dormido con
  2 trimestrales y 90 días desde el segundo pasa a `archivado` (sin mensaje).
- **El regalo:** `t2` el pequeño (el primero de `cycle_small_reward_ids`; rotarlos es de la fase 3); `t4` el fuerte
  (`cycle_strong_reward_id`, que ya cae a `aggressive_reward_id`), **o el pequeño si `strongOfferAllowed()` dice que no**
  (cooldown de 180 días); el trimestral, `heartbeatPrize()`. Solo premios del catálogo activos y de ESA marca
  (`getCampaignRewardById(id, tenantId)`). Sin regalo configurado, el toque sale igual, sin regalo.
- **La plantilla (el adaptador, spec §4):** un toque con regalo usa `gift_expiring` **si está aprobada en esa marca**
  (Zernio: el puntero solo existe aprobado; Twilio: puntero + `isTwilioTemplateApproved()`, una vez por corrida, como
  hace `reward-reminder` desde PL-2-a; la marca demo no pregunta). Si no, la **insistente**
  (`reactivation_aggressive_template_sid`) con las variables que manda hoy el cron (`{{1}}`–`{{3}}`, y `{{4}}` regalo y
  `{{5}}` fecha cuando hay regalo: `sendTemplateMessage()` ya reintenta con menos variables ante el 21665). `t1` →
  `reactivation_no_reward`; `t3` → la cruzada según `source_channels`; `t5` y un toque sin regalo → la insistente sin
  `{{4}}`/`{{5}}`. Etapa sin plantilla configurada → no se crea el toque y la respuesta lo cuenta por marca.
- **`?dry=1`** (como `line-health`): las mismas decisiones, **cero escrituras** (ni toques, ni cola, ni ajustes, ni
  regalos, ni la fecha de encendido) y cero envíos. Devuelve por marca cuántos irían a cada etapa, en control, pospuestos,
  saltados, dormidos por encendido, y hasta 10 ejemplos (id del cliente, etapa, plantilla, regalo). Es lo que el dueño
  (o el comandante) mira antes de encender.
- La respuesta normal trae los mismos conteos. **Nada se envía desde el cron.** Si una corrida no encola nada, no deja
  una campaña `running` vacía: el drenador solo cierra las que tuvieron cola.

### 2.3 El drenador otorga al enviar (`queue-drain/route.ts`)

Solo para items con `cycle_touch_id`; **los demás items no cambian** (los tests del drenador de hoy siguen en verde sin
tocarlos).

- **Guardas nuevas, antes de enviar** (se suman a las de hoy, en `filtrarPorGuardas()`):
  - El cliente **volvió** (su `cycle_no` ya no es el del toque) o su estado no corresponde (`t1`–`t5` exigen `activo`; el
    trimestral, `dormido`) → item cancelado y toque `cancelled`. Lo mismo si la marca **apagó** el ciclo.
  - Toque con regalo y el cliente ya tiene un regalo de reactivación **vivo** (activo y sin vencer) → no sale ni cuenta:
    toque `deferred` hasta el día siguiente a que ese venza (spec §5: «un regalo activo por cliente»).
- **La fecha:** `expiresOnSunday(ahora)`, escrita «domingo 18 de octubre» en hora de Bogotá, en la variable que toca
  según `template_key` (`{{3}}` en `gift_expiring`, `{{5}}` en la insistente). Se calcula al enviar, no al encolar.
- **Después de un envío exitoso, y solo entonces:** `grantReward()` con el vencimiento EXACTO (agrega un `expiresAt`
  opcional a `GrantRewardParams`; `windowDays` sigue igual para los demás) y `skip_reminder = true` si es el pequeño. El
  toque pasa a `sent` con `sent_at`, `campaign_message_id` (la fila que el drenador ya inserta en `campaign_messages`:
  pídele los ids de vuelta) y `grant_id`. Si fue el fuerte, `customers.strong_offer_last_at = now()`. **Si fue la
  despedida (`t5`), el drenador duerme al cliente** (`dormido`, `dormant_since`), solo si sigue `activo` en ese mismo
  ciclo. Si fue un trimestral, `heartbeats_sent + 1`. Un `duplicate_active` a pesar de la guarda (carrera) deja el toque
  `sent` sin `grant_id` y un log; no se reintenta.
- **H6, todo desenlace escribe el toque:** fallo reintentable → sigue `queued`; fallo final → `failed` con `attempts + 1`
  y `reason`; opt-out → `cancelled`; cap de 7 → `deferred` 7 días; tope del mes → `deferred` al mes siguiente. **Y
  también los dos caminos que no pasan por el drenador**: `expire_send_queue()` (SQL) y la cancelación desde el panel.
  Elige tú el mecanismo (un trigger sobre `send_queue.status` o una reconciliación al empezar el cron que mire los
  toques `queued` cuyo item ya no está `queued`), pero cada camino lleva su test. Ningún toque puede quedar `pending` ni
  `queued` para siempre (un `pending` es un toque cuyo encolado falló a medias: se retoma al día siguiente).

### 2.4 Lo demás

- **H2:** `findGrantsDueForReminder()` no devuelve los `skip_reminder`. Es lo único que tocas de `reward-reminder`.
- **El recordatorio real contra la simulación.** `validateStageConfig()` supone que el aviso del fuerte sale **2 días
  antes** del vencimiento. Mira cuándo sale de verdad: `reward-reminder` corre a las 11:00 de Bogotá y toma lo que vence
  dentro de `reward_reminder_days_before` (2); con vencimiento el domingo a las 23:59, la primera corrida que lo toma
  parece ser la del **sábado**, no la del viernes. Si es así, ajusta la simulación al día real y vuelve a validar los
  cuatro ritmos. **Si alguno deja de pasar, PARA y dímelo**: no cambies días de un ritmo por tu cuenta.
- **N-MES** (`docs/PENDIENTES.md` §5): `getMonthBoundaries()` corta el mes en hora de Bogotá, no del servidor. El tope de
  3 al mes del ciclo se apoya en esa cuenta.
- **TEST-deadlock** (§5): la línea `LOCK TABLE customers, visits IN ACCESS EXCLUSIVE MODE` al empezar la transacción de
  `tests/db/ola0-seguridad.test.ts`. Tus tests de base insertan visitas y te va a morder.
- **Las legacy** `reactivation_with_reward_template_sid` y `reactivation_template_sid`: el camino nuevo **no las lee
  nunca**. El viejo (marcas apagadas) **no se toca en esta fase**: se retiran del todo cuando muera el camino viejo, con
  todas las marcas en el ciclo. Actualiza el motivo de su excepción en `tests/unit/p1a-plantillas-paridad.test.ts`, y saca
  `gift_expiring_template_sid` de `SIN_EMISOR_TODAVIA` (ese test te lo va a exigir).
- **El motor de piezas:** el cron y el drenador sacan las reglas de la pieza `cycle_touch` del registro en vez de copiar
  constantes; el test de paridad sigue en verde.

### 2.5 Para el dueño: `SQL-PARA-CORRER/ciclo-fase-1b/LEEME.md`

En español llano, con el archivo y el bloque exactos, y qué resultado esperar en cada paso:

1. **Aplicar la migración** en el Supabase del PRODUCTO (el que tiene la tabla `tenants`), ANTES del push.
2. **Después del deploy, encender primero `demo-ventas`** (`is_demo`: el envío es simulado, no sale ningún WhatsApp
   real). El SQL que enciende y el que, al día siguiente, muestra los toques por etapa y estado y la cola.
3. **Don Alirio:** lo que hay que mirar antes (si tiene regalo pequeño y fuerte elegidos o no —es decisión del dueño, y
   sin ellos el ciclo sale sin regalo—, si «Regalo que vence» está aprobada o sale la insistente, el cupo de su línea), el
   `?dry=1` (cómo correrlo con el `CRON_SECRET`, o pedírselo al comandante), el SQL que lo enciende y el que lo revisa al
   día siguiente.
4. **Cómo apagarlo** (y que lo que estaba en cola ya no sale).
5. **A las dos semanas:** retorno a 14 días por etapa con mensaje contra sin mensaje (`returned_at` de `sent` contra
   `holdout`), y la segunda visita (clientes del ciclo 1 que abrieron el ciclo 2). Conteos, nunca pesos.

## 3. Tests (cada uno falla contra el código de hoy)

- `tests/unit/cycle-gift.test.ts` (o el nombre que elijas): fecha calculada al enviar y no al encolar · otorgar solo
  tras el envío exitoso · el pequeño con `skip_reminder` · cooldown → el rescate lleva el pequeño · adaptador
  (`gift_expiring` aprobada / sin aprobar en Twilio / Zernio / demo) y la variable de la fecha según la plantilla ·
  la hora de la marca (cena hoy, almuerzo mañana, H3) · `?dry=1` no escribe nada.
- `tests/db/` con Postgres real: el cron con la marca **apagada** hace exactamente lo de hoy · **encendida**: un toque
  por etapa aunque corra dos veces · nada atrasado el día del encendido · el que pasó la despedida se duerme sin mensaje ·
  blackout → `deferred` · `holdout` sin cola · cap de 7 y tope del mes → `deferred` con su fecha · `failed` reintenta y a
  los 3 se rinde · el trimestral 1 pequeño y el 2 fuerte, y después `archivado` · el drenador: el cliente volvió →
  `cancelled`; la despedida duerme; regalo vivo → `deferred`; item vencido y cancelación desde el panel → el toque no
  queda `queued` · `findGrantsDueForReminder()` salta los `skip_reminder` · `getMonthBoundaries()` en Bogotá · la
  migración: CHECKs, FK, `enqueue_send_queue()` guarda `cycle_touch_id`, RLS por marca.
- Siguen en verde, sin tocarlos: los tests del drenador y del cron de hoy, `ola0-seguridad`, `cycle-triggers`,
  `communications-registry`, `p1a-plantillas-paridad` (con los dos cambios de 2.4).

Compruébalo sin `stash`: copia tus archivos al scratchpad, vuelve a los de HEAD con `git show`, corre tus tests, restaura.
Di cuántos fallan contra el código anterior (en el CHANGELOG y en tu respuesta).

## 4. Territorio

`supabase/migrations/<número>_*.sql` · `src/app/api/cron/reactivation/route.ts` · `src/app/api/cron/queue-drain/route.ts`
· `src/services/send-queue.service.ts` · `src/services/reward-grant.service.ts` ·
`src/app/api/cron/reward-reminder/route.ts` (solo H2) · `src/services/campaign.service.ts` (solo `getMonthBoundaries()`) ·
`src/lib/cycle-engine.ts` (solo la simulación del recordatorio, si hace falta) · `src/lib/settings-keys.ts` (la clave
de encendido) · `src/lib/communications/registry.ts` · los servicios nuevos que necesites (p. ej.
`src/services/cycle.service.ts`) · `tests/**` (nuevos, más `p1a-plantillas-paridad` y la línea de `ola0-seguridad`) ·
`SQL-PARA-CORRER/ciclo-fase-1b/` · `docs/DB_SCHEMA.md` · `docs/features/campaigns.md` · `docs/features/send-governance.md`
· `docs/features/reward-grants.md` · `docs/features/ritmo-adaptativo.md` · `docs/PENDIENTES.md` · `ESTADO.md` ·
`CHANGELOG.md`.
**Fuera de esta lista no se toca**: ninguna pantalla (la de Campañas sigue mostrando los días viejos en la marca piloto:
lo reemplaza la fase 2), `vercel.json`, los textos y el catálogo de plantillas (`template-texts.ts`,
`template-catalog.ts`), `src/constants/messaging.ts`, `whatsapp.service.ts`, el cron de cumpleaños, el calendario. Si
necesitas algo de afuera, para y explícame por qué.

## 5. Reglas que no se rompen

- **Todo INSERT con `tenant_id` explícito** (la 00030 no corrió: uno sin `tenant_id` se va callado a Sushi Service).
  Toda columna de sede nullable con FK COMPUESTA `ON DELETE RESTRICT`; `location_id` NULL se muestra, no se backfillea.
- Supabase JS: destructura siempre `error` y pásalo por `src/lib/db-failure.ts`. Un fallo de base **no** es «nadie para
  hoy»: la marca falla con su error y las demás siguen.
- **`promoteVersion()` es el único escritor de `*_template_sid`.** El contrato `{{n}}` de ninguna plantilla cambia.
  Nada en pesos (D7).
- **La migración no se aplica. No tocas Supabase de producción. No llamas a producción. No mandas ningún WhatsApp.**
- Git: solo tus archivos, por nombre. Nunca `git add -A` ni `git add .`. Nunca cambies de rama, ni `stash`, ni
  `reset --hard`. Commits locales sí; push y deploy NO (son del dueño).

## 6. Cierre

1. `npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (di cuántos hay; la base es 14 = 7 de `src/` + su copia
   en `.kilo/worktrees`) · `npx vitest run` entero en verde (la última corrida completa dio **80 archivos / 1.202
   tests**).
2. Docs: `DB_SCHEMA.md` (columnas y la tabla de toques al día); `campaigns.md` y `send-governance.md` reescritos a lo
   que el código hace con el ciclo encendido y apagado; `reward-grants.md` (`skip_reminder`, `expiresAt`);
   `ritmo-adaptativo.md` §7 (estado: «envía, apagado por marca»).
3. `docs/PENDIENTES.md`: la 1B sale de §1 y §2.4; N-MES y TEST-deadlock salen de §5; lo nuevo que encuentres, donde
   corresponda.
4. `ESTADO.md`: borra tu fila de §2 y deja en 0.CICLO lo del dueño, en orden: aplicar la migración ANTES del push →
   push → `demo-ventas` → Don Alirio (con el LEEME de 2.5).
5. `CHANGELOG.md`: una entrada de 15 líneas como máximo.
6. Commit de tus archivos por nombre. Después:
   `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 7. Tu respuesta final (el dueño se la pasa al comandante para revisarla)

- Si algo impide aplicar la migración o desplegar, dilo primero.
- Hash de cada commit, número de migración y lista exacta de archivos.
- Por cada punto de la sección 2: qué hiciste, archivo y línea, y el nombre del test que lo cubre.
- Cómo comprobaste que los tests fallan contra el código anterior, y cuántos fallaron.
- tsc, lint y vitest con números.
- Qué mecanismo elegiste para H6 en `expire_send_queue()` y en la cancelación del panel, y por qué.
- Qué encontraste con el día real del recordatorio y si los cuatro ritmos siguen pasando.
- Cada punto de `docs/PENDIENTES.md` §2.4: resuelto (dónde) o no (por qué).
- Lo que no coincida con el spec o con este prompt, aunque no lo hayas arreglado.
