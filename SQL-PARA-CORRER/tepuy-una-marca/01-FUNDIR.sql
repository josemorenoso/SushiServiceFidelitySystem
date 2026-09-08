-- ═══════════════════════════════════════════════════════════════════════════
-- TEPUY — 01. FUNDIR LAS DOS MARCAS EN UNA, CON DOS SEDES
-- 2026-09-08 · SQL Editor del PRODUCTO. Correr 00-VERIFICAR.sql ANTES.
--
-- TODO PASA DENTRO DE UN SOLO BLOQUE: si algo no cuadra, levanta excepción y
-- NO queda nada a medias. No hay estado intermedio que limpiar.
--
-- ── LO QUE NO SE PUEDE MOVER ───────────────────────────────────────────────
-- Los QR ya están IMPRESOS con estos dos hosts, así que los dos tienen que
-- seguir funcionando y atribuyendo a su local:
--
--     clubtepuylaureles.constelarys.com  → sede Laureles
--     clubtepuyenvigado.constelarys.com  → sede Envigado
--
-- Por eso esos dos hosts pasan a ser el `domain` de las SEDES, no de la marca.
-- `resolveHostContext()` resuelve la marca por el subdominio de una sede
-- (src/lib/tenant.ts:107-139) y `pickLocationForHost()` le da `source='host'`:
-- atribución exacta, sin preguntarle nada al cliente.
--
-- ⚠️ Y POR ESO LA MARCA ESTRENA UN TERCER HOST (clubtepuy.constelarys.com).
-- No es capricho: `pickLocationForHost()` dice, textual, que **el dominio raíz
-- manda aunque la sede principal repita ese mismo dominio**, y con 2+ sedes el
-- raíz deja de atribuir y pide elegir sede (409, D21/§3.2). Si dejáramos el
-- host de Laureles como dominio de la MARCA, el QR impreso de Laureles pasaría
-- a preguntar «¿en qué sede estás?» a cada cliente. Ese tercer host no se
-- imprime en ningún lado: es solo la raíz de la marca.
--
-- ── QUÉ HACE, EN ORDEN (el orden importa) ──────────────────────────────────
--   1. Comprueba que las dos marcas existen y están VACÍAS. Si no, aborta.
--   2. Se guarda la dirección/coordenadas de la sede de Envigado.
--   3. Mueve a la marca que queda los usuarios de panel de la que se borra.
--   4. Borra la marca `clubtepuyenvigado` y todo lo suyo.
--      (Antes del paso 6: su `tenants.domain` tiene tomado el host de Envigado
--       y el trigger de la 00051 no deja que una sede lo use mientras exista.)
--   5. Renombra la marca que queda: clubtepuy / "Tepuy" / clubtepuy.constelarys.com.
--      (Antes del paso 6 por lo mismo, con el host de Laureles.)
--   6. Deja las dos sedes con su slug y su subdominio impreso.
--
-- ── MARCHA ATRÁS ───────────────────────────────────────────────────────────
-- No la hay automática: el paso 4 borra. Por eso el paso 1 aborta ante el
-- primer dato. Si querés red extra, en Supabase → Database → Backups tomás un
-- snapshot antes de correr esto (son dos marcas recién nacidas: el snapshot es
-- barato y el borrado, definitivo).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── Lo que podés cambiar ─────────────────────────────────────────────────
  p_marca_slug     text := 'clubtepuy';                     -- slug de la MARCA
  p_marca_nombre   text := 'Tepuy';                         -- nombre de la MARCA
  p_marca_domain   text := 'clubtepuy.constelarys.com';     -- raíz, NO impreso

  p_sede1_nombre   text := 'Laureles';
  p_sede1_slug     text := 'laureles';
  p_sede1_domain   text := 'clubtepuylaureles.constelarys.com';  -- QR IMPRESO

  p_sede2_nombre   text := 'Envigado';
  p_sede2_slug     text := 'envigado';
  p_sede2_domain   text := 'clubtepuyenvigado.constelarys.com';  -- QR IMPRESO

  -- Las dos marcas tal como están hoy
  p_origen_slug    text := 'clubtepuylaureles';   -- la que se CONSERVA
  p_borrar_slug    text := 'clubtepuyenvigado';   -- la que se ELIMINA
  -- ─────────────────────────────────────────────────────────────────────────

  v_marca      uuid;
  v_borrar     uuid;
  v_sede1      uuid;
  v_datos      record;
  v_n          bigint;
  v_tabla      text;
  v_usuarios   int;
  v_zernio     text;
