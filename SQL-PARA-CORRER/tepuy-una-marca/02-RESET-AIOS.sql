-- ═══════════════════════════════════════════════════════════════════════════
-- TEPUY — 02. DEJAR AL AIOS LISTO PARA REHACER EL ALTA
-- ⚠️ ESTE VA EN EL SUPABASE DEL **AIOS**, no en el del producto.
--    (El 00, el 01 y el 03 van en el del producto. Es el error fácil.)
--
-- POR QUÉ
--   El 01 borró las dos marcas del producto. El AIOS todavía cree que las creó:
--   sus dos sedes tienen `tenant_slug` puesto y el asistente las da por hechas,
--   así que no te ofrecería volver a crear la marca.
--
-- QUÉ HACE — y qué NO
--   NO borra las sedes: se conservan nombre, dirección, mensualidad, fecha de
--   inicio y cobros. Solo deshace el paso 2 del asistente, para que lo puedas
--   correr de nuevo bien. Vos no retecleás nada.
--
--   1. El propietario pasa a `site_model = 'multi'` (varias sedes). Va PRIMERO:
--      desde la 00007 un trigger solo permite el mismo `tenant_slug` en dos
--      sedes del mismo dueño si está declarado 'multi'.
--   2. Las dos sedes sueltan la marca vieja (`tenant_slug`, `product_location_id`
--      y su `provisioning` vuelven a cero) y se quedan con SU subdominio impreso.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  p_dom_laureles text := 'clubtepuylaureles.constelarys.com';  -- QR IMPRESO
  p_dom_envigado text := 'clubtepuyenvigado.constelarys.com';  -- QR IMPRESO

  v_cliente uuid;
  v_n       int;
BEGIN
  -- El propietario, por cualquiera de sus dos sedes.
  SELECT DISTINCT client_id INTO v_cliente
    FROM client_locations
   WHERE tenant_slug IN ('clubtepuylaureles', 'clubtepuyenvigado')
      OR domain      IN (p_dom_laureles, p_dom_envigado);

  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'No encontré al propietario de Tepuy. Revisá los slugs y dominios de arriba.';
  END IF;

  -- ── 1. Varias sedes ──────────────────────────────────────────────────────
  UPDATE clients SET site_model = 'multi' WHERE id = v_cliente;

  -- ── 2. Las sedes sueltan la marca borrada ────────────────────────────────
  -- `provisioning` vuelve al default de la 00003: los cuatro pasos en 'pending'
  -- y `brand` vacío. Es lo que hace que el asistente vuelva a ofrecer el paso 2.
  UPDATE client_locations
     SET tenant_slug         = NULL,
         product_location_id = NULL,
         provisioning        = jsonb_build_object(
           'simulated', false,
           'brand',     COALESCE(provisioning->'brand', '{}'::jsonb),  -- se conserva lo capturado en el alta
           'steps',     jsonb_build_object(
             'tenant',     jsonb_build_object('status', 'pending'),
             'domain',     jsonb_build_object('status', 'pending'),
             'templates',  jsonb_build_object('status', 'pending'),
             'activation', jsonb_build_object('status', 'pending')
           )
         )
   WHERE client_id = v_cliente;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '% sede(s) devueltas al paso 2.', v_n;

  -- ── 3. Cada sede con SU subdominio impreso ───────────────────────────────
  -- Es de donde el asistente saca el slug y el dominio de la sede al crear la
  -- marca (`subdomainLabel(site.domain)` en siteCreateTenant/siteAttachLocation).
  -- Si acá quedara mal, el QR impreso quedaría apuntando a ninguna parte.
  UPDATE client_locations SET domain = p_dom_laureles
   WHERE client_id = v_cliente AND name ILIKE '%laureles%';
  UPDATE client_locations SET domain = p_dom_envigado
   WHERE client_id = v_cliente AND name ILIKE '%envigado%';

  RAISE NOTICE 'AIOS listo. Ahora seguí el paso a paso del LEEME.md.';
END $$;

-- ── Comprobación: así tienen que quedar las dos filas ──────────────────────
-- tenant_slug en NULL, site_model 'multi', y cada sede con su subdominio.
SELECT c.business_name, c.site_model,
       l.name AS sede, l.tenant_slug, l.domain, l.product_location_id,
       l.provisioning->'steps'->'tenant'->>'status' AS paso_2
  FROM client_locations l
  JOIN clients c ON c.id = l.client_id
 WHERE c.business_name ILIKE '%tepuy%'
 ORDER BY l.name;
