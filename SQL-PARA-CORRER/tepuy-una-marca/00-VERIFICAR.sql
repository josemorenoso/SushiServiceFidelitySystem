-- ═══════════════════════════════════════════════════════════════════════════
-- TEPUY — 00. VERIFICAR (SOLO LEE, no cambia nada)
-- 2026-09-08 · Correr ANTES de 01-FUNDIR.sql, en el SQL Editor del PRODUCTO.
--
-- QUÉ PASÓ
--   El alta de Tepuy salió con el AIOS v1.5.2, que llamaba aios_provision_tenant
--   UNA VEZ POR SEDE: el negocio nació como DOS MARCAS (clubtepuylaureles a las
--   01:48 y clubtepuyenvigado a las 01:53, hora Bogotá). El arreglo (v1.6.0)
--   quedó desplegado a las ~01:59 — cinco minutos tarde.
--
--   Consecuencia si se deja así: un cliente que come en los dos locales queda
--   como DOS personas con puntos separados, y el número de WhatsApp no se puede
--   compartir (idx_tenants_zernio_account_id rechaza el segundo tenant).
--
-- QUÉ MIRA ESTE SCRIPT
--   1. Que las dos marcas son las que creemos.
--   2. Que están VACÍAS. Si alguna tiene un solo cliente o una sola visita,
--      NO se corre 01-FUNDIR.sql: fundir marcas con historia es otro problema
--      (de quién son los puntos, el saldo, los opt-outs) y no se improvisa.
--   3. Qué sedes tiene cada una hoy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Las dos marcas ──────────────────────────────────────────────────────
SELECT id, slug, name, domain, is_active, created_at
  FROM tenants
 WHERE slug IN ('clubtepuylaureles', 'clubtepuyenvigado')
 ORDER BY created_at;

-- ── 2. ¿Están vacías? ──────────────────────────────────────────────────────
-- Cualquier número distinto de 0 en clientes/visitas/mensajes/premios ABORTA el plan.
SELECT t.slug,
       (SELECT count(*) FROM customers        c WHERE c.tenant_id = t.id) AS clientes,
       (SELECT count(*) FROM visits           v WHERE v.tenant_id = t.id) AS visitas,
       (SELECT count(*) FROM message_logs     m WHERE m.tenant_id = t.id) AS mensajes,
       (SELECT count(*) FROM reward_grants    g WHERE g.tenant_id = t.id) AS premios_otorgados,
       (SELECT count(*) FROM restaurant_locations l WHERE l.tenant_id = t.id) AS sedes,
       (SELECT count(*) FROM reward_tiers     r WHERE r.tenant_id = t.id) AS niveles,
       (SELECT count(*) FROM admin_settings   s WHERE s.tenant_id = t.id) AS ajustes
  FROM tenants t
 WHERE t.slug IN ('clubtepuylaureles', 'clubtepuyenvigado')
 ORDER BY t.created_at;

-- ── 3. Las sedes que existen hoy ───────────────────────────────────────────
-- Se espera: una sede por marca, con slug y domain en NULL (la v1.5.2 no los
-- escribía — es exactamente lo que la 00056 vino a arreglar).
SELECT t.slug AS marca, l.id, l.name, l.slug, l.domain,
       l.address, l.lat, l.lon, l.radius_meters, l.is_primary, l.sort_order, l.is_active
  FROM restaurant_locations l
  JOIN tenants t ON t.id = l.tenant_id
 WHERE t.slug IN ('clubtepuylaureles', 'clubtepuyenvigado')
 ORDER BY t.created_at, l.sort_order;

-- ── 4. ¿Alguien ya se conectó un WhatsApp a estas marcas? ──────────────────
-- Si zernio_account_id no es NULL, avisar antes de borrar: hay que soltar esa
-- cuenta de la marca que se elimina o el índice único la va a seguir reclamando.
SELECT slug, messaging_provider, zernio_account_id, zernio_phone_number
  FROM tenants
 WHERE slug IN ('clubtepuylaureles', 'clubtepuyenvigado');

-- ── 5. ¿Hay usuarios de panel colgando de estas marcas? ────────────────────
-- Si creaste el usuario del cliente desde el AIOS, va a salir acá. Después de
-- fundir hay que repuntarlo a la marca que queda (01-FUNDIR.sql lo hace solo).
SELECT u.email, u.created_at, u.last_sign_in_at,
       u.raw_app_meta_data->>'tenant_id' AS tenant_id,
       t.slug AS marca
  FROM auth.users u
  LEFT JOIN tenants t ON t.id = (u.raw_app_meta_data->>'tenant_id')::uuid
 WHERE t.slug IN ('clubtepuylaureles', 'clubtepuyenvigado');
