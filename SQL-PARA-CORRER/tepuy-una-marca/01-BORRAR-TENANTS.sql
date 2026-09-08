-- ═══════════════════════════════════════════════════════════════════════════
-- TEPUY — 01. BORRAR LAS DOS MARCAS DEL PRODUCTO
-- 2026-09-08 · SQL Editor del **PRODUCTO**. Correr 00-VERIFICAR.sql ANTES.
--
-- Borra `clubtepuylaureles` y `clubtepuyenvigado` con todo lo suyo, para volver
-- a dar de alta Tepuy como UNA marca con dos sedes.
--
-- ⚠️ ESTO BORRA. No hay marcha atrás automática. Por eso:
--    · aborta si aparece UN cliente, UNA visita, UN mensaje o UN premio;
--    · aborta si alguna tiene un WhatsApp de Zernio conectado;
--    · y si querés red extra: Supabase → Database → Backups, snapshot antes.
--
-- LOS DOS SUBDOMINIOS QUEDAN LIBRES, que es justamente lo que hace falta:
--    clubtepuylaureles.constelarys.com
--    clubtepuyenvigado.constelarys.com
-- Los QR ya están impresos con esos dos hosts, así que el alta nueva los vuelve
-- a usar TAL CUAL — pero como dominio de cada SEDE, no de una marca. El paso a
-- paso exacto está en LEEME.md.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- Las dos marcas a borrar.
  p_slugs text[] := ARRAY['clubtepuylaureles', 'clubtepuyenvigado'];

  -- Los usuarios de panel de esas marcas.
  --   true  → se borran (recomendado: se crearon hace minutos y el alta nueva
  --           los vuelve a crear desde la tarjeta «Usuario del panel», con
  --           contraseña nueva a la vista).
  --   false → se quedan SIN marca. Después la tarjeta les asigna la marca
  --           nueva pero NO les cambia la contraseña, así que solo sirve si
  --           la clienta ya se sabe la suya.
  p_borrar_usuarios boolean := true;

  v_ids     uuid[];
  v_n       bigint;
  v_tabla   text;
  v_slug    text;
  v_zernio  text;
BEGIN
  -- ── 1. Las marcas existen ────────────────────────────────────────────────
  SELECT array_agg(id) INTO v_ids FROM tenants WHERE slug = ANY(p_slugs);

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'No existe ninguna de esas marcas. ¿Ya se corrió este script?';
  END IF;
  RAISE NOTICE 'Marcas encontradas: %', array_length(v_ids, 1);

  -- ── 2. Están vacías ──────────────────────────────────────────────────────
  -- Borrar una marca CON historia es otra cosa entera (de quién son los puntos,
  -- el saldo, los opt-outs, el libro de consentimiento). Acá no se improvisa.
  SELECT count(*) INTO v_n FROM customers WHERE tenant_id = ANY(v_ids);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya hay % cliente(s). NO se borra una marca con clientes.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM visits WHERE tenant_id = ANY(v_ids);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya hay % visita(s).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM message_logs WHERE tenant_id = ANY(v_ids);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya se enviaron % mensaje(s).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM reward_grants WHERE tenant_id = ANY(v_ids);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya hay % premio(s) otorgado(s).', v_n;
  END IF;

  -- ── 3. Ningún WhatsApp conectado ─────────────────────────────────────────
  -- Borrar la marca dejaría la cuenta de Zernio apuntando al vacío y el número
  -- sin dueño. Se desconecta primero, a mano, y después se corre esto.
  FOR v_slug, v_zernio IN
    SELECT slug, zernio_account_id FROM tenants
     WHERE id = ANY(v_ids) AND zernio_account_id IS NOT NULL
  LOOP
    RAISE EXCEPTION
      'ABORTADO: la marca % tiene la cuenta Zernio % conectada. Desconectala antes de borrar.',
      v_slug, v_zernio;
  END LOOP;

  -- ── 4. Los usuarios de panel ─────────────────────────────────────────────
  IF p_borrar_usuarios THEN
    DELETE FROM auth.users
     WHERE (raw_app_meta_data->>'tenant_id')::uuid = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      RAISE NOTICE '% usuario(s) de panel borrado(s). Se vuelven a crear desde el AIOS al final.', v_n;
    END IF;
  ELSE
    UPDATE auth.users
       SET raw_app_meta_data = raw_app_meta_data - 'tenant_id'
     WHERE (raw_app_meta_data->>'tenant_id')::uuid = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      RAISE NOTICE '% usuario(s) quedaron SIN marca. La tarjeta del AIOS les asignará la nueva, pero NO les cambia la contraseña.', v_n;
    END IF;
  END IF;

  -- ── 5. Borrar ────────────────────────────────────────────────────────────
  -- Se recorren TODAS las tablas de `public` con columna `tenant_id`, sacadas
  -- del catálogo y no de una lista escrita a mano que envejezca con la próxima
  -- migración. Están vacías salvo reward_tiers, admin_settings y sus sedes.
  FOR v_tabla IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND a.attname = 'tenant_id'
       AND NOT a.attisdropped
       AND c.relname <> 'tenants'
     ORDER BY c.relname
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = ANY($1)', v_tabla) USING v_ids;
  END LOOP;

  DELETE FROM tenants WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- ── 6. Que de verdad no quede nada ───────────────────────────────────────
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = ANY(p_slugs)) THEN
    RAISE EXCEPTION 'ABORTADO: algo quedó. No se borraron las marcas.';
  END IF;
  IF EXISTS (SELECT 1 FROM restaurant_locations WHERE tenant_id = ANY(v_ids)) THEN
    RAISE EXCEPTION 'ABORTADO: quedaron sedes huérfanas.';
  END IF;

  RAISE NOTICE '───────────────────────────────────────────────';
  RAISE NOTICE '% marca(s) borrada(s). Los dos subdominios quedaron LIBRES:', v_n;
  RAISE NOTICE '  clubtepuylaureles.constelarys.com';
  RAISE NOTICE '  clubtepuyenvigado.constelarys.com';
  RAISE NOTICE 'Seguí con 02-RESET-AIOS.sql y después el alta del LEEME.md.';
  RAISE NOTICE '───────────────────────────────────────────────';
END $$;

-- ── Comprobación ───────────────────────────────────────────────────────────
SELECT CASE WHEN count(*) = 0 THEN '✓ no queda ninguna' ELSE '✗ todavía existen' END AS resultado,
       count(*) AS marcas
  FROM tenants WHERE slug IN ('clubtepuylaureles', 'clubtepuyenvigado');
