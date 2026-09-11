# Feature: Gobernanza de envío — presupuesto de línea

**Agregado:** v2.11.0 — 2026-08-30
**Migración:** `00037_send_governance.sql` (requiere `00036_zernio_provider.sql` aplicada antes)
**Spec:** [`docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md`](../superpowers/specs/2026-08-30-gobernanza-de-envio-design.md)
**Ver también:** `docs/features/campaigns.md`, `docs/features/zernio-messaging.md`,
`docs/features/wallet-billing.md`, `docs/features/golden-bullet.md`

---

## Objetivo

Que **ninguna línea de WhatsApp pueda pasarse del límite diario de Meta**, y que una campaña masiva
nunca deje al restaurante sin capacidad para saludar a quien se registre esa tarde.

## El encuadre

> **El repo ya gobernaba la DEMANDA. No gobernaba la OFERTA.**

Antes de 00037 existían —y siguen existiendo— reglas que limitan **cuántos mensajes recibe una
persona**: `FREQUENCY_CAP_DAYS = 7`, `MONTHLY_MARKETING_CAP = 3`, el blackout pre-evento del
calendario y el opt-out. Todo eso se conserva sin cambios.

Lo que **no** existía era nada que supiera **cuántos mensajes puede emitir la línea**. Una campaña
recorría su lista completa (`campaigns/manual/route.ts` itera `finalEligible` entero; `BATCH_SIZE = 10`
es concurrencia, no un tope) y, pasado el límite de Meta, los envíos empezaban a fallar — degradando
la calidad de la línea principal del restaurante.

Son **ejes independientes**: un envío sale solo si el cliente lo permite **y** la línea tiene cupo.

## Las tres reglas de Meta que esto implementa

1. **Destinatarios ÚNICOS, ventana RODANTE de 24h.** Tres mensajes al mismo teléfono consumen **un**
   cupo, no tres. Por eso el conteo es `COUNT(DISTINCT phone)` sobre `now() - interval '24 hours'`, y
   no un contador por día calendario.
2. **Todas las categorías consumen el mismo cupo.** Una bienvenida (utility) pesa igual que una promo
   (marketing). **Esta es la razón de que exista la reserva.**
3. **El límite cambia por escalón y lo define Meta.** Por eso vive en
   `tenants.messaging_daily_limit` como dato sincronizable, **no** como constante en el código.

## El presupuesto

```
limite            = tenants.messaging_daily_limit          (default 250)
p95_transaccional = percentil 95 del consumo transaccional diario, últimos 14 días
reserva           = LEAST( GREATEST(piso, ceil(p95 * factor)), limite * max_pct )
presupuesto_campana = limite - reserva
```

Con los defaults (`limite = 250`, `piso = 70`) y un tenant sin historial: **180 de campaña libre**.
El 180 **no está hardcodeado** — es `250 - 70`. Si la línea está en un escalón de 2.000, el mismo
cálculo da ~1.930 de campaña libre, porque la reserva se calibra contra el consumo transaccional real
y no contra un porcentaje del límite.

### Límite desconocido (`enforced: false`)

`tenants.messaging_daily_limit` admite **NULL = no sabemos cuál es el límite de esta línea**. En ese
estado el sistema **contabiliza el consumo pero no bloquea ningún envío**.

Es el estado en el que quedan los tenants que ya existían cuando se aplicó la 00037 (Sushi Service,
Don Alirio, Frangal, Demo). **Es deliberado y es importante:** un `ADD COLUMN ... DEFAULT 250` rellena
también las filas existentes, y eso habría capado de golpe en 250 a líneas que hoy mueven del orden de
2.000 mensajes diarios — cortándoles las campañas a clientes en producción por un default nuestro.

Por eso la columna nace sin default y el `DEFAULT 250` se agrega **después**, de modo que solo aplica a
los tenants **nuevos**, donde 250 sí es el valor real de una WABA recién creada sin verificar.

**Para activar el tope en un tenant existente**, hay que poner su límite real:

```sql
-- Solo cuando conozcas el escalón real de esa WABA en Meta.
UPDATE tenants SET messaging_daily_limit = 2000, messaging_limit_synced_at = now()
 WHERE slug = 'sushi-service';
```

Mientras tanto, `GET /api/dashboard/line-budget` devuelve `enforced: false` y el consumo medido — que
es justamente el dato que hace falta para elegir bien ese número. Cuando exista el Bloque 3, el poll de
salud sincroniza el valor solo.

