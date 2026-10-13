# SEG-2 — un premio por nivel, aunque lleguen dos pedidos a la vez (migración 00072)

**Dónde:** SQL Editor del Supabase del **PRODUCTO** (el que tiene la tabla `tenants`), no el del AIOS.
**El orden:** 1 (consulta, solo lectura) → 2 (la migración) → push. La consulta del paso 3 se puede correr cuando sea.

**Qué arregla.** Cuando un cliente elige su premio (seguro o mystery box), dos pedidos casi simultáneos del mismo
celular (dos toques seguidos al botón, o un script) podían otorgar **dos** premios: dos para que el mesero entregue y
dos WhatsApp pagados por la marca. Desde la 00072 la base deja pasar uno solo; el otro recibe «Este premio ya fue
reclamado o no está disponible». Detalle: `docs/features/points-mystery-box.md` §7.4.ter.

---

## 1. Antes: ¿ya pasó alguna vez? (solo lectura)

No cambia nada y **no frena la migración**: la 00072 compara cada reclamo NUEVO contra la historia tal como esté, así
que aplica igual haya o no duplicados. Sirve para saber si ya se regalaron premios de más, y cuántos siguen sin
entregar.

```sql
-- SEG-2 · SOLO LECTURA. Reclamos repetidos del MISMO nivel por el MISMO cliente.
-- «Mismo nivel» = misma clave (claimed_tier_key) O mismo umbral (claimed_threshold): la regla de la 00059.
WITH pares AS (
  SELECT b.id         AS repetido,
         a.customer_id,
         b.created_at - a.created_at AS separacion
    FROM mystery_box_results a
    JOIN mystery_box_results b
      ON b.customer_id = a.customer_id
     AND (a.created_at, a.id) < (b.created_at, b.id)
     AND (a.claimed_tier_key = b.claimed_tier_key OR a.claimed_threshold = b.claimed_threshold)
)
SELECT t.slug                                                              AS marca,
       count(DISTINCT p.customer_id)                                       AS clientes,
       count(DISTINCT p.repetido)                                          AS reclamos_de_mas,
       count(DISTINCT p.repetido) FILTER (WHERE p.separacion < interval '10 seconds') AS en_menos_de_10_s,
       count(DISTINCT g.id)                                                AS premios_de_mas,
       count(DISTINCT g.id) FILTER (WHERE g.status = 'active')             AS premios_de_mas_sin_entregar,
       min(m.created_at)::date                                             AS el_primero,
       max(m.created_at)::date                                             AS el_ultimo
  FROM pares p
  JOIN mystery_box_results m ON m.id = p.repetido
  JOIN customers c           ON c.id = p.customer_id
  JOIN tenants t             ON t.id = c.tenant_id
  LEFT JOIN reward_grants g  ON g.mystery_box_result_id = p.repetido
 GROUP BY t.slug
 ORDER BY reclamos_de_mas DESC;
```

**Qué esperar y qué hacer:**

- **0 filas:** nunca pasó. Seguir al paso 2.
- **Filas con `en_menos_de_10_s` > 0:** es la carrera que esto cierra (casi seguro, dos toques al botón).
- **Filas con reclamos separados por horas o días:** son de antes de la ola 0 (03-10), cuando `resolve` no miraba la
  oferta, o de antes de la 00059 (un nivel desactivado y vuelto a crear con el mismo umbral). Ya no pueden pasar.
- **`premios_de_mas_sin_entregar` > 0:** son premios repetidos que el mesero todavía ve para entregar. **Qué hacer con
  ellos es decisión del dueño** (dejarlos, o vencerlos); ni la migración ni ninguna sesión los toca. Si se decide
  vencerlos, pedírselo a una sesión con este resultado.

Traer el resultado al comandante (aunque sean 0 filas).

---

## 2. Aplicar la migración — antes del push

Pegar entero `supabase/migrations/00072_un_reclamo_por_nivel.sql` en el SQL Editor y correrlo.

- Si al final dice **`OK 00072`**, quedó bien.
- Si dice **`00072 requiere la 00059`** o **`00072 quedo a medias`**, no quedó nada a medias (se deshace sola): mandarle
  el mensaje a una sesión.
- Se puede correr dos veces sin problema. **No cambia ninguna fila**: agrega una función y un trigger.

Va con la 00071 pendiente (el ciclo, fase 1B): primero la 00071, después la 00072, después el push. Entre ellas no
importa el orden. Si la 00072 quedara para después del push no se rompe nada: el código nuevo funciona sin ella (solo
que el agujero sigue abierto hasta aplicarla).

---

## 3. Después, cuando sea: ¿la base está frenando reclamos repetidos? (solo lectura)

La base no guarda los rechazos (el reclamo rechazado no se escribe). Se ven en los logs de Vercel como
`[MysteryBox] Reclamo repetido rechazado por la base (00072)`. Y la consulta del paso 1, corrida otra vez, no tiene que
sumar ningún reclamo con fecha posterior a la de hoy.
