# AUDITORÍA + REQUERIMIENTO ESTRUCTURADO
## Redenciones de Premios (Tracking Físico) + Importación Masiva de Contactos (Golden Bullet)

> **Fecha auditoría:** 2026-06-12
> **Estado:** Requerimiento listo para desarrollo — NO desarrollado aún
> **Impacto:** DB_SCHEMA + Backend + Frontend + WhatsApp + Dashboard Analytics

---

## PARTE 1 — AUDITORÍA DEL SISTEMA ACTUAL

### 1.1 Hallazgo CRÍTICO: No existe tracking de redención física de premios

**Tablas existentes relevantes:**

| Tabla | Qué registra hoy | Qué NO registra |
|-------|------------------|-----------------|
| `mystery_box_results` | Elección del cliente (safe/mystery), premio ganado, índice, golden box, `created_at` | **NO** registra cuándo el cliente llegó al local y reclamó físicamente el premio |
| `point_transactions` | Puntos otorgados, fuente, balance_after | **NO** registra redenciones (consumo de premios) |
| `visits` | Visitas individuales con source, mesa, mesero, timestamp | **NO** registra si en esa visita se redimió un premio |
| `customers` | total_points, current_tier, total_visits | **NO** registra premios redimidos ni historial de redenciones |

**Consecuencia:**
- El dueño **NO puede** cuadrar con el POS cuántos clientes reclamaron "Bebida gratis" hoy.
- **NO puede** saber a qué hora se redimió para analizar turnos.
- **NO puede** saber cuántos premios de cada tipo entregó este mes.
- El mesero entrega el premio físicamente pero el sistema no tiene trazabilidad de entrega.

**Archivos relevantes a revisar:**
- `src/services/mystery-box.service.ts` — `resolveMysteryBox()` inserta en `mystery_box_results` sin campos de redención
- `src/app/api/mystery-box/resolve/route.ts` — POST que resuelve la caja y envía WhatsApp
- `supabase/migrations/00013_points_mystery_box.sql` — Schema actual de `mystery_box_results`
- `src/types/database.types.ts` — Interface `MysteryBoxResult` sin campos de redención
- `docs/features/points-mystery-box.md` — Diseño original (tampoco contempló redención física)

---

### 1.2 Hallazgo CRÍTICO: Importación CSV actual registra contactos como clientes con marketing=true

**Lo que existe hoy:**
- `/dashboard/customers` tiene botón "Importar CSV" (`src/app/(dashboard)/dashboard/customers/page.tsx:70-135`)
- El importador hace `action: 'register'` con `accepts_marketing: true` AUTOMÁTICAMENTE
- Esto significa que cualquier CSV importado se convierte en cliente con consentimiento de marketing = verdadero
- **Esto es ilegal/riesgoso:** contactos importados de bases de terceros NO han dado consentimiento explícito

**Lo que NO existe hoy:**
- Tabla de "contactos importados" separada de `customers`
- Validación de formato de CSV con instrucciones claras
- Detección de números inválidos/duplicados
- Cálculo de costo de envío basado en cantidad de mensajes × tarifa Twilio
- Bloqueo automático de reenvío a contactos que ya recibieron mensaje y NO se registraron
- Separación clara entre: lead importado → promo directa → si vuelve/registra → se convierte en customer

**Archivos relevantes a revisar:**
- `src/app/(dashboard)/dashboard/customers/page.tsx` — Importador CSV existente (líneas 70-135)
- `src/app/api/dashboard/campaigns/manual/route.ts` — Envío masivo actual con filtros
- `src/services/whatsapp.service.ts` — `sendTemplateMessage()`
- `src/services/campaign.service.ts` — Lógica de caps y filtros
- `src/types/database.types.ts` — Interfaces actuales (no hay tabla de leads/imported)

---

## PARTE 2 — REQUERIMIENTO ESTRUCTURADO