| Parámetro (`admin_settings`) | Default | Qué hace |
|---|---|---|
| `transactional_reserve_floor` | `70` | Piso de la reserva cuando no hay historial |
| `reserve_safety_factor` | `1.3` | Colchón sobre el p95 observado |
| `reserve_max_pct` | `50` | Techo: la reserva nunca se come más de la mitad del límite |

**Por qué no es un porcentaje fijo:** a 250/día reservar el 28 % es correcto; a 10.000/día reservar
2.800 sería absurdo — ningún restaurante hace 2.800 check-ins diarios. La fórmula se auto-calibra
contra el consumo real y solo usa el piso cuando el tenant es nuevo.

> **Nota de implementación:** el p95 se calcula sobre `message_logs` (larga vida), **no** sobre
> `send_reservations`, que se poda a 7 días y no alcanzaría para una ventana de 14.

## La reserva atómica

`sendTemplateMessage()` sigue siendo el **choke-point único**. La guarda va **después del opt-out** en
ambas ramas (Twilio y Zernio): un cliente que pidió SALIR no debe consumir uno de los cupos del día.

```
is_demo ──► (simulado, NO consume cupo)
   │
   ├─ zernio ─► config ─► opt-out ─► RESERVA ─► envío ─► (falla: release)
   └─ twilio ─► config ─► opt-out ─► RESERVA ─► envío ─► (falla: release)
```

**La atomicidad es obligatoria y vive en Postgres, no en TypeScript.** Las campañas envían en paralelo
(`BATCH_SIZE = 10`); un patrón leer-contar-insertar tiene una carrera que permite pasarse del límite.
`reserve_send_slot()` toma un `pg_advisory_xact_lock` por tenant que serializa la decisión y se libera
al cerrar la transacción (cada RPC de supabase-js es su propia transacción).

**No quitar ese lock.** Es lo único que impide pasarse del límite bajo carga.

### Fallo cerrado

A diferencia de `recordMessageLog()` —que es best-effort y nunca debe romper un envío—, la guarda de
presupuesto **falla cerrado**: si no se puede confirmar que hay cupo, **no se envía**
(`error_code = 'budget_check_failed'`).

Es deliberado. Perder un mensaje de bienvenida por una caída de la base es un problema menor;
pasarse del límite de Meta repetidamente le restringe el número al cliente — y con coexistencia, ese
número es su línea principal de atención.

Por la misma razón, el `release` es best-effort: desperdiciar un cupo nunca le restringe el número a
nadie; pasarse sí.

## Clases y prioridades

Fuente única de verdad: la tabla `message_class_map`, con espejo en
[`src/constants/messaging.ts`](../../src/constants/messaging.ts). **Si agregas un tipo, agrégalo en
los dos lados.**

| Prioridad | Clase | Tipos |
|---|---|---|
| P0 | `transactional` | `welcome`, `checkin`, `tier_unlocked`, `points_earned_near`, `points_earned_far`, `safe_reward`, `mystery_box`, `golden_box`, `delivery`, `low_balance` |
| P1 | `campaign` | `birthday`, `reward_reminder`, `calendar_event`, `event` |
| P2 | `campaign` | `reactivation` |
| P3 | `campaign` | `manual` |
| P4 | `campaign` | `import` (Golden Bullet) |

**P1 es sensible al tiempo, no "importante":** un cumpleaños entregado mañana no vale nada.

Un `message_type` desconocido cae en `campaign` / P3 — la opción **conservadora**: queda sujeto al
presupuesto de campaña (más estrecho) en vez de poder consumir la reserva transaccional.

## La billetera, para tenants Zernio (decisión D-2)

`debit_wallet_on_message_sent()` ahora **se salta a los tenants `messaging_provider = 'zernio'`**. Con
Zernio, Meta le factura los mensajes directo al restaurante contra el método de pago de su propia
WABA; cobrarle además la tarifa de la billetera sería cobrarle dos veces. El modelo comercial pasa a
suscripción mensual variable.

**La billetera de los 4 tenants Twilio (Sushi Service, Don Alirio, Frangal, Demo) queda intacta** — el
trigger es copia fiel del de `00033` con una sola guarda añadida, incluido su `EXCEPTION WHEN OTHERS`
(el ledger nunca puede tumbar el registro de un mensaje ya enviado).

