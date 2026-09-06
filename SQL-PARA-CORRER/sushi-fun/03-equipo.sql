-- ═══════════════════════════════════════════════════════════════
-- 03 · Equipo (meseros y dispositivos)
-- Absorción de Sushi Fun al despliegue principal — generado 2026-09-06
-- GENERADO por scripts/gen-sushi-fun-dump.mjs. No editar a mano: regenerar.
--
-- Se pega en el SQL Editor del Supabase PRINCIPAL (el de Sushi Service).
-- Los archivos se corren EN ORDEN. Cada uno aborta si ya se corrió.
--
-- tenant_id de Sushi Fun: b2c3d4e5-f6a7-8901-bcde-f23456789012
--
-- staff_users.location_id se llena con la sede principal EN EL INSERT. No es un
-- backfill de historia: es la regla D11 (un mesero es de UNA sede), y sin ella el
-- mesero no sale en NINGUNA lista del escáner. La 00044 ya creó la columna y su FK
-- COMPUESTA (location_id, tenant_id), que es la que impide atribuirlo a otra marca.
-- Ojo: trg_staff_users_sede_coherente es BEFORE UPDATE, no BEFORE INSERT — acá el
-- que verifica es la FK compuesta, no el trigger.
--
-- staff_devices.location_id se deja NULL a propósito: un dispositivo es un aparato
-- FÍSICO, y trg_staff_devices_sede_coherente (00044) solo compara sedes cuando las
-- DOS están puestas. Con NULL pasa el trigger y no se inventa nada.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- staff_users — 1 fila(s) en el origen
-- ─────────────────────────────────────────────────────────────
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM staff_users WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 0 THEN
    RAISE EXCEPTION 'staff_users: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;
  END IF;
END $guard$;

INSERT INTO staff_users (
  id, name, phone, pin, role, is_active, last_login_at, created_at, updated_at, tenant_id, location_id
) VALUES
  ('41d0eced-3c82-42d1-af2b-b2113d17842d'::uuid, 'Jairo', '3127161556', '$2b$10$9njr.LHmGgMA8dlazzqWAeNgFmgnTN/u/oiT5QNNBW/HY/H7JUIC6', 'supervisor', true, '2026-06-08T01:39:53.722+00:00'::timestamptz, '2026-06-02T16:53:07.381211+00:00'::timestamptz, '2026-09-02T23:33:45.613981+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid, 'd6798a6e-40f1-4d1a-91be-5d30770c1448'::uuid);

DO $ver$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM staff_users WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 1 THEN RAISE EXCEPTION 'staff_users FALLO: se esperaban 1 filas y hay %.', v; END IF;
  RAISE NOTICE 'OK staff_users: % filas de Sushi Fun.', v;
END $ver$;

-- ─────────────────────────────────────────────────────────────
-- staff_devices — 4 fila(s) en el origen
-- ─────────────────────────────────────────────────────────────
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM staff_devices WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 0 THEN
    RAISE EXCEPTION 'staff_devices: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;
  END IF;
END $guard$;

INSERT INTO staff_devices (
  id, staff_user_id, device_fingerprint, device_name, is_trusted, trusted_at, expires_at, last_used_at, created_at, tenant_id, location_id
) VALUES
  ('fe8ec7ff-ace1-4ff1-985b-b1b86f6e2b67'::uuid, '41d0eced-3c82-42d1-af2b-b2113d17842d'::uuid, 'df_260c896a', 'Celular del Local', true, '2026-06-02T16:55:11.328+00:00'::timestamptz, NULL, '2026-06-08T01:28:07.397+00:00'::timestamptz, '2026-06-02T16:55:11.391921+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid, NULL),
  ('6faaf53d-8f0f-4a61-b3d7-3fb326ced421'::uuid, '41d0eced-3c82-42d1-af2b-b2113d17842d'::uuid, 'df_57692d1f', 'Celular del Local', true, '2026-06-02T16:55:13.016+00:00'::timestamptz, NULL, '2026-08-22T21:29:22.424+00:00'::timestamptz, '2026-06-02T16:55:13.067677+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid, NULL),
  ('ec386890-27a2-41ea-a983-f2895fe78c79'::uuid, '41d0eced-3c82-42d1-af2b-b2113d17842d'::uuid, 'df_39d22fa0', 'Celular del Local', true, '2026-06-08T01:39:55.249+00:00'::timestamptz, NULL, '2026-06-09T21:06:06.749+00:00'::timestamptz, '2026-06-08T01:39:55.317918+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid, NULL),
  ('e29d8567-60c1-4add-a521-fc6a5b4e7cd5'::uuid, '41d0eced-3c82-42d1-af2b-b2113d17842d'::uuid, 'df_62f92306', 'Celular del Local', true, '2026-09-02T23:33:59.002+00:00'::timestamptz, NULL, '2026-09-03T00:22:33.252+00:00'::timestamptz, '2026-09-02T23:33:59.246201+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid, NULL);

DO $ver$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM staff_devices WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 4 THEN RAISE EXCEPTION 'staff_devices FALLO: se esperaban 4 filas y hay %.', v; END IF;
  RAISE NOTICE 'OK staff_devices: % filas de Sushi Fun.', v;
END $ver$;


COMMIT;