### 2.1 Feature A: Tracking de Redención Física de Premios

#### Objetivo
El dueño/mesero debe poder registrar cuándo un cliente reclama físicamente su premio en el local, para poder:
1. Cuadrar con el POS (cuántas "Bebidas gratis" de fidelización se entregaron)
2. Saber a qué hora se redimió (análisis de turnos)
3. Saber qué mesero atendió la redención
4. Prevenir redenciones duplicadas del mismo premio

#### Cambios en Base de Datos

**Nueva tabla: `reward_redemptions`**

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `customer_id` | `uuid` | NO | - | FK → customers(id) ON DELETE CASCADE |
| `mystery_box_result_id` | `uuid` | SI | NULL | FK → mystery_box_results(id) ON DELETE SET NULL. Si el premio viene de mystery box, link al resultado. |
| `tier_id` | `uuid` | NO | - | FK → reward_tiers(id) ON DELETE RESTRICT |
| `prize_title` | `text` | NO | - | Texto del premio redimido (snapshot, no se borra si cambia el tier) |
| `source` | `text` | NO | `'mystery_box'` | 'mystery_box', 'safe_choice', 'staff_override', 'campaign_reward' |
| `redeemed_at` | `timestamptz` | NO | `now()` | Momento exacto de la redención física |
| `redeemed_by_staff_id` | `uuid` | SI | NULL | FK → staff_users(id) ON DELETE SET NULL. Mesero que registró la redención |
| `table_number` | `integer` | SI | NULL | Mesa donde se redimió |
| `notes` | `text` | SI | NULL | Notas (ej: "cliente cambió bebida por té") |
| `pos_reference` | `text` | SI | NULL | Número de ticket/factura del POS para conciliación |
| `created_at` | `timestamptz` | NO | `now()` | - |

**Índices:**
```sql
CREATE INDEX idx_reward_redemptions_customer ON reward_redemptions (customer_id, redeemed_at DESC);
CREATE INDEX idx_reward_redemptions_staff ON reward_redemptions (redeemed_by_staff_id, redeemed_at DESC);
CREATE INDEX idx_reward_redemptions_date ON reward_redemptions (redeemed_at);
CREATE INDEX idx_reward_redemptions_pos ON reward_redemptions (pos_reference);
```

**RLS:**
```sql
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_redemptions" ON reward_redemptions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "service_insert_redemptions" ON reward_redemptions FOR INSERT WITH CHECK (true);
CREATE POLICY "admin_update_redemptions" ON reward_redemptions FOR UPDATE USING (auth.role() = 'authenticated');
```

**Trigger:** `on_reward_redemptions_insert` → debe prevenir redenciones duplicadas del mismo `mystery_box_result_id` (si no es NULL).

**Nuevos campos en `mystery_box_results`:**
- `redeemed` `boolean` `DEFAULT false` — indica si ya fue canjeado físicamente
- `redeemed_at` `timestamptz` `NULL` — cuándo se canjeó

#### Nuevos Endpoints API

1. **`POST /api/reward-redeem`** — Registrar redención física
   - Body: `{ customer_id, mystery_box_result_id?, tier_id, prize_title, table_number?, notes?, pos_reference?, staff_token? }`
   - Auth: Bearer Staff JWT o X-Device-Token (mismo sistema que staff scan)
   - Validaciones:
     - El cliente existe
     - El `mystery_box_result_id` (si se envía) pertenece al cliente y `redeemed = false`
     - El premio coincide con el título del resultado
   - Acciones:
     - INSERT en `reward_redemptions`
     - UPDATE `mystery_box_results.redeemed = true, redeemed_at = now()` (si aplica)
     - Devuelve el registro creado

2. **`GET /api/dashboard/redemptions`** — Listar redenciones con filtros (Admin Cookie)
   - Query params: `from`, `to`, `staff_id`, `tier_id`, `prize_title`, `page`, `limit`
   - Response paginado con joins a `customers` (nombre, teléfono) y `staff_users` (nombre mesero)

