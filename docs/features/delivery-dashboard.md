# Feature: Apartado de Domicilios (el panel)

> **Estado:** Completo — escrito el 2026-09-07 en `feat/domicilios`, **sin desplegar**.
> **Ruta:** `/dashboard/domicilios`
> **Archivos clave:** `src/app/(dashboard)/dashboard/domicilios/page.tsx`,
> `src/app/api/dashboard/domicilios/{route,resumen/route,fallos/route}.ts`,
> `src/services/delivery-dashboard.service.ts`, `src/lib/delivery-reasons.ts`,
> `src/lib/delivery-silence.ts`, `src/components/dashboard/domicilios/*`
> **Encargo:** §18.d de `docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md` + §24.3-B de
> `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`
> **Hermanos:** `delivery-webhook.md` (el flujo que esta pantalla explica) ·
> `delivery-ai-parsing.md` (la tabla de motivos que esta pantalla traduce)

---

## Por qué existe

Dos motivos distintos, y conviene no confundirlos.

**El primero es de comunicación.** El dueño pidió *«una parte reservada para domicilios
para explicarles cómo funciona»*. Hasta hoy el flujo se explicaba de memoria, por
WhatsApp, cada vez que entraba un cliente nuevo. Y con la coexistencia eso dejó de
escalar: **cada marca recibe el cuadro del pedido en SU propio número**, así que ya no hay
un número único que recordar para 25 restaurantes.

**El segundo es de honestidad de los datos, y es el importante.** Sin esta pantalla,
*«llegaron tres pedidos y se perdieron los tres»* y *«hoy no pidió nadie»* son **el mismo
dato**: cero filas en `visits`. Ningún tablero honesto puede pintarlos igual. Es el ROJO 3
de `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md`, y esta pantalla es la mitad del producto de
su arreglo (la otra mitad es la tabla `delivery_intake_failures` de la 00053).

---

## Alcance: lo que esta pantalla NO es

- **No es un formulario de carga manual.** Decisión del dueño, 2026-09-07: el apartado
  *muestra* los domicilios que ellos registran. La opción C de 18.a (cargar pedidos desde
  el panel) sigue siendo una buena mejora para después y **no** se construyó a medias.
- **No manda nada.** La alarma de silencio se pinta y punto. Los mensajes y correos son
  §24-A y viven en el AIOS, no acá.
- **No escribe una fila.** Es solo lectura de `visits`, `customers`, `tenants` y
  `delivery_intake_failures`. No toca `delivery.service.ts` ni ninguno de los tres
  webhooks: el contrato de `/api/webhook/delivery` lo usa n8n y no se cambia.
- **No trae migración.** Todo sale de tablas que ya existen más la 00053, que es de otra
  rama.
- **No incluye el interruptor de la auto-respuesta (18.e) ni la plantilla de fallo de
  Zernio (18.c).** Los dos están fuera de alcance por decisión previa; 18.e además toca
  `webhook/twilio-incoming`, que es territorio de otra sesión.

---

## Los tres bloques

### Bloque 1 · Cómo funciona

Cuatro pasos escritos para el dueño del restaurante, no para nosotros. Más tres cosas:

1. **A qué número se manda el cuadro**, con botón de copiar. Sale de la fila del tenant:
   `twilio_whatsapp_number` o `zernio_phone_number` según `messaging_provider`. **No se
   guarda en ningún sitio nuevo.**

   > ⚠️ `twilio_whatsapp_number` se almacena **tal como llega en el `To` de Twilio**
   > (`whatsapp:+14155238886`), porque `getTenantByWhatsappNumber()` lo compara con `.eq()`
   > contra ese valor crudo. `formatReceivingNumber()` le quita el prefijo antes de
   > mostrarlo: enseñárselo al dueño lo llevaría a marcarlo con el `whatsapp:` incluido.

2. **Lo único imprescindible del mensaje**: el celular del cliente, 10 dígitos, empieza
   por 3. El resto lo saca la IA. Con el ejemplo real que ya está en `delivery-webhook.md`.

3. **Quién puede mandarlo**: un enlace a `/dashboard/authorized-numbers`. Esa pantalla
   **se reusa tal cual**; la gestión de números no se duplica en ningún sitio.

