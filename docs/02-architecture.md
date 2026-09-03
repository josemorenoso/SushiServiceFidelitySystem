# Arquitectura — RestaurantQR

## Stack Completo
| Dependencia | Propósito | Versión |
|-------------|-----------|---------|
| next | Framework Full-Stack (App Router) | 16.2.2 |
| react / react-dom | UI Library | 19.2.4 |
| @supabase/supabase-js | Cliente Supabase (DB + Auth) | 2.102.x |
| @supabase/ssr | Helpers SSR para Next.js | 0.10.x |
| tailwindcss | Utilidades CSS | 4.x |
| class-variance-authority | Variantes de componentes | 0.7.x |
| clsx + tailwind-merge | Merge de clases CSS | latest |
| shadcn/ui | Componentes UI pre-diseñados | latest |
| twilio | SDK para envío de WhatsApp | 5.13.x |
| openai | Parseo con IA de los pedidos de domicilio (`gpt-4o-mini`) — Fase 2 de §25, 2026-09-03 | 7.9.x |
| tw-animate-css | Animaciones CSS para Tailwind | 1.4.x |
| typescript | Tipado estático | 5.x |
| lucide-react | Iconos | latest |

## Estructura de Carpetas
```
restaurant-qr/
├── docs/                           # Documentación (Método AInnovate)
│   ├── 01-project-overview.md
│   ├── 02-architecture.md
│   ├── 03-security.md
│   ├── 04-deployment.md
│   ├── DB_SCHEMA.md
│   ├── API_DOCS.md
│   ├── SKILLS.md
│   └── features/                   # Un .md por funcionalidad
├── src/
│   ├── app/                        # App Router — rutas y páginas
│   │   ├── (public)/               # Rutas públicas (check-in QR)
│   │   ├── (dashboard)/            # Rutas protegidas (admin)
│   │   ├── api/                    # API Routes (webhooks, cron)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/                 # Componentes reutilizables
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── layout/                 # Header, Sidebar, Footer
│   │   └── features/               # Componentes por feature
│   ├── lib/                        # Utilidades, configs, clientes
│   │   ├── supabase/               # Cliente Supabase (client, server, middleware)
│   │   ├── twilio/                 # Cliente Twilio
│   │   └── utils/                  # Helpers genéricos
│   ├── hooks/                      # Custom hooks
│   ├── types/                      # Tipos globales TypeScript
│   ├── constants/                  # Constantes de la app
│   └── services/                   # Lógica de negocio / servicios
├── public/                         # Assets estáticos
├── supabase/                       # Supabase config + migrations
│   ├── migrations/
│   └── config.toml
├── .windsurfrules                  # Reglas IA (Windsurf)
├── CLAUDE.md                       # Reglas IA (Claude)
├── .cursorrules                    # Reglas IA (Cursor)
├── .clinerules                     # Reglas IA (Cline)
├── .github/
│   └── copilot-instructions.md     # Reglas IA (Copilot)
├── .aider.conf.yml                 # Reglas IA (Aider)
├── CHANGELOG.md                    # Historial de cambios
├── METODO_AINNOVATE.md             # Método completo
├── vercel.json                     # Vercel cron jobs config
├── .env.local                      # Variables de entorno (NO COMMIT)
├── .env.example                    # Template de variables
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
└── .gitignore
```

## Base de Datos
Supabase (PostgreSQL). Detalle completo en `DB_SCHEMA.md`.

Tablas principales previstas:
- **customers** — Clientes del restaurante (nombre, teléfono, cumpleaños, visitas)
- **visits** — Historial de visitas individuales
- **rewards** — Configuración de recompensas por metas
- **campaigns** — Campañas de marketing (manuales y automáticas)
- **campaign_messages** — Mensajes enviados por campaña
- **authorized_numbers** — Números de meseros autorizados para webhook (domicilios)
- **admin_settings** — Configuración del admin (key-value: ticket promedio, modo check-in, etc.)
- **admin_users** — Administradores del dashboard (vía Supabase Auth)
- **staff_users** — Meseros del restaurante (login con PIN hasheado, roles: waiter/supervisor/admin)
- **staff_devices** — Dispositivos de confianza (celulares/tablets del local registrados por supervisor)

## Flujo de Datos

