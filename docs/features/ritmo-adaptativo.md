# Feature: «Se adapta a tu clientela» — el ritmo adaptativo del ciclo de recuperación

> **Estado:** 🟨 **ENVÍA, APAGADO POR MARCA** (fase 1B, 2026-10-13, pusheada con la 00071 aplicada; la 00070 de la
> fase 1A, aplicada el 12-10). El cron decide y encola los toques del ciclo y el drenador los envía y otorga el regalo,
> **solo en las marcas con `cycle_enabled = true`**. Se enciende primero `demo-ventas` (envío simulado) y después el
> piloto (`SQL-PARA-CORRER/ciclo-fase-1b/LEEME.md`). **Fase 2, parte A (2026-10-14): los datos de la pantalla**
> (portada, proyección, lista y «Hoy no») y **parte B (2026-10-14): la pantalla «Ciclo»** que los dibuja, sin migración y
> sin pushear. Detalle: §7.
> Diseñado el 2026-10-11 con datos reales de producción. Piloto: **Don Alirio**, dos semanas. **No se promete en ventas
> hasta que el piloto esté corriendo** (ver §6).
> **Diseño completo:** `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` §3.2.bis y §14.
> **Prompts de construcción:** `docs/prompts/2026-10-11-ciclo-fase-1a-motor-base.md` (1A) y
> `docs/prompts/2026-10-12-ciclo-fase-1b-envios.md` (1B).
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
| Sushi Fun | 289 | 2,4 % (real: verificado el 12-10) | 13 · 26 · 66 · 75 | 4 |
| Planeta Wings | 47 | 4,3 % | muy nueva para medir | 2 |

Lo que dicen:

1. **Un solo reloj está mal para todos.** En Don Alirio la mitad de los regresos pasa en 6 días o menos; en Sushi
   Service la mitad tarda más de 27. Un mensaje al día 21 llega tarde al café y temprano al sushi.
2. **Dentro de una misma marca también hay ritmos distintos.** En Don Alirio hay clientes con 27 visitas (vienen cada
   2 o 3 días) y clientes que vienen una vez al mes. El ritmo correcto es el del cliente, no el de la marca.
3. **Casi 8 de cada 10 clientes nunca vuelven por segunda vez.** La **segunda visita** es la palanca más grande del
   producto y la métrica principal del ciclo (§5).
4. **El 2,4 % de Sushi Fun es real** (verificado el 12-10 con la consulta 1 de la 1A): la mudanza trajo todas sus
   visitas con su fecha original (contador 311 = filas 311). Su número bajo de regresos es de la marca, no un error de
   datos. Lo que sí apareció: 10 de sus 16 clientes con «2 visitas» escanearon dos veces el mismo día con minutos de
   diferencia (`docs/PENDIENTES.md` §5, N-DOBLE). El ciclo cuenta días distintos, así que eso no lo engaña.

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

Con los datos de hoy: Don Alirio → Cafetería · Sushi Service → Restaurante · Sushi Fun → Restaurante (sus visitas están
completas; tiene menos de 30 regresos) · Planeta Wings → Restaurante por defecto (todavía no tiene 30 regresos).

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

## 7. Dónde vive en el código