3. **`GET /api/dashboard/redemptions/summary`** — Resumen agrupado para cuadrar con POS
   - Query params: `from`, `to`
   - Response:
     ```json
     {
       "total_redemptions": 45,
       "by_prize": [
         { "prize_title": "Bebida gratis", "count": 25, "estimated_cost": 0 },
         { "prize_title": "Plato fuerte gratis", "count": 3, "estimated_cost": 0 }
       ],
       "by_hour": [
         { "hour": 12, "count": 8 }, { "hour": 13, "count": 15 }, ...
       ],
       "by_staff": [
         { "staff_name": "Carlos", "count": 12 }
       ]
     }
     ```

#### Cambios en Frontend

1. **Nueva página/pestana en Dashboard:** `/dashboard/redemptions`
   - Tabla de redenciones con filtros por fecha, premio, mesero
   - Gráfico de redenciones por hora (heatmap de turnos)
   - Cards de resumen: total hoy, total mes, por premio
   - Botón para cuadrar con POS: exportar CSV con `pos_reference`, `prize_title`, `redeemed_at`

2. **Flujo del Mesero (Staff Scan):**
   - Cuando el mesero escanea el QR del cliente y el cliente tiene un premio pendiente (`mystery_box_results.redeemed = false`), la pantalla del mesero debe mostrar:
     - "⚠️ CLIENTE TIENE PREMIO PENDIENTE: [Bebida gratis]"
     - Botón "Registrar Entrega" que hace POST a `/api/reward-redeem`
   - Esto vincula la redención al `registered_by_staff_id` de la visita actual

3. **Customer Detail Dialog:**
   - Mostrar historial de redenciones del cliente con fechas y premios

#### Archivos a crear/modificar (Feature A)

**Crear:**
- `supabase/migrations/00022_reward_redemptions.sql` — Tabla + índices + RLS + trigger anti-duplicado
- `src/services/redemption.service.ts` — `recordRedemption()`, `getRedemptions()`, `getRedemptionSummary()`, `hasPendingReward(customerId)`
- `src/app/api/reward-redeem/route.ts` — POST para mesero registrar redención
- `src/app/api/dashboard/redemptions/route.ts` — GET listado con filtros (Admin)
- `src/app/api/dashboard/redemptions/summary/route.ts` — GET resumen agrupado
- `src/app/(dashboard)/dashboard/redemptions/page.tsx` — Página del dashboard
- `src/components/dashboard/RedemptionsTable.tsx` — Tabla de redenciones
- `src/components/dashboard/RedemptionSummaryCards.tsx` — Cards de resumen
- `src/components/features/staff/RewardAlert.tsx` — Alerta de premio pendiente en pantalla del mesero

**Modificar:**
- `src/types/database.types.ts` — Agregar `RewardRedemption` interface, actualizar `MysteryBoxResult` con `redeemed`, `redeemed_at`
- `docs/DB_SCHEMA.md` — Documentar nueva tabla
- `docs/API_DOCS.md` — Documentar nuevos endpoints
- `src/app/api/mystery-box/resolve/route.ts` — Opcional: incluir `mystery_box_result_id` en el response para que el cliente lo tenga disponible al mostrar QR
- `src/app/api/check-in/status/route.ts` — Incluir `pending_reward` en response si el cliente tiene un `mystery_box_results` no redimido reciente

---

### 2.2 Feature B: Importación Masiva de Contactos (Golden Bullet)

#### Objetivo
Permitir al dueño importar bases de datos de contactos (2500–9500 registros) desde otros restaurantes o fuentes, validar los números, calcular el costo de envío, y enviar UNA SOLA VEZ un mensaje de WhatsApp con promo directa (no link de registro). Los contactos que NO respondan o NO vuelvan quedan bloqueados para reenvío. Los que sí visitan/piden se incluyen automáticamente en `customers`.

