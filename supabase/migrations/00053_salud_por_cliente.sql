-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00053 — Salud por cliente (§24-A / §24-B)
-- ═══════════════════════════════════════════════════════════════
-- Pedido del dueño (2026-09-07): «en AIOS, para cada cliente, un lugar donde
-- pueda ver que se estén recibiendo domicilios satisfactoriamente, que se estén
-- enviando mensajes, salud de WhatsApp, los indicadores esenciales — un panel
-- con la tarea y un bombillito verde, amarillo o rojo».
--
-- Es el §24 de `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`, con un
-- cambio de sujeto: n8n ya está apagado, así que el semáforo no vigila el VPS,
-- vigila los crons de Vercel, la línea de Meta y el intake de domicilios.
--
-- ───────────────────────────────────────────────────────────────
-- POR QUÉ HACE FALTA UNA MIGRACIÓN PARA UN PANEL DE SOLO LECTURA
-- ───────────────────────────────────────────────────────────────
-- El rol `aios_constelarys` (00035 v2) solo puede leer `tenants` (9 columnas) y
-- `tenant_wallet_transactions`. `visits`, `message_logs` y `send_queue` están
-- CERRADAS a propósito (§4 de esa migración), y así se quedan: el AIOS no
-- recibe ni un GRANT nuevo sobre una tabla. En su lugar, esta migración le da
-- EXECUTE sobre UNA función `SECURITY DEFINER` que devuelve agregados —
-- exactamente el patrón de `aios_line_health()` (00037 §11).
--
-- Consecuencia buscada: el AIOS puede decir «este cliente lleva 3 días sin un
-- domicilio» y NO puede leer un solo teléfono, nombre ni dirección de un
-- comensal. La superficie de datos personales expuesta al CRM sigue en cero.
--
-- ───────────────────────────────────────────────────────────────
-- LA FUNCIÓN DEVUELVE HECHOS, NO COLORES
-- ───────────────────────────────────────────────────────────────
-- Ni un umbral vive en este archivo. Aquí salen conteos, marcas de tiempo y
-- líneas base; quién es verde, amarillo o rojo lo decide
-- `src/lib/health/traffic-light.ts` en el repo del AIOS. Es deliberado: afinar
-- un umbral es una tarde de uso real, y no puede costar una migración sobre
-- datos de producción cada vez.
--
-- ⚠️ ORDEN DE DESPLIEGUE: esta migración va ANTES del código del AIOS que la
-- usa. Al revés, `aios_health()` no existe y la pantalla `/salud` responde con
-- el aviso de «no se pudo consultar» — no rompe nada, pero no sirve para nada.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. §24-B — el domicilio que se pierde deja rastro en una tabla
-- ─────────────────────────────────────────────────────────────
-- Hasta hoy, `logDeliveryIntakeFailure()` (el ÚNICO embudo por el que se pierde
-- un domicilio) escribía en el log de Vercel y en ningún otro sitio. Eso es el
-- ROJO 3 de `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md`, y es lo que hace
-- imposible el bombillo que pidió el dueño: sin esta tabla, «llegaron tres
-- pedidos y se perdieron los tres» y «hoy no pidió nadie» son EL MISMO dato —
-- cero filas en `visits` — y ningún semáforo honesto puede pintarlos distinto.
--
-- El log de Vercel no la reemplaza: se retiene poco, no se consulta por SQL y
-- el AIOS no lo puede leer.
CREATE TABLE IF NOT EXISTS delivery_intake_failures (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SIN DEFAULT, a propósito. Las 18 tablas de la 00028 conservan el DEFAULT
    -- puente que manda a Sushi Service todo INSERT que olvide el tenant (la
    -- 00030 nunca se aplicó). Una tabla NUEVA no repite ese error: acá, un
    -- INSERT sin `tenant_id` FALLA en vez de atribuirle el fallo a otra marca.
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operator_phone text,
    reason         text NOT NULL,
    detail         text NOT NULL,
    raw_message    text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE delivery_intake_failures IS
  'S24-B. Un pedido de domicilio que NO llego a la base, con su motivo real. Lo escribe logDeliveryIntakeFailure() de delivery.service.ts y NADIE mas: si aparece un segundo escritor, el embudo dejo de ser uno.';
COMMENT ON COLUMN delivery_intake_failures.reason IS
  'DeliveryIntakeReason de src/services/delivery.service.ts. Texto libre a proposito: un CHECK obligaria a una migracion cada vez que el intake aprende a fallar de una forma nueva, y perder el motivo es peor que guardarlo sin validar.';
COMMENT ON COLUMN delivery_intake_failures.raw_message IS
  'El cuadro del pedido tal como lo escribio el operador, recortado a 2000. CONTIENE DATOS PERSONALES del comensal (nombre, celular, direccion): es lo que permite reprocesar el pedido a mano. Nunca sale hacia el AIOS: aios_health() solo devuelve CONTEOS y el motivo.';

-- Sin `location_id`, y es una decisión, no un olvido: el fallo más traicionero
-- (`remitente_no_verificable`) ocurre justo cuando la consulta a
-- `authorized_numbers` falló, así que ahí la sede es INCONOCIBLE por
-- definición. Una columna que nace casi siempre NULL es la deuda D13 otra vez.

CREATE INDEX IF NOT EXISTS idx_delivery_failures_tenant_fecha
    ON delivery_intake_failures (tenant_id, created_at DESC);

ALTER TABLE delivery_intake_failures ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que el resto del producto: cada marca ve lo suyo. El panel del
-- restaurante (§24-B parte B) es trabajo aparte, pero la política va ya para
-- que el día que se escriba no haya que tocar permisos con datos dentro.
DROP POLICY IF EXISTS "tenant_read_delivery_failures" ON delivery_intake_failures;
CREATE POLICY "tenant_read_delivery_failures" ON delivery_intake_failures
    FOR SELECT USING (tenant_id = current_tenant_id() OR is_super_admin());

-- Append-only para la aplicación: un fallo se registra y no se edita ni se
-- borra. El que pueda maquillar el registro de fallos no tiene un registro.
REVOKE UPDATE, DELETE ON delivery_intake_failures FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- 2. Índices que el panel necesita (y que el dashboard agradece)
-- ─────────────────────────────────────────────────────────────
-- `visits` y `message_logs` tienen índice por `created_at` y por `customer_id`,
-- pero ninguno por `(tenant_id, created_at)`. Toda consulta de este panel —y
-- casi toda la del dashboard— filtra por esas dos a la vez.
CREATE INDEX IF NOT EXISTS idx_visits_tenant_fecha
    ON visits (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_source_fecha
    ON visits (tenant_id, source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_tenant_fecha
    ON message_logs (tenant_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. aios_health() — una llamada, las 25 sedes
-- ─────────────────────────────────────────────────────────────
-- Devuelve un objeto con dos partes:
--
--   · `crons`   — señales GLOBALES, no por cliente. Los crons de Vercel corren
--                 una vez para TODAS las marcas, así que preguntarle a un
--                 tenant «¿corrió el de cumpleaños?» da falsos rojos: un día
--                 sin cumpleañeros se ve igual que un cron caído. Medido sobre
--                 todo el producto, un silencio sí significa algo.
--
--   · `tenants` — una fila por marca, con lo que sí es suyo.
--
-- ⚠️ LÍMITE CONOCIDO Y ACEPTADO: la señal de los crons es DERIVADA (el último
-- mensaje de ese tipo que salió), no un latido. Un día en que de verdad no
-- había a quién escribirle se ve igual que un cron caído. Distinguirlos exige
-- que cada cron escriba su propia corrida, y eso toca los 5 archivos de
-- `src/app/api/cron/` — trabajo aparte. Hasta entonces la interfaz lo dice con
-- todas las letras en vez de fingir certeza.
CREATE OR REPLACE FUNCTION aios_health(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'captured_at', now(),
    'crons', (
      SELECT jsonb_build_object(
        'birthday_last_at',        max(created_at) FILTER (WHERE message_type = 'birthday'),
        'reactivation_last_at',    max(created_at) FILTER (WHERE message_type = 'reactivation'),
        'reward_reminder_last_at', max(created_at) FILTER (WHERE message_type = 'reward_reminder'),
        'calendar_event_last_at',  max(created_at) FILTER (WHERE message_type IN ('calendar_event','event')),
        'queue_drain_last_at',     (SELECT max(sent_at) FROM send_queue WHERE status = 'sent')
      )
      FROM message_logs
      WHERE created_at >= now() - interval '30 days'
    ),
    'tenants', COALESCE(
      (SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.slug) FROM (
        SELECT
          t.slug,
          t.name,
          t.is_active,
          t.is_demo,

          -- ── Salud de WhatsApp (lo mismo que ya lee aios_line_health) ──
          t.messaging_provider,
          t.line_status,
          t.line_status_reason,
          t.quality_rating,
          t.messaging_daily_limit,
          (lb.budget->>'used_24h')::integer           AS line_used_24h,
          (lb.budget->>'campaign_available')::integer AS line_campaign_available,
          (SELECT max(s.captured_at) FROM line_health_snapshots s
            WHERE s.tenant_id = t.id)                 AS line_last_snapshot_at,

          -- ── Domicilios que SÍ entraron ──
          dom.deliveries_24h,
          dom.deliveries_7d,
          dom.deliveries_28d,
          dom.last_delivery_at,
          -- La línea base contra la que se mide el silencio: en cuántos días
          -- distintos de los últimos 28 entró al menos un pedido. Un umbral
          -- fijo le sirve a Sushi Service (542 clientes) y le miente a Café
          -- Frangal (8); esto deja que cada marca fije el suyo.
          dom.active_days_28d,

          -- ── Domicilios que se PERDIERON (§24-B) ──
          fal.failures_24h,
          fal.failures_7d,
          fal.last_failure_at,
          fal.last_failure_reason,

          -- ── Vida del local: el QR y el escáner del mesero ──
          vis.checkins_24h,
          vis.checkins_7d,
          vis.last_checkin_at,

          -- ── Mensajes saliendo ──
          msg.messages_24h,
          msg.messages_failed_24h,
          msg.messages_7d,
          msg.messages_failed_7d,
          msg.last_message_at,

          -- ── La cola de goteo ──
          -- `queue_due` cuenta solo lo que YA debería haber salido: un
          -- mensaje programado para mañana no es un atasco.
          col.queue_due,
          col.queue_oldest_due_at,
          col.queue_failed_24h

        FROM tenants t

        LEFT JOIN LATERAL (SELECT line_budget(t.id) AS budget) lb ON true

        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE v.created_at >= now() - interval '24 hours')::integer AS deliveries_24h,
                 count(*) FILTER (WHERE v.created_at >= now() - interval '7 days')::integer   AS deliveries_7d,
                 count(*)::integer                                                            AS deliveries_28d,
                 max(v.created_at)                                                            AS last_delivery_at,
                 count(DISTINCT date_trunc('day', v.created_at))::integer                     AS active_days_28d
            FROM visits v
           WHERE v.tenant_id = t.id
             AND v.source = 'delivery'
             AND v.created_at >= now() - interval '28 days'
        ) dom ON true

        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE f.created_at >= now() - interval '24 hours')::integer AS failures_24h,
                 count(*) FILTER (WHERE f.created_at >= now() - interval '7 days')::integer   AS failures_7d,
                 max(f.created_at)                                                            AS last_failure_at,
                 (SELECT f2.reason FROM delivery_intake_failures f2
                   WHERE f2.tenant_id = t.id
                   ORDER BY f2.created_at DESC LIMIT 1)                                       AS last_failure_reason
            FROM delivery_intake_failures f
           WHERE f.tenant_id = t.id
             AND f.created_at >= now() - interval '28 days'
        ) fal ON true

        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE v.created_at >= now() - interval '24 hours')::integer AS checkins_24h,
                 count(*) FILTER (WHERE v.created_at >= now() - interval '7 days')::integer   AS checkins_7d,
                 max(v.created_at)                                                            AS last_checkin_at
            FROM visits v
           WHERE v.tenant_id = t.id
             AND v.source IN ('qr','staff_scan')
             AND v.created_at >= now() - interval '28 days'
        ) vis ON true

        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE l.created_at >= now() - interval '24 hours')::integer AS messages_24h,
                 count(*) FILTER (WHERE l.created_at >= now() - interval '24 hours'
                                    AND l.status IN ('failed','undelivered'))::integer        AS messages_failed_24h,
                 count(*) FILTER (WHERE l.created_at >= now() - interval '7 days')::integer   AS messages_7d,
                 count(*) FILTER (WHERE l.created_at >= now() - interval '7 days'
                                    AND l.status IN ('failed','undelivered'))::integer        AS messages_failed_7d,
                 max(l.created_at)                                                            AS last_message_at
            FROM message_logs l
           WHERE l.tenant_id = t.id
             AND l.created_at >= now() - interval '7 days'
        ) msg ON true

        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE q.status = 'queued' AND q.not_before <= now())::integer AS queue_due,
                 min(q.not_before) FILTER (WHERE q.status = 'queued' AND q.not_before <= now()) AS queue_oldest_due_at,
                 count(*) FILTER (WHERE q.status = 'failed'
                                   AND q.enqueued_at >= now() - interval '24 hours')::integer   AS queue_failed_24h
            FROM send_queue q
           WHERE q.tenant_id = t.id
        ) col ON true

        WHERE p_slug IS NULL OR t.slug = p_slug
      ) x),
      '[]'::jsonb
    )
  );
