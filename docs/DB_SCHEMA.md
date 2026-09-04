# Esquema de Base de Datos

**Base de datos:** Supabase (PostgreSQL)
**Última actualización:** 2026-07-11

---

## Diagrama ER

```mermaid
erDiagram
    %% Actualizar con cada nueva tabla
    %% Incluir relaciones FK
    
    customers {
        uuid id PK
        string phone UK
        string name
        date birthday
        string city
        int total_visits
        timestamp last_visit_at
        timestamp created_at
        timestamp updated_at
    }

    visits {
        uuid id PK
        uuid customer_id FK
        string source
        text notes
        timestamp created_at
    }

    rewards {
        uuid id PK
        int visit_milestone
        string title
        text message_template
        boolean is_active
        timestamp created_at
    }

    campaigns {
        uuid id PK
        string name
        string type
        string status
        text message_template
        jsonb filters
        int total_sent
        timestamp scheduled_at
        timestamp executed_at
        timestamp created_at
    }

    campaign_messages {
        uuid id PK
        uuid campaign_id FK
        uuid customer_id FK
        string status
        string twilio_sid
        timestamp sent_at
    }

    authorized_numbers {
        uuid id PK
        string phone UK
        string name
        boolean is_active
        timestamp created_at
    }

    admin_settings {
        text key PK
        text value
        timestamp updated_at
    }

    message_logs {
        uuid id PK
        uuid customer_id FK
        string phone
        string message_type
        string template_sid
        string status
        string twilio_sid
        string error_code
        timestamp sent_at
        timestamp delivered_at
        timestamp created_at
    }

    campaign_rewards {
        uuid id PK
        uuid tenant_id FK
        text title
        text description
        boolean is_active
        timestamp created_at
    }

    reward_grants {
        uuid id PK
        uuid tenant_id FK
        uuid customer_id FK
        text grant_type
        text source
        text prize_title
        uuid tier_id FK
        uuid mystery_box_result_id FK
        uuid campaign_reward_id FK
        uuid campaign_id FK
        text status
        timestamp expires_at
        timestamp reminder_sent_at
        timestamp granted_at
        timestamp redeemed_at
        timestamp created_at
    }

    customers ||--o{ visits : "has many"
    customers ||--o{ campaign_messages : "receives"
    customers ||--o{ message_logs : "receives"
    customers ||--o{ reward_grants : "owns"
    campaigns ||--o{ campaign_messages : "sends"
    campaign_rewards ||--o{ reward_grants : "catalogs"
    staff_users ||--o{ visits : "registers"
    staff_users ||--o{ staff_devices : "owns"
```

---

## Índice de Tablas

