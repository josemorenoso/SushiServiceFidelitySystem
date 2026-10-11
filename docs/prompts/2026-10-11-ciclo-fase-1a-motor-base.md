# Prompt — Ciclo de recuperación, fase 1A: la base del motor (2026-10-11)

> Escrito por el comandante (Opus 5.5) con todas las decisiones del dueño del 2026-10-11 ya tomadas
> (`docs/PENDIENTES.md` §8, bloques A y B: ✅). **Modelo recomendado: Opus** (migración, triggers y backfill sobre una
> base de producción: los errores son caros). Pegar entero en una sesión nueva abierta en la raíz del repo.
> **Fase 1B** (cron, drenador, regalos, encender el piloto) lleva prompt aparte, después de revisar esta.

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Tu trabajo es la **FASE 1A del ciclo de recuperación:
la base del motor**. Construyes los datos, los triggers, el cálculo del ritmo de cada cliente y el motor de piezas.
**Nada se envía todavía**: el cron, el drenador y los regalos son de la fase 1B. Una migración, que **no aplicas** (la
aplica el dueño). Sin push, sin deploy.

## 1. Antes de tocar nada (obligatorio, CLAUDE.md § "Cada sesión")

1. Lee `ESTADO.md` entero. Si en §2 hay una fila viva que toque tus archivos, NO arranques y avísame.
2. Corre `node scripts/proxima-migracion.mjs`. Anota tu fila en §2 con: «Ciclo fase 1A: base del motor (migración,
   triggers, ritmo adaptativo, motor de piezas), nada se envía», tu modelo, la lista de archivos de la sección 4 y **el
   número de migración que dio el script** (esa fila es la única reserva). Commitea SOLO `ESTADO.md` con ese cambio.
3. Lee, en este orden y enteros:
   - `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`: **§3, §7, §9, §13 y §14**. Si algo choca,
     manda §14, después §13.
   - `docs/features/ritmo-adaptativo.md` (la feature que construyes, con los datos de producción).
   - `docs/PENDIENTES.md` §2 y §8 (las decisiones del dueño).
   - `docs/features/campaigns.md` y `docs/features/send-governance.md` (lo que hacen hoy los crons, el tope de 3 fallidos
     de la fase 0.bis y la cola).
   - `docs/DB_SCHEMA.md`, `docs/features/testing.md` (Postgres embebido en `TEST_PG_PORT=55432`; **una corrida de vitest
     a la vez**) y `tests/db/ola0-seguridad.test.ts` (lo que exige a toda función `SECURITY DEFINER`).
   - Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Qué construir

### 2.1 La migración (el número del script)

Del spec §7.1 y §14, con estas precisiones:

- **`customers`:** `cycle_no`, `cycle_started_at`, `cycle_touches`, `cycle_state` (`activo|dormido|archivado`),
  `dormant_since`, `heartbeats_sent`, `strong_offer_last_at` y **`cycle_rhythm`** (`cafe|casual|restaurant|occasional`,
  NULL = usa el de la marca).
- **`customer_cycle_touches`** como en §7.1: `holdout`, `due_at` (H5), `channel` (`whatsapp` y nada más por ahora),
  estados `pending|queued|sent|failed|holdout|deferred`, `UNIQUE (customer_id, cycle_no, stage, seq)`, FK COMPUESTA de
  sede `(location_id, tenant_id)` `ON DELETE RESTRICT`, `tenant_id` NOT NULL y **explícito en todo INSERT** (la 00030 no
  corrió: un INSERT sin `tenant_id` se va calladito a Sushi Service). RLS por `tenant_id` como el resto. Índices por
  `(tenant_id, due_at)` y `(customer_id, cycle_no)`.
