# Checklist de Auditoría — Fix de Check-in (Puntos en 0 + Premio no aparece + "page couldn't load")

> **Fecha:** 2026-05-31
> **Objetivo:** Diagnosticar y documentar evidencia antes de aplicar cualquier fix de código.
> **Regla:** Este documento es SOLO auditoría. No contiene fixes de código.

---

## A. Base de datos (Supabase SQL Editor)

Ejecutar cada query y pegar el resultado (texto o screenshot) debajo.

### A.1 Confirmar columnas reales de `point_transactions`

> Copiar SOLO el bloque de abajo (sin las flechas ni el texto) y pegar en Supabase SQL Editor.

-- QUERY A.1 --
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'point_transactions'
ORDER BY ordinal_position;
-- FIN QUERY A.1 --

Resultado esperado segun analisis:
- reference_id (uuid) — ID de la visita/evento
- source (text) — 'visit_staff', 'visit_qr', 'visit_delivery', 'welcome_bonus', etc.
- NO debe existir: visit_id ni type

**Evidencia A.1 — Screenshot confirmado:**
Archivo: `docs/Error/audit-results/Captura de pantalla 2026-05-31 190819.png`
Resultado: columnas `reference_id` (uuid) y `source` (text) confirmadas. `visit_id` y `type` NO existen en la tabla.

---

### A.2 Estado del cliente afectado

> Copiar SOLO el bloque SQL de abajo. Reemplazar '300XXXXXXX' por el telefono real del cliente (Carito / Luis Moreno).

-- QUERY A.2 --
SELECT id, name, phone, total_points, total_visits, current_tier, mystery_box_low_streak, last_points_awarded_at
FROM customers
WHERE phone = '300XXXXXXX';
-- FIN QUERY A.2 --

| id                                   | name        | phone      | total_points | total_visits | current_tier | mystery_box_low_streak | last_points_awarded_at     |
| ------------------------------------ | ----------- | ---------- | ------------ | ------------ | ------------ | ---------------------- | -------------------------- |
| 08a9f38d-2359-4a01-990d-da336a3e4ee5 | Luis Moreno | 3011568923 | 190          | 3            | Plata        | 0                      | 2026-05-31 23:29:53.458+00 |:

segundo cliente que si debio cruzar tier

| id                                   | name        | phone      | total_points | total_visits | current_tier | mystery_box_low_streak | last_points_awarded_at     |
| ------------------------------------ | ----------- | ---------- | ------------ | ------------ | ------------ | ---------------------- | -------------------------- |
| 08a9f38d-2359-4a01-990d-da336a3e4ee5 | Luis Moreno | 3011568923 | 190          | 3            | Plata        | 0                      | 2026-05-31 23:29:53.458+00 |

---

### A.3 Transacciones de puntos del cliente (últimas 10)

> Copiar SOLO el bloque SQL. Reemplazar 'UUID_DEL_CLIENTE' por el id del cliente (obtenido en A.2).

-- QUERY A.3 --
SELECT pt.points, pt.source, pt.reference_id, pt.balance_after, pt.created_at,
       v.source as visit_source, v.table_number, v.created_at as visit_created_at
FROM point_transactions pt
LEFT JOIN visits v ON v.id = pt.reference_id
WHERE pt.customer_id = 'UUID_DEL_CLIENTE'
ORDER BY pt.created_at DESC
LIMIT 10;
-- FIN QUERY A.3 --

| points | source        | reference_id                         | balance_after | created_at                    | visit_source | table_number | visit_created_at              |
| ------ | ------------- | ------------------------------------ | ------------- | ----------------------------- | ------------ | ------------ | ----------------------------- |
| 60     | visit_staff   | 62791a1f-28d9-4d98-a4fb-c8afbd65fa06 | 190           | 2026-05-31 23:29:53.491538+00 | staff_scan   | 12           | 2026-05-31 23:29:53.360374+00 |
| 55     | visit_qr      | f75368a9-f7f8-429e-b4a5-77beeac36580 | 130           | 2026-05-31 23:26:50.036066+00 | qr           | null         | 2026-05-31 23:26:49.814938+00 |
| 75     | welcome_bonus | null                                 | 75            | 2026-05-31 19:04:50.29467+00  | null         | null         | null                          |:

