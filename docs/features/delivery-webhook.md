# Feature: Webhook Domicilios (WhatsApp)

> **Estado:** Completo — **dentro del producto desde el 2026-09-03** (Fase 2 de §25)
> **Archivos clave:** `src/services/delivery.service.ts`, `src/services/delivery-ai.service.ts`, `src/app/api/webhook/twilio-incoming/route.ts`, `src/app/api/webhook/zernio/route.ts`, `src/app/api/webhook/delivery/route.ts`
> **Dependencias:** @supabase/supabase-js, **openai** (nueva), n8n (solo para Google Contacts, Fase 3 diferida)

---

## Descripción
Pedidos de domicilio que llegan por WhatsApp y se convierten en cliente, visita y puntos.

> ### 🔄 2026-09-03 — esto YA NO pasa por n8n
>
> Hasta hoy `twilio-incoming` y `webhook/zernio` reenviaban el mensaje del operador a
> `N8N_DOMICILIOS_WEBHOOK_URL`; n8n llamaba a OpenAI, parseaba y hacía `POST
> /api/webhook/delivery` de vuelta contra nosotros. **Todo eso corre ahora dentro del
> producto** (`processDeliveryMessage()`), sin un solo salto HTTP salvo el de OpenAI.
>
> Es la Fase 2 de §25 de `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`: la que
> desbloquea el apagado del VPS. **`n8n/domicilios_whatsapp_v4.json` no se tocó y sigue
> desplegado**, pero deja de recibir tráfico por sí solo: su webhook lo disparaba nuestra
> línea de reenvío y nadie más.
>
> **Efecto práctico para el alta de los 25 clientes:** ya no hay que desplegar ningún
> workflow de domicilios por cliente, ni volver a tocar n8n cuando cambie el parseo.

**Arquitectura:**
- **Nuestras dos rutas de webhook entrante** (`twilio-incoming`, `zernio`) validan la firma,
  comprueban `authorized_numbers` y llaman al servicio
- **`src/services/delivery-ai.service.ts`** extrae los datos del texto libre con OpenAI
  `gpt-4o-mini` — ver `docs/features/delivery-ai-parsing.md`
- **`src/services/delivery.service.ts`** (`registerDeliveryOrder`) maneja toda la lógica de
  DB: crear/actualizar cliente, registrar visita, puntos, tiers y plantilla de WhatsApp
- **`/api/webhook/delivery`** sigue existiendo con el MISMO contrato, como puerta para
  llamadores externos (n8n mientras el VPS siga vivo, pruebas, cargas)
- **Google Contacts** se sigue sincronizando vía n8n (W3). La Fase 3 está **diferida** por
  decisión del dueño (§25.7, respuesta 1); `syncGoogleContact()` hace no-op si falta su
  variable, así que no bloquea nada

## Objetivo
Captar clientes de domicilios automáticamente sin que el cliente tenga que hacer nada. El mesero solo reenvía el mensaje.

## Modelo de Datos
Tablas involucradas:
- **authorized_numbers** — Números de meseros autorizados para enviar datos al webhook
- **customers** — Se busca/crea el cliente extraído del mensaje
- **visits** — Se registra visita con `source = 'delivery'`

## Flujo de Uso

### Flujo Domicilios (vigente desde 2026-09-03 — todo dentro del producto)
1. Cliente pide domicilio por WhatsApp al restaurante
2. El operador reenvía el cuadro del pedido al número del sistema
3. El proveedor entrega el mensaje a **nuestra** ruta: `/api/webhook/twilio-incoming` (Twilio) o `/api/webhook/zernio` (Zernio)
4. La ruta valida la firma y busca al remitente en `authorized_numbers` — **el mismo `SELECT` trae `location_id`, así que la sede sale gratis** (D9, multi-sede F3)
5. `processDeliveryMessage()` → **OpenAI (gpt-4o-mini) extrae los datos del texto libre** (nombre, celular, dirección, pago, monto, ciudad) — ver `docs/features/delivery-ai-parsing.md`
6. `registerDeliveryOrder()` crea/actualiza cliente + visita + otorga puntos + evalúa tiers desbloqueados
7. Se envía la plantilla de WhatsApp al cliente (welcome / tier / near / far)
8. Google Contacts se sincroniza vía n8n (W3, fire-and-forget con `await`)
9. **Twilio:** TwiML de confirmación al operador. **Zernio:** 200 — no hay canal de texto libre de vuelta

