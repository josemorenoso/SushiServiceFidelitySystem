# Despliegue e Infraestructura — Constelarys Fidelity System

> **Última actualización:** 2026-06-17
> **Documento único** que reemplaza: `INFRAESTRUCTURA.md`, `DEPLOYMENT_GUIDE.md`, `CONFIGURACIONES_TWILIO_SISTEMA.md`, `n8n-workflows/README.md`
> Para plantillas WhatsApp (textos, variables, lógica de selección) → [`docs/PLANTILLAS.md`](./PLANTILLAS.md)
> Para MCP Server de Twilio en el IDE → [`docs/TWILIO_MCP_SETUP.md`](./TWILIO_MCP_SETUP.md)

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

### Variables de entorno (por instancia)

| Variable | Alcance | Descripción |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública | Anon key (lectura pública segura) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Servidor** | Service role key — NUNCA exponer al cliente |
| `TWILIO_ACCOUNT_SID` | **Servidor** | Account SID (`AC...`) |
| `TWILIO_AUTH_TOKEN` | **Servidor** | Auth token |
| `TWILIO_WHATSAPP_NUMBER` | **Servidor** | Número WhatsApp con prefijo: `whatsapp:+57...` |
| `TWILIO_MESSAGING_SERVICE_SID` | **Servidor** | SID del Messaging Service (`MG...`) |
| `CRON_SECRET` | **Servidor** | Secret para autenticar crons (32 chars aleatorios) |
| `WEBHOOK_DELIVERY_SECRET` | **Servidor** | Secret compartido con n8n para `/api/webhook/delivery` |
| `N8N_DOMICILIOS_WEBHOOK_URL` | **Servidor** | URL webhook n8n de domicilios (W1) |
| `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` | **Servidor** | URL webhook n8n Google Contacts (W3, opcional) |
| `NEXT_PUBLIC_BRAND_NAME` | Pública | Nombre del restaurante (en auto-reply, QR, mensajes) |
| `NEXT_PUBLIC_BRAND_SHORT` | Pública | Nombre corto |
| `RESTAURANT_WHATSAPP_LINK` | **Servidor** | `https://wa.me/57...` del número humano del restaurante |
| `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | Pública | (Opcional) Link Google Reviews |
| `NEXT_PUBLIC_DEMO_EMAIL` | Pública | (Opcional) Email para login demo |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Pública | (Opcional) Password demo |

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

### Configurar Messaging Service

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

**Alternativa vía API** (para automatizar en onboarding masivo):

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

> n8n es compartido entre todos los clientes. Las variables deben llevar **prefijo por cliente** para evitar conflictos.

### Variables de entorno en n8n (Settings → Variables)

Para cada cliente nuevo, agregar:

| Variable n8n | Valor | Equivale en Vercel |
|---|---|---|
| `[CLIENTE]_APP_URL` | `https://[cliente].vercel.app` | — |
| `[CLIENTE]_WEBHOOK_SECRET` | secreto único del cliente | = `WEBHOOK_DELIVERY_SECRET` del proyecto |
| `CRON_SECRET` | (compartido entre clientes si usan el mismo) | = `CRON_SECRET` de Vercel |

**Ejemplo con Sushi Service:**
```
SUSHI_APP_URL            = https://sushi-service.vercel.app
SUSHI_WEBHOOK_SECRET     = abc123...
```

⚠️ **Nunca usar nombres genéricos** (`APP_URL`, `WEBHOOK_SECRET`) — si hay dos clientes, se pisan.

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

**Configuración del nodo HTTP Request (POST al delivery):**
- URL: `{{$env.[CLIENTE]_APP_URL}}/api/webhook/delivery`
- Headers: `x-webhook-secret: {{$env.[CLIENTE]_WEBHOOK_SECRET}}`
- Body (JSON mínimo que espera la API):

```json
{
  "phone": "{{$json.phone}}",
  "name": "{{$json.name}}",
  "city": "{{$json.city}}",
  "address": "{{$json.address}}"
}
```

