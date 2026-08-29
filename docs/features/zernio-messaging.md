# Feature: Mensajería Zernio (proveedor alterno a Twilio)

**Agregado:** v2.10.0 — 2026-08-29
**Migración:** `00036_zernio_provider.sql` (requiere `00035_aios_constelarys_role.sql` v2 aplicada antes)
**Ver también:** `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §1 (investigación e histórico de
decisiones) y §11 (AIOS Constelarys, el CRM externo que usa las funciones de aprovisionamiento de
esta migración).

## Objetivo

Que un tenant pueda enviar WhatsApp por **Zernio** en vez de Twilio, sin tocar los ~10 call-sites de
negocio que arman variables y llaman a `sendTemplateMessage()`, y sin que el swap ponga en riesgo a
los tenants Twilio existentes (Sushi Service, Don Alirio, Frangal, Demo) — su comportamiento debe
quedar **byte a byte igual** que antes de esta migración.

## Por qué Zernio y qué NO es

Zernio no es un BSP de WhatsApp puro como Twilio: su producto central es una API unificada de
mensajería para 16 plataformas sociales; WhatsApp + SMS + números de teléfono son un módulo dentro
de eso. Lo que nos interesa de él es que la compra de línea + activación de WhatsApp es self-service
(objetivo final: que dar de alta un cliente nuevo no dependa de 9 pasos manuales entre Twilio, Meta
Business Suite, Vercel y el editor SQL de Supabase — ver REQUERIMIENTOS_AGOSTO_2026.md §1).

**Diferencias de modelo que obligaron a tocar código** (no solo credenciales):
- **Plantillas:** Zernio identifica una plantilla por `name` (slug propio) + `language`, no por un SID
  opaco como Twilio. `contentSid` en `sendTemplateMessage()` se sigue llamando así por compatibilidad
  de firma, pero en el camino Zernio se interpreta como ese `name`.
- **Variables:** Twilio recibe un diccionario `{'1': ..., '2': ...}`; Zernio siempre recibe un **array
  plano en orden de aparición** (`templateParams: [...]`). `toZernioTemplateParams()` en
  `whatsapp.service.ts` hace esa conversión, rellenando huecos con `''`.
- **Subcuentas:** Twilio tiene subcuenta por cliente (SID+token propios). Zernio no — la jerarquía es
  `Team → Profile → Account`, con **una sola API key** para toda la integración y aislamiento por
  `accountId`/`profileId` en cada request. Por eso `tenants` no gana un "token Zernio" por tenant, solo
  `zernio_profile_id`/`zernio_account_id`/`zernio_phone_number` — la credencial (`ZERNIO_API_KEY`) es
  una sola, a nivel de proyecto.
- **Media dinámica:** Twilio exige que la URL de media viva en la definición de la plantilla, con el
  path como variable después del dominio fijo (`src/lib/twilio/media.ts`). Zernio acepta la URL
  pública **completa** como `headerMedia.link` en cada envío puntual — no hay que tocar la plantilla
  para cambiar la imagen.
- **Webhooks:** Twilio manda `Body`/`From`/`To` form-encoded y espera TwiML (XML) de vuelta. Zernio
  manda un sobre JSON anidado (`{id, event, message, conversation, account, timestamp}`) y solo exige
  un `2xx` en <5s, sin body — nada de responder con contenido en la misma petición.

## Arquitectura del ruteo por proveedor

```
                         tenants.messaging_provider
                                    │
                    ┌───────────────┴───────────────┐
                    │ 'twilio' (default)             │ 'zernio'
                    ▼                                 ▼
     sendTemplateMessage()                sendTemplateMessage()
       → getTwilioClient()                  → sendViaZernio()
       → client.messages.create()             → INVARIANTE: sin zernio_account_id
       → 100% código legacy,                    o zernio_phone_number, NUNCA cae
         sin cambios                            a Twilio — falla con
                                                 'zernio_not_configured'
                                               → toZernioTemplateParams()
                                               → normalizePhoneForZernio()
                                               → sendZernioTemplateMessage()
