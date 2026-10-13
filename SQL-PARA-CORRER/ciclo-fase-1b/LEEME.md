# Ciclo de recuperación, fase 1B — aplicar, encender el piloto y medirlo

**Dónde:** SQL Editor del Supabase del **PRODUCTO** (el que tiene la tabla `tenants`), no el del AIOS.
**Qué hay acá:** una migración (paso 1), dos `INSERT` que encienden una marca (pasos 2 y 3), un `UPDATE` que la apaga
(paso 4) y consultas de solo lectura (`SELECT`), que se pueden correr las veces que haga falta.

Aplicar la migración **no enciende nada**: el ciclo nace apagado en todas las marcas (`cycle_enabled = false`). Con el
ciclo apagado, cada marca sigue exactamente como hoy (la reactivación suave y la insistente de siempre). Una marca pasa
al ciclo solo cuando se le pone `cycle_enabled = true`, y eso se hace marca por marca, con los pasos de abajo.

**El orden, sin saltarse pasos:** 1 → push → 2 (demo, un día) → 3 (Don Alirio) → 5 (a las dos semanas). El 4 es para
apagar, si hace falta.

---

## 1. Aplicar la migración — ANTES del push

Pegar entero `supabase/migrations/00071_ciclo_envios.sql` en el SQL Editor y correrlo.

- Si al final dice **`OK 00071: …`**, quedó bien.
- Si dice **`00071 incompleta: …`**, no quedó nada a medias (se deshace sola): mandarle el mensaje a una sesión.
- Se puede correr dos veces sin problema.

⚠️ **Tiene que ir antes del push.** El código nuevo le pide a la base la columna `reward_grants.skip_reminder` para el
recordatorio de premio. Sin la migración, ese pedido falla y **el recordatorio de premio deja de salir en TODAS las
marcas** (en los logs de Vercel: `[RewardGrant] Error buscando candidatos a recordatorio`). Con la migración aplicada
primero, no pasa nada: hasta que una marca se encienda, nadie usa lo nuevo.

Después: el push (lo ordena el dueño).

---

## 2. Después del deploy: encender primero `demo-ventas` (un día)

`demo-ventas` es la marca de ventas (`is_demo`): **el envío es simulado, no sale ningún WhatsApp real**. Sirve para ver el
ciclo andar con 408 clientes antes de tocar una marca de verdad.

**2.a — Qué tiene configurado** (plantillas, regalos y lo que ya haya del ciclo):

```sql
SELECT s.key, s.value
  FROM admin_settings s
  JOIN tenants t ON t.id = s.tenant_id
 WHERE t.slug = 'demo-ventas'
   AND (s.key LIKE 'cycle_%'
        OR s.key IN ('aggressive_reward_id',
                     'gift_expiring_template_sid', 'reactivation_aggressive_template_sid',
                     'reactivation_no_reward_template_sid',
                     'campaign_presencial_to_domicilio_template_sid',
                     'campaign_domicilio_to_presencial_template_sid'))
 ORDER BY s.key;
```

Lo mínimo para que salga algo: `reactivation_no_reward_template_sid` («Le recordamos») y
`reactivation_aggressive_template_sid` (la insistente: lleva el regalo mientras «Regalo que vence» no esté aprobada, y la
despedida). Una etapa sin su plantilla no crea toques: el cron la cuenta en `saltados.sin_plantilla`.

**2.b — Encender:**

```sql
INSERT INTO admin_settings (key, value, tenant_id)
SELECT 'cycle_enabled', 'true', id FROM tenants WHERE slug = 'demo-ventas'
ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value;
```

El cron de reactivación corre a las **15:00 de Bogotá**. Esa primera corrida anota sola la fecha de encendido
(`cycle_enabled_at`), duerme sin mensaje a quien ya pasó la despedida de su ritmo y **no manda nada atrasado**: solo los
toques cuyo día cae desde hoy. Lo que decide queda en la cola para la hora de la marca (por defecto la cena, **16:30**), y
el drenador lo envía a esa hora.

**2.c — Al día siguiente, revisar:**

```sql
-- Los toques: cuántos por etapa y estado
SELECT ct.stage, ct.status, count(*) AS toques
  FROM customer_cycle_touches ct
  JOIN tenants t ON t.id = ct.tenant_id
 WHERE t.slug = 'demo-ventas'
 GROUP BY ct.stage, ct.status
 ORDER BY ct.stage, ct.status;

-- La cola del ciclo: qué salió, qué espera, qué se canceló y por qué
SELECT q.status, q.last_error, count(*) AS items, min(q.not_before) AS desde, max(q.not_before) AS hasta
  FROM send_queue q
  JOIN tenants t ON t.id = q.tenant_id
 WHERE t.slug = 'demo-ventas' AND q.cycle_touch_id IS NOT NULL
 GROUP BY q.status, q.last_error
 ORDER BY q.status;

-- Cómo quedaron los clientes (dormidos por el encendido incluidos) y la fecha anotada
SELECT c.cycle_state, count(*) AS clientes
  FROM customers c JOIN tenants t ON t.id = c.tenant_id
 WHERE t.slug = 'demo-ventas'
 GROUP BY c.cycle_state;

SELECT s.key, s.value FROM admin_settings s JOIN tenants t ON t.id = s.tenant_id
 WHERE t.slug = 'demo-ventas' AND s.key IN ('cycle_enabled', 'cycle_enabled_at');
```