---

### A.4 Visitas recientes del cliente

> Copiar SOLO el bloque SQL. Reemplazar 'UUID_DEL_CLIENTE' por el id del cliente.

-- QUERY A.4 --
SELECT id, created_at, source, table_number, registered_by_staff_id
FROM visits
WHERE customer_id = '08a9f38d-2359-4a01-990d-da336a3e4ee5'
ORDER BY created_at DESC
LIMIT 10;
-- FIN QUERY A.4 --

| id                                   | created_at                    | source     | table_number | registered_by_staff_id |
| ------------------------------------ | ----------------------------- | ---------- | ------------ | ---------------------- |
| 62791a1f-28d9-4d98-a4fb-c8afbd65fa06 | 2026-05-31 23:29:53.360374+00 | staff_scan | 12           | null                   |
| f75368a9-f7f8-429e-b4a5-77beeac36580 | 2026-05-31 23:26:49.814938+00 | qr         | null         | null                   |
| 2bfb3c5e-f910-4caa-9edb-ce087bc22715 | 2026-05-31 19:04:50.125219+00 | qr         | null         | null                   |:

---

### A.5 Mystery Box results del cliente

> Copiar SOLO el bloque SQL. Reemplazar 'UUID_DEL_CLIENTE' por el id del cliente.

-- QUERY A.5 --
SELECT tier_id, choice, prize_title, was_golden, created_at
FROM mystery_box_results
WHERE customer_id = '08a9f38d-2359-4a01-990d-da336a3e4ee5'
ORDER BY created_at DESC;
-- FIN QUERY A.5 --

Success. No rows returned:

---

### A.6 Configuración actual de tiers

> Copiar SOLO el bloque SQL.

-- QUERY A.6 --
SELECT id, tier_name, point_threshold, safe_reward_title, mystery_box_enabled, is_black, is_active, sort_order
FROM reward_tiers
ORDER BY sort_order;
-- FIN QUERY A.6 --

| id                                   | tier_name | point_threshold | safe_reward_title        | mystery_box_enabled | is_black | is_active | sort_order |
| ------------------------------------ | --------- | --------------- | ------------------------ | ------------------- | -------- | --------- | ---------- |
| 4258d5a5-f95b-4362-885b-6b04cc24033a | Plata     | 150             | Bebida gratis            | true                | false    | true      | 1          |
| 78b3fd9b-93df-47d4-acc6-418d453c1c0a | Plata     | 350             | Postre gratis            | true                | false    | false     | 2          |
| 2050379f-a1d8-45d8-91a9-48bab0ee7921 | Oro       | 300             | Postre gratis            | true                | false    | true      | 2          |
| 07c556c4-fd48-439b-ad86-21d88ac4db0a | Oro       | 600             | Plato fuerte gratis      | true                | false    | false     | 3          |
| 581bc4e0-203c-423f-8d0f-fee370764762 | Diamante  | 450             | Plato fuerte gratis      | true                | false    | true      | 3          |
| e748ee77-14ec-49c3-9531-a0235fc644e7 | BLACK     | 1000            | Experiencia Chef privada | true                | true     | true      | 4          |:

---

## B. Logs de Vercel (Functions)

### B.1 Instrucciones para extraer

