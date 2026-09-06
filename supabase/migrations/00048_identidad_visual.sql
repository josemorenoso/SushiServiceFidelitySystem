-- ═══════════════════════════════════════════════════════════════════════════
-- 00048 — Identidad visual por marca (§5 pantalla + tarjeta, §6 logo y paleta,
--          §3 persistir la config del QR Studio)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dos cosas, nada más:
--
--   1. `merge_tenant_config_deep()` — poder escribir UN campo dentro de un
--      espacio con nombre de `tenants.config` sin borrar el resto del espacio.
--   2. El bucket `brand-assets` — dónde vive el logo que sube el restaurante.
--
-- NO crea tablas, NO agrega columnas y NO toca ninguna fila de datos. Es
-- reaplicable: todo es `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING` o un
-- `IF NOT EXISTS` explícito.
--
-- Ref: docs/features/identidad-visual.md · docs/DB_SCHEMA.md
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Merge profundo de jsonb ─────────────────────────────────────────────
--
-- EL PROBLEMA QUE RESUELVE
-- ────────────────────────
-- `merge_tenant_config()` (00032) hace `config || patch`. El operador `||` de
-- jsonb es SUPERFICIAL: mezcla solo el primer nivel. Mientras `config` fue plana
-- eso alcanzaba. Con espacios con nombre deja de alcanzar y de la peor manera:
--
--     config  = {"branding": {"primary": "#FF4D6D", "logo_url": "https://…"}}
--     patch   = {"branding": {"primary": "#0A7C4A"}}
--     config || patch
--       →     {"branding": {"primary": "#0A7C4A"}}     ← el logo DESAPARECIÓ
--
-- Sin error, sin aviso, y el restaurante se entera cuando abre su tarjeta.
--
-- La alternativa era leer en JS, mezclar y reescribir — que es exactamente lo
-- que 00032 quitó, porque abre una ventana en la que dos escrituras concurrentes
-- sobre `tenants.config` se pisan. Así que el merge profundo se hace en la base,
-- dentro de la misma sentencia.
--
-- SEMÁNTICA (fijada por tests/db/identidad-visual.test.ts):
--   · objeto vs objeto  → se mezclan recursivamente
--   · cualquier otra    → gana el de la derecha (el patch)
--   · `null` explícito  → se guarda como null (es como el panel "borra" un campo;
--                          los resolvedores tratan null y '' igual que ausente)
--
-- ⚠️ plpgsql, no sql, y no es preferencia de estilo: la función se llama a sí
-- misma. Postgres VALIDA el cuerpo de una función `LANGUAGE sql` al crearla, así
-- que la autorreferencia falla con "function jsonb_deep_merge(jsonb, jsonb) does
-- not exist" antes de que la función exista. plpgsql resuelve los nombres en
-- tiempo de ejecución y la recursión funciona.
CREATE OR REPLACE FUNCTION jsonb_deep_merge(a jsonb, b jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF a IS NULL THEN RETURN b; END IF;
  IF b IS NULL THEN RETURN a; END IF;

  -- Si alguno de los dos no es un objeto, no hay nada que mezclar: gana el patch.
  IF jsonb_typeof(a) <> 'object' OR jsonb_typeof(b) <> 'object' THEN
    RETURN b;
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      k,
      CASE
        WHEN a ? k AND b ? k
             AND jsonb_typeof(a -> k) = 'object'
             AND jsonb_typeof(b -> k) = 'object'
          THEN jsonb_deep_merge(a -> k, b -> k)
        WHEN b ? k THEN b -> k
        ELSE a -> k
      END
    ),
    '{}'::jsonb
  )
    INTO result
    FROM (
      SELECT jsonb_object_keys(a) AS k
      UNION
      SELECT jsonb_object_keys(b)
    ) AS keys;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION jsonb_deep_merge(jsonb, jsonb) IS
  'Merge recursivo de dos jsonb. Objeto vs objeto se mezclan; en cualquier otro caso gana el segundo argumento. Usada por merge_tenant_config_deep().';


-- ─── 2. Escritura de `tenants.config` con espacios con nombre ───────────────
--
-- ⚠️ NOMBRE NUEVO, NO UNA SOBRECARGA. `merge_tenant_config()` sigue existiendo,
-- con su misma firma y su mismo comportamiento superficial. Agregarle un
-- parámetro habría creado una SOBRECARGA y dejado ambigua (42725) toda llamada
-- vieja — la trampa que ya nos costó `log_review_shown_deduped()` el 2026-09-04.
--
CREATE OR REPLACE FUNCTION merge_tenant_config_deep(p_tenant_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE tenants
     SET config = jsonb_deep_merge(COALESCE(config, '{}'::jsonb), p_patch)
   WHERE id = p_tenant_id
  RETURNING config;
$$;

COMMENT ON FUNCTION merge_tenant_config_deep(uuid, jsonb) IS
  'Aplica un patch ANIDADO sobre tenants.config sin perder claves hermanas dentro del mismo espacio. Único escritor de config.branding / config.qr_studio. La versión superficial (merge_tenant_config) se conserva para las claves planas.';


-- ─── 3. Bucket del logo de marca ────────────────────────────────────────────
--
-- Mismo patrón que `event-media` (00012): bucket PÚBLICO en lectura, escritura
-- solo para `authenticated`.
--
-- POR QUÉ PÚBLICO. El logo se dibuja en tres sitios que no pueden autenticarse:
-- la pantalla de check-in y la tarjeta (anónimas, un cliente con su celular) y
-- el canvas del póster QR. Es el logo comercial del restaurante — el mismo que
-- está en su fachada. No hay nada que proteger.
--
-- POR QUÉ NO UN data URL EN `tenants.config`. Un PNG de 300 KB en base64 son
-- ~400 KB de jsonb que `getBrandingForHost()` leería en CADA request de CADA
-- página pública, y que viajarían al navegador dentro del HTML. Acá va la URL y
-- el archivo lo sirve el CDN de Storage, cacheado.
--
-- EL PATH LLEVA EL tenant_id POR DELANTE (`<tenant_id>/logo-<ts>.png`). No es
-- decorativo: es lo que hace verificable de un vistazo que la marca A no puede
-- escribir sobre el logo de la marca B. Quien lo impone es la ruta de subida,
-- que arma el path desde `requireTenantId()` y nunca desde el cliente.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('brand-assets', 'brand-assets', true)
  ON CONFLICT (id) DO NOTHING;

-- Lectura pública: la pantalla del cliente no tiene sesión.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_public_read'
  ) THEN
    CREATE POLICY "brand_assets_public_read" ON storage.objects
      FOR SELECT
      USING (bucket_id = 'brand-assets');
  END IF;
END
$$;

-- Escritura/borrado: solo sesión de panel. La subida real la hace el service
-- role desde `/api/dashboard/brand-logo`, que ya resolvió el tenant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_admin_write'
  ) THEN
    CREATE POLICY "brand_assets_admin_write" ON storage.objects
      FOR INSERT
      WITH CHECK (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_admin_update'
  ) THEN
    CREATE POLICY "brand_assets_admin_update" ON storage.objects
      FOR UPDATE
      USING (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_admin_delete'
  ) THEN
    CREATE POLICY "brand_assets_admin_delete" ON storage.objects
      FOR DELETE
      USING (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');
  END IF;
END
$$;
