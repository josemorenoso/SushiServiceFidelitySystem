# Changelog — RestaurantQR

> Formato: [Semantic Versioning](https://semver.org/)
> Cada entrada incluye: fecha, tipo, archivos afectados, request original.

---

## [Unreleased] — 2026-04-14

### Added — Soporte para embeber la app como iframe

- `restaurant-qr/next.config.ts` — Se agregaron headers HTTP globales para permitir que la app sea incrustada en un `<iframe>` desde cualquier origen. Se configura `X-Frame-Options: ALLOWALL` y `Content-Security-Policy: frame-ancestors *`.

### Archivos afectados
- `restaurant-qr/next.config.ts` — Modificado

### Request original
- Se creó un link demo para subir la app como iframe en el website del cliente.

---

## [Unreleased] — 2026-04-10

### Fixed — Plantillas Twilio siempre mostraban "Borrador"
- `src/app/api/dashboard/templates/route.ts` — El endpoint correcto de Twilio es `GET /ApprovalRequests` (sin `/whatsapp`). La ruta `/ApprovalRequests/whatsapp` devuelve HTTP 405. El status aprobado vive en `response.whatsapp.status`. Se normaliza a minúsculas. Se agregan logs de error con HTTP status.
- `src/components/dashboard/ManualCampaigns.tsx` — El filtro de plantillas aprobadas ahora acepta tanto `approval_status` como `status` con normalización a minúsculas, evitando que templates aprobadas queden invisibles.

### Archivos afectados
- `src/app/api/dashboard/templates/route.ts` — Corregido
- `src/components/dashboard/ManualCampaigns.tsx` — Corregido

### Request original
- Dashboard mostraba todas las plantillas como "Borrador" aunque estuvieran aprobadas en Twilio, causando que las campañas manuales no tuvieran plantillas disponibles.

---

## [0.1.0] — 2026-04-07

### Added — Setup Inicial (Método AInnovate)
- Estructura de documentación creada (`docs/`)
- `docs/01-project-overview.md` — Visión, objetivos, stack, estado del proyecto
- `docs/02-architecture.md` — Estructura de carpetas, stack, ADRs, convenciones
- `docs/03-security.md` — Autenticación, autorización, variables de entorno, reglas
- `docs/04-deployment.md` — Template de deployment (pendiente de configurar)
- `docs/DB_SCHEMA.md` — Esquema completo de base de datos (6 tablas diseñadas)
- `docs/API_DOCS.md` — Documentación de API (endpoints planificados)
- `docs/SKILLS.md` — Registro de skills disponibles en el IDE
- `docs/features/` — Carpeta para documentación de features (vacía, se llena en FASE 2)
- Reglas para 6 IDEs: `.windsurfrules`, `CLAUDE.md`, `.cursorrules`, `.clinerules`, `.github/copilot-instructions.md`, `.aider.conf.yml`
- `CHANGELOG.md` inicializado

### Archivos afectados
- `docs/01-project-overview.md` — Creado
- `docs/02-architecture.md` — Creado
- `docs/03-security.md` — Creado
- `docs/04-deployment.md` — Creado
- `docs/DB_SCHEMA.md` — Creado
- `docs/API_DOCS.md` — Creado
- `docs/SKILLS.md` — Creado
- `.windsurfrules` — Creado
- `CLAUDE.md` — Creado
- `.cursorrules` — Creado
- `.clinerules` — Creado
- `.github/copilot-instructions.md` — Creado
- `.aider.conf.yml` — Creado
- `CHANGELOG.md` — Creado

### Request original
> Lee el archivo METODO_AINNOVATE.md completo y sigue las instrucciones de la FASE 1. Mi proyecto es una plataforma integral (Full-Stack) de fidelización, CRM y automatización de marketing para un restaurante.
