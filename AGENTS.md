<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RestaurantQR / Cada1 — para las IAs que no leen CLAUDE.md (Codex, Cursor, Windsurf, Gemini CLI)

Este archivo no repite nada: apunta.

- **El estado vivo** está en `ESTADO.md` (raíz). Leerlo primero, siempre.
- **Las reglas del proyecto** (guardrails del dominio, trampas de librerías, mapa de docs) están en `CLAUDE.md`.
- **El método de trabajo** está en `METODO_MAESTRO_LUISRAI.md`: tarea · guardrails · criterio de término.
- **El grafo del proyecto** está en `graphify-out/`: `graphify query "…"` antes de leer medio repo.
- **Qué falta del encargo de producto** (§1–§25) está en `docs/ESTADO-REQUERIMIENTOS.md`.

Lo mínimo si solo vas a leer una cosa: solo lo pedido · nada destructivo sin confirmar · secretos en `.env` ·
todo INSERT lleva `tenant_id` explícito · validar con `npx tsc --noEmit && npm run lint && npx vitest run` ·
al cerrar, `ESTADO.md` + `CHANGELOG.md`.
