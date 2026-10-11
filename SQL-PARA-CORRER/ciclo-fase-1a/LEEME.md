# Ciclo de recuperación, fase 1A — antes y después de aplicar la 00070

**Dónde:** SQL Editor del Supabase del **PRODUCTO** (el que tiene la tabla `tenants`), no el del AIOS.
**Qué hacen las consultas:** solo `SELECT`. No escriben, no borran, no mandan mensajes. Se pueden correr las veces que haga falta.

**El orden, sin saltarse pasos:**

1. **Consulta 1** (antes de aplicar nada).
2. **Aplicar la migración** `supabase/migrations/00070_ciclo_motor_base.sql`: pegarla entera en el SQL Editor y correrla.
   Si al final dice `OK 00070: …`, quedó bien. Si dice `00070 incompleta: …`, no quedó nada a medias (se deshace
   sola): mandarle el mensaje a una sesión.
   **La migración va ANTES del push** que lleve el código de la fase 1A. (Esta vez el código no lee nada nuevo, así
   que al revés tampoco rompería; la regla de la casa igual es migración primero.)
3. **Consulta 2** (después de aplicar).

Aplicar la 00070 **no enciende nada**: el ciclo nace apagado en todas las marcas (`cycle_enabled = false`) y en esta
fase no hay cron que envíe. Lo único que cambia es que la base empieza a llevar la cuenta: en qué ciclo está cada
cliente, cuántos mensajes de marketing lleva sin volver, si está activo o dormido y cuál es su ritmo.

---

## Consulta 1 — antes de aplicar: ¿a Sushi Fun le faltan visitas?

El dato del 11-10 dice que en Sushi Fun solo el 2,4 % de los clientes volvió alguna vez, contra ~22 % en las otras.
La sospecha: al mudarla de su Supabase anterior se trajo el **contador** de visitas de cada cliente
(`customers.total_visits`) pero no sus **visitas** una por una (`visits`). Si es así, el ritmo de cada cliente y el de
la marca se calcularían sobre un historial incompleto.

```sql
WITH por_cliente AS (
  SELECT c.tenant_id,
         c.id,
         c.total_visits,
         count(v.id) AS filas_en_visits
    FROM customers c
    LEFT JOIN visits v ON v.customer_id = c.id
   GROUP BY c.tenant_id, c.id, c.total_visits
)
SELECT t.slug                                                                       AS marca,
       count(*)                                                                     AS clientes,
       count(*) FILTER (WHERE total_visits >= 2)                                    AS volvieron_segun_contador,
       count(*) FILTER (WHERE total_visits >= 2 AND filas_en_visits = 1)            AS contador_2_o_mas_y_una_sola_fila,
       count(*) FILTER (WHERE total_visits >= 2 AND filas_en_visits = 0)            AS contador_2_o_mas_y_ninguna_fila,
       round(100.0 * count(*) FILTER (WHERE total_visits >= 2 AND filas_en_visits <= 1)
             / NULLIF(count(*) FILTER (WHERE total_visits >= 2), 0), 1)             AS pct_de_los_que_volvieron_sin_historial,
       sum(total_visits)                                                            AS visitas_segun_contador,
       sum(filas_en_visits)                                                         AS filas_en_visits
  FROM por_cliente p
  JOIN tenants t ON t.id = p.tenant_id
 GROUP BY t.slug
 ORDER BY contador_2_o_mas_y_una_sola_fila DESC;
```

**Cómo leerla.**

- `volvieron_segun_contador`: clientes que, según su contador, vinieron 2 veces o más.
- `contador_2_o_mas_y_una_sola_fila`: de esos, cuántos tienen **una sola** visita guardada una por una. Es la pregunta
  del spec (§14.4). `…_y_ninguna_fila` es lo mismo con cero filas (por ejemplo, clientes importados).
- `pct_de_los_que_volvieron_sin_historial`: qué parte de los que volvieron no tiene su historial completo.
- `visitas_segun_contador` contra `filas_en_visits`: en una marca sana los dos números son parecidos, porque cada
  camino que suma una visita (QR, mesero, override del panel, domicilio) también guarda su fila. **Si el contador es el
  doble o más que las filas, faltan visitas.**

**Qué sería raro, y qué hacer:**

- **Lo esperado en Sushi Service, Don Alirio y Planeta Wings:** `contador_2_o_mas_y_una_sola_fila` en cero o casi, y
  los dos totales del final parecidos.
- **Si en Sushi Fun ese número es grande** (decenas, o más de la mitad de `volvieron_segun_contador`): la sospecha se
  confirma. **No hay que hacer nada hoy**: el ciclo está apagado, y aunque se encendiera, con tan pocos regresos
  registrados (menos de 30) el ritmo de la marca cae solo en «restaurante», que es lo que pide el spec para ese caso.
  Lo que no sirve es su 2,4 %: no usarlo para nada (ni en ventas ni para calibrar) hasta reconstruir su historial.
  Sus clientes tampoco tendrán ritmo personal hasta que vuelvan 3 días distintos desde ahora.
- **Si aparece en OTRA marca**: avisar a una sesión. Querría decir que algún camino suma visitas sin guardarlas.

---

## Consulta 2 — después de aplicar: la foto del ciclo