**Si `tenants.config.has_delivery_webhook === false`** el apartado se muestra igual, con un
aviso que explica que el flujo no está encendido en esa marca y cómo activarlo. Esconder la
sección habría sido una decisión del dueño, no nuestra. Y la clave **ausente se lee como
`true`**: los tenants que ya reciben domicilios no la tienen puesta, y decirles «no está
activo» sería mentirles sobre algo que funciona.

> **Actualizado 2026-09-08 — cuadro modelo para copiar, e instrucciones plegables.** El
> dueño lo pidió textual: *«un cuadro de ejemplo que al tocar copiar les traiga un mensaje
> plantilla que puedan usar para guardar predeterminado en WhatsApp»*. `ComoFuncionaCard.tsx`
> ahora muestra, siempre visible junto al número, un cuadro modelo con burbuja de WhatsApp
> (`CUADRO_EJEMPLO`, con datos ficticios: nombre, celular, dirección, barrio, pedido con
> cantidades, total y forma de pago) y un botón **«Copiar modelo»** que copia al portapapeles
> `CUADRO_MODELO` — la misma plantilla con los campos vacíos, la que sirve para guardarla en
> WhatsApp Business como respuesta rápida (Ajustes → Herramientas para la empresa →
> Respuestas rápidas). Los campos que copia son un espejo de lo que
> `buildDeliveryExtractionPrompt()` le pide a la IA (nombre, celular, dirección, método de
> pago, monto); «Pedido» y «Notas» no los extrae el parser pero quedan en el mensaje para
> quien despacha. Los cuatro pasos, el ejemplo en texto libre y el enlace a números
> autorizados pasaron a una sección **plegada por defecto** («Ver cómo funciona, paso a
> paso», con `aria-expanded`): el número y el cuadro modelo son lo único que el dueño usa a
> diario y son lo único que queda siempre visible.

### Bloque 2 · Los domicilios registrados

`visits` con `source = 'delivery'`, unidas a `customers`, filtradas por `tenant_id` y por
el alcance de sede. Columnas: fecha y hora, cliente (nombre + celular), dirección, método
de pago, monto, sede, operador, y el mensaje original expandible.

- **Las horas se formatean en hora de Bogotá** (`formatInAppTz()`, `src/lib/timezone.ts`),
  nunca en la del navegador. Un admin desde otro país vería los pedidos corridos de día, y
  de noche en Colombia el servidor —que corre en UTC— los adelantaría al siguiente.
- **`location_id` NULL se muestra como «Sin sede», visible.** Significa *sede desconocida* y
  **nunca se backfillea**.
- **El `amount` sí es dinero y se muestra en pesos.** No choca con «los premios no tienen
  precio»: eso es de premios, no de pedidos.
- Filtros de rango de fechas + el selector de sede del panel. Paginación de 25.
- Contadores: hoy · 7 días · 30 días · clientes nuevos en 30 días. **Sus ventanas son fijas
  y NO siguen al filtro de fechas**: hacerlas seguirlo convertiría «hoy» en otra cosa.

#### Qué significa exactamente «cliente NUEVO»

**Su primera visita en toda la marca fue este domicilio.** No es una heurística de reloj
(«el cliente se creó justo antes»): se calcula comparando la visita contra el `min(created_at)`
real de ese cliente, con una consulta auxiliar acotada a los clientes de la página.

Consecuencia que hay que leer bien: **si el cliente ya había hecho un check-in por QR, su
primer domicilio sale como RECURRENTE.** Es correcto — nuevo lo es *para la marca*, no
*para el canal*. Es la misma lógica que hace que D2 no parta `customers` por sede.

Si esa consulta auxiliar falla, la insignia **no se pinta** en vez de decir «recurrente»
por defecto, y el contador de nuevos muestra `—` en vez de `0`.

### Bloque 3 · Los que no entraron, y la alarma de silencio

#### 3.a Los fallos