### QR Check-in (Presencial) — Modo `auto` (legacy)
```
Cliente escanea QR → /check-in → Ingresa celular
  → Si nuevo: Formulario completo → Supabase INSERT → Twilio WhatsApp bienvenida
  → Si existe: +1 visita → Evalúa meta → Twilio WhatsApp recompensa (si aplica)
```

### QR Check-in — Modo `staff_verified` (v1.1.0+)
```
Cliente escanea QR → /check-in → Ingresa celular
  → Si nuevo: Registro + welcome bonus → Muestra QR dinámico personal (token JWT 5 min)
  → Si existe: Muestra QR dinámico personal (token JWT 5 min)
  → Inicia polling cada 5s a /api/check-in/status

Mesero (dispositivo de confianza o login con PIN) → Abre /mesero → Escanea QR del cliente
  → Valida firma JWT del QR → Confirma mesa → Registra visita (source='staff_scan')
  → Suma puntos → Evalúa tier → Twilio WhatsApp

Cliente detecta visita reciente (polling) → Pantalla cambia automáticamente a éxito
  → Muestra puntos ganados, saldo, roadmap de tiers
```

### Domicilios (WhatsApp) — dentro del producto desde 2026-09-03
```
Operador reenvía el cuadro del pedido
  → Twilio → /api/webhook/twilio-incoming    (responde TwiML al operador)
  └ Zernio → /api/webhook/zernio             (responde 200, sin texto de vuelta)
  → Valida firma → authorized_numbers (trae también location_id: la sede sale gratis)
  → processDeliveryMessage()
      → OpenAI gpt-4o-mini extrae nombre/celular/dirección/pago/monto/ciudad
      → registerDeliveryOrder(): cliente + visita + puntos + tiers + plantilla WhatsApp
```
Ya **no** hay reenvío a n8n (Fase 2 de §25). `/api/webhook/delivery` sigue existiendo con el
mismo contrato para llamadores externos. Ver `docs/features/delivery-webhook.md`.

### Campañas Automáticas (Cron)
```
Cron diario → /api/cron/birthday → Busca cumpleañeros → Twilio WhatsApp
Cron diario → /api/cron/reactivation → Busca inactivos 21d → Twilio WhatsApp
```

### Dashboard Admin
```
Admin login (Supabase Auth) → /dashboard → Métricas, Clientes, Recompensas, Campañas
```