**Principio clave:** Estos contactos NO son clientes registrados. NO han dado consentimiento de marketing. Solo reciben UN mensaje. Si no responden/vuelven, nunca más se les contacta desde esta vía.

#### Cambios en Base de Datos

**Nueva tabla: `imported_contacts`**

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `phone` | `text` | NO | - | Número celular (único) |
| `name` | `text` | SI | NULL | Nombre si viene en el CSV |
| `email` | `text` | SI | NULL | Email si viene |
| `source_file` | `text` | NO | - | Nombre del archivo CSV subido |
| `source_batch` | `text` | NO | - | UUID del lote de importación (agrupa todos los registros de un mismo upload) |
| `status` | `text` | NO | `'pending'` | 'pending', 'valid', 'invalid', 'sent', 'delivered', 'bounced', 'converted', 'blocked' |
| `validation_error` | `text` | SI | NULL | Por qué es inválido (ej: "no es móvil colombiano", "duplicado") |
| `message_sent_at` | `timestamptz` | SI | NULL | Cuándo se envió el mensaje |
| `twilio_sid` | `text` | SI | NULL | SID del mensaje Twilio |
| `converted_to_customer_id` | `uuid` | SI | NULL | FK → customers(id). Si el contacto vuelve y se registra, se llena este campo |
| `campaign_id` | `uuid` | SI | NULL | FK → campaigns(id). Campaña de golden bullet que lo envió |
| `created_at` | `timestamptz` | NO | `now()` | - |

**Índices:**
```sql
CREATE UNIQUE INDEX idx_imported_contacts_phone ON imported_contacts (phone);
CREATE INDEX idx_imported_contacts_batch ON imported_contacts (source_batch, status);
CREATE INDEX idx_imported_contacts_status ON imported_contacts (status);
```

**RLS:**
```sql
ALTER TABLE imported_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_imported_contacts" ON imported_contacts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "service_insert_imported" ON imported_contacts FOR INSERT WITH CHECK (true);
```

**Nuevo campo en `customers`:**
- `imported_contact_id` `uuid` `NULL` `REFERENCES imported_contacts(id) ON DELETE SET NULL` — Si un customer vino de un contacto importado, se llena aquí para trazabilidad.

#### Nuevos Endpoints API

1. **`POST /api/dashboard/imported-contacts/validate`** — Subir y validar CSV (Admin Cookie)
   - Content-Type: `multipart/form-data`
   - Form field: `file` (CSV)
   - **NO inserta nada aún.** Solo parsea y valida.
   - Response:
     ```json
     {
       "batch_id": "uuid-generado",
       "total_rows": 5000,
       "valid": 4820,
       "invalid": 180,
       "invalid_reasons": {
         "duplicado": 45,
         "formato_invalido": 80,
         "no_es_movil_colombiano": 55
       },
       "preview": [
         { "phone": "3001234567", "name": "Juan", "status": "valid" },
         { "phone": "123", "name": "", "status": "invalid", "reason": "formato_invalido" }
       ],
       "estimated_cost_usd": 27.97,
       "estimated_cost_cop": 115700,
       "twilio_cost_per_message": 0.0058
     }
     ```

2. **`POST /api/dashboard/imported-contacts/confirm`** — Confirmar importación y envío (Admin Cookie)
   - Body: `{ batch_id, template_sid, message_preview }`
   - Acciones:
     1. INSERT en `imported_contacts` solo los `valid`
     2. Crear campaña en `campaigns` con `type='manual'`, `source='imported'`
     3. Enviar mensajes en BATCHES de 10 (igual que campañas manuales actuales)
     4. Actualizar `imported_contacts.status = 'sent'`, `message_sent_at`, `twilio_sid`, `campaign_id`
     5. **NUNCA** insertar en `customers` — estos NO son clientes aún
   - Response:
     ```json
     {
       "campaign_id": "uuid",
       "sent": 4820,
       "failed": 12,
       "blocked_auto": 0,
       "total_cost_usd": 27.90
     }
     ```