Los últimos 20 de `delivery_intake_failures` de ese tenant: hora, operador, **motivo
traducido**, detalle técnico y mensaje original. El mapa de traducción vive en
`src/lib/delivery-reasons.ts` y es **espejo de la tabla de `delivery-ai-parsing.md`**: si
esa tabla cambia, este archivo cambia en el mismo commit. Un test lo vigila en las dos
direcciones.

Cada motivo trae además **quién lo puede arreglar** (`blame`): el operador —reenviando el
pedido mejor escrito— o nosotros. Es la misma distinción que ya hace el TwiML de Twilio, y
aplanarla a «error» le costaría al operador veinte reenvíos contra una variable de entorno
mal puesta.

**Tres estados que antes eran uno solo**, y esta es la razón de ser de la pantalla:

| Lo que se ve | Qué significa de verdad |
|---|---|
| «No se perdió ni un pedido» (verde) | El registro está activo y está vacío. Un cero **de verdad**. |
| «No pudimos leer esta lista» (rojo) | La base no contestó. **No sabemos** si hubo fallos. |
| «Todavía no se está guardando» (gris) | La 00053 no ha corrido en esta base. Tampoco es cero. |

`reason` es **texto libre en la base a propósito** (comentario de la 00053: un CHECK
obligaría una migración cada vez que el intake aprenda a fallar de una forma nueva). La
contraparte en la interfaz: un motivo desconocido se muestra **crudo y marcado**, nunca
escondido detrás de un «error desconocido».

> ⚠️ **Esta lista es de la marca entera, aunque haya una sede elegida en el selector**, y la
> pantalla lo dice. `delivery_intake_failures` **no tiene `location_id`**, y es una decisión
> de la 00053, no un olvido: el fallo más traicionero de todos,
> `remitente_no_verificable`, ocurre justo cuando la consulta a `authorized_numbers` falló
> — y ahí la sede es **inconocible por definición**.

#### 3.b La alarma de silencio (§24.3-B)

*«Llevás N días sin un solo pedido, cuando tu promedio es M.»*

**El umbral se deriva del historial del propio tenant, nunca es fijo.** El requisito lo dice
textual: un número fijo le sirve a Sushi Service (542 clientes, pedidos casi diarios) y no a
una barbería. Sobre una ventana de 28 días —la misma que usa `aios_health()`— se cuenta en
cuántos días **distintos** entró al menos un pedido:

```
ritmo  = 28 / días_con_pedido
aviso  = ceil(ritmo) + 1
alarma = ceil(ritmo × 2) + 1
```

| Marca | días con pedido / 28 | ritmo | aviso | alarma |
|---|---|---|---|---|
| Pedidos a diario | 28 | 1,0 | 2 d | 3 d |
| Un par por semana | 7 | 4,0 | 5 d | 9 d |
| Dos veces en el mes | 2 | — | — | — |

Con menos de **3 días activos** no se afirma nada: sale gris, «sin línea base», con su
motivo. **Gris no es verde** — la misma decisión que tomó el tablero de salud del AIOS.

El `+1` de las fórmulas es el que evita el falso positivo obvio: una marca de ritmo 1 sin
él tendría un aviso cada tarde tranquila.

Y el promedio se calcula sobre **días distintos, no sobre pedidos**: veinte pedidos en tres
días no son veinte días activos, o una marca con un solo día muy movido parecería tener un
ritmo diario.

---