```sql
WITH estado AS (
  SELECT tenant_id,
         count(*)                                                                    AS clientes,
         count(*) FILTER (WHERE cycle_state = 'activo')                              AS activos,
         count(*) FILTER (WHERE cycle_state = 'dormido')                             AS dormidos,
         count(*) FILTER (WHERE cycle_state = 'archivado')                           AS archivados,
         count(*) FILTER (WHERE cycle_state = 'activo' AND cycle_rhythm = 'cafe')       AS activos_ritmo_cafeteria,
         count(*) FILTER (WHERE cycle_state = 'activo' AND cycle_rhythm = 'casual')     AS activos_ritmo_casual,
         count(*) FILTER (WHERE cycle_state = 'activo' AND cycle_rhythm = 'restaurant') AS activos_ritmo_restaurante,
         count(*) FILTER (WHERE cycle_state = 'activo' AND cycle_rhythm = 'occasional') AS activos_ritmo_ocasiones,
         count(*) FILTER (WHERE cycle_state = 'activo' AND cycle_rhythm IS NULL)        AS activos_sin_ritmo_propio,
         count(*) FILTER (WHERE cycle_started_at IS NULL)                            AS sin_backfill,
         count(*) FILTER (WHERE cycle_touches > 0)                                   AS con_mensajes_contados
    FROM customers
   GROUP BY tenant_id
)
SELECT t.slug                                   AS marca,
       e.clientes, e.activos, e.dormidos, e.archivados,
       e.activos_ritmo_cafeteria, e.activos_ritmo_casual, e.activos_ritmo_restaurante,
       e.activos_ritmo_ocasiones, e.activos_sin_ritmo_propio,
       round(r.median_gap_days::numeric, 1)     AS mediana_dias_entre_visitas_marca,
       r.returns_count                          AS regresos_marca,
       s.value                                  AS ritmo_elegido_en_ajustes,
       CASE
         WHEN s.value IN ('cafe', 'casual', 'restaurant', 'occasional') THEN s.value
         WHEN r.returns_count >= 30 THEN cycle_rhythm_from_median(r.median_gap_days)
         ELSE 'restaurant'
       END                                      AS ritmo_de_la_marca,
       e.sin_backfill, e.con_mensajes_contados
  FROM estado e
  JOIN tenants t ON t.id = e.tenant_id
  CROSS JOIN LATERAL cycle_brand_rhythm_stats(t.id) r
  LEFT JOIN admin_settings s ON s.tenant_id = t.id AND s.key = 'cycle_rhythm'
 ORDER BY e.clientes DESC;
```

**Qué significa cada número.**

- `activos` / `dormidos`: el backfill puso **dormido** a todo el que lleva **más de 90 días sin venir** (o se
  registró hace más de 90 días y nunca vino). Esos no reciben la ráfaga del día del despliegue: su primer toque será el
  trimestral, dentro de 90 días, cuando el ciclo se encienda. El resto quedó **activo**, en el día del ciclo en que ya
  está.
- `archivados`: nadie archiva todavía. **Tiene que dar 0** en todas.
- `activos_ritmo_*` y `activos_sin_ritmo_propio`: entre los activos, cuántos ya tienen **ritmo personal** (3 o más días
  distintos con visita: la mediana de días entre SUS visitas elige cafetería, casual, restaurante u ocasiones) y cuántos
  usan el de la marca (la mayoría: casi 8 de cada 10 clientes nunca volvieron).
- `mediana_dias_entre_visitas_marca` y `regresos_marca`: la mediana de días entre visitas de todos los clientes de la
  marca (días distintos, hora de Bogotá) y cuántos regresos hay detrás de ese número.
- `ritmo_de_la_marca`: el que usarán los clientes sin ritmo propio. Si el dueño eligió uno en Ajustes
  (`ritmo_elegido_en_ajustes`), manda ese; si no (`auto`, el default), con **30 regresos o más** decide la mediana; con
  menos, «restaurante».
- `sin_backfill`: **tiene que dar 0** (la migración misma lo verifica y falla si no).
- `con_mensajes_contados`: clientes que ya llevan algún mensaje contado para la fatiga. Justo después de aplicar
  **tiene que dar 0**; desde ahí sube con cada campaña manual, evento o reactivación que salga (no con cumpleaños ni con
  el recordatorio de premio). Si un día un cliente llega a 6 sin volver, pasa a dormido solo.

**Lo esperado con los datos del 11-10, y qué sería raro.**

| Marca | Esperado | Raro |
|---|---|---|
| **Don Alirio** | `ritmo_de_la_marca` = **cafe** (mediana ~6, cientos de regresos); bastantes activos con ritmo cafetería | que salga `restaurant` o `casual` |
| **Sushi Service** | `ritmo_de_la_marca` = **restaurant** (mediana ~27); una parte grande dormida (todo el que lleva más de 90 días sin venir) | que salga `cafe` o `casual`, o que no haya dormidos |
| **Sushi Fun** | **restaurant** (menos de 30 regresos registrados) | más de 30 regresos con una mediana muy baja: revisar la consulta 1 |
| **Planeta Wings** | **restaurant** (muy nueva: menos de 30 regresos); casi todos activos | dormidos: la marca tiene menos de 90 días |
| **demo-ventas** | cualquier cosa: sus datos son simulados (`is_demo`) | — |

Si algún número sale raro, no hay que deshacer nada: el ciclo está apagado y nadie lee estas columnas todavía.
Mandarle la salida a una sesión antes de la fase 1B.
