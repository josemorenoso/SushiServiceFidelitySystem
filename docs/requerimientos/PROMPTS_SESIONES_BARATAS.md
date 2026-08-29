# Prompts para sesiones con modelos baratos (Sonnet / Haiku)

> Generado 2026-08-29. Cada bloque es un prompt AUTOCONTENIDO: ábrelo en una sesión nueva de
> Claude Code (modelo Sonnet salvo que diga Haiku), parado en la raíz del repo
> `Software Cada1 - copia`, y pégalo tal cual como primer mensaje.
> Regla general para todas: el trabajo caro de diseño/decisiones ya está tomado y documentado —
> estas sesiones EJECUTAN, no rediseñan. Si algo contradice lo escrito, parar y preguntar al dueño.

---

## P1 — Actualizar `docs/01-project-overview.md` y `docs/02-architecture.md` (Sonnet)

```
Trabajas en el repo RESTAURANTQR. Los dos documentos que CLAUDE.md marca como lectura obligatoria
"SIEMPRE" están DESACTUALIZADOS: siguen describiendo el modelo viejo "clone-por-cliente" (ADR-005)
como vigente, cuando desde julio 2026 el sistema es multitenant real (un solo Vercel + un solo
Supabase, aislamiento por tenant_id en 18 tablas) y desde agosto 2026 existe una migración de
mensajería Twilio → Zernio en curso.

TAREA: reescribir docs/01-project-overview.md y docs/02-architecture.md para que describan la
realidad actual. NO inventes: toda la verdad ya está escrita en estas fuentes — léelas primero:
1. docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md (§0, §1 y §2 — arquitectura multitenant real,
   estado de la migración Zernio, tenants activos).
2. docs/04-deployment.md (la fuente de verdad operativa actual: runbook de alta §6 y §6-bis).
3. docs/features/zernio-messaging.md (la integración Zernio ya implementada) si existe.
4. CHANGELOG.md desde v2.3.0 hacia arriba (la historia real del multitenant) — hojear, no leer entero.
5. supabase/migrations/00025 y 00026 (tenant_id + RLS) y 00035/00036 (rol AIOS + Zernio) — hojear.

REGLAS: conserva la estructura y el tono de cada doc (secciones, tablas); marca ADR-005 como
SUPERSEDED con una nota que apunte al modelo actual en vez de borrar su historia; deja claro en
02-architecture que RLS existe pero ~95% del acceso usa service_role (el aislamiento real es el
filtro tenant_id en cada servicio) y que NO hay middleware central de tenant; documenta la
resolución de tenant por dominio (público), JWT app_metadata.tenant_id (dashboard) y tenant_slug /
MessagingServiceSid / zernio_account_id (webhooks). Twilio queda descrito como proveedor LEGACY de
los 4 tenants viejos y Zernio como el proveedor de los nuevos. Al final: entrada nueva en
CHANGELOG.md (tipo docs) y NO toques ningún archivo fuera de esos 3.
```

---

## P2 — Marcar como legacy la documentación Twilio dispersa (Haiku)

```
Trabajas en el repo RESTAURANTQR. La migración de mensajería Twilio → Zernio ya está implementada
para tenants nuevos (ver docs/features/zernio-messaging.md); los 4 tenants viejos siguen en Twilio
(legacy soportado, sin fecha de apagado). Hay documentación dispersa que menciona Twilio como si
fuera el único proveedor.

TAREA: recorrer TODOS los docs que mencionan Twilio (usa grep -il twilio docs/ para la lista) y en
cada uno, SIN reescribir su contenido: (a) si describe el flujo Twilio como único camino, agrega al
inicio de la sección afectada una nota corta estándar: "⚠️ Twilio es el proveedor LEGACY (tenants
anteriores a sep-2026). Los tenants nuevos usan Zernio — ver docs/features/zernio-messaging.md."; 
(b) si el doc ya es neutral o histórico (auditorías, changelogs), no lo toques; (c) lleva una lista
de qué tocaste y qué no y por qué. Excepciones que NO se tocan: CHANGELOG.md,
docs/requerimientos/*, docs/AUDIT*/. Al final: entrada breve en CHANGELOG.md (tipo docs) con la
lista de archivos anotados.
```