**Detalle que hace esto posible ahora y no antes:** la billetera también funcionaba como freno de
gasto (*"una campaña masiva se bloquea cuando el tenant no tiene con qué pagarla"*). El presupuesto de
línea la reemplaza en esa función, y frena contra el límite real de Meta en vez de contra el saldo.

## Superficie para el AIOS

Patrón de `00035`/`00036`: el rol `aios_constelarys` no gana acceso directo a ninguna tabla, solo
`EXECUTE` sobre funciones `SECURITY DEFINER`.

| Función | Qué hace |
|---|---|
| `aios_line_health(p_slug)` | Lectura. Sin `p_slug` devuelve **todas** las líneas: calidad, estado, límite, consumo 24h, cupo disponible, profundidad de cola. Es el tablero de emergencia. |
| `aios_set_line_status(p_slug, p_status, p_reason)` | Congela o reactiva una línea. **Exige motivo no vacío**, que queda en el historial. |

---

# La cola de goteo (Bloque 2)

**Agregado:** v2.13.0 — 2026-08-30 · **Migración:** `00038_send_queue_drain.sql`

## Qué cambia

Antes del Bloque 2, una campaña de 380 destinatarios con presupuesto 180 enviaba 180 y marcaba los
otros 200 como `failed` con `error_code = 'campaign_budget_exhausted'`. **Se perdían.**

Ahora:

```
380 elegibles (ya filtrados por opt-out, cooldown, cap mensual)
   ├─ presupuesto de campaña hoy: 180
   ├─ 180 se envían ahora
   └─ 200 entran en send_queue (status='queued', priority=3)
          ├─ mañana el drenador toma los que quepan
          └─ y así hasta vaciarla
```

La campaña queda en `status='running'` mientras gotee, y solo pasa a `completed` cuando su cola se
vacía. Marcarla `completed` con 200 pendientes le mentiría al operador.

## El drenador

`POST`/`GET /api/cron/queue-drain` — se dispara **cada 15 min**.

> **Quién lo dispara — histórico (hasta 2026-09-02).** El único disparador era n8n (workflow W4,
> `n8n/cron_queue-drain.json`), no Vercel: `vercel.json` tenía `"crons": []` desde el 2026-07-05, la
> decisión que zanjó el doble disparo de `birthday`/`reactivation` (ver `docs/04-deployment.md` §2).
> Para `queue-drain` pesaba además otra razón: el equipo de Vercel estaba en plan **Hobby**, que solo
> admite crons diarios — una expresión `*/15` hace **fallar el build**.
>
> **Cambio del 2026-09-02.** `vercel.json` ya **declara** los 5 crons, `queue-drain` entre ellos, con la
> cadencia calcada 1:1 de los Schedule Trigger de n8n (`*/15 * * * *`): **cero cambio de cadencia**.
> Vercel Cron invoca **GET** y manda solo `Authorization: Bearer $CRON_SECRET`, que es exactamente lo
> que valida `validateCronSecret()`, y el endpoint ya exportaba `GET` y `POST` — por eso **no cambia una
> sola línea de código de negocio**.
>
> **Estado real:** el commit es **local y sin push**; el disparo efectivo empieza cuando esto se
> despliegue a producción **con el plan Pro activo**. Hasta entonces, quien dispara sigue siendo n8n.
>
> ⚠️ **Un cron en `vercel.json` y su Schedule Trigger de n8n activos a la vez = doble disparo** — es
> la misma piedra de julio. Por eso los 5 triggers de n8n ("Cron Cumpleaños", "Cron Reactivación",
> "Cron Recordatorio de Premios", "Cron Calendario" y el de la cola de goteo) se apagan en el **mismo
> movimiento** del despliegue. Hoy siguen encendidos.
>
> El VPS de n8n **no se apaga**: sigue sirviendo domicilios (W1, webhook en caliente desde
> `twilio-incoming` y `zernio` hacia `N8N_DOMICILIOS_WEBHOOK_URL`). Eso es la Fase 2 y aún no está hecha.

Orden de trabajo de cada invocación:

1. **Vencer.** `expire_send_queue()` marca `expired` lo que pasó su `expires_at`. Va primero: no
   tiene sentido gastar cupo en un cumpleaños de ayer.
