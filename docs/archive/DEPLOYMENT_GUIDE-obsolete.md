# Constelarys Fidelity System — Guía de Despliegue (Clone-per-Client)

> Última actualización: v1.6.0 — 2026-06-11

## Arquitectura multi-cliente

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  MENSAJES ENTRANTES (WhatsApp)                                               ║
║                                                                              ║
║  Cliente escribe al número Twilio del restaurante                            ║
║             │                                                                ║
║             ▼                                                                ║
║  Twilio Console → "When a message comes in"                                  ║
║  URL configurada: https://[cliente].vercel.app/api/webhook/twilio-incoming   ║
║             │                                                                ║
║             ├── ¿Es número de mesero autorizado? ──→ reenvía a n8n ──┐      ║
║             │                                                          │      ║
║             └── ¿Es cliente/desconocido?                              │      ║
║                      │                                                │      ║
║                      ▼                                                │      ║
║             Auto-reply inteligente (Vercel)                           │      ║
║             • Detecta intención (pedido/horario/ubicación)            │      ║
║             • Redirige al WhatsApp humano del restaurante             │      ║
║             • Cooldown 4h (tabla auto_reply_cooldown en Supabase)     │      ║
║             • Config: NEXT_PUBLIC_BRAND_NAME + RESTAURANT_WHATSAPP_LINK│      ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                                                        │
╔══════════════════════════════════════════════════════════════════════════════╗
║  VPS n8n — https://n8n.almojabananet.me  (COMPARTIDO entre clientes)        ║
║                                                                              ║
║  Variables en Settings → Variables (prefijadas por cliente):                ║
║                                                                              ║
║  ┌─ Cliente 1 ──────────────────────────────────────────────────────────┐   ║
║  │  SUSHI_APP_URL          = https://sushi-service.vercel.app           │   ║
║  │  SUSHI_WEBHOOK_SECRET   = [mismo valor que Vercel WEBHOOK_DELIVERY_SECRET]│  ║
║  │                                                                      │   ║
║  │  Workflows: domicilios_sushi / google_contacts_sushi                 │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌─ Cliente 2 ──────────────────────────────────────────────────────────┐   ║
║  │  CLIENTE2_APP_URL       = https://cliente2.vercel.app                │   ║
║  │  CLIENTE2_WEBHOOK_SECRET= [secreto del cliente 2]                    │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌─ Cliente 3 ──────────────────────────────────────────────────────────┐   ║
║  │  CLIENTE3_APP_URL       = https://cliente3.vercel.app                │   ║
║  │  CLIENTE3_WEBHOOK_SECRET= [secreto del cliente 3]                    │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ⚠️  NUNCA usar nombres genéricos (APP_URL) — conflicto entre clientes      ║
╚══════════════════════════════════════════════════════════════════════════════╝
                        │
                        ▼ POST a APP_URL/api/webhook/delivery
╔══════════════════════════════════════════════════════════════════════════════╗
║  VERCEL — 1 proyecto por cliente (variables aisladas, no se mezclan)        ║
║                                                                              ║
║  ┌─ Proyecto: Sushi Service ─────────────────────────────────────────────┐  ║
║  │  URL: https://sushi-service.vercel.app                                │  ║
║  │  Variables de entorno (todas privadas al proyecto):                   │  ║
║  │    TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_NUMBER    │  ║
║  │    NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY           │  ║
║  │    SUPABASE_SERVICE_ROLE_KEY                                          │  ║
║  │    WEBHOOK_DELIVERY_SECRET   ← mismo valor que SUSHI_WEBHOOK_SECRET   │  ║
║  │    N8N_DOMICILIOS_WEBHOOK_URL← URL del webhook n8n de domicilios      │  ║
║  │    NEXT_PUBLIC_BRAND_NAME    ← texto del auto-reply y QR              │  ║
║  │    RESTAURANT_WHATSAPP_LINK  ← wa.me/... del número humano            │  ║
║  └───────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  ┌─ Proyecto: Cliente 2 ─────────────────────────────────────────────────┐  ║
║  │  Variables idénticas en nombre, diferentes en valor                   │  ║
║  └───────────────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════════════╝
                        │
                        ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║  SUPABASE — 1 proyecto por cliente                                           ║
