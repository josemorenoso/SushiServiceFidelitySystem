# RestaurantQR / Cada1

Plataforma de fidelización, CRM y automatización de marketing para restaurantes. **Multi-tenant y
multi-sede**: un solo despliegue atiende a muchas marcas y a las sedes de cada marca, sin que un dato
de una se vea en la otra.

Qué hace: check-in de comensales por QR en mesa, tarjeta digital de fidelidad, campañas de WhatsApp
(cumpleaños, reactivación, manuales), premios con redención en el local, captación de clientes de
domicilios por WhatsApp con lectura por IA, y un panel para administrarlo todo.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS 4 · shadcn/ui ·
Supabase (PostgreSQL + Auth + RLS) · Twilio y Zernio (WhatsApp) · OpenAI (lectura de domicilios) · Vercel.

## Empezar

```bash
npm install
cp .env.example .env.local   # y llenar los valores
npm run dev                  # http://localhost:3000
```

Verificación antes de entregar: `npx tsc --noEmit && npm run lint && npx vitest run`.

## Por dónde se entra a la documentación

| Archivo | Para qué |
|---|---|
| [ESTADO.md](ESTADO.md) | **Empezá por acá.** Qué está hecho, qué está en vuelo, qué sigue y qué está bloqueado |
| [CLAUDE.md](CLAUDE.md) | Las reglas del proyecto: guardrails del dominio, trampas verificadas, mapa de docs |
| [METODO_MAESTRO_LUISRAI.md](METODO_MAESTRO_LUISRAI.md) | Cómo se trabaja en este repo: tarea · guardrails · criterio de término |
| [docs/ESTADO-REQUERIMIENTOS.md](docs/ESTADO-REQUERIMIENTOS.md) | Qué falta del encargo de producto (§1–§25), auditado contra el código |
| [docs/RUNBOOK-DEPLOY.md](docs/RUNBOOK-DEPLOY.md) | Los pasos del despliegue, en orden |
| [docs/](docs/) | Arquitectura, esquema de la base, API, seguridad y un `.md` por feature |
| [CHANGELOG.md](CHANGELOG.md) | Historial de versiones |

El repo tiene además un **grafo de conocimiento** (`graphify-out/`, generado): `graphify query "…"`
responde qué toca a qué sin leer medio proyecto.
