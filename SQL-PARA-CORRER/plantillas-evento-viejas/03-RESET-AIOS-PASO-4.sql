-- ═══════════════════════════════════════════════════════════════
-- 03 · Que el AIOS vuelva a ofrecer «Crear plantillas» para un propietario.
-- ⚠️ ESTE VA EN EL SUPABASE DEL **AIOS**, no en el del producto.
--    (El 00, el 01 y el 02 van en el del producto. Es el error fácil.)
--
-- POR QUÉ
--   El paso 4 del AIOS salta las plantillas que ya creó (las anota en
--   `clients.whatsapp_provisioning.steps.templates.created`). Las 12 del 09
--   llevan 🍣 y el texto viejo de evento: hay que rehacerlas, y para eso el
--   AIOS tiene que olvidarse de que las creó.
--
-- QUÉ PASA DESPUÉS
--   Al volver a apretar «Crear plantillas», el AIOS (v1.10.0+) mira qué nombres
--   ya existen en la WABA y como `bienvenida`, `cumpleanos`… siguen ahí, crea
--   `bienvenida_v2`, `cumpleanos_v2`… No hay que borrar NADA en Meta: las
--   viejas quedan huérfanas, pendientes o aprobadas, y nadie las apunta. Si
--   Meta aprueba las dos, el paso de la sede escribe la versión MÁS ALTA.
--
-- ⚠️ Requiere el AIOS v1.10.0 desplegado. Con el anterior, el botón
--   reintentaría los nombres base y Meta los rechazaría por repetidos.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  p_negocio text := 'NOMBRE DEL NEGOCIO';   -- ← `clients.business_name`, tal cual
  v_cliente uuid;
BEGIN
  SELECT id INTO v_cliente FROM clients WHERE business_name = p_negocio;
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'No encontré un propietario con business_name = %. Copialo tal cual de la lista de clientes.', p_negocio;
  END IF;

  UPDATE clients
     SET whatsapp_provisioning = jsonb_set(
           COALESCE(whatsapp_provisioning, '{}'::jsonb),
           '{steps,templates}',
           jsonb_build_object('status', 'pending', 'created', '[]'::jsonb, 'approved', '[]'::jsonb),
           true
         )
   WHERE id = v_cliente;

  RAISE NOTICE 'Listo: el paso 4 de % vuelve a estar pendiente. Andá al AIOS y apretá «Crear plantillas».', p_negocio;
END $$;

-- Para mirar cómo quedó:
-- SELECT business_name, whatsapp_provisioning->'steps'->'templates'
--   FROM clients WHERE business_name = 'NOMBRE DEL NEGOCIO';