║    customers / visits / rewards / campaigns / authorized_numbers             ║
║    auto_reply_cooldown  ← nueva tabla (throttle auto-reply 4h)               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Proceso de Onboarding (nuevo cliente)

### 1. Fork/Clone del repositorio

```bash
# Desde tu repo base "constelarys-fidelity"
git clone https://github.com/tuorg/constelarys-fidelity.git cliente-restaurante-xyz
cd cliente-restaurante-xyz
```

### 2. Personalizar branding

Editar **solo** `src/lib/branding.ts`:
```ts
export const BRAND_NAME = 'Restaurante XYZ'
export const BRAND_SHORT = 'XYZ'
export const BRAND_TAGLINE = 'Programa de Fidelidad'
export const BRAND_DESCRIPTION = 'Registra tus visitas y gana premios en XYZ.'
```

O usar variables de entorno (sin tocar código):
```env
NEXT_PUBLIC_BRAND_NAME=Restaurante XYZ
NEXT_PUBLIC_BRAND_SHORT=XYZ
NEXT_PUBLIC_BRAND_TAGLINE=Programa de Fidelidad
```

### 3. Crear proyecto en Supabase

1. Ir a https://supabase.com → "New Project"
2. Nombre: `fidelity-xyz` | Region: us-east-1
3. Ejecutar migraciones SQL en orden (SQL Editor de Supabase):
   - `supabase/migrations/00001_initial_schema.sql`
   - `supabase/migrations/00002_authorized_numbers.sql`
   - `supabase/migrations/00003_delivery_fields.sql`
   - `supabase/migrations/00004_campaigns.sql`
   - `supabase/migrations/00005_add_city.sql`
   - `supabase/migrations/00006_source_channels_frequency_cap.sql`
   - `supabase/migrations/00007_admin_settings.sql`
   - `supabase/migrations/00008_accepts_marketing.sql`
   - `supabase/migrations/00009_table_number.sql`
   - `supabase/migrations/00010_rewards_optional_milestone.sql`
   - `supabase/migrations/00011_rewards_black_tier.sql`
   - `supabase/migrations/00012_calendar_events_and_media.sql`
   - `supabase/migrations/00013_points_mystery_box.sql`
   - `supabase/migrations/00014_geolocation.sql`
   - `supabase/migrations/00015_service_role_policies.sql`
   - `supabase/migrations/00016_ensure_default_tiers.sql`
   - `supabase/migrations/00017_cleanup_legacy_tiers.sql`
   - `supabase/migrations/00018_staff_qr_scan.sql`
   - `supabase/migrations/00019_legacy_points_backfill.sql`
   - Ejecutar manualmente:
     ```sql
     CREATE TABLE IF NOT EXISTS auto_reply_cooldown (
       phone TEXT PRIMARY KEY,
       last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     ```
4. Crear usuario admin en Auth → Users → "Invite user"
5. Copiar `SUPABASE_URL` y `SUPABASE_ANON_KEY` de Settings → API

### 4. Configurar Twilio

