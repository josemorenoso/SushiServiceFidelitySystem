# Despliegue e Infraestructura — Constelarys Fidelity System

> **Última actualización:** 2026-07-07 — v2.4.0, arquitectura **multitenant** (un solo
> Vercel + un solo Supabase compartidos por todos los clientes; ver §1 y §6).
> **Documento único** que reemplaza: `INFRAESTRUCTURA.md`, `DEPLOYMENT_GUIDE.md`, `CONFIGURACIONES_TWILIO_SISTEMA.md`, `n8n-workflows/README.md`
> Para plantillas WhatsApp (textos, variables, lógica de selección) → [`docs/PLANTILLAS.md`](./PLANTILLAS.md)
> Para MCP Server de Twilio en el IDE → [`docs/TWILIO_MCP_SETUP.md`](./TWILIO_MCP_SETUP.md)
>
> ⚠️ **El modelo "1 cliente = 1 Vercel + 1 Supabase" (clonar el repo) quedó obsoleto desde
> v2.3.0/v2.4.0.** Si ves un doc, script o workflow n8n que hable de crear un proyecto nuevo
> por cliente, está desactualizado — el flujo real está en §6.

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Plataforma: Vercel](#2-plataforma-vercel)
3. [Plataforma: Supabase](#3-plataforma-supabase)
4. [Plataforma: Twilio](#4-plataforma-twilio)
5. [Plataforma: n8n (self-hosted)](#5-plataforma-n8n-self-hosted)
6. [Onboarding de nuevo cliente](#6-onboarding-de-nuevo-cliente)
7. [Checklist pre-launch](#7-checklist-pre-launch)
8. [Costos por cliente](#8-costos-por-cliente)
9. [Riesgos técnicos activos](#9-riesgos-técnicos-activos)

---

## 1. Arquitectura general

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ENTRADAS                                         │
│  [QR físico en mesa]  [WhatsApp domicilio]  [WhatsApp STOP/respuesta]  │
│         │                     │                        │                │
│         ▼                     ▼                        ▼                │
│  GET /check-in       Twilio Messaging Svc      Twilio Incoming Hook    │
└──────────┬────────────────────┬───────────────────────┬────────────────┘
           │                   │                        │
           ▼                   ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                 VERCEL (Next.js 16 App Router — serverless)              │
│  /api/check-in              → Registro QR + WhatsApp bienvenida          │
│  /api/webhook/delivery      → Registro domicilio + WhatsApp cliente      │
│  /api/webhook/twilio-incoming → Auto-responder (redirige al humano)      │
│  /api/cron/birthday         → Felicitaciones cumpleaños (disparado por n8n) │
│  /api/cron/reactivation     → Re-engagement inactivos (disparado por n8n)  │
│  /api/dashboard/*           → Dashboard admin (auth requerida)           │
│  /api/staff/*               → App mesero (auth staff)                   │
│                                                                          │
│  vercel.json → "crons": [] (VACÍO desde 2026-07-05). birthday y         │
│  reactivation se disparan SOLO desde n8n — ver §5. Antes corrían         │
│  duplicados (Vercel nativo + n8n a la vez); el propio código los         │
│  des-duplicaba vía hasRecentCampaignMessage(), pero gastaba recursos     │
│  doble y tenía un riesgo latente de carrera si coincidían al segundo.    │
└────────────────────┬────────────────────┬────────────────────────────────┘
                     │                    │
          ┌──────────┘                    └──────────┐
          ▼                                          ▼
┌─────────────────────┐              ┌──────────────────────────────────┐
│  SUPABASE           │              │  TWILIO (WhatsApp API)           │
│  PostgreSQL + Auth  │              │  Messaging Service (shared num)  │
│  RLS en todas tabs  │              │  Content Templates (aprobadas)   │
│  Storage: event-media│             │  ~$0.005/msg MARKETING           │
│  23 migraciones     │              │  ~$0.003/msg UTILITY             │
└─────────────────────┘              └──────────────────────────────────┘
                                                    ▲
          ┌─────────────────────────────────────────┘
          │
┌─────────────────────────────────────────────────────────────┐
│  n8n VPS SELF-HOSTED  (https://n8n.almojabananet.me)        │
│                                                             │
│  W1 · delivery-webhook   (activo)                          │
│     Twilio → parseo texto libre (OpenAI) → /api/webhook/delivery  │
│     → Google Contacts sync                                  │
│                                                             │
│  W2 · calendar-dispatch  (activo) ← NUEVO v2.1.0           │
│     Schedule */15 min → POST /api/cron/calendar-dispatch    │
│     (evita exigir plan Vercel Pro — 3er cron + cadencia)    │
│                                                             │
│  W3 · google-contacts-sync  (pendiente de crear)            │
│     Webhook → Google Contacts API (create/update)           │
└─────────────────────────────────────────────────────────────┘
```

> **⚠️ Nota UTC / Colombia:** Colombia es UTC-5. Si el Schedule Trigger de n8n usa UTC,
> `0 8 * * *` = 3:00 AM Colombia | `0 13 * * *` = 8:00 AM Colombia. Verificar la zona
> horaria configurada en cada workflow de n8n ("Cron Birthday" / "Cron Reactivación")
> para confirmar a qué hora Colombia realmente disparan.
> **`vercel.json` ya NO dispara estos 2 crons (desde 2026-07-05) — el disparo real
> vive 100% en n8n.** No agregar de vuelta esas entradas sin apagar antes las de n8n
> (evitar volver al doble disparo).

---

## 2. Plataforma: Vercel

### Stack y deploy

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2 (App Router) — TypeScript, TailwindCSS v4, shadcn/ui |
| Deploy | Vercel — auto-deploy desde GitHub `main` |
| Plan | Hobby (gratis) — soporta 2 crons diarios + funciones serverless |

```bash
# Deploy manual (requiere Vercel CLI)
npm i -g vercel
vercel deploy --prod
```

O desde Vercel Dashboard: Import Git Repository → Framework: Next.js → configurar env vars → Deploy.

### Variables de entorno — modelo multitenant (v2.3.0+)

Hay **un solo proyecto Vercel** para todos los clientes. Estas variables se configuran **una
sola vez** ahí y las comparten todos los tenants — NO se crea una copia por cliente nunca más:

| Variable | Alcance | Descripción |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | URL del proyecto Supabase compartido |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública | Anon key (lectura pública segura) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Servidor** | Service role key — NUNCA exponer al cliente |
| `CRON_SECRET` | **Servidor** | Secret para autenticar crons (32 chars aleatorios). Mismo valor en n8n para todos los clientes. |
| `WEBHOOK_DELIVERY_SECRET` | **Servidor** | Secret compartido con n8n para `/api/webhook/delivery`. Mismo valor en n8n para todos los clientes. |
| `N8N_DOMICILIOS_WEBHOOK_URL` | **Servidor** | URL del webhook n8n de domicilios (W1) — un único workflow compartido, ver §5 |
| `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` | **Servidor** | URL webhook n8n Google Contacts (W3, opcional) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` / `TWILIO_MESSAGING_SERVICE_SID` | **Servidor** | Cuenta **master** (Sushi Service). Sirve de *fallback* cuando un tenant no tiene su propia subcuenta configurada — ver `getTwilioClient()` en `src/services/whatsapp.service.ts` |
| `NEXT_PUBLIC_BRAND_NAME` / `NEXT_PUBLIC_BRAND_SHORT` / `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` / `RESTAURANT_WHATSAPP_LINK` | Pública / Servidor | Branding **default del sistema** — solo se usa si un tenant no tiene su propio `config` en la tabla `tenants`. Ver `src/lib/branding.ts` |
| `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` | Pública | (Opcional) Credenciales del login demo |

### Datos por-tenant — NO van en Vercel, van en la tabla `tenants` (Supabase)

Cuando entra un cliente nuevo (ej. Don Alirio), esto **no se toca en Vercel**. Se inserta una
fila en `tenants` (ver §6) con:

| Columna | Reemplaza a la env var... | Notas |
|---------|---------------------------|-------|
| `config.brand_name`, `brand_short`, `brand_tagline`, `staff_role_label`, `google_maps_url`, `whatsapp_link`, `delivery_phone`, `card_bg`, `page_bg` | `NEXT_PUBLIC_BRAND_*`, `RESTAURANT_WHATSAPP_LINK`, `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | Resuelto por dominio en cada request — ver `src/lib/branding.ts` (`resolveBranding()`) y `src/lib/branding-server.ts` |
| `twilio_subaccount_sid`, `twilio_subaccount_auth_token`, `twilio_messaging_service_sid`, `twilio_whatsapp_number` | `TWILIO_*` | Si están vacías, el sistema cae al fallback master (columna de arriba) — útil solo en pruebas, en producción cada tenant real tiene su propia subcuenta |
| `domain` | — (nuevo) | Dominio custom del tenant, agregado también como Domain en Vercel — ver §6 paso 3 |
| `slug` | — (nuevo) | Usado por n8n (`tenant_slug`) y por los crons (`?tenant=`) — ver §5 |

### Crons en `vercel.json`

```json
{
  "crons": []
}
```

> **Vacío a propósito desde 2026-07-05.** `birthday` y `reactivation` se disparaban
> ANTES desde aquí (Vercel nativo) Y desde n8n al mismo tiempo — doble disparo diario.
> El código los des-duplicaba (`hasRecentCampaignMessage()`), así que el cliente final
> nunca recibió mensajes repetidos, pero se gastaba el trabajo dos veces y existía un
> riesgo de carrera si ambos disparos coincidían al segundo. Se decidió dejar **solo
> n8n** como disparador único — ver [§5](#crons-de-birthdayreactivacion-via-n8n).
> `calendar-dispatch` tampoco está aquí — lo dispara n8n (ver [§5 W2](#w2--calendar-dispatch)). Agregar un 3er cron con cadencia `*/15` exigiría plan Vercel Pro.

---

## 3. Plataforma: Supabase

### Setup inicial

1. Ir a https://supabase.com → "New Project"
2. Nombre: `fidelity-[cliente]` | Region: `us-east-1` (o la más cercana)
3. Copiar `Project URL` y `anon key` de Settings → API
4. Copiar `service_role key` de Settings → API (guardar seguro)
5. Crear usuario admin: Authentication → Users → "Invite user"

### Migraciones SQL (ejecutar en orden en SQL Editor)

```
00001_initial_schema.sql          → customers, visits, rewards, RLS base
00002_authorized_numbers.sql      → Tabla meseros autorizados
00003_delivery_fields.sql         → Campos delivery en visits
00004_campaigns.sql               → campaigns + campaign_messages
00005_add_city.sql                → Campo city en customers
00006_source_channels_frequency_cap.sql → source_channels + last_campaign_at
00007_admin_settings.sql          → Tabla key-value de configuración
00008_accepts_marketing.sql       → Consentimiento marketing (GDPR/Meta)
00009_table_number.sql            → Mesa en visitas
00010_rewards_optional_milestone.sql → visit_milestone nullable
00011_rewards_black_tier.sql      → Campo is_black en rewards
00012_calendar_events_and_media.sql → restaurant_events + bucket event-media
00013_points_mystery_box.sql      → Sistema de puntos, tiers, Mystery Box
00014_geolocation.sql             → Coordenadas y ubicación del restaurante
00015_service_role_policies.sql   → Políticas RLS para service role
00016_ensure_default_tiers.sql    → Seed de tiers por defecto
00017_cleanup_legacy_tiers.sql    → Limpieza tiers legacy
00018_staff_qr_scan.sql           → staff_members, device_tokens, PIN
00019_legacy_points_backfill.sql  → Backfill puntos para clientes existentes
00020_message_logs.sql            → Logs de mensajes WhatsApp con estado
00021_customer_whatsapp_opt_out.sql → Opt-out persistente (tabla + flag)
00022_reward_redemptions.sql      → Trazabilidad entrega física de premios
00023_imported_contacts.sql       → Tabla contactos importados (Golden Bullet)
```

**Manual SQL adicional** (no tiene migración propia):

```sql
CREATE TABLE IF NOT EXISTS auto_reply_cooldown (
  phone TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Bucket Storage

| Bucket | Acceso | Propósito |
|--------|--------|-----------|
| `event-media` | Público (lectura anónima) | Imágenes/videos de eventos del calendario |

> La lectura pública es requerida por Twilio/Meta para descargar el asset al enviar.

---

## 4. Plataforma: Twilio

### Dos números (arquitectura crítica)

| Número | Función | Quién responde |
|--------|---------|----------------|
| **Twilio WhatsApp** (automático) | Envío de plantillas + recepción redirigida | Solo el sistema |
| **WhatsApp del Restaurante** (humano) | Pedidos, dudas, atención en vivo | Staff del restaurante |

⚠️ Mezclarlos en el mismo número rompe la experiencia. Son roles distintos.

### ⚠️ Dos modelos de aprovisionamiento — detectar ANTES de correr `twilio-setup.mjs`

Descubierto onboardeando a Don Alirio (jul/2026): Twilio tiene dos formas de tener un número
WhatsApp activo y no se ven igual en la API. `scripts/twilio-setup.mjs` solo entiende la primera.

1. **Modelo clásico** (`IncomingPhoneNumbers` + Messaging Service) — el número aparece en
   `GET /2010-04-01/Accounts/{SID}/IncomingPhoneNumbers.json`. `twilio-setup.mjs` funciona tal cual.
2. **Modelo self-service Senders API** (más nuevo) — el número NO aparece ahí; vive en
   `GET https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp` (SID con prefijo
   `XE...`). **No usa Messaging Service** — `whatsapp.service.ts` ya envía con
   `from: tenant.twilio_whatsapp_number` directo, sin `messagingServiceSid`. Si corres
   `twilio-setup.mjs` contra una cuenta así, falla con "número no encontrado" — no es un error de
   credenciales, es que busca en el endpoint viejo.

Detectar cuál tiene un cliente nuevo:
```bash
curl -s -u "AC_SUBCUENTA:AUTH_TOKEN" "https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp"
```
Si el número aparece ahí → modelo 2: configurar webhook y opt-out a mano en Console (secciones de
abajo, ambas ya funcionan igual para los dos modelos) y dejar `twilio_messaging_service_sid = NULL`
en la fila `tenants`.

### Configurar Messaging Service (solo modelo clásico)

1. Twilio Console → Messaging → Services → "Create Messaging Service"
2. Agregar el número WhatsApp al Messaging Service
3. Guardar el SID del servicio (`MG...`) → variable `TWILIO_MESSAGING_SERVICE_SID`

### Configurar webhook de mensajes entrantes

**Twilio Console → Messaging → Senders → WhatsApp Senders → [número] → "When a message comes in"**

```
URL:    https://[cliente].vercel.app/api/webhook/twilio-incoming
Method: HTTP POST
```

El webhook de Vercel decide internamente:
- Si el remitente está en `authorized_numbers` → reenvía a n8n (workflow W1)
- Si es cliente/desconocido → auto-responder redirige al número humano

### Configurar Opt-Out (palabras clave en español)

**Twilio Console → Messaging → Settings → Opt-Out Management**

| Sección | Keywords |
|---------|----------|
| Opt-out | `STOP, BAJA, CANCELAR, SALIR, FUERA, BASTA` |
| Opt-in  | `START, ALTA, ACEPTO, QUIERO` |
| Help    | `HELP, AYUDA, INFO` |

**Alternativa vía API** (solo modelo clásico — requiere `MGxx`; en modelo Senders API usar la
tabla de arriba a mano en Console, no hay Messaging Service donde postear esto):

```powershell
$creds = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('ACxx:AUTH_TOKEN'))
$headers = @{ Authorization = "Basic $creds"; "Content-Type" = "application/x-www-form-urlencoded" }
$body = "OptOutKeywords=STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT,BAJA,CANCELAR,SALIR" +
        "&OptInKeywords=START,YES,UNSTOP,ALTA,ACEPTO" +
        "&HelpKeywords=HELP,INFO,AYUDA"
Invoke-WebRequest -Uri "https://messaging.twilio.com/v1/Services/MGxx" -Method POST -Headers $headers -Body $body -UseBasicParsing
```

Reemplazar `ACxx:AUTH_TOKEN` y `MGxx` con credenciales del cliente.

### Plantillas WhatsApp

El sistema usa 13 plantillas Content API (`twilio/text` + `twilio/media`). Para el texto completo, variables, samples y lógica de selección → **[`docs/PLANTILLAS.md`](./PLANTILLAS.md)**.

**Creación bulk:**
```bash
node scripts/twilio-create-text-templates.mjs   # Crea plantillas 1-11 de golpe
node scripts/twilio-create-media-templates.mjs  # Crea plantillas 12-13 (imagen/video)
```

Tiempo de aprobación de Meta: **24-72h** por lote.

**Obligación legal (plantillas MARKETING):** todas deben incluir:
```
Responde SALIR para no recibir más mensajes.
```

### Configurar meseros autorizados (domicilios)

```sql
INSERT INTO authorized_numbers (phone, name, is_active) VALUES
  ('573001234567', 'Nombre Mesero 1', true),
  ('573009876543', 'Nombre Mesero 2', true);
```

---

## 5. Plataforma: n8n (self-hosted)

**Instancia compartida:** `https://n8n.almojabananet.me`
**VPS:** servidor compartido almojabananet — costo ~$5-10/mes total para todos los clientes.

> **Desde v2.3.0 (multitenant) n8n deja de necesitar variables por-cliente.** Con un solo
> Vercel project, todos los tenants comparten la misma URL base y los mismos secrets — n8n
> distingue de qué cliente es cada request por el campo `tenant_slug` (W1) o por procesar TODOS
> los tenants activos internamente (crons, ver más abajo). Onboardear un cliente nuevo ya NO
> requiere tocar n8n (salvo la excepción de W1 descrita abajo, que ya está resuelta una vez).

### Variables de entorno en n8n (Settings → Variables)

**Un único set, compartido por todos los clientes** (ya NO llevan prefijo `[CLIENTE]_`):

| Variable n8n | Valor | Equivale en Vercel |
|---|---|---|
| `APP_URL` | El dominio del proyecto compartido, ej. `https://clubsushiservice.constelarys.com` (cualquier dominio del mismo proyecto Vercel sirve — todos apuntan al mismo deploy) | — |
| `WEBHOOK_SECRET` | Secret único, el mismo para todos los clientes | = `WEBHOOK_DELIVERY_SECRET` de Vercel |
| `CRON_SECRET` | Secret único, el mismo para todos los clientes | = `CRON_SECRET` de Vercel |

⚠️ Las variables viejas `[CLIENTE]_APP_URL` / `[CLIENTE]_WEBHOOK_SECRET` (una por cliente) ya
no se usan — si existen en n8n de una migración anterior, se pueden dejar sin borrar (no
estorban) o limpiarlas cuando haya tiempo.

---

### W1 · delivery-webhook (activo)

**Propósito:** Registrar pedidos de domicilio que llegan por WhatsApp del mesero.

**Flujo:**
```
Mesero WhatsApp → Twilio → /api/webhook/twilio-incoming (Vercel)
  → detecta número autorizado → reenvía a n8n W1
  → OpenAI GPT-4o-mini (parsea texto libre)
  → Google Contacts crear/actualizar
  → POST /api/webhook/delivery (Vercel)
  → mismo flujo que check-in (registro + puntos + WhatsApp al cliente)
  → TwiML response (confirma al mesero)
```

> ✅ **Resuelto (2026-07-07):** `n8n/domicilios_whatsapp_v4.json` ya propaga `tenant_slug` de
> punta a punta — el nodo "Extraer Remitente y Body" lo lee de forma defensiva
> (`raw.tenant_slug || raw.body?.tenant_slug`, cubre ambos formatos con los que n8n puede
> parsear el body form-urlencoded que reenvía `twilio-incoming/route.ts`), el nodo "Parsear
> Respuesta IA" lo agrega al objeto final, y "Registrar en RestaurantQR API" lo envía tal cual
> vía `JSON.stringify($json)`. **Requiere re-importar el JSON en n8n** para que el workflow
> activo tenga estos nodos actualizados — un workflow importado antes de esta fecha seguirá
> devolviendo 404 "Tenant no encontrado" hasta que se re-importe.

**Configuración del nodo HTTP Request (POST al delivery):**
- URL: `{{$env.APP_URL}}/api/webhook/delivery`
- Headers: `x-webhook-secret: {{$env.WEBHOOK_SECRET}}`
- Body (JSON real que arma "Parsear Respuesta IA" — ver `n8n/domicilios_whatsapp_v4.json`):

```json
{
  "nombre_cliente": "{{$json.nombre_cliente}}",
  "celular": "{{$json.celular}}",
  "direccion": "{{$json.direccion}}",
  "metodo_pago": "{{$json.metodo_pago}}",
  "monto_total": "{{$json.monto_total}}",
  "ciudad": "{{$json.ciudad}}",
  "raw_message": "{{$json.raw_message}}",
  "tenant_slug": "{{$json.tenant_slug}}"
}
```

**Activar (una sola vez — ya no se duplica por cliente):**
1. Importar JSON del workflow desde `docs/n8n-workflows/` (si existe)
2. Activar el workflow (toggle arriba a la derecha)
3. Copiar la **Webhook URL** que genera n8n
4. Pegar esa URL en la variable `N8N_DOMICILIOS_WEBHOOK_URL` del proyecto Vercel (una sola vez,
   sirve para todos los tenants — el `To` de cada mensaje ya identifica el número/tenant antes
   de llegar acá)

**Test rápido sin WhatsApp:**
```bash
curl -X POST https://n8n.almojabananet.me/webhook-test/[path-del-webhook] \
  -H "Content-Type: application/json" \
  -d '{"Body": "Pedido de Test User\nDirección: Calle 123\nPago: Efectivo", "From": "whatsapp:+573001234567"}'
```

---

### W2 · calendar-dispatch (activo — v2.1.0)

**Propósito:** Disparar el auto-envío de eventos del calendario cada 15 minutos.
No está en `vercel.json` porque `*/15` + ser el 3er cron requeriría plan Vercel Pro.

**Nodo 1 — Schedule Trigger:**
- Trigger Interval: `Minutes` → cada `15`

**Nodo 2 — HTTP Request:**
- Method: `POST`
- URL: `{{$env.[CLIENTE]_APP_URL}}/api/cron/calendar-dispatch`
- Authentication: Header Auth (credencial separada)
  - Header Name: `Authorization`
  - Header Value: `Bearer {{$env.CRON_SECRET}}`
- Timeout: 60 000 ms

**Credencial Header Auth en n8n** (crear una vez):
- Settings → Credentials → New → *Header Auth*
- Name: `RestaurantQR CRON_SECRET`
- Name (header): `Authorization`
- Value: `Bearer <valor de CRON_SECRET de Vercel>`

**JSON del workflow para importar:**
```json
{
  "name": "RestaurantQR — Calendar Dispatch",
  "nodes": [
    {
      "parameters": {
        "rule": { "interval": [{ "field": "minutes", "minutesInterval": 15 }] }
      },
      "name": "Cada 15 min",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [260, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.[CLIENTE]_APP_URL }}/api/cron/calendar-dispatch",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "options": { "timeout": 60000 }
      },
      "name": "Disparar calendar-dispatch",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [520, 300],
      "credentials": {
        "httpHeaderAuth": { "name": "RestaurantQR CRON_SECRET" }
      }
    }
  ],
  "connections": {
    "Cada 15 min": {
      "main": [[{ "node": "Disparar calendar-dispatch", "type": "main", "index": 0 }]]
    }
  },
  "settings": { "executionOrder": "v1" }
}
```

**Verificar que funciona:** tras activar, hacer clic en "Execute Workflow". Respuesta esperada: `{"ok":true,"processed":N,...}`. Si llega `{"error":"No autorizado"}` → el `CRON_SECRET` no coincide entre n8n y Vercel.

---

### W3 · google-contacts-sync (pendiente de crear)

**Propósito:** Sincronizar cada cliente nuevo/actualizado con Google Contacts del restaurante.
Fire-and-forget — si falla, el check-in/delivery NO se rompe (timeout 10s, log warning).

**Payload que envía el sistema:**
```json
{
  "celular": "+573001234567",
  "nombre_cliente": "Juan Pérez",
  "cumpleanos": "1990-05-15",
  "ciudad": "Bogotá",
  "total_visitas": 5,
  "source": "qr",
  "action": "created"
}
```

**Estructura del workflow:**
1. **Webhook Trigger** — POST, path `google-contacts-sync-[cliente]`, Response: Immediately
2. **IF** — `{{$json.action}}` equals `created`
   - `true` → **Google Contacts: Create Contact**
   - `false` → **Google Contacts: Update Contact** (buscar por teléfono)
3. **Google Contacts** — OAuth2 con cuenta del restaurante
   - Name: `{{$json.nombre_cliente}}`
   - Phone: `{{$json.celular}}`
   - Birthday: `{{$json.cumpleanos}}`
   - Notes: `Visitas: {{$json.total_visitas}} | Ciudad: {{$json.ciudad}} | Fuente: {{$json.source}}`
   - Group: "Clientes [Restaurante]"

**Una vez activado**, copiar la URL del webhook → pegar en `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` de Vercel.

---

### Crons de birthday/reactivation vía n8n

> **Mecanismo oficial desde 2026-07-05** (antes corría en paralelo con Vercel nativo,
> causando doble disparo — ver nota en §2). `vercel.json` tiene `"crons": []`: n8n es
> ahora el ÚNICO disparador de estos dos. Confirmar en cada workflow ("Cron Birthday",
> "Cron Reactivación") la zona horaria real del Schedule Trigger — puede no ser UTC.
>
> **v2.4.0 — onboarding sin tocar n8n:** `/api/cron/birthday` y `/api/cron/reactivation`
> ahora aceptan `?tenant=slug` **opcional**. Si se omite, procesan TODOS los tenants activos
> en un solo disparo (mismo patrón que `calendar-dispatch`, que ya funcionaba así). Se
> recomienda **quitar** `?tenant=sushi-service` de los 2 nodos HTTP Request existentes para
> que un cliente nuevo (ej. Don Alirio) reciba estos mensajes automáticamente en cuanto se
> inserta en `tenants` con `is_active=true` — sin volver a tocar n8n. Si se deja el
> `?tenant=`, sigue funcionando igual que antes (100% retrocompatible), pero solo cubre ese
> tenant.

**Birthday** — 8:00 AM Colombia = 13:00 UTC (si el Schedule Trigger usa UTC):
- Schedule Trigger: todos los días a las 13:00 UTC
- HTTP Request: `POST {{$env.APP_URL}}/api/cron/birthday` (sin `?tenant=` → todos los clientes)
- Header: `Authorization: Bearer {{$env.CRON_SECRET}}`

**Reactivación** — 10:00 AM Colombia = 15:00 UTC:
- Schedule Trigger: todos los días a las 15:00 UTC
- HTTP Request: `POST {{$env.APP_URL}}/api/cron/reactivation` (sin `?tenant=` → todos los clientes)
- Header: `Authorization: Bearer {{$env.CRON_SECRET}}`

> Si se migran, eliminar esas entradas de `vercel.json` para evitar doble disparo.

---

## 6. Onboarding de nuevo cliente (modelo multitenant, ~30-45 min)

> **Ya NO se clona el repo ni se crean proyectos nuevos.** Un cliente nuevo es una fila en la
> tabla `tenants` del Supabase compartido + un dominio agregado al Vercel project compartido
> (`sushi-service-fidelity-system`). Nada de esto toca env vars de Vercel.

### Paso 1 — Insertar el tenant en Supabase

SQL Editor del proyecto compartido:
```sql
INSERT INTO tenants (slug, name, business_type, config, is_active)
VALUES (
  'don-alirio',                          -- slug: usado por n8n y por los crons (?tenant=)
  'Don Alirio Café de Origen',
  'restaurant',
  '{
    "brand_name": "Don Alirio Café de Origen",
    "brand_short": "Don Alirio",
    "staff_role_label": "Barista",
    "visit_label": "visita",
    "station_label": "mesa",
    "has_delivery_webhook": true,
    "whatsapp_link": "https://wa.me/57...",
    "google_maps_url": "https://..."
  }'::jsonb,
  true
);
```
`config` es la marca — se resuelve por dominio, ver `src/lib/branding.ts`. Si se omite un campo,
cae al default del sistema (env vars), pero para un cliente real siempre se llena.

### Paso 2 — Twilio de la subcuenta del cliente

1. Confirmar que el cliente ya tiene su número de WhatsApp aprobado y registrado como Sender en
   su cuenta/subcuenta Twilio (dato que ya trae Don Alirio).
2. Correr el script de setup (crea Messaging Service, vincula el número, configura el webhook
   **y ahora también intenta configurar opt-out/opt-in/help automáticamente** — ver §4):
   ```bash
   TWILIO_ACCOUNT_SID=ACxxx \
   TWILIO_AUTH_TOKEN=xxx \
   TWILIO_WHATSAPP_NUMBER=+57... \
   VERCEL_APP_URL=https://clubsushiservice.constelarys.com \
   RESTAURANT_WA_NUMBER=573001234567 \
   node scripts/twilio-setup.mjs
   ```
   `VERCEL_APP_URL` es **cualquier dominio del proyecto compartido** (no hace falta que sea el
   dominio final del cliente — el webhook de Twilio resuelve el tenant por `To`, no por Host).
3. Guardar el `serviceSid` que imprime el script — es el `twilio_messaging_service_sid`.
4. Guardar el `Account SID` y `Auth Token` de la subcuenta del cliente (si Don Alirio usa una
   subcuenta bajo el master de Cada1, es el SID/token de ESA subcuenta, no el master).

### Paso 3 — Cargar las credenciales Twilio en el tenant

```sql
UPDATE tenants SET
  twilio_subaccount_sid = 'ACxxx',
  twilio_subaccount_auth_token = 'xxx',
  twilio_messaging_service_sid = 'MGxxx',
  twilio_whatsapp_number = 'whatsapp:+57...'
WHERE slug = 'don-alirio';
```
Desde este momento, `getTwilioClient()` (`src/services/whatsapp.service.ts`) usa estas
credenciales para todos los envíos de este tenant — no las del master.

### Paso 4 — Dominio en Vercel

1. vercel.com → proyecto **`sushi-service-fidelity-system`** → Settings → Domains → Add →
   `clubdonalirio.constelarys.com` (o el subdominio elegido)
2. Vercel muestra el registro DNS (normalmente `CNAME` → `cname.vercel-dns.com`) — crearlo donde
   esté administrado el DNS de `constelarys.com`
3. Cuando el DNS propague:
   ```sql
   UPDATE tenants SET domain = 'clubdonalirio.constelarys.com' WHERE slug = 'don-alirio';
   ```
   Desde acá, `getTenantByDomain()` resuelve la marca y los datos de este tenant en cada
   request a ese dominio.

### Paso 5 — Usuario admin

1. Supabase → Authentication → Users → Invite user (email del admin del cliente)
2. Tagear el `tenant_id` en su JWT (sin esto, el dashboard no ve datos del tenant):
   ```sql
   UPDATE auth.users
   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('tenant_id', (SELECT id FROM tenants WHERE slug = 'don-alirio')::text)
   WHERE email = 'admin@donalirio.com';
   ```
3. El admin debe hacer login (no solo refrescar) para que el JWT traiga el `tenant_id` nuevo.

### Paso 6 — n8n (normalmente NADA que hacer)

- W1 (delivery), birthday, reactivation y calendar-dispatch ya están configurados para procesar
  cualquier tenant activo automáticamente (ver §5). Un tenant nuevo con `is_active=true` entra
  solo.
- Única excepción: si el nodo HTTP de W1 todavía no tiene el campo `tenant_slug` agregado (ver
  §5, W1) — se hace una sola vez, no por cliente.

### Paso 7 — Plantillas WhatsApp

1. Si el cliente ya tiene plantillas aprobadas en su propia cuenta Twilio, solo falta asignar
   los SIDs en Dashboard → Ajustes.
2. Si no, crear con los scripts (apuntando a la subcuenta del cliente vía sus credenciales):
   ```bash
   node scripts/twilio-create-text-templates.mjs
   node scripts/twilio-create-media-templates.mjs
   ```
3. Esperar aprobación de Meta (24-72h)
4. Agregar números de meseros autorizados: `INSERT INTO authorized_numbers (phone, name, tenant_id, is_active) VALUES (...)`

### Paso 8 — Dashboard

1. Ingresar en `https://clubdonalirio.constelarys.com/login`
2. Dashboard → Recompensas → Crear reward tiers (puntos + mystery box prizes)
3. Dashboard → Ajustes → Asignar los SIDs de plantillas aprobadas
4. Dashboard → Ajustes → Configurar ticket promedio
5. Dashboard → QR → Generar QRs (usan la marca del tenant automáticamente)

### Paso 9 — Pruebas E2E

1. Escanear QR → recibir WhatsApp de bienvenida con puntos, con el nombre de marca correcto
2. Repetir hasta acumular puntos suficientes → verificar que aparece Mystery Box
3. Escribir "hola" al número Twilio del cliente → verificar redirect con el `whatsapp_link` del
   tenant (no el de Sushi Service)
4. Escribir "STOP" → verificar que no llegan más mensajes
5. Número de mesero autorizado escribe pedido → verificar que llega a n8n → a la API (con el
   `tenant_slug` correcto) → WhatsApp al cliente
6. Crear evento en calendario con `send_mode='auto'` → verificar que en máx 15 min llega el WhatsApp

---

## 7. Checklist pre-launch (multitenant)

### Supabase (tabla `tenants` — proyecto compartido, NO uno nuevo)
- [ ] Fila insertada en `tenants` (`slug`, `name`, `config` con la marca completa, `is_active=true`)
- [ ] `twilio_subaccount_sid` / `twilio_subaccount_auth_token` / `twilio_messaging_service_sid` / `twilio_whatsapp_number` cargados
- [ ] `domain` cargado (después de confirmar el DNS)
- [ ] Usuario admin invitado + `raw_app_meta_data.tenant_id` tageado + admin ya hizo login

### Vercel (proyecto compartido `sushi-service-fidelity-system` — NO uno nuevo)
- [ ] Dominio del cliente agregado en Settings → Domains
- [ ] Registro DNS creado y propagado (verificar con `nslookup`/panel de Vercel)
- [ ] Cero env vars nuevas necesarias (todas son compartidas, ver §2)

### Twilio (subcuenta del cliente)
- [ ] Número WhatsApp asignado al Messaging Service (`scripts/twilio-setup.mjs`)
- [ ] Webhook configurado apuntando al dominio compartido `/api/webhook/twilio-incoming` (POST)
- [ ] Opt-out/opt-in/help keywords configurados (automático por el script — revisar el log; si falló, hacerlo manual en Console, ver §4)
- [ ] Plantillas creadas o SIDs existentes asignados en Dashboard → Ajustes
- [ ] Números de meseros insertados en `authorized_numbers` con el `tenant_id` correcto

### n8n (normalmente cero cambios)
- [ ] Confirmar que el nodo HTTP de W1 (delivery) ya envía `tenant_slug` en el body — si no, agregarlo una sola vez (ver §5)
- [ ] Confirmar que birthday/reactivation NO tienen `?tenant=` fijo (para que este cliente entre solo) — si lo tienen, quitarlo una sola vez (ver §5)

### Dashboard
- [ ] Reward tiers configurados (puntos + mystery box prizes)
- [ ] Ticket promedio configurado en Ajustes
- [ ] QRs generados (usan la marca del tenant automáticamente)
- [ ] Google Reviews URL / WhatsApp link ya vienen del `config` del tenant — confirmar que se ven bien en el check-in

### Pruebas
- [ ] QR → bienvenida WhatsApp recibida con puntos, con el nombre de marca correcto ✓
- [ ] Auto-reply funcionando con redirect al `whatsapp_link` de ESTE tenant (no el de Sushi Service) ✓
- [ ] STOP → opt-out confirmado ✓
- [ ] Domicilio vía mesero → registrado + WhatsApp al cliente (confirmar que NO da 404 "Tenant no encontrado") ✓
- [ ] Sushi Service y Sushi Fun se siguen viendo idénticos (regression check — un tenant nuevo no debe afectar a los existentes) ✓

---

## 8. Costos por cliente

### Servicios fijos mensuales

| Servicio | Plan | USD/mes | Notas |
|----------|------|:-------:|-------|
| Vercel | Hobby (gratis) | $0 | Hasta 100 GB bandwidth. Suficiente para 1 restaurante. |
| Supabase | Free tier | $0 | 500 MB DB, 2 GB storage, 50K auth users. |
| VPS n8n | Compartido entre clientes | ~$3-5 | Un VPS de $15-20/mes para 3-5 clientes. |
| Dominio | Opcional | $0-1 | Vercel subdomain gratis o dominio custom. |

### Twilio (variable, por uso)

| Tipo mensaje | USD/mensaje | Escenario típico (200 clientes × 3 msgs/mes) |
|---|---|---|
| MARKETING | ~$0.0058 | ~$3.50/mes |
| UTILITY | ~$0.003 | ~$1.80/mes |
| MMS (media) | ~$0.0079 extra | Solo si se usan plantillas de calendario con media |

### Totales por escenario

| Escenario | USD/mes | COP/mes (aprox.) |
|-----------|:-------:|:----------------:|
| Mínimo (free tiers + bajo WhatsApp) | $3-8 | $12.000 - $32.000 |
| Típico (100+ clientes activos) | $8-20 | $32.000 - $80.000 |
| Alto (500+ clientes, mucho WhatsApp) | $25-50 | $100.000 - $200.000 |

### Costo de implementación (one-time)

| Concepto | Tiempo | Cobro sugerido COP |
|----------|:------:|:------------------:|
| Onboarding multitenant (tenant + Twilio + dominio, §6) | 30-45 min | $150.000 - $300.000 |
| Crear y aprobar plantillas WhatsApp | 1 h + espera | Incluido |
| Branding + QRs | 30 min | Incluido |
| Configurar recompensas | 30 min | Incluido |
| Capacitación admin | 1 h | Incluido |
| **TOTAL** | **~2.5-3 h** | **$200.000 - $500.000** |

> Bajó de 4-6h a ~2.5-3h desde que el onboarding dejó de requerir clonar repo + crear proyectos
> Supabase/Vercel nuevos (v2.3.0/v2.4.0, ver §6). El margen por cliente sube porque el costo de
> implementación (tiempo del operador) bajó sin cambiar el precio al cliente.

### Pricing sugerido al cliente final

| Plan | COP/mes | Incluye |
|------|:-------:|---------|
| Básico | $89.000 | Hasta 200 clientes, 500 WhatsApp/mes |
| Pro | $149.000 | Ilimitado, campañas manuales, soporte prioritario |
| Enterprise | $249.000 | Multi-sede, analytics avanzados |

**Margen neto con free tiers:** $77.000 - $237.000 COP/mes por cliente.

---

## 9. Riesgos técnicos activos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|:-----------:|:-------:|------------|
| Quality rating Twilio degradado (opt-outs > 0.5%) | Media | Alto | Cap mensual 3 msg/cliente, copy no agresivo, botón SALIR en todas las MARKETING |
| n8n VPS caído = domicilios no se registran + calendar no dispara | Media | Alto | Monitoreo del VPS, health check alertas, botón "Enviar ahora" en dashboard como fallback |
| Supabase Free tier límite (500 MB) | Baja | Medio | Migrar a Pro ($25/mes) cuando se acerque al límite |
| Plantillas `twilio/media` sin aprobar por Meta | Alta | Medio | El calendario funciona; solo el envío con imagen/video queda bloqueado |
| CRON_SECRET no configurado en Vercel | Baja | Alto | `validateCronSecret()` rechaza todo con 401 — verificar en pre-launch |
| RLS mal configurada en una tabla nueva expondría datos entre tenants | Baja | Crítico | Toda tabla nueva debe llevar `tenant_id` + policy `tenant_all_*` desde el día 1 (ver `docs/03-security.md` y migración `00026_multitenant_rls.sql` como plantilla) |
