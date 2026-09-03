# Feature: Delivery — Parseo con IA

> Última actualización: 2026-09-03 — **Fase 2 de §25: el parseo dejó de estar en n8n.**
> **Archivos clave:** `src/constants/delivery-ai.ts`, `src/services/delivery-ai.service.ts`,
> `src/lib/openai/client.ts`, `tests/unit/delivery-ai.test.ts`
> **Referencia histórica (ya no corre nada de esto):** `n8n/domicilios_whatsapp_v4.json`

## Resumen

El flujo de domicilios recibe mensajes de WhatsApp de operadores con el cuadro del pedido.
Desde v0.23.0 el parseo usa OpenAI (`gpt-4o-mini`) en lugar de regex, lo que permite texto
libre del operador.

**Desde el 2026-09-03 esa llamada a OpenAI corre DENTRO del producto**, no en n8n. Es la
Fase 2 de la migración n8n → Vercel (`docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`
§25): la que desbloquea el apagado del VPS.

## Flujo completo (estado vigente)

```
Operador envía WhatsApp → Twilio  → /api/webhook/twilio-incoming
                        └ Zernio → /api/webhook/zernio
  → valida firma (Twilio HMAC / Zernio HMAC-SHA256)
  → ¿el remitente está en authorized_numbers? (mismo SELECT que trae location_id)
  → processDeliveryMessage()            ← src/services/delivery.service.ts
      → extractDeliveryOrder()          ← OpenAI gpt-4o-mini, en proceso
      → parseDeliveryAiJson()           ← puro: backticks, ^3\d{9}$, monto
      → registerDeliveryOrder()         ← cliente + visita + puntos + tiers
  → WhatsApp: plantilla welcome/tier/near/far al cliente
  → Twilio: TwiML de confirmación al operador · Zernio: 200 (no hay canal de vuelta)
```

**Ya no hay salto HTTP a n8n ni de vuelta a `/api/webhook/delivery`.** El endpoint sigue
existiendo y funcionando igual, pero es la puerta para llamadores externos, no el camino
normal — ver `docs/features/delivery-webhook.md`.

## Historia del parseo

### v3 — regex
- Requería formato exacto: `Nombre: X\nCelular: X\nDirección: X`
- Si el operador cambiaba el orden o el formato, fallaba

### v4 — IA en n8n (2026-06 → 2026-09-03)
- Texto libre: `"pedido de Juan 3001234567 calle 100 pago efectivo 35mil"`
- El nodo HTTP Request llamaba a `api.openai.com`, la key vivía en las credenciales de n8n
- **Sin una sola prueba automatizada**

### Hoy — IA en el producto
- Mismo modelo, mismo prompt, mismo parseo defensivo
- La key es `OPENAI_API_KEY` en Vercel (Mandamiento VIII: nada hardcodeado)
- 33 pruebas en `tests/unit/delivery-ai.test.ts`, **ninguna llama a la API de verdad**

## El prompt de extracción

Vive en `src/constants/delivery-ai.ts`, en `buildDeliveryExtractionPrompt(cityHint)`. Es el
`system` que corría en el nodo «IA Extrae Datos del Pedido», con **un solo cambio
deliberado**: la ciudad por defecto.

