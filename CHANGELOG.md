# Changelog — RestaurantQR

> Formato: [Semantic Versioning](https://semver.org/)
> Cada entrada incluye: fecha, tipo, archivos afectados, request original.

---

## [0.10.0] — 2026-04-10 16:30

### Added — Conexión Twilio Real, Vercel Crons, n8n Workflows, Diagnóstico

**Conexión Twilio Real:**
- Credenciales cargadas en `.env.local` — conexión verificada ($20 USD saldo)
- `api/dashboard/twilio-balance/route.ts` — `force-dynamic`, `cache: no-store`, logging mejorado
- `api/dashboard/templates/route.ts` — `force-dynamic`, `cache: no-store`
- `api/health/twilio/route.ts` — Endpoint diagnóstico sin auth para verificar conexión Twilio

**Vercel Cron Jobs:**
- `vercel.json` — Cron config: birthday 8AM UTC, reactivation 10AM UTC
- `api/cron/birthday/route.ts` — Añadido handler GET (Vercel crons usan GET)
- `api/cron/reactivation/route.ts` — Añadido handler GET

**n8n Workflows:**
- `docs/n8n-workflows/01-delivery-webhook.json` — Workflow importable para registro de domicilios
- `docs/n8n-workflows/README.md` — Guía de setup, variables, y test rápido
- URL n8n: `https://n8n.almojabananet.me`

**Google Maps Review:**
- `.env.example` actualizado con URL real: `https://share.google/XDfNCZIn7QFQaAME9`
- Variable `N8N_BASE_URL` añadida a `.env.example`

### Changed
- `docs/API_DOCS.md` — Añadidos: `/api/health/twilio`, GET en crons, `/api/dashboard/templates`
- `docs/02-architecture.md` — Añadidos: `vercel.json`, variables env faltantes
- `docs/features/dashboard.md` — Templates actualizado de "Beta" a "Twilio Content API"

### Archivos afectados
- 10 archivos modificados/creados

**Build:** ✅ 0 errores

> **Request original:** "Ya cargué las credenciales y reinicié el server" + configurar n8n, crons, Google Maps, y probar conexión Twilio

---

## [0.9.0] — 2026-04-09 10:00

### Added — Twilio MCP, Plantillas Real, Imágenes Japonesas, Checklist Producción

**Twilio MCP Server:**
- `.windsurf/mcp_config.json` — Configuración para `@twilio-alpha/mcp`
- Servicios: `twilio_api_v2010`, `twilio_content_v1`, `twilio_messaging_v1`
- Tags: Messages, Phone Numbers, Balance, Content, ApprovalRequest, Templates
- `docs/TWILIO_MCP_SETUP.md` — Guía paso a paso de configuración
- `.gitignore` actualizado para proteger credenciales MCP

**Plantillas Twilio (producción):**
- `api/dashboard/templates/route.ts` — GET (listar) + POST (crear + auto-submit aprobación)
- Integración con Twilio Content API v1
- Dashboard muestra: SID, nombre, categoría, estado de aprobación (approved/pending/rejected/draft)
- Crear plantilla → se envía automáticamente para aprobación de WhatsApp
- Botón "Sincronizar Twilio" para refrescar estados
- Reemplaza la versión Beta local anterior

**AtRisk Bubbles (fix visual):**
- Revertido de ScatterChart a 4-5 burbujas grandes agrupadas por nivel de riesgo
- Ahora muestra: count, avg visitas, avg días inactivo por grupo
- Click en burbuja → dialog con lista de clientes + envío de campaña directa

**Imágenes japonesas integradas:**
- 5 imágenes copiadas a `public/images/` (bonsai, templo, pagoda, kanji, bambú)
- Landing (`/`): pagoda top-right, bonsai bottom-left como watermarks sutiles
- Check-in (`/check-in`): bonsai top-right, bambú bottom-left
- Login (`/login`): kanji center-right, templo bottom-left
- Fondos mejorados: `bg-gradient-to-br from-red-50 via-white to-stone-50`
- Cards con `backdrop-blur-sm bg-white/90 shadow-xl`

**Checklist de Producción:**
- `docs/PRUEBA_REAL_CHECKLIST.md` — Documento completo de TODO lo necesario para prueba real
- Cubre: Supabase, Twilio, n8n, Cron, Google Maps, Deploy, variables de entorno

### Archivos afectados
- 12 archivos modificados/creados, 1 API nueva (templates), 1 doc nuevo

**Build:** ✅ 26 rutas, 0 errores

---

## [0.8.0] — 2026-04-08 16:15

### Added — Google Reviews, Campañas Manuales, Plantillas, Twilio Wallet, Bubble Chart

**Google Review Popup (post check-in):**
- `GoogleReviewPopup.tsx` — Popup ultra dopamínico con estrellas interactivas, animaciones, incentivo visual
- Aparece 2.5s después del check-in (nuevos + recurrentes, no duplicados)
- Estrellas clicables → abre Google Maps review en pestaña nueva
- Incentivo: "rollo cortesía" por dejar reseña
- Variable env: `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`

**Campo Ciudad en Registro:**
- `CheckInForm.tsx` — Campo ciudad con icono MapPin
- `customer.service.ts` — `createCustomer` acepta `city`
- `check-in/route.ts` + `webhook/delivery/route.ts` — Envían city al crear
- `database.types.ts` — `Customer.city: string | null`
- Migración SQL: `00005_add_city.sql` con índice parcial

**Campañas Manuales (`ManualCampaigns.tsx`):**
- Filtros: ciudad, visitas min/max, edad min/max, tipo de cliente (QR/delivery/todos)
- 2 campañas predefinidas: "Invitar al Restaurante" + "Invitar a pedir Domicilio"
- Estimador de audiencia en tiempo real (debounced 500ms)
- Costo estimado por campaña (USD + COP)
- Dialog de confirmación antes de enviar
- API `/api/dashboard/campaigns/estimate` — cuenta clientes matching
- API `/api/dashboard/campaigns/manual` — crea y ejecuta campaña manual

**Twilio Wallet (`TwilioWallet.tsx`):**
- API `/api/dashboard/twilio-balance` — consulta saldo real de Twilio
- Muestra: saldo USD/COP, costo por mensaje, mensajes disponibles, link a recarga
- `CampaignCostEstimate` — componente reutilizable para estimar costos

**Plantillas de Mensajes (`/dashboard/templates`) — Beta:**
- CRUD local de plantillas con variables ({{name}}, {{visits}}, etc.)
- 6 plantillas predefinidas (bienvenida, recompensa, cumpleaños, reactivación, restaurante, domicilio)
- Vista previa WhatsApp-style con datos de ejemplo
- Categorías: marketing, utilidad, auth
- Badge "Beta" — próxima integración con Twilio Content Templates

**Bubble Chart de Clientes en Riesgo:**
- `AtRiskBubbles.tsx` reescrito con Recharts ScatterChart
- Eje X: días sin visitar, Eje Y: total de visitas, Z (tamaño): visitas acumuladas
- Colores por nivel de riesgo, tooltip con detalle del cliente
- Leyenda clickeable para enviar campaña al grupo

**Navegación:** Nuevo item "Plantillas" en sidebar y header mobile

### Archivos afectados
- 15 archivos modificados/creados, 3 APIs nuevas, 1 migración SQL

**Build:** ✅ 25 rutas, 0 errores

---

## [0.7.0] — 2026-04-08 11:14

### Changed — Branding Sushi Service + Estética Japonesa + Campañas + QR

**Tema Rojo/Blanco Japonés:**
- `globals.css` — Primary color cambiado a rojo japonés (oklch hue 25), secondary/accent/ring ajustados
- Backgrounds de landing, check-in y login: gradiente `from-red-50 to-white`

**Branding "Sushi Service":**
- `layout.tsx` — Metadata: título y descripción actualizados
- `page.tsx` — Landing rebrandeada con UtensilsCrossed icon
- `check-in/page.tsx` — Nombre y subtítulo "Programa de fidelidad"
- `login/page.tsx` — Logo + nombre en card de login
- `DashboardSidebar.tsx` — Nombre + icono en sidebar
- `DashboardHeader.tsx` — Nombre en header y menú mobile

**Campañas Mejoradas (`/dashboard/campaigns`):**
- Sección de campañas automáticas activas (Cumpleaños + Reactivación)
- Cada campaña muestra: descripción, frecuencia cron, template de mensaje, última ejecución
- Botón "Ejecutar Ahora" con dialog de confirmación para disparar campañas manualmente
- Historial de campañas ejecutadas (tabla existente mejorada)

**Generador de QR (`/dashboard/qr`):**
- Generación de QR code con librería `qrcode` (rojo oscuro sobre blanco)
- Vista previa en canvas con branding Sushi Service
- Descarga como PNG (600x600)
- Copiar URL del check-in
- Link para probar el check-in

**Navegación:**
- Nuevo item "Código QR" en sidebar y menú mobile

**Dependencias:** qrcode, @types/qrcode

**Build:** ✅ Compila sin errores (21 rutas)

### Archivos afectados
- 9 archivos modificados, 1 archivo creado

---

## [0.6.0] — 2026-04-08 09:44

### Changed — Dashboard: Rediseño Gamificado con Analytics Avanzados

**Concepto:** Dashboard adictivo con métricas accionables, sistema de poder estilo anime, burbujas de riesgo interactivas y modo demostración.

**Nuevos componentes (src/components/dashboard/):**
- `MetricsCards.tsx` — 7 tarjetas de métricas reales (QR, domicilios, nuevos, frecuentes, cumpleaños)
- `VisitsChart.tsx` — Gráfica de área: visitas diarias QR vs Domicilios (30 días)
- `GrowthChart.tsx` — Gráfica compuesta: nuevos clientes + acumulado (30 días)
- `CustomerTiers.tsx` — Barras de progreso por nivel de poder (Leyenda→Novato)
- `AtRiskBubbles.tsx` — Burbujas interactivas por grupo de riesgo (7-10, 11-15, 16-21, 22+ días)
- `PowerRanking.tsx` — Top 20 clientes con ranking anime (Leyenda, Dios, Maestro, Guerrero, Aprendiz, Novato)
- `DemoToggle.tsx` — Toggle de modo demostración

**Sistema de Rankings (src/constants/rankings.ts):**
- 6 niveles de poder: Leyenda(25+), Dios(20+), Maestro(12+), Guerrero(7+), Aprendiz(3+), Novato(1+)
- 4 niveles de riesgo: Alerta(7-10d), En riesgo(11-15d), Crítico(16-21d), Perdido(22+d)

**Modo Demostración:**
- `src/contexts/DemoContext.tsx` — Estado global con localStorage persistence
- `src/lib/demo-analytics.ts` — Computación client-side de analytics desde JSON
- `src/hooks/useDashboardAnalytics.ts` — Hook unificado (real API o demo data)
- `public/demo-data.json` — Placeholder para datos demo (1500 clientes)
- `src/types/analytics.types.ts` — Tipos compartidos para analytics

**API:**
- `GET /api/dashboard/analytics` — Analytics completos (server-side)
- `src/services/dashboard.service.ts` — getFullAnalytics() con computación de tiers, risk, ranking

**Dependencias:** recharts (gráficas), dialog (shadcn/ui)

**Build:** ✅ Compila sin errores (20 rutas)

### Archivos afectados
- 14 archivos creados, 3 archivos modificados

---

## [0.5.0] — 2026-04-08 08:40

### Added — Feature: Dashboard Administrativo (FASE 5)

**Autenticación:**
- `src/app/(auth)/login/page.tsx` — Página de login con Supabase Auth
- Middleware protege `/dashboard/*` → redirige a `/login`

**Layout:**
- `src/components/layout/DashboardSidebar.tsx` — Sidebar con navegación
- `src/components/layout/DashboardHeader.tsx` — Header con menú mobile + logout
- `src/app/(dashboard)/layout.tsx` — Layout completo con sidebar + header

**Páginas del Dashboard:**
- `/dashboard` — Métricas: total clientes, visitas hoy/semana, cumpleaños, inactivos, últimos registros
- `/dashboard/customers` — Tabla de clientes con búsqueda y paginación
- `/dashboard/rewards` — Tabla de recompensas por visitas
- `/dashboard/campaigns` — Historial de campañas ejecutadas

**API Routes (protegidas por auth):**
- `GET /api/dashboard/metrics` — Métricas generales
- `GET /api/dashboard/customers` — Lista paginada con búsqueda
- `GET /api/dashboard/rewards` — Lista de recompensas
- `GET /api/dashboard/campaigns` — Historial de campañas

**Servicios:**
- `src/services/dashboard.service.ts` — getDashboardMetrics, getCustomers, getRewards

**UI Components (shadcn/ui):**
- table, badge, separator, tabs, skeleton, avatar, dropdown-menu, sheet

**Landing:**
- `src/app/page.tsx` — Reemplazada landing default de Next.js con RestaurantQR home

**Build:** ✅ Compila sin errores (19 rutas)

### Archivos afectados
- 14 archivos creados, 4 archivos modificados

---

## [0.4.0] — 2026-04-08 08:30

### Added — Feature: Campañas y Cron Jobs (FASE 4)

**Migración SQL:**
- `supabase/migrations/00004_campaigns.sql` — Tablas campaigns + campaign_messages + índices + RLS

**Servicios:**
- `src/services/campaign.service.ts` — findBirthdayCustomers, findInactiveCustomers, getOrCreateTodayCampaign, hasRecentCampaignMessage, recordCampaignMessage, finalizeCampaign
- `src/lib/validators/cron.ts` — Validación de CRON_SECRET

**API Routes (Cron Jobs):**
- `src/app/api/cron/birthday/route.ts` — Envía felicitaciones a cumpleañeros del día (1 vez/año)
- `src/app/api/cron/reactivation/route.ts` — Envía reactivación a inactivos 21+ días (1 vez/30 días)

**WhatsApp:**
- `src/services/whatsapp.service.ts` — Nuevas funciones: sendBirthdayMessage, sendReactivationMessage, sendCampaignMessage

**Tipos:**
- `src/types/database.types.ts` — CampaignMessage.error_message añadido

**Build:** ✅ Compila sin errores

### Archivos afectados
- 4 archivos creados, 4 archivos modificados

---

## [0.3.0] — 2026-04-08 08:02

### Added — Feature: Webhook Domicilios + Google Contacts Sync (FASE 3)

**Decisión arquitectónica:** Arquitectura híbrida n8n + Next.js
- n8n = orquestador de Twilio + Google Contacts
- Next.js API = lógica de negocio (DB, visitas, recompensas)

**Migraciones SQL:**
- `supabase/migrations/00002_authorized_numbers.sql` — Tabla authorized_numbers + RLS
- `supabase/migrations/00003_delivery_fields.sql` — Campos delivery en visits (address, payment_method, amount, raw_message)

**Servicios:**
- `src/services/google-contacts-sync.service.ts` — Fire-and-forget trigger a n8n para sync Google Contacts
- `src/services/delivery.service.ts` — Parseo de mensajes WhatsApp + extracción de teléfono
- `src/lib/validators/twilio.ts` — Validación de firma Twilio (utilidad)

**API Route:**
- `src/app/api/webhook/delivery/route.ts` — POST: recibe datos parseados de n8n, crea/actualiza cliente + visita + recompensas

**Actualización Check-in:**
- `src/app/api/check-in/route.ts` — Añadido Google Contacts sync vía n8n en register y checkin

**Workflows n8n:**
- `n8n/domicilios_whatsapp_v3.json` — Twilio → parse → authorized_numbers DB → Google Contacts → nuestra API → TwiML response
- `n8n/google_contacts_sync.json` — Recibe trigger de QR check-in → Google Contacts search/create/update

**Mejoras vs workflow v2 del usuario:**
- Números autorizados ahora se validan contra DB (no hardcodeados)
- Credenciales de Supabase/Google usan env vars de n8n (no hardcodeadas)
- Usa nuestro Supabase unificado
- Integración bidireccional: QR y delivery sincronizan Google Contacts

### Archivos afectados
- 8 archivos creados, 4 archivos modificados
- `docs/features/delivery-webhook.md` — Creado y actualizado
- `docs/DB_SCHEMA.md` — Migraciones 2 y 3 registradas
- `docs/API_DOCS.md` — Endpoint delivery documentado
- `docs/01-project-overview.md` — Estado actualizado
- `src/types/database.types.ts` — Visit type con campos delivery
- `src/services/visit.service.ts` — createVisit con campos delivery
- `.env.example` — Nuevas variables: WEBHOOK_DELIVERY_SECRET, N8N_GOOGLE_CONTACTS_WEBHOOK_URL

**Build:** ✅ Compila sin errores

### Request original
> Necesito que los contactos estén creados/actualizados en Google Contacts

---

## [0.2.0] — 2026-04-07 22:09

### Added — Feature: QR Check-in (FASE 2)

**Migración SQL:**
- `supabase/migrations/00001_initial_schema.sql` — Tablas customers, visits, rewards + RLS + trigger handle_updated_at + seed de 3 recompensas (visita 3, 5, 7)

**Servicios (lógica de negocio):**
- `src/services/customer.service.ts` — findByPhone, create, incrementVisit
- `src/services/visit.service.ts` — createVisit, getRecentVisit (anti-duplicado 1h)
- `src/services/reward.service.ts` — checkRewardForVisit
- `src/services/whatsapp.service.ts` — sendWelcome, sendReward, sendWelcomeBack (Twilio, best-effort)

**API Route:**
- `src/app/api/check-in/route.ts` — POST con 3 acciones: lookup, register, checkin

**UI Components:**
- `src/components/features/check-in/CheckInForm.tsx` — Formulario de celular + registro
- `src/components/features/check-in/CheckInForm.types.ts` — Tipos
- `src/components/features/check-in/CheckInSuccess.tsx` — Pantalla de éxito + recompensa
- `src/components/features/check-in/CheckInSuccess.types.ts` — Tipos
- `src/components/features/check-in/index.ts` — Barrel export
- `src/app/(public)/check-in/page.tsx` — Página completa con flujo de estados

**Utilidades:**
- `src/lib/validators/phone.ts` — Validación celular colombiano + formato WhatsApp

**shadcn/ui componentes añadidos:**
- `src/components/ui/input.tsx`, `card.tsx`, `label.tsx`, `sonner.tsx`

**Build:** ✅ Compila sin errores

### Archivos afectados
- 16 archivos creados
- `docs/features/qr-checkin.md` — Creado (documentación de feature)
- `docs/DB_SCHEMA.md` — Actualizado (migración registrada)
- `docs/API_DOCS.md` — Actualizado (endpoint check-in documentado)
- `docs/01-project-overview.md` — Actualizado (estado de fases)

### Request original
> Sigue con la fase 2 el qr check in

---

## [0.1.0] — 2026-04-07 16:00

### Added — Setup Inicial (Método AInnovate FASE 1)

**Documentación:**
- `docs/01-project-overview.md` — Visión, objetivos, stack (Next.js 16.2.2, React 19.2.4, Supabase, Twilio), estado del proyecto
- `docs/02-architecture.md` — Estructura de carpetas, stack completo con versiones reales, ADRs, convenciones, flujos de datos
- `docs/03-security.md` — Autenticación (Supabase Auth), autorización, variables de entorno, validaciones, reglas
- `docs/04-deployment.md` — Template de deployment (Vercel, pendiente de configurar)
- `docs/DB_SCHEMA.md` — Esquema completo: 6 tablas (customers, visits, rewards, campaigns, campaign_messages, authorized_numbers), diagrama ER Mermaid, RLS, triggers
- `docs/API_DOCS.md` — 9 endpoints documentados (health, check-in, webhook, cron x2, dashboard x4)
- `docs/SKILLS.md` — Registro de 7 skills n8n disponibles en el IDE
- `docs/features/` — Carpeta para features (se llena en FASE 2)

**Reglas para 6 IDEs:**
- `.windsurfrules` — Windsurf/Cascade
- `CLAUDE.md` — Claude Code
- `.cursorrules` — Cursor
- `.clinerules` — Cline/Continue
- `.github/copilot-instructions.md` — GitHub Copilot
- `.aider.conf.yml` — Aider

**Proyecto Next.js:**
- Inicializado con `create-next-app@16.2.2` (App Router, TypeScript, TailwindCSS v4)
- shadcn/ui inicializado (Button + utils generados)
- Dependencias: `@supabase/supabase-js`, `@supabase/ssr`, `twilio`, `lucide-react`
- Estructura de carpetas: `src/app/(public)`, `src/app/(dashboard)`, `src/app/api/`, `src/lib/supabase/`, `src/lib/twilio/`, `src/types/`, `src/constants/`, `src/services/`, `src/hooks/`, `src/components/{ui,layout,features}`
- Supabase client/server/middleware configurados
- Middleware de auth para proteger `/dashboard/*`
- API Routes placeholder: health, webhook/delivery, cron/birthday, cron/reactivation
- Tipos TypeScript para todas las tablas de DB
- `.env.example` con todas las variables necesarias
- `.gitignore` configurado (excluye .env* excepto .env.example)

**Build:** ✅ Compila sin errores (TypeScript + Next.js)

### Archivos creados (32 archivos)
- `docs/` — 7 archivos de documentación + 1 carpeta features
- 6 archivos de reglas para IDEs
- `CHANGELOG.md`, `METODO_AINNOVATE.md`, `.env.example`
- `src/app/(public)/check-in/page.tsx`
- `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/api/health/route.ts`, `src/app/api/webhook/delivery/route.ts`
- `src/app/api/cron/birthday/route.ts`, `src/app/api/cron/reactivation/route.ts`
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- `src/lib/twilio/client.ts`
- `src/middleware.ts`
- `src/types/database.types.ts`
- `src/constants/rewards.ts`

### Request original
> Lee el archivo METODO_AINNOVATE.md completo y sigue las instrucciones de la FASE 1. Mi proyecto es una plataforma integral (Full-Stack) de fidelización, CRM y automatización de marketing para un restaurante. Stack: Next.js (App Router) + Supabase + TailwindCSS + Shadcn/UI + Twilio SDK.