| # | Tabla | Descripción | RLS | Políticas |
|---|-------|-------------|-----|-----------|
| 1 | [customers](#customers) | Clientes del restaurante | SI | Admin: CRUD completo |
| 2 | [visits](#visits) | Historial de visitas | SI | Admin: CRUD completo |
| 3 | [rewards](#rewards) | Configuración de recompensas por meta | SI | Admin: CRUD completo |
| 4 | [campaigns](#campaigns) | Campañas de marketing | SI | Admin: CRUD completo |
| 5 | [campaign_messages](#campaign_messages) | Mensajes enviados por campaña | SI | Admin: lectura |
| 6 | [authorized_numbers](#authorized_numbers) | Números de meseros autorizados | SI | Admin: CRUD completo |
| 7 | [admin_settings](#admin_settings) | Configuración del admin (key-value) | SI | Admin: SELECT, INSERT, UPDATE |
| 8 | [restaurant_events](#restaurant_events) | Calendario operativo de eventos/promos con media | SI | Admin: CRUD completo |
| 9 | [restaurant_locations](#restaurant_locations) | **LA SEDE** del negocio (dejó de ser solo la geocerca): subdominio, ficha de Google, meseros y atribución | SI | Tenant: ALL (`tenant_all_restaurant_locations`, 00026) |
| 10 | [staff_users](#staff_users) | Cuentas de meseros (login con PIN) | SI | Service: ALL (backend maneja auth) |
| 11 | [staff_devices](#staff_devices) | Dispositivos de confianza registrados por supervisor | SI | Service: ALL |
| 12 | [message_logs](#message_logs) | Tracking de TODOS los mensajes WhatsApp (transaccionales + campañas) | SI | Admin: lectura; Service: INSERT/UPDATE |
| 13 | [campaign_rewards](#campaign_rewards) | Catálogo editable de premios de campaña (reactivación, referidos, promos) | SI | Admin: CRUD completo (vía service role, filtrado por tenant en código) |
| 14 | [reward_grants](#reward_grants) | El premio otorgado: pertenece a un cliente, pendiente de reclamar | SI | Admin: CRUD completo (vía service role, filtrado por tenant en código) |
| 15 | [review_events](#review_events) | Funnel del pop-up de reseñas de Google: mostrado → click → pospuesto | SI | Admin: CRUD completo (vía service role, filtrado por tenant en código) |
| 16 | [message_class_map](#message_class_map) | Catalogo: message_type -> clase de presupuesto + prioridad de cola | SI | Lectura publica (catalogo global) |
| 17 | [send_reservations](#send_reservations) | Ventana rodante de 24h: la contabilidad del limite de Meta | SI | Admin: CRUD (via service role, filtrado por tenant en codigo) |
| 18 | [send_queue](#send_queue) | Cola de goteo de envios que no cupieron hoy | SI | Admin: CRUD (via service role, filtrado por tenant en codigo) |
| 19 | [line_health_snapshots](#line_health_snapshots) | Historial de quality rating y limite de cada linea | SI | Admin: CRUD (via service role, filtrado por tenant en codigo) |
| 20 | [consent_events](#consent_events) | Libro de evidencia de opt-in/opt-out. **APPEND-ONLY** | SI | SELECT + INSERT unicamente; UPDATE/DELETE revocados |
| 21 | [point_transactions](#point_transactions) | Movimientos de puntos (el libro mayor del motor de puntos) | SI | Admin: SELECT; Service: SELECT/INSERT |
| 22 | [tenant_wallet_transactions](#tenant_wallet_transactions) | Billetera prepagada COP por tenant: recargas, ajustes y débitos | SI | Super admin: ALL |
| 23 | [template_versions](#template_versions) | Versiones de cada plantilla del catálogo: la vigente, la pendiente de Meta y el historial | SI | Admin: CRUD (vía service role, filtrado por tenant en código) |

---

## Tablas

### customers

> Almacena los datos de los clientes del restaurante.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `phone` | `text` | NO | - | Número celular (único, formato: 3XXXXXXXXX) |
| `name` | `text` | NO | - | Nombre del cliente |
| `birthday` | `date` | SI | `NULL` | Fecha de nacimiento |
| `city` | `text` | SI | `NULL` | Ciudad del cliente |
| `total_visits` | `integer` | NO | `0` | Contador total de visitas |
| `last_visit_at` | `timestamptz` | SI | `NULL` | Fecha de última visita |
| `source_channels` | `text` | NO | `'qr'` | Origen del cliente: 'qr', 'delivery' o 'both' |
| `last_campaign_at` | `timestamptz` | SI | `NULL` | Fecha de última campaña recibida (frequency cap) |
| `accepts_marketing` | `boolean` | NO | `true` | Si el cliente acepta comunicaciones de marketing |
| `whatsapp_opt_out_at` | `timestamptz` | SI | `NULL` | Último opt-out de WhatsApp (respondió SALIR/STOP/BAJA o Twilio rechazó por 21610/63016). NULL = puede recibir. Se limpia con opt-in (ALTA/START). |
| `checkin_lat` | `numeric(10,8)` | SI | `NULL` | Última latitud de check-in |
| `checkin_lon` | `numeric(11,8)` | SI | `NULL` | Última longitud de check-in |
| `checkin_distance_meters` | `integer` | SI | `NULL` | Distancia al local en el último check-in (metros) |
| `imported_contact_id` | `uuid` | SI | `NULL` | FK → imported_contacts(id) ON DELETE SET NULL. Trazabilidad si el cliente vino de un contacto importado (Golden Bullet, migración 00023) |
| `google_review_clicked_at` | `timestamptz` | SI | `NULL` | **Nueva (00032).** El cliente fue al link de reseñas de Google → **nunca más** se le muestra el pop-up (R6.b). Es el gate: lo lee `getReviewPromptState()` |
| `google_review_postponed_at` | `timestamptz` | SI | `NULL` | **Nueva (00032).** Tocó "La próxima lo hago" → **sí** se le vuelve a mostrar, en su próximo check-in. Informativo: el gate NO lo consulta |
| `origin_location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede donde se REGISTRÓ el cliente (D2). Corregible solo por el admin de marca. NULL = sede desconocida (todo el histórico). FK **compuesta** `(origin_location_id, tenant_id)` → `restaurant_locations(id, tenant_id)` ON DELETE **RESTRICT** |
| `last_visit_location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Caché de la sede de la última visita ("sede de casa"). Derivable de `visits`, se guarda por velocidad. La verdad canónica de "los clientes de una sede" será la vista `customer_location_membership` (00046, F5), no esta columna. Misma FK compuesta RESTRICT |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación |
| `updated_at` | `timestamptz` | NO | `now()` | Última actualización |

> **Multi-sede (00043):** `customers_phone_tenant_key UNIQUE (phone, tenant_id)` **NO se toca**. Un tenant
> es una MARCA, así que sigue habiendo **una fila por persona y marca** — y por eso los puntos, el tier y
> las visitas quedan unificados entre sedes sin escribir una línea de código. Las dos columnas de sede
> DESCRIBEN al cliente, no lo parten.

> **Por qué la memoria de la reseña vive en la DB y no en el navegador:** el check-in del cliente es
> *stateless* (cero `localStorage`, cero cookies) y el cliente se identifica **solo por teléfono**. Una
> bandera en el navegador se rompería en cuanto abriera su tarjeta desde otro celular.

**Índices:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `customers_pkey` | `id` | PRIMARY KEY |
| `customers_phone_key` | `phone` | UNIQUE |
| `idx_customers_checkin_location` | `(checkin_lat, checkin_lon)` | BTREE (parcial: WHERE checkin_lat IS NOT NULL) |
| `idx_customers_whatsapp_opt_out` | `whatsapp_opt_out_at` | BTREE (parcial: WHERE whatsapp_opt_out_at IS NOT NULL) |
| `idx_customers_origin_location_id` | `(tenant_id, origin_location_id)` | BTREE (parcial: WHERE origin_location_id IS NOT NULL) |
| `idx_customers_last_visit_location_id` | `(tenant_id, last_visit_location_id)` | BTREE (parcial: WHERE last_visit_location_id IS NOT NULL) |

**Políticas RLS:**

```sql
-- Admins pueden ver todos los clientes
CREATE POLICY "admin_select_customers" ON customers
    FOR SELECT USING (auth.role() = 'authenticated');

-- Admins pueden insertar clientes
CREATE POLICY "admin_insert_customers" ON customers
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Admins pueden actualizar clientes
CREATE POLICY "admin_update_customers" ON customers
    FOR UPDATE USING (auth.role() = 'authenticated');
```

**Triggers:**

| Nombre | Evento | Función |
|--------|--------|---------|
| `on_customers_updated` | BEFORE UPDATE | `handle_updated_at()` |

---

### visits

> Registro individual de cada visita de un cliente.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `customer_id` | `uuid` | NO | - | FK a customers |
| `source` | `text` | NO | `'qr'` | Origen: 'qr', 'delivery' o 'staff_scan' |
| `notes` | `text` | SI | `NULL` | Notas adicionales |
| `address` | `text` | SI | `NULL` | Dirección (domicilios) |
| `payment_method` | `text` | SI | `NULL` | Método de pago (domicilios) |
| `amount` | `numeric` | SI | `NULL` | Monto total del pedido (domicilios) |
| `raw_message` | `text` | SI | `NULL` | Mensaje raw (domicilios) |
| `table_number` | `integer` | SI | `NULL` | Número de mesa (staff_scan) |
| `registered_by_staff_id` | `uuid` | SI | `NULL` | FK a staff_users — quién registró la visita |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede donde ocurrió la visita. NULL = **sede desconocida** (histórico, o ninguna de las 4 vías del spec §3.1 pudo resolverla) y se MUESTRA como el cubo "Sin sede" |
| `location_source` | `text` | SI | `NULL` | **Nueva (00043).** De dónde salió `location_id`: `staff_user` \| `staff_device` \| `host` \| `host_single` \| `qr_token` \| `authorized_number` \| `manual` (CHECK). Va **junto** con `location_id`: las dos o ninguna |
| `location_conflict` | `boolean` | SI | `NULL` | **Nueva (00043).** TRI-ESTADO: NULL = no se evaluó · `false` = el QR coincidía con la sede resuelta · `true` = el QR decía OTRA sede. El QR solo **detecta** el conflicto, nunca gana |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de la visita |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `customer_id` | `customers(id)` | CASCADE |
| `registered_by_staff_id` | `staff_users(id)` | SET NULL |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |

---

### rewards

> Configuración de recompensas. `visit_milestone` puede ser NULL para recompensas que no se activan por visitas (uso en reactivación, campañas manuales).

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `visit_milestone` | `integer` | **SI** | `NULL` | Visita que activa la recompensa. NULL = no activa por visitas, sólo se usa manualmente. |
| `title` | `text` | NO | - | Nombre de la recompensa |
| `message_template` | `text` | NO | - | Texto de referencia (display en dashboard). El cuerpo real lo define la plantilla Twilio. |
| `is_active` | `boolean` | NO | `true` | Si la recompensa está activa |
| `is_black` | `boolean` | NO | `false` | TRUE = esta recompensa marca el nivel BLACK (tier máximo, solo uno activo por instancia) |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación |

**Índices:**

| Nombre | Columnas | Tipo | Descripción |
|--------|----------|------|-------------|
| `rewards_visit_milestone_unique` | `visit_milestone` | UNIQUE (parcial: WHERE visit_milestone IS NOT NULL) | Impide duplicados sólo cuando hay milestone |

---

### campaigns

> Campañas de marketing manuales y automáticas.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `name` | `text` | NO | - | Nombre de la campaña |
| `type` | `text` | NO | - | Tipo: 'manual', 'birthday', 'reactivation' |
| `status` | `text` | NO | `'draft'` | Estado: 'draft', 'scheduled', 'running', 'completed', 'failed' |
| `message_template` | `text` | NO | - | Template del mensaje |
| `filters` | `jsonb` | SI | `NULL` | Filtros de segmentación |
| `total_sent` | `integer` | NO | `0` | Total de mensajes enviados |
| `scheduled_at` | `timestamptz` | SI | `NULL` | Fecha programada |
| `executed_at` | `timestamptz` | SI | `NULL` | Fecha de ejecución real |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación |
| `source` | `text` | NO | `'manual'` | Origen real: 'manual', 'calendar', 'reactivation', 'birthday', **'reward_reminder'** (migración 00031). Usado por `filterByMonthlyCap` (cuenta manual+calendar+reactivation+reward_reminder; NO cuenta birthday). |
| `media_url` | `text` | SI | `NULL` | URL pública del media adjunto (Supabase Storage bucket `event-media`) si la campaña usa plantilla `twilio/media`. |
| `media_type` | `text` | SI | `NULL` | 'image' o 'video'. NULL para campañas de solo texto. |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede que lanzó la campaña. NULL = sede desconocida, o campaña de marca. ⚠️ El **reloj de inactividad** de los crons de rescate sigue siendo **de la MARCA** (§8.2 del spec): lo que se parte por sede es la ATRIBUCIÓN, no el reloj. FK compuesta RESTRICT |

**Índices nuevos (00012):**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `idx_campaigns_source_created` | `(source, created_at)` | BTREE |

---

### campaign_messages

> Registro de cada mensaje enviado dentro de una campaña.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `campaign_id` | `uuid` | NO | - | FK a campaigns |
| `customer_id` | `uuid` | NO | - | FK a customers |
| `status` | `text` | NO | `'pending'` | Estado: 'pending', 'sent', 'delivered', 'failed' |
| `twilio_sid` | `text` | SI | `NULL` | SID del mensaje en Twilio |
| `sent_at` | `timestamptz` | SI | `NULL` | Fecha de envío |
| `error_message` | `text` | SI | `NULL` | Detalle del error si falló |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `campaign_id` | `campaigns(id)` | CASCADE |
| `customer_id` | `customers(id)` | CASCADE |

---

### authorized_numbers

> Números de celular de meseros autorizados a enviar datos de domicilios.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `phone` | `text` | NO | - | Número celular del mesero |
| `name` | `text` | NO | - | Nombre del mesero |
| `is_active` | `boolean` | NO | `true` | Si está activo |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede del operador de domicilios (D9). Es la señal **autenticada** de la que sale la sede de un pedido: el celular que manda el cuadro ya se contrasta contra esta tabla (`twilio-incoming/route.ts:121-127`) y la firma de Twilio ya se valida. NULL = sede desconocida. FK compuesta RESTRICT |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de registro |

**Índices:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `authorized_numbers_phone_key` | `phone` | UNIQUE |

---

### admin_settings

> Tabla key-value para configuraciones del administrador (ticket promedio, etc.).

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `key` | `text` | NO | - | Clave de configuración (ej: 'avg_ticket'). Parte del PK compuesto |
| `value` | `text` | NO | - | Valor de la configuración |
| `tenant_id` | `uuid` | NO | - | **(00025/00028)** FK → `tenants(id)`. Parte del PK compuesto: la misma clave existe una vez por negocio |
| `updated_at` | `timestamptz` | NO | `now()` | Última actualización |

**Índices:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `admin_settings_pkey` | `(key, tenant_id)` | PRIMARY KEY — compuesto desde la 00028 (antes era solo `key`) |

**Seed data:**

| key | value | Descripción |
|-----|-------|-------------|
| `avg_ticket` | `35000` | Ticket promedio en COP para cálculo de ROI |
| `event_template_image_sid` | _(vacío inicial)_ | Twilio Content SID de plantilla `twilio/media` con imagen para invitaciones de calendario |
| `event_template_video_sid` | _(vacío inicial)_ | Twilio Content SID de plantilla `twilio/media` con video para invitaciones de calendario |
| `points_per_visit_min` | `60` | Mínimo de puntos aleatorios por visita |
| `points_per_visit_max` | `90` | Máximo de puntos aleatorios por visita |
| `welcome_bonus_points_min` | `75` | Mínimo de puntos de bienvenida al registrarse |
| `welcome_bonus_points_max` | `90` | Máximo de puntos de bienvenida al registrarse |
| `shortfall_min` | `5` | Mínimo de puntos corto en 2da visita |
| `shortfall_max` | `30` | Máximo de puntos corto en 2da visita |
| `pity_timer_threshold` | `2` | Racha de premios bajos antes de Golden Box |
| `points_system_enabled` | `true` | Feature flag: sistema de puntos activo |
| `reactivation_soft_days` | _(vacío inicial — fallback `21`)_ | Días de inactividad para reactivación suave (configurable v1.4.0) |
| `reactivation_aggressive_days` | _(vacío inicial — fallback `25`)_ | Días de inactividad para reactivación agresiva (configurable v1.4.0, debe ser > suave) |
| `review_reward_id` | _(vacío inicial)_ | **(00032)** Id de `campaign_rewards` que se otorga por dejar reseña. Vacío = el pop-up sale igual, pero sin premio |
| `review_reward_window_days` | _(vacío inicial — fallback `30`)_ | **(00032)** Días que tiene el cliente para reclamar el premio por reseña |
| `template_style` | `calido` | **(00039)** Estilo del catálogo de plantillas: `calido` \| `elegante` \| `urbano`. Es **SUGERENCIA, no candado**: el default con el que nace cada plantilla nueva, no una restricción. Cambiarlo NO reescribe nada — re-aplicarlo a las 13 es una acción explícita aparte. **Solo se siembra en tenants `messaging_provider='zernio'`**: los 4 tenants Twilio no se tocan. Ver `docs/features/whatsapp-templates.md` |

> Las claves `*_template_sid` (`welcome_template_sid`, `birthday_template_sid`, `event_template_image_sid`,
> …) son el **puntero a la plantilla vigente** de cada mensaje: un ContentSid en tenants Twilio, un
> `name` de plantilla en tenants Zernio. Desde la 00039, en tenants Zernio el **único** código que las
> escribe es `promoteVersion()`, y solo cuando Meta aprueba la nueva versión.
>
> ⚠️ El **link de reseñas de Google** NO vive aquí: vive en `tenants.config.google_maps_url` (jsonb),
> que es de donde lo lee `resolveBranding()`. Duplicarlo crearía dos fuentes de verdad. Se edita con
> `PUT /api/dashboard/tenant-config` (whitelist de claves).

**Políticas RLS:**

```sql
CREATE POLICY "admin_select_settings" ON admin_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_update_settings" ON admin_settings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "admin_insert_settings" ON admin_settings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

---

### restaurant_events

> Calendario operativo de eventos/promos del restaurante. Soporta media (imagen/video) y modo de envío híbrido: `auto` (cron dispara) o `remind` (solo aviso visual al admin).

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `title` | `text` | NO | - | Nombre del evento (ej: "Festival del Sushi") |
| `description` | `text` | SI | `NULL` | Descripción/CTA libre del evento |
| `event_date` | `date` | NO | - | Día del evento real |
| `event_time` | `time` | SI | `NULL` | Hora opcional del evento |
| `event_type` | `text` | NO | - | 'promo' \| 'festival' \| 'activacion' \| 'aniversario' \| 'otro' |
| `send_mode` | `text` | NO | `'remind'` | 'auto' = cron envía; 'remind' = solo recordatorio para el admin |
| `scheduled_send_at` | `timestamptz` | SI | `NULL` | Cuándo se envía (solo si `send_mode='auto'`). Debe ser ≤ `event_date`. |
| `filters` | `jsonb` | NO | `'{}'` | Filtros de audiencia (mismo shape que `campaigns.filters`) |
| `media_url` | `text` | SI | `NULL` | URL pública del bucket `event-media` |
| `media_type` | `text` | SI | `NULL` | 'image' o 'video' |
| `content_sid` | `text` | SI | `NULL` | Twilio Content SID resuelto desde `admin_settings` según `media_type` |
| `campaign_id` | `uuid` | SI | `NULL` | FK a `campaigns(id)`. Se llena cuando el evento se ejecuta. |
| `status` | `text` | NO | `'planned'` | 'planned' \| 'scheduled' \| 'sent' \| 'cancelled' \| 'failed' |
| `blackout_days` | `integer` | NO | `5` | Días antes del evento donde campañas manuales se bloquean (0-30) |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** ⚠️ **La única tabla del schema donde NULL NO significa "sede desconocida".** Aquí NULL solo es válido con `audience_scope='brand'`, y entonces significa **"toda la marca"**. FK compuesta RESTRICT |
| `audience_scope` | `text` | **NO** | `'brand'` | **Nueva (00043).** A quién va dirigido el evento (D8, marcado **vital** por el dueño): `'brand'` = toda la marca (exige `location_id` NULL) \| `'location'` = una sede (exige `location_id` NOT NULL). DEFAULT `'brand'` para que los eventos que ya existen **no cambien de comportamiento** |
| `created_at` | `timestamptz` | NO | `now()` | Creación |
| `updated_at` | `timestamptz` | NO | `now()` | Última actualización |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `campaign_id` | `campaigns(id)` | SET NULL |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |

**Índices:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `restaurant_events_pkey` | `id` | PRIMARY KEY |
| `idx_restaurant_events_date` | `event_date` | BTREE |
| `idx_restaurant_events_status` | `status` | BTREE |
| `idx_restaurant_events_scheduled` | `scheduled_send_at` (parcial: WHERE not null + status='scheduled') | BTREE |

**Triggers:**

| Nombre | Evento | Función |
|--------|--------|---------|
| `trg_restaurant_events_updated_at` | BEFORE UPDATE | `update_restaurant_events_updated_at()` |

**Políticas RLS:**

```sql
-- Admin: CRUD completo
CREATE POLICY "admin_all_restaurant_events" ON restaurant_events
  FOR ALL USING (auth.role() = 'authenticated');

-- Service role: SELECT/INSERT/UPDATE (para crons y endpoints internos)
CREATE POLICY "service_select_restaurant_events" ON restaurant_events FOR SELECT USING (true);
CREATE POLICY "service_insert_restaurant_events" ON restaurant_events FOR INSERT WITH CHECK (true);
CREATE POLICY "service_update_restaurant_events" ON restaurant_events FOR UPDATE USING (true);
```

---

### restaurant_locations

> **LA SEDE.** Nació en la 00014 como "un punto en el mapa" para la geocerca anti QR-scam (hoy
> apagada, v1.0.5-3). Desde la **00041** es la entidad *sede*: carga el subdominio, la ficha de
> Google, el teléfono de domicilios, los meseros y toda la atribución por sede.
> Ver `docs/features/multi-sede.md` y `docs/superpowers/specs/2026-09-02-multisede-design.md`.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → `tenants(id)` (00025/00028) |
| `name` | `text` | NO | `'Sede principal'` | Nombre de la sede |
| `address` | `text` | SI | `NULL` | Dirección del local |
| `slug` | `text` | SI | `NULL` | **00041.** Identificador estable dentro de la marca (`sede-principal`, `laureles`). Kebab-case, 1..63 |
| `domain` | `text` | SI | `NULL` | **00041.** Subdominio propio de la sede. Único **GLOBAL** |
| `config` | `jsonb` | NO | `'{}'` | **00041.** Override por sede de `tenants.config`. **Vacío = hereda la marca** |
| `is_primary` | `boolean` | NO | `false` | **00041.** La sede que hereda el dominio y el material impreso |
| `sort_order` | `integer` | NO | `0` | **00041.** Orden de presentación |
| `lat` | `numeric(10,8)` | **SI** | `NULL` | **00041: era NOT NULL.** Latitud — **opcional** |
| `lon` | `numeric(11,8)` | **SI** | `NULL` | **00041: era NOT NULL.** Longitud — **opcional** |
| `radius_meters` | `integer` | NO | `20` | Radio de la geocerca (apagada) |
| `is_active` | `boolean` | NO | `true` | Una sede **nunca se borra: se desactiva** |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación |
| `updated_at` | `timestamptz` | NO | `now()` | Última actualización (trigger `handle_updated_at`) |

**Constraints e índices (00041):**

| Nombre | Qué es | Por qué |
|---|---|---|
| `restaurant_locations_id_tenant_key` | `UNIQUE (id, tenant_id)` | ⚠️ **CONTRATO — el nombre no se cambia.** Es el soporte de **todas** las FK compuestas `(location_id, tenant_id)` de la 00043. Redundante para la unicidad (`id` ya es PK), imprescindible para la referencia: sin él solo se podría poner `FK (location_id) → id`, y **una FK simple deja grabar una visita de la marca A con la sede de la marca B** |
| `idx_restaurant_locations_domain` | `UNIQUE (domain) WHERE domain IS NOT NULL` | Un host resuelve a **una** sede en todo el producto. Global, no por tenant — igual que `idx_tenants_domain` (00029) |
| `idx_restaurant_locations_tenant_slug` | `UNIQUE (tenant_id, slug) WHERE slug IS NOT NULL` | Dos marcas pueden tener cada una su sede `laureles` |
| `restaurant_locations_latlon_pair_check` | `CHECK ((lat IS NULL) = (lon IS NULL))` | Media coordenada no es una ubicación: `calculate_distance()` (00014) la convertiría en NULL sin avisar |
| `restaurant_locations_slug_format_check` | kebab-case, 1..63 | Espejo de `isValidSubdomainLabel` del AIOS |
| `restaurant_locations_domain_format_check` | hostname minúsculas, ≥2 labels, sin esquema ni ruta, ≤253 | Espejo de `isValidHostname` del AIOS. Va **también** en la base: 55 archivos escriben con `service_role`, que bypasa RLS |

**Trigger de unicidad CRUZADA (00041):**

```sql
-- trg_restaurant_locations_domain_guard  BEFORE INSERT OR UPDATE OF domain, tenant_id
-- restaurant_locations_domain_guard() — SECURITY DEFINER, search_path fijo.
-- Un índice único por tabla no puede impedir que la sede de la marca A se quede con el
-- dominio principal de la marca B. El solape se PERMITE solo dentro del mismo tenant,
-- que es exactamente el caso de la 00042 (la sede principal repite el dominio impreso).
```

> ⚠️ **Deuda:** el guardarraíl es de **una sola dirección**. Falta el simétrico sobre `tenants`
> (un tenant nuevo tomando un `domain` que ya usa la sede de otra marca). Ver
> `docs/features/multi-sede.md` §5.

**Políticas RLS** (de la 00026 — la 00041/00042 **no las tocan**):

```sql
CREATE POLICY "tenant_all_restaurant_locations" ON restaurant_locations FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());
```

**Datos (00042):** cada tenant que ya existía recibió su *"Sede principal"* (`slug =
'sede-principal'`, `is_primary = true`) con el subdominio ya impreso delegado desde
`tenants.domain`. **Sin coordenadas**: la geocerca está apagada y exigirlas es justo lo que
dejaba a los tenants sin ninguna sede. El tenant que ya tenía una fila la **adopta** en vez de
crear una segunda.

---

### dashboard_user_locations

> **F7, D10.** El alcance de sede de cada usuario del dashboard. NO es un claim del JWT: el
> `tenant_id` del JWT se escribe a mano con un `UPDATE` sobre `auth.users` (00028) y exige
> re-login; una tabla se corrige en caliente y el RLS la puede leer.
> Ver `docs/features/multi-sede.md` §3.quater.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NO | - | FK → `auth.users(id)` ON DELETE CASCADE |
| `tenant_id` | `uuid` | NO | - | FK → `tenants(id)` ON DELETE CASCADE. **Sin DEFAULT puente** — a diferencia de las 18 tablas de la 00028, un INSERT que olvide `tenant_id` falla con `23502`, no se va a Sushi Service |
| `location_id` | `uuid` | SI | `NULL` | FK COMPUESTA `(location_id, tenant_id)` |
| `role` | `text` | NO | - | `'brand'` (toda la marca) o `'location'` (una sede) |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | |

**Constraints e índices (00045):**

| Nombre | Qué es | Por qué |
|---|---|---|
| `dashboard_user_locations_role_check` | `CHECK (role IN ('brand','location'))` | |
| `dashboard_user_locations_pareja_check` | `CHECK ((role='brand' AND location_id IS NULL) OR (role='location' AND location_id IS NOT NULL))` | El alcance es EXPLÍCITO, nunca deducido de un NULL — mismo patrón que `restaurant_events_audience_pareja_check` (00043) |
| `dashboard_user_locations_location_id_tenant_fkey` | `FOREIGN KEY (location_id, tenant_id) REFERENCES restaurant_locations (id, tenant_id) ON DELETE RESTRICT` | La regla transversal de multi-sede: una FK simple dejaría un permiso de la marca A sobre una sede de la marca B |
| `idx_dashboard_user_locations_brand` | `UNIQUE (user_id, tenant_id) WHERE location_id IS NULL` | Una sola fila `role='brand'` por usuario y marca |
| `idx_dashboard_user_locations_sede` | `UNIQUE (user_id, tenant_id, location_id) WHERE location_id IS NOT NULL` | Una sola fila por usuario, marca y sede |

**El fail-safe (§5.1), implementado en `can_see_location(location_id uuid) RETURNS boolean`:**

| Situación | Resultado |
|---|---|
| Sin fila y el tenant tiene ≤1 sede activa | Ve la marca (= su única sede) |
| Sin fila y el tenant tiene ≥2 sedes activas | 403 |
| `role='brand'` | Todas las sedes + el cubo *"Sin sede"* |
| `role='location'` | Solo esas sedes, **nunca** `location_id IS NULL` |

**Helpers `SECURITY DEFINER` (00045, `search_path` fijo):** `current_dashboard_user_id()` (el
`sub` del JWT — se lee de `auth.jwt()` y no de `auth.uid()` porque es el único objeto de `auth`
que el bootstrap de tests stubbea), `tenant_active_location_count(tenant_id)`, y
`can_see_location(location_id)` de arriba. Los tres **conservan** el `EXECUTE` a PUBLIC — las
policies los invocan como `anon`/`authenticated`.

**Trigger `trg_restaurant_locations_estampa_marca`** (AFTER INSERT/UPDATE OF `is_active`,
`tenant_id` en `restaurant_locations`): estampa `role='brand'` a los usuarios existentes del
tenant en el instante en que su 2ª sede activa nace. Idempotente; no pisa una fila `role='location'`
ya asignada a mano.

**Políticas RLS de la propia tabla (más estrictas que el patrón `tenant_all_*`):**

```sql
CREATE POLICY "tenant_own_dashboard_user_locations" ON dashboard_user_locations FOR ALL
  USING      (is_super_admin() OR (tenant_id = current_tenant_id() AND user_id = current_dashboard_user_id()))
  WITH CHECK (is_super_admin() OR (tenant_id = current_tenant_id() AND user_id = current_dashboard_user_id()));
```

Quién manda a quién no es dato de todos los admins de la marca — cada quien ve SU alcance.

**Las policies `RESTRICTIVE sede_visible_*` sobre las OTRAS tablas** (autodescubiertas por
catálogo: toda tabla de `public` con `tenant_id` + `location_id`, EXCEPTO `restaurant_events`):

```sql
CREATE POLICY sede_visible_<tabla> ON <tabla> AS RESTRICTIVE FOR ALL TO authenticated
  USING      (is_super_admin() OR can_see_location(location_id))
  WITH CHECK (is_super_admin() OR can_see_location(location_id));
```

Es la red **barata**: el aislamiento real vive en el tipo `LocationScope` de TypeScript
(`src/lib/location-scope.ts`), porque en toda la app hay **una sola** lectura por el camino
autenticado — las otras ~55 corren con `service_role`, que se salta el RLS. `AS RESTRICTIVE` (no
una permisiva nueva) es lo que permite añadir el predicado sin tocar ni una policy `tenant_all_*`
existente: Postgres calcula `(T ∨ S) ∧ (S ∨ C) ≡ S ∨ (T ∧ C)`, que es el predicado del spec.

---

### staff_users

> Cuentas de meseros con login por PIN (hasheado con bcrypt). Roles: `waiter`, `supervisor`, `admin`.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `name` | `text` | NO | - | Nombre del mesero |
| `phone` | `text` | NO | - | Número celular (único) |
| `pin` | `text` | SI | `NULL` | PIN hasheado (bcrypt 10 rounds). NULL = deshabilitado. |
| `role` | `text` | NO | `'waiter'` | `waiter`, `supervisor`, `admin` |
| `is_active` | `boolean` | NO | `true` | Si puede hacer login |
| `last_login_at` | `timestamptz` | SI | `NULL` | Última vez que hizo login |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación |
| `updated_at` | `timestamptz` | NO | `now()` | Última actualización |
| `tenant_id` | `uuid` | **NO** | ⚠️ ver nota | **00025 + 00028.** La marca. ⚠️ Arrastra el **DEFAULT puente** de la 00028 (apunta a Sushi Service) porque la **00030 nunca se aplicó** en producción: un INSERT que lo omita se va callado al tenant equivocado. Pasarlo SIEMPRE explícito |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00044).** Sede a la que pertenece el mesero (**D11**: *"cada mesero es de cada sede, no se juntan jamás"*). NULL = **mesero sin sede asignada**, y SE MUESTRA: no se adivina ni se reparte. Es la **vía 1 —la más fuerte—** de la precedencia del §3.1, por encima del host. Vive en la FILA y **nunca en el JWT** del mesero (§5.3): el JWT dura 8h, así que reasignar de sede tardaría hasta 8 horas en verse. FK **compuesta** `(location_id, tenant_id)` → `restaurant_locations(id, tenant_id)` ON DELETE **RESTRICT** |

**Índices y constraints:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `staff_users_pkey` | `id` | PRIMARY KEY |
| `staff_users_phone_tenant_key` | `(phone, tenant_id)` | UNIQUE — ⚠️ **es lo que hace cumplir D11 en el motor**: un celular = una fila = una sede. Cambiarlo a `(phone, location_id)` permitiría dos filas del mismo celular, o sea *"el mesero trabaja en las dos"*, que es lo prohibido. **La 00044 NO lo toca.** (**00028**; el `staff_users_phone_key` global de la 00018 lo borró la **00025**) |
| `idx_staff_users_phone` | `phone` | btree — **NO único**, solo búsqueda |
| `idx_staff_users_active` | `is_active` | btree |
| `idx_staff_users_tenant` | `tenant_id` | btree (00025) |
| `idx_staff_users_location_id` | `(tenant_id, location_id)` | btree **parcial** `WHERE location_id IS NOT NULL` (00044). Postgres indexa el lado referenciado, nunca el que referencia: sin él, desactivar una sede haría seq scan |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `tenant_id` | `tenants(id)` | RESTRICT |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** (00044) |

**Políticas RLS:**

```sql
CREATE POLICY "admin_select_staff_users" ON staff_users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_insert_staff_users" ON staff_users FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin_update_staff_users" ON staff_users FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "admin_delete_staff_users" ON staff_users FOR DELETE USING (auth.role() = 'authenticated');
```

**Triggers:**

| Nombre | Evento | Función |
|--------|--------|---------|
| `on_staff_users_updated` | BEFORE UPDATE | `handle_updated_at()` |
| `trg_staff_users_sede_coherente` | BEFORE UPDATE OF `location_id` | `staff_user_sede_coherente()` (00044) — **rechaza con 23514** mover de sede a un mesero que tiene dispositivos en la sede vieja. Un dispositivo es un aparato FÍSICO que está donde está: arrastrarlo reasignaría en silencio las visitas de una tablet que nadie movió del mostrador. Hay que reasignar o desvincular los dispositivos primero |

---

### staff_devices

> Dispositivos de confianza (celulares/tablets del local) registrados por un supervisor o admin. Permite que el mesero no haga login diario.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `staff_user_id` | `uuid` | SI | `NULL` | FK opcional al mesero que registró el device |
| `device_fingerprint` | `text` | NO | - | Hash del device (UA + resolución + platform) |
| `device_name` | `text` | SI | `NULL` | Nombre descriptivo (ej: "Celular del Local") |
| `is_trusted` | `boolean` | NO | `true` | Si el device sigue siendo confiable |
| `trusted_at` | `timestamptz` | NO | `now()` | Cuándo se activó |
| `expires_at` | `timestamptz` | SI | `NULL` | Fecha de expiración (NULL = nunca expira) |
| `last_used_at` | `timestamptz` | SI | `NULL` | Última vez que se usó |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación |
| `tenant_id` | `uuid` | **NO** | ⚠️ ver nota | **00025 + 00028.** La marca. ⚠️ Mismo DEFAULT puente vivo que `staff_users.tenant_id`: pasarlo SIEMPRE explícito |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00044).** Sede del dispositivo (**vía 2** de la precedencia del §3.1: por debajo del mesero autenticado y por encima del host). NULL = sede desconocida. **La hereda del mesero dueño** al registrarse (`POST /api/staff/device/register`). FK **compuesta** `(location_id, tenant_id)` → `restaurant_locations(id, tenant_id)` ON DELETE **RESTRICT** |

**Índices y constraints:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `staff_devices_pkey` | `id` | PRIMARY KEY |
| `staff_devices_fingerprint_tenant_key` | `(device_fingerprint, tenant_id)` | UNIQUE — **nueva (00044)**. ⚠️ Tapa una bomba **verificada**: hasta la 00044 `device_fingerprint` solo tenía índice NORMAL (00018:41) y **siete** sitios del código hacen `.single()` sobre él. Dos filas iguales dentro de un tenant = `PGRST116` = el mesero no puede escanear y el mensaje dice *"dispositivo no reconocido"*. Compuesto con `tenant_id`, no global: el fingerprint lo genera el navegador y dos marcas podrían coincidir sin que sea error de nadie |
| `idx_staff_devices_fingerprint` | `device_fingerprint` | btree (00018) — **redundante** desde la 00044 (el UNIQUE nuevo lo lidera). Se deja: borrar un índice que no molesta no era trabajo de F4 |
| `idx_staff_devices_staff` | `staff_user_id` | btree |
| `idx_staff_devices_trusted` | `(is_trusted, expires_at)` | btree |
| `idx_staff_devices_tenant` | `tenant_id` | btree (00025) |
| `idx_staff_devices_location_id` | `(tenant_id, location_id)` | btree **parcial** `WHERE location_id IS NOT NULL` (00044) |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `staff_user_id` | `staff_users(id)` | **CASCADE** — ⚠️ borrar un mesero borra sus dispositivos. (Este doc decía *SET NULL*; **00018:31 dice CASCADE** y así está en la base) |
| `tenant_id` | `tenants(id)` | RESTRICT |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** (00044) |

**Triggers:**

| Nombre | Evento | Función |
|--------|--------|---------|
| `trg_staff_devices_sede_coherente` | BEFORE INSERT OR UPDATE OF `staff_user_id`, `location_id`, `tenant_id` | `staff_device_sede_coherente()` (00044) — **rechaza con 23514** que un dispositivo quede a nombre de un mesero de **otra sede** o de **otra marca**. Lo de la marca no lo cubre ninguna FK: `staff_devices_staff_user_id_fkey` es una FK **simple** sobre `staff_users(id)`. Solo actúa cuando las dos sedes son **conocidas**: NULL es *"sede desconocida"*, no *"otra sede"*, así que el parque instalado no se toca |

**Políticas RLS:**

```sql
CREATE POLICY "admin_select_staff_devices" ON staff_devices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_insert_staff_devices" ON staff_devices FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin_update_staff_devices" ON staff_devices FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "admin_delete_staff_devices" ON staff_devices FOR DELETE USING (auth.role() = 'authenticated');
```

---

### message_logs

> Registro de **todos** los mensajes WhatsApp enviados por el sistema (transaccionales y de campaña). Creada por la auditoría 12-Julio para resolver el hueco de observabilidad: antes los mensajes de welcome/check-in/tier/mystery box se enviaban sin dejar rastro en la base de datos. Lo escribe `sendTemplateMessage` (vía `logContext`) en `src/services/message-log.service.ts`.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `customer_id` | `uuid` | SI | `NULL` | FK a customers (ON DELETE SET NULL). NULL si el envío ocurrió antes de crear el cliente. |
| `phone` | `text` | NO | - | Número destino (siempre disponible, aunque no haya customer). |
| `message_type` | `text` | NO | - | `welcome` \| `checkin` \| `tier_unlocked` \| `points_earned_near` \| `points_earned_far` \| `safe_reward` \| `mystery_box` \| `golden_box` \| `birthday` \| `reactivation` \| `manual` \| `event` \| `delivery` |
| `template_sid` | `text` | SI | `NULL` | Twilio Content SID usado. |
| `variables` | `jsonb` | SI | `NULL` | Variables enviadas a la plantilla. |
| `status` | `text` | NO | `'pending'` | `pending` \| `sent` \| `delivered` \| `failed` \| `undelivered` |
| `twilio_sid` | `text` | SI | `NULL` | SID del mensaje en Twilio (cuando se envió). |
| `error_code` | `text` | SI | `NULL` | Código de error Twilio (21610 opt-out, 21656 formato, 21665 count, 63003/63015 sin WhatsApp, `twilio_not_configured`). |
| `error_message` | `text` | SI | `NULL` | Detalle del error. |
| `sent_at` | `timestamptz` | SI | `NULL` | Cuándo se aceptó el envío en Twilio. |
| `delivered_at` | `timestamptz` | SI | `NULL` | Se llenará desde el webhook de status callback (tarea futura). |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede a la que se **imputa** el mensaje (D4: billetera de la marca, con desglose por sede obligatorio). NULL = sede desconocida. FK compuesta RESTRICT |
| `line_location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede dueña de la **línea** de WhatsApp por la que salió (D6). **No es lo mismo** que `location_id`: `line_budget()` calcula el p95 transaccional sobre **14 días de esta tabla** y, con líneas por sede, ese p95 tiene que ser **por línea** — si no, el volumen de la sede A infla la reserva de la sede B y le come el presupuesto en silencio. `send_reservations` no sirve (se poda a 7 días). FK compuesta RESTRICT |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación del registro. |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `customer_id` | `customers(id)` | SET NULL |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |
| `(line_location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |

**Índices:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `message_logs_pkey` | `id` | PRIMARY KEY |
| `idx_message_logs_customer` | `customer_id` | BTREE |
| `idx_message_logs_status` | `status` | BTREE |
| `idx_message_logs_type` | `message_type` | BTREE |
| `idx_message_logs_created` | `created_at DESC` | BTREE |
| `idx_message_logs_twilio_sid` | `twilio_sid` (parcial: WHERE NOT NULL) | BTREE |

**Políticas RLS:**

```sql
CREATE POLICY "admin_select_message_logs" ON message_logs
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "service_insert_message_logs" ON message_logs
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_update_message_logs" ON message_logs
    FOR UPDATE USING (true);
```

---

### reward_redemptions

> Tracking de la **entrega física** de un premio en el local (v2.0.0, migración 00022). Una fila por premio entregado. Ver `docs/features/redemption-tracking.md` y `docs/features/reward-grants.md`.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `customer_id` | `uuid` | NO | - | FK → customers(id) ON DELETE CASCADE |
| `grant_id` | `uuid` | SI | `NULL` | **Nueva (00031).** FK → reward_grants(id) ON DELETE SET NULL. El premio otorgado que esta entrega cierra — camino principal desde la migración 00031 |
| `mystery_box_result_id` | `uuid` | SI | `NULL` | FK → mystery_box_results(id) ON DELETE SET NULL. Link al premio elegido |
| `tier_id` | `uuid` | **SI** | `NULL` | FK → reward_tiers(id) ON DELETE RESTRICT. **Nullable desde 00031** (antes NOT NULL): un premio de campaña no tiene tier |
| `prize_title` | `text` | NO | - | Snapshot del premio entregado |
| `source` | `text` | NO | `'mystery_box'` | `mystery_box` \| `safe_choice` \| `staff_override` \| `campaign_reward` (CHECK) |
| `redeemed_at` | `timestamptz` | NO | `now()` | Momento de la entrega física |
| `redeemed_by_staff_id` | `uuid` | SI | `NULL` | FK → staff_users(id) ON DELETE SET NULL. Mesero que entregó |
| `table_number` | `integer` | SI | `NULL` | Mesa |
| `notes` | `text` | SI | `NULL` | Notas |
| `pos_reference` | `text` | SI | `NULL` | Ticket/factura del POS para conciliación |
| `redeemed_location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede donde se **ENTREGÓ** físicamente el premio (D3 + D12). Es la que responde *"cuántos premios entrega cada sede"*. NULL = sede desconocida. FK compuesta RESTRICT |
| `created_at` | `timestamptz` | NO | `now()` | - |

**Índices:** `idx_reward_redemptions_customer (customer_id, redeemed_at DESC)`, `idx_reward_redemptions_staff`, `idx_reward_redemptions_date`, `idx_reward_redemptions_pos`, índice único parcial `idx_reward_redemptions_unique_mystery_box (mystery_box_result_id) WHERE NOT NULL` (anti-duplicado), índice único parcial **`idx_reward_redemptions_unique_grant (grant_id) WHERE grant_id IS NOT NULL`** (00031 — anti doble-entrega: si dos meseros tocan "Entregar" sobre el mismo premio otorgado al mismo tiempo, el segundo INSERT choca con un 23505 que `recordRedemption()` traduce a `already_redeemed`; la garantía vive en la base de datos, no en la UI).

**Triggers:**

- `trg_reward_redemptions_insert` AFTER INSERT → `mark_mystery_box_redeemed()` marca `mystery_box_results.redeemed = true`.
- `trg_reward_redemptions_grant` AFTER INSERT → `mark_grant_redeemed()` (00031): si `NEW.grant_id IS NOT NULL`, marca ese `reward_grants.status = 'redeemed'` y `redeemed_at = NEW.redeemed_at` (solo si seguía `active`).

**RLS:** admin SELECT/UPDATE (`auth.role()='authenticated'`); service SELECT/INSERT (`true`).

**Columnas añadidas a `mystery_box_results` (00022):** `redeemed boolean DEFAULT false`, `redeemed_at timestamptz NULL`.

---

### imported_contacts

> Contactos importados desde CSV externos (Golden Bullet, v2.0.0, migración 00023). Separados de `customers` porque NO han dado consentimiento de marketing. Ver `docs/features/golden-bullet.md`.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `phone` | `text` | NO | - | Número (único) |
| `name` | `text` | SI | `NULL` | Nombre si viene en el CSV |
| `email` | `text` | SI | `NULL` | Email si viene |
| `source_file` | `text` | NO | - | Nombre del CSV |
| `source_batch` | `text` | NO | - | UUID del lote de importación |
| `status` | `text` | NO | `'pending'` | `pending`\|`valid`\|`invalid`\|`sent`\|`delivered`\|`bounced`\|`converted`\|`blocked` (CHECK) |
| `validation_error` | `text` | SI | `NULL` | Motivo de invalidez |
| `message_sent_at` | `timestamptz` | SI | `NULL` | Cuándo se envió |
| `twilio_sid` | `text` | SI | `NULL` | SID del mensaje Twilio |
| `converted_to_customer_id` | `uuid` | SI | `NULL` | FK → customers(id) ON DELETE SET NULL. Si el contacto se registra |
| `campaign_id` | `uuid` | SI | `NULL` | FK → campaigns(id) ON DELETE SET NULL |
| `created_at` | `timestamptz` | NO | `now()` | - |

**Índices:** único `idx_imported_contacts_phone (phone)`, `idx_imported_contacts_batch (source_batch, status)`, `idx_imported_contacts_status`, `idx_imported_contacts_converted`.

**RLS:** admin ALL (`auth.role()='authenticated'`); service SELECT/INSERT/UPDATE (`true`).

**Seed `admin_settings` (00023):** `golden_bullet_enabled='false'` (feature flag), `twilio_cost_per_message_usd='0.0175'`.

---

### campaign_rewards

> Catálogo editable de premios de campaña (v2.3.0, migración 00031). Lo edita el dueño en
> Dashboard > Premios de campaña y lo otorgan las campañas como `reward_grants` (hoy:
> reactivación agresiva; después: referidos, promos, recompensa por reseña). Deliberadamente
> independiente de `reward_tiers`: los tiers se ganan con puntos, regalar uno gratis por
> campaña devaluaría el sistema de puntos. Ver `docs/features/reward-grants.md`.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → tenants(id) ON DELETE CASCADE |
| `title` | `text` | NO | - | Nombre del premio (ej: "1/2 sushi gratis") |
| `description` | `text` | SI | `NULL` | Descripción libre |
| `is_active` | `boolean` | NO | `true` | Si aparece disponible para nuevas campañas |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación |

**Índices:**

| Nombre | Columnas | Tipo |
|--------|----------|------|
| `campaign_rewards_pkey` | `id` | PRIMARY KEY |
| `idx_campaign_rewards_tenant_active` | `(tenant_id, is_active)` | BTREE |

**RLS:** `tenant_all_campaign_rewards` FOR ALL — `USING/WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin())`. El service role bypasa RLS por diseño; el aislamiento real lo hace el código filtrando `tenant_id`.

**Baja lógica:** `DELETE /api/dashboard/campaign-rewards` no borra la fila, marca `is_active=false` — los `reward_grants` ya otorgados guardan `prize_title` como snapshot, así que retirar un premio del catálogo no rompe lo que ya está en curso.

---

### reward_grants

> El premio otorgado: la pieza que faltaba entre "ganar" (`mystery_box_results` / cron de
> reactivación) y "entregar" (`reward_redemptions`). Un premio que le PERTENECE a un cliente
> y está pendiente de reclamar, con estado y vencimiento opcional (v2.3.0, migración 00031).
> Ver `docs/features/reward-grants.md`.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → tenants(id) ON DELETE CASCADE |
| `customer_id` | `uuid` | NO | - | FK → customers(id) ON DELETE CASCADE |
| `grant_type` | `text` | NO | - | `tier_prize` \| `campaign_prize` (CHECK) |
| `source` | `text` | NO | - | `mystery_box` \| `safe_choice` \| `reactivation` \| `review` \| `manual` (CHECK) |
| `prize_title` | `text` | NO | - | Snapshot del título del premio. Si el dueño renombra el premio del catálogo después, lo ya otorgado no cambia |
| `tier_id` | `uuid` | SI | `NULL` | FK → reward_tiers(id) ON DELETE SET NULL. Solo para `tier_prize` |
| `mystery_box_result_id` | `uuid` | SI | `NULL` | FK → mystery_box_results(id) ON DELETE SET NULL. Solo para `tier_prize` |
| `campaign_reward_id` | `uuid` | SI | `NULL` | FK → campaign_rewards(id) ON DELETE SET NULL. Solo para `campaign_prize` |
| `campaign_id` | `uuid` | SI | `NULL` | FK → campaigns(id) ON DELETE SET NULL. Solo para `campaign_prize` |
| `status` | `text` | NO | `'active'` | `active` \| `redeemed` \| `expired` (CHECK) |
| `expires_at` | `timestamptz` | SI | `NULL` | NULL = no vence. Los premios de tier no vencen; los de campaña sí |
| `reminder_sent_at` | `timestamptz` | SI | `NULL` | Cuándo se envió el recordatorio de vencimiento (cron `reward-reminder`) |
| `granted_at` | `timestamptz` | NO | `now()` | Momento en que se otorgó el premio |
| `redeemed_at` | `timestamptz` | SI | `NULL` | Lo llena el trigger `mark_grant_redeemed()` al entregarse |
| `granted_location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede donde se **GANÓ** el premio (D12). Cruzada con `reward_redemptions.redeemed_location_id` da la **matriz origen → destino** que convierte D3 (*"el premio ganado en una sede se reclama en otra"*) de política invisible en número. NULL = sede desconocida. FK compuesta RESTRICT |
| `created_at` | `timestamptz` | NO | `now()` | Fecha de creación del registro |

**Índices:**

| Nombre | Columnas | Tipo | Descripción |
|--------|----------|------|-------------|
| `reward_grants_pkey` | `id` | PRIMARY KEY | - |
| `idx_reward_grants_customer` | `(tenant_id, customer_id, status)` | BTREE | Consulta caliente: premios activos de un cliente (tarjeta + escaneo del mesero) |
| `idx_reward_grants_expiry` | `(tenant_id, status, expires_at)` | BTREE | Cron de recordatorio y barrido de vencidos |
| `idx_reward_grants_unique_active_campaign` | `(customer_id, source)` | UNIQUE (parcial: `WHERE status = 'active' AND grant_type = 'campaign_prize'`) | Anti-duplicado: un cliente no puede tener dos premios de campaña activos a la vez del mismo `source` (ni dos de reactivación, ni dos de reseña). Deliberadamente NO aplica a `tier_prize`: un cliente sí puede desbloquear dos tiers antes de que le entreguen el primero |

**Trigger:** `trg_reward_redemptions_grant` AFTER INSERT ON `reward_redemptions` → `mark_grant_redeemed()`: si la redención trae `grant_id`, marca ese `reward_grants.status = 'redeemed'` y `redeemed_at = NEW.redeemed_at` (solo si seguía `active`). Mismo patrón que `mark_mystery_box_redeemed()` (00022), que se conserva intacto.

**RLS:** `tenant_all_reward_grants` FOR ALL — `USING/WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin())`. El service role bypasa RLS; el aislamiento real lo hace el código.

**Backfill (00031):** los premios que los clientes ya habían elegido en `mystery_box_results` (`redeemed=false`) y nadie había entregado se migran a `reward_grants` activos, para que aparezcan en `/mesero/rewards` desde el primer día.

---

### review_events

> Funnel del pop-up de reseñas de Google (v2.5.0, migración 00032).
>
> **Es la primera tabla de eventos del sistema.** Antes no había NADA de analytics en el repo (ni
> PostHog, ni GA, ni tabla de eventos) — hallazgo 3.7 de la auditoría de julio. Deliberadamente **no**
> es una tabla genérica `events(name, payload jsonb)`: tiene tres acciones y un CHECK que las cierra.
> Una tabla genérica sería más "flexible" y por eso mismo imposible de consultar sin adivinar qué se
> guardó.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → tenants(id) ON DELETE CASCADE |
| `customer_id` | `uuid` | NO | - | FK → customers(id) ON DELETE CASCADE |
| `action` | `text` | NO | - | CHECK: `'shown'` \| `'clicked'` \| `'postponed'` |
| `grant_id` | `uuid` | SI | `NULL` | FK → reward_grants(id) ON DELETE SET NULL. Solo en `'clicked'`: el premio otorgado por la reseña. Permite cruzar el funnel con la entrega real |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede cuya **ficha de Google** se mostró (D5: ficha por sede). NULL = sede desconocida. FK compuesta RESTRICT |
| `created_at` | `timestamptz` | NO | `now()` | - |

**Índices:**

| Nombre | Columnas | Tipo | Para qué |
|--------|----------|------|----------|
| `review_events_pkey` | `id` | PRIMARY KEY | - |
| `idx_review_events_funnel` | `(tenant_id, action, created_at DESC)` | BTREE | El embudo del dashboard por rango de fechas |
| `idx_review_events_customer` | `(customer_id, action, created_at DESC)` | BTREE | Dedupe del evento `shown` (ventana de 12h) |

**Dedupe de `shown`:** recargar la pantalla de éxito **no** cuenta como una segunda impresión. Si lo
hiciera, el denominador del funnel se infla y la tasa de conversión miente hacia abajo. `logReviewShown()`
descarta la impresión si ya hay una del mismo cliente en las últimas `REVIEW_SHOWN_DEDUPE_HOURS` (12).

**RLS:** `tenant_all_review_events` FOR ALL — `USING/WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin())`.

---

### template_versions

> **(00039)** Versiones de cada plantilla del catálogo estándar de WhatsApp, por tenant: la que se está
> enviando, la que Meta está revisando y todo el historial, con quién editó y cuándo.
> Ver `docs/features/whatsapp-templates.md`.

**Por qué existe.** Meta no deja editar in-place una plantilla aprobada: una "edición" es crear otra y
volver a someterla. La decisión del dueño (REQUERIMIENTOS_AGOSTO_2026.md §12, "Pregunta 1 — RESUELTA")
es que **la vieja no se deja de usar hasta que Meta apruebe la nueva**, para no perder ni un mensaje.
Eso exige guardar la vigente y la pendiente a la vez. `admin_settings` es key-value y además no tiene
dónde registrar autor ni fecha, que es requisito duro de la decisión 3 del dueño.

> ⚠️ **`admin_settings.<settings_key>` sigue siendo el puntero vigente y su contrato NO cambia.** Todo
> el camino de envío (check-in, crons, campañas, calendario) lo lee igual que siempre. Esta tabla es
> aditiva: con `template_versions` vacía, el sistema envía exactamente como antes de la 00039.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → `tenants(id)` ON DELETE CASCADE |
| `template_key` | `text` | NO | - | Cuál de las 13 (espejo de `src/constants/template-catalog.ts`) |
| `settings_key` | `text` | NO | - | Clave de `admin_settings` que apunta al vigente (ej. `welcome_template_sid`) |
| `provider` | `text` | NO | - | CHECK `twilio` \| `zernio` |
| `provider_ref` | `text` | NO | - | `name` de Zernio (`bienvenida_v2`) o ContentSid de Twilio. Es el valor que se copia a `admin_settings` al promover |
| `provider_template_id` | `text` | SI | - | Id de la plantilla en Meta, si el proveedor lo devuelve |
| `language` | `text` | NO | `'es'` | Idioma de la plantilla |
| `category` | `text` | NO | - | CHECK `AUTHENTICATION` \| `MARKETING` \| `UTILITY` |
| `style` | `text` | NO | - | CHECK `calido` \| `elegante` \| `urbano` \| `personalizado`. `personalizado` = el dueño lo editó a mano |
| `body` | `text` | NO | - | El texto exacto que se sometió |
| `status` | `text` | NO | `'pending'` | CHECK `pending` \| `approved` \| `rejected` \| `retired` \| `failed` |
| `rejection_reason` | `text` | SI | - | Motivo de Meta, o el error del proveedor si `failed` |
| `is_current` | `boolean` | NO | `false` | **true = es la que apunta `admin_settings`** |
| `edited_by` | `uuid` | SI | - | FK → `auth.users(id)` ON DELETE SET NULL |
| `edited_by_email` | `text` | SI | - | Copia del email: sobrevive al borrado del usuario |
| `disclaimer_accepted_at` | `timestamptz` | SI | - | Cuándo aceptó la advertencia de responsabilidad |
| `created_at` | `timestamptz` | NO | `now()` | - |
| `submitted_at` | `timestamptz` | SI | - | Cuándo se envió a Meta |
| `resolved_at` | `timestamptz` | SI | - | Cuándo Meta dio veredicto |
| `retired_at` | `timestamptz` | SI | - | Cuándo dejó de ser la vigente |

**Índices — los tres primeros son invariantes, no optimizaciones:**

| Nombre | Columnas | Tipo | Qué garantiza |
|--------|----------|------|---------------|
| `idx_template_versions_one_current` | `(tenant_id, settings_key) WHERE is_current` | UNIQUE parcial | Una sola vigente por slot: `admin_settings` nunca queda ambiguo |
| `idx_template_versions_one_pending` | `(tenant_id, settings_key) WHERE status='pending'` | UNIQUE parcial | Una sola edición en revisión por slot: dos pendientes competirían por el mismo puntero al aprobarse |
| `idx_template_versions_provider_ref` | `(tenant_id, provider_ref, language)` | UNIQUE | El `name` es único por WABA en Meta; reusarlo hace fallar la creación |
| `idx_template_versions_lookup` | `(provider_ref, language, status)` | INDEX | Lookup del webhook `whatsapp.template.status_updated` |
| `idx_template_versions_tenant` | `(tenant_id, template_key, created_at DESC)` | INDEX | Historial por plantilla |

**El único escritor de `admin_settings.<settings_key>`** es `promoteVersion()` en
`src/services/template.service.ts`, y solo corre cuando Meta ya respondió `APPROVED`. Orden deliberado:
retirar la vigente → promover la nueva → mover el puntero. Si algo falla a mitad de camino, el puntero
sigue apuntando a la plantilla vieja (que sigue existiendo en la WABA) y los mensajes siguen saliendo.

**No se borra la plantilla vieja del proveedor:** el contrato verificado de Zernio no expone un DELETE
de plantillas. `retired_at` es el gancho para cuando exista. Ver `docs/features/whatsapp-templates.md`.

**Políticas RLS:**

```sql
CREATE POLICY "tenant_all_template_versions" ON template_versions FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());
```

---

### point_transactions

> El libro mayor del motor de puntos (migración 00013). Una fila por movimiento, con el saldo
> resultante congelado en `balance_after`. Ver `docs/features/points-mystery-box.md`.
>
> **Sección creada por la 00043**, que le agrega la sede: la tabla llevaba desde la 00013 sin
> documentar aquí, y una columna nueva sobre una tabla invisible es una columna que nadie encuentra.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → tenants(id). Añadida por 00025/00028 |
| `customer_id` | `uuid` | NO | - | FK → customers(id) ON DELETE CASCADE |
| `points` | `integer` | NO | - | Movimiento (los puntos nunca se descuentan: `awardPoints()` es el único escritor) |
| `source` | `text` | NO | - | Origen del movimiento (`checkin`, `admin_adjustment`, …) |
| `reference_id` | `uuid` | SI | `NULL` | Referencia libre al hecho que lo originó |
| `balance_after` | `integer` | NO | - | Snapshot del saldo resultante |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede donde se generó el punto. NULL = sede desconocida. Los puntos siguen siendo **de la MARCA**: esta columna atribuye, no separa saldos |
| `created_at` | `timestamptz` | NO | `now()` | - |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `customer_id` | `customers(id)` | CASCADE |
| `tenant_id` | `tenants(id)` | RESTRICT |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |

**Índices:** `idx_point_transactions_customer (customer_id, created_at DESC)`, `idx_point_transactions_source (source)`, `idx_point_transactions_tenant (tenant_id)`, `idx_point_transactions_location_id (tenant_id, location_id) WHERE location_id IS NOT NULL` (00043).

**RLS:** admin SELECT (`auth.role()='authenticated'`); service SELECT/INSERT (`true`).

---

### tenant_wallet_transactions

> Billetera prepagada en COP por tenant (migración 00027; el **débito** llega en la 00033).
> Recargas, ajustes, reembolsos y débitos automáticos. Ver `docs/features/wallet-billing.md`.
>
> **Sección creada por la 00043.**

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → tenants(id) ON DELETE RESTRICT |
| `type` | `text` | NO | - | `topup` \| `adjustment` \| `refund` \| `debit` (el último lo añade la 00033) |
| `amount_cop` | `numeric` | NO | - | Positivo = recarga; negativo = ajuste/débito |
| `amount_usd` | `numeric` | SI | `NULL` | USD fondeado en Twilio, si aplica |
| `usd_cop_rate` | `numeric` | SI | `NULL` | TRM usada en la conversión |
| `notes` | `text` | SI | `NULL` | Referencia del pago (Nequi ID, etc.) |
| `created_by` | `text` | NO | - | UUID del super_admin que lo registró |
| `message_log_id` | `uuid` | SI | `NULL` | **(00033)** FK → message_logs(id) **ON DELETE SET NULL**, con UNIQUE parcial → idempotencia del débito |
| `unit_price_cop` | `numeric` | SI | `NULL` | **(00033)** Snapshot del precio unitario al momento del cobro |
| `quantity` | `integer` | SI | `NULL` | **(00033)** Cantidad cobrada |
| `source` | `text` | SI | `NULL` | **(00033)** `manual` \| `wompi` \| `system` |
| `external_ref` | `text` | SI | `NULL` | **(00033)** UNIQUE parcial `(source, external_ref)` |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede a la que se imputa el movimiento (D4). **Se DENORMALIZA, no se deriva** — ver la nota de abajo. NULL = sede desconocida |
| `created_at` | `timestamptz` | NO | `now()` | - |

> **Por qué la sede se denormaliza y no se saca con un JOIN.** `tenant_wallet_transactions_message_log_id_fkey`
> es **`ON DELETE SET NULL`** (verificado en producción). Derivar la sede por JOIN contra `message_logs`
> significaría **perderla entera, e irrecuperablemente**, el día que se pode esa tabla: todos los débitos
> quedarían sin sede a la vez. Un asiento contable no puede colgar de una FK que se anula. Es el mismo
> criterio por el que la 00033 ya guarda `unit_price_cop` como snapshot.

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `tenant_id` | `tenants(id)` | RESTRICT |
| `message_log_id` | `message_logs(id)` | **SET NULL** |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |

**Índices:** `idx_wallet_txns_tenant (tenant_id, created_at DESC)`, `idx_tenant_wallet_transactions_location_id (tenant_id, location_id) WHERE location_id IS NOT NULL` (00043).

**RLS:** `super_admin_all_wallet_txns` FOR ALL — `USING/WITH CHECK (is_super_admin())`.

---

### send_queue

> Cola de goteo de los envíos que no cupieron hoy (migración 00037; el arriendo `claimed_at` y las
> funciones de drenado, en la 00038). Ver `docs/features/send-governance.md`.
>
> **Sección creada por la 00043.** La fila 18 del Índice de Tablas apuntaba a un ancla inexistente.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → tenants(id) ON DELETE CASCADE |
| `phone` | `text` | NO | - | Destino |
| `customer_id` | `uuid` | SI | `NULL` | FK → customers(id) ON DELETE CASCADE |
| `imported_contact_id` | `uuid` | SI | `NULL` | FK → imported_contacts(id) ON DELETE CASCADE |
| `campaign_id` | `uuid` | SI | `NULL` | FK → campaigns(id) ON DELETE CASCADE |
| `priority` | `smallint` | NO | - | 0-4 (CHECK) |
| `message_type` | `text` | NO | - | Tipo de mensaje (espejo de `message_class_map`) |
| `template_sid` | `text` | NO | - | Puntero de plantilla |
| `variables` | `jsonb` | NO | `'{}'` | Variables de la plantilla |
| `media_url` / `media_type` | `text` | SI | `NULL` | Media opcional |
| `status` | `text` | NO | `'queued'` | `queued` \| `sent` \| `failed` \| `cancelled` \| `expired` |
| `not_before` | `timestamptz` | NO | `now()` | No enviar antes de |
| `expires_at` | `timestamptz` | SI | `NULL` | Vencido = **nunca** se envía |
| `attempts` | `smallint` | NO | `0` | Reintentos |
| `last_error` | `text` | SI | `NULL` | - |
| `claimed_at` | `timestamptz` | SI | `NULL` | **(00038)** Arriendo del drenador, no un estado |
| `enqueued_at` / `sent_at` | `timestamptz` | | | - |
| `message_log_id` | `uuid` | SI | `NULL` | FK → message_logs(id) ON DELETE SET NULL |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede del envío encolado, para que el goteo **no pierda la sede** entre encolar y drenar. Se copiará a `message_logs.location_id` al enviar (F6). NULL = sede desconocida |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `tenant_id` | `tenants(id)` | CASCADE |
| `customer_id` | `customers(id)` | CASCADE |
| `campaign_id` | `campaigns(id)` | CASCADE |
| `message_log_id` | `message_logs(id)` | SET NULL |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |

**Índices:** el único parcial anti-duplicado `(tenant_id, phone, COALESCE(campaign_id, centinela), message_type) WHERE status='queued'` (00038 — el de la 00037 dejaba sin proteger los items sin `campaign_id`, porque en Postgres dos NULL nunca colisionan), `idx_send_queue_drain`, `idx_send_queue_drain_tenant`, `idx_send_queue_campaign`, `idx_send_queue_expires`, `idx_send_queue_location_id (tenant_id, location_id) WHERE location_id IS NOT NULL` (00043).

---

### consent_events

> Libro de evidencia de opt-in/opt-out (migración 00037). **APPEND-ONLY**: `UPDATE` y `DELETE` están
> revocados para `anon` y `authenticated`, y no hay política que los permita — un libro que se puede
> editar no es evidencia. Ver `docs/features/send-governance.md`.
>
> **Sección creada por la 00043.** La fila 20 del Índice de Tablas apuntaba a un ancla inexistente.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | - | FK → tenants(id) ON DELETE CASCADE |
| `customer_id` | `uuid` | SI | `NULL` | FK → customers(id) ON DELETE SET NULL |
| `phone` | `text` | NO | - | Siempre disponible, aunque no haya customer |
| `event` | `text` | NO | - | `opt_in` \| `opt_out` (CHECK) |
| `channel` | `text` | NO | - | `checkin_qr` \| `whatsapp_reply` \| `import` \| `manual` \| `staff` (CHECK) |
| `consent_text` | `text` | SI | `NULL` | El texto **exacto** que vio el cliente (las plantillas cambian) |
| `evidence` | `jsonb` | NO | `'{}'` | Evidencia adicional |
| `location_id` | `uuid` | SI | `NULL` | **Nueva (00043).** Sede donde se registró el consentimiento. **Es EVIDENCIA, NO PERMISO**: el opt-in/opt-out sigue siendo **de la MARCA** (§6.4 del spec) — un cliente que dice *"no me escriban"* no lo dice por sede. Esta columna solo permite reconstruir dónde ocurrió el hecho. NULL = sede desconocida |
| `occurred_at` | `timestamptz` | NO | `now()` | - |

**Foreign Keys:**

| Columna | Referencia | On Delete |
|---------|------------|-----------|
| `tenant_id` | `tenants(id)` | CASCADE |
| `customer_id` | `customers(id)` | SET NULL |
| `(location_id, tenant_id)` | `restaurant_locations(id, tenant_id)` | **RESTRICT** |

**Índices:** `idx_consent_events_lookup (tenant_id, phone, occurred_at DESC)`, `idx_consent_events_location_id (tenant_id, location_id) WHERE location_id IS NOT NULL` (00043).

---
## Storage Buckets

### event-media

> Bucket público de Supabase Storage para imágenes y videos de eventos del calendario.

- **Público:** SI (lectura anónima requerida para que Twilio/Meta puedan descargar el asset al enviar el WhatsApp)
- **Escritura:** Solo `authenticated`
- **Estructura recomendada de path:** `event-media/{event_id_or_temp}/{filename}`
- **Límites por tipo:** imagen ≤ 5MB (JPG/PNG); video ≤ 16MB (MP4) — validados a nivel de endpoint, no de Storage

**Políticas:**

| Nombre | Acción | Regla |
|--------|--------|-------|
| `event_media_public_read` | SELECT | `bucket_id='event-media'` (anónimo) |
| `event_media_admin_write` | INSERT | `bucket_id='event-media' AND auth.role()='authenticated'` |
| `event_media_admin_update` | UPDATE | `bucket_id='event-media' AND auth.role()='authenticated'` |
| `event_media_admin_delete` | DELETE | `bucket_id='event-media' AND auth.role()='authenticated'` |

---

## Historial de Migraciones

| # | Archivo | Fecha | Descripción | Estado |
|---|---------|-------|-------------|--------|
| 1 | `00001_initial_schema.sql` | 2026-04-07 | Schema inicial: customers, visits, rewards + RLS + trigger + seed data | ✅ Ejecutada |
| 2 | `00002_authorized_numbers.sql` | 2026-04-08 | Tabla authorized_numbers + RLS | Pendiente |
| 3 | `00003_delivery_fields.sql` | 2026-04-08 | Campos delivery en visits: address, payment_method, amount, raw_message | Pendiente |
| 4 | `00004_campaigns.sql` | 2026-04-08 | Tablas campaigns + campaign_messages + índices + RLS | Pendiente |
| 5 | `00005_add_city.sql` | 2026-04-08 | Campo city en customers + índice parcial | Pendiente |
| 6 | `00006_source_channels_frequency_cap.sql` | 2026-04-11 | source_channels + last_campaign_at en customers, error_message en campaign_messages, backfill | Pendiente |
| 7 | `00007_admin_settings.sql` | 2026-04-15 | Tabla admin_settings (key-value) + seed avg_ticket + RLS | Pendiente |
| 8 | `00008_accepts_marketing.sql` | 2026-04-15 | Campo accepts_marketing en customers + backfill | Pendiente |
| 9 | `00009_table_number.sql` | 2026-04-15 | Campo table_number en visits + índice | Pendiente |
| 10 | `00010_rewards_optional_milestone.sql` | 2026-05-07 | `rewards.visit_milestone` nullable + índice único parcial | Pendiente |
| 11 | `00011_rewards_black_tier.sql` | 2026-05-12 | `rewards.is_black` boolean para nivel BLACK | Pendiente |
| 12 | `00012_calendar_events_and_media.sql` | 2026-05-23 | Tabla `restaurant_events`, columnas `source/media_url/media_type` en `campaigns`, bucket `event-media` + RLS de Storage | Pendiente |
| 14 | `00014_geolocation.sql` | 2026-05-25 | Tabla `restaurant_locations`, columnas `checkin_lat/checkin_lon/checkin_distance_meters` en `customers`, función `calculate_distance()` Haversine | Pendiente |
| 15 | `00015_staff_qr_scan.sql` | 2026-05-30 | Tablas `staff_users`, `staff_devices`, FK `visits.registered_by_staff_id`, settings `checkin_mode`/`checkin_first_visit_free`, RLS staff + trigger updated_at | Pendiente |
| 19 | `00019_legacy_points_backfill.sql` | 2026-06-01 | Backfill de puntos para clientes con visitas previas al sistema de puntos: 1 visita → 75 pts, 2 visitas → 125 pts. Inserta `point_transactions` con source `admin_adjustment`. | Pendiente |
| 20 | `00020_message_logs.sql` | 2026-06-12 | Tabla `message_logs` para tracking de TODOS los mensajes WhatsApp (transaccionales + campañas) + índices + RLS. Resuelve hallazgos CRÍTICOS de la auditoría 12-Julio. | Pendiente |
| 21 | `00021_customer_whatsapp_opt_out.sql` | 2026-06-12 | Columna `customers.whatsapp_opt_out_at` + índice parcial. Opt-out persistente de WhatsApp (auditoría 12-Julio, tarea 8). | Pendiente |
| 22 | `00022_reward_redemptions.sql` | 2026-06-12 | Tabla `reward_redemptions` + índices + RLS + trigger anti-duplicado; columnas `redeemed`/`redeemed_at` en `mystery_box_results`. Tracking de entrega física de premios (v2.0.0). | Pendiente |
| 23 | `00023_imported_contacts.sql` | 2026-06-12 | Tabla `imported_contacts` + columna `customers.imported_contact_id` + RLS + seed `golden_bullet_enabled`/`twilio_cost_per_message_usd`. Golden Bullet (v2.0.0). | Pendiente |
| 24 | `00024_tenants.sql` | 2026-07-04 | Fundación multitenant: tabla `tenants` + funciones helper RLS que leen tenant/rol del JWT (`app_metadata`). | Pendiente |
| 25 | `00025_add_tenant_id.sql` | 2026-07-04 | Agrega `tenant_id uuid NULL REFERENCES tenants(id)` + índice a las 18 tablas de negocio (ver sección siguiente); dropea los uniques globales sobre `phone` que dejan de ser válidos. | Pendiente |
| 26 | `00026_multitenant_rls.sql` | 2026-07-04 | Reescribe las políticas RLS: el usuario autenticado ve solo su tenant; el service role sigue bypaseando RLS (por eso el scoping real vive en el código, ver más abajo). | Pendiente |
| 27 | `00027_wallet.sql` | 2026-07-04 | Tabla `tenant_wallet_transactions` — billetera prepagada COP por tenant (recargas/ajustes/reembolsos). NO tiene `tenant_id` propio de las 18 tablas de negocio (es la tabla de facturación). | Pendiente |
| 28 | `00028_seed_sushi_service.sql` | 2026-07-04 | Backfill de `tenant_id` en todos los datos existentes (tenant puente "Sushi Service"), activa `NOT NULL`, crea los uniques compuestos `(campo, tenant_id)` que reemplazan a los globales dropeados en 00025. | Pendiente |
| 29 | `00029_tenant_domain.sql` | 2026-07-05 | Columna `tenants.domain` + índice único parcial — resuelve el tenant por host header (subdominios existentes de cada restaurante) en vez de por slug en la URL. | Pendiente |
| 31 | `00031_reward_grants.sql` | 2026-07-11 | Tablas `campaign_rewards` y `reward_grants` + índices + índice único parcial anti-duplicado + RLS + backfill; `reward_redemptions.tier_id` pasa a nullable y gana `grant_id` + índice único parcial anti doble-entrega; `campaigns.source` admite `'reward_reminder'`; trigger `mark_grant_redeemed()`. Premios Otorgados (v2.3.0). | Pendiente |
| 32 | `00032_review_tracking.sql` | 2026-07-13 | `customers` gana `google_review_clicked_at` y `google_review_postponed_at` (la memoria del pop-up); tabla nueva `review_events` (funnel mostrado → click → pospuesto) + índices + RLS; funciones `merge_tenant_config(uuid, jsonb)` (merge atómico de `tenants.config`) y `log_review_shown_deduped(uuid, uuid, int)` (dedupe del evento `shown` en una sola sentencia) — fixes auditoría v2.5.1. Reseñas de Google (v2.5.0, Bloque 3). **Sin backfill: el premio por reseña reutiliza `reward_grants`, donde `source='review'` ya existía desde la 00031.** | Pendiente |
| 33 | `00033_wallet_debits.sql` | 2026-07-13 | El **débito** de la billetera. `tenants` gana `price_per_message_cop` (default 100, CHECK > 0), `low_balance_threshold_msgs`, `low_balance_notified_at`, `owner_phone`, `owner_email`. `tenant_wallet_transactions`: el CHECK de `type` admite `'debit'`; columnas nuevas `message_log_id` (FK, **UNIQUE parcial** → idempotencia), `unit_price_cop`, `quantity`, `source` (`manual`/`wompi`/`system`), `external_ref` (**UNIQUE parcial** `(source, external_ref)`). Trigger `trg_debit_wallet` sobre `message_logs` inserta el `debit` cuando `twilio_sid` deja de ser NULL. Función `tenant_messages_available()`. Billetera prepagada (v2.6.0, Bloques 1-3a). **Sin backfill: el ledger arranca en cero, no se cobra el histórico.** | Pendiente |
| 34 | `00034_demo_tenant_flag.sql` | 2026-07-29 | Columna `tenants.is_demo boolean DEFAULT false`. Consumida por el guard central en `sendTemplateMessage()` (`src/services/whatsapp.service.ts`): un tenant demo nunca llama a Twilio de verdad. Ver `docs/features/demo-tenant.md` y `scripts/seed-demo-tenant.sql` (clonado de datos desde Sushi Service + reset idempotente). Tenant Demo Ventas (v2.7.0). | Pendiente |
| 35 | `00035_aios_constelarys_role.sql` (v2) | 2026-08-29 | Rol de Postgres `aios_constelarys` (sin LOGIN hasta activarlo a mano) para el AIOS Constelarys — un proyecto SEPARADO (repo + Supabase propios, ver `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §11). v2 (tras code review): SELECT **por columnas** sobre `tenants` (sin credenciales Twilio/owner_*) y sobre `tenant_wallet_transactions`; CERO INSERT directo — la escritura queda para las funciones `SECURITY DEFINER` de la migración 00036. Cero acceso a `customers`/`visits`/cualquier otra tabla — doble candado (GRANT + RLS), no solo uno. | Pendiente |
| 36 | `00036_zernio_provider.sql` | 2026-08-29 | `tenants` gana `messaging_provider text DEFAULT 'twilio'` (CHECK `twilio`\|`zernio`), `zernio_profile_id`, `zernio_account_id` (índice único parcial — routing de webhooks), `zernio_phone_number` (E.164 con `+`, sin prefijo `whatsapp:`). GRANT SELECT de esas 4 columnas a `aios_constelarys` (se suma al de 00035 v2). Tres funciones `SECURITY DEFINER` — la ÚNICA vía de escritura del AIOS: `aios_provision_tenant(payload jsonb)` (alta completa, port fiel de `scripts/seed-new-tenant.sql`, sin upsert), `aios_activate_whatsapp(slug, profile, account, phone)` (activa Zernio en un tenant existente), `aios_set_template_settings(slug, settings jsonb)` (carga `*_template_sid`/`zernio_template_language` en `admin_settings`, **solo si el tenant ya es `messaging_provider='zernio'`** — bloquea el vector de ataque de sembrar SIDs en un tenant que cae al fallback de credenciales Twilio master). Requiere 00035 v2 aplicada antes. **Post-review:** tabla nueva `webhook_events_seen (provider, event_id, received_at)` PK compuesta `(provider, event_id)` + RLS habilitada sin políticas (solo `service_role`) — dedup de webhooks de `src/app/api/webhook/zernio/route.ts` (hallazgo F5); el regex de `aios_set_template_settings` ahora también acepta `event_template_image_sid`/`event_template_video_sid` explícitamente (hallazgo F6, el regex `_template_sid$` no las cubría). Migración a Zernio (v2.10.0). | Pendiente |
| 37 | `00037_send_governance.sql` | 2026-08-30 | **Gobernanza de envio.** `tenants` gana `messaging_daily_limit` (**NULL para los tenants que ya existian** = limite desconocido, se mide pero no se bloquea; DEFAULT 250 se agrega DESPUES del ADD COLUMN para que aplique solo a tenants nuevos — un DEFAULT en el ADD COLUMN habria capado en 250 a Sushi Service, que mueve ~2.000/dia), `messaging_limit_synced_at`, `quality_rating` (CHECK green|yellow|red|unknown), `line_status` (CHECK active|throttled|frozen), `line_status_reason`, `line_status_changed_at`. Tablas nuevas: `message_class_map` (catalogo: tipo -> clase de presupuesto + prioridad, espejo de `src/constants/messaging.ts`), `send_reservations` (ventana RODANTE de 24h, se cuenta `COUNT(DISTINCT phone)` porque Meta limita destinatarios unicos, no mensajes), `send_queue` (cola de goteo, indice unico parcial anti-duplicado), `line_health_snapshots`, `consent_events` (**append-only**: REVOKE UPDATE/DELETE, sin politica de UPDATE ni DELETE). Funciones: `line_budget(uuid)` (presupuesto derivado; el p95 se calcula sobre `message_logs`, NO sobre `send_reservations`, que se poda a 7 dias), `reserve_send_slot(uuid,text,text)` (**atomica via `pg_advisory_xact_lock` por tenant** — sin ese lock, el envio en paralelo se pasa del limite), `release_send_slot()`, `aios_line_health(text)`, `aios_set_line_status(text,text,text)`, `prune_send_governance()`. **`debit_wallet_on_message_sent()` se reescribe** (copia fiel de la 00033, incluido su `EXCEPTION WHEN OTHERS`) con UNA guarda nueva: los tenants `messaging_provider='zernio'` ya no se cobran, porque Meta les factura directo (decision D-2). Gobernanza de envio (v2.11.0, Bloques 1 y 8). | Pendiente |
| 38 | `00038_send_queue_drain.sql` | 2026-08-30 | **Cola de goteo (Bloque 2).** `send_queue` gana `claimed_at` — un **arriendo**, no un estado nuevo en el CHECK: dos invocaciones del drenador (n8n reintentando, o una corrida lenta solapándose) leerían los mismos items y el cliente recibiria el mensaje dos veces. **Anti-duplicado arreglado:** el indice de la 00037 era `(tenant_id, phone, campaign_id)` y en Postgres dos NULL nunca colisionan, asi que los items encolados por un cron (sin `campaign_id`) NO estaban protegidos; ahora es `(tenant_id, phone, COALESCE(campaign_id, centinela), message_type)`. Indices nuevos `idx_send_queue_drain_tenant` (el de la 00037 no llevaba `tenant_id`, asi que el round-robin del spec no lo podia usar) e `idx_send_queue_expires`. Funciones: `claim_send_queue()` (**atomica via `FOR UPDATE SKIP LOCKED`** — dos drenadores se reparten la cola en vez de duplicar; el UPDATE va dentro de un CTE porque el RETURNING de un UPDATE no respeta el ORDER BY del subselect), `expire_send_queue()`, `send_queue_pending_tenants()`, `send_queue_depth()`, `send_queue_finished_campaigns()` (cierra campanas cuya cola se vacio por cancelacion o vencimiento, caminos que no pasan por el envio), `enqueue_send_queue(jsonb)` (**va en SQL y no en `.upsert()` porque el `onConflict` de supabase-js solo admite listas de columnas y jamas podria apuntar a un indice parcial sobre expresion — caeria en la PK y el anti-duplicado no se aplicaria, en silencio**). **Bloque 9-10: blindaje de permisos.** `REVOKE ... FROM PUBLIC` **no basta en Supabase**: las default privileges conceden EXECUTE **nominal** a `anon` y `authenticated`, asi que toda funcion SECURITY DEFINER quedaba llamable con la anon key del navegador. Se nombran los roles, y el bloque 10 cierra tambien las de la 00035/00036 — incluida `aios_provision_tenant()`, que **crea tenants** y estaba abierta en produccion. Cola de goteo (v2.13.0, Bloque 2). | Pendiente |
| 39 | `00039_template_catalog.sql` | 2026-08-30 | **Catálogo estándar de plantillas.** Tabla nueva `template_versions`: guarda a la vez la plantilla **vigente** (`is_current`) y la **pendiente** de aprobación de Meta (`status='pending'`) de cada uno de los 13 mensajes, más el historial y **quién editó, cuándo y si aceptó la advertencia** (`edited_by`, `edited_by_email`, `disclaimer_accepted_at`) — requisito duro de la decisión 3 del dueño. Tres índices que son **invariantes, no optimizaciones**: `idx_template_versions_one_current` (una sola vigente por slot — `admin_settings` nunca queda ambiguo), `idx_template_versions_one_pending` (una sola edición en revisión por slot — dos pendientes competirían por el mismo puntero al aprobarse) y `idx_template_versions_provider_ref` (el `name` es único por WABA en Meta). Seed de `admin_settings.template_style='calido'` **solo en tenants `messaging_provider='zernio'`** — los 4 tenants Twilio no se tocan (decisión 6, textual: "déjalos así, ni los toques"). RLS por tenant. **`admin_settings.*_template_sid` sigue siendo el puntero vigente y su contrato NO cambia**: el camino de envío no se tocó, y con `template_versions` vacía el sistema envía igual que antes. Plantillas de WhatsApp (v2.12.0, §12). **Numeración: es la 00039 y no la 00038 porque esa la tomó `00038_send_queue_drain.sql`.** | Pendiente |
| 40 | `00040_is_super_admin_security_definer.sql` | 2026-09-01 | **Versiona un ALTER que solo existia aplicado A MANO en produccion.** `is_super_admin()` pasa a `SECURITY DEFINER SET search_path = pg_catalog, public`, con el MISMO cuerpo de la 00024. **Por que:** la funcion llama a `auth.jwt()`, y el rol `aios_constelarys` (00035 v2) no tiene USAGE sobre el schema `auth`. Como `tenants` tiene RLS y ese rol no es dueno ni tiene BYPASSRLS, sus SELECT evaluan las policies — y ahi conviven `aios_constelarys_select_tenants USING (true)` con `super_admin_all_tenants USING (is_super_admin())`. Postgres **no garantiza cortocircuitar el OR**, asi que evaluaba `is_super_admin()` en el contexto del rol que llama y el SELECT entero moria con `42501 permission denied for schema auth`. Sin esta migracion, reconstruir la base desde `supabase/migrations/` deja el AIOS roto sin pista de por que. **Es seguro:** `auth.jwt()` lee un ajuste de SESION, no un permiso del rol, asi que correr como `postgres` devuelve los mismos claims del que llama — no hay escalada. **No otorga ni revoca nada:** el EXECUTE a PUBLIC tiene que seguir, porque las policies la invocan como `anon` y `authenticated`. **Deuda que NO cierra:** `current_tenant_id()` tiene el mismo defecto (verificado: devuelve 42501) y se deja intacta a proposito — cambiarla altera el RLS de cada tabla multitenant y es decision del dueno. | Pendiente |
| 41 | `00041_locations_first_class.sql` | 2026-09-03 | **`restaurant_locations` deja de ser una geocerca y pasa a SER LA SEDE** (F1 del spec `docs/superpowers/specs/2026-09-02-multisede-design.md`). Columnas nuevas: `slug`, `domain`, `config jsonb NOT NULL DEFAULT '{}'`, `is_primary`, `sort_order`. **`lat`/`lon` pasan a NULLABLE** con `CHECK ((lat IS NULL) = (lon IS NULL))` — la tabla nació en la 00014 para la geocerca anti QR-scam, apagada desde v1.0.5-3, y ese `NOT NULL` hacía que el AIOS solo mandara `locations[]` con las dos coordenadas: **un negocio dado de alta sin coordenadas nacía SIN NINGUNA SEDE, en silencio** (por eso los 4 tenants vivos suman ~1 fila). Constraint **`restaurant_locations_id_tenant_key UNIQUE (id, tenant_id)`** — ⚠️ **nombre de contrato, no se cambia**: es el soporte de TODAS las FK compuestas `(location_id, tenant_id)` de la 00043; una FK simple dejaría grabar una visita de la marca A con la sede de la marca B. Índice único **GLOBAL** parcial sobre `domain` + único parcial `(tenant_id, slug)`. Trigger `trg_restaurant_locations_domain_guard` (SECURITY DEFINER, `search_path` fijo): unicidad **cruzada** contra `tenants.domain`, que **permite el solape solo dentro del mismo tenant** — es lo que deja que la sede principal repita el subdominio ya impreso en los QR sin reimprimir nada. CHECK de formato de `slug` y `domain`, espejo de `src/lib/domains.ts` del AIOS (va también en la base porque 55 archivos escriben con `service_role`, que bypasa RLS). **NO toca RLS ni ninguna fila de historia.** Sin `CREATE INDEX CONCURRENTLY`: el arnés de tests manda el archivo entero en un `client.query()` y moriría con 25001. | Pendiente |
| 42 | `00042_sede_principal_tenants_vivos.sql` | 2026-09-03 | **Migración de DATOS** (F1). Le da a cada tenant que ya existe su *"Sede principal"* y le delega el subdominio ya impreso en sus QR. Por tenant: **0 sedes** → crea `'Sede principal'` (`slug='sede-principal'`, `is_primary=true`, `domain = tenants.domain`, sin coordenadas); **1 sede** → la **adopta** (le pone `slug`/`domain` si faltan y `is_primary=true`) en vez de crear una segunda; **≥2 sedes** → **no la toca** y avisa con `RAISE WARNING`, porque elegir mal delegaría el subdominio impreso a la sede equivocada. **NO TOCA UNA SOLA FILA DE HISTORIA**: `visits`, `point_transactions`, `review_events` y `customers` se quedan como están, y cuando la 00043 les agregue `location_id` nace NULL y **se queda en NULL** — NULL significa "sede desconocida" y **SE MUESTRA** como un cubo propio llamado *"Sin sede"*, nunca se reparte ni se esconde. **Idempotente** (los `COALESCE` no pisan nada puesto a mano). `tenants.domain` e `idx_tenants_domain` (00029) **no se tocan**: `getTenantByDomain` sigue resolviendo igual y los 4 tenants Twilio funcionan exactamente como antes. | Pendiente |
| 43 | `00043_location_id_eventos.sql` | 2026-09-03 | **F2 de multi-sede: la dimensión "sede" en las 13 tablas de HECHOS.** 18 columnas nuevas, **todas vacías**: `visits` (`location_id` + `location_source` + `location_conflict`), `point_transactions`, `review_events`, `message_logs` (**dos**: `location_id` = a quién se imputa, `line_location_id` = por qué línea salió), `tenant_wallet_transactions`, `send_queue`, `consent_events`, `campaigns`, `authorized_numbers`, `restaurant_events` (+ `audience_scope`), `reward_grants.granted_location_id` (dónde se GANÓ), `reward_redemptions.redeemed_location_id` (dónde se ENTREGÓ), `customers` (`origin_location_id` + `last_visit_location_id`). **Regla transversal sin excepciones:** cada columna es NULLABLE y lleva **FK COMPUESTA** `(columna, tenant_id) REFERENCES restaurant_locations (id, tenant_id) ON DELETE RESTRICT` — una FK simple dejaría atribuir un hecho de la marca A a una sede de la marca B y el motor no diría nada; `RESTRICT` y no `SET NULL` porque una sede **nunca se borra, se desactiva** con `is_active=false`, y `SET NULL` degradaría historia a "sede desconocida" en silencio. `MATCH SIMPLE` (el default) es deliberado: `MATCH FULL` rechazaría cada fila de historia. **CERO backfill:** el histórico se queda en NULL = "sede desconocida", y se MUESTRA. **Cero cambio de comportamiento:** nadie lee estas columnas todavía (las llena F3, las lee F5/F6/F7), así que los 4 tenants Twilio siguen igual. `restaurant_events` es la **única** tabla donde NULL no significa "sede desconocida" — por eso lleva `audience_scope ('brand'\|'location') DEFAULT 'brand'` con CHECK que lo amarra a `location_id`. Abre con una **guarda** que aborta con 42830 si falta el `UNIQUE (id, tenant_id)` de la 00041, para no quedar aplicada a medias. | Pendiente |
| 44 | `00044_meseros_por_sede.sql` | 2026-09-03 | **F4 de multi-sede: los meseros por sede (D11)** — *"cada mesero es de cada sede, no se juntan jamás"*. `staff_users.location_id` y `staff_devices.location_id`, NULLABLE las dos y con la **FK COMPUESTA** `(location_id, tenant_id)` ON DELETE **RESTRICT** de la regla transversal, más su índice parcial. **Sin backfill:** los meseros que ya existen se quedan en NULL = *"mesero sin sede asignada"*, siguen trabajando exactamente igual (no aportan señal, la precedencia cae al host) y NINGÚN 403 nuevo los toca. **`staff_users_phone_tenant_key (phone, tenant_id)` NO se toca**: es lo que hace cumplir D11 en el motor. **Tapa una bomba verificada:** `staff_devices_fingerprint_tenant_key UNIQUE (device_fingerprint, tenant_id)` — hasta aquí `device_fingerprint` solo tenía índice normal (00018:41) y **siete** sitios del código hacen `.single()` sobre él; dos filas iguales = `PGRST116` = *"dispositivo no reconocido"* para siempre. Un bloque de guarda ABORTA con 23505 si ya hay duplicados, nombrándolos, en vez de deduplicar por su cuenta (borrar una fila saca del trabajo al dispositivo de alguien). **Dos triggers de coherencia** (`staff_device_sede_coherente()` / `staff_user_sede_coherente()`, ambos 23514): un dispositivo nunca queda a nombre de un mesero de otra sede **ni de otra marca** —esto último no lo cubre ninguna FK, porque `staff_devices_staff_user_id_fkey` es simple—, y mover de sede a un mesero con dispositivos en la sede vieja se rechaza en vez de arrastrarlos. Solo actúan con las dos sedes CONOCIDAS: NULL es *"desconocida"*, no *"otra"*. **Cierra las deudas #10 y #11:** `enqueue_send_queue(jsonb)` se reescribe con `CREATE OR REPLACE` (misma firma → conserva el REVOKE de la 00038) para copiar `send_queue.location_id`; y `log_review_shown_deduped` exige **DROP + CREATE** con un 4º parámetro `p_location_id uuid DEFAULT NULL` — añadir un parámetro NO reemplaza la función, crea una **sobrecarga**, y la llamada de 3 argumentos del servicio pasaría a ser **ambigua (42725)**, rompiendo el registro de impresiones dentro de un `catch` que solo escribe en consola. El DEFAULT al final hace que el orden de despliegue no importe. ⚠️ El **dedupe sigue siendo por (tenant, cliente) y NO por sede**, a propósito: meterle la sede subiría un número que el panel ya reporta hoy. | Pendiente |

### `tenant_id` en las 18 tablas de negocio

Las migraciones 00025/00028 agregan `tenant_id uuid NOT NULL REFERENCES tenants(id)` a: `customers,
visits, rewards, authorized_numbers, campaigns, campaign_messages, admin_settings, restaurant_events,
restaurant_locations, reward_tiers, point_transactions, mystery_box_results, mystery_box_global_caps,
staff_users, staff_devices, message_logs, reward_redemptions, imported_contacts`. `admin_settings` pasa
a tener PK compuesta `(key, tenant_id)`; `customers.phone`/`authorized_numbers.phone`/`staff_users.phone`
dejan de ser únicos globales (pasan a únicos compuestos con `tenant_id`).

**El 95% del acceso usa `getServiceClient()` (service-role), que ignora RLS por diseño** (crons,
webhooks, servicios). Por eso el filtro por tenant es **responsabilidad explícita del código**, no de
RLS — ver `docs/superpowers/plans/2026-07-05-multitenant-AUDIT-DELEGABLE.md` para el detalle de cómo
cada tipo de ruta resuelve su `tenantId` y el CHANGELOG `[v2.2.0]` para el resultado de la auditoría
que verificó esto en las ~48 rutas/servicios que tocan estas tablas.

---

## Funciones de Base de Datos

### handle_updated_at()
> Auto-actualiza `updated_at` en cada UPDATE.

```sql
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Resumen RLS

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| customers | Admin | Admin + Service | Admin + Service | NO |
| visits | Admin | Admin + Service | NO | NO |
| rewards | Admin | Admin | Admin | Admin |
| campaigns | Admin | Admin | Admin | Admin |
| campaign_messages | Admin | Service | Service | NO |
| authorized_numbers | Admin | Admin | Admin | Admin |
| admin_settings | Admin | Admin | Admin | NO |
| restaurant_events | Admin + Service | Admin + Service | Admin + Service | Admin |
| restaurant_locations | Tenant | Tenant | Tenant | Tenant |
| staff_users | Admin + Service | Admin + Service | Admin + Service | Admin |
| staff_devices | Admin + Service | Admin + Service | Admin + Service | Admin |
| message_logs | Admin | Service | Service | NO |
| reward_redemptions | Admin + Service | Service | Admin | NO |
| imported_contacts | Admin + Service | Admin + Service | Admin + Service | NO |
| campaign_rewards | Admin + Service | Admin + Service | Admin + Service | Admin (lógico, `is_active=false`) |
| reward_grants | Admin + Service | Service | Service | NO |
| review_events | Admin + Service | Service | Service | NO |
