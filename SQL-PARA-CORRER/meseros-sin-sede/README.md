# Meseros sin sede — los que no aparecen en ningún escáner

Todos los meseros que existen hoy tienen `staff_users.location_id` **NULL**. Desde §19 el
escáner es del local: el aparato se activa una vez, se le asigna una sede, y la lista de
*«¿quién atiende?»* sale filtrada por **esa** sede. Un mesero sin sede no entra en ninguna
de esas listas — existe en el panel y no existe en la operación.

Es un problema de **datos, no de código**. No hay migración que lo arregle.

## Los dos archivos

| Archivo | Base | Escribe | Qué hace |
|---|---|---|---|
| `01-DIAGNOSTICO.sql` | Supabase **principal** | no | El resumen por marca, la lista de trabajo con las sedes entre las que elegir, y las marcas que ni siquiera tienen sedes activas |
| `02-ASIGNAR.sql` | principal | **sí** | Aplica las asignaciones que vos escribas. Tal como está en el repo **falla a propósito** |

Van en orden. El `02` corre entero dentro de una transacción: si una guarda salta, no deja
nada a medias.

## Por qué no hay un UPDATE masivo, y no lo va a haber

`location_id` NULL significa **«sede desconocida»**, no «la sede principal». No existe en la
base ningún dato del que se pueda deducir en qué local trabaja una persona. Rellenarlo por
inferencia le atribuiría a un local las visitas de alguien que quizá atiende en el otro — y
esa atribución es justamente el número con el que el dueño decide. Un hueco visible es
barato; un dato inventado que parece bueno, no.

Por eso la decisión es **persona por persona**, y hay dos formas de tomarla:

- **Desde el panel** (`/dashboard/staff`): el lápiz de cada fila. Los que están sin sede
  salen marcados en ámbar y hay un botón *«Ver solo esos»*. Para unos pocos, es lo más rápido.
- **Con el `02`**: una línea por persona. Para muchos, o para varias marcas de una sentada.

## Lo que las guardas del `02` no dejan pasar

0. El archivo sin llenar (los uuid de ejemplo).
1. La misma persona dos veces en la misma corrida.
2. Un `staff_user_id` que no existe.
3. Alguien que **ya tenía sede** — este archivo llena huecos, no muda gente.
4. Una sede inactiva, inexistente, o **de otra marca** (la FK compuesta de la 00044 ya
   frena lo último, pero su 23503 no dice de quién era la sede).
5. Dos nombres iguales en la misma sede — `staff_users_nombre_sede_key` (00046). En el
   escáner los meseros se eligen **por el nombre**: dos «Ana» en un local son
   indistinguibles y la métrica de eficiencia se reparte al azar entre las dos.

Si el `UPDATE` salta con un 23514 hablando de dispositivos, es el trigger
`trg_staff_users_sede_coherente` (00044): esa persona activó en su día un aparato que hoy
está en otra sede. Un aparato es un objeto físico que está donde está — se reasigna o se
revoca el dispositivo primero.

## Marcas sin sedes activas

Si la consulta C del `01` devuelve algo, esa marca está bloqueada: no hay ninguna sede que
asignar. Crear sedes todavía no se puede desde el producto — es la deuda **D17** (wizard del
AIOS).

## Verificado

Los dos archivos se corrieron contra un Postgres real con las 48 migraciones aplicadas
(el mismo `embedded-postgres` del arnés de `tests/db/`): el `01` devuelve sus tres
resultados sin escribir, el `02` sin llenar aborta en la guarda 0, el `02` lleno asigna la
sede, y las guardas 3 y 4 rechazan la segunda corrida y la sede de otra marca.
