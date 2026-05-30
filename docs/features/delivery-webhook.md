# Feature: Webhook Domicilios (WhatsApp)

> **Estado:** Completo (API + n8n workflows)
> **Archivos clave:** `src/app/api/webhook/delivery/route.ts`, `src/services/google-contacts-sync.service.ts`, `n8n/domicilios_whatsapp_v4.json`, `n8n/google_contacts_sync.json`
> **Dependencias:** @supabase/supabase-js, n8n (externo), OpenAI (parseo IA en n8n)

---

## Descripción
Sistema híbrido n8n + Next.js para procesar pedidos de domicilio por WhatsApp.

**Arquitectura:**
- **n8n** recibe el webhook de Twilio, parsea el mensaje, sincroniza Google Contacts
- **Nuestra API** (`/api/webhook/delivery`) maneja toda la lógica de DB: crear/actualizar cliente, registrar visita, evaluar recompensas
- **Google Contacts** se sincroniza tanto desde domicilios (vía n8n directamente) como desde QR check-in (vía webhook a n8n)

## Objetivo
Captar clientes de domicilios automáticamente sin que el cliente tenga que hacer nada. El mesero solo reenvía el mensaje.

## Modelo de Datos
Tablas involucradas:
- **authorized_numbers** — Números de meseros autorizados para enviar datos al webhook
- **customers** — Se busca/crea el cliente extraído del mensaje
- **visits** — Se registra visita con `source = 'delivery'`

## Flujo de Uso

### Flujo Domicilios (Twilio → n8n → API)
1. Cliente pide domicilio por WhatsApp al restaurante
2. Mesero reenvía el mensaje al número de Twilio
3. Twilio envía webhook a n8n (`domicilios_whatsapp_v4`)
4. n8n extrae el remitente y valida en `authorized_numbers` (Supabase)
5. **OpenAI (gpt-4o-mini) extrae datos del texto libre** (nombre, celular, dirección, pago, monto) — ver `docs/features/delivery-ai-parsing.md`
6. n8n busca/crea/actualiza contacto en Google Contacts
7. n8n llama a `POST /api/webhook/delivery` con datos parseados
8. Nuestra API crea/actualiza cliente + visita + otorga puntos + evalúa tiers desbloqueados
9. n8n responde a Twilio con TwiML de confirmación

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

### Formato Esperado del Mensaje
El mesero reenvía un mensaje que contiene el teléfono del cliente. El nodo `parse_dom_1` extrae el body de (en orden): `Body`, `messages[0].text.body`, `text`, `body`, `chatInput`, `message`. El remitente se obtiene de: `From`, `messages[0].from`, `from`, `sender`; si ninguno está presente (ej: n8n Chat Trigger), extrae el celular directamente del cuerpo del mensaje con los siguientes patrones (en orden de prioridad):
1. `celular: +57 3XXXXXXXXX`
2. `celular: 3XXXXXXXXX`
3. número de 10 dígitos colombianos suelto (3XXXXXXXXX)

**Formatos de número soportados:** `+57XXXXXXXXXX`, `57XXXXXXXXXX`, `XXXXXXXXXX` (10 dígitos).

### Casos de Error
- Número del remitente no autorizado → 403 + ignorar
- No se puede extraer teléfono del cliente → responder al mesero pidiendo formato correcto
- Firma de Twilio inválida → 403

## Componentes / Archivos
| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/api/webhook/delivery/route.ts` | API Route: recibe datos parseados de n8n, lógica DB |
| `src/services/google-contacts-sync.service.ts` | Dispara sync de Google Contacts vía n8n |
| `src/services/delivery.service.ts` | Parseo de mensajes (utilidad) |
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
| POST | `/api/webhook/delivery` | Webhook de Twilio para mensajes WhatsApp |

### POST /api/webhook/delivery

**Headers requeridos:**
- `X-Twilio-Signature` — Firma HMAC de Twilio
- `Content-Type: application/x-www-form-urlencoded` (formato Twilio)

**Body (Twilio webhook format):**
```
From=whatsapp:+573001111111
To=whatsapp:+14155238886
Body=Pedido de 3009876543 - 2 hamburguesas
NumMedia=0
```

**Response 200 (éxito):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>✅ Cliente registrado: 3009876543. Visita #X</Message>
</Response>
```

**Response 200 (error de parseo):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>❌ No pude encontrar un número de celular válido. Reenvía el mensaje con el número del cliente.</Message>
</Response>
```

**Response 403 (no autorizado):**
```json
{ "error": "No autorizado" }
```

## Restricciones
- Solo se aceptan mensajes de números en `authorized_numbers` con `is_active = true` (validado en n8n contra DB)
- La API valida `x-webhook-secret` para proteger el endpoint de delivery
- Los datos del cliente se sanitizan antes de guardar en DB
- Google Contacts requiere OAuth2 configurado en n8n
- Las respuestas de n8n a Twilio son TwiML (XML)

## Pendiente
- [x] Implementar API Route webhook (`/api/webhook/delivery`)
- [x] Implementar servicio de parseo de mensajes
- [x] Implementar validación de firma Twilio (utilidad)
- [x] Crear migración SQL para authorized_numbers
- [x] Crear migración SQL para campos delivery en visits
- [x] Crear servicio Google Contacts sync (trigger a n8n)
- [x] Generar workflow n8n v3 (domicilios) + workflow Google Contacts sync
- [x] Actualizar check-in para disparar sync de Google Contacts
- [ ] Ejecutar migraciones 00002 y 00003 en Supabase
- [ ] Configurar OAuth2 de Google en n8n
- [ ] Importar workflows en n8n y configurar env vars
- [ ] Insertar números autorizados de prueba en `authorized_numbers`
