# Skills Instaladas

> Última actualización: 2026-06-17
> Este archivo registra todas las skills, extensiones, MCP servers y herramientas
> especializadas disponibles en el entorno de desarrollo.

---

## ¿Qué son las Skills?

Las skills son capacidades especializadas que la IA puede usar para implementar
funcionalidades de forma más eficiente y correcta. Antes de implementar cualquier
feature, la IA DEBE consultar este archivo para verificar si existe una skill
relevante.

---

## Skills Activas

| # | Nombre | Tipo | Descripción | Usar cuando |
|---|--------|------|-------------|-------------|
| 1 | n8n-code-javascript | skill | Escribir código JavaScript en n8n Code nodes | Integración con n8n workflows |
| 2 | n8n-code-python | skill | Escribir código Python en n8n Code nodes | Integración Python con n8n |
| 3 | n8n-expression-syntax | skill | Validar sintaxis de expresiones n8n | Trabajando con expresiones n8n |
| 4 | n8n-mcp-tools-expert | skill | Guía para usar herramientas MCP de n8n | Buscando nodos, validando configs |
| 5 | n8n-node-configuration | skill | Configuración de nodos n8n | Configurando nodos n8n |
| 6 | n8n-validation-expert | skill | Interpretar errores de validación n8n | Errores de validación n8n |
| 7 | n8n-workflow-patterns | skill | Patrones arquitectónicos de workflows n8n | Diseñando workflows n8n |

---

## MCP Servers Conectados

| # | Servidor | Herramientas | Descripción | Usar cuando |
|---|----------|-------------|-------------|-------------|
| - | Ninguno configurado aún | - | - | - |

---

## Infraestructura externa (no-IDE)

| Herramienta | Rol en el proyecto | Detalle |
|-------------|--------------------|---------|
| n8n (self-hosted) | Scheduler externo del cron `calendar-dispatch` | Schedule Trigger cada 15 min → HTTP POST a `/api/cron/calendar-dispatch` con `Authorization: Bearer CRON_SECRET`. Evita el plan Vercel Pro. Ver `docs/features/calendar.md`. Para editar estos workflows, usar las skills `n8n-*`. |

---

## Historial de Skills

| Fecha | Acción | Skill | Motivo |
|-------|--------|-------|--------|
| 2026-04-07 | Registradas | n8n-* (7 skills) | Skills disponibles en el entorno IDE |
| 2026-06-17 | Adoptada | n8n self-hosted (infra) | Disparar el cron `calendar-dispatch` cada 15 min sin pagar Vercel Pro |
