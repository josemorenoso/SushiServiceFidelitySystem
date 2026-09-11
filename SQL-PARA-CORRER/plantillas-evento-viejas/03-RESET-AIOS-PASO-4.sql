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

-- ── A. PRIMERO: mirá cómo se llama el cliente y qué tiene en el paso 4 ──────
--    Corré SOLO esta consulta, copiá el business_name y pegalo abajo en B.
SELECT
    business_name,
    whatsapp_provisioning->'steps'->'templates'->>'status'          AS paso4,
    jsonb_array_length(COALESCE(whatsapp_provisioning->'steps'->'templates'->'created',  '[]')) AS creadas,
    jsonb_array_length(COALESCE(whatsapp_provisioning->'steps'->'templates'->'approved', '[]')) AS aprobadas
FROM clients
ORDER BY business_name;

-- ── B. DESPUÉS: el reset. Cambiá 'NOMBRE DEL NEGOCIO' por el de arriba ───────
DO $$
DECLARE
  p_negocio text := 'NOMBRE DEL NEGOCIO';   -- ← lo que te dio la consulta A
  v_cliente uuid;
  v_n       int;
BEGIN
  IF p_negocio = 'NOMBRE DEL NEGOCIO' THEN
    RAISE EXCEPTION 'Te falta poner el nombre del cliente en p_negocio (línea de arriba). Sale de la consulta A.';
  END IF;

  SELECT count(*) INTO v_n FROM clients WHERE lower(trim(business_name)) = lower(trim(p_negocio));
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No encontré un propietario con business_name = "%". Copialo de la consulta A.', p_negocio;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'Hay % clientes que se llaman "%". Afiná el nombre o usá el id.', v_n, p_negocio;
  END IF;
  SELECT id INTO v_cliente FROM clients WHERE lower(trim(business_name)) = lower(trim(p_negocio));

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

-- Para mirar cómo quedó, volvé a correr la consulta A: `creadas` tiene que dar 0.