```

`sendTemplateMessage()` (`src/services/whatsapp.service.ts`) sigue siendo el **único choke-point de
envío** de todo el sistema — los ~10 call-sites de negocio (check-in, campañas manuales, birthday,
reactivation, reward-reminder, mystery box, delivery webhook, imported-contacts, calendario,
check-in-override) no cambiaron ni una línea. Solo la función decide adentro, por
`tenant.messaging_provider`, con qué proveedor hablar.

- `is_demo` y el opt-out local (`isPhoneOptedOut`) se evalúan en **ambas** ramas, con el mismo criterio
  — un tenant demo o un cliente en opt-out nunca dispara ni Twilio ni Zernio.
- **Invariante de seguridad** (`sendViaZernio()`): un tenant `messaging_provider='zernio'` SIN
  `zernio_account_id` o SIN `zernio_phone_number` **nunca** cae al fallback de credenciales Twilio
  master. Esa era la trampa documentada en `scripts/seed-new-tenant.sql`: sembrar configuración en un
  tenant a medio activar termina enviando (y cobrando) desde el número de OTRO cliente. En vez de eso,
  se registra `message_logs.status='failed'`, `error_code='zernio_not_configured'`, sin
  `twilio_sid` — así el trigger de billetera (`trg_debit_wallet`, 00033) no cobra un envío que nunca
  salió.
- `message_logs.twilio_sid` **no se renombra**: guarda el `messageId` de Zernio cuando el proveedor es
  Zernio. El nombre de columna es legacy pero el contrato real ("id no-nulo del proveedor, dispara el
  cobro") es el mismo para ambos — renombrarla habría significado tocar el trigger 00033 y los otros
  ~4 lugares que la leen (`campaign_messages.twilio_sid`, `imported_contacts.twilio_sid`, etc.), fuera
  del alcance de esta migración.

### Calendario (`calendar.service.ts`)

- `assertEventTemplateUsable()` es provider-aware: para Zernio valida con `listZernioTemplates()` que
  exista una plantilla con ese `name` y `status='APPROVED'`; para Twilio sigue exactamente igual
  (valida contra la Content API que la media no sea fija).
- El envío del evento **no** manda la variable `{{6}}` con el path del flyer cuando el tenant es
  Zernio — en su lugar pasa `options.headerMediaUrl` con la URL pública completa (base de
  `src/lib/twilio/media.ts` + el path del bucket) y `headerMediaType` según `event.media_type`. Para
  Twilio, la variable `{{6}}` + `keepAllVariables: true` siguen exactamente igual.

## Contrato con el AIOS Constelarys (migración `00036_zernio_provider.sql`)

El AIOS Constelarys (CRM interno, repo/Supabase propio, ver REQUERIMIENTOS_AGOSTO_2026.md §11) conecta
a esta base con el rol restringido `aios_constelarys` (creado en `00035` v2). Su ÚNICA vía de
escritura son tres funciones `SECURITY DEFINER` — el rol no tiene INSERT/UPDATE directo sobre ninguna
tabla:

| Función | Quién la llama / cuándo | Qué hace |
|---|---|---|
| `aios_provision_tenant(payload jsonb)` | Alta de un cliente nuevo desde el panel del AIOS | Port fiel de `scripts/seed-new-tenant.sql`: valida `slug`/`business_type`, inserta `tenants` (config de branding, `messaging_provider` del payload o `'zernio'` por default, CERO `twilio_*` y CERO `*_template_sid`), los 4 `reward_tiers` default, los `admin_settings` default, y las sedes de `payload.locations`. **Sin upsert** — si el slug ya existe, lanza `tenant_ya_existe` (un CRM externo no debe poder pisar un tenant que ya opera). |
| `aios_activate_whatsapp(slug, profile, account, phone)` | Cuando el AIOS termina de aprovisionar el número en Zernio (fuera de esta función — compra/activación real vía la API de Zernio, ver `Level 2.0/aios-constelarys/docs/zernio-api-contract.md`) | Guarda `messaging_provider='zernio'` + `zernio_profile_id`/`zernio_account_id`/`zernio_phone_number` en el tenant. Valida `phone` como E.164 (`^\+[0-9]{7,15}$`). |
| `aios_set_template_settings(slug, settings jsonb)` | Cuando se cargan los `name` de las plantillas aprobadas para ese tenant | Upsert en `admin_settings` de claves `*_template_sid` / `zernio_template_language`. **Exige que el tenant ya sea `messaging_provider='zernio'`** — si no, lanza `solo_tenants_zernio`. Esto bloquea el mismo vector de ataque de `seed-new-tenant.sql`: sembrar un `*_template_sid` en un tenant que todavía cae al fallback de credenciales master enviaría (y cobraría) desde el número de otro cliente. |

Las tres funciones tienen `SET search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC` y
`GRANT EXECUTE` solo a `aios_constelarys` — ningún otro rol (ni `authenticated`, ni `anon`) puede
llamarlas.

## Webhook (`src/app/api/webhook/zernio/route.ts`)

Contraparte de `twilio-incoming/route.ts` para tenants Zernio.

- **Firma obligatoria:** `X-Zernio-Signature` (alias `X-Late-Signature`), HMAC-SHA256 sobre el body
  crudo, verificada con `verifyZernioSignature()` (`src/lib/zernio/webhooks.ts`). Zernio trata su
  propia firma como OPCIONAL — este endpoint la exige siempre: sin header o sin
  `ZERNIO_WEBHOOK_SECRET`, responde 401. Ver `docs/03-security.md`.
- `webhook.test` → 200 (usado por Zernio para validar la URL al crear el webhook).
- `message.received` → resuelve el tenant por `payload.account` contra `tenants.zernio_account_id`
  (sin match: log + 200, nunca 5xx — Zernio reintenta agresivo si no obtiene 2xx). Reutiliza el
  criterio de opt-out/opt-in de `twilio-incoming` (mismos keywords, duplicados a propósito — ver
  comentario en el archivo). Si el remitente es un mesero autorizado (`authorized_numbers`), reenvía a
  n8n con el MISMO formato plano `Body`/`From`/`To`/`tenant_slug` que usa Twilio hoy — n8n no se toca.
- `message.delivered` / `message.read` / `message.failed` → `UPDATE message_logs WHERE twilio_sid =
  message.id` (status + `delivered_at` si delivered, `error_code`/`error_message` si failed). Esto es
  en realidad la **primera vez** que algo alimenta el status de entrega en `message_logs` — Twilio
  nunca tuvo un webhook de status-callback conectado en este repo (`delivered_at` existía en el schema
  desde 00020 pero nunca se escribía).

### Robustez del webhook (post-review)

Zernio entrega los webhooks **at-least-once** (reintenta hasta 7 veces con backoff exponencial si no
recibe 2xx en <5s) y sin garantía de orden FIFO — el endpoint tiene que ser tolerante a eventos
duplicados y fuera de orden:

- **Jerarquía de estados** (`handleDeliveryStatus()`): el `UPDATE` respeta `sent < delivered < read` y
  nunca degrada un estado más avanzado. `message.read` se aplica siempre (es el tope). `message.delivered`
  lleva `.neq('status', 'read')` — no pisa un `read` que llegó fuera de orden. `message.failed` lleva
  `.not('status', 'in', '(delivered,read)')` — un `failed` tardío no puede deshacer una entrega o lectura
  ya confirmadas.
- **Dedup por `event_id`** (`handleMessageReceived()`): antes de cualquier efecto de negocio (opt-out,
  forward a n8n) se hace `INSERT` en `webhook_events_seen` (PK `(provider, event_id)`, migración 00036);
  un `23505` (evento ya visto) responde `200 {received:true, duplicate:true}` sin repetir el efecto. Si
  la tabla no existe todavía en un entorno (`42P01`), es fail-open: loguea y sigue sin dedup.
- **Sender sin `phoneNumber` (BSUID)**: desde abril-2026 Meta puede mandar el `businessScopedUserId`
  (identificador opaco) en vez de un `phoneNumber` real (ver `ZernioInboxMessageSender` en
  `src/lib/zernio/webhooks.ts`). El handler NO usa `message.sender.id` como fallback de teléfono —
  derivar "10 dígitos" de un BSUID producía opt-outs sobre números falsos y rompía el match contra
  `authorized_numbers`. Sin `phoneNumber`, se loguea y se responde 200 sin ningún efecto de negocio.
- **Límite de tamaño de body**: `POST` revisa el header `content-length` ANTES de leer el body — un
  valor por encima de 64 KiB responde `413 {error:'payload_too_large'}` sin materializar el body en
  memoria. Los payloads documentados de Zernio son de pocos KB.

## Invariantes de seguridad

1. Un tenant `messaging_provider='zernio'` sin `zernio_account_id`/`zernio_phone_number` **nunca** cae
   a Twilio (`sendViaZernio()` en `whatsapp.service.ts`).
2. `aios_set_template_settings()` rechaza escribir `*_template_sid` en un tenant que no sea ya
   `messaging_provider='zernio'` (migración 00036, función SQL).
3. El rol `aios_constelarys` no tiene INSERT/UPDATE directo sobre ninguna tabla — solo `EXECUTE` sobre
   las tres funciones `SECURITY DEFINER`, cada una con su propia validación interna.
4. El webhook de Zernio exige firma siempre, aunque Zernio la trate como opcional.
5. El camino Twilio de los tenants existentes queda **byte a byte igual**: mismo orden de checks
   (`is_demo` → credenciales → opt-out → envío → reintento 21665), mismas funciones, sin tocar una
   sola línea de esa rama.

## Pendiente / fuera de alcance de esta entrega

- **Métricas de Zernio:** `docs/features/twilio-metrics.md` (`twilio-metrics`, `twilio-balance`) no
  tiene contraparte Zernio — el dashboard de entregabilidad/opt-outs solo cubre Twilio hoy.
- **UI de plantillas Zernio:** `dashboard/templates` (creación + auto-submit a Meta) sigue siendo
  100% Twilio Content API. Cargar plantillas de Zernio hoy es manual, vía
  `aios_set_template_settings()` desde el AIOS o directo en SQL.
- **Balance/saldo de Zernio:** no hay endpoint equivalente a `/api/dashboard/twilio-balance` — el
  saldo de Zernio se factura a nivel de Team completo (no por profile/tenant), y el dueño del proyecto
  aún no decidió si los tenants de Cada1 van en su cuenta Zernio ya existente (compartida con otro
  proyecto) o en una cuenta dedicada — ver REQUERIMIENTOS_AGOSTO_2026.md §1.
- **Auto-reply de intents en el webhook:** `handleMessageReceived()` detecta la intención del mensaje
  entrante (pedido/horario/ubicación, misma lógica que `twilio-incoming`) SOLO para logging. No envía
  el auto-reply real: Zernio no ofrece una respuesta síncrona tipo TwiML en el propio webhook, y este
  proyecto no tiene una función de envío de **texto libre** vía Zernio (`src/lib/zernio/messaging.ts`
  solo envía plantillas aprobadas — consistente con la regla "SOLO PLANTILLAS APROBADAS" del resto del
  sistema). Implementarlo de verdad requeriría una llamada de salida aparte, fuera del alcance de esta
  migración.
- **Prueba E2E real:** no se ha enviado un mensaje de verdad a un número controlado por el equipo con
  un tenant `messaging_provider='zernio'` en producción — `scripts/zernio-sandbox-test.mjs` existe
  para hacer esa prueba manual contra el número de sandbox compartido de Zernio (`+12029087457`),
  pero correrlo queda pendiente de que el dueño decida la cuenta/Team de Zernio a usar (§1).
- **`Level 2.0/aios-constelarys/docs/zernio-api-contract.md`**: documenta los endpoints reales de
  compra/activación de número y Embedded Signup de Meta — el flujo real de "comprar número + activar
  WhatsApp" que dispara `aios_activate_whatsapp()` NO está implementado en el AIOS todavía (es un
  repo/proyecto separado); esta migración solo deja lista la función SQL que lo recibiría.