> **El remitente ya no viaja por la red.** Hasta F3 había que pedirle a n8n que reenviara el
> campo `remitente` para poder resolver la sede desde `authorized_numbers.location_id`. Al
> traer el flujo al producto, **el remitente ya lo tenemos en la mano**: es el mismo número
> que acabamos de autorizar. Esa línea del workflow de n8n queda muerta y **NO hay que
> desplegarla a los 25 clientes** — es el ahorro principal de esta fase.

### Casos de error — ninguno silencioso
Todo pedido que no llega a la base pasa por `logDeliveryIntakeFailure()`, que deja una línea
`[Delivery][FALLO]` con el tenant, el operador, el **motivo real** y el mensaje original. En
Twilio, además, el operador recibe un texto que distingue *"escribe mejor el pedido"* de
*"avisa al administrador"*. La tabla completa de motivos está en
`docs/features/delivery-ai-parsing.md`.

### Plantilla WhatsApp por escenario (v1.0.9+)
- Cliente nuevo → `welcome_template_sid` (`{{1}}=nombre`, `{{2}}=puntos totales`, `{{3}}=roadmap tiers`)
- Tier desbloqueado → `tier_unlocked_template_sid` (`{{1}}=nombre`, `{{2}}=nombre tier`, `{{3}}=premio safe`, `{{4}}=roadmap tiers`)
- Sin tier nuevo, cerca del siguiente (≤30 pts) → `points_earned_near_template_sid` (`{{1}}=nombre`, `{{2}}=puntos ganados`, `{{3}}=balance`, `{{4}}=próximo premio`)
- Sin tier nuevo, lejos del siguiente (>30 pts) → `points_earned_far_template_sid` (`{{1}}=nombre`, `{{2}}=puntos ganados`, `{{3}}=balance`, `{{4}}=roadmap tiers`)

### Flujo QR Check-in → Google Contacts
1. Cliente hace check-in por QR
2. Nuestra API registra en DB
3. Nuestra API dispara webhook a n8n (`google_contacts_sync`)
4. n8n busca/crea/actualiza contacto en Google Contacts

### Formato esperado del mensaje

El operador escribe **texto libre**: no hay formato obligatorio. Lo único imprescindible es que
en algún sitio aparezca el celular colombiano del cliente (10 dígitos, empieza por 3). De eso se
encarga la IA, no una regex — ver `docs/features/delivery-ai-parsing.md`.

    pedido de Juan 3009876543 cra 43a #1-50 apto 302, paga con nequi, 45 mil

**El remitente ya no se adivina.** Lo da el propio proveedor en un campo autenticado (`From` de
Twilio, `message.sender.phoneNumber` de Zernio) y la ruta lo normaliza a 10 dígitos antes de
buscarlo en `authorized_numbers`. Los patrones que el nodo `parse_dom_1` de n8n usaba para sacar
el remitente del *cuerpo* del mensaje (`celular: +57 3XXXXXXXXX`, etc.) existían para el Chat
Trigger de n8n y **ya no hacen falta**. Las utilidades equivalentes siguen en
`src/services/delivery.service.ts` (`extractClientPhoneFromMessage`, `extractPhoneFromTwilio`).

**Formatos de número soportados:** `+57XXXXXXXXXX`, `57XXXXXXXXXX`, `XXXXXXXXXX` (10 dígitos).

### Casos de error
- Firma de Twilio / HMAC de Zernio inválida → 403 / 401, sin efectos
- Remitente que **no** está en `authorized_numbers` → no es un pedido: sigue el camino normal
  (auto-respuesta en Twilio, solo logging en Zernio)
