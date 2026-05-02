# Arquitectura — RestaurantQR

## Stack Completo
| Dependencia | Propósito | Versión |
|-------------|-----------|---------|
| next | Framework Full-Stack (App Router) | 15.x |
| react / react-dom | UI Library | 19.x |
| @supabase/supabase-js | Cliente Supabase (DB + Auth) | 2.x |
| @supabase/ssr | Helpers SSR para Next.js | 0.x |
| tailwindcss | Utilidades CSS | 4.x |
| shadcn/ui | Componentes UI pre-diseñados | latest |
| twilio | SDK para envío de WhatsApp | 5.x |
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
- **authorized_numbers** — Números de meseros autorizados para webhook
- **admin_users** — Administradores del dashboard (vía Supabase Auth)

## Flujo de Datos

### QR Check-in (Presencial)
```
Cliente escanea QR → /check-in → Ingresa celular
  → Si nuevo: Formulario completo → Supabase INSERT → Twilio WhatsApp bienvenida
  → Si existe: +1 visita → Evalúa meta → Twilio WhatsApp recompensa (si aplica)
```

### Domicilios (WhatsApp)
```
Mesero reenvía mensaje → Twilio Webhook → /api/webhook/delivery
  → Valida número autorizado → Extrae datos → Supabase UPSERT → +1 visita
```

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
