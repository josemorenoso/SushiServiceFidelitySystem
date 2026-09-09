# Números de domicilios sin sede — los pedidos que no se atribuyen a ningún local

`authorized_numbers.location_id` existe desde la **00043** y hasta el 2026-09-09 el panel
**nunca lo escribía**: el `INSERT` mandaba `{phone, name, is_active, tenant_id}` y nada más.
Por eso todo el parque vivo está en `NULL`.

Esa columna es la señal **autenticada** de la que sale la sede de un pedido de domicilio
(`resolveDeliveryLocation()`, `src/services/delivery.service.ts`): el celular que manda el
cuadro se contrasta contra esta tabla, y de ahí sale el `location_id` de la orden.

Con `NULL` **el domicilio entra igual** —no se pierde ni un pedido por esto— pero queda en
«sede desconocida». Con una sola sede da lo mismo. Con doce, *todos* los pedidos de *todos*
los locales caen al mismo cubo y no hay forma de saber a qué sede iba cada uno.

Es un problema de **datos, no de código**. No hay migración que lo arregle.

## Desde el 2026-09-09 esto ya se puede hacer sin SQL

El panel escribe la sede: `/dashboard/authorized-numbers` tiene una columna **«Sede»** con
un desplegable por fila, el formulario de alta la pide, y un aviso ámbar cuenta los que
siguen sin ella. Para unos pocos números, esa es la vía más rápida.

Estos archivos son para muchos, o para varias marcas de una sentada.

## Los dos archivos

| Archivo | Base | Escribe | Qué hace |
|---|---|---|---|
| `01-DIAGNOSTICO.sql` | Supabase **principal** | no | Resumen por marca, la lista de trabajo con las sedes entre las que elegir, las marcas con sedes y sin ningún número, y cuántos domicilios de los últimos 30 días quedaron sin atribuir |
| `02-ASIGNAR.sql` | principal | **sí** | Aplica las asignaciones que vos escribas. Tal como está en el repo **falla a propósito** |

Van en orden. El `02` corre entero dentro de una transacción: si una guarda salta, no deja
nada a medias. Y es **idempotente**: el `UPDATE` lleva `WHERE location_id IS NULL`.

## Por qué no hay un UPDATE masivo, y no lo va a haber

`location_id` NULL significa **«sede desconocida»**, no «la sede principal». Repartir por
inferencia le atribuiría domicilios a un local que no los hizo, y esa atribución es el
número con el que el dueño decide. Un hueco visible es barato; un dato inventado que parece
bueno, no.

## El número realmente compartido

`authorized_numbers_phone_tenant_key UNIQUE (phone, tenant_id)` (00028) significa que un
celular existe **una sola vez por marca**. Si las doce sedes comparten de verdad el mismo
celular de operador, **no hay ninguna sede correcta que ponerle**: se queda en `NULL` y sus
domicilios se muestran como «sede desconocida», que es la verdad.

La salida buena es **un celular de operador por sede**. Mientras no lo haya, la atribución
de domicilios de esa marca no se puede reconstruir — y es mejor que el panel lo diga a que
se invente un local.

## Lo que las guardas del `02` no dejan pasar

0. El archivo sin llenar (los uuid de ejemplo).
1. El mismo número dos veces en la misma corrida.
2. Un `authorized_number_id` que no existe.
3. Uno que **ya tenía sede** — este archivo llena huecos, no muda gente.
4. Una sede inactiva, inexistente, o **de otra marca** (la FK compuesta de la 00043 ya frena
   lo último, pero su 23503 no dice de quién era la sede).

## Lo que NO toca

Los domicilios **ya registrados**. `visits.location_id` es un hecho histórico: lo que entró
sin sede entró sin sede y se sigue mostrando como «sede desconocida». Backfillearlo sería
inventar dónde ocurrió algo que ya pasó (**D8**).

## Hermano

`SQL-PARA-CORRER/meseros-sin-sede/` — el mismo problema, con `staff_users.location_id`. Ahí
la consecuencia es otra: un mesero sin sede **no aparece en ningún escáner**.
