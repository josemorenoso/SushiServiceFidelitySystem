# Ciclo de recuperación, fase 0 — medir la sangría (solo lectura)

**Dónde:** SQL Editor del Supabase del **PRODUCTO** (el que tiene la tabla `tenants`), no el del AIOS.
**Qué hace:** solo `SELECT`. No escribe, no borra, no manda mensajes. Se puede correr las veces que haga falta.
**Para qué:** confirmar (o refutar) con datos lo que el código dice que pasa (spec
`docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` §1): que el mensaje «insistente» se
repite cada ~30 días a clientes que no vuelven, y que un envío fallido calla al cliente.

Lo mejor es correrla **antes de desplegar** el arreglo de la fase 0 (así se ve el daño hecho) y otra vez
**un mes después** (las columnas 2 y 3 deberían quedar en cero o casi).

Pegá cada bloque por separado y mirá el resultado.

---

## Consulta 1 — ¿cuántos clientes recibieron 2 o más mensajes de reactivación en 90 días?

```sql
WITH por_cliente AS (
  SELECT cm.tenant_id, cm.customer_id, count(*) AS mensajes
  FROM campaign_messages cm
  JOIN campaigns c ON c.id = cm.campaign_id
  WHERE c.type = 'reactivation'
    AND c.source = 'reactivation'            -- deja fuera el recordatorio de premio
    AND cm.status IN ('sent', 'delivered')   -- solo lo que salió
    AND cm.sent_at >= now() - interval '90 days'
  GROUP BY cm.tenant_id, cm.customer_id
)
SELECT
  coalesce(t.slug, '(sin marca)')            AS marca,
  count(*)                                   AS clientes_con_1_o_mas,
  count(*) FILTER (WHERE mensajes >= 2)      AS clientes_con_2_o_mas,
  count(*) FILTER (WHERE mensajes >= 3)      AS clientes_con_3_o_mas,
  max(mensajes)                              AS maximo_a_un_solo_cliente
FROM por_cliente p
LEFT JOIN tenants t ON t.id = p.tenant_id
GROUP BY t.slug
ORDER BY clientes_con_2_o_mas DESC;
```

**Cómo leerla.** Dos mensajes por cliente pueden ser normales (el suave y el insistente de un mismo
recorrido). **Tres o más en 90 días** casi siempre es el insistente repitiéndose: un cliente que vuelve y
vuelve a irse podría sumar cuatro legítimos, pero son pocos. Si `maximo_a_un_solo_cliente` llega a 3 o
4 en una marca con muchos clientes en `clientes_con_3_o_mas`, **el diagnóstico se confirma**.

## Consulta 2 — la prueba exacta: insistentes repetidos sin que el cliente haya vuelto

Cuenta, por cliente, los mensajes de reactivación que salieron **después** de su última visita y
cuando ya llevaba más días que los del insistente de su marca (el suave nunca cae ahí). Con el arreglo,
ese número no puede pasar de 1.

```sql
WITH dias AS (
  SELECT
    t.id AS tenant_id,
    CASE WHEN s.value ~ '^[0-9]+$' AND s.value::int > 0 THEN s.value::int ELSE 21 END AS suave,
    CASE WHEN a.value ~ '^[0-9]+$' AND a.value::int > 0 THEN a.value::int ELSE 25 END AS insistente
  FROM tenants t
  LEFT JOIN admin_settings s ON s.tenant_id = t.id AND s.key = 'reactivation_soft_days'
  LEFT JOIN admin_settings a ON a.tenant_id = t.id AND a.key = 'reactivation_aggressive_days'
),
umbral AS (   -- la misma regla del código: si el insistente no queda después del suave, suave + 4
  SELECT tenant_id, CASE WHEN insistente <= suave THEN suave + 4 ELSE insistente END AS insistente
  FROM dias
),
insistentes AS (
  SELECT cu.tenant_id, cu.id AS customer_id, count(*) AS insistentes_desde_la_ultima_visita
  FROM customers cu
  JOIN umbral u ON u.tenant_id = cu.tenant_id
  JOIN campaign_messages cm ON cm.customer_id = cu.id
  JOIN campaigns c ON c.id = cm.campaign_id
  WHERE cu.last_visit_at IS NOT NULL
    AND c.type = 'reactivation'
    AND c.source = 'reactivation'
    AND cm.status IN ('sent', 'delivered')
    AND cm.sent_at > cu.last_visit_at + make_interval(days => u.insistente)
  GROUP BY cu.tenant_id, cu.id
)
SELECT
  coalesce(t.slug, '(sin marca)')                                      AS marca,
  count(*)                                                             AS clientes_que_recibieron_el_insistente,
  count(*) FILTER (WHERE insistentes_desde_la_ultima_visita >= 2)      AS lo_recibieron_2_o_mas_veces,
  sum(insistentes_desde_la_ultima_visita - 1)                          AS insistentes_de_mas,
  max(insistentes_desde_la_ultima_visita)                              AS maximo_a_un_solo_cliente
FROM insistentes i
LEFT JOIN tenants t ON t.id = i.tenant_id
GROUP BY t.slug
ORDER BY lo_recibieron_2_o_mas_veces DESC;
```