2. **Listar tenants** con cola pendiente (`send_queue_pending_tenants()`), ordenados por urgencia:
   primero la prioridad más alta y, a igualdad, el de cola más corta — así un tenant con 5.000 items
   no deja sin drenar a los demás.
3. **Round-robin**: una tanda pequeña de cada tenant por vuelta, hasta agotar el presupuesto de
   tiempo (**240 s** desde el 2026-09-11; era 50 s, el techo de Hobby, y con eso un bloque de
   1.400 de Golden Bullet tardaba tres horas: ~200 por corrida) o la cola.
4. Por tenant: leer el presupuesto de línea **en cada vuelta** (entre tanda y tanda pueden haber
   salido bienvenidas que consumieron límite), reclamar `min(disponible, 20)` items (era 10; Meta
   acepta 80 msg/s por número), re-evaluar las guardas, enviar, aplicar los efectos posteriores.
5. **Podar** las tablas de retención.

Devuelve `{ processed, sent, failed, skipped, expired, tenants, has_more, cursor }`.

### El reclamo (claim) — por qué existe

El disparo es cada 15 min, pero una invocación lenta puede solaparse con la siguiente, y n8n reintenta
ante un timeout de red. Sin protección, las dos corridas leen los mismos items `queued` y **el
cliente recibe el mensaje dos veces**.

`claim_send_queue()` lo resuelve con `FOR UPDATE SKIP LOCKED`: la segunda invocación **salta** las
filas que la primera bloqueó, en vez de esperarlas. Las dos se reparten la cola.

Esto hace de `queue-drain` el **único** de los 5 crons que tolera un doble disparo: si por accidente
quedaran activos a la vez el cron de Vercel y el Schedule Trigger de n8n, se repartirían la cola en vez
de duplicar envíos. **Los otros 4 no tienen esa garantía** — por eso el apagado de los triggers de n8n
va en el mismo movimiento del despliegue, no después.

El estado de "reclamado" es un **arriendo** (`claimed_at`), no un estado nuevo en el CHECK de
`status`. Un arriendo vencido (10 min) se vuelve a tomar solo, así que un drenador que muera a mitad
no deja items clavados para siempre.

### Encolar NO es un permiso permanente

**Ésta es la regla que gobierna el drenador.** Entre que un cliente entra en la cola y que le toca su
turno pueden pasar días. Puede haber hecho opt-out, haber recibido otra campaña, o haber llegado a su
cap mensual. Por eso las guardas se re-evalúan **al enviar**:

| Guarda | Qué pasa si ya no la cumple |
|---|---|
| Opt-out (`whatsapp_opt_out_at`) | `cancelled` |
| El cliente ya no existe | `cancelled` |
| Frequency cap (recibió otra campaña) | `cancelled` — salvo `birthday` y `reward_reminder`, exentos por diseño |
| Cap mensual | `cancelled` |

`cancelled` **no es un fallo**: no consume intentos ni vuelve a la cola. Un fallo de envío sí:
vuelve con backoff (15 min → 1 h → 4 h) y se rinde como `failed` al tercer intento.

> **Limitación honesta:** `sendTemplateMessage()` devuelve `null` para *todos* sus modos de fallo
> (sin credenciales, opt-out, cupo agotado, rechazo del proveedor). El drenador no puede
> distinguirlos, así que trata cualquier `null` como reintentable. Es conservador a propósito:
> reintentar tres veces cuesta milisegundos; cancelar por error pierde el mensaje para siempre.

### Anti-duplicado

El índice de `00037` era `(tenant_id, phone, campaign_id) WHERE status='queued'`. En Postgres **dos
NULL nunca colisionan** en un índice único, así que los items encolados por un cron (sin
`campaign_id`) no tenían protección: dos corridas del mismo cron encolaban el mismo teléfono dos
veces. `00038` lo reemplaza por
`(tenant_id, phone, COALESCE(campaign_id, centinela), message_type) WHERE status='queued'`.

Se añade `message_type` para no impedir lo legítimo: un cliente sí puede tener a la vez en cola su
cumpleaños y una campaña manual.

> **Por qué el encolado pasa por una función SQL y no por `.upsert()`:** el `onConflict` de
> supabase-js solo admite una lista de columnas, así que nunca podría apuntar a un índice **parcial
> sobre una expresión**. PostgREST caería en la clave primaria y el anti-duplicado no se aplicaría
> jamás, en silencio. `enqueue_send_queue()` usa `ON CONFLICT DO NOTHING` **sin destino**, que
> absorbe la violación de cualquier índice único de la tabla.