```
Eres un asistente que extrae datos de pedidos de domicilio desde mensajes de WhatsApp de un restaurante. Del mensaje del usuario, extrae estos campos en JSON estricto:
- nombre_cliente (string) — nombre del cliente. Si no hay nombre claro, usa "Cliente Domicilio"
- celular (string) — SOLO los 10 dígitos del celular colombiano (sin +57, sin espacios). Empieza con 3.
- direccion (string | null) — dirección de entrega
- metodo_pago (string | null) — efectivo, transferencia, nequi, daviplata, tarjeta, etc.
- monto_total (number | null) — valor total en COP como número (sin puntos, sin $, "35mil"=35000, "50k"=50000)
- ciudad ← ⚠️ ver abajo

Si no puedes extraer un campo, usa null. El celular es OBLIGATORIO.
Responde SOLO con el JSON válido, sin markdown, sin explicaciones, sin ```.
```

Parámetros del modelo, idénticos a los del nodo: `gpt-4o-mini`, `temperature: 0`, 400 tokens
de salida.

### ⚠️ La ciudad por defecto ya no está horneada

El prompt de n8n terminaba con:

> *`- ciudad (string) — … Si hay Cra, Cl, Tr, Calle sin ciudad explícita → Envigado. … Por
> defecto: Envigado.`*

Eso era correcto sirviendo a **un** restaurante. Horneado en el producto le escribiría
**Envigado** en `customers.city` a los clientes de domicilio de los 25 tenants, sin error y
sin log. Así que el default sale de `tenants.config.delivery_default_city`:

| `delivery_default_city` | Qué hace el prompt |
|---|---|
| Configurado (ej. `"Envigado"`) | Réplica del comportamiento de n8n con esa ciudad |
| Sin configurar | La IA **no inventa ciudad**; `customers.city` queda `null` |

> **Acción para el dueño:** Sushi Service necesita `"delivery_default_city": "Envigado"` en
> su `tenants.config` para comportarse exactamente como hoy. Sin eso no se rompe nada — los
> pedidos entran igual, solo sin ciudad.

## El parseo defensivo

`parseDeliveryAiJson(content, cityHint)` es **pura**: ni red ni base de datos. Réplica del
nodo «Parsear Respuesta IA», que llevaba meses en producción:

| Paso | Por qué existe |
|---|---|
| `.replace(/```json\n?/g,'').replace(/```/g,'').trim()` | La IA a veces envuelve el JSON en un bloque markdown pese a que el prompt se lo prohíbe |
| Guarda «es un objeto plano» | `JSON.parse('42')` no lanza: sin esto el motivo reportado sería el equivocado |
| Celular: quitar separadores → `+57`/`57` → `0` inicial → últimos 10 → `^3\d{9}$` | La IA a veces devuelve el número del operador, un fijo, o texto |
| Monto: número tal cual, o `parseFloat` de los dígitos y el punto | El operador escribe `"45 mil"`, `"$45.000"`, `"45k"` |
| Nombre vacío → `"Cliente Domicilio"` | Un pedido sin nombre sigue siendo un pedido |

> ⚠️ **`"45.000"` se convierte en `45`**, porque el punto se lee como decimal. Es el
> comportamiento que corre hoy en producción y se conservó tal cual: la defensa real está en
> el prompt, que pide el número ya limpio. Cambiarlo aquí sin cambiar el prompt movería
> montos de pedidos reales sin que nadie lo pida.

## Cuando falla — el motivo REAL, nunca el silencio

`DeliveryExtractionError` lleva un `reason` de esta unión, y `processDeliveryMessage()` lo
propaga al log y (en Twilio) al operador:

| `reason` | Qué pasó | Qué lee el operador en Twilio |
|---|---|---|
| `mensaje_vacio` | El cuadro llegó sin texto | «El mensaje llegó vacío…» |
| `ia_no_configurada` | Falta `OPENAI_API_KEY` | «…falta la clave de OpenAI. Avisa al administrador» |
| `ia_error` / `ia_sin_respuesta` | Timeout, caída, respuesta vacía | «El lector de pedidos no respondió. Reenvía…» |
| `json_invalido` | La IA no devolvió JSON | El texto literal del nodo «Responder Error IA» |
| `celular_invalido` | El celular no cumple `^3\d{9}$` | Ídem |
| `celular_invalido_registro` | Pasó la IA pero no `validatePhone()` | Ídem |
| `registro_fallido` | Falló la escritura en la base | «Leí el pedido pero no lo pude guardar…» |
| `remitente_no_verificable` | **La consulta a `authorized_numbers` se cayó**, así que no se sabe si el remitente era un operador | «Estamos con un problema técnico… si era un pedido, reenvíalo» |

> ⚠️ **`remitente_no_verificable` es el motivo más traicionero, y por eso tiene nombre
> propio.** `supabase-js` **no lanza**: un fallo vuelve como `{ data: null, error }`. Quien
> escriba `const { data } = await db...` y no lea `error` recibe un `null` **idéntico al de
> «este número no es un operador»** — y el pedido se va por el camino del cliente normal, con
> su auto-respuesta amable y **cero `[Delivery][FALLO]`**. Es el mismo fallo silencioso de
> §24 disfrazado un escalón más arriba. Las dos rutas leen `error` y reportan por el embudo.
> Lo encontró la revisión adversarial de esta misma fase.

Que un **fallo de configuración** no se disfrace de «pedido mal escrito» es el punto: antes,
el operador reenviaba el mismo mensaje veinte veces mientras la causa era una variable de
entorno.

Todos pasan por `logDeliveryIntakeFailure()` — **un solo embudo** — que escribe una línea con
el prefijo estable `[Delivery][FALLO]`, el tenant, el operador, el motivo y el mensaje
original recortado. Ese prefijo es sobre lo que se monta una alerta de log en Vercel sin
tocar código.

> **Deuda abierta, explícita:** hoy el registro del fallo es el **log**, no una tabla. El
> «apartado de domicilios» con la lista de clientes cargados y la alarma de silencio es
> §24-B, es trabajo aparte y lleva su propia migración. Cuando esa tabla exista, el `INSERT`
> va **dentro de `logDeliveryIntakeFailure()`** y en ningún otro sitio: por eso es una
> función y no un `console.error` suelto en cada `catch`.

## Variables de entorno

| Variable | Dónde | Descripción |
|----------|-------|-------------|
| `OPENAI_API_KEY` | **Vercel**, server-only | Key de OpenAI para `gpt-4o-mini`. **Sin ella no entra ni un domicilio.** Nada más del producto la usa |

`OPENAI_API_KEY` en n8n queda huérfana: se puede borrar cuando se apague el VPS.

## Latencia — el reloj ahora corre dentro de nuestra función

n8n respondía a Twilio desde otro proceso; ahora la llamada a OpenAI está en el camino
crítico del webhook.

| | Presupuesto | Qué pasa si se excede |
|---|---|---|
| Twilio | ~15 s | Registra el timeout en su consola. **El pedido ya quedó guardado**: primero la base, después la respuesta |
| Zernio | 2xx en < 5 s | Reintenta. **No duplica**: `isDuplicateZernioEvent()` corre antes de cualquier efecto de negocio y el reintento sale por el atajo de duplicado |

Por eso el cliente va con `timeout: 8_000` y `maxRetries: 1`
(`src/constants/delivery-ai.ts`). Peor caso ~16 s.

## Pruebas

`tests/unit/delivery-ai.test.ts` — 33 casos, cero llamadas reales a OpenAI.
`extractDeliveryOrder()` y `processDeliveryMessage()` reciben la llamada al modelo por
parámetro (`complete`); la costura existe **para las pruebas**, en producción el default es
la llamada real.

Cubre: mensaje real que sí parsea · celular inválido · JSON con backticks (con y sin la
etiqueta `json`) · IA que devuelve basura · JSON que no es objeto · array · `+57`, espacios,
guiones y `0` inicial · fijo de Bogotá · las cuatro rutas del monto · las tres de la ciudad ·
el prompt con y sin ciudad de marca · error de red · respuesta vacía · y el contrato de
«no se pierde en silencio» (que `processDeliveryMessage()` **nunca lanza** y que la línea
`[Delivery][FALLO]` sale con el motivo real).

## Archivos afectados
- `src/constants/delivery-ai.ts` — prompt, modelo, timeouts
- `src/lib/openai/client.ts` — el único sitio que instancia el SDK
- `src/services/delivery-ai.service.ts` — extracción + parseo puro
- `src/services/delivery.service.ts` — `processDeliveryMessage()`, el embudo de fallos
- `src/app/api/webhook/twilio-incoming/route.ts`, `src/app/api/webhook/zernio/route.ts`
- `n8n/domicilios_whatsapp_v4.json` — **referencia histórica; ya no recibe tráfico**
