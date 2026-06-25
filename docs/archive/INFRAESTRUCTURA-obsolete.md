# Infraestructura Actual — Constelarys Fidelity System

> **Última actualización:** 2026-05-24 v0.34.1
> **Para:** Consultoría de automatización / ingeniería de infraestructura

---

## Diagrama de arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FUENTES DE ENTRADA                                  │
│                                                                             │
│  [QR físico en mesa]    [WhatsApp domicilio]    [WhatsApp STOP/respuesta]  │
│         │                      │                         │                  │
│         ▼                      ▼                         ▼                  │
│  GET /check-in      Twilio Messaging Service      Twilio Incoming Webhook  │
│  (escaneo QR)       (recibe del mesero)           (respuestas de clientes)  │
└──────────┬─────────────────────┬────────────────────────┬──────────────────┘
           │                     │                        │
           ▼                     ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    VERCEL (Next.js App Router — serverless)                  │
│                      Proyecto: josemorenoso/Restaurant_Fidelity_System       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  API Routes (/src/app/api/)                                          │   │
│  │                                                                      │   │
│  │  /api/check-in            → Registro QR + WhatsApp bienvenida        │   │
│  │  /api/webhook/delivery    → Registro domicilio + WhatsApp cliente     │   │
│  │  /api/webhook/twilio-incoming → Auto-responder inteligente           │   │
│  │  /api/cron/birthday       → Felicitaciones cumpleaños (8AM UTC)      │   │
│  │  /api/cron/reactivation   → Re-engagement inactivos >21d (10AM UTC)  │   │
│  │  /api/dashboard/*         → Dashboard admin (auth requerida)         │   │
│  │    ├── /campaigns/manual  → Envío masivo segmentado                  │   │
│  │    ├── /campaigns/estimate → Estimador de audiencia                  │   │
│  │    ├── /calendar/events   → CRUD calendario operativo                │   │
│  │    ├── /calendar/media-upload → Upload a Supabase Storage           │   │
│  │    ├── /templates         → Gestión plantillas Twilio                │   │
│  │    └── /settings          → Configuración admin (template SIDs, etc) │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Dashboard UI (/src/app/(dashboard)/dashboard/)                      │   │
│  │  Clientes · Recompensas · Campañas · Calendario · Plantillas        │   │
│  │  Ajustes · QR · Meseros                                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Cron Jobs (vercel.json):                                                    │
│  • birthday    → cron: "0 8 * * *"  (diario 8AM UTC)                       │
│  • reactivation → cron: "0 10 * * *" (diario 10AM UTC)                      │
└───────────────┬──────────────────────┬──────────────────────────────────────┘
                │                      │
         ┌──────┘                      └──────┐
         ▼                                    ▼
┌─────────────────────┐           ┌──────────────────────┐
│   SUPABASE          │           │   TWILIO             │
│   (PostgreSQL)      │           │   (WhatsApp API)     │
│                     │           │                      │
│  Tablas:            │           │  Messaging Service   │
│  • customers        │           │  Content Templates   │
│  • visits           │           │  (8 plantillas       │
│  • rewards          │           │   aprobadas por Meta)│
│  • campaigns        │           │                      │
│  • campaign_messages│           │  Número:             │
│  • authorized_numbers│          │  +1 (shared)         │
│  • admin_settings   │           │  → Twilio Sandbox /  │
│  • restaurant_events│           │    número propio     │
│                     │           │                      │
│  Storage Buckets:   │           │  Costo:              │
│  • event-media      │           │  ~$0.005/msg WhatsApp│
│    (público)        │           │  + $0.0079 MMS        │
│                     │           └──────────────────────┘
│  Auth:              │
│  • Supabase Auth    │
│  • RLS en todas     │
│    las tablas       │
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│   n8n VPS (https://n8n.almojabananet.me)                        │
│   Workflows activos:                                            │
│                                                                 │
│   1. domicilios_whatsapp_v4                                     │
│      Twilio → validar mesero (authorized_numbers en Supabase)   │
│      → OpenAI GPT-4o-mini (parseo texto libre del mesero)       │
│      → Google Contacts crear/actualizar                          │
│      → POST /api/webhook/delivery (nuestra API)                 │
│      → TwiML response (confirma al mesero)                      │
│                                                                 │
│   2. google_contacts_sync                                       │
│      Trigger interno → Google Contacts API                      │
│      (sync bidireccional con registros QR)                      │
│                                                                 │
│   VPS: servidor compartido (almojabananet)                      │
│   Costo: ~$5-10/mes estimado                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stack completo

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Frontend / Backend | Next.js 16.2.2 (App Router) | TypeScript, TailwindCSS v4, shadcn/ui |
| Deploy | Vercel | Auto-deploy desde GitHub main |
| Base de datos | Supabase (PostgreSQL) | Auth + RLS + Storage |
| Mensajería | Twilio (WhatsApp) | Shared number, Content API v1 |
| Automatizaciones | n8n (VPS autoalojado) | Delivery webhook + Google Contacts |
| IA (parseo domicilios) | OpenAI GPT-4o-mini | Vía n8n, texto libre del mesero |
| Media storage | Supabase Storage bucket `event-media` | Público, JPG/PNG/MP4 |

---

## Flujos de datos críticos

### 1. Check-in QR
```
Cliente escanea QR → /check-in?mesa=N → lookup por teléfono
  → si nuevo: registro → WhatsApp bienvenida (template)
  → si existente: incrementa visitas → revisa recompensa
  → si gana premio: WhatsApp recompensa (template)
  → siempre: WhatsApp visita recurrente near/far (template)
  → Google Contacts sync (vía n8n, fire-and-forget)
```

### 2. Delivery domicilio
```
Mesero WhatsApp texto libre → Twilio → n8n
  → validar número mesero (Supabase authorized_numbers)
  → OpenAI extrae: nombre, teléfono, ciudad, dirección, monto
  → Google Contacts crear/actualizar
  → POST /api/webhook/delivery
  → mismo flujo que check-in (registro + recompensa + WhatsApp al cliente)
```

### 3. Cron birthday (8AM UTC diario)
```
Vercel Cron → GET /api/cron/birthday → CRON_SECRET validado
  → busca customers donde birthday = hoy (filtro JS por mes/día)
  → excluye si recibió cumpleaños en últimos 365 días
  → envía WhatsApp (birthday_template_sid) → registra en campaign_messages
```

### 4. Cron reactivación (10AM UTC diario)
```
Vercel Cron → GET /api/cron/reactivation → CRON_SECRET validado
  → busca inactivos: last_visit_at < 21 días
  → excluye: sin marketing consent, frecuency cap 7d, ya reactivado en 30d
  → near/far según visitas restantes al próximo premio
  → envía WhatsApp → registra en campaign_messages → actualiza last_campaign_at
```

### 5. Campaña manual (admin)
```
Admin → Dashboard → selecciona filtros (ciudad, visitas, etc.) + plantilla aprobada
  → /api/dashboard/campaigns/estimate → preview de audiencia
  → confirm → /api/dashboard/campaigns/manual
  → filtra: accepts_marketing + frequency_cap_7d + recovery_zone_skip
  → envío batch a Twilio → registra mensajes → actualiza last_campaign_at
```

---

## Modelo de clone-per-client

El sistema está diseñado para ser clonado por restaurante:

```
Tu cuenta Vercel:
  ├── Restaurant_A (proyecto Vercel) → Supabase_A (proyecto)
  ├── Restaurant_B (proyecto Vercel) → Supabase_B (proyecto)
  └── Restaurant_C (proyecto Vercel) → Supabase_C (proyecto)

Tu VPS n8n: un solo servidor sirve a TODOS los clientes
  ├── Workflow domicilios → detecta por número de mesero qué cliente es
  └── Webhook delivery → URL distinta por cliente en .env
```

**Costo por cliente activo (estimado):**
| Ítem | Costo |
|------|-------|
| Vercel Pro | $20/mes (cubre múltiples proyectos) |
| Supabase Free | $0 (hasta 500MB/50K filas) |
| Twilio WhatsApp | ~$0.005-0.008/mensaje |
| VPS n8n (compartido) | ~$2-3/mes por cliente |
| OpenAI GPT-4o-mini | ~$0.0001/domicilio |

---

## Variables de entorno críticas (por instancia)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=

# Seguridad interna
CRON_SECRET=
WEBHOOK_DELIVERY_SECRET=

# n8n
N8N_BASE_URL=https://n8n.almojabananet.me
N8N_GOOGLE_CONTACTS_WEBHOOK_URL=

# Branding por cliente
NEXT_PUBLIC_BRAND_NAME=
NEXT_PUBLIC_BRAND_SHORT=
NEXT_PUBLIC_DEMO_EMAIL=
NEXT_PUBLIC_DEMO_PASSWORD=
NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL=
```

---

## Puntos de automatización priorizados (para consulta de ingeniería)

En orden de impacto / facilidad de implementación:

### Alta prioridad
1. **Cron `calendar-dispatch`** — Dispatcher de eventos del calendario con `send_mode='auto'`. Busca `restaurant_events WHERE scheduled_send_at <= now() AND status='scheduled'`. Requiere: plantillas `twilio/media` aprobadas por Meta (pendiente).

2. **Monthly marketing cap en endpoints de campañas manuales** — Conectar `filterByMonthlyCap(3)` ya implementado en `campaign.service.ts` al endpoint `/api/dashboard/campaigns/manual` y al estimador.

3. **Aplicar blackout pre-evento en campañas manuales** — Conectar `getActiveBlackouts()` ya implementado al validar campañas que se lanzarían durante un blackout.

### Media prioridad
4. **Auto-provisioning por cliente** — Script que clona repo, crea proyecto Vercel + Supabase, setea variables, ejecuta migraciones. Hoy es manual (30-60 min por cliente).

5. **Monitoreo centralizado** — Un solo dashboard que muestre el estado de todos los proyectos (cuántos mensajes enviados, errores Twilio, balance). Actualmente cada proyecto es aislado.

6. **Webhook STOP de WhatsApp** — Cuando cliente responde STOP, marcar `accepts_marketing=false` automáticamente. Hoy el admin lo hace manualmente.

### Baja prioridad (roadmap)
7. **Plantillas con media (imagen/video)** — `twilio/media` templates para invitaciones de eventos con flyer. Bloqueado por aprobación Meta.
8. **POS integration** — Sistema de puntos basado en monto de compra real (requiere integración con caja).
9. **Multi-restaurante dashboard** — Vista unificada para el operador de Constelarys (no para el restaurante individual).

---

## Riesgos técnicos activos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|:-----------:|:-------:|------------|
| Quality rating Twilio degradado (opt-outs > 0.5%) | Media | Alto | Monthly cap (3/mes), copy no agresivo |
| n8n VPS caído = domicilios no se registran | Media | Alto | Health check + alertas, VPS dedicado |
| Supabase Free tier límite (50K filas) | Baja | Medio | Migrar a Pro ($25/mes) cuando escale |
| Clone-per-client no escala > 20 clientes | Alta (si crece) | Alto | Arquitectura multi-tenant futura |
| Aprobación Meta de plantillas media (días/semana) | Alta | Medio | Feature pausa hasta aprobación |

---

## Migraciones SQL aplicadas

| # | Archivo | Descripción |
|---|---------|-------------|
| 00001 | `initial_schema.sql` | customers, visits, rewards, RLS |
| 00002 | `authorized_numbers.sql` | Tabla meseros autorizados |
| 00003 | `delivery_fields.sql` | Campos delivery en visits |
| 00004 | `campaigns.sql` | campaigns + campaign_messages |
| 00005 | `add_city.sql` | Campo city en customers |
| 00006 | `source_channels_frequency_cap.sql` | source_channels + last_campaign_at |
| 00007 | `admin_settings.sql` | Tabla key-value de configuración |
| 00008 | `accepts_marketing.sql` | Consentimiento marketing |
| 00009 | `table_number.sql` | Mesa en visitas |
| 00010 | `rewards_optional_milestone.sql` | visit_milestone nullable |
| 00011 | `rewards_black_tier.sql` | Campo is_black en rewards |
| 00012 | `calendar_events_and_media.sql` | restaurant_events + event-media bucket |