---

## P3 — Checklist operativo por cliente para la ola de 25 altas (Haiku)

```
Trabajas en el repo RESTAURANTQR. En los próximos 12 días entran ~25 clientes nuevos. El alta está
automatizada en dos piezas: el AIOS Constelarys (CRM del dueño, proyecto separado) crea el tenant y
aprovisiona WhatsApp vía Zernio, y quedan pasos manuales inevitables (usuario admin en Supabase
Auth + tenant_id en el JWT, dominio en Vercel, Embedded Signup de Meta que hace el dueño del
restaurante, recarga de billetera).

TAREA: crear docs/operacion/CHECKLIST_ALTA_CLIENTE.md — una checklist imprimible por cliente, en
orden cronológico real, con: columna de responsable (Cada1 / dueño del restaurante / automático),
tiempo estimado por paso, y qué verificar antes de marcarlo hecho. Fuentes de verdad (leer antes,
NO inventar pasos): docs/04-deployment.md §6 y §6-bis, docs/features/zernio-messaging.md,
Level 2.0/aios-constelarys/README.md, scripts/seed-new-tenant.sql (pasos manuales al final del
archivo). Incluye al final una tabla-resumen "los 25" con columnas: cliente, fecha alta, tenant
creado, número Zernio, Embedded Signup, plantillas aprobadas, billetera cargada, dominio, E2E
probado. Entrada en CHANGELOG.md al final.
```

---

## P4 — Redacción de variantes de plantillas WhatsApp (Haiku, con revisión humana)

```
Trabajas en el repo RESTAURANTQR. Las 13 plantillas estándar de WhatsApp están en
docs/PLANTILLAS.md y en scripts/twilio-create-text-templates.mjs / twilio-create-media-templates.mjs
(cuerpos literales con variables {{1}}..{{N}}). Cada texto nuevo requiere aprobación de Meta
(24–72h), así que el copy se decide ANTES de someter.

TAREA: para cada una de las 13 plantillas, redactar 2 variantes de tono ("cálido-cercano" — el
actual — y "elegante-sobrio") × 3 tipos de negocio (restaurant, barbershop, beauty_salon),
manteniendo EXACTAS las mismas variables {{N}} en las mismas posiciones semánticas (no agregues ni
quites variables, no cambies su significado — el código las llena por posición). Entregar en
docs/PLANTILLAS_VARIANTES.md con una tabla por plantilla (tono × negocio) y una nota de cabecera:
"BORRADOR para revisión humana — NADA de esto se somete a Meta sin aprobación del dueño". No
toques ningún script ni sometas nada a ninguna API.
```

---

## P5 — Pulido de UI del AIOS Constelarys (Sonnet)

```
Trabajas SOLO dentro de la carpeta "Level 2.0/aios-constelarys" (CRM interno del dueño de Cada1,
proyecto separado del producto — NO toques nada fuera de esa carpeta). Lee primero su README.md,
CHANGELOG.md y PROMPT_INICIAL.md para entender alcance y límites. El CRM ya funciona (v1: clientes,
pagos, sedes; fase 2/3: conexión al producto + wizard Zernio).

TAREA (solo UI/UX, cero lógica nueva): (1) estados de carga y vacíos consistentes en todas las
pantallas; (2) confirmaciones y toasts de éxito/error uniformes en las Server Actions; (3)
responsive del listado de clientes y el detalle en pantallas chicas; (4) accesibilidad básica
(labels, focus, contraste). Regla dura: no cambies schema, ni Server Actions (solo su feedback
visual), ni dependencias. Verifica con npm run typecheck && npm run lint && npm run build dentro de
la carpeta. Actualiza el CHANGELOG.md del AIOS (entrada patch).
```

---

## Qué NO delegar a modelos baratos

- Cambios en `whatsapp.service.ts`, webhooks, migraciones SQL o cualquier cosa que toque envío
  real de mensajes o aislamiento multi-tenant → sesión con modelo grande + review.
- Decisiones de producto (qué construir, precios, orden de la ola de 25) → el dueño.
- Compras reales en Zernio (números, upgrades) → siempre manual desde el wizard del AIOS con
  confirmación explícita, nunca desde una sesión de IA.
