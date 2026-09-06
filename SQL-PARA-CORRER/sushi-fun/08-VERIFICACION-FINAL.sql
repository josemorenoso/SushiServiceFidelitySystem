-- ═══════════════════════════════════════════════════════════════
-- 08 · VERIFICACIÓN FINAL — solo lee, no escribe nada
-- Absorción de Sushi Fun al despliegue principal — generado 2026-09-06
-- GENERADO por scripts/gen-sushi-fun-dump.mjs junto con los datos, para que los
-- conteos esperados no puedan desfasarse de lo que realmente se insertó.
--
-- Se pega en el SQL Editor del Supabase PRINCIPAL, DESPUÉS del 07.
-- Si termina con el NOTICE final, la absorción cuadra.
-- ═══════════════════════════════════════════════════════════════

DO $final$
DECLARE
  v_sf   uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  r      record;
  v_n    bigint;
  v_mal  bigint;
  v_err  text := '';
  v_tot  bigint := 0;
BEGIN
  -- ── 1. Conteo tabla por tabla ─────────────────────────────────────────────
  RAISE NOTICE '───────── CONTEOS DE SUSHI FUN EN EL DESTINO ─────────';
  FOR r IN
    SELECT * FROM (VALUES
    ('reward_tiers', 6),
    ('rewards', 3),
    ('mystery_box_global_caps', 1),
    ('admin_settings', 24),
    ('authorized_numbers', 2),
    ('staff_users', 1),
    ('staff_devices', 4),
    ('imported_contacts', 0),
    ('customers', 250),
    ('campaigns', 94),
    ('campaign_rewards', 0),
    ('visits', 268),
    ('point_transactions', 268),
    ('mystery_box_results', 0),
    ('reward_grants', 0),
    ('reward_redemptions', 0),
    ('review_events', 68),
    ('campaign_messages', 238),
    ('message_logs', 194),
    ('restaurant_events', 0)
    ) AS e(tabla, esperado)
    ORDER BY tabla
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', r.tabla)
      INTO v_n USING v_sf;
    v_tot := v_tot + v_n;
    IF v_n <> r.esperado THEN
      v_err := v_err || format('  · %s: hay %s y se esperaban %s', r.tabla, v_n, r.esperado) || chr(10);
      RAISE NOTICE '%', format('  %-26s %6s   FALLA (esperaba %s)', r.tabla, v_n, r.esperado);
    ELSE
      RAISE NOTICE '%', format('  %-26s %6s   ok', r.tabla, v_n);
    END IF;
  END LOOP;
  RAISE NOTICE '%', format('  %-26s %6s', 'TOTAL', v_tot);

  IF v_err <> '' THEN
    RAISE EXCEPTION E'08 FALLO: los conteos no cuadran.\n%\nSi el origen crecio desde que se generaron los archivos, hay que regenerarlos y cargar el delta.', v_err;
  END IF;

  -- ── 2. Ninguna fila de Sushi Fun atribuida a otra marca ───────────────────
  -- Esta es LA verificación del encargo. No se listan 1.100 UUID: se prueba el
  -- invariante que un escape rompería igual — hijo y padre en la misma marca.
  -- Si un INSERT hubiera olvidado tenant_id, el DEFAULT puente lo habría mandado
  -- a Sushi Service y su padre seguiria en Sushi Fun: la fila saldria aca.
  RAISE NOTICE '───────── COHERENCIA DE MARCA (hijo vs. padre) ─────────';
  FOR r IN
    SELECT * FROM (VALUES
    ('visits', 'customer_id', 'customers'),
    ('visits', 'registered_by_staff_id', 'staff_users'),
    ('point_transactions', 'customer_id', 'customers'),
    ('review_events', 'customer_id', 'customers'),
    ('campaign_messages', 'customer_id', 'customers'),
    ('campaign_messages', 'campaign_id', 'campaigns'),
    ('message_logs', 'customer_id', 'customers'),
    ('mystery_box_global_caps', 'tier_id', 'reward_tiers'),
    ('rewards', 'tier_id', 'reward_tiers'),
    ('staff_devices', 'staff_user_id', 'staff_users'),
    ('staff_users', 'location_id', 'restaurant_locations'),
    ('customers', 'imported_contact_id', 'imported_contacts')
    ) AS p(hijo, fk, padre)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I h JOIN %I p ON p.id = h.%I WHERE h.%I IS NOT NULL AND p.tenant_id <> h.tenant_id',
      r.hijo, r.padre, r.fk, r.fk
    ) INTO v_mal;
    IF v_mal > 0 THEN
      v_err := v_err || format('  · %s.%s -> %s: %s fila(s) cruzan de marca', r.hijo, r.fk, r.padre, v_mal) || chr(10);
    END IF;
  END LOOP;

  IF v_err <> '' THEN
    RAISE EXCEPTION E'08 FALLO: hay filas atribuidas a la marca equivocada.\n%', v_err;
  END IF;
  RAISE NOTICE '  Cero cruces entre marcas en % relaciones.', 12;

  -- ── 3. Nada quedo sin marca ───────────────────────────────────────────────
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id IS NULL', r.table_name) INTO v_mal;
    IF v_mal > 0 THEN
      v_err := v_err || format('  · %s: %s fila(s) sin tenant_id', r.table_name, v_mal) || chr(10);
    END IF;
  END LOOP;
  IF v_err <> '' THEN
    RAISE EXCEPTION E'08 FALLO: hay filas sin marca.\n%', v_err;
  END IF;

  -- ── 4. La billetera de Sushi Fun sigue intacta ────────────────────────────
  SELECT count(*) INTO v_mal FROM tenant_wallet_transactions WHERE tenant_id = v_sf;
  IF v_mal <> 0 THEN
    RAISE EXCEPTION '08 FALLO: Sushi Fun tiene % movimiento(s) de billetera. Cargar historial no debe cobrarle nada (ver 07).', v_mal;
  END IF;

  -- ── 5. El trigger de billetera volvio a su sitio ──────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_debit_wallet'
       AND tgrelid = 'message_logs'::regclass
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION '08 FALLO: trg_debit_wallet sigue DESACTIVADO en message_logs. Los envios de TODAS las marcas dejarian de cobrarse. Reactivalo YA: ALTER TABLE message_logs ENABLE TRIGGER trg_debit_wallet;';
  END IF;

  -- ── 6. Exactamente una sede activa ────────────────────────────────────────
  SELECT count(*) INTO v_n FROM restaurant_locations WHERE tenant_id = v_sf AND is_active;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '08 FALLO: Sushi Fun tiene % sedes activas y debe tener 1.', v_n;
  END IF;

  -- ── 7. El mesero tiene sede (si no, no sale en ninguna lista) ─────────────
  SELECT count(*) INTO v_n FROM staff_users WHERE tenant_id = v_sf AND is_active AND location_id IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '08 FALLO: % mesero(s) activos de Sushi Fun sin sede. No apareceran en el escaner.', v_n;
  END IF;

  -- ── 8. Twilio propio, otra vez (por si alguien edito la fila entre medio) ──
  IF EXISTS (
    SELECT 1 FROM tenants
     WHERE id = v_sf
       AND (twilio_subaccount_sid IS NULL
            OR twilio_subaccount_auth_token IS NULL
            OR twilio_whatsapp_number IS NULL)
  ) THEN
    RAISE EXCEPTION '08 FALLO: alguna columna twilio_* de Sushi Fun quedo en NULL. Sus WhatsApp saldrian del numero de Sushi Service.';
  END IF;

  -- ── 9. Foto final por marca, para pegarle al dueno ───────────────────────
  RAISE NOTICE '───────── CLIENTES POR MARCA (comparar con el 00) ─────────';
  FOR r IN
    SELECT t.slug, count(c.id) AS clientes
      FROM tenants t LEFT JOIN customers c ON c.tenant_id = t.id
     GROUP BY t.slug ORDER BY t.slug
  LOOP
    RAISE NOTICE '%', format('  %-22s %s', r.slug, r.clientes);
  END LOOP;

  RAISE NOTICE '───────────────────────────────────────────────────────────';
  RAISE NOTICE 'OK 08: la absorcion cuadra. % filas de Sushi Fun, cero cruces de marca.', v_tot;
END $final$;