3. **`GET /api/dashboard/imported-contacts`** — Listar lotes importados (Admin Cookie)
   - Query: `batch_id`, `status`, `page`, `limit`
   - Response paginado

4. **`GET /api/dashboard/imported-contacts/stats`** — Estadísticas por lote
   - Response:
     ```json
     {
       "batch_id": "uuid",
       "total": 4820,
       "sent": 4820,
       "converted": 145,
       "conversion_rate": 3.01,
       "blocked": 0
     }
     ```

5. **Webhook pasivo de registro (OBLIGATORIO para ROI):** Modificar `POST /api/check-in` (action: `register`)
   - Cuando un cliente nuevo se registra, buscar si su `phone` existe en `imported_contacts` con `status = 'sent'`
   - Si existe: `UPDATE imported_contacts SET status='converted', converted_to_customer_id = nuevo_customer_id`
   - OBLIGATORIO: `INSERT` en `customers` debe incluir `imported_contact_id` para trazabilidad
   - Esto activa el cálculo automático de ROI en el dashboard

#### Reglas de Bloqueo Anti-Reenvío (CRÍTICO)

- Si `imported_contacts.status IN ('sent', 'delivered', 'bounced', 'converted', 'blocked')` → NUNCA se puede reenviar mensaje a ese número.
- El endpoint `/api/dashboard/imported-contacts/confirm` debe hacer `SELECT phone FROM imported_contacts WHERE status IN (...)` antes de enviar y excluirlos.
- UI: Si el admin intenta subir un CSV con números ya enviados, mostrar warning: "X números ya fueron contactados previamente y han sido excluidos para evitar bloqueos de Twilio/Meta."
- Los números duplicados dentro del mismo CSV también se bloquean (solo el primero se envía).

#### Plantilla WhatsApp para Golden Bullet

El mensaje debe ser una promo directa, no un link de registro. Ejemplo:

```
¡Hola {{1}}! 👋

Soy [Restaurante] y tenemos algo especial para ti hoy:

🍣 {{2}} — válido solo por esta semana

Pasa por el local o pide a domicilio y menciona esta promo en caja.

📍 Dirección: [Dirección]
📞 Pedidos: [Teléfono]

— [Restaurante]
```

Variables: `{{1}}` = nombre (si existe, si no genérico), `{{2}}` = texto de la promo.

**Importante:** La plantilla debe ser `MARKETING` y aprobada por Meta. NO puede tener link de registro al sistema.

#### Cambios en Frontend

1. **Nueva página en Dashboard:** `/dashboard/imported-contacts`
   - **Paso 1 — Subir CSV:** Drag & drop o input file. Instrucciones claras de formato.
   - **Paso 2 — Validación:** Muestra preview de los primeros 10 registros, conteo de válidos/inválidos, gráfico de razones de invalidación.
   - **Paso 3 — Costo:** Muestra "Costo estimado de envío: $X USD ($Y COP) basado en Z contactos válidos × tarifa Twilio". Incluye saldo actual de Twilio.
   - **Paso 4 — Plantilla y mensaje:** Dropdown de plantillas Twilio aprobadas tipo MARKETING. Preview del mensaje con variables.
   - **Paso 5 — Confirmar envío:** Checkbox "Entiendo que estos contactos no han dado consentimiento y solo recibirán este mensaje". Botón "Enviar Golden Bullet".
   - **Pestaña Historial:** Lista de lotes enviados con estadísticas de conversión.

2. **Instrucciones de formato CSV (UI):**
   - Columnas aceptadas: `telefono` (requerido), `nombre` (opcional), `email` (opcional)
   - Formato teléfono: móvil colombiano, ej: `3001234567` o `+573001234567`
   - Codificación: UTF-8
   - Delimitador: coma
   - Ejemplo descargable: `plantilla_golden_bullet.csv`

