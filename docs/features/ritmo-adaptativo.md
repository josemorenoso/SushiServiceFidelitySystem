# Feature: «Se adapta a tu clientela» — el ritmo adaptativo del ciclo de recuperación

> **Estado:** ⬜ DISEÑADO el 2026-10-11 con datos reales de producción; **se construye en la fase 1 del ciclo**
> (1A: la base y el cálculo · 1B: los envíos). Piloto: **Don Alirio**, dos semanas. **No se promete en ventas hasta que
> el piloto esté corriendo** (ver §6).
> **Diseño completo:** `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` §3.2.bis y §14.
> **Prompt de construcción:** `docs/prompts/2026-10-11-ciclo-fase-1a-motor-base.md`.
> **Decisión del dueño (2026-10-11, textual):** *«un software que se adapta a tu clientela es un ángulo de comunicación
> completo, no quiero que tengamos esta feature y no hablemos de ella»*.

---

## 1. En una frase

**El sistema aprende cada cuánto vuelve cada cliente y le escribe cuando de verdad lo está extrañando**, no en un día fijo
igual para todos. Una cafetería y un restaurante de sushi usan el mismo software y cada uno recibe el ritmo de su gente,
sin que el dueño configure nada.

## 2. Por qué existe: los datos de producción (2026-10-11)

Consulta de solo lectura sobre `visits` (días distintos con visita por cliente, hora de Bogotá; sin la marca demo):

| Marca | Clientes | Volvieron al menos una vez | Días entre visitas: 25 % · mediana · 75 % · 90 % | Más visitas de un cliente |
|---|---|---|---|---|
| Sushi Service | 601 | 22,5 % | 13 · **27** · 49 · 74 | 9 |
| Don Alirio (café) | 334 | 21,6 % | 2 · **6** · 12 · 24 | 27 |
| Sushi Fun | 289 | 2,4 % ⚠️ | 13 · 26 · 66 · 75 | 4 |
| Planeta Wings | 47 | 4,3 % | muy nueva para medir | 2 |

Lo que dicen:

1. **Un solo reloj está mal para todos.** En Don Alirio la mitad de los regresos pasa en 6 días o menos; en Sushi
   Service la mitad tarda más de 27. Un mensaje al día 21 llega tarde al café y temprano al sushi.
2. **Dentro de una misma marca también hay ritmos distintos.** En Don Alirio hay clientes con 27 visitas (vienen cada
   2 o 3 días) y clientes que vienen una vez al mes. El ritmo correcto es el del cliente, no el de la marca.
3. **Casi 8 de cada 10 clientes nunca vuelven por segunda vez.** La **segunda visita** es la palanca más grande del
   producto y la métrica principal del ciclo (§5).
4. ⚠️ **El 2,4 % de Sushi Fun probablemente es un error de datos**, no la realidad: al mudarla de su Supabase anterior
   pudieron no traerse sus visitas viejas. La fase 1A lo verifica con una consulta antes de calibrar esa marca.

## 3. Cómo funciona (tres capas, de la más fina a la más general)

### 3.1 Cuatro ritmos validados

Cada ritmo son los cinco días del ciclo («Le recordamos», «Le regalamos algo», «Le mostramos lo otro», «Rescate»,
«Despedida»). **Los cuatro cumplen siempre el tope de 3 mensajes al mes y 7 días entre mensajes**, contando el aviso del
regalo fuerte: se comprobó simulando 365 fechas de visita con «vence el domingo» y el tope real del código (por mes
calendario).

| Ritmo | Días del ciclo | Mediana de referencia | Para quién (ejemplos) |
|---|---|---|---|
| **Cafetería / diario** | 7 · 14 · 26 · 42 · 58 | ~6 días | café, panadería, almuerzo ejecutivo, comida rápida de barrio (Don Alirio) |
| **Casual / quincenal** | 10 · 17 · 29 · 45 · 61 | ~13 días | casual de fin de semana, pizzería de barrio |
| **Restaurante / mensual** | **14 · 28 · 42 · 60 · 80** | ~27 días | sushi, parrilla, salida a comer (Sushi Service) |
| **Ocasiones** | 21 · 38 · 56 · 80 · 110 | ~45 días | celebraciones, alta cocina |

El ritmo «restaurante» se ajustó con los datos de Sushi Service: antes empezaba el día 12, **antes** de que volviera la
mayoría por su cuenta. Ahora el segundo toque cae en la mediana (27-28), el rescate entre el 75 % y el 90 % (60) y la
despedida cuando ya volvió el 90 % (80). Para la cafetería, el tope de 3 al mes es el límite: versiones más cortas
(7·14·21·30·45, 7·14·24·34·48) lo rompen.