1. Twilio Console → Messaging → WhatsApp Senders
2. Registrar número del cliente (o asignar subaccount)
3. Crear 7 Content Templates para el cliente (categoría indicada):
   - `bienvenida_primera_visita` (UTILITY) → "Hola {{1}}, bienvenid@ a nuestra familia. En tu próxima visita tienes un beneficio esperándote."
   - `visita_recurrente_cerca_premio` (MARKETING) → "Hola {{1}}, gracias por tu visita número {{2}}. ¡En tu próxima visita ganas: {{3}}! ¡Te esperamos! Responde STOP para no recibir mensajes."
   - `visita_recurrente_lejos_premio` (MARKETING) → "Hola {{1}}, gracias por tu visita número {{2}}. Sigue acumulando, pronto podrás ganar: {{3}}. Responde STOP para no recibir mensajes."
   - `ganaste_premio` (UTILITY) → "¡Felicidades {{1}}! 🎉 Llevas {{2}} visitas y te has ganado: {{3}}. ¡Muestra este mensaje en tu próxima visita!"
   - `feliz_cumpleanos` (UTILITY) → "Hola {{1}}, hoy es tu día especial. Ven a celebrar con nosotros, tienes un beneficio esperándote."
   - `reactivacion_sin_regalo` (MARKETING) → "Hola {{1}}, te echamos de menos. ¡Vuelve pronto, te esperamos! Responde STOP para no recibir mensajes."
   - `reactivacion_con_regalo` (MARKETING) → "Hola {{1}}, te echamos de menos. Vuelve y obtén: {{3}}. ¡Te esperamos! Responde STOP para no recibir mensajes."
4. Enviar a aprobación de Meta (24-48h)
5. Copiar `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`

### 5. Deploy en Vercel

```bash
# Si no tienes Vercel CLI
npm i -g vercel

# Deploy
vercel link          # Vincula al proyecto
vercel env pull      # (opcional si ya tiene env)
vercel deploy --prod
```

O desde el dashboard de Vercel:
1. Import Git Repository → seleccionar el repo del cliente
2. Framework: Next.js
3. Configurar Environment Variables (ver sección abajo)

### 6. Variables de entorno en Vercel

> Cada proyecto Vercel es **completamente aislado**. Puedes usar los mismos nombres de variable en todos los clientes sin conflicto.

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (solo server) | `eyJ...` |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio | `ACxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Auth token de Twilio | `abc...` |
| `TWILIO_WHATSAPP_NUMBER` | Número WhatsApp sender | `whatsapp:+573001234567` |
| `CRON_SECRET` | Secret para proteger crons | `random-32-chars` |
| `WEBHOOK_DELIVERY_SECRET` | Secret para webhook delivery (mismo valor que `[CLIENTE]_WEBHOOK_SECRET` en n8n) | `random-32-chars` |
| `N8N_DOMICILIOS_WEBHOOK_URL` | URL del webhook de domicilios en n8n | `https://n8n.almojabananet.me/webhook/[nombre]` |
| `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` | (Opcional) URL webhook Google Contacts en n8n | `https://n8n.almojabananet.me/webhook/...` |
| `NEXT_PUBLIC_BRAND_NAME` | Nombre del restaurante (aparece en auto-reply y QR) | `Sushi Service` |
| `RESTAURANT_WHATSAPP_LINK` | Link wa.me al número humano del restaurante | `https://wa.me/573XXXXXXXXX` |
| `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | (Opcional) Link Google Reviews | `https://g.page/r/...` |
| `NEXT_PUBLIC_DEMO_EMAIL` | (Opcional) Email demo para login | `demo@restaurante.com` |

### 7. Variables en n8n (Settings → Variables)

> n8n es **compartido entre todos los clientes** — usar prefijos para evitar conflictos.

| Variable n8n | Valor | Equivalencia en Vercel |
|---|---|---|
| `[CLIENTE]_APP_URL` | `https://[cliente].vercel.app` | — |
| `[CLIENTE]_WEBHOOK_SECRET` | secreto único del cliente | = `WEBHOOK_DELIVERY_SECRET` del proyecto Vercel |

**Ejemplo con 3 clientes:**
```
SUSHI_APP_URL             = https://sushi-service.vercel.app
SUSHI_WEBHOOK_SECRET      = abc123...

CLIENTE2_APP_URL          = https://cliente2.vercel.app
CLIENTE2_WEBHOOK_SECRET   = xyz789...

CLIENTE3_APP_URL          = https://cliente3.vercel.app
CLIENTE3_WEBHOOK_SECRET   = def456...
```