## Qué encola hoy, y qué no

| Emisor | ¿Encola? | Por qué |
|---|---|---|
| Campaña manual | ✅ Sí | Es el escenario del spec §3.4. |
| `birthday` | ❌ Todavía no | Ver la pregunta abierta al final. |
| `reactivation` | ❌ Todavía no | Variables volátiles (fecha límite del premio) y un efecto posterior: `grantReward()`. Si el envío se difiere, **¿cuándo se otorga el premio?** No está decidido. |
| `reward_reminder` | ❌ Todavía no | `days_left` caduca: encolar hoy y enviar en dos días manda un número mentiroso. Y `markReminderSent()` tendría que moverse al drenaje. |
| `calendar_event` | ✅ Sí (2026-09-06) | Envía lo que cabe en el presupuesto del día y encola el resto. La media provider-aware se resuelve al encolar: `media_url` guarda la URL pública COMPLETA (la que Zernio necesita como `headerMediaUrl`) y `{{6}}` viaja en `variables` solo para Twilio. `expiresAt` = fin del día del evento (P1). |
| Golden Bullet (`import`) | ✅ Sí (2026-09-10) | Es el Bloque 5. **Ya NO envía nada dentro del request**: encola la base entera repartida en bloques diarios (D-7) y el drenador la saca al ritmo del cupo. El reparto es un `not_before` escalonado, así que este bucle no cambió. Ya registra `messageType: 'import'` (P4). Ver [`golden-bullet.md`](golden-bullet.md). |

**El drenador ya sabe enviar cualquiera de esos tipos** — lo que falta es decidir qué variables se
congelan y cuáles se recalculan al drenar, y dónde van los efectos posteriores.

> **`calendar_event` está exento del frequency cap al drenar**, junto a `birthday` y
> `reward_reminder`, pero por una razón distinta: el camino inmediato de `executeAutoEvent()`
> **nunca** aplicó ese cap. Si el drenador se lo aplicara, la mitad encolada de un mismo evento se
> comportaría distinto de la mitad que salió al instante — quedaría sin invitación justo quien cayó
> de último en la lista. El cap MENSUAL sí se re-evalúa en los dos caminos.
>
> **Y con esto `calendar-dispatch` deja de ser el eslabón frágil del doble disparo:** su reclamo
> ahora comprueba el conteo de filas afectadas (`claimScheduledEvent()`, ver más abajo el §243 y
> `docs/features/calendar.md`).

## Endpoints

| Método | Ruta | Auth |
|---|---|---|
| `POST`/`GET` | `/api/cron/queue-drain` | `CRON_SECRET` |
| `GET` | `/api/dashboard/send-queue` | Admin del tenant |
| `DELETE` | `/api/dashboard/send-queue/[id]` | Admin del tenant |

`GET /api/dashboard/line-budget` ahora incluye además `queueDepth`.

### Dónde lo ve el cliente (2026-09-09)

`CupoEnvioCard` (`src/components/dashboard/CupoEnvioCard.tsx`), encima de las pestañas de
**`/dashboard/campaigns`** — o sea, en la misma pantalla desde la que se dispara un envío, y
visible también en la pestaña «Manuales». Muestra el consumo de las 24 h, cuánto queda para
campañas, y **avisa antes del cero**: ámbar al 75 % del tope, rojo al agotarse o con la línea
congelada. Reusa `/api/dashboard/line-budget` tal cual — no recalcula nada.

Existe porque el dato solo vivía en `/dashboard/conexiones`, y esa pantalla se cae entera a «No
hay conexiones que mostrar» cuando `/api/dashboard/conexiones` niega el acceso: `isTenantOwner()`
es fail-closed y **`owner_email` está vacío en las cinco marcas vivas**, así que hoy solo la abre
el super-admin. El cliente no tenía ninguna pantalla donde enterarse de que estaba por quedarse
mudo — y el fallo es CERRADO y silencioso.

No pide sede a propósito: el cupo es de la **marca** y lo comparten todas las sedes (**D6**).
Repartirlo por local es **F9**, y no está construido.

