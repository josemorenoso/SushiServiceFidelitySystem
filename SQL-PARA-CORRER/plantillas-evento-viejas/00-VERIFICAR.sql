-- ═══════════════════════════════════════════════════════════════
-- 00 · QUÉ HAY HOY. Solo lectura: no cambia ni una fila.
-- Corré esto ANTES y guardá la salida. Es lo que el 01 va a tocar.
-- ═══════════════════════════════════════════════════════════════

-- 1. Toda versión de plantilla de evento, con su proveedor y su estado.
--    `existe_en_el_proveedor` es la columna que decide qué hace el 01:
--    una fila `failed` nunca llegó a crearse en la WABA, así que su nombre
--    está LIBRE y la fila se puede borrar. Una `pending`/`approved` sí existe
--    allá afuera y Meta no deja reusar el nombre: esa se retira, no se borra.
SELECT
    t.slug,
    t.messaging_provider,
    tv.template_key,
    tv.provider_ref,
    tv.status,
    tv.is_current,
    tv.created_at,
    (tv.status IN ('pending', 'approved', 'retired')) AS existe_en_el_proveedor
FROM template_versions tv
JOIN tenants t ON t.id = tv.tenant_id
WHERE tv.template_key IN ('event_image', 'event_video')
ORDER BY t.slug, tv.template_key, tv.created_at;

-- 2. Los punteros vivos. OJO: las filas de un tenant `twilio` son las de los
--    4 clientes viejos y NO se tocan (decisión 6 del dueño). Están acá solo
--    para que veas que el 01 las deja como están.
SELECT
    t.slug,
    t.messaging_provider,
    s.key,
    s.value,
    s.updated_at
FROM admin_settings s
JOIN tenants t ON t.id = s.tenant_id
WHERE s.key IN ('event_template_image_sid', 'event_template_video_sid')
ORDER BY t.messaging_provider, t.slug, s.key;

-- 3. Eventos del calendario que todavía esperan salir. Si alguno está en
--    'scheduled' con media, va a intentar despachar con el puntero que el 01
--    borra: reprogramalo después de que la plantilla nueva quede aprobada.
SELECT t.slug, e.id, e.title, e.event_date, e.media_type, e.status
FROM restaurant_events e
JOIN tenants t ON t.id = e.tenant_id
WHERE e.status IN ('planned', 'scheduled')
  AND e.media_url IS NOT NULL
ORDER BY e.event_date;