## Contrato de las rutas

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/dashboard/domicilios` | `{ orders, total, page, limit }` |
| GET | `/api/dashboard/domicilios/resumen` | `{ channel, summary }` — el número receptor, los contadores y la alarma |
| GET | `/api/dashboard/domicilios/fallos` | `{ available, failures }` |

Query: `from`, `to` (ISO), `page`, `limit`, y `location_id` (el transporte del alcance de
sede de multi-sede F7 §8.4 — viaja en la query del `fetch()`, **nunca en la barra de
direcciones**).

**Las tres responden 503, no 200 con lista vacía, cuando la lectura falla.** No es un
detalle de estilo: `supabase-js` no lanza, y un `{ orders: [] }` con 200 haría que la
pantalla pintara «no hubo domicilios» cuando la base simplemente no contestó — el mismo
fallo silencioso que el apartado vino a matar, cometido por el apartado.

La única excepción deliberada es `fallos`, que responde **200 con `available: false`**
cuando la tabla de la 00053 todavía no existe: eso no es un fallo, es un estado conocido, y
la pantalla lo nombra. Se detecta por `42P01` / `PGRST205`; **cualquier otro error es un
fallo de verdad y no se disfraza de «falta la migración»**.

---

## Aislamiento

- Cada `SELECT` lleva `.eq('tenant_id', scope.tenantId)` **escrito a mano**. El
  `service_role` se salta el RLS por definición: el aislamiento entre marcas en este camino
  ES ese `.eq()`.
- El alcance de sede lo resuelve `requireLocationScope()`, la única fábrica de
  `LocationScope`, siempre en el servidor. Ninguna de estas rutas importa
  `getUnscopedServiceClient()`, así que la allowlist de F7 no cambia.
- La única lectura deliberadamente **sin** filtro de sede es `fetchFirstVisitAt()`: «¿es su
  primera visita en la marca?» es una pregunta de marca, y filtrar por sede haría que el
  mismo cliente saliera «nuevo» en cada sede donde pidiera. El `tenant_id` sigue estando.

---

## Dependencia: la migración 00053

`delivery_intake_failures` la crea la **00053** (`supabase/migrations/00053_salud_por_cliente.sql`).
Esta pantalla se escribió cuando esa migración vivía en otra rama; para cuando se cerró el bloque,
`feat/salud-aios` ya estaba en `main` y esta rama la trae mergeada. **Pero sigue SIN APLICARSE en
producción**, y eso es lo que importa: que el archivo exista en el repo no crea la tabla.

Por eso el Bloque 3.a se construyó contra su forma exacta y **degrada solo**. No hace falta tocar
esta pantalla cuando la 00053 corra: empieza a listar fallos y ya.

```
delivery_intake_failures(id, tenant_id NOT NULL, operator_phone, reason,
                         detail, raw_message, created_at)   — RLS SELECT por tenant
```

Los índices `idx_visits_tenant_fecha` e `idx_visits_tenant_source_fecha` de esa misma
migración son justamente los de las consultas de esta pantalla. Sin ellos funciona, pero con
peor plan.

---

## Pruebas

`tests/unit/delivery-dashboard.test.ts` — 24 casos, cero llamadas reales a nada (ni base, ni
red, ni `Date.now()`: el día de hoy entra por parámetro, o estas pruebas fallarían a
medianoche y nadie sabría por qué).

Cubre el mapa de motivos (los nueve del intake, el espejo en las dos direcciones, el
desconocido, `null`/vacío, la separación operador/nosotros) y la alarma de silencio (sin
historial, línea base insuficiente, los tres estados de una marca diaria, los de una lenta,
y **la prueba que justifica todo el diseño: los mismos 3 días de silencio alarman a una
marca y no dicen nada de la otra**).

---

## Deudas conocidas

- **No se puede reintentar un pedido perdido desde la pantalla.** Reprocesar vuelve a
  llamar (y a pagar) OpenAI, y además habría que decidir qué pasa con un reenvío que sí
  entró mientras tanto. Es otro alcance; **no se construyó a medias a propósito**.
- **La columna «Operador» de la lista de pedidos siempre dice «no se registra».**
  `visits` no guarda quién reenvió el cuadro: el remitente se usa para autorizar y se
  descarta. Llenarla exige una columna nueva en `visits` (una migración) y no estaba en el
  alcance. La columna existe ya en el contrato para que el día que se llene no haya que
  tocar la interfaz. En cambio los **fallos** sí traen el operador:
  `delivery_intake_failures.operator_phone` existe.
- **Los umbrales de la alarma viven en el código, no en configuración.** Afinarlos hoy
  cuesta un despliegue. Es aceptable mientras sean dos fórmulas derivadas; si alguna vez
  hacen falta por marca, van a `tenants.config` y no a una migración — el mismo criterio
  que tomó el AIOS.
- **La alarma mira solo `visits`.** Una marca con muchos fallos y ningún pedido sale como
  «silencio»; los fallos están justo abajo, en la misma pantalla, pero la alarma no los
  cruza. Cruzarlos es del semáforo del AIOS, que ya tiene los dos números.