- **Trigger `on_customer_visit`** (`AFTER UPDATE OF last_visit_at … WHEN (NEW.last_visit_at > OLD.last_visit_at)`):
  - Reinicio: `cycle_no + 1`, `cycle_started_at = NEW.last_visit_at`, `cycle_touches = 0`, `cycle_state = 'activo'`,
    `dormant_since = NULL`.
  - **Ritmo personal:** con 3 o más **días distintos** con visita (hora de Bogotá), la mediana de días entre esos días
    elige el ritmo: < 9 `cafe` · 9–18 `casual` · 19–35 `restaurant` · > 35 `occasional`. Con menos, `NULL`. Usa
    `visits` del cliente (tiene índice por `customer_id`). La regla tiene que ser **idéntica** a la de
    `cycle-engine.ts`: un test lo verifica (2.4).
  - **Atribución:** el último toque del ciclo que se cierra con `due_at` en los 14 días anteriores recibe
    `returned_at = now()`, también si es `holdout`.
  - Verifica que **todos** los escritores de `last_visit_at` lo disparan: el check-in, el escaneo del mesero, el alta con
    `countFirst` y el domicilio (`delivery.service.ts`). Si alguno no escribe `last_visit_at`, dímelo; no lo cambies.
- **Trigger `on_campaign_message_sent`** (`AFTER INSERT` con `status IN ('sent','delivered')`): `cycle_touches + 1` y,
  al llegar a `cycle_fatigue_touches` (6 por defecto, de `admin_settings`), `cycle_state = 'dormido'` y
  `dormant_since = now()`. **Filtra por `campaigns.source IN ('manual','calendar','reactivation')`, NO por
  `campaigns.type`**: el recordatorio de premio es `type = 'reactivation'` con `source = 'reward_reminder'` y no cuenta
  (lo descubrió la fase 0). El cumpleaños tampoco cuenta.
- **Función del ritmo de la marca:** devuelve, para un `tenant_id`, la mediana de días entre visitas (días distintos,
  hora de Bogotá) y cuántos regresos hay. El TS decide con eso (2.2). Si es `SECURITY DEFINER`, lleva su `REVOKE` de
  `anon` y `authenticated`.
- **Backfill en la misma migración, sin ráfaga:** `cycle_started_at = COALESCE(last_visit_at, created_at)`; quien lleva
  más de 90 días sin venir nace `dormido` con `dormant_since = now()`; `cycle_rhythm` calculado para quien ya tenga 3 o
  más días con visita. `cycle_no = 1` para todos.
- **Nada de esto cambia el comportamiento de hoy:** ningún código en producción lee las columnas nuevas en esta fase.
  Así, aunque el dueño desplegara antes de aplicar, nada daría 42703. Igual, la regla es migración primero.

### 2.2 El motor puro: `src/lib/cycle-engine.ts` (sin I/O, como `points-engine.ts`)

- `RHYTHM_PRESETS` con los cuatro ritmos del spec §3.2.bis: `cafe` 7·14·26·42·58 · `casual` 10·17·29·45·61 ·
  `restaurant` **14·28·42·60·80** · `occasional` 21·38·56·80·110.
- `medianGap(diasConVisita)`, `rhythmFromMedian(dias)` (los cortes de arriba), `effectiveRhythm(personal, marca)`.
- `brandRhythm({ mediana, regresos, elegidoPorElDueño })`: lo que eligió el dueño en Ajustes manda; si no (`auto`), con
  **30 o más regresos** la mediana elige; con menos, `restaurant`.
- `resolveStage(diasSinVenir, ritmo, { tieneDomicilio, canalesDelCliente })`: `t3` solo existe con
  `has_delivery_webhook`, y se salta si el cliente ya usa los dos canales.
- `validateStageConfig(dias)`: **valida simulando 365 fechas de visita**, no a mano: 7 días entre toques; nunca más de 3
  mensajes por mes calendario ni por ventana de 30 días, contando el recordatorio del rescate con «vence el domingo»
  (mínimo 5 días; el recordatorio cae 2 días antes del vencimiento). El regalo pequeño no tiene recordatorio (decisión
  15). Los cuatro presets tienen que pasar; `7·14·21·30·45` tiene que fallar (es el caso que lo rompe).
- `bandsFromConfig()`, `shouldSkipT1(visitas)` (≥ 5), `strongOfferAllowed(ultimaVez, ahora)` (180 días),
  `heartbeatPrize(seq)` (1 pequeño, 2 fuerte), `expiresOnSunday(fecha, minDias = 5)`,
  `isHoldout(customerId, stage, cycleNo, pct)` (hash estable **que incluye el ciclo**, H4).
