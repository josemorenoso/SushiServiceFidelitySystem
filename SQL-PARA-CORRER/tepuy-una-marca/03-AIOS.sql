-- ═══════════════════════════════════════════════════════════════════════════
-- TEPUY — 03. PONER AL AIOS DE ACUERDO CON LA REALIDAD
-- ⚠️ ESTE VA EN EL SUPABASE DEL **AIOS**, no en el del producto.
--    (Los otros tres van en el del producto. Es el error fácil de cometer.)
--
-- POR QUÉ HACE FALTA
--   El 01-FUNDIR.sql arregla el PRODUCTO. El AIOS sigue creyendo que Tepuy son
--   dos negocios con dos marcas: sus dos filas de `client_locations` apuntan a
--   `clubtepuylaureles` y `clubtepuyenvigado`, y la segunda ya no existe. Si no
--   se corrige, la ficha de esa sede queda mostrando una marca fantasma y el
--   asistente ofrecería volver a crearla.
--
-- ORDEN
--   1. `clients.site_model = 'multi'` PRIMERO. Desde la 00007 el slug repetido
--      dentro de un mismo propietario solo se permite si el propietario está
--      declarado 'multi' — lo vigila un trigger. Sin esto, el paso 2 se rechaza.
--   2. Las dos sedes pasan a apuntar a la marca `clubtepuy`, cada una con su
--      subdominio impreso y con el id de SU sede en el producto.
--
-- EL DATO QUE HAY QUE TRAER
--   `product_location_id` es el id de la sede EN EL PRODUCTO. Sacalo corriendo
--   esto en el Supabase del PRODUCTO y pegá los dos uuid abajo:
--
--     SELECT l.slug, l.id, l.domain
--       FROM restaurant_locations l JOIN tenants t ON t.id = l.tenant_id
--      WHERE t.slug = 'clubtepuy' ORDER BY l.sort_order;
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── Pegá acá los dos uuid del producto ───────────────────────────────────
  p_loc_laureles uuid := '00000000-0000-0000-0000-000000000000';  -- ← sede laureles
  p_loc_envigado uuid := '00000000-0000-0000-0000-000000000000';  -- ← sede envigado
  -- ─────────────────────────────────────────────────────────────────────────

  p_marca_slug   text := 'clubtepuy';
  v_cliente      uuid;
  v_sede1        uuid;
  v_sede2        uuid;
BEGIN
  IF p_loc_laureles = '00000000-0000-0000-0000-000000000000'::uuid
     OR p_loc_envigado = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Faltan los uuid de las sedes del producto. Leé la cabecera de este archivo.';
  END IF;

  -- El propietario, por cualquiera de sus dos sedes viejas.
  SELECT DISTINCT client_id INTO v_cliente
    FROM client_locations
   WHERE tenant_slug IN ('clubtepuylaureles', 'clubtepuyenvigado');

  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'No encontré al propietario de Tepuy por sus tenant_slug viejos. ¿Ya se corrigió?';
  END IF;

  SELECT id INTO v_sede1 FROM client_locations WHERE tenant_slug = 'clubtepuylaureles';
  SELECT id INTO v_sede2 FROM client_locations WHERE tenant_slug = 'clubtepuyenvigado';

  -- ── 1. El propietario tiene VARIAS sedes ─────────────────────────────────
  UPDATE clients SET site_model = 'multi' WHERE id = v_cliente;

  -- ── 2. Las dos sedes, apuntando a la MISMA marca ─────────────────────────
  IF v_sede1 IS NOT NULL THEN
    UPDATE client_locations
       SET tenant_slug         = p_marca_slug,
           domain              = 'clubtepuylaureles.constelarys.com',
           product_location_id = p_loc_laureles
     WHERE id = v_sede1;
  END IF;

  IF v_sede2 IS NOT NULL THEN
    UPDATE client_locations
       SET tenant_slug         = p_marca_slug,
           domain              = 'clubtepuyenvigado.constelarys.com',
           product_location_id = p_loc_envigado
     WHERE id = v_sede2;
  END IF;

  RAISE NOTICE 'AIOS al día: propietario % en modo multi, 2 sedes sobre la marca %.', v_cliente, p_marca_slug;
END $$;

-- ── Verificación ───────────────────────────────────────────────────────────
SELECT c.business_name, c.site_model,
       l.name AS sede, l.tenant_slug, l.domain, l.product_location_id
  FROM client_locations l
  JOIN clients c ON c.id = l.client_id
 WHERE l.tenant_slug = 'clubtepuy'
 ORDER BY l.name;