**Cómo leerla.** `lo_recibieron_2_o_mas_veces` es la sangría: clientes que no volvieron y recibieron el
mismo mensaje insistente más de una vez (con su premio y su recordatorio). `insistentes_de_mas` es
cuántos mensajes sobraron en total; multiplicado por el precio del mensaje de marketing es lo que costó.
**Si da cero en todas las marcas, el diagnóstico NO se confirma** y la causa del silencio es otra
(plantilla insistente sin configurar, tope de 3 al mes): pasale el resultado a una sesión.

## Consulta 3 — envíos fallidos que quedaron con fecha de envío (N3)

```sql
SELECT
  coalesce(t.slug, '(sin marca)')   AS marca,
  c.source                          AS de_donde,
  count(*)                          AS fallidos_con_fecha_de_envio,
  count(DISTINCT cm.customer_id)    AS clientes,
  min(cm.sent_at)::date             AS el_primero,
  max(cm.sent_at)::date             AS el_ultimo
FROM campaign_messages cm
JOIN campaigns c ON c.id = cm.campaign_id
LEFT JOIN tenants t ON t.id = cm.tenant_id
WHERE cm.status = 'failed'
  AND cm.sent_at IS NOT NULL
GROUP BY t.slug, c.source
ORDER BY t.slug, c.source;
```

**Cómo leerla.** Los crons de cumpleaños y de reactivación graban el fallo con fecha (la cola de goteo
no: ahí siempre sale vacía). Hasta este arreglo, cada una de esas filas contaba como «ya se le mandó».
Si hay filas en `birthday` o `reactivation`, **el diagnóstico se confirma**.

## Consulta 4 — quiénes están callados HOY por un fallo (los que el arreglo destapa)

```sql
SELECT
  coalesce(t.slug, '(sin marca)') AS marca,
  f.tipo,
  count(DISTINCT f.customer_id)   AS clientes_callados_hoy
FROM (
  SELECT cm.tenant_id, cm.customer_id, c.type AS tipo
  FROM campaign_messages cm
  JOIN campaigns c ON c.id = cm.campaign_id
  WHERE cm.status = 'failed'
    AND cm.sent_at IS NOT NULL
    AND (
      (c.type = 'birthday'     AND cm.sent_at >= now() - interval '360 days') OR
      (c.type = 'reactivation' AND cm.sent_at >= now() - interval '30 days')
    )
) f
LEFT JOIN tenants t ON t.id = f.tenant_id
WHERE NOT EXISTS (   -- y no le salió nada de ese tipo en la misma ventana
  SELECT 1
  FROM campaign_messages ok
  JOIN campaigns c2 ON c2.id = ok.campaign_id
  WHERE ok.customer_id = f.customer_id
    AND c2.type = f.tipo
    AND ok.status IN ('sent', 'delivered')
    AND ok.sent_at >= now() - CASE WHEN f.tipo = 'birthday' THEN interval '360 days' ELSE interval '30 days' END
)
GROUP BY t.slug, f.tipo
ORDER BY t.slug, f.tipo;
```

**Cómo leerla.** Son clientes a los que hoy el sistema no les escribe porque un envío falló. Desde el
despliegue de la fase 0 entran de nuevo en la corrida siguiente. **Ojo con los cumpleaños:** el saludo
se busca solo en la ventana de hoy a dos días, así que de estos solo vuelven a recibirlo los que
cumplan en esos días; el resto, en su próximo cumpleaños.

---

## Qué hacer con el resultado

Pegáselo (las cuatro tablas) a una sesión. No hay nada que corregir a mano en la base: el
arreglo es de código. Los números sirven para (1) saber cuánto costó, (2) decidir si hace falta
avisarle a alguna marca, y (3) tener la línea base contra la que medir el ciclo de la fase 1.