- La fase 0 creó `deriveCycleBands()` en `src/constants/rankings.ts` con los días viejos de reactivación. **No la
  rompas:** sigue sirviendo a las pantallas de hoy hasta la fase 2. Documenta en un comentario que el motor nuevo la
  reemplazará.

### 2.3 El motor de piezas: `src/lib/communications/registry.ts` (puro)

Spec §14.3. Cada pieza declara `key`, `messageType`, `campaignSource`, `countsForFatigue`, `countsForMonthlyCap`,
`exemptFromFrequencyCap`, `channels` y `pausesCycleTouch`. Registra las que existen hoy: `cycle_touch` (con source
`reactivation`), `birthday`, `reward_reminder`, `calendar_event`, `manual`, `golden_bullet`.

- **No reemplaza nada en esta fase.** Se arma leyendo las constantes que ya existen (`MONTHLY_CAP_SOURCES`,
  `FREQUENCY_CAP_DAYS`, los exentos del drenador, `src/constants/messaging.ts`).
- **Un test de paridad** exige que el registro diga lo mismo que esas constantes y que `message_class_map`. Si mañana
  alguien cambia una sin la otra, el test se pone rojo.
- Deja escrito en el archivo, con un ejemplo comentado, cómo se agregaría `brand_anniversary` (cumpleaños del
  restaurante): qué campos llena y qué no toca. Es la promesa al dueño de que agregar comunicaciones es barato.

### 2.4 Ajustes

Claves nuevas en `src/lib/settings-keys.ts` (la lista cerrada que hizo P1-a): `cycle_enabled` (default `false` en todas
las marcas), `cycle_rhythm` (`auto|cafe|casual|restaurant|occasional`, default `auto`), `cycle_small_reward_ids`,
`cycle_strong_reward_id` (lee `aggressive_reward_id` como respaldo), `cycle_fatigue_touches` (6),
`cycle_heartbeat_enabled` (true), `cycle_strong_cooldown_days` (180), `cycle_send_slot` (`dinner` 16:30 /
`lunch` 10:30), `cycle_holdout_pct` (10; 0 si la marca tiene < 200 clientes). **Ninguna pantalla nueva en esta fase.**

### 2.5 Consultas para el dueño (solo lectura) en `SQL-PARA-CORRER/ciclo-fase-1a/LEEME.md`

1. **Antes de aplicar la migración: Sushi Fun.** ¿Hay clientes con `total_visits >= 2` y una sola fila en `visits`? Por
   marca. Si en Sushi Fun son muchos, sus visitas viejas no se migraron y su 2,4 % de regreso no es real (spec §14.4).
2. **Después de aplicar: la foto del ciclo.** Por marca: cuántos `activo` y `dormido`; de los activos, cuántos con ritmo
   personal por cada ritmo; y el ritmo de la marca que daría `auto` (mediana, regresos). Con los datos del 11-10 debería
   salir Don Alirio → `cafe` y Sushi Service → `restaurant`.

Explica en español llano qué significa cada número y qué resultado sería raro.

## 3. Tests (cada uno falla contra el código de hoy)

- `tests/unit/cycle-engine.test.ts`: los cuatro presets pasan la simulación; `7·14·21·30·45` falla; cortes del ritmo
  (8 → `cafe`, 9 → `casual`, 19 → `restaurant`, 36 → `occasional`); `brandRhythm` con 29 y 30 regresos y con la
  elección del dueño; etapa por día; `t3` sin domicilio; cooldown; salto de `t1`; trimestral pequeño y fuerte; domingo
  con mínimo 5; `isHoldout` estable para el mismo ciclo y distinto entre ciclos.
