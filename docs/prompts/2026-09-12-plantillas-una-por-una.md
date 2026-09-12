# Prompt — Plantillas de Zernio una por una desde el panel del producto (urgente, 2026-09-12)

> Pegar entero en una sesión nueva de Claude Code abierta en la raíz del repo del producto.
> Contexto de origen: Planeta Wings (coexistencia, Zernio) creó 13 plantillas desde el AIOS y el
> dueño no tiene forma de crearlas ni seguirlas de a una desde el panel. Ver `docs/PENDIENTES-PLANTILLAS.md`.

---

Leé `ESTADO.md` entero, anotá tu fila en §2 y commiteála sola antes de tocar nada (CLAUDE.md § "Cada sesión").
Después leé `docs/PENDIENTES-PLANTILLAS.md` (diagnóstico cerrado, §1.1–§1.4) y `docs/features/whatsapp-templates.md`.

## Qué hay que construir

El dueño quiere **crear y seguir las plantillas de WhatsApp de un tenant Zernio de a una, desde
Dashboard › Plantillas del producto**, sin depender del paso 4 del AIOS. Esa pantalla YA existe
(`src/app/(dashboard)/dashboard/templates/page.tsx` → `TemplateCatalogEditor`, servicio en
`src/services/template.service.ts`, Zernio en `src/lib/zernio/templates.ts`), pero hoy tiene tres
huecos que la hacen inútil para un tenant que el AIOS ya dio de alta. Cerrá los tres, en este orden:

### 1. El editor tiene que reconocer lo que YA existe en la WABA
Hoy `nextProviderRef()` elige el nombre mirando solo `template_versions` del producto. Si el AIOS ya creó
`evento_video` en la WABA, el producto intenta crear `evento_video` otra vez, Meta lo rechaza por nombre
repetido y queda una fila `failed`. Además, esas 13 se ven como «Activo, pero se configuró fuera de este
panel y no tenemos su texto» (`adoptedRef`) — verificado en PENDIENTES §1.1.

- Al cargar el catálogo (`getTemplateCatalogState`), listar la WABA con `listZernioTemplates(accountId)`
  (`src/lib/zernio/messaging.ts:108`, ya verificado contra Zernio) y **adoptar** cada plantilla del
  catálogo que exista allí con nombre base o `_vN`: crear la fila en `template_versions` con
  `provider_ref`, `status` real (`PENDING`/`APPROVED`/`REJECTED` + motivo) y el texto del catálogo
  estándar (`src/lib/template-texts.ts`, sin emojis horneados: hay un test que lo vigila).
- `nextProviderRef()` pasa a mirar la unión de `template_versions` + nombres de la WABA (misma regla que
  `nextFreeName()` del AIOS: base, `_v2`, `_v3`…).
- El botón «Enviar a Meta» se muestra **por plantilla**, con su estado al lado, y un «Actualizar estado»
  por plantilla que llame a `refreshTemplateStatusFromProvider()` (ya existe, línea ~776). Un
  `REJECTED` se muestra en rojo con el motivo: nunca «pendiente para siempre».

### 2. Las dos claves que el catálogo no cubre
`tier_unlocked_template_sid` y `reward_reminder_template_sid` las consume el código (PENDIENTES §1.2) y
ninguna pantalla Zernio las puede crear. Agregalas a `src/lib/template-catalog.ts` con texto en
`template-texts.ts` (variables `{{n}}` fijas: el contrato de `template-catalog.ts` no se cambia) y
al espejo del AIOS (`Level 2.0/aios-constelarys/src/lib/zernio/templates-catalog.ts`) con el MISMO texto.
Sin esto, en Zernio el cruce de nivel es silencio total.

### 3. Que Ajustes › Plantillas no mienta a un tenant Zernio
En un tenant Zernio esa sección consulta `/api/dashboard/templates` (Twilio), recibe `[]` y dice «No hay
plantillas aprobadas» (PENDIENTES §1.3). Que en Zernio esa sección muestre el estado del catálogo y
enlace a Dashboard › Plantillas, y no los 13 dropdowns.

## Guardrails que no se negocian (CLAUDE.md)
- `promoteVersion()` es el ÚNICO escritor de `admin_settings.*_template_sid`; `fillEmptyPointer()` solo
  rellena vacíos. La adopción del punto 1 NO escribe punteros: el puntero lo pone `promoteVersion()`
  cuando el estado pasa a `APPROVED` (por refresco o por el webhook `whatsapp.template.status_updated`,
  que hoy descarta lo del AIOS con `handled: false, "sin versión registrada"` — con las filas adoptadas
  deja de descartarlo, verificalo con un test).
- Todo INSERT lleva `tenant_id` explícito (la 00030 nunca se aplicó).
- `src/constants/messaging.ts` es espejo de `message_class_map`: si agregás clase, los dos lados.
- Nada de Twilio se toca: los 4 tenants Twilio siguen viendo `TwilioTemplateManager` idéntico.
- Si hace falta migración: `node scripts/proxima-migracion.mjs` y el número en tu fila de §2.
- Ningún servicio externo se dispara en tests: mockeá `listZernioTemplates` / `createZernioTemplate`.

## Cómo se prueba
- `npx vitest run tests/**/template*` + los que agregues: adopción con nombre base y `_v2`, colisión de
  nombre resuelta, `REJECTED` con motivo visible, webhook que ahora sí encuentra la versión.
- Manual con Planeta Wings (tenant Zernio, 13 en la WABA «En revisión» desde el 2026-09-12 00:17 UTC):
  al abrir Plantillas se ven las 13 con su estado real, ninguna como «configurada fuera de este panel».

## Al cerrar
`npx tsc --noEmit` · `npm run lint` · vitest de lo tuyo · `CHANGELOG.md` (≤15 líneas) ·
`docs/features/whatsapp-templates.md` si cambió el comportamiento · borrá tu fila de §2 ·
commit de TUS archivos por nombre. **Push y deploy los ordena el dueño.**