3. **Navigation/Sidebar:**
   - Agregar ítem "Golden Bullet" en el sidebar del dashboard con icono `Zap` o `Crosshair`
   - Puede estar bajo "Campañas" o como ítem independiente

#### Apartado ROI Automático (Dashboard `/dashboard/imported-contacts/roi`)

Una subpestaña o sección dentro de `/dashboard/imported-contacts` que muestre métricas de conversión SIN acción manual del usuario. Todo se calcula con joins entre `imported_contacts` y `customers`.

**Cards automáticas (por lote):**

| Métrica | Fuente de datos |
|---------|-----------------|
| Contactos enviados | `COUNT(*) FROM imported_contacts WHERE source_batch = X AND status IN ('sent', 'delivered', 'converted')` |
| Convertidos a clientes | `COUNT(*) WHERE status = 'converted'` + join `customers` para ver `total_visits` |
| Tasa de conversión | `convertidos / enviados * 100` |
| Visitas totales generadas | `SUM(c.total_visits) FROM customers c JOIN imported_contacts ic ON c.imported_contact_id = ic.id WHERE ic.source_batch = X` |
| Ingreso estimado | `visitas_totales * admin_settings.avg_ticket` |
| Costo de campaña | `enviados * twilio_cost_per_message` |
| ROI neto | `ingreso_estimado - costo` |
| Múltiplo de retorno | `ingreso_estimado / costo` |

**Nuevo endpoint:**

6. **`GET /api/dashboard/imported-contacts/roi`** — ROI por lote (Admin Cookie)
   - Query: `batch_id` (requerido)
   - Lógica SQL:
     ```sql
     SELECT
       COUNT(*) FILTER (WHERE status IN ('sent','delivered','converted')) as enviados,
       COUNT(*) FILTER (WHERE status = 'converted') as convertidos,
       COALESCE(SUM(c.total_visits), 0) as visitas_generadas
     FROM imported_contacts ic
     LEFT JOIN customers c ON c.imported_contact_id = ic.id
     WHERE ic.source_batch = :batch_id
     ```
   - Cruza con `admin_settings` (`avg_ticket`) y `campaigns` (costo real) para calcular ingreso y ROI
   - Response:
     ```json
     {
       "batch_id": "uuid",
       "enviados": 4820,
       "convertidos": 145,
       "conversion_rate": 3.01,
       "visitas_generadas": 312,
       "avg_ticket": 35000,
       "ingreso_estimado_cop": 10920000,
       "costo_campana_cop": 115700,
       "roi_neto_cop": 10804300,
       "multiplo_retorno": 94.3
     }
     ```

**Frontend del apartado ROI:**
- Cards de KPIs en la parte superior (enviados, convertidos, tasa, visitas, ingreso)
- Comparador de lotes: gráfico de barras comparando conversión entre diferentes campañas Golden Bullet
- Tabla detallada: cada contacto convertido con nombre, teléfono, fecha de registro, visitas acumuladas
- Filtros por rango de fechas de importación

#### Archivos a crear/modificar (Feature B)

**Crear:**
- `supabase/migrations/00023_imported_contacts.sql` — Tabla + índices + RLS + campo `customers.imported_contact_id`
- `src/services/imported-contacts.service.ts` — `validateCSV()`, `importBatch()`, `getBatchStats()`, `markConverted(phone, customerId)`
- `src/app/api/dashboard/imported-contacts/validate/route.ts` — POST validar CSV
- `src/app/api/dashboard/imported-contacts/confirm/route.ts` — POST confirmar y enviar
- `src/app/api/dashboard/imported-contacts/route.ts` — GET listar
- `src/app/api/dashboard/imported-contacts/stats/route.ts` — GET estadísticas
- `src/app/(dashboard)/dashboard/imported-contacts/page.tsx` — Página principal
- `src/components/dashboard/ImportedContactsUploader.tsx` — Componente de upload + validación
- `src/components/dashboard/ImportedContactsCostEstimator.tsx` — Componente de cálculo de costo
- `src/components/dashboard/ImportedContactsHistory.tsx` — Tabla de lotes enviados
- `public/plantilla_golden_bullet.csv` — Template de CSV descargable