**Qué esperar:** toques `sent` (salieron, simulados), algunos `deferred` (pospuestos: el cap de 7 días, el tope de 3 al
mes, un evento del calendario o un regalo todavía vivo; cada uno con su fecha en `due_at` y el porqué en `reason`) y,
si la marca tiene 200 clientes o más, cerca de un 10 % `holdout` (el grupo de comparación: no se le envía nada a
propósito). Ningún toque debería quedar `queued` de un día para otro. Los regalos otorgados están en `reward_grants`
con `source = 'reactivation'`; el pequeño con `skip_reminder = true` (vence sin recordatorio).

---

## 3. Don Alirio (el piloto, dos semanas)

**3.a — Antes de encender, mirar tres cosas.**

**(1) Los regalos.** Es **decisión del dueño** qué regalo pequeño (el de «Le regalamos algo» y el primer toque trimestral)
y qué regalo fuerte (el del «Rescate» y el segundo trimestral) lleva Don Alirio. **Sin ellos el ciclo sale igual, sin
regalo.** El fuerte, si no se elige, es el premio de la insistente de hoy (`aggressive_reward_id`), si lo tiene.

```sql
-- El catálogo de premios de campaña de la marca
SELECT r.id, r.title, r.is_active
  FROM campaign_rewards r JOIN tenants t ON t.id = r.tenant_id
 WHERE t.slug = 'don-alirio'
 ORDER BY r.created_at;
```

Para elegirlos (cambiar los `<…>` por los `id` de arriba; solo premios activos de ESTA marca):

```sql
INSERT INTO admin_settings (key, value, tenant_id)
SELECT k, v, t.id FROM tenants t,
       (VALUES ('cycle_small_reward_ids', '<id del regalo pequeño>'),
               ('cycle_strong_reward_id', '<id del regalo fuerte>')) AS x(k, v)
 WHERE t.slug = 'don-alirio'
ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value;
```

**(2) La plantilla.** Con la consulta 2.a cambiando el `slug` por `'don-alirio'`. Si «Regalo que vence»
(`gift_expiring_template_sid`) está **aprobada por Meta**, los toques con regalo salen con ella («Te guardamos *½ rollo
gratis*. Ven antes del *domingo 18 de octubre*…»). Si no está aprobada, salen con la **insistente** de siempre y el regalo
igual queda en la tarjeta. Don Alirio está en Twilio: el cron le pregunta a Twilio una vez por corrida si está aprobada
(se ve también en el panel, Plantillas → Mensajes automáticos).

**(3) El cupo de su línea.** Cuántos mensajes de campaña le caben hoy:

```sql
SELECT t.messaging_daily_limit, t.line_status, t.quality_rating, line_budget(t.id) AS presupuesto
  FROM tenants t WHERE t.slug = 'don-alirio';
```

Lo que no quepa en el día se queda en la cola y sale al día siguiente (el item vence al cierre del día siguiente a su
hora; si vence, el toque cuenta un intento fallido y se reintenta, hasta 3).

**3.b — El ensayo (`?dry=1`): lo que haría, sin hacer nada.** Lo corre quien tenga el `CRON_SECRET` del Vercel del
producto (o se le pide al comandante):

```
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  "https://hooks.constelarys.com/api/cron/reactivation?tenant=don-alirio&dry=1"
```

No escribe nada (ni toques, ni cola, ni ajustes, ni regalos, ni la fecha de encendido) y no envía nada, **aunque la marca
esté apagada**: la simula como si se encendiera hoy (`"encendido": false` en la respuesta). Cómo leerla:

- `por_etapa`: cuántos toques saldrían hoy en cada etapa (`t1` «Le recordamos», `t2` «Le regalamos algo», `t3` «Le
  mostramos lo otro», `t4` «Rescate», `t5` «Despedida», `heartbeat` el trimestral de los dormidos).
- `en_control`: cuántos irían al grupo de comparación (no se les envía).
- `pospuestos`: por un evento del calendario (`evento`), por el cap de 7 días (`siete_dias`) o por el tope de 3 al mes
  (`tope_mes`).
- `saltados`: `atrasado` (su toque cayó antes de encender: espera el siguiente), `t1_fiel` (5 visitas o más: se salta «Le
  recordamos»), `sin_plantilla` por etapa.
- `dormidos_por_encendido`: quienes ya pasaron la despedida y se duermen sin mensaje (con el ritmo cafetería de Don
  Alirio, quien lleva entre 58 y 90 días sin venir).