El `DELETE` **no borra la fila**: la pasa a `cancelled`. La cola es el registro de qué se decidió
enviar y qué pasó con cada intento; borrar filas dejaría al operador sin poder explicar por qué una
campaña envió 180 de 380. Cancelar además libera el hueco del índice único (que solo cubre
`queued`), así que ese teléfono se puede volver a encolar.

## La billetera y los tenants Zernio — la otra mitad de D-2

`00037` apagó el **cobro** a tenants Zernio (el trigger `debit_wallet_on_message_sent()` los salta),
pero `canSendBulk()` seguía **bloqueando** sus campañas por saldo insuficiente. Como su saldo se
queda en 0 para siempre —no entran recargas ni salen débitos—, **toda campaña masiva de todo tenant
Zernio se habría rechazado con 409 «Saldo insuficiente»**.

`canSendBulk()` ahora exime a los tenants `messaging_provider='zernio'`. Es la otra mitad de la misma
decisión, no una nueva. No los deja sin freno: el presupuesto de línea lo reemplaza, y frena contra
el límite real de Meta en vez de contra la plata.

## Blindaje de permisos de 00037 (corregido antes de aplicar)

La versión original de `00037` revocaba `PUBLIC` solo en las dos funciones del AIOS y **se olvidaba
de las cuatro del núcleo**. Como Postgres concede `EXECUTE` a `PUBLIC` por defecto y las cuatro son
`SECURITY DEFINER`, quedaban invocables por `anon` —el rol de la `NEXT_PUBLIC_SUPABASE_ANON_KEY`, que
viaja en el bundle del navegador— vía RPC de PostgREST, ejecutándose con los privilegios del dueño.

Lo grave no era la lectura: **`prune_send_governance()` BORRA `send_reservations`, y borrar reservas
reinicia la ventana rodante de 24 h.** El freno que toda esta migración construye se podía desactivar
desde fuera con una clave pública. Se verificó con el harness de pruebas: `SET ROLE anon` la
ejecutaba y devolvía `{reservations_deleted: 1, snapshots_deleted: 1}`.

Corregido en el bloque 13 de `00037` (la migración **no estaba aplicada** todavía) y fijado con
`tests/db/permisos.test.ts`.

## Archivos

- `supabase/migrations/00037_send_governance.sql`, `00038_send_queue_drain.sql`
- `src/constants/messaging.ts`
- `src/services/line-budget.service.ts`, `src/services/send-queue.service.ts`
- `src/services/whatsapp.service.ts` (guarda en ambas ramas + release en fallo)
- `src/services/campaign.service.ts` (`passesFrequencyCap`, `isInRecoveryZone`)
- `src/services/wallet.service.ts` (exención Zernio en `canSendBulk`)
- `src/app/api/cron/queue-drain/route.ts` (+ marcado de contactos importados)
- `src/services/line-health.service.ts`, `src/app/api/cron/line-health/route.ts` (Bloque 3)
- `src/services/club-optin.service.ts` (los botones de la plantilla de Golden Bullet)
- `src/app/api/dashboard/line-budget/route.ts`, `send-queue/route.ts`, `send-queue/[id]/route.ts`
- `src/app/api/dashboard/campaigns/manual/route.ts` (split enviar-hoy / encolar)
- `n8n/cron_queue-drain.json` (W4 — disparador vigente hasta que el despliegue con Pro encienda el cron
  de Vercel y se apague este trigger)
- `vercel.json` (declara el cron `*/15 * * * *` de `queue-drain` desde 2026-09-02)
- `tests/` — ver `docs/features/testing.md`

## Pendiente (bloques siguientes del spec)