- `tests/unit/communications-registry.test.ts`: la paridad con las constantes y con `message_class_map`.
- `tests/db/cycle-triggers.test.ts` (Postgres real): visita → `cycle_no + 1` y reinicio; **ritmo personal en SQL igual
  al de TS** para varios historiales (incluido uno de Don Alirio: visitas cada 2 o 3 días → `cafe`); dos escaneos el
  mismo día cuentan como uno; atribución a 14 días sí y a 15 no, también a un `holdout`; sexto mensaje (manual,
  calendario o ciclo) → `dormido`; **el recordatorio de premio y el cumpleaños no cuentan**; el UNIQUE con 8 inserciones
  concurrentes del mismo toque (gana una, como `calendar-claim.test.ts`); el backfill (más de 90 días → `dormido`, sin
  tocar `cycle_touches`); RLS: una marca no ve las filas de otra.
- `tests/db/ola0-seguridad.test.ts` sigue en verde con tus funciones nuevas.

Compruébalo sin `stash`: copia tus archivos al scratchpad, vuelve a los de HEAD con `git show`, corre los tests,
restaura. Dilo en el CHANGELOG.

## 4. Territorio

`supabase/migrations/<número>_*.sql` · `src/lib/cycle-engine.ts` · `src/lib/communications/registry.ts` ·
`src/lib/settings-keys.ts` · `src/constants/rankings.ts` (solo el comentario de 2.2) · `tests/**` nuevos ·
`SQL-PARA-CORRER/ciclo-fase-1a/` · `docs/DB_SCHEMA.md` · `docs/features/ritmo-adaptativo.md` ·
`docs/features/campaigns.md` · `docs/PENDIENTES.md` · `ESTADO.md` · `CHANGELOG.md`.
**Fuera de esta lista no se toca**, en particular: los crons, `queue-drain`, `whatsapp.service.ts`, las plantillas
(`template-catalog.ts`, `template-texts.ts`), `src/constants/messaging.ts`, `vercel.json` y las pantallas. Si necesitas
algo de afuera, para y explícame por qué.

## 5. Reglas que no se rompen

- **Todo INSERT con `tenant_id` explícito.** Toda columna de sede nullable con FK COMPUESTA `ON DELETE RESTRICT`;
  `location_id` NULL se muestra, no se backfillea.
- Supabase JS: destructura siempre `error` y pásalo por `src/lib/db-failure.ts`.
- Postgres: si cambias la firma de una función existente, `DROP` primero (una sobrecarga deja la llamada vieja ambigua,
  42725). Un UNIQUE no protege columnas que pueden ser NULL.
- **La migración no se aplica.** No tocas Supabase de producción. No mandas ningún WhatsApp.
- Git: solo tus archivos, por nombre. Nunca `git add -A` ni `git add .`. Nunca cambies de rama, ni `stash`, ni
  `reset --hard`. Commits locales sí; push y deploy NO (son del dueño).

## 6. Cierre

1. `npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (di cuántos hay) · `npx vitest run` entero en verde
   (la última corrida completa conocida, antes de P1-a, dio 65 archivos / 929 tests; P1-a sumó más).
2. `docs/DB_SCHEMA.md` con las columnas, la tabla, los triggers y la función. `docs/features/ritmo-adaptativo.md`:
   el estado pasa a «base construida, sin envíos» y la tabla «Dónde vive» con archivos reales.
3. `docs/PENDIENTES.md`: la fase 1A sale de §2.4 y de §1; lo nuevo que encuentres, donde corresponda.
4. `ESTADO.md`: borra tu fila de §2 y deja en 0.CICLO lo que el dueño tiene que hacer: correr la consulta 1, **aplicar la
   migración ANTES del push**, correr la consulta 2.
5. `CHANGELOG.md`: una entrada de 15 líneas como máximo.
6. Commit de tus archivos por nombre. Después:
   `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 7. Tu respuesta final (el dueño se la pasa al comandante para revisarla)

- Si algo impide aplicar la migración o desplegar, dilo primero.
- Hash del commit, número de migración y lista exacta de archivos.
- Por cada punto de la sección 2: qué hiciste, archivo y línea, y el nombre del test.
- Cómo comprobaste que los tests fallan contra el código anterior, y cuántos fallaron.
- tsc, lint y vitest con números.
- Qué escritores de `last_visit_at` encontraste y si todos disparan el trigger.
- Lo que no coincida con el spec o con este prompt, aunque no lo hayas arreglado.
