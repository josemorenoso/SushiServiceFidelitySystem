# RESTAURANTQR — Reglas para IA (Método AInnovate v2)

> **ATENCIÓN IA:** Este proyecto usa Documentation-Driven Development.
> **ANTES** de escribir CUALQUIER línea de código, DEBES leer los docs relevantes.
> Documento completo del método: `METODO_AINNOVATE.md` (raíz del proyecto)

## Protocolo Obligatorio (antes de cada cambio)
1. LEER `docs/01-project-overview.md`
2. LEER `docs/02-architecture.md`
3. IDENTIFICAR qué feature se modifica
4. LEER `docs/features/[feature].md`
5. Si NO existe doc para la feature → CREARLO antes de codear
6. Si se toca DB → LEER `docs/DB_SCHEMA.md`
7. Si se toca API → LEER `docs/API_DOCS.md`
8. Si se toca auth/seguridad → LEER `docs/03-security.md`

## Los 12 Mandamientos del Vibe Coding (INVIOLABLES)
| # | Mandamiento | Regla |
|---|-------------|-------|
| I | NO ALUCINARÁS | Solo implementar exactamente lo pedido. Ante duda → PREGUNTAR |
| II | SEPARARÁS LÓGICA DE ESTILOS | Nunca mezclar en el mismo archivo. Con TailwindCSS clases en JSX, lógica de negocio separada |
| III | DOCUMENTARÁS CADA CAMBIO | Ningún cambio sin su doc correspondiente |
| IV | ACTUALIZARÁS EL CHANGELOG | Cada request → nueva entrada |
| V | DOCUMENTARÁS LA DB | Cada cambio de schema → DB_SCHEMA.md |
| VI | SEGUIRÁS LA ESTRUCTURA | No crear archivos fuera de la estructura |
| VII | USARÁS EL SISTEMA DE ESTILOS | Respetar el design system de TailwindCSS |
| VIII | PROTEGERÁS CREDENCIALES | Nada hardcodeado, todo en .env |
| IX | TIPARÁS TODO | TypeScript estricto, cero `any` |
| X | VALIDARÁS ANTES DE ENTREGAR | Checklist obligatorio |
| XI | MANTENDRÁS CONSISTENCIA | Seguir convenciones existentes |
| XII | COMUNICARÁS CON CLARIDAD | Resumen de acciones al terminar |

## 4 Leyes de Operación
1. **LEER ANTES DE ACTUAR** — Consultar docs antes de cualquier cambio
2. **NO ROMPER LO QUE FUNCIONA** — Detenerse si hay conflicto con la arquitectura
3. **DOCUMENTACIÓN CONTINUA** — Actualizar docs + CHANGELOG después de cada cambio
4. **SEGURIDAD** — Nunca deploy/push/cambios destructivos sin confirmación

## Documentación del Proyecto
| Doc | Cuándo leerlo |
|-----|--------------|
| `docs/01-project-overview.md` | SIEMPRE (visión, stack, estado) |
| `docs/02-architecture.md` | SIEMPRE (estructura, convenciones) |
| `docs/03-security.md` | Si se toca auth, credenciales, RLS |
| `docs/04-deployment.md` | Si se toca deploy, CI/CD |
| `docs/DB_SCHEMA.md` | Si se toca base de datos |
| `docs/API_DOCS.md` | Si se toca endpoints/API |
| `docs/SKILLS.md` | ANTES de implementar cualquier feature nueva |
| `docs/features/*.md` | El doc de la feature que se modifica |

## Tabla de Lookup
| Archivo que se modifica | Doc que se debe leer |
|------------------------|---------------------|
| `src/app/(public)/check-in/*` | `docs/features/qr-checkin.md` |
| `src/components/features/check-in/*` | `docs/features/qr-checkin.md` |
| `src/app/api/webhook/delivery/*` | `docs/features/delivery-webhook.md` + `docs/03-security.md` |
| `src/app/api/webhook/twilio-incoming/*` | `docs/features/campaigns.md` + `docs/03-security.md` |
| `src/app/api/cron/*` | `docs/features/campaigns.md` |
| `src/app/api/dashboard/campaigns/*` | `docs/features/campaigns.md` |
| `src/app/(dashboard)/dashboard/campaigns/*` | `docs/features/campaigns.md` |
| `src/app/(dashboard)/*` | `docs/features/dashboard.md` |
| `src/components/dashboard/*` | `docs/features/dashboard.md` |
| `src/hooks/useDashboardAnalytics.ts` | `docs/features/dashboard.md` |
| `src/lib/supabase/*` | `docs/02-architecture.md` + `docs/03-security.md` |
| `src/lib/twilio/*` | `docs/02-architecture.md` + `docs/CONFIGURACIONES_TWILIO_SISTEMA.md` |
| `src/services/*` | `docs/features/[feature].md` correspondiente |
| `src/constants/rewards.ts` | `docs/features/campaigns.md` + `docs/features/calendar.md` |
| `supabase/migrations/*.sql` | `docs/DB_SCHEMA.md` |
| `src/app/api/**` | `docs/API_DOCS.md` + `docs/features/[feature].md` |
| `scripts/twilio-setup.mjs` | `docs/CONFIGURACIONES_TWILIO_SISTEMA.md` |
| `src/app/(dashboard)/dashboard/calendar/*` | `docs/features/calendar.md` |
| `src/components/dashboard/Calendar/*` | `docs/features/calendar.md` |
| `src/app/api/dashboard/calendar/*` | `docs/features/calendar.md` + `docs/API_DOCS.md` |
| `src/services/calendar.service.ts` | `docs/features/calendar.md` + `docs/DB_SCHEMA.md` |
| `src/app/api/cron/calendar-dispatch/*` | `docs/features/calendar.md` |