- ~~**Bloque 3 — salud y frenos.**~~ ✅ **HECHO (2026-09-10).**
  `/api/cron/line-health`, cada hora, escribe `line_health_snapshots` y sincroniza
  `tenants.messaging_daily_limit`, `quality_rating` y `line_status`.

  **Por qué era el más urgente de los que quedaban:** las 5 marcas vivas tenían el límite
  en `NULL`. O sea que todo el freno que construyó la 00037 estaba **medido y apagado**,
  no porque fallara, sino porque nadie escribía esas dos columnas.

  **De dónde sale el dato — verificado en los dos proveedores, no de memoria:**

  | Proveedor | Ruta | Campos |
  |---|---|---|
  | Twilio | `GET /v2/Channels/Senders` (SDK v5.13.1, ya instalado) | `properties.qualityRating`, `properties.messagingLimit` |
  | Zernio | `GET /v1/whatsapp/number-info?accountId=` | `phone.quality_rating`, `phone.messaging_limit_tier` (D-4) |

  Twilio es la fuente de 4 de las 5 marcas. Se lista y se empareja por número porque el
  repo **no guarda el SID del sender** en ninguna columna.

  ⚠️ **De Zernio nunca se ha visto una respuesta real con un número conectado** — los
  nombres de campo salen del OpenAPI. Por eso se parsea con tolerancia (las dos
  convenciones de nombre) y se guarda la respuesta cruda en `line_health_snapshots.raw`:
  el primer sondeo de verdad se audita mirando esa columna, no adivinando.

  **La regla que gobierna el sondeo: solo puede APRETAR.** Rojo congela de inmediato;
  dos amarillos seguidos estrangulan; **verde no reactiva a nadie**, ni desde `frozen` ni
  desde `throttled`. Si la métrica mejoró porque la campaña dejó de enviar, reactivarla
  automáticamente vuelve a poner en marcha exactamente lo que causó la caída. Volver a
  `active` es siempre humano, con motivo escrito (`aios_set_line_status`). Esa asimetría
  es lo que hace seguro correr esto cada hora sin supervisión.

  **Lo que NO entiende, no lo escribe.** Un escalón que no se parsea queda en `null`, que
  deja el freno apagado. Inventar un número le cortaría las campañas a una marca que sí
  tenía cupo — el desastre exacto contra el que esta misma página advierte más arriba.

  **Modo ensayo:** `GET /api/cron/line-health?dry=1` devuelve lo que escribiría, sin
  escribir. Existe porque este endpoint toca el freno de marcas en producción; conviene
  correrlo así la primera vez y mirar la salida antes de dejarlo suelto.

  > ⚠️ **El estado de las plantillas sigue teniendo otro dueño — no se duplicó.** Toda la
  > promoción vive detrás de `applyProviderTemplateStatus()` en `template.service.ts`, el
  > único código autorizado a mover `admin_settings.*_template_sid`. Este sondeo escribe
  > `paused_templates: []` y **no toca punteros**. Cuando se le agregue la lectura de
  > plantillas, tiene que LLAMAR a esa función, no escribir su propia promoción.

- **Bloque 4 — consentimiento.** `consent_events` existe; falta escribir en él desde check-in y
  webhooks, y el backfill.
- ~~**Bloque 5 — régimen de Golden Bullet**~~ ✅ **HECHO (2026-09-10)**, en la forma que
  fijó **D-7**, no en la del §3.4.1: el techo del bloque diario es el presupuesto de
  campaña COMPLETO y el tamaño lo elige el operador; la puerta del escalón se eliminó; la
  puerta de calidad, el congelamiento al primer amarillo y la frase escrita de
  confirmación se conservan. `golden_bullet_pct` **no se implementó**, a propósito.
  Ver [`golden-bullet.md`](golden-bullet.md).

### Pregunta abierta que este bloque deja sobre la mesa

**¿Cómo se difieren los mensajes con datos que caducan y con efectos posteriores?** Sigue abierta
para `reactivation` y `reward_reminder`. Concretamente:

1. ¿Qué variables se congelan al encolar y cuáles se recalculan al drenar? (`days_left` y las fechas
   límite tendrían que recalcularse siempre.)
2. En la reactivación agresiva, `grantReward()` corre hoy justo después del envío. Si el envío se
   difiere tres días, **¿el premio se otorga al encolar (y su ventana empieza a correr sin que el
   cliente lo sepa) o al enviar?**
3. ¿Un `reward_reminder` que no cabe hoy se encola con `expires_at` = fin de la ventana del premio, o
   simplemente no se manda?

No se asumió ninguna respuesta (Mandamiento I).

> **`calendar_event` salió de esta pregunta el 2026-09-06**, porque no tiene ninguno de los dos
> problemas: **(1)** ninguna de sus variables caduca —el título, la fecha del evento y el CTA son
> fijos desde que se crea—, así que congelarlas al encolar es correcto; y **(2)** no tiene efectos
> posteriores tipo `grantReward()`: al enviar solo se registra el `campaign_message` y se marca
> `last_campaign_at`, que es justo lo que el drenador ya hace por su cuenta. Su `expires_at` sí tenía
> respuesta obvia: **el fin del día del evento**. Ver `docs/features/calendar.md`.
