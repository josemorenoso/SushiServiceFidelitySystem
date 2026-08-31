-- ═══════════════════════════════════════════════════════════════
-- Migration 00038: Cola de goteo — lo que le falta a send_queue para drenarse
-- Fecha: 2026-08-30
-- Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.4 (Bloque 2)
--
-- `00037` ya creó la tabla `send_queue`, pero solo la tabla. Esta migración
-- añade lo que hace falta para que un drenador la consuma sin pisarse a sí
-- mismo ni degradar con volumen.
--
-- Depende de: 00037 (send_queue, message_class_map)
-- Aplicar DESPUÉS de 00037, en el SQL Editor de Supabase.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Arriendo de items (claim) para que dos drenadores no envíen lo mismo
-- ─────────────────────────────────────────────────────────────
-- El drenador lo dispara n8n cada 15 min, pero una invocación lenta puede
-- solaparse con la siguiente, y n8n reintenta ante un timeout de red. Sin un
-- claim, las dos corridas leen los mismos items `queued` y el cliente recibe el
-- mensaje dos veces.
--
-- Se usa `claimed_at` como ARRIENDO en vez de un estado 'sending' nuevo:
-- añadir un valor al CHECK de `status` obligaría a revisar cada consulta que
-- filtra por 'queued'. Un arriendo vencido se vuelve a tomar solo, así que un
-- drenador que muera a mitad no deja items clavados para siempre.
ALTER TABLE send_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN send_queue.claimed_at IS
  'Arriendo del drenador. Un item con claimed_at reciente está siendo enviado por otra invocación. El arriendo vence solo (ver claim_send_queue), así que un drenador caído no deja items bloqueados.';

-- ─────────────────────────────────────────────────────────────
-- 2. Índices que el drenador necesita de verdad
-- ─────────────────────────────────────────────────────────────
-- El de 00037 es (status, priority, not_before) SIN tenant_id, así que el
-- round-robin por tenant que pide el spec (§3.4) no lo puede usar: con 5.000
-- items de un tenant el plan degrada a recorrer el índice parcial entero.
CREATE INDEX IF NOT EXISTS idx_send_queue_drain_tenant
    ON send_queue (tenant_id, priority, not_before, enqueued_at)
 WHERE status = 'queued';

-- Para el barrido de vencidos.
CREATE INDEX IF NOT EXISTS idx_send_queue_expires
    ON send_queue (expires_at)
 WHERE status = 'queued' AND expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Anti-duplicado que TAMBIÉN cubre los items sin campaña
-- ─────────────────────────────────────────────────────────────
-- El índice de 00037 es (tenant_id, phone, campaign_id) WHERE status='queued'.
-- En Postgres dos NULL nunca colisionan en un índice único, así que los items
-- encolados por un cron (que no tienen campaign_id) quedaban SIN protección:
-- dos corridas del mismo cron encolaban el mismo teléfono dos veces.
--
-- COALESCE a un UUID centinela cierra ese hueco. Se añade `message_type` para
-- no impedir lo legítimo: un cliente sí puede tener a la vez en cola su
-- cumpleaños y una campaña manual — son mensajes distintos.
DROP INDEX IF EXISTS idx_send_queue_no_dup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_send_queue_no_dup
    ON send_queue (
         tenant_id,
         phone,
         COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
         message_type
       )
 WHERE status = 'queued';

-- ─────────────────────────────────────────────────────────────
-- 4. Barrido de vencidos
-- ─────────────────────────────────────────────────────────────
-- Spec §3.3: «Un cumpleaños entregado mañana no vale nada; un recordatorio de
-- premio entregado después de que venció la ventana tampoco.» Un item vencido
-- NUNCA se envía: pasa a 'expired' y se acabó.
CREATE OR REPLACE FUNCTION expire_send_queue()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count integer;
BEGIN
  UPDATE send_queue
     SET status = 'expired',
         last_error = 'expires_at vencido antes de encontrar cupo'
   WHERE status = 'queued'
     AND expires_at IS NOT NULL
     AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION expire_send_queue() IS
  'Marca como expired los items cuya ventana pasó. Lo llama el drenador ANTES de reclamar, para no gastar cupo en mensajes que ya no sirven.';