### 3.2 El ritmo personal (clientes con 3 o más días con visita)

Con dos o más regresos, el sistema mide **la mediana de días entre las visitas de ese cliente** y le asigna el ritmo
validado más cercano:

| Mediana personal | Ritmo |
|---|---|
| menos de 9 días | Cafetería / diario |
| de 9 a 18 días | Casual / quincenal |
| de 19 a 35 días | Restaurante / mensual |
| más de 35 días | Ocasiones |

Los cortes son el punto medio geométrico entre las medianas de referencia. El ritmo se fija **al abrir cada ciclo**
(en la visita) y no cambia a mitad de ciclo: si el cliente cambia de costumbre, el próximo ciclo lo refleja.

Por qué elegir entre cuatro ritmos y no calcular días a medida: los cuatro están validados contra los topes. Días a
medida podrían romper el tope de 3 al mes en silencio (el mensaje sobrante no sale y nadie se entera), que es justo el
defecto que se encontró el 08-10.

### 3.3 El ritmo de la marca (clientes nuevos: 1 o 2 días con visita)

Un cliente nuevo todavía no tiene ritmo propio: recibe **el ritmo de la marca**, que el sistema calcula con la mediana
de días entre visitas de todos sus clientes (mismos cortes de §3.2) cuando la marca tiene **al menos 30 regresos**.
Con menos datos usa «Restaurante / mensual». El dueño no tiene que hacer nada: puede cambiarlo en Ajustes con una
pregunta («¿cada cuánto vuelve un cliente típico?»), y desde ese momento manda su respuesta sobre el cálculo.

Con los datos de hoy: Don Alirio → Cafetería · Sushi Service → Restaurante · Sushi Fun → Restaurante (pendiente de
verificar sus visitas) · Planeta Wings → Restaurante por defecto (todavía no tiene 30 regresos).

## 4. Lo que no cambia

- **Las guardas ganan siempre:** 7 días entre mensajes de marketing, 3 al mes, y a los 6 mensajes sin volver el
  cliente pasa a dormido. El ritmo decide **cuándo** le toca a cada uno; las guardas, **cuánto** como máximo.
- Los puntos y sellos no vencen. El cumpleaños sigue su propio reloj.

## 5. Cómo se mide si funciona

1. **Segunda visita:** % de clientes nuevos que vuelven dentro de 60 días. **Línea base 2026-10-11: ~22 %** en Sushi
   Service y Don Alirio. Es el número que el producto existe para mover.
2. **Retorno por toque a 14 días, con mensaje contra sin mensaje** (grupo de comparación del 10 %).
3. Opt-outs por cada 1.000 mensajes (meta < 5). Si suben, el ritmo está mal calibrado.

## 6. El ángulo de venta (cómo contarlo)

> **Usarlo solo cuando el piloto de Don Alirio esté corriendo.** Antes, es una promesa sin producto.

- **El mensaje corto:** *«Tu programa de fidelización aprende el ritmo de cada cliente. Le escribe cuando de verdad te
  está extrañando: al de la cafetería a la semana, al del restaurante al mes. Tú no configuras nada.»*
- **Contra la competencia** (que usa tarjetas en Wallet y mensajes en fechas fijas): ellos le escriben a todos el mismo
  día; nosotros, a cada uno en su momento, por WhatsApp, que es la app que el cliente abre todo el día. Sin instalar
  nada y sin agregar tarjetas.
- **La prueba con números:** «casi 8 de cada 10 clientes nunca vuelven por segunda vez». El sistema existe para mover
  ese número, y lo mide con un grupo de comparación: «con mensaje volvieron X %, sin mensaje Y %».
- **Para el dueño ocupado:** cero configuración. El sistema elige el ritmo con sus propios datos; el dueño aprueba
  sugerencias con un botón.

## 7. Dónde vive en el código (cuando se construya)

| Pieza | Dónde |
|---|---|
| Los cuatro ritmos, la elección por mediana y la validación por simulación | `src/lib/cycle-engine.ts` (puro, sin I/O): `RHYTHM_PRESETS`, `rhythmFromMedian()`, `validateStageConfig()` |
| El ritmo personal guardado al abrir el ciclo | `customers.cycle_rhythm` (lo escribe el trigger de visita de la migración de la fase 1A) |
| El ritmo de la marca | `admin_settings.cycle_rhythm` (`auto` por defecto) + el cálculo de la mediana de la marca |
| El canal de cada mensaje (hoy solo WhatsApp) | `customer_cycle_touches.channel` |