**Activar:**
1. Importar JSON del workflow desde `docs/n8n-workflows/` (si existe)
2. Activar el workflow (toggle arriba a la derecha)
3. Copiar la **Webhook URL** que genera n8n
4. Pegar esa URL en la variable `N8N_DOMICILIOS_WEBHOOK_URL` del proyecto Vercel

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

**Birthday** — 8:00 AM Colombia = 13:00 UTC (si el Schedule Trigger usa UTC):
- Schedule Trigger: todos los días a las 13:00 UTC
- HTTP Request: `POST {{$env.[CLIENTE]_APP_URL}}/api/cron/birthday`
- Header: `Authorization: Bearer {{$env.CRON_SECRET}}`

**Reactivación** — 10:00 AM Colombia = 15:00 UTC:
- Schedule Trigger: todos los días a las 15:00 UTC
- HTTP Request: `POST {{$env.[CLIENTE]_APP_URL}}/api/cron/reactivation`
- Header: `Authorization: Bearer {{$env.CRON_SECRET}}`

> Si se migran, eliminar esas entradas de `vercel.json` para evitar doble disparo.

---

## 6. Onboarding de nuevo cliente

### Paso 1 — Clonar repositorio

```bash
git clone https://github.com/tuorg/constelarys-fidelity.git fidelity-[cliente]
cd fidelity-[cliente]
```

### Paso 2 — Personalizar branding

Variables de entorno en Vercel (sin tocar código):
```env
NEXT_PUBLIC_BRAND_NAME=[Nombre del Restaurante]
NEXT_PUBLIC_BRAND_SHORT=[NR]
```

### Paso 3 — Supabase

1. Crear proyecto en https://supabase.com
2. Ejecutar las **23 migraciones** en orden (SQL Editor → cada archivo de `supabase/migrations/`)
3. Ejecutar la tabla manual `auto_reply_cooldown` (ver §3)
4. Crear usuario admin: Authentication → Users → Invite user
5. Copiar URL, anon key y service role key

### Paso 4 — Twilio

1. Crear Messaging Service → vincular número WhatsApp
2. Configurar webhook: `https://[cliente].vercel.app/api/webhook/twilio-incoming`
3. Configurar opt-out keywords en español (ver §4 o usar API PowerShell)
4. Crear plantillas con los scripts:
   ```bash
   node scripts/twilio-create-text-templates.mjs
   node scripts/twilio-create-media-templates.mjs
   ```
5. Esperar aprobación de Meta (24-72h)
6. Agregar números de meseros autorizados en Supabase (`authorized_numbers`)

### Paso 5 — Vercel

1. Import Git Repository → Framework: Next.js
2. Configurar todas las variables de entorno (tabla §2)
3. Deploy → verificar que el build pasa sin errores TypeScript

### Paso 6 — n8n

1. Agregar variables `[CLIENTE]_APP_URL` y `[CLIENTE]_WEBHOOK_SECRET` en Settings → Variables
2. Crear/duplicar workflow W1 (delivery-webhook) para el nuevo cliente
3. Copiar URL del webhook W1 → pegar en `N8N_DOMICILIOS_WEBHOOK_URL` de Vercel
4. Importar workflow W2 (calendar-dispatch) si aplica, actualizar URL
5. Activar ambos workflows

### Paso 7 — Dashboard

1. Ingresar en `https://[cliente].vercel.app/login`
2. Dashboard → Recompensas → Crear reward tiers (puntos + mystery box prizes)
3. Dashboard → Ajustes → Asignar los SIDs de plantillas aprobadas (1-11 + optionalmente 12-13)
4. Dashboard → Ajustes → Configurar ticket promedio
5. Dashboard → QR → Generar QRs con logo y color del cliente

### Paso 8 — Pruebas E2E