**Modificar:**
- `src/types/database.types.ts` — Agregar `ImportedContact` interface
- `src/app/api/check-in/route.ts` — En `action: 'register'`, detectar si el phone existe en `imported_contacts` y marcar como `converted`
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — Considerar agregar tab o link a Golden Bullet
- `src/components/layout/DashboardSidebar.tsx` — Agregar link de navegación
- `docs/DB_SCHEMA.md` — Documentar nueva tabla
- `docs/API_DOCS.md` — Documentar nuevos endpoints
- `docs/features/golden-bullet.md` — Documento de feature (crear antes de codear según método AInnovate)

---

## PARTE 3 — GUÍA PARA LA IA DESARROLLADORA

### Orden de lectura OBLIGATORIA (antes de tocar código)

1. `docs/01-project-overview.md` — Visión, stack, estado
2. `docs/02-architecture.md` — Estructura de carpetas, convenciones
3. `docs/DB_SCHEMA.md` — Schema actual completo
4. `docs/API_DOCS.md` — Convenciones de endpoints, auth
5. `docs/features/points-mystery-box.md` — Contexto del sistema de premios actual
6. Este archivo (`REQUIREMENT_AUDIT_redemptions_bulk_import.md`)

### Archivos que DEBE buscar y leer primero

| Feature | Archivos clave |
|---------|---------------|
| **Feature A (Redenciones)** | `src/services/mystery-box.service.ts`, `src/app/api/mystery-box/resolve/route.ts`, `src/app/api/check-in/status/route.ts`, `src/types/database.types.ts`, `supabase/migrations/00013_points_mystery_box.sql` |
| **Feature B (Golden Bullet)** | `src/app/(dashboard)/dashboard/customers/page.tsx` (ver importador CSV existente líneas 70-135), `src/app/api/dashboard/campaigns/manual/route.ts`, `src/services/whatsapp.service.ts`, `src/services/campaign.service.ts`, `src/components/layout/DashboardSidebar.tsx` |

### Convenciones a seguir

- **NO crear** tablas fuera de `supabase/migrations/`
- **NO modificar** `customers` sin respetar RLS existente
- **NO hardcodear** secretos (todo por variables de entorno)
- **Tipar todo** con TypeScript, cero `any`
- **Feature flag:** Para Feature B, agregar `golden_bullet_enabled` en `admin_settings`
- **Batch size:** Usar 10 mensajes por batch (igual que campañas manuales)
- **Mensajes:** Usar `sendTemplateMessage()` de `src/services/whatsapp.service.ts` (solo plantillas aprobadas)

### Dependencias entre features

- Feature A y Feature B son **independientes** — pueden desarrollarse en paralelo
- Si se hacen secuencialmente: Feature A primero, luego B

### Checklist antes de entregar

- [ ] Migraciones SQL ejecutables sin errores
- [ ] `tsc --noEmit` pasa limpio
- [ ] Endpoints documentados en `docs/API_DOCS.md`
- [ ] Schema documentado en `docs/DB_SCHEMA.md`
- [ ] CHANGELOG.md actualizado
- [ ] Nuevo archivo de feature creado en `docs/features/` (redemption-tracking.md y/o golden-bullet.md)
- [ ] UI consistente con shadcn/ui + TailwindCSS
- [ ] RLS correcto en tablas nuevas
- [ ] Sin credenciales hardcodeadas

---

*Documento generado por auditoría del sistema — NO MODIFICAR sin actualizar esta fecha*