1. Ir a [Vercel Dashboard](https://vercel.com) → Proyecto → **Logs** → filtro **Functions**.
2. Reproducir un check-in de prueba completo (cliente genera QR → mesero escanea → confirma).
3. Copiar TODO el output de las funciones afectadas durante la ventana de tiempo del test (~5 min).

### B.2 Líneas a buscar (copiar aquí los bloques completos)

- [ ] `[CheckIn] Puntos otorgados:` — confirma puntos calculados por el servidor
- [ ] `[CheckIn] ERROR otorgando puntos` — errores en awardVisitPoints
- [ ] `[CheckInStatus] Error` — errores del endpoint de polling
- [ ] Cualquier error de columna: `column ... does not exist`
- [ ] Cualquier error de RLS: `permission denied for table ...`
- [ ] Cualquier error de JWT: `JWTExpired`, `JWSSignatureVerificationFailed`

**Evidencia (pegar logs aquí):**

---

### B.3 Check-in de prueba: Carito (3011640522)

Cliente: `3011640522` | Puntos previos: 85 → Nuevos: 121 | Tier: (no reportado)

**Paso realizado:**
Cliente registra su número, recibe su QR, mesero escanea y sale pantalla de reload. Usuario debe tocar "volver" para ver los datos del cliente real.

**Log Vercel (resumen de sesión 2026-06-01 00:27–00:35):**
- `POST /api/check-in` — 200 OK
  - `[CheckIn] Generando QR token para cliente: 7de41974-5519-4bb5-bc3c-ee56cc292031 Carito`
  - `[CheckIn] QR token generado OK`
  - `[CheckIn] Puntos otorgados: +36 → balance=121 (prev=85)`
  - `[WhatsApp] Template enviado: MM136f6b3b007e6ec2f8368737b6256ed8`
  - `[GoogleSync] N8N_GOOGLE_CONTACTS_WEBHOOK_URL no configurada — sync omitido`
- `GET /api/check-in/status?phone=3011640522` — múltiples 200 OK (polling del cliente)
  - Duraciones: ~118–290ms, memoria ~296MB, status 200 consistente
  - No se observan errores 4xx/5xx en el backend
- `GET /mesero/confirm?token=eyJhbGciOiJIUzI1NiJ9...` — 200 OK (cache HIT)

**Errores Chrome:**
- `[WindowError] Cannot stop, scanner is not running or paused.` (html5-qrcode intenta detenerse cuando ya no está activo)
- `Unchecked runtime.lastError: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received` (extensión de Chrome)
- `Uncaught Cannot stop, scanner is not running or paused`

**Observación del usuario:**
> "no se identifican más errores en chrome, no se identifica en chrome la razón de tener que tocar volver para poder ver al cliente real"

---

## C. Navegación scan→confirm en celular del mesero

### C.1 Preparar DevTools remoto

1. En el celular del mesero: abrir Chrome → ir a `chrome://inspect` (requiere Chrome Desktop conectado por USB + Debug USB activado).
2. Alternativa: usar **Safari Web Inspector** (Mac + cable USB + Safari → Develop menu).

### C.2 Consola completa (copiar/pegar)

Reproducir escaneo completo y capturar:
- [ ] `[WindowError]` — errores globales de ventana
- [ ] `[UnhandledRejection]` — promesas rechazadas sin catch
- [ ] `[MeseroErrorBoundary]` — errores de React capturados por error.tsx
- [ ] `[Scanner] Error starting` — problemas con html5-qrcode
- [ ] Cualquier línea que diga `This page couldn't load`, `ChunkLoadError`, `Failed to load resource`

**Evidencia (pegar aquí):**
- `[WindowError] Cannot stop, scanner is not running or paused.` — `07x6ae59a33t8.js:1`
- `Unchecked runtime.lastError: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`
- `Uncaught Cannot stop, scanner is not running or paused` — `0bogtdbh.dcu1.js:1`

**Análisis:**
- El error proviene de `html5-qrcode` cuando el mesero intenta detener el scanner tras un escaneo exitoso, pero el scanner ya no está en estado "running" o "paused". Esto sugiere una race condition entre el callback de escaneo y la llamada a `stop()`.
- El `router.push` (App Router) puede estar fallando silenciosamente en móvil cuando el scanner aún no ha liberado la cámara, lo que explicaría por qué el usuario debe tocar "volver" para que la navegación se complete.

---

### C.3 Pestaña Network (capturar request que falla)

Buscar el request al ir a `/mesero/confirm?token=...`:

| Campo | Valor |
|-------|-------|
| Status code | 200 |
| Tipo de request | document (static) |
| URL completa | `/mesero/confirm?token=eyJhbGciOiJIUzI1NiJ9...` |
| Response body | (no disponible en logs Vercel) |
| ¿Hay redirect 307/308? | No — responde 200 directamente |

**Evidencia (screenshot o copia):**
- Log Vercel: `GET /mesero/confirm?token=...` → 200 OK, cache HIT, 77ms (static).
- No se observan errores 404/500 en la carga del documento.
- La navegación falla a nivel del cliente (scanner + router.push), no del servidor.

---

### C.4 Service Worker / PWA

1. En DevTools → **Application** → **Service Workers**.
2. Confirmar:
   - [x] ¿Hay un SW registrado para este dominio? **NO**
   - [ ] ¿Está en "Activated and is running"? — N/A
   - [ ] ¿Aparece algún error en la consola del SW? — N/A

**Evidencia (pegar aquí):**
Listado completo de Service Workers inspeccionado. **No existe Service Worker registrado para `clubsushiservice.constelarys.com`**. El dominio no tiene PWA/cache de navegación activo.

**Conclusión C.4:** El problema de navegación scan→confirm **NO está causado por un Service Worker** (no existe). La causa es la race condition del scanner + `router.push` confirmada en C.2.

---

## D. Variables de entorno (sin exponer valores)

Confirmar que existen en Vercel Dashboard → Settings → Environment Variables.

| Variable | ¿Existe? (Sí/No) | ¿Tiene valor? (Sí/No) | Notas |
|----------|-------------------|----------------------|-------|
| `STAFF_QR_JWT_SECRET` | **Sí** | Sí | Aparece como Sensitive, agregada 8h atrás. Nota: parece compartir línea con NEXT_PUBLIC_SUPABASE_ANON_KEY en el listado. |
| `STAFF_JWT_SECRET` | **No** | — | **NO aparece en el listado**. Variable crítica para auth de meseros. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sí** | Sí | Sensitive |
| `tier_unlocked_template_sid` | **No** | — | **NO aparece en el listado**. Sin esta variable no se puede enviar el template de tier desbloqueado. |
| `points_earned_far_template_sid` | **No** | — | **NO aparece en el listado**. |
| `points_earned_near_template_sid` | **No** | — | **NO aparece en el listado**. |
| `reward_safe_template_sid` | **No** | — | **NO aparece en el listado**. |
| `mystery_box_result_template_sid` | **No** | — | **NO aparece en el listado**. |

**Evidencia (listado proporcionado por el usuario, valores censurados):**
- `WEBHOOK_DELIVERY_SECRET` — Sensitive
- `SUPABASE_SERVICE_ROLE_KEY` — Sensitive
- `RESTAURANT_WHATSAPP_LINK`
- `NEXT_PUBLIC_BRAND_NAME`
- `TWILIO_WHATSAPP_NUMBER` — Sensitive
- `TWILIO_AUTH_TOKEN` — Sensitive
- `TWILIO_ACCOUNT_SID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `STAFF_QR_JWT_SECRET` (misma línea en listado)
- `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`
- `CRON_SECRET` — Sensitive
- `N8N_DOMICILIOS_WEBHOOK_URL`

**Hallazgo D.1 — Variables críticas faltantes:**
- `STAFF_JWT_SECRET`: no existe. El mesero no puede autenticarse sin esta variable.
- Las variables de template de WhatsApp (`tier_unlocked_template_sid`, `points_earned_*`, `reward_safe_template_sid`, `mystery_box_result_template_sid`) no existen. Aunque el log Vercel muestra que se envió un template (`MM136f6b3b...`), esto podría estar hardcodeado o usar un fallback.

---

## E. Resumen de hallazgos pre-fix

> Llenar esta sección DESPUÉS de completar A-D.

| Hipótesis | ¿Confirmada? | Evidencia |
|-----------|-------------|-----------|
| A. `point_transactions` usa `reference_id`/`source`, no `visit_id`/`type` | **SI** — Screenshot A.1 muestra `reference_id` y `source`. No hay `visit_id` ni `type`. | Query A.1 + `src/types/database.types.ts:133-147` |
| B. `GET /api/check-in/status` NO devuelve `tier_unlocked` | **SI** — Código fuente confirma el endpoint no calcula ni retorna `tier_unlocked`. Cliente Luis (190 pts, Plata) nunca veria premio aunque cruzara tier. | `src/app/api/check-in/status/route.ts` líneas 74-89 + `CheckInForm.tsx:137-150` |
| C. `CheckInForm.tsx` hardcodea `message: 'points_earned'` | **SI** — El polling ignora `data.tier_unlocked` y siempre pone `message: 'points_earned'`. | `src/components/features/check-in/CheckInForm.tsx:139` |
| D. Navegación scan→confirm falla por `router.push` en móvil | **SI** — Chrome DevTools confirma error `Cannot stop, scanner is not running or paused` de html5-qrcode al intentar navegar. El usuario debe tocar "volver" para ver al cliente. Evidencia de race condition entre scanner.stop() y router.push. | Sección C.2 + B.3 |
| E. `confirm/page.tsx` consume `sessionStorage` antes de confirmar navegación | **SI** — Código fuente confirma `sessionStorage.removeItem` en el lazy initializer del primer render. | `src/app/(public)/mesero/confirm/page.tsx:49` |
| F. Tiers duplicados/inactivos en DB | **SI** — Hay tiers legacy inactivos (Plata 350, Oro 600) que pueden afectar evaluación. | Query A.6 |
| G. Backend `POST /api/check-in` otorga puntos correctamente | **SI** — Log Vercel confirma `Puntos otorgados: +36 → balance=121 (prev=85)`. El problema de "+0 puntos" NO está en el registro de visita, sino en el endpoint de polling `/api/check-in/status` que usa columnas incorrectas (`visit_id`/`type`). | Sección B.3 |

### Datos del cliente de prueba (Luis Moreno)

| Campo | Valor |
|-------|-------|
| `id` | 08a9f38d-2359-4a01-990d-da336a3e4ee5 |
| `phone` | 3011568923 |
| `total_points` | 190 |
| `total_visits` | 3 |
| `current_tier` | Plata |
| `last_points_awarded_at` | 2026-05-31 23:29:53.458+00 |

### Transacciones de puntos (Query A.3)

| points | source | balance_after | created_at |
|--------|--------|---------------|------------|
| 60 | visit_staff | 190 | 2026-05-31 23:29:53.491538+00 |
| 55 | visit_qr | 130 | 2026-05-31 23:26:50.036066+00 |
| 75 | welcome_bonus | 75 | 2026-05-31 19:04:50.29467+00 |

### Visitas registradas (Query A.4)

| id | source | table_number | created_at |
|----|--------|--------------|------------|
| 62791a1f-28d9-4d98-a4fb-c8afbd65fa06 | staff_scan | 12 | 2026-05-31 23:29:53.360374+00 |
| f75368a9-f7f8-429e-b4a5-77beeac36580 | qr | null | 2026-05-31 23:26:49.814938+00 |
| 2bfb3c5e-f910-4caa-9edb-ce087bc22715 | qr | null | 2026-05-31 19:04:50.125219+00 |

### Mystery Box results (Query A.5)

**No rows returned** — Cliente nunca ha reclamado un premio. Si cruzara un tier, debería ver la UI de elección.

### Tiers activos en DB (Query A.6)

| tier_name | threshold | is_active | sort_order |
|-----------|-----------|-----------|------------|
| Plata | 150 | true | 1 |
| Oro | 300 | true | 2 |
| Diamante | 450 | true | 3 |
| BLACK | 1000 | true | 4 |

**Nota:** También existen tiers legacy INACTIVOS: Plata 350 (inactive), Oro 600 (inactive). El servicio `getAllTiers()` debe filtrar por `is_active = true`.

---

*Documento generado para auditoría pre-fix. No modificar código hasta completar esta checklist y analizar la evidencia.*
