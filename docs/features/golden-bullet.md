# Feature: Golden Bullet (Importación Masiva de Contactos)

> **Versión:** v2.0.0 — 2026-06-12
> **Estado:** ✅ Implementado (detrás de feature flag)
> **Migración:** `00023_imported_contacts.sql`

## Objetivo
Importar bases de contactos externas (2.500–9.500 registros), validarlas, calcular el
costo de envío y disparar **UN solo** mensaje de WhatsApp con una promo directa (no link
de registro). Los contactos que no respondan/vuelvan quedan bloqueados para reenvío. Los
que sí visitan se convierten automáticamente en `customers` y alimentan el ROI.

**Principio clave:** estos contactos NO son clientes y NO han dado consentimiento de
marketing. Por eso viven en `imported_contacts`, separados de `customers`, y reciben un
único mensaje.

## Modelo de datos

### Tabla `imported_contacts`
`phone` (único), `name?`, `email?`, `source_file`, `source_batch` (UUID del lote),
`status` (`pending`|`valid`|`invalid`|`sent`|`delivered`|`bounced`|`converted`|`blocked`),
`validation_error?`, `message_sent_at?`, `twilio_sid?`, `converted_to_customer_id?`,
`campaign_id?`.

### Columna nueva en `customers`
- `imported_contact_id uuid NULL` → trazabilidad cuando un contacto importado se registra.

## Reglas anti-reenvío (CRÍTICO)
- Un teléfono que **ya existe** en `imported_contacts` NUNCA se vuelve a contactar
  (evita bloqueos de Twilio/Meta). Se excluye tanto en `validate` como (de nuevo) en `confirm`.
- Los duplicados dentro del mismo CSV se descartan (solo el primero cuenta).

## Flujo (wizard de 5 pasos)
1. **Subir CSV** — columnas `telefono` (req), `nombre`, `email`.
2. **Validar** — `POST /validate` parsea y valida **sin insertar**; devuelve conteos, razones de invalidación, preview y la lista de válidos.
3. **Costo** — `valid × tarifa` (USD/COP) + saldo Twilio.
4. **Plantilla** — dropdown de plantillas Twilio `MARKETING` aprobadas. `{{1}}`=nombre, `{{2}}`=promo.
5. **Confirmar** — checkbox de consentimiento → `POST /confirm`: inserta los válidos, crea campaña (`source='manual'`), envía en batches de 10, marca `sent`/`bounced`.

### Conversión (ROI)
Cuando un contacto importado se registra (`/api/check-in` action `register`),
`markConverted()` lo marca `converted` y guarda `customers.imported_contact_id`. El ROI
se calcula con join `imported_contacts ↔ customers` (visitas × `avg_ticket` vs. costo).

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/dashboard/imported-contacts/validate` | Admin + flag | Validar CSV (multipart `file`), sin insertar |
| POST | `/api/dashboard/imported-contacts/confirm` | Admin + flag | Insertar + enviar. Body: `{ batch_id, source_file, template_sid, promo_text, fallback_name?, contacts[] }` |
| GET | `/api/dashboard/imported-contacts` | Admin | Lotes (resumen) o contactos de un `batch_id` |
| GET | `/api/dashboard/imported-contacts/stats` | Admin | Estadísticas por `batch_id` |
| GET | `/api/dashboard/imported-contacts/roi` | Admin | ROI por `batch_id` |

> **Nota de implementación:** `confirm` recibe los `contacts` validados desde el cliente
> (el paso `validate` no persiste nada, por requerimiento). Esto evita un store temporal
> servidor; el bloqueo anti-reenvío se re-aplica en `confirm` contra la DB.

## Feature flag y costo
- `admin_settings.golden_bullet_enabled` (`'true'`/`'false'`, default `false`).
- `admin_settings.twilio_cost_per_message_usd` (default `0.0175`, Meta+Twilio).

## Plantilla WhatsApp
Debe ser `MARKETING` aprobada por Meta y **sin link de registro**. `{{1}}`=nombre (o genérico),
`{{2}}`=texto de la promo.

## Archivos
- `supabase/migrations/00023_imported_contacts.sql`
- `src/services/imported-contacts.service.ts`
- `src/app/api/dashboard/imported-contacts/{route,validate,confirm,stats,roi}.ts`
- `src/app/(dashboard)/dashboard/imported-contacts/page.tsx`
- `src/components/dashboard/ImportedContactsUploader.tsx`, `ImportedContactsCostEstimator.tsx`, `ImportedContactsHistory.tsx`
- `public/plantilla_golden_bullet.csv`
- Wiring: `src/app/api/check-in/route.ts` (conversión), `src/components/layout/DashboardSidebar.tsx`