BEGIN
  -- ── 1. Las dos marcas existen ────────────────────────────────────────────
  SELECT id INTO v_marca  FROM tenants WHERE slug = p_origen_slug;
  SELECT id INTO v_borrar FROM tenants WHERE slug = p_borrar_slug;

  IF v_marca IS NULL THEN
    RAISE EXCEPTION 'No existe la marca % (la que se conserva). Nada que hacer.', p_origen_slug;
  END IF;
  IF v_borrar IS NULL THEN
    RAISE EXCEPTION 'No existe la marca % (la que se borra). ¿Ya se corrió este script?', p_borrar_slug;
  END IF;
  IF v_marca = v_borrar THEN
    RAISE EXCEPTION 'Las dos marcas son la misma. Revisá los slugs.';
  END IF;

  -- ── 1.bis. Y están VACÍAS ────────────────────────────────────────────────
  -- Fundir marcas CON historia es otro problema entero (de quién son los
  -- puntos, el saldo, los opt-outs, el libro de consentimiento). Acá no se
  -- improvisa: al primer dato, se aborta y no se toca nada.
  SELECT count(*) INTO v_n FROM customers WHERE tenant_id IN (v_marca, v_borrar);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya hay % cliente(s) en estas marcas. Fundirlas con datos NO lo resuelve este script.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM visits WHERE tenant_id IN (v_marca, v_borrar);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya hay % visita(s) en estas marcas.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM message_logs WHERE tenant_id IN (v_marca, v_borrar);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya se enviaron % mensaje(s) desde estas marcas.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM reward_grants WHERE tenant_id IN (v_marca, v_borrar);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ya hay % premio(s) otorgado(s).', v_n;
  END IF;

  -- ── 1.ter. Un WhatsApp conectado no se borra en silencio ─────────────────
  SELECT zernio_account_id INTO v_zernio FROM tenants WHERE id = v_borrar;
  IF v_zernio IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORTADO: la marca % tiene una cuenta Zernio conectada (%). Desconectala primero, o el número queda huérfano.',
      p_borrar_slug, v_zernio;
  END IF;

  -- ── 2. Guardar los datos de la sede de Envigado ANTES de borrarla ────────
  SELECT address, lat, lon, radius_meters
    INTO v_datos
    FROM restaurant_locations
   WHERE tenant_id = v_borrar
   ORDER BY is_primary DESC, sort_order, created_at
   LIMIT 1;

  -- ── 3. Los usuarios de panel de la marca que se borra pasan a la que queda ──
  -- Si el usuario del cliente se creó apuntando a Envigado, después de fundir
  -- tiene que apuntar a la marca. Sin esto entraría a una marca inexistente.
  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('tenant_id', v_marca::text)
   WHERE (raw_app_meta_data->>'tenant_id')::uuid = v_borrar;
  GET DIAGNOSTICS v_usuarios = ROW_COUNT;
  IF v_usuarios > 0 THEN
    RAISE NOTICE '% usuario(s) de panel repuntados a la marca que queda. Tienen que volver a INICIAR SESIÓN (el tenant viaja en el token).', v_usuarios;
  END IF;

  -- ── 4. Borrar la marca sobrante, con todo lo suyo ────────────────────────
  -- Se recorren TODAS las tablas de `public` que tengan `tenant_id`, para no
  -- depender de una lista escrita a mano que envejezca con la próxima
  -- migración. Están vacías salvo reward_tiers, admin_settings y su sede.
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
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tabla) USING v_borrar;
  END LOOP;

  DELETE FROM tenants WHERE id = v_borrar;
  RAISE NOTICE 'Marca % eliminada.', p_borrar_slug;

  -- ── 5. La marca que queda deja de llamarse como uno de sus locales ───────
  -- El dominio raíz se mueve ANTES de dárselo a la sede: mientras la marca lo
  -- tenga, el trigger de la 00041 no deja que una sede use ese mismo host.
  UPDATE tenants
     SET slug   = p_marca_slug,
         name   = p_marca_nombre,
         domain = p_marca_domain,
         config = config || jsonb_build_object('brand_name', p_marca_nombre)
   WHERE id = v_marca;

  -- ── 6. Las dos sedes, cada una con su subdominio impreso ─────────────────
  SELECT id INTO v_sede1
    FROM restaurant_locations
   WHERE tenant_id = v_marca
   ORDER BY is_primary DESC, sort_order, created_at
   LIMIT 1;

  IF v_sede1 IS NULL THEN
    INSERT INTO restaurant_locations
      (tenant_id, name, slug, domain, radius_meters, is_primary, sort_order, is_active)
    VALUES
      (v_marca, p_sede1_nombre, p_sede1_slug, p_sede1_domain, 150, true, 0, true)
    RETURNING id INTO v_sede1;
    RAISE NOTICE 'La marca no tenía sede: se creó % desde cero (sin coordenadas).', p_sede1_nombre;
  ELSE
    UPDATE restaurant_locations
       SET name       = p_sede1_nombre,
           slug       = p_sede1_slug,
           domain     = p_sede1_domain,
           is_primary = true,
           sort_order = 0,
           is_active  = true
     WHERE id = v_sede1;
  END IF;

  INSERT INTO restaurant_locations
    (tenant_id, name, slug, domain, address, lat, lon, radius_meters, is_primary, sort_order, is_active)
  VALUES
    (v_marca, p_sede2_nombre, p_sede2_slug, p_sede2_domain,
     v_datos.address, v_datos.lat, v_datos.lon, COALESCE(v_datos.radius_meters, 150),
     false, 1, true);

  IF v_datos.lat IS NULL THEN
    RAISE NOTICE 'La sede % quedó SIN coordenadas (la vieja tampoco las tenía). Cargalas desde el panel si querés geocerca.', p_sede2_nombre;
  END IF;

  -- ── 7. Que quede como debe ───────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM restaurant_locations WHERE tenant_id = v_marca AND is_active;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'ABORTADO: la marca quedó con % sede(s) activa(s) en vez de 2.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM restaurant_locations WHERE tenant_id = v_marca AND is_primary;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: la marca quedó con % sede(s) principal(es) en vez de 1.', v_n;
  END IF;

  RAISE NOTICE '───────────────────────────────────────────────';
  RAISE NOTICE 'LISTO. Marca % (%) con 2 sedes:', p_marca_nombre, p_marca_slug;
  RAISE NOTICE '  % → %', p_sede1_domain, p_sede1_nombre;
  RAISE NOTICE '  % → %', p_sede2_domain, p_sede2_nombre;
  RAISE NOTICE 'Los dos QR impresos siguen sirviendo y cada uno atribuye a SU local.';
  RAISE NOTICE 'Raíz de la marca: % (no se imprime; con 2 sedes pide elegir).', p_marca_domain;
  RAISE NOTICE '───────────────────────────────────────────────';
END $$;
