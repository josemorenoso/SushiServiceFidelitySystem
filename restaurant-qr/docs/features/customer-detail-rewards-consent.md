# Feature: Customer Detail + Rewards CRUD + Consent + Frequency Cap (v0.18.0)

> **Fecha:** 2026-04-15
> **Estado:** ✅ Implementado
> **Versión:** 0.18.0

---

## Descripción

Conjunto de features enfocadas en gestión de clientes, sistema de recompensas, consentimiento de comunicaciones y frequency capping:

1. **Customer Detail Dialog** — Ver perfil completo del cliente desde cualquier lista
2. **Asignar visitas** — Admin agrega N visitas manualmente con razón
3. **Rewards CRUD** — Crear, eliminar y activar/desactivar recompensas con auto-template
4. **Consentimiento de comunicaciones** — Checkbox en registro público + campo `accepts_marketing`
5. **Frequency capping** — 7 días entre campañas marketing por cliente, no afecta seguimiento
6. **Opt-out badge** — Icono en lista de clientes para quienes no aceptan marketing

---

## 1. Customer Detail Dialog

**Componente:** `src/components/dashboard/CustomerDetailDialog.tsx`

**Integrado en:**
- `dashboard/page.tsx` (PowerRanking → click en fila)
- `dashboard/customers/page.tsx` (Tabla → click en fila)

**Muestra:**
- Nombre, teléfono, ciudad, cumpleaños
- Tier (con gradiente y emoji)
- Total visitas, días sin venir, canal (QR/Delivery/Both)
- Próxima recompensa (via API)
- Estado de marketing (acepta / no acepta)
- Timestamps (registro, última visita)
- Formulario para asignar visitas (cantidad + razón)

**APIs usadas:**
- `GET /api/dashboard/customers/:id` — Detalle del cliente
- `GET /api/dashboard/customers/:id/next-reward` — Próxima recompensa
- `POST /api/dashboard/check-in-override` — Asignar visita (loop para múltiples)

---

## 2. Rewards CRUD

**Página:** `src/app/(dashboard)/dashboard/rewards/page.tsx`

**Funcionalidad:**
- Tabla con todas las recompensas ordenadas por milestone
- Botón "Nueva Recompensa" → Dialog con:
  - Input: Visita # + Premio
  - Auto-genera template de WhatsApp
  - Vista previa del mensaje en tiempo real
- Toggle activar/desactivar (PATCH)
- Eliminar con confirmación (DELETE)
- Validación de milestone duplicado (409)

**Template auto-generado:**
```
¡Felicidades {{name}}! 🎉 Has completado tu visita #N a Sushi Service.
Como agradecimiento, te has ganado: [premio]. ¡Reclama tu premio en tu próxima visita! 🍣
```

**APIs:**
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/dashboard/rewards` | Lista todas |
| POST | `/api/dashboard/rewards` | Crea con auto-template |
| PATCH | `/api/dashboard/rewards` | Toggle `is_active` |
| DELETE | `/api/dashboard/rewards?id=X` | Elimina |

---

## 3. Consentimiento de comunicaciones

**Registro público** (`CheckInForm.tsx`):
- Checkbox pre-marcado: "Acepto ser parte de la familia y recibir regalos, recompensas y comunicaciones por WhatsApp"
- Se envía como `accepts_marketing` al API de check-in
- Default: `true` (si no desmarca)

**Base de datos:**
- Campo: `customers.accepts_marketing` (boolean, NOT NULL, default true)
- Migración: `00008_accepts_marketing.sql`
- Backfill: todos los existentes → true

**Visualización admin:**
- Lista de clientes: icono `MessageCircleOff` rojo al lado del nombre
- CustomerDetailDialog: badge verde/rojo con estado

---

## 4. Frequency Capping

**Campañas marketing (manuales):**
- `FREQUENCY_CAP_DAYS = 7` en `campaigns/manual/route.ts`
- Filtra clientes donde `last_campaign_at` < 7 días
- Actualiza `last_campaign_at` después de enviar

**Cron birthday:**
- NO usa `last_campaign_at` (transaccional)
- Usa `hasRecentCampaignMessage(id, 'birthday', 365)`

**Cron reactivation:**
- NO usa `last_campaign_at` (seguimiento)
- Usa `hasRecentCampaignMessage(id, 'reactivation', 30)`
- SÍ filtra `accepts_marketing=true` (es marketing)

**Resultado:** Marketing respeta 7 días. Seguimiento y cumpleaños no se ven afectados.

---

## 5. Auto-exclusión de opted-out

Campañas que filtran `accepts_marketing=true`:
- `POST /api/dashboard/campaigns/manual`
- `GET /api/dashboard/campaigns/estimate`
- `findInactiveCustomers()` en campaign.service.ts

Campañas que NO filtran (transaccional):
- `GET /api/cron/birthday`

---

## Base de datos

- **Campo nuevo:** `customers.accepts_marketing` (boolean, default true)
- **Migración:** `supabase/migrations/00008_accepts_marketing.sql`
- Ver `docs/DB_SCHEMA.md` para detalle completo

---

## Pendiente relacionado

- Webhook STOP de WhatsApp → marcar `accepts_marketing=false` automáticamente
- Dashboard público `/mi-cuenta/{uuid}` (analizado, no construido)