## Variables de Entorno
| Variable | Descripción | Tipo | Requerida |
|----------|-------------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | pública | SI |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase | pública | SI |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio Supabase (solo server) | privada | SI |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio | privada | SI |
| `TWILIO_AUTH_TOKEN` | Auth Token de Twilio | privada | SI |
| `TWILIO_WHATSAPP_NUMBER` | Número WhatsApp de Twilio (ej: whatsapp:+14155238886) | privada | SI |
| `CRON_SECRET` | Secret para proteger rutas cron | privada | SI |
| `WEBHOOK_DELIVERY_SECRET` | Secret para webhook de domicilios (n8n) | privada | SI |
| `OPENAI_API_KEY` | Key de OpenAI para el parseo con IA de los domicilios (`gpt-4o-mini`). **Sin ella no entra ningún pedido de domicilio** — ver `docs/features/delivery-ai-parsing.md` | privada | SI (si el tenant recibe domicilios) |
| `N8N_DOMICILIOS_WEBHOOK_URL` | 🔻 **Muerta desde la Fase 2 de §25.** Ya no se lee en ningún sitio | privada | NO |
| `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | URL de reseñas Google Maps | pública | SI |
| `RESTAURANT_WHATSAPP_LINK` | Enlace wa.me del restaurante para el auto-responder | privada | SI |
| `NEXT_PUBLIC_BRAND_NAME` | Nombre completo del restaurante (ej: "Sushi Service") | pública | SI |
| `NEXT_PUBLIC_BRAND_SHORT` | Nombre corto para UI compacta | pública | NO |
| `NEXT_PUBLIC_BRAND_TAGLINE` | Tagline del restaurante | pública | NO |
| `STAFF_JWT_SECRET` | Secret para firmar JWT de sesión de meseros | privada | SI (si usa staff scan) |
| `STAFF_QR_JWT_SECRET` | Secret para firmar tokens efímeros del QR dinámico del cliente | privada | SI (si usa staff scan) |
| `NEXT_PUBLIC_STAFF_ROLE_LABEL` | Etiqueta del rol del staff. `Mesero` (restaurante), `Barbero` (barbería), etc. Default: `Mesero` | pública | NO |
| `N8N_BASE_URL` | URL base de n8n | privada | NO |
| `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL` | URL pública de la imagen de muestra que Meta revisa al aprobar la plantilla `evento_imagen`. Meta **descarga** el archivo: no se puede inventar. Sin ella, las 11 plantillas de texto funcionan igual y solo falla la de evento con imagen. Ver `docs/features/whatsapp-templates.md` | privada | NO (sí para eventos con imagen en tenants Zernio) |
| `ZERNIO_TEMPLATE_SAMPLE_VIDEO_URL` | Ídem, para la plantilla `evento_video` | privada | NO (sí para eventos con video en tenants Zernio) |

## Convenciones del Proyecto
| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Componentes | PascalCase | `CustomerCard.tsx` |
| Hooks | camelCase con "use" | `useCustomers.ts` |
| Utilidades | camelCase | `formatPhone.ts` |
| Constantes | SCREAMING_SNAKE | `VISIT_MILESTONES.ts` |
| Tipos/Interfaces | PascalCase | `CustomerTypes.ts` |
| Servicios | camelCase + .service | `customer.service.ts` |
| API Routes | kebab-case carpetas | `api/webhook/delivery/route.ts` |

## Decisiones Arquitectónicas

### ADR-001: Monorepo con Next.js App Router
**Fecha:** 2026-04-07
**Contexto:** Se necesita frontend + API + webhooks + cron en un solo lugar.
**Decisión:** Usar Next.js App Router para tener frontend y backend unificados. API Routes para webhooks y cron jobs.
**Consecuencias:** Deploy simplificado en Vercel. No se necesita servidor backend separado.

### ADR-002: Supabase como Backend-as-a-Service
**Fecha:** 2026-04-07
**Contexto:** Se necesita base de datos PostgreSQL, autenticación y RLS sin manejar infraestructura.
**Decisión:** Usar Supabase para DB, Auth y RLS.
**Consecuencias:** Menos código de backend. RLS protege datos a nivel de DB. Auth integrado.

### ADR-003: Twilio para mensajería WhatsApp
**Fecha:** 2026-04-07
**Contexto:** Se necesita enviar y recibir mensajes de WhatsApp programáticamente.
**Decisión:** Usar Twilio SDK con WhatsApp Business API.
**Consecuencias:** Costo por mensaje. Requiere número Twilio aprobado para WhatsApp.

### ADR-004: shadcn/ui + TailwindCSS para UI
**Fecha:** 2026-04-07
**Contexto:** Se necesita UI moderna y consistente con componentes accesibles.
**Decisión:** Usar shadcn/ui (componentes copiados al proyecto) + TailwindCSS.
**Consecuencias:** Control total sobre los componentes. No hay dependencia de librería externa de UI.

### ADR-005: Modelo clone-por-cliente
**Fecha:** 2026-05-09
**Contexto:** Cada restaurante necesita sus propios datos aislados (clientes, campañas, configuración) pero el código es idéntico.
**Decisión:** Un repositorio GitHub por cliente, un proyecto Supabase por cliente, un proyecto Vercel por cliente. Twilio compartido vía Messaging Service único.
**Consecuencias:** Aislamiento total de datos. Deploy independiente por cliente. Costos Twilio centralizados. El código se mantiene en un repo plantilla y se sincroniza manualmente.

### ADR-006: Frequency Cap y Recovery Zone centralizados en constants
**Fecha:** 2026-05-09
**Contexto:** Los umbrales de marketing (cap 7 días, recovery zone 18-25 días) estaban hardcodeados en distintos archivos.
**Decisión:** Centralizar en `src/constants/rewards.ts` como `FREQUENCY_CAP_DAYS`, `RECOVERY_ZONE_START_DAYS`, `RECOVERY_ZONE_END_DAYS`.
**Consecuencias:** Cambiar un número cambia el comportamiento en todos los motores (cron, manual, estimador, radar).