-- ─────────────────────────────────────────────────────────────
-- 5. Tenants con cola pendiente (para el round-robin)
-- ─────────────────────────────────────────────────────────────
-- El drenador no puede recorrer todos los tenants: la mayoría no tiene cola.
-- Devuelve solo los que sí, con su profundidad, para repartir el presupuesto de
-- tiempo entre ellos.
CREATE OR REPLACE FUNCTION send_queue_pending_tenants()
RETURNS TABLE (tenant_id uuid, queued integer, min_priority smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT q.tenant_id,
         COUNT(*)::integer      AS queued,
         MIN(q.priority)        AS min_priority
    FROM send_queue q
    JOIN tenants t ON t.id = q.tenant_id
   WHERE q.status = 'queued'
     AND q.not_before <= now()
     AND t.is_active
   GROUP BY q.tenant_id
   -- Los tenants con trabajo más urgente primero; a igualdad, el que menos
   -- tiene, para que una cola gigante no monopolice la invocación.
   ORDER BY MIN(q.priority) ASC, COUNT(*) ASC;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 6. Reclamo atómico de un lote
-- ─────────────────────────────────────────────────────────────
-- `FOR UPDATE SKIP LOCKED` es lo que permite que dos invocaciones simultáneas
-- se repartan la cola en vez de pelearse: la segunda salta las filas que la
-- primera ya bloqueó, en lugar de esperarla.
--
-- El orden `(priority, not_before, enqueued_at)` es el del spec §3.4.
CREATE OR REPLACE FUNCTION claim_send_queue(
  p_tenant        uuid,
  p_limit         integer,
  p_lease_seconds integer DEFAULT 600
)
RETURNS SETOF send_queue
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN;
  END IF;

  -- El ORDER BY de arriba elige BIEN los items, pero el RETURNING de un UPDATE
  -- los devuelve en orden arbitrario (el del recorrido físico), no en el del
  -- subselect. Por eso el UPDATE va dentro de un CTE y se ordena DESPUÉS: así
  -- el que consume la función recibe la tanda en el orden que promete el
  -- contrato, y no en el que le tocó al planificador.
  RETURN QUERY
  WITH reclamados AS (
    UPDATE send_queue q
       SET claimed_at = now(),
           attempts   = q.attempts + 1
     WHERE q.id IN (
             SELECT s.id
               FROM send_queue s
              WHERE s.tenant_id = p_tenant
                AND s.status = 'queued'
                AND s.not_before <= now()
                -- Un arriendo vencido se puede volver a tomar: cubre el caso del
                -- drenador que murió a mitad de un lote.
                AND (s.claimed_at IS NULL
                     OR s.claimed_at < now() - make_interval(secs => p_lease_seconds))
              ORDER BY s.priority ASC, s.not_before ASC, s.enqueued_at ASC
              LIMIT p_limit
                FOR UPDATE SKIP LOCKED
           )
    RETURNING q.*
  )
  SELECT * FROM reclamados
   ORDER BY priority ASC, not_before ASC, enqueued_at ASC;
END;
$fn$;

COMMENT ON FUNCTION claim_send_queue(uuid, integer, integer) IS
  'Reclama atómicamente hasta p_limit items de un tenant y les incrementa attempts. FOR UPDATE SKIP LOCKED permite que dos drenadores simultáneos se repartan la cola sin enviar lo mismo dos veces.';

-- ─────────────────────────────────────────────────────────────
-- 7. Profundidad de cola por tenant (para el dashboard)
-- ─────────────────────────────────────────────────────────────
-- El spec §5 pide `queue_depth` en GET /api/dashboard/line-budget y
-- `line_budget()` de 00037 no lo devuelve. Se expone aparte en vez de tocar
-- `line_budget()`, para no cambiar el contrato de una función que ya está
-- commiteada y que el AIOS consume.
CREATE OR REPLACE FUNCTION send_queue_depth(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'queued',    COUNT(*) FILTER (WHERE status = 'queued'),
    'sent',      COUNT(*) FILTER (WHERE status = 'sent'),
    'failed',    COUNT(*) FILTER (WHERE status = 'failed'),
    'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
    'expired',   COUNT(*) FILTER (WHERE status = 'expired'),
    'next_at',   MIN(not_before) FILTER (WHERE status = 'queued')
  )
  FROM send_queue
  WHERE tenant_id = p_tenant;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 7b. Campañas que ya terminaron de gotear
-- ─────────────────────────────────────────────────────────────
-- Una campaña con cola se queda en `running` mientras gotea y el drenador la
-- cierra cuando su último item sale. Pero hay caminos que vacían la cola SIN
-- pasar por el envío: `expire_send_queue()`, la cancelación desde el dashboard,
-- y las guardas que cancelan una tanda entera al drenar. Por esos caminos la
-- campaña se quedaría en `running` para siempre.
--
-- Devuelve las campañas que: siguen `running`, TIENEN filas en send_queue, y
-- ninguna sigue `queued`.
--
-- El «TIENEN filas en send_queue» es la parte que evita una carrera fea: una
-- campaña manual recién creada está en `running` desde el INSERT y solo encola
-- al FINAL, después de enviar. Sin ese filtro, un drenador que corriera en ese
-- hueco la vería «sin cola» y la cerraría mientras todavía está enviando.
CREATE OR REPLACE FUNCTION send_queue_finished_campaigns()
RETURNS TABLE (campaign_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT q.campaign_id
    FROM send_queue q
    JOIN campaigns c ON c.id = q.campaign_id
   WHERE c.status = 'running'
   GROUP BY q.campaign_id
  HAVING COUNT(*) FILTER (WHERE q.status = 'queued') = 0;
$fn$;

COMMENT ON FUNCTION send_queue_finished_campaigns() IS
  'Campañas running cuya cola ya se vació por cualquier via (enviada, cancelada, vencida). El drenador las cierra. Exige que TENGAN filas en send_queue para no cerrar una campaña manual que todavia esta enviando su primera tanda.';

-- ─────────────────────────────────────────────────────────────
-- 8. Encolado idempotente
-- ─────────────────────────────────────────────────────────────
-- Va en SQL y no en TypeScript por un motivo concreto: el anti-duplicado del
-- bloque 3 es un índice PARCIAL sobre una EXPRESIÓN (COALESCE del campaign_id,
-- filtrado a status='queued'). PostgREST solo sabe construir `ON CONFLICT` con
-- una lista de columnas, así que `upsert({onConflict})` de supabase-js jamás
-- podría apuntar a ese índice: elegiría la clave primaria y el anti-duplicado
-- no se aplicaría nunca.
--
-- `ON CONFLICT DO NOTHING` SIN destino, en cambio, absorbe la violación de
-- CUALQUIER índice único de la tabla — que es justo lo que hace falta.
--
-- Recibe un array JSON para encolar una campaña entera en un solo viaje.
CREATE OR REPLACE FUNCTION enqueue_send_queue(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO send_queue (
    tenant_id, phone, customer_id, imported_contact_id, campaign_id,
    priority, message_type, template_sid, variables,
    media_url, media_type, not_before, expires_at
  )
  SELECT
    (i->>'tenant_id')::uuid,
    i->>'phone',
    NULLIF(i->>'customer_id', '')::uuid,
    NULLIF(i->>'imported_contact_id', '')::uuid,
    NULLIF(i->>'campaign_id', '')::uuid,
    (i->>'priority')::smallint,
    i->>'message_type',
    i->>'template_sid',
    COALESCE(i->'variables', '{}'::jsonb),
    NULLIF(i->>'media_url', ''),
    NULLIF(i->>'media_type', ''),
    COALESCE(NULLIF(i->>'not_before', '')::timestamptz, now()),
    NULLIF(i->>'expires_at', '')::timestamptz
  FROM jsonb_array_elements(p_items) AS i
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION enqueue_send_queue(jsonb) IS
  'Encola un lote de forma idempotente. ON CONFLICT DO NOTHING sin destino es lo unico que respeta el indice unico parcial sobre expresion del bloque 3; volver a encolar la misma campana no duplica a nadie.';

-- ─────────────────────────────────────────────────────────────
-- 9. Permisos
-- ─────────────────────────────────────────────────────────────
-- Mismo criterio que el bloque 13 de 00037: son SECURITY DEFINER, así que
-- escriben con los privilegios del dueño. Ninguna se llama desde el navegador;
-- el único consumidor es el service role, que se salta estos permisos.
-- ⚠️ `FROM PUBLIC` SOLO NO BASTA EN SUPABASE — hay que nombrar los roles.
--
-- Todo proyecto Supabase trae configurado de fábrica:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
--
-- Es decir: cada función creada en `public` nace con TRES concesiones de
-- EXECUTE — la de PUBLIC (implícita de Postgres) y dos NOMINALES, a `anon` y a
-- `authenticated`. `REVOKE ... FROM PUBLIC` borra la primera y deja las otras
-- dos intactas, así que la función sigue siendo llamable por RPC de PostgREST
-- con la NEXT_PUBLIC_SUPABASE_ANON_KEY, que viaja en el bundle del navegador.
--
-- Y como son SECURITY DEFINER, corren con los privilegios del dueño: la RLS de
-- send_queue no las frena. Con solo `FROM PUBLIC`, cualquiera podía:
--   · `send_queue_pending_tenants()` → listar los tenant_id con cola pendiente,
--   · `claim_send_queue(tenant, 1000)` → LEER la cola entera de ese tenant
--     (teléfonos, plantilla, variables) y de paso arrendarla 10 minutos,
--     dejándola sin drenar,
--   · `enqueue_send_queue(...)` → INYECTAR envíos que el drenador manda de verdad.
--
-- Ninguna de estas funciones se llama nunca desde el navegador (verificado: no
-- hay un solo `.rpc()` en un componente `'use client'`); el único consumidor es
-- el service role, que se salta estos permisos por definición.
REVOKE ALL ON FUNCTION expire_send_queue()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION send_queue_pending_tenants()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_send_queue(uuid, integer, integer)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION send_queue_depth(uuid)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enqueue_send_queue(jsonb)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION send_queue_finished_campaigns()            FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. Cierre del mismo agujero en las migraciones YA APLICADAS
-- ─────────────────────────────────────────────────────────────
-- El patrón `REVOKE ... FROM PUBLIC` a secas viene de 00035/00036/00037, así
-- que las funciones del AIOS creadas allí tienen el mismo problema — y 00036
-- **ya está aplicada en producción**. La más grave es
-- `aios_provision_tenant(jsonb)`: CREA TENANTS, y hoy es invocable con la clave
-- pública del navegador.
--
-- Se arregla desde aquí porque una migración ya aplicada no se vuelve a correr.
-- Cada REVOKE va guardado por `to_regprocedure()`: si la función no existe en
-- esta base (por ejemplo un clon donde no se aplicó 00036), no falla.
DO $$
DECLARE
  v_fn text;
  v_fns text[] := ARRAY[
    'aios_provision_tenant(jsonb)',
    'aios_activate_whatsapp(text, text, text, text)',
    'aios_set_template_settings(text, jsonb)',
    'aios_line_health(text)',
    'aios_set_line_status(text, text, text)',
    'line_budget(uuid)',
    'reserve_send_slot(uuid, text, text)',
    'release_send_slot(uuid, uuid)',
    'prune_send_governance()'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF to_regprocedure(v_fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    END IF;
  END LOOP;
END $$;

-- Se re-conceden las del AIOS a su rol, por si el REVOKE de arriba se las quitó
-- (REVOKE ALL sobre una lista de roles no toca a aios_constelarys, pero dejarlo
-- explícito hace la migración segura de re-ejecutar).
DO $$
DECLARE
  v_fn text;
  v_fns text[] := ARRAY[
    'aios_provision_tenant(jsonb)',
    'aios_activate_whatsapp(text, text, text, text)',
    'aios_set_template_settings(text, jsonb)',
    'aios_line_health(text)',
    'aios_set_line_status(text, text, text)',
    'line_budget(uuid)'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    FOREACH v_fn IN ARRAY v_fns LOOP
      IF to_regprocedure(v_fn) IS NOT NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO aios_constelarys', v_fn);
      END IF;
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    -- El tablero de emergencia del AIOS ya lee la profundidad vía
    -- aios_line_health(); esto le permite además el desglose por estado.
    GRANT EXECUTE ON FUNCTION send_queue_depth(uuid) TO aios_constelarys;
  END IF;
END $$;