- ⚠️ **La consulta a `authorized_numbers` falla** (timeout del pooler, 5xx de PostgREST…) →
  `[Delivery][FALLO] reason=remitente_no_verificable` **y se corta ahí**. No se deja caer al
  camino del cliente normal: `supabase-js` no lanza, devuelve `{ data: null, error }`, y ese
  `null` es indistinguible de «no es un operador». Leer solo `data` aquí pierde el pedido en
  silencio — exactamente el fallo de §24, un escalón más arriba
- No se pueden extraer los datos → `[Delivery][FALLO]` con el motivo real + aviso al operador
  (Twilio). Ver la tabla de motivos en `docs/features/delivery-ai-parsing.md`

## Componentes / Archivos
| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/api/webhook/twilio-incoming/route.ts` | **Entrada real (Twilio).** Firma → `authorized_numbers` → `processDeliveryMessage()` → TwiML |
| `src/app/api/webhook/zernio/route.ts` | **Entrada real (Zernio).** Ídem, sin respuesta de texto |
| `src/services/delivery.service.ts` | `processDeliveryMessage()` (intake), `registerDeliveryOrder()` (lógica DB), `resolveDeliveryLocation()`, el embudo de fallos |
| `src/services/delivery-ai.service.ts` | Extracción con OpenAI + `parseDeliveryAiJson()` (puro) |
| `src/constants/delivery-ai.ts` | Prompt, modelo, temperatura, timeouts |
| `src/lib/openai/client.ts` | Único sitio que instancia el SDK de OpenAI |
| `tests/unit/delivery-ai.test.ts` | 33 casos del parseo y del contrato de fallo. **Cero llamadas reales a OpenAI** |
| `src/app/api/webhook/delivery/route.ts` | API Route: cáscara HTTP sobre `registerDeliveryOrder()`. Mismo contrato de siempre — la usa n8n mientras el VPS siga vivo |
| `src/services/google-contacts-sync.service.ts` | Dispara sync de Google Contacts vía n8n |
| `src/lib/validators/twilio.ts` | Validación de firma Twilio (utilidad) |
| `src/services/customer.service.ts` | Reutiliza: findByPhone, createCustomer, incrementVisit |
| `src/services/visit.service.ts` | Reutiliza: createVisit (con campos delivery) |
| `src/services/points.service.ts` | Reutiliza: awardVisitPoints, awardWelcomeBonus |
| `src/services/reward-tiers.service.ts` | Reutiliza: evaluateNewTier, getNextTier, buildTiersRoadmap |
| `n8n/domicilios_whatsapp_v4.json` | Workflow n8n: Twilio → IA parseo → Google Contacts → API |
| `n8n/google_contacts_sync.json` | Workflow n8n: QR check-in → Google Contacts sync |

## API / Endpoints
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/webhook/twilio-incoming` | **Entrada real** de los pedidos en tenants Twilio. Responde TwiML |
| POST | `/api/webhook/zernio` | **Entrada real** de los pedidos en tenants Zernio. Responde 200 |
| POST | `/api/webhook/delivery` | Registro de un pedido YA parseado. Contrato intacto — lo usa n8n mientras el VPS siga vivo |

### POST /api/webhook/twilio-incoming (camino de domicilio)

**Headers:** `X-Twilio-Signature` — firma HMAC de Twilio, obligatoria.
**Body:** formato estándar de Twilio (`application/x-www-form-urlencoded`).

```
From=whatsapp:+573001111111
To=whatsapp:+14155238886
Body=pedido de Juan 3009876543 cra 43a #1-50 nequi 45 mil
NumMedia=0
```

Si `From` (normalizado a 10 dígitos) está en `authorized_numbers` del tenant que resuelve `To`,
el mensaje se trata como un pedido. Si no, sigue el camino de auto-respuesta de siempre.

