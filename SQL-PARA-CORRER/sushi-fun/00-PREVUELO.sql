-- ═══════════════════════════════════════════════════════════════
-- 00 · PRE-VUELO — solo lee, no escribe NADA
-- Absorción de Sushi Fun al despliegue principal — 2026-09-06
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL** (el de Sushi Service).
-- Aborta con RAISE EXCEPTION si el terreno no está listo. Si termina con el
-- NOTICE final, se puede seguir con el 01.
--
-- No abre transacción a propósito: no escribe una sola fila.
-- Correrlo dos veces no cambia nada.
-- ═══════════════════════════════════════════════════════════════

DO $prevuelo$
DECLARE
  v_tenant_sf uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  v_sede_sf   uuid := 'd6798a6e-40f1-4d1a-91be-5d30770c1448';
  v_n         int;
  v_txt       text;
  v_falta     text := '';
BEGIN
  -- ── 1. Las migraciones 00044 y 00045 tienen que estar aplicadas ────────────
  -- Sin ellas el traslado igual entra, pero staff_users.location_id no existe y
  -- el 03 revienta con 42703 — que PostgREST luego traduce a 403 y parece un
  -- problema de permisos que no lo es.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'staff_users' AND column_name = 'location_id'
  ) THEN
    v_falta := v_falta || '  · staff_users.location_id (migración 00044 SIN aplicar)' || chr(10);
  END IF;

  IF to_regclass('public.dashboard_user_locations') IS NULL THEN
    v_falta := v_falta || '  · tabla dashboard_user_locations (migración 00045 SIN aplicar)' || chr(10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'restaurant_locations' AND column_name = 'is_primary'
  ) THEN
    v_falta := v_falta || '  · restaurant_locations.is_primary (migración 00041 SIN aplicar)' || chr(10);
  END IF;

  IF v_falta <> '' THEN
    RAISE EXCEPTION E'PRE-VUELO ABORTA: al destino le faltan migraciones.\n%\nAplicalas ANTES de seguir. Ver docs/RUNBOOK-DEPLOY.md.', v_falta;
  END IF;

  -- ── 2. Sushi Fun no puede existir ya ──────────────────────────────────────
  SELECT count(*) INTO v_n FROM tenants WHERE id = v_tenant_sf OR slug = 'sushi-fun';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PRE-VUELO ABORTA: ya hay % fila(s) en tenants con el id o el slug de Sushi Fun. Alguien ya corrió el 01 (o hay un choque de slug).', v_n;
  END IF;

  -- ── 3. El dominio no puede estar tomado ───────────────────────────────────
  -- Lo miran las DOS tablas: `tenants.domain` y `restaurant_locations.domain`.
  -- El trigger restaurant_locations_domain_guard (00041) solo cubre una dirección.
  SELECT string_agg(slug, ', ') INTO v_txt
    FROM tenants WHERE domain = 'clubsushifun.constelarys.com';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRE-VUELO ABORTA: clubsushifun.constelarys.com ya es el dominio del/los tenant(s): %', v_txt;
  END IF;

  SELECT count(*) INTO v_n
    FROM restaurant_locations WHERE domain = 'clubsushifun.constelarys.com';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PRE-VUELO ABORTA: clubsushifun.constelarys.com ya está tomado por % sede(s) de otra marca.', v_n;
  END IF;

  -- ── 4. Choque de UUID ─────────────────────────────────────────────────────
  -- Los UUID vienen de gen_random_uuid() en los dos proyectos, así que chocar es
  -- prácticamente imposible. "Prácticamente" no es "no", y un choque de PK a
  -- mitad de carga deja la absorción por la mitad. Se comprueban los dos ids
  -- que SÍ están escritos a mano y por eso son los únicos con riesgo real.
  IF EXISTS (SELECT 1 FROM restaurant_locations WHERE id = v_sede_sf) THEN
    RAISE EXCEPTION 'PRE-VUELO ABORTA: el UUID de la sede de Sushi Fun (%) ya existe en restaurant_locations.', v_sede_sf;
  END IF;

  -- ── 5. Foto del ANTES, para poder comparar en el 08 ───────────────────────
  RAISE NOTICE '───────── FOTO DEL DESTINO, ANTES DE TOCAR NADA ─────────';
  FOR v_txt IN
    SELECT format('  %-22s %s', t.slug, count(c.id))
      FROM tenants t LEFT JOIN customers c ON c.tenant_id = t.id
     GROUP BY t.slug ORDER BY t.slug
  LOOP
    RAISE NOTICE '%', v_txt;
  END LOOP;

  SELECT count(*) INTO v_n FROM tenants;
  RAISE NOTICE '  tenants hoy: %', v_n;

  -- ── 6. El DEFAULT puente sigue vivo: es POR QUÉ todo INSERT lleva tenant_id ─
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'tenant_id'
     AND column_default IS NOT NULL;
  IF v_n > 0 THEN
    RAISE WARNING 'AVISO: % tabla(s) conservan el DEFAULT puente de tenant_id (la 00030 nunca se aplicó). Todo INSERT de esta absorción pasa tenant_id EXPLÍCITO — verificado archivo por archivo. No corras nada a mano sin él.', v_n;
  END IF;

  RAISE NOTICE '───────────────────────────────────────────────────────────';
  RAISE NOTICE 'OK PRE-VUELO: el terreno está listo. Seguí con 01-alta-tenant-y-sede.sql.';
END $prevuelo$;