En cada workflow, los nodos HTTP Request usan `{{$env.SUSHI_APP_URL}}` etc.

### 8. Configurar Twilio → n8n

En **Twilio Console → Messaging → Senders → WhatsApp Senders → [número] → "When a message comes in"**:
- URL: `https://[cliente].vercel.app/api/webhook/twilio-incoming`
- Método: HTTP POST

El webhook de Vercel es el único punto de entrada. Él decide internamente si reenvía a n8n (meseros) o responde con auto-reply (clientes).

### 9. Configurar Crons

Vercel Crons ya están configurados en `vercel.json` — no requieren n8n.

```json
{ "path": "/api/cron/birthday",    "schedule": "0 13 * * *" }
{ "path": "/api/cron/reactivation","schedule": "0 15 * * *" }
```

### 8. Primer acceso

1. Ir a `https://xyz.vercel.app/login`
2. Ingresar con el email/password del admin creado en Supabase
3. Dashboard → Ajustes → Asignar plantillas aprobadas (una vez Meta las apruebe)
4. Dashboard → Recompensas → Crear los milestones del cliente
5. Dashboard → QR → Configurar color, logo, descargar QRs por mesa

---

## Actualizaciones de código

Cuando haces un fix o feature nuevo:

```bash
# En cada repo de cliente que quieras actualizar:
git remote add upstream https://github.com/tuorg/constelarys-fidelity.git
git fetch upstream
git merge upstream/main --no-edit  # merge con tu branch
# Resolver conflictos si los hay (normalmente solo branding.ts difiere)
vercel deploy --prod
```

---

## Breakdown de Costos por Cliente (USD/mes)

### Escenario: Restaurante/Café típico (50-200 clientes activos)

| Servicio | Plan | Costo USD/mes | Notas |
|----------|------|:-------------:|-------|
| **Vercel** | Hobby (gratis) | $0 | Hasta 100GB bandwidth, suficiente para 1 restaurante |
| **Vercel** | Pro (si escala) | $20 | Solo si supera 100GB o necesita analytics |
| **Supabase** | Free tier | $0 | 500MB DB, 2GB storage, 50K auth users — SOBRA |
| **Supabase** | Pro (si escala) | $25 | Solo si supera 500MB DB o necesita backups diarios |
| **Twilio WhatsApp** | Pay-as-you-go | ~$5-15 | $0.005-0.015 por mensaje. 200 clientes × 3 msgs/mes ≈ $3-9 |
| **VPS (n8n)** | Compartido entre clientes | ~$3-5 | Un VPS de $15-20/mes para 3-5 clientes = $3-5 c/u |
| **Dominio** (opcional) | `.com` o subdomain | $0-1 | Usa subdomain gratis de Vercel o dominio custom |

### Costos totales por escenario:

| Escenario | Monthly USD | Monthly COP (aprox.) |
|-----------|:-----------:|:--------------------:|
| **Mínimo** (free tiers + WhatsApp bajo uso) | **$3-8** | $12.000 - $32.000 |
| **Típico** (uso normal, 100+ clientes activos) | **$8-20** | $32.000 - $80.000 |
| **Alto** (500+ clientes, mucho WhatsApp) | **$25-50** | $100.000 - $200.000 |

### Costo de implementación (one-time)

| Concepto | Tiempo | Cobro sugerido |
|----------|:------:|:--------------:|
| Onboarding + setup Supabase/Vercel/Twilio | 2-3 horas | $150.000 - $300.000 COP |
| Crear y aprobar 5 templates WhatsApp | 1 hora + espera | Incluido |
| Personalizar branding + logo + colores | 30 min | Incluido |
| Configurar recompensas y beneficios Black | 30 min | Incluido |
| Imprimir QRs por mesa (10-20 mesas) | 30 min | Material aparte |
| Capacitación admin (dashboard, campañas) | 1 hora | Incluido |
| **TOTAL IMPLEMENTACIÓN** | **4-6 horas** | **$200.000 - $500.000 COP** |