- `ritmo_de_la_marca`, `hora`, `plantilla_del_regalo` y `regalos`: con qué va a salir.
- `ejemplos`: hasta 10 clientes con su etapa, plantilla y regalo.

**3.c — Encender:**

```sql
INSERT INTO admin_settings (key, value, tenant_id)
SELECT 'cycle_enabled', 'true', id FROM tenants WHERE slug = 'don-alirio'
ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value;
```

**3.d — Al día siguiente:** las tres consultas de 2.c con `'don-alirio'`. Lo mismo que esperar, más una cosa: acá los
mensajes **salen de verdad**. Si algo no cuadra, el paso 4.

---

## 4. Cómo apagarlo

```sql
UPDATE admin_settings s SET value = 'false'
  FROM tenants t
 WHERE t.id = s.tenant_id AND t.slug = 'don-alirio' AND s.key = 'cycle_enabled';
```

- **Lo que ya estaba en la cola ya no sale:** el drenador mira, antes de enviar cada toque, si la marca sigue con el
  ciclo encendido; si no, lo cancela (`cancelled`, «La marca apagó el ciclo de recuperación»).
- La corrida siguiente del cron borra la fecha de encendido (al volver a encender se anota otra y se vuelven a aplicar
  las dos reglas: nada atrasado, y dormir sin mensaje a quien pasó la despedida).
- **Ojo:** apagado, la marca vuelve al camino de siempre desde esa misma corrida (la suave a los 21 días y la insistente
  a los 25, con sus días de Ajustes).

---

## 5. A las dos semanas: ¿funciona?

Conteos, nunca pesos.

**5.a — Retorno a 14 días por etapa, con mensaje contra sin mensaje.** Cada toque que salió (`sent`) y cada toque del
grupo de comparación (`holdout`) queda marcado con `returned_at` si el cliente volvió dentro de los 14 días siguientes a
cuando le tocaba (`due_at`). Solo se cuentan los toques cuya ventana de 14 días ya cerró:

```sql
SELECT ct.stage,
       count(*) FILTER (WHERE ct.status = 'sent')                                AS con_mensaje,
       count(*) FILTER (WHERE ct.status = 'sent' AND ct.returned_at IS NOT NULL)    AS volvieron_con_mensaje,
       count(*) FILTER (WHERE ct.status = 'holdout')                             AS sin_mensaje,
       count(*) FILTER (WHERE ct.status = 'holdout' AND ct.returned_at IS NOT NULL) AS volvieron_sin_mensaje
  FROM customer_cycle_touches ct
  JOIN tenants t ON t.id = ct.tenant_id
 WHERE t.slug = 'don-alirio'
   AND ct.due_at < now() - interval '14 days'
 GROUP BY ct.stage
 ORDER BY ct.stage;
```

Cómo leerla: `volvieron_con_mensaje / con_mensaje` contra `volvieron_sin_mensaje / sin_mensaje`, etapa por etapa. Con
dos semanas los números del grupo de comparación son chicos (el 10 %): es una primera mirada, no un veredicto.

**5.b — La segunda visita** (la métrica principal, línea base ~22 %). Clientes cuya PRIMERA visita fue en las dos
semanas antes del encendido o en las primeras del piloto, y cuántos volvieron otro día dentro de los 14 días siguientes.
Se cuenta por días con visita y no por `cycle_no`: el `cycle_no` es la llave del libro de toques, no un contador de
visitas (el backfill de la 00070 le puso 1 a todos).

```sql
WITH marca AS (
  SELECT t.id, (s.value::timestamptz AT TIME ZONE 'America/Bogota')::date AS encendido
    FROM tenants t
    JOIN admin_settings s ON s.tenant_id = t.id AND s.key = 'cycle_enabled_at'
   WHERE t.slug = 'don-alirio'
),
dias AS (
  SELECT DISTINCT v.customer_id, (v.created_at AT TIME ZONE 'America/Bogota')::date AS dia
    FROM visits v JOIN customers c ON c.id = v.customer_id JOIN marca m ON m.id = c.tenant_id
),
primera AS (
  SELECT customer_id, min(dia) AS primera FROM dias GROUP BY customer_id
)
SELECT CASE WHEN p.primera >= m.encendido THEN 'con el ciclo' ELSE 'antes del ciclo' END AS cohorte,
       count(*)                                                                    AS clientes_nuevos,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM dias d
                                       WHERE d.customer_id = p.customer_id
                                         AND d.dia > p.primera AND d.dia <= p.primera + 14)) AS volvieron_en_14_dias
  FROM primera p, marca m
 WHERE p.primera >= m.encendido - 14
   AND p.primera <= (now() AT TIME ZONE 'America/Bogota')::date - 14
 GROUP BY 1
 ORDER BY 1;
```

Con el piloto de dos semanas, la cohorte «con el ciclo» todavía es chica (solo entran los nuevos del primer día que ya
cumplieron sus 14). Repetirla al mes da una lectura de verdad.
