# Constelarys Fidelity System — Guía de Despliegue (Clone-per-Client)

> Última actualización: v0.22.0

## Arquitectura

```
╔══════════════════════════════════════════════════════════════╗
║                  TU INFRAESTRUCTURA                         ║
║                                                              ║
║  ┌─ VPS (n8n) ─────────────────────────────────┐            ║
║  │  • n8n (workflow automation)                  │            ║
║  │  • Crons de cumpleaños/reactivación           │            ║
║  │  • Google Contacts sync                       │            ║
║  │  • WhatsApp delivery webhook receiver         │            ║
║  └───────────────────────────────────────────────┘            ║
║                                                              ║
║  ┌─ Vercel (por cliente) ────────────┐                       ║
║  │  • Next.js App (dashboard + QR)    │ ← 1 repo GitHub     ║
║  │  • API routes (check-in, crons)    │   por cliente        ║
║  └────────────────────────────────────┘                       ║
║                                                              ║
║  ┌─ Supabase (por cliente) ──────────┐                       ║
║  │  • PostgreSQL (datos cliente)      │ ← 1 proyecto         ║
║  │  • Auth (admin login)              │   por cliente        ║
║  │  • RLS (row-level security)        │                       ║
║  └────────────────────────────────────┘                       ║
║                                                              ║
║  ┌─ Twilio (1 cuenta maestra) ───────┐                       ║
║  │  • WhatsApp Business API           │ ← Subaccounts       ║
║  │  • Número dedicado por cliente     │   o messaging        ║
║  │  • Templates aprobados por Meta    │   services           ║
║  └────────────────────────────────────┘                       ║
╚══════════════════════════════════════════════════════════════╝
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
3. Ejecutar migraciones SQL en orden:
   - `supabase/migrations/00001_customers.sql`
   - `supabase/migrations/00002_visits.sql`
   - `supabase/migrations/00003_rewards.sql`
   - `supabase/migrations/00004_campaigns.sql`
   - `supabase/migrations/00005_admin_settings.sql`
   - `supabase/migrations/00006_authorized_numbers.sql`
   - `supabase/migrations/00007_campaign_messages.sql`
   - `supabase/migrations/00008_accepts_marketing.sql`
   - `supabase/migrations/00009_table_number.sql`
4. Crear usuario admin en Auth → Users → "Invite user"
5. Copiar `SUPABASE_URL` y `SUPABASE_ANON_KEY` de Settings → API

### 4. Configurar Twilio

1. Twilio Console → Messaging → WhatsApp Senders
2. Registrar número del cliente (o asignar subaccount)
3. Crear 5 Content Templates para el cliente:
   - `welcome` → "¡Hola {{1}}! Bienvenid@ a XYZ..."
   - `welcome_back` → "¡Hola {{1}}! Visita #{{2}}. {{3}}"
   - `reward` → "¡Felicidades {{1}}! Visita #{{2}}, ganaste: {{3}}"
   - `birthday` → "¡Feliz cumpleaños {{1}}! 🎂..."
   - `reactivation` → "¡Hola {{1}}! Te extrañamos. Visita #{{2}}. {{3}}"
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

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (solo server) | `eyJ...` |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio | `AC...` |
| `TWILIO_AUTH_TOKEN` | Auth token de Twilio | `abc...` |
| `TWILIO_WHATSAPP_FROM` | Número WhatsApp sender | `whatsapp:+573001234567` |
| `CRON_SECRET` | Secret para proteger crons | `random-32-chars` |
| `WEBHOOK_DELIVERY_SECRET` | Secret para webhook delivery | `random-32-chars` |
| `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` | (Opcional) URL webhook n8n | `https://n8n.tudominio.me/webhook/...` |
| `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | (Opcional) Link Google Reviews | `https://g.page/r/...` |

### 7. Configurar Crons en n8n

En tu VPS con n8n, crear workflows por cliente:
- **Birthday cron**: Schedule → HTTP Request POST a `https://xyz.vercel.app/api/cron/birthday` con header `Authorization: Bearer {CRON_SECRET}`
- **Reactivation cron**: Igual pero a `/api/cron/reactivation`

Horarios recomendados: Birthday 8am, Reactivation 10am (hora local del negocio).

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

- [ ] Branding personalizado (`src/lib/branding.ts`)
- [ ] Supabase proyecto creado + migraciones ejecutadas
- [ ] Usuario admin creado en Supabase Auth
- [ ] Vercel deploy exitoso + env vars configuradas
- [ ] Twilio número asignado + 5 templates aprobados por Meta
- [ ] Templates asignados en Dashboard > Ajustes
- [ ] Recompensas configuradas (milestones)
- [ ] Beneficios Black definidos
- [ ] QRs generados con logo + color del cliente
- [ ] Crons configurados en n8n (birthday + reactivation)
- [ ] Google Reviews URL configurada (si aplica)
- [ ] Ticket promedio configurado en Dashboard > Ajustes
- [ ] Prueba end-to-end: escanear QR → registro → WhatsApp recibido
- [ ] Capacitación al administrador del restaurante
