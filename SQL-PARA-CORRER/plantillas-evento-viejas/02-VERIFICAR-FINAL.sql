-- ═══════════════════════════════════════════════════════════════
-- 02 · Después del 01. Las tres cosas que tienen que ser verdad.
-- ═══════════════════════════════════════════════════════════════

-- 1. Ningún tenant Zernio apunta ya a una plantilla de evento. Debe dar 0.
SELECT count(*) AS punteros_zernio_que_deberian_ser_cero
FROM admin_settings s
JOIN tenants t ON t.id = s.tenant_id
WHERE t.messaging_provider = 'zernio'
  AND s.key IN ('event_template_image_sid', 'event_template_video_sid');

-- 2. Los 4 Twilio siguen con los suyos. Esta lista NO puede haber cambiado
--    respecto a la del 00.
SELECT t.slug, s.key, s.value
FROM admin_settings s
JOIN tenants t ON t.id = s.tenant_id
WHERE t.messaging_provider <> 'zernio'
  AND s.key IN ('event_template_image_sid', 'event_template_video_sid')
ORDER BY t.slug, s.key;

-- 3. No quedó ninguna versión de evento vigente ni en revisión en un Zernio.
--    Debe dar 0: si no, hay una pendiente que Meta todavía está mirando y su
--    aprobación volvería a escribir el puntero por su cuenta.
SELECT count(*) AS vigentes_o_pendientes_que_deberian_ser_cero
FROM template_versions tv
JOIN tenants t ON t.id = tv.tenant_id
WHERE t.messaging_provider = 'zernio'
  AND tv.template_key IN ('event_image', 'event_video')
  AND (tv.is_current OR tv.status = 'pending');