| Pieza | Dónde |
|---|---|
| Los cuatro ritmos, la elección por mediana y la validación por simulación | `src/lib/cycle-engine.ts` (puro, sin I/O): `RHYTHM_PRESETS`, `medianGap()`, `rhythmFromMedian()`, `personalRhythm()`, `effectiveRhythm()`, `validateStageConfig()` (365 fechas de visita × con y sin domicilio) |
| El ritmo personal guardado al abrir el ciclo | `customers.cycle_rhythm`, lo escribe el trigger `on_customer_visit` (`supabase/migrations/00070_ciclo_motor_base.sql`) con `cycle_rhythm_from_median()` + `cycle_customer_median_gap()`: la MISMA regla que el TS, comprobada con los mismos historiales en `tests/db/cycle-triggers.test.ts` |
| El ritmo de la marca | El dato: `cycle_brand_rhythm_stats(tenant)` (00070: mediana y regresos). La decisión: `brandRhythm()` en `cycle-engine.ts` (lo elegido en `admin_settings.cycle_rhythm` manda; con `auto`, 30+ regresos o `restaurant`) |
| Las etapas, las cajas de la pantalla, «vence el domingo», el grupo de control | `cycle-engine.ts`: `resolveStage()`, `bandsFromConfig()`, `expiresOnSunday()`, `isHoldout()`, `strongOfferAllowed()`, `heartbeatPrize()`, `shouldSkipT1()` |
| Los ajustes de la marca y sus defaults | `normalizeCycleSettings()` en `cycle-engine.ts`; las claves, en la lista cerrada de `src/lib/settings-keys.ts` |
| El estado de cada cliente (ciclo, fatiga, dormido) | `customers.cycle_*` y los triggers de la 00070 (`docs/DB_SCHEMA.md`) |
| El canal de cada mensaje (hoy solo WhatsApp) | `customer_cycle_touches.channel` |
| Las reglas de cada comunicación (motor de piezas) | `src/lib/communications/registry.ts`, con paridad en `tests/unit/communications-registry.test.ts` |
| Las consultas del dueño (Sushi Fun y la foto del ciclo) | `SQL-PARA-CORRER/ciclo-fase-1a/LEEME.md` |
| Qué le toca HOY a cada cliente: el toque, el regalo, la plantilla (adaptador), la hora de la marca, las reglas del encendido, las guardas al enviar | `src/lib/cycle-touch.ts` (puro): `decidirCliente()`, `resolverToque()`, `elegirRegalo()`, `elegirPlantilla()`, `nextSendSlot()`, `variablesAlEnviar()`, `guardaDelCicloAlEnviar()` |
| El cron que decide y encola (marcas con el ciclo encendido) y lo que el drenador necesita | `src/services/cycle.service.ts`, desde `/api/cron/reactivation` y `/api/cron/queue-drain` |
| El libro de toques al día con la cola (H6) | `supabase/migrations/00071_ciclo_envios.sql`: el trigger de `send_queue` y `cycle_reconcile_touches()` |
| Encender, revisar, apagar y medir el piloto | `SQL-PARA-CORRER/ciclo-fase-1b/LEEME.md` |
| **Los datos de la pantalla** (fase 2, parte A, 2026-10-14): portada, proyección, lista y «Hoy no» | `src/services/cycle-overview.service.ts` detrás de `/api/dashboard/cycle/{overview,projection,customers,hoy-no}` (`docs/API_DOCS.md` § «Ciclo de recuperación: la pantalla») |
| En qué caja está cada cliente y qué día entra a cada toque (la MISMA regla que el cron) | `cycle-engine.ts`: `boxOf()`, `boxEnteredOn()`, `stageEntryDays()`, `heartbeatDueDays()`, `daysWithoutVisit()`, `isNewCustomer()` (nuevo = 1 visita o ninguna) |
| El ritmo de la marca con su origen y en palabras del dueño | `brandRhythmDetail()` (`dueno` / `calculado` / `por_defecto`; `brandRhythm()` la usa) y `RHYTHM_LABELS` («Cada semana», «Cada quince días», «Cada mes», «De vez en cuando») |
| La segunda visita (A12) | `secondVisitRate()`: de los que vinieron por PRIMERA vez en los 90 días que terminan hace 60, cuántos volvieron otro día dentro de 60 (días distintos, no `cycle_no`) |
| El retorno con y sin mensaje de la pantalla | `medirRetorno()` en el servicio: `sent` contra `holdout`, solo ventanas de 14 días cerradas en los últimos 30 (`ATTRIBUTION_WINDOW_DAYS`, espejo del trigger) |
| «Para hoy»: las cinco tarjetas y su orden (clientes ÷ días, máx. 3) | El servicio. La del trimestral corre `decidirCliente()` + `resolverToque()` para la PRÓXIMA corrida del cron (`proximaCorrida()`, 15:00 Bogotá) |
| «Hoy no» (A6) | `HOY_NO_CLAVES` / `diaQuePospone()` / `pospuestoHoy()` en `cycle-touch.ts`; lo escribe `anotarHoyNo()` y lo lee `ejecutarCicloDeLaMarca()` (`cycle.service.ts`). Clave del sistema `cycle_hoy_no_trimestral` (`settings-keys.ts`) |
| Las fechas especiales de Colombia | `src/constants/fechas-especiales.ts` (por `business_type` y rubro: el Día del Sushi solo a una marca de sushi) |
| **La pantalla «Ciclo»** (fase 2, parte B, 2026-10-14) | `src/components/dashboard/cycle/` + `src/lib/cycle-screen.ts` (lo puro: qué se muestra y qué no), en `/dashboard/campaigns`; el mini-ciclo, en `/dashboard`. Lee los endpoints de arriba y NO calcula etapas, ritmos ni días (un test lo exige). El histograma de «Ver por día» usa `por_dia` de la portada (`contarPorDia()`). `docs/features/campaigns.md` § «La pantalla «Ciclo»» |
| **La vista por fecha y los creadores** (fase 2, parte C, 2026-10-14) | `VistaPorFecha`, `MandarRegalo`, `CrearEvento`, `CreadorDelCiclo` (`src/components/dashboard/cycle/`). Lo puro de la regla del regalo —`venceSegunRegla()`, `instanteDelRegalo()`, `plantillaDelRegalo()` (el adaptador del ciclo), `variablesDelRegaloAlEnviar()`— vive en `cycle-touch.ts`; las audiencias por caja, en `audienciasDelCiclo()` (`cycle-overview.service.ts`, el mismo motor que las cajas); la I/O, en `src/services/cycle-gift.service.ts`. `docs/features/campaigns.md` § «La vista por fecha y los creadores» |
| «Incluir a los dormidos» en un evento | `restaurant_events.include_dormant` (00073) y `audienciaDelEvento()` (`calendar.service.ts`): la misma audiencia para la invitación, el blackout del ciclo y la pantalla |

**Estado (2026-10-14, fase 2 parte C): la pantalla está completa** (partes A, B y C): las cajas, la vista por fecha, «Mandar un regalo» y el creador de eventos; `/dashboard/calendar` redirige a la vista por fecha. La 00073 está escrita y sin aplicar (va antes del push). El cron decide y encola los toques SOLO en las marcas con `cycle_enabled = true` (primero `demo-ventas`, después el piloto en Don Alirio); las 00071 y 00072 están aplicadas. Los cuatro endpoints leen todo con el motor de arriba, en las marcas apagadas también (las cajas salen con el ritmo de la marca y `ciclo.encendido: false`), y la pantalla lo dice en una línea; el interruptor lo ve solo el operador de Cada1.
