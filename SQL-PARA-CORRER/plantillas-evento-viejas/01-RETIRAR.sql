-- ═══════════════════════════════════════════════════════════════
-- 01 · RETIRAR las plantillas de evento viejas — SOLO tenants Zernio.
--
-- ⚠️ NO borra nada en Meta. Zernio no expone un DELETE de plantillas
-- (`src/lib/zernio/templates.ts`, y el contrato verificado prohíbe inventar
-- rutas), así que el borrado FÍSICO es un clic tuyo en el panel de Zernio /
-- Meta. Lo que hace este script es lo que resuelve el problema real: que nada
-- del sistema vuelva a apuntar a esos textos.
--
-- ⚠️ LOS 4 TENANTS TWILIO NO SE TOCAN. Sushi Service, Don Alirio, Frangal y
-- Demo envían eventos hoy con sus plantillas aprobadas y su `{{6}}`. Borrarles
-- el puntero les rompe el calendario en silencio. Por eso TODO filtra por
-- `messaging_provider = 'zernio'`. No le quites ese WHERE.
--
-- Corré el 00 primero. Va en una transacción: si algo no cuadra, ROLLBACK.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Las que NUNCA existieron en el proveedor se BORRAN.
--    `failed` = Zernio rechazó la creación (el 502 de la media de muestra),
--    así que ese nombre sigue libre en la WABA. Borrar la fila deja que la
--    plantilla nueva nazca con el nombre base (`evento_imagen`) en vez de
--    arrastrar un `_v2` que no corresponde a nada.
-- ─────────────────────────────────────────────────────────────
DELETE FROM template_versions tv
USING tenants t
WHERE t.id = tv.tenant_id
  AND t.messaging_provider = 'zernio'
  AND tv.template_key IN ('event_image', 'event_video')
  AND tv.status = 'failed';

-- ─────────────────────────────────────────────────────────────
-- 2. Las que SÍ existen allá afuera se RETIRAN, no se borran.
--    Meta no deja reusar el nombre de una plantilla que existe, y
--    `idx_template_versions_provider_ref` es el espejo de esa regla: si
--    borráramos la fila, la próxima creación reintentaría el mismo nombre y
--    Zernio la rechazaría. Retirada, `nextProviderRef()` la ve y pasa a `_v2`.
-- ─────────────────────────────────────────────────────────────
UPDATE template_versions tv
SET status     = 'retired',
    is_current = false,
    retired_at = COALESCE(tv.retired_at, now())
FROM tenants t
WHERE t.id = tv.tenant_id
  AND t.messaging_provider = 'zernio'
  AND tv.template_key IN ('event_image', 'event_video')
  AND tv.status <> 'retired';

-- ─────────────────────────────────────────────────────────────
-- 3. Los punteros. Un evento que se despache sin puntero falla con un error
--    explícito ("falta event_template_image_sid") y NO envía nada equivocado
--    — que es exactamente lo que queremos mientras no haya plantilla nueva.
-- ─────────────────────────────────────────────────────────────
DELETE FROM admin_settings s
USING tenants t
WHERE t.id = s.tenant_id
  AND t.messaging_provider = 'zernio'
  AND s.key IN ('event_template_image_sid', 'event_template_video_sid');

-- Mirá los conteos antes de confirmar. Si algún número te sorprende: ROLLBACK.
SELECT
    (SELECT count(*) FROM template_versions tv JOIN tenants t ON t.id = tv.tenant_id
      WHERE t.messaging_provider = 'zernio' AND tv.template_key IN ('event_image','event_video')
        AND tv.status = 'retired')                                    AS versiones_retiradas,
    (SELECT count(*) FROM admin_settings s JOIN tenants t ON t.id = s.tenant_id
      WHERE t.messaging_provider = 'zernio'
        AND s.key IN ('event_template_image_sid','event_template_video_sid'))
                                                                      AS punteros_zernio_vivos,
    (SELECT count(*) FROM admin_settings s JOIN tenants t ON t.id = s.tenant_id
      WHERE t.messaging_provider <> 'zernio'
        AND s.key IN ('event_template_image_sid','event_template_video_sid'))
                                                                      AS punteros_twilio_intactos;

COMMIT;