### Pricing sugerido al cliente final

| Plan | Mensual COP | Incluye |
|------|:-----------:|---------|
| **Básico** | $89.000 | Hasta 200 clientes, 500 WhatsApp/mes, soporte email |
| **Pro** | $149.000 | Ilimitado, campañas manuales, soporte prioritario |
| **Enterprise** | $249.000 | Multi-sede, analytics avanzados, soporte 24/7 |

> **Margen neto** con free tiers: $77.000 - $237.000 COP/mes por cliente.

---

## Herramientas recomendadas para gestión multi-cliente

| Herramienta | Uso | Notas |
|-------------|-----|-------|
| **GitHub Organizations** | Repos separados por cliente | Free para repos privados |
| **Vercel Team** | Dashboard único para todos los deploys | Hobby gratis, Pro $20/user |
| **Supabase Dashboard** | Un browser tab por proyecto | Free |
| **n8n (self-hosted)** | Todos los crons y workflows centralizados | 1 VPS para todos |
| **Notion/Trello** | Tracking de clientes y onboarding status | Free |

---

## Checklist pre-launch por cliente

### Supabase
- [ ] Proyecto creado (Region: us-east-1)
- [ ] 19 migraciones ejecutadas en orden
- [ ] Tabla `auto_reply_cooldown` creada (SQL manual)
- [ ] Usuario admin creado en Auth → Users → Invite

### Vercel
- [ ] Repo clonado + deploy exitoso
- [ ] Variables de entorno configuradas (ver tabla §6)
  - [ ] `TWILIO_WHATSAPP_NUMBER` (con prefijo `whatsapp:`)
  - [ ] `WEBHOOK_DELIVERY_SECRET` (mismo valor que n8n)
  - [ ] `N8N_DOMICILIOS_WEBHOOK_URL` (URL del webhook de domicilios en n8n)
  - [ ] `NEXT_PUBLIC_BRAND_NAME` (nombre del restaurante)
  - [ ] `RESTAURANT_WHATSAPP_LINK` (wa.me del número humano)

### Twilio
- [ ] Número WhatsApp asignado al Messaging Service
- [ ] Webhook configurado: `https://[cliente].vercel.app/api/webhook/twilio-incoming` (POST)
- [ ] Opt-out keywords en español: `STOP,BAJA,CANCELAR,SALIR`
- [ ] 6 templates creados y enviados a aprobación Meta (24-48h)
- [ ] Templates asignados en Dashboard → Ajustes (una vez aprobados)

### n8n
- [ ] Variables prefijadas creadas: `[CLIENTE]_APP_URL` y `[CLIENTE]_WEBHOOK_SECRET`
- [ ] Workflow de domicilios configurado con las variables del cliente
- [ ] Workflow activado + URL del webhook copiada → pegada en `N8N_DOMICILIOS_WEBHOOK_URL` de Vercel

### Dashboard del restaurante
- [ ] Recompensas configuradas (milestones por visita)
- [ ] Ticket promedio configurado en Ajustes
- [ ] QRs generados con logo + color del cliente
- [ ] Google Reviews URL configurada (si aplica)

### Pruebas E2E
- [ ] Escanear QR → registro → WhatsApp de bienvenida recibido
- [ ] Escribir al número Twilio → auto-reply correcto + link al número humano
- [ ] Escribir 3 veces seguidas → solo recibe 1 auto-reply (cooldown activo)
- [ ] Mesero autorizado escribe → pedido procesado por n8n
- [ ] Responder STOP → no llegan más mensajes

### Operación
- [ ] Capacitar al admin del restaurante (dashboard, campañas, QR)
- [ ] Imprimir QRs por mesa