**Response 200 (éxito)** — mismo texto que devolvía el nodo «Responder OK Domicilio» de n8n:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>✅ Nuevo cliente: Juan Pérez (3009876543). Visita #1</Message>
</Response>
```

**Response 200 (no se pudo leer el pedido)** — el texto depende del motivo real:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>❌ No pude extraer los datos del pedido. Asegúrate de incluir al menos el número de celular del cliente (10 dígitos). Intenta de nuevo.</Message>
</Response>
```

**Response 403:** firma de Twilio inválida.

### POST /api/webhook/zernio (camino de domicilio)

Firma HMAC-SHA256 obligatoria en `X-Zernio-Signature`. El pedido se procesa igual, pero
**no hay respuesta de texto para el operador**: Zernio solo permite enviar plantillas
aprobadas, nunca texto libre. Devuelve `{"received":true,"delivery":true|false}` con 200.

> ⚠️ Siempre 200, también cuando el pedido falla: Zernio desactiva el webhook entero tras 10
> fallos consecutivos, y un 5xx aquí costaría los pedidos de **todos** los tenants Zernio. El
> registro del fallo va al log (`[Delivery][FALLO]`), no al status HTTP. **Esto es justo lo
> que arregla la Fase 2**: antes devolvía 200 vacío y no registraba nada.

### POST /api/webhook/delivery

Contrato sin cambios — ver `docs/API_DOCS.md`. Protegido por `x-webhook-secret`, 60 req/min
por IP, exige `tenant_slug` y `celular`.

## Restricciones
- Solo se procesan como pedido los mensajes de números en `authorized_numbers` con
  `is_active = true` **y el `tenant_id` correcto** (el `service_role` no aísla: es ese filtro
  escrito a mano)
- `OPENAI_API_KEY` es obligatoria: sin ella no entra ni un domicilio (falla ruidosamente)
- La API de `/api/webhook/delivery` valida `x-webhook-secret` (fail-closed: sin secret
  configurado responde 503)
- Los datos del cliente se sanitizan antes de guardar en DB
- Google Contacts requiere OAuth2 configurado en n8n (Fase 3 diferida)

## Pendiente

### Hecho
- [x] API Route webhook (`/api/webhook/delivery`) + validación de firma Twilio
- [x] Migraciones de `authorized_numbers` y de los campos de delivery en `visits`
- [x] Servicio de Google Contacts sync (trigger a n8n) + check-in que lo dispara
- [x] **Fase 2 de §25: parseo con IA y registro dentro del producto** (2026-09-03)
- [x] **Fallo silencioso de `webhook/zernio` arreglado** — todo fallo deja `[Delivery][FALLO]`
- [x] Pruebas del parseo (`tests/unit/delivery-ai.test.ts`, 33 casos, OpenAI mockeado)

### Lo que tiene que hacer el dueño
- [ ] **Crear `OPENAI_API_KEY` en Vercel** antes de desplegar. Sin ella, cero domicilios
- [ ] Poner `"delivery_default_city": "Envigado"` en `tenants.config` de Sushi Service para
      conservar el comportamiento actual de la ciudad
- [ ] Apagar el VPS de n8n cuando esta fase esté en producción (§25.7, respuesta 3).
      `domicilios_whatsapp_v4` deja de recibir tráfico solo, pero W3 (Google Contacts) muere
      con el VPS: `syncGoogleContact()` hace no-op y no rompe nada
- [ ] Borrar `N8N_DOMICILIOS_WEBHOOK_URL` del proyecto Vercel (ya no se lee en ningún sitio)

### Abierto
- [ ] **§24-B — apartado de domicilios**: la lista de qué clientes entraron por domicilio y la
      **alarma de silencio**. Hoy el registro de un pedido perdido es el log de Vercel, no una
      tabla. Cuando esa tabla exista, el `INSERT` va dentro de `logDeliveryIntakeFailure()`
- [ ] Confirmación al operador en el canal Zernio (exige una plantilla aprobada propia — ver
      `docs/features/zernio-messaging.md`)
- [ ] Fase 3 — Google Contacts con OAuth propio del cliente (**diferida**, §25.7 respuesta 1)
