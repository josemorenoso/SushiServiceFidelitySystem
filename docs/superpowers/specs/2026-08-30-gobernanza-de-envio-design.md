# Spec — Gobernanza de envío: presupuesto de línea, cola de goteo, salud de número y frenos automáticos

> **Fecha:** 2026-08-30
> **Estado:** propuesta — pendiente de aprobación del dueño
> **Migración nueva:** `00037_send_governance.sql` (la última aplicada es `00036_zernio_provider.sql`)
> **Feature docs a crear/actualizar:** `docs/features/send-governance.md` (nuevo),
> `docs/features/campaigns.md`, `docs/features/golden-bullet.md`, `docs/features/zernio-messaging.md`,
> `docs/API_DOCS.md`, `docs/DB_SCHEMA.md`, `docs/04-deployment.md`
> **Origen:** conversación con Zernio (2026-08-30) sobre coexistencia, plantillas, límites de Meta y
> quality rating. Decisión del dueño: **coexistencia** (la línea principal del restaurante), con frenos
> duros en código **antes** de la primera campaña real.

---

## 0. Cómo leer este documento

Está escrito para que una IA que **no** participó en la conversación pueda implementarlo. Si vas a
tocar código a partir de aquí:

1. Lee `CLAUDE.md` (protocolo obligatorio del proyecto) y `docs/02-architecture.md`.
2. Lee `docs/features/campaigns.md` y `docs/features/zernio-messaging.md`.
3. Lee este spec entero **antes** de escribir nada. Las secciones §2 y §3.3 contienen reglas de
   negocio de Meta que, implementadas mal, producen bloqueos de números reales de clientes reales.
4. Las decisiones abiertas están en §10. **No asumas ninguna** (Mandamiento I).

Lo que este spec **no** cubre: el rediseño del apartado de Plantillas (§12 de
`REQUERIMIENTOS_AGOSTO_2026.md`, primera prioridad) ni el de Campañas (§13). Este trabajo es la
**base** sobre la que ambos se apoyan: define cuántos mensajes puede emitir una línea y con qué
prioridad, no cómo se redactan ni cómo se ve la pantalla.

---

## 1. El problema

### 1.1 Lo que YA existe (no reconstruir)

El sistema **sí** tiene gobernanza de frecuencia, y es buena. Está en
[`src/constants/rewards.ts`](../../../src/constants/rewards.ts) y
[`src/services/campaign.service.ts`](../../../src/services/campaign.service.ts):

| Regla | Dónde | Qué hace |
|---|---|---|
| `FREQUENCY_CAP_DAYS = 7` | `constants/rewards.ts:10` | Un cliente no recibe dos campañas en menos de 7 días. Se evalúa contra `customers.last_campaign_at`. |
| `MONTHLY_MARKETING_CAP = 3` | `constants/rewards.ts:20` | Máximo 3 mensajes de marketing por cliente por mes calendario. Cuenta solo `MONTHLY_CAP_SOURCES = ['manual','calendar','reactivation','reward_reminder']`. |
| Blackout pre-evento | `campaign.service.ts` → `getActiveBlackouts()` | Si hay un evento del calendario en ≤ `blackout_days`, las campañas manuales excluyen clientes para reservarles cupo. |
| Exención de `reward_reminder` | `cron/reward-reminder/route.ts:33` | Exento del cap de 7 días: con ventanas de premio de 5–7 días el recordatorio nunca saldría. |
| Exención de cumpleaños | `campaign.service.ts` (comentario de `MONTHLY_CAP_SOURCES`) | Cumpleaños tiene prioridad absoluta, no cuenta contra el cap mensual. |
| Opt-out | `00021_customer_whatsapp_opt_out.sql` | `customers.whatsapp_opt_out_at`. Se evalúa en ambas ramas (Twilio y Zernio) dentro de `sendTemplateMessage()`. |
| Anti-reenvío Golden Bullet | `imported-contacts.service.ts` | Un teléfono ya presente en `imported_contacts` nunca se vuelve a contactar. |

**Todo eso se conserva.** Este spec no lo reemplaza: lo complementa y, en §3.6, lo hace configurable.

### 1.2 Lo que NO existe

Nada en el repositorio sabe que Meta impone un límite diario a la línea. Verificado:

- [`campaigns/manual/route.ts:202`](../../../src/app/api/dashboard/campaigns/manual/route.ts#L202) usa
  `BATCH_SIZE = 10`, pero es **concurrencia para no reventar el timeout de la función**, no un tope de
  destinatarios. El bucle recorre `finalEligible` **completo**.
- No hay ninguna tabla, columna, constante ni consulta que represente "cuántos mensajes puede emitir
  esta línea hoy".
- No hay cola: si una campaña no cabe, no se pospone — se intenta y falla.
- No hay ninguna métrica de calidad de Zernio. `docs/features/twilio-metrics.md` solo cubre Twilio, y
  `zernio-messaging.md` lista "Métricas de Zernio" explícitamente como pendiente.
- No hay registro **positivo** de consentimiento. Solo se guarda la fecha del opt-**out**.

### 1.3 El encuadre

> **Existe gobernanza de _demanda_ (cuántos mensajes recibe una persona).
> No existe gobernanza de _oferta_ (cuántos mensajes puede emitir una línea).**

Este spec construye la segunda. Son ejes independientes y ambos tienen que pasar: un envío sale solo
si el cliente lo permite **y** la línea tiene cupo.

---

## 2. Las reglas de Meta que el sistema debe obedecer

Estas no son decisiones de diseño. Son restricciones externas. Implementarlas mal cuesta el número del
cliente.

1. **El límite es de _destinatarios únicos_ por ventana _rodante_ de 24 horas**, no de mensajes ni por
   día calendario. Tres mensajes al mismo teléfono en 24h consumen **un** cupo, no tres. El sistema
   debe contar `DISTINCT phone`, y la ventana debe ser rodante (`now() - interval '24 hours'`), no
   "desde medianoche".
2. **El límite aplica a TODAS las categorías por igual.** Un mensaje de bienvenida (utility) consume el
   mismo cupo que una promo (marketing). Esta es la razón exacta por la que hace falta reservar
   capacidad: una campaña que gaste el límite completo deja al restaurante sin poder saludar a quien se
   registre esa tarde.
3. **Escalones de límite.** Una WABA sin verificar arranca en 250 destinatarios únicos/24h y sube al
   siguiente escalón por volumen con buena calidad o por verificación formal de negocio. **Los valores
   exactos de los escalones los define Meta y cambian**, así que el límite **se guarda como dato, no se
   codifica como constante** (§3.1). El default conservador es 250.
4. **Método de pago obligatorio en la WABA.** Sin él, Meta bloquea por completo los envíos iniciados
   por el negocio. No es un "debería", es un prerrequisito duro de cada alta.
5. **El quality rating (verde/amarillo/rojo)** lo determina el bloqueo/reporte de los destinatarios, no
   nuestro cumplimiento. La consecuencia habitual es **pausa temporal de una plantilla concreta** o
   reducción del límite — no baneo. El baneo del número viene de **violación de política** (enviar sin
   opt-in, contenido prohibido), que es un riesgo distinto y mucho más grave.

### 2.1 ⚠️ El riesgo más alto del producto, dicho explícitamente

**Golden Bullet + coexistencia es la combinación más peligrosa del sistema.**

`docs/features/golden-bullet.md` lo dice textual: *"estos contactos NO son clientes y NO han dado
consentimiento de marketing"*. Enviar plantillas de marketing a contactos sin opt-in es exactamente el
tipo de violación de política que produce **restricción del número** — el escenario grave del punto 5,
no el leve. Y con la decisión de coexistencia, ese número es la **línea principal de atención al
cliente del restaurante**.

Esto no lo resuelve un cap diario, y **ninguna mitigación técnica elimina el riesgo de política.**

**Decisión del dueño (2026-08-30): se permite, con advertencia explícita y envío diario bajo.** El
diseño que implementa esa decisión está en §3.4.1 — puerta de entrada por salud de línea, sub-cap
diario propio, y congelamiento al primer amarillo. La advertencia no es decorativa: es el mecanismo
por el cual el riesgo queda documentadamente aceptado por quien lo asume.

---

## 3. Diseño

### 3.1 Presupuesto de línea (Line Budget)

Cada tenant tiene un presupuesto diario **derivado, no almacenado**:

```
limite            = tenants.messaging_daily_limit      (sincronizado del proveedor, default 250)
p95_transaccional = percentil 95 de envíos transaccionales diarios de los últimos 14 días
reserva           = LEAST(
                      GREATEST(reserve_floor, ceil(p95_transaccional * 1.3)),
                      floor(limite * 0.5)
                    )
presupuesto_campana = limite - reserva
```

Con los defaults (`limite = 250`, `reserve_floor = 70`) y un tenant nuevo sin historial, esto da
exactamente **180 mensajes de campaña libre**, que es el número pedido por el dueño.

**Por qué la reserva no es un porcentaje fijo:** a 250/día reservar el 28% es correcto; a 10.000/día
reservar 2.800 para transaccional sería absurdo — un restaurante no hace 2.800 check-ins diarios. La
fórmula se auto-calibra contra el consumo transaccional real del tenant y solo usa el piso cuando no
hay historial. El tope del 50% impide que un pico transaccional anómalo mate todas las campañas.

Los tres parámetros son configurables por tenant en `admin_settings`:
`transactional_reserve_floor` (default `70`), `reserve_safety_factor` (default `1.3`),
`reserve_max_pct` (default `50`).

### 3.2 El punto de contabilidad: una reserva atómica

`sendTemplateMessage()` en [`whatsapp.service.ts`](../../../src/services/whatsapp.service.ts) sigue
siendo el **choke-point único** — igual que hoy para `is_demo` y opt-out. El chequeo de presupuesto va
ahí, en el mismo orden de guardas.

**Debe ser atómico.** Las campañas envían en paralelo (`BATCH_SIZE = 10`): un patrón
leer-contar-después-insertar tiene una condición de carrera que permite pasarse del límite. Por eso la
reserva es una **función de Postgres**, no lógica en TypeScript:

```
reserve_send_slot(p_tenant uuid, p_phone text, p_class text) RETURNS jsonb
```

En una sola transacción:

1. Si `line_status = 'frozen'` y `p_class <> 'transactional'` → `{granted:false, reason:'line_frozen'}`.
2. Si ese `phone` **ya tiene** reserva viva de ese tenant en las últimas 24h → `{granted:true, free:true}`.
   No consume cupo nuevo (regla §2, punto 1: destinatarios **únicos**).
3. Calcula `usados = COUNT(DISTINCT phone)` de las últimas 24h.
4. `transactional` → concede si `usados < limite`. Puede usar la reserva; es la razón de que exista.
5. `campaign` → concede si `usados < limite - reserva`, aplicando el multiplicador de throttle (§3.5).
6. Al conceder, inserta la fila en `send_reservations` **dentro de la misma transacción**.

La reserva se inserta **antes** del envío. Si el proveedor rechaza, la fila se marca
`released_at = now()` y deja de contar. Es deliberadamente conservador: preferimos desperdiciar un cupo
a pasarnos del límite.

### 3.3 Clases de mensaje y prioridad

`message_logs.message_type` ya existe con estos valores (`00020_message_logs.sql:34`). Se mapean a dos
clases de presupuesto y cinco niveles de prioridad:

| Prioridad | Clase | `message_type` | ¿Se encola si no hay cupo? |
|---|---|---|---|
| **P0** | `transactional` | `welcome`, `checkin`, `tier_unlocked`, `points_earned_near`, `points_earned_far`, `safe_reward`, `mystery_box`, `golden_box`, `delivery` | **Nunca.** Usa la reserva. Si ni la reserva alcanza, falla con `budget_exhausted`. |
| **P1** | `campaign` | `birthday`, `reward_reminder`, `calendar_event` | Sí, con `expires_at` corto. |
| **P2** | `campaign` | `reactivation` | Sí. |
| **P3** | `campaign` | `manual` | Sí. |
| **P4** | `campaign` | `import` (Golden Bullet) | Sí, bajo el régimen especial de **§3.4.1**: sub-cap propio, puerta de entrada por salud de línea, y la primera en congelarse. |

**P1 es sensible al tiempo, no "importante".** Un cumpleaños entregado mañana no vale nada; un
recordatorio de premio entregado después de que venció la ventana tampoco. Por eso van arriba de
reactivación y manual: no porque valgan más, sino porque **no se pueden posponer**. Si no caben antes
de `expires_at`, se descartan con estado `expired` — nunca se envían tarde.

**Cambio requerido:** hoy Golden Bullet registra `messageType: 'manual'`
([`imported-contacts.service.ts:324`](../../../src/services/imported-contacts.service.ts#L324)). Debe
pasar a `'import'` para poder distinguirlo y frenarlo aparte. Es un cambio de una línea, con impacto en
las consultas que agregan por `message_type`.

### 3.4 La cola de goteo

Reemplaza el comportamiento actual de "intentar todo de una". El flujo nuevo de una campaña:

```
380 clientes elegibles (ya filtrados por opt-out, cooldown, cap mensual, blackout)
        │
        ├─ presupuesto de campaña hoy: 180
        │
        ├─ 180 se envían ahora
        └─ 200 se INSERTAN en send_queue (status='queued', priority=3)
                 │
                 ├─ mañana el drenador toma 180
                 └─ pasado mañana toma los 20 restantes
```

La campaña arranca en `status='running'` y solo pasa a `completed` cuando su cola queda vacía. El
dashboard muestra *"180 de 380 enviados · 200 en cola · termina aprox. el 1 de septiembre"*.

**Reglas del drenador** (`POST /api/cron/queue-drain`):

- Ordena por `(priority ASC, not_before ASC, enqueued_at ASC)`, con **round-robin entre tenants** para
  que un tenant con 5.000 en cola no deje sin drenar a los demás.
- **Re-evalúa todas las guardas en el momento del envío, no al encolar.** Un cliente puede haber hecho
  opt-out, haber visitado el restaurante (y dejar de ser "inactivo"), o haber llegado a su cap mensual
  entre que se encoló y que le toca. Encolar no es un permiso permanente.
- Respeta un presupuesto de tiempo por invocación (≈50 s) y devuelve un cursor.
- `attempts` con backoff; a los 3 intentos fallidos → `status='failed'`.
- Un item cuyo `expires_at` ya pasó → `status='expired'`, nunca se envía.

**Anti-duplicado:** índice único parcial sobre `(tenant_id, phone, campaign_id) WHERE status='queued'`.

### 3.4.1 Golden Bullet: régimen especial (decisión del dueño, 2026-08-30)

Golden Bullet **se permite**, pero no comparte el régimen de las demás campañas. Es la única clase que
envía a personas que **no dieron consentimiento** (§2.1), así que corre bajo tres restricciones propias:

**1 · Puerta de entrada por salud de línea.** El wizard solo deja confirmar si se cumplen las tres:

```
line_status        = 'active'
quality_rating     = 'green'
messaging_daily_limit > 250      -- la línea ya subió de escalón: tiene historial probado
```

Si alguna falla, el wizard **bloquea** y explica cuál. Esto impide lo más peligroso del producto:
disparar una base fría desde una línea recién creada, sin reputación, el día del alta — que es
justamente cuando un tenant nuevo tiene más ganas de hacerlo.

**2 · Sub-cap diario propio**, dentro del presupuesto de campaña y más bajo que él:

```
cap_golden_bullet = GREATEST(10, floor(presupuesto_campana * golden_bullet_pct))
```

`admin_settings.golden_bullet_pct`, default **0.15**. A escalón 2.000 (presupuesto ≈ 1.900) da
~285/día. El 85 % restante queda para las campañas a clientes que **sí** consintieron: nunca se
canibaliza la comunicación legítima por una base fría.

**3 · Congelamiento al primer amarillo.** A diferencia de las demás clases, Golden Bullet **no espera
dos snapshots** (§3.5): en cuanto `quality_rating` deja de ser verde, sus items en cola pasan a
`status='cancelled'`. Es la causa más probable de una caída de calidad, así que es el primer
sospechoso y el primero en apagarse.

**La advertencia.** Antes de confirmar, el wizard exige que el usuario **escriba** una frase de
confirmación (no un checkbox — un checkbox se marca sin leer). El texto debe decir, sin suavizar: que
esos contactos no dieron consentimiento, que el envío se hace desde la línea principal de atención del
restaurante, y que una restricción de Meta afectaría también su atención al cliente. Lo aceptado queda
en `consent_events` con `channel='import'` y el texto exacto de la advertencia como evidencia.

**A escala — hay que ser honesto:** con el sub-cap del 15 %, una base de 5.000 contactos tarda
**~18 días** en escalón 2.000. En escalón 250 ni siquiera arranca (la puerta de entrada lo impide).
**Golden Bullet dejó de ser una bala y pasó a ser un goteo de semanas** — el wizard debe mostrar la
fecha estimada de finalización **antes** de confirmar, y el equipo de ventas tiene que saberlo para no
prometer resultados el mismo día.

### 3.5 Salud de línea y frenos automáticos

**Captura.** Dos fuentes, ambas escriben en `line_health_snapshots`:

- Poll periódico contra la API de Zernio (quality rating, límite vigente, estado de plantillas).
- Eventos del webhook de Zernio, si el proveedor los emite (**a verificar** — §10, D-4).

**Frenos.** Cambian `tenants.line_status`:

| Señal | `line_status` | Efecto |
|---|---|---|
| `quality = green` | `active` | Presupuesto completo. |
| `quality = yellow` en **2 snapshots consecutivos** | `throttled` | `presupuesto_campana × 0.5`. Transaccional intacto. |
| `quality = red` | `frozen` | Campañas a **0**. Transaccional sigue fluyendo con la reserva. Alerta al dashboard y al AIOS. |
| Plantilla pausada por Meta | (sin cambio) | Items en cola con esa plantilla → `not_before = now() + 6h`. La campaña que la usa se detiene. |
| Congelamiento manual (super-admin o AIOS) | `frozen` | Igual que rojo. |

**La histéresis es intencional:** amarillo exige dos snapshots seguidos (un amarillo aislado suele ser
ruido); rojo congela de inmediato.

**No hay des-congelamiento automático.** Volver a `active` es siempre una acción humana, con motivo
registrado. Reanudar solo porque la métrica mejoró es exactamente cómo se pierde un número: la campaña
que causó el rojo se reanuda y termina de hundirlo.

### 3.6 Gobernanza de frecuencia: rediseño de "normal vs agresiva"

Petición explícita del dueño. Hoy la distancia es una constante global única (`FREQUENCY_CAP_DAYS = 7`)
que aplica igual a todas las campañas. Se reemplaza por una **matriz de cooldown por clase**, en
`admin_settings.campaign_cooldown_days` (JSON), con estos defaults — que preservan el comportamiento
actual salvo donde se indica:

```json
{
  "manual": 7,
  "calendar": 5,
  "reactivation_soft": 7,
  "reactivation_aggressive": 3,
  "reward_reminder": 0,
  "birthday": 0,
  "import": null
}
```

`reactivation_aggressive` puede pisar más cerca (3 días) porque **regala un premio**: es una oferta con
valor, no otra promo. `0` = exento (comportamiento actual de recordatorio y cumpleaños). `null` = no
aplica (Golden Bullet es de un solo disparo por contacto, para siempre).

**Piso global nuevo:** `admin_settings.min_spacing_hours` (default **48**). Ninguna persona recibe dos
mensajes de marketing con menos de 48 h de diferencia, **sin importar la clase**. Sin esto, dos clases
con cooldowns distintos pueden aterrizar el mismo día. Es el "tiempo mínimo entre comunicaciones" del
plan del dueño, hecho explícito.

**El cap mensual (`MONTHLY_MARKETING_CAP = 3`) se mantiene como techo absoluto**, por encima de todo lo
anterior.

**Cambio de implementación:** el cooldown por clase no se puede evaluar contra
`customers.last_campaign_at` (es un único timestamp, "la última campaña cualquiera"). Hay que derivar
"cuándo recibió este cliente la clase X" desde `campaign_messages` ⋈ `campaigns.source`.
`last_campaign_at` se conserva para el piso global de `min_spacing_hours` y por compatibilidad.

### 3.7 Registro de consentimiento

Tabla `consent_events`, append-only. Un evento por cada opt-in y cada opt-out, con: fecha, canal
(`checkin_qr` / `whatsapp_reply` / `import` / `manual` / `staff`), **el texto exacto que vio el
cliente** cuando aceptó, y evidencia (`ip`, `user_agent`, `tenant_slug`, `location_id`, o la palabra
clave recibida en el caso del opt-out por WhatsApp).

Guardar el texto exacto importa: las plantillas y la pantalla de check-in van a cambiar (§12 de
requerimientos), y *"aceptó nuestros términos"* no sirve de evidencia si nadie sabe qué decían **ese
día**.

`customers.whatsapp_opt_out_at` se conserva como está — es lo que consultan las rutas calientes. La
tabla nueva es el libro de evidencia, no la ruta de lectura.

**Backfill:** los `customers` existentes reciben un evento `opt_in` sintético con
`channel='checkin_qr'`, `consent_text=null` y `evidence={"backfill":true,"inferred_from":"created_at"}`.
Marcado como inferido, nunca presentado como evidencia real.

### 3.8 Superficie para el AIOS

Siguiendo el patrón ya establecido en `00035`/`00036`: el rol `aios_constelarys` no gana acceso directo
a ninguna tabla, solo `EXECUTE` sobre funciones `SECURITY DEFINER` con `SET search_path = public, pg_temp`.

| Función | Para qué |
|---|---|
| `aios_line_health(p_slug text DEFAULT NULL)` | Lectura. Por tenant: `slug`, proveedor, número, `quality_rating`, `line_status`, `messaging_daily_limit`, consumo de las últimas 24 h, cupo de campaña disponible, profundidad de cola, plantillas pausadas, fecha del último snapshot. Sin `p_slug`, devuelve todos — es el tablero de emergencia pedido por el dueño. |
| `aios_set_line_status(p_slug, p_status, p_reason)` | Escritura. Congelar o reactivar una línea desde el panel del AIOS. Valida `p_status IN ('active','throttled','frozen')` y **exige `p_reason` no vacío** (queda en el historial). |

---

## 4. Modelo de datos — migración `00037_send_governance.sql`

```sql
-- 1. Estado de la línea, en tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS messaging_daily_limit     integer     NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS messaging_limit_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_rating            text        NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS line_status               text        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS line_status_reason        text,
  ADD COLUMN IF NOT EXISTS line_status_changed_at    timestamptz;
-- CHECK: quality_rating IN ('green','yellow','red','unknown')
-- CHECK: line_status    IN ('active','throttled','frozen')

-- 2. Ventana rodante de 24 h
CREATE TABLE send_reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone          text NOT NULL,
  message_class  text NOT NULL,            -- 'transactional' | 'campaign'
  reserved_at    timestamptz NOT NULL DEFAULT now(),
  released_at    timestamptz,              -- no-null = el envío falló, no cuenta
  message_log_id uuid REFERENCES message_logs(id) ON DELETE SET NULL
);
CREATE INDEX ON send_reservations (tenant_id, reserved_at DESC) WHERE released_at IS NULL;
CREATE INDEX ON send_reservations (tenant_id, phone, reserved_at DESC) WHERE released_at IS NULL;

-- 3. Cola de goteo
CREATE TABLE send_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone               text NOT NULL,
  customer_id         uuid REFERENCES customers(id) ON DELETE CASCADE,
  imported_contact_id uuid REFERENCES imported_contacts(id) ON DELETE CASCADE,
  campaign_id         uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  priority            smallint NOT NULL,    -- 1..4 (ver §3.3)
  message_type        text NOT NULL,
  template_sid        text NOT NULL,        -- nombre de plantilla si el proveedor es Zernio
  variables           jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_url           text,
  media_type          text,
  status              text NOT NULL DEFAULT 'queued',
  not_before          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz,
  attempts            smallint NOT NULL DEFAULT 0,
  last_error          text,
  enqueued_at         timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  message_log_id      uuid REFERENCES message_logs(id) ON DELETE SET NULL
);
-- CHECK: status IN ('queued','sent','failed','cancelled','expired')
CREATE UNIQUE INDEX ON send_queue (tenant_id, phone, campaign_id) WHERE status = 'queued';
CREATE INDEX ON send_queue (status, priority, not_before) WHERE status = 'queued';
CREATE INDEX ON send_queue (tenant_id, campaign_id, status);

-- 4. Historial de salud
CREATE TABLE line_health_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  quality_rating   text,
  messaging_limit  integer,
  paused_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  source           text NOT NULL,           -- 'zernio_api' | 'webhook' | 'manual'
  raw              jsonb
);
CREATE INDEX ON line_health_snapshots (tenant_id, captured_at DESC);

-- 5. Libro de consentimiento (append-only)
CREATE TABLE consent_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES customers(id) ON DELETE SET NULL,
  phone        text NOT NULL,
  event        text NOT NULL,               -- 'opt_in' | 'opt_out'
  channel      text NOT NULL,               -- 'checkin_qr'|'whatsapp_reply'|'import'|'manual'|'staff'
  consent_text text,
  evidence     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON consent_events (tenant_id, phone, occurred_at DESC);
```

**RLS:** las cinco tablas llevan RLS con aislamiento por `tenant_id`, siguiendo el patrón de las
migraciones existentes. `consent_events` además **niega UPDATE y DELETE a todo rol** — es append-only
por definición; un libro de evidencia que se puede editar no es evidencia.

**Funciones:** `reserve_send_slot()`, `release_send_slot()`, `line_budget()`, `aios_line_health()`,
`aios_set_line_status()`. Las dos últimas con `REVOKE ALL FROM PUBLIC` +
`GRANT EXECUTE TO aios_constelarys`.

**Retención:** `send_reservations` se poda a 7 días y `line_health_snapshots` a 90 días, en el mismo
cron del drenador.

---

## 5. Contratos de API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/cron/queue-drain` | `CRON_SECRET` | Drena la cola respetando presupuesto y prioridad. Devuelve `{processed, sent, skipped, expired, cursor}`. |
| `POST` | `/api/cron/line-health` | `CRON_SECRET` | Consulta el proveedor por cada tenant Zernio, escribe snapshot, aplica frenos. |
| `GET` | `/api/dashboard/line-budget` | Admin del tenant | `{limit, used_24h, reserve, campaign_budget, campaign_used, campaign_available, quality_rating, line_status, queue_depth}`. |
| `GET` | `/api/dashboard/send-queue` | Admin del tenant | Cola del tenant, filtrable por `campaign_id`/`status`. Paginada. |
| `DELETE` | `/api/dashboard/send-queue/[id]` | Admin del tenant | Cancela un item (`status='cancelled'`). |
| `POST` | `/api/dashboard/campaigns/estimate` | Admin del tenant | **Modificar el existente:** añadir `days_to_complete` y `first_day_count` al payload de respuesta. |
| `GET` | `/api/dashboard/consent-ledger` | Admin del tenant | Libro de consentimiento por teléfono o rango de fechas. Exportable a CSV. |
| `GET` | `/api/admin/line-health` | Super-admin | Todas las líneas. Espejo de `aios_line_health()` para el dashboard propio. |
| `POST` | `/api/admin/line-status` | Super-admin | Congelar/reactivar manualmente. Exige `reason`. |

---

## 6. Cambios en código existente

| Archivo | Cambio |
|---|---|
| [`src/services/whatsapp.service.ts`](../../../src/services/whatsapp.service.ts) | Insertar la guarda de presupuesto en `sendTemplateMessage()`, después de opt-out y antes del envío. Llamar a `release_send_slot()` cuando el proveedor rechaza. **Ambas ramas (Twilio y Zernio).** |
| [`src/app/api/dashboard/campaigns/manual/route.ts`](../../../src/app/api/dashboard/campaigns/manual/route.ts) | Partir `finalEligible` en "cabe hoy" / "va a la cola". No cambiar `BATCH_SIZE`. |
| [`src/services/campaign.service.ts`](../../../src/services/campaign.service.ts) | Cooldown por clase (§3.6). `finalizeCampaign()` deja de marcar `completed` si queda cola. |
| [`src/constants/rewards.ts`](../../../src/constants/rewards.ts) | `FREQUENCY_CAP_DAYS` y `MONTHLY_MARKETING_CAP` pasan a ser **defaults** de `admin_settings`, no valores fijos. Mantener el export para compatibilidad. |
| [`src/services/imported-contacts.service.ts`](../../../src/services/imported-contacts.service.ts) | `messageType: 'manual'` → `'import'`. Encolar en vez de enviar de golpe. Puerta de entrada, sub-cap y confirmación escrita de **§3.4.1**. Mostrar días estimados en el estimador de costo. |
| `src/components/dashboard/ImportedContactsUploader.tsx` + `ImportedContactsCostEstimator.tsx` | Bloqueo con motivo cuando la línea no pasa la puerta de entrada; fecha estimada de finalización; confirmación escrita en vez de checkbox (§3.4.1). |
| `src/app/api/cron/{birthday,reactivation,reward-reminder}/route.ts` | Encolar con `expires_at` en vez de fallar cuando no hay cupo. |
| [`src/services/calendar.service.ts`](../../../src/services/calendar.service.ts) | Igual: encolar con `expires_at` = fecha del evento. |
| `src/app/api/check-in/route.ts` | Escribir el evento `opt_in` en `consent_events` con el texto exacto mostrado. |
| `src/app/api/webhook/{twilio-incoming,zernio}/route.ts` | Escribir el evento `opt_out` (y el `opt_in` de reingreso) en `consent_events`, con la palabra clave recibida como evidencia. |
| `src/components/dashboard/` | Tarjeta de presupuesto y salud de línea; estado de cola en la vista de campaña. |
| `docs/04-deployment.md` | Documentar los dos workflows nuevos de n8n (§7). |

---

## 7. El scheduler — restricción crítica

**`vercel.json` tiene `"crons": []`.** No es un descuido: `docs/04-deployment.md` §5 documenta que los
crons corrían duplicados (Vercel nativo + n8n a la vez) y se dejó **n8n como disparador único**. Además
señala que una cadencia `*/15` en Vercel exigiría plan Pro.

Por lo tanto, los dos procesos nuevos son **workflows de n8n**, no crons de Vercel:

| Workflow | Cadencia | Llama a |
|---|---|---|
| **W4 — Queue Drainer** | cada 15 min | `POST /api/cron/queue-drain` con `CRON_SECRET` |
| **W5 — Line Health Poll** | cada 60 min | `POST /api/cron/line-health` con `CRON_SECRET` |

Ojo con la zona horaria: n8n usa UTC y Colombia es UTC−5 (ya documentado en §5 de deployment).

**Límite de escala, dicho con honestidad.** Una sola invocación serverless drenando todos los tenants
funciona en el orden de decenas de tenants. Con cientos, el presupuesto de ~50 s por invocación se
vuelve el cuello de botella y hace falta un worker de verdad (Vercel Queues, o un proceso en el VPS que
ya hospeda n8n). El diseño lo anticipa con el cursor y el round-robin, pero **no lo resuelve** — es
trabajo posterior, y conviene medirlo antes de asumir que hace falta.

---

## 8. Orden de implementación

Cada bloque es entregable y verificable por sí solo. No empezar el siguiente sin cerrar el anterior.

1. **Bloque 1 — Presupuesto (bloqueante del lanzamiento).**
   Migración `00037` (tablas 1 y 2), `reserve_send_slot()`, `line_budget()`, guarda en
   `sendTemplateMessage()`, endpoint `line-budget`, tarjeta en el dashboard.
   *Resultado:* ninguna línea puede pasarse del límite de Meta. Las campañas grandes **fallan
   limpio** en vez de quemar el número.
2. **Bloque 2 — Cola de goteo (bloqueante del lanzamiento).**
   Tabla `send_queue`, `/api/cron/queue-drain`, workflow W4, encolado en campaña manual y crons,
   estado de cola en el dashboard.
   *Resultado:* las campañas grandes se reparten en días en vez de fallar.
3. **Bloque 3 — Salud y frenos (bloqueante de la primera campaña real).**
   `line_health_snapshots`, `/api/cron/line-health`, workflow W5, transiciones de `line_status`,
   alertas.
4. **Bloque 4 — Consentimiento (bloqueante del alta de los 25).**
   `consent_events`, escritura en check-in y webhooks, backfill, libro exportable.
5. **Bloque 5 — Régimen de Golden Bullet (§3.4.1).**
   Depende del Bloque 3 (necesita `quality_rating` real para la puerta de entrada) y del Bloque 4
   (la confirmación escrita se guarda en `consent_events`). Sub-cap, bloqueo del wizard con motivo,
   confirmación escrita, congelamiento al primer amarillo.
   *Hasta que este bloque exista, Golden Bullet queda apagado con su feature flag
   (`admin_settings.golden_bullet_enabled = 'false'`, que ya es el default).*
6. **Bloque 6 — Superficie AIOS.**
   `aios_line_health()`, `aios_set_line_status()`, endpoints de super-admin.
7. **Bloque 7 — Frecuencia configurable.**
   Matriz de cooldown por clase, `min_spacing_hours`, UI en Ajustes.

Los bloques 1–4 son prerrequisito de las 25 altas. El 5 es prerrequisito de **usar Golden Bullet**, no
del alta. El 6 y el 7 pueden ir después del piloto.

---

## 9. Pruebas

Aplica TDD (`superpowers:test-driven-development`): la prueba primero, en cada punto.

**Unitarias / de integración contra la DB:**
- `reserve_send_slot()` bajo concurrencia: 20 llamadas en paralelo con `limite=10` conceden
  **exactamente** 10. Esta es la prueba más importante del spec.
- Segundo envío al mismo teléfono dentro de 24 h → `free:true`, no consume cupo.
- Ventana rodante: una reserva de hace 25 h no cuenta; una de hace 23 h sí.
- Transaccional puede consumir la reserva; campaña no.
- `line_status='frozen'` bloquea campaña y deja pasar transaccional.
- Cálculo de reserva: sin historial → `reserve_floor`; con p95 alto → el tope del 50 %.

**De cola:**
- 380 elegibles con presupuesto 180 → 180 enviados, 200 encolados, campaña `running`.
- Opt-out entre encolar y drenar → el item se salta y se marca `cancelled`.
- Item vencido → `expired`, nunca enviado.
- El índice único impide encolar dos veces el mismo teléfono en la misma campaña.
- Round-robin: dos tenants, uno con 5.000 en cola, el otro con 10 → el segundo drena el mismo día.

**De frenos:**
- Un amarillo aislado no cambia el estado; dos seguidos → `throttled` con presupuesto a la mitad.
- Un rojo → `frozen` inmediato.
- No existe ninguna ruta de código que devuelva `frozen` → `active` sin intervención humana.

**De Golden Bullet (§3.4.1):**
- Línea en escalón 250 → el wizard bloquea, con el motivo correcto.
- Línea verde en escalón alto → permite, y el sub-cap enviado es el 15 % del presupuesto de campaña.
- Un **solo** amarillo → los items `import` en cola pasan a `cancelled`, mientras las clases P1–P3
  siguen (esas sí esperan dos snapshots).
- La confirmación escrita queda en `consent_events` con el texto exacto de la advertencia.

**Regresión obligatoria:** los cuatro tenants Twilio existentes (Sushi Service, Don Alirio, Frangal,
Demo) deben comportarse **igual que antes** salvo por la nueva guarda de presupuesto. Es la misma
invariante que ya exige `zernio-messaging.md` §"Invariantes de seguridad" punto 5.

---

## 10. Decisiones abiertas — requieren respuesta del dueño

**No implementar ninguna de estas por suposición** (Mandamiento I).

- ~~**D-1 · Golden Bullet y coexistencia (§2.1).**~~ ✅ **RESUELTA (2026-08-30):** se permite, con
  advertencia explícita y envío diario bajo. Diseño implementado en **§3.4.1** (puerta de entrada por
  salud de línea, sub-cap del 15 %, congelamiento al primer amarillo, confirmación escrita).
- **D-2 · La billetera (decisión "B", todavía abierta).** Con Meta cobrándole directo al restaurante,
  `trg_debit_wallet` sigue cobrando $100 COP por mensaje: el restaurante **paga dos veces**. ¿La
  billetera se apaga para tenants Zernio, se re-tarifa, o pasa a ser cuota de plataforma? Afecta el
  precio que se les cotiza a los 25 y **debe resolverse antes de la primera alta Zernio**.
- **D-3 · Reserva transaccional en el alta.** ¿`reserve_floor = 70` es el default para todos, o el
  equipo de ventas lo ajusta por tamaño de restaurante?
- **D-4 · Señales de calidad en Zernio.** ¿Zernio expone quality rating y límite de mensajería por API
  o webhook? **Verificable hoy** con la API key ya disponible, sin gastar dinero. Si no los expone, el
  Bloque 3 necesita otra fuente (Meta Business Manager manual) y hay que rediseñarlo.
- **D-5 · Cooldown agresivo.** ¿3 días es correcto para `reactivation_aggressive`, o el dueño quiere
  otro número? El default propuesto es una sugerencia, no una decisión tomada.
- **D-6 · Qué hacer cuando una campaña se cancela a medias.** Si el dueño cancela una campaña con 200
  items en cola, ¿se descartan todos, o los ya encolados se respetan?

---

## 11. Fuera de alcance

- Rediseño del apartado de Plantillas (§12 de requerimientos) y de Campañas (§13).
- Métricas de entregabilidad de Zernio equivalentes a `twilio-metrics` — es un frente aparte, ya
  listado como pendiente en `zernio-messaging.md`.
- El flujo real de Embedded Signup y compra de número (vive en el AIOS, repo separado).
- Migrar los cuatro tenants Twilio a Zernio.
- Worker dedicado para escalas de cientos de tenants (§7).