1. Escanear QR → recibir WhatsApp de bienvenida con puntos
2. Repetir hasta acumular puntos suficientes → verificar que aparece Mystery Box
3. Escribir "hola" al número Twilio → verificar redirect a número humano con link
4. Escribir "STOP" → verificar que no llegan más mensajes
5. Número de mesero autorizado escribe pedido → verificar que llega a n8n → a la API → WhatsApp al cliente
6. Crear evento en calendario con `send_mode='auto'` → verificar que en máx 15 min llega el WhatsApp (requiere plantillas 12-13 aprobadas)

---

## 7. Checklist pre-launch

### Supabase
- [ ] Proyecto creado (region más cercana)
- [ ] 23 migraciones ejecutadas en orden
- [ ] Tabla `auto_reply_cooldown` creada manualmente
- [ ] Usuario admin creado en Auth → Users → Invite

### Vercel
- [ ] Deploy exitoso sin errores TypeScript
- [ ] Todas las variables de entorno configuradas (tabla §2)
  - [ ] `TWILIO_WHATSAPP_NUMBER` incluye prefijo `whatsapp:`
  - [ ] `WEBHOOK_DELIVERY_SECRET` = mismo valor que `[CLIENTE]_WEBHOOK_SECRET` en n8n
  - [ ] `N8N_DOMICILIOS_WEBHOOK_URL` apunta al webhook W1 activado
  - [ ] `CRON_SECRET` configurado (mismo valor que en credencial Header Auth de n8n)
  - [ ] `NEXT_PUBLIC_BRAND_NAME` con el nombre del restaurante
  - [ ] `RESTAURANT_WHATSAPP_LINK` con el `wa.me/...` del número humano

### Twilio
- [ ] Número WhatsApp asignado al Messaging Service
- [ ] Webhook configurado: `https://[cliente].vercel.app/api/webhook/twilio-incoming` (POST)
- [ ] Opt-out keywords en español configurados (STOP, BAJA, CANCELAR, SALIR…)
- [ ] 11 plantillas de texto creadas (`twilio-create-text-templates.mjs`)
- [ ] 2 plantillas de media creadas (`twilio-create-media-templates.mjs`) — opcional hasta aprobación Meta
- [ ] SIDs de plantillas aprobadas asignados en Dashboard → Ajustes
- [ ] Números de meseros insertados en `authorized_numbers`

### n8n
- [ ] Variables `[CLIENTE]_APP_URL` y `[CLIENTE]_WEBHOOK_SECRET` creadas
- [ ] Workflow W1 (delivery) configurado y activado — URL copiada a Vercel
- [ ] Workflow W2 (calendar-dispatch) importado y activado
- [ ] Credencial `RestaurantQR CRON_SECRET` configurada en n8n

### Dashboard
- [ ] Reward tiers configurados (puntos + mystery box prizes)
- [ ] Ticket promedio configurado en Ajustes
- [ ] QRs generados con logo y color del cliente
- [ ] Google Reviews URL configurada (si aplica)

### Pruebas
- [ ] QR → bienvenida WhatsApp recibida con puntos ✓
- [ ] Auto-reply funcionando con redirect al número humano ✓
- [ ] STOP → opt-out confirmado ✓
- [ ] Domicilio vía mesero → registrado + WhatsApp al cliente ✓

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
| Onboarding + setup Supabase/Vercel/Twilio | 2-3 h | $150.000 - $300.000 |
| Crear y aprobar plantillas WhatsApp | 1 h + espera | Incluido |
| Branding + QRs | 30 min | Incluido |
| Configurar recompensas | 30 min | Incluido |
| Capacitación admin | 1 h | Incluido |
| **TOTAL** | **4-6 h** | **$200.000 - $500.000** |

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
| Clone-per-client no escala > 20 clientes | Alta (si crece) | Alto | Migración a arquitectura multi-tenant (en roadmap) |
| Plantillas `twilio/media` sin aprobar por Meta | Alta | Medio | El calendario funciona; solo el envío con imagen/video queda bloqueado |
| CRON_SECRET no configurado en Vercel | Baja | Alto | `validateCronSecret()` rechaza todo con 401 — verificar en pre-launch |