$fn$;

COMMENT ON FUNCTION aios_health(text) IS
  'S24-A. Tablero de salud del AIOS: hechos por marca (domicilios, envio, linea, cola) mas senales globales de los crons. Devuelve CONTEOS, nunca datos de un comensal. Los umbrales del semaforo NO viven aca: viven en el repo del AIOS.';

-- ─────────────────────────────────────────────────────────────
-- 4. Permisos: solo el AIOS, y solo EXECUTE
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION aios_health(text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    GRANT EXECUTE ON FUNCTION aios_health(text) TO aios_constelarys;
    -- `aios_health` es SECURITY DEFINER y llama a `line_budget()`, que también
    -- lo es, así que hoy el GRANT de abajo no hace falta. Se deja igual que en
    -- la 00037: si algún día `line_budget` pasa a INVOKER, el panel sigue
    -- funcionando en vez de romperse en silencio.
    GRANT EXECUTE ON FUNCTION line_budget(uuid) TO aios_constelarys;
  END IF;
END $$;

-- El rol NO recibe ningún privilegio sobre `delivery_intake_failures`, ni sobre
-- `visits`, `message_logs` o `send_queue`. Sigue sin poder leer una sola fila
-- de ninguna de ellas: todo pasa por la función de arriba.

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN (correr conectado como aios_constelarys, no como postgres)
--   SELECT aios_health();                                  -- ok, jsonb
--   SELECT aios_health('sushi-service');                   -- ok, 1 marca
--   SELECT * FROM delivery_intake_failures LIMIT 1;        -- permission denied
--   SELECT count(*) FROM visits;                           -- permission denied
-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00053
-- ═══════════════════════════════════════════════════════════════
