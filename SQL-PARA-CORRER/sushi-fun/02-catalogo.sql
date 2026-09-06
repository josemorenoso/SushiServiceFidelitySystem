-- ═══════════════════════════════════════════════════════════════
-- 02 · Catálogo de la marca (premios, ajustes, números autorizados)
-- Absorción de Sushi Fun al despliegue principal — generado 2026-09-06
-- GENERADO por scripts/gen-sushi-fun-dump.mjs. No editar a mano: regenerar.
--
-- Se pega en el SQL Editor del Supabase PRINCIPAL (el de Sushi Service).
-- Los archivos se corren EN ORDEN. Cada uno aborta si ya se corrió.
--
-- tenant_id de Sushi Fun: b2c3d4e5-f6a7-8901-bcde-f23456789012
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- reward_tiers — 6 fila(s) en el origen
-- 2 de los 6 vienen con is_active=false (duplicados legacy). Se copian tal cual: son historia, y no se ven.
-- ─────────────────────────────────────────────────────────────
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM reward_tiers WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 0 THEN
    RAISE EXCEPTION 'reward_tiers: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;
  END IF;
END $guard$;

INSERT INTO reward_tiers (
  id, tier_name, point_threshold, safe_reward_title, mystery_box_enabled, mystery_prizes, is_black, sort_order, is_active, created_at, tenant_id
) VALUES
  ('af0e6a44-14c2-4af5-8f95-e7207858f6f3'::uuid, 'Plata', 150, 'Coctel a Eleccion', true, '[{"emoji":"☕","title":"Coctel a Eleccion","probability":70},{"emoji":"🍰","title":"Postre","probability":25},{"emoji":"🍽️","title":"Plato fuerte gratis","probability":5}]'::jsonb, false, 1, true, '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('e9a53504-89db-4c19-b035-1b8c1f11c44a'::uuid, 'BLACK', 1000, '10% off permanente', false, '[]'::jsonb, true, 4, true, '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('4b409a1e-b51d-4345-82e5-24b4ac1ef77b'::uuid, 'Plata', 350, 'Postre gratis', true, '[{"emoji":"🍰","title":"Postre gratis","probability":65},{"emoji":"🍽️","title":"Plato fuerte gratis","probability":25},{"emoji":"✨","title":"Experiencia especial","probability":10}]'::jsonb, false, 2, false, '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('deb5de7e-c158-4851-82bc-df921a14a7b9'::uuid, 'Oro', 600, 'Plato fuerte gratis', true, '[{"emoji":"🍽️","title":"Plato fuerte gratis","probability":60},{"emoji":"✨","title":"Experiencia especial","probability":30},{"emoji":"🏆","title":"Super premio","probability":10}]'::jsonb, false, 3, false, '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('2944fdef-7b36-43f2-bdeb-02a0bdb63da8'::uuid, 'Oro', 300, 'Entrada De La Casa', true, '[{"emoji":"🍰","title":"Entrada de la Casa","probability":70},{"emoji":"🍽️","title":"Postre","probability":25},{"emoji":"✨","title":"Plato Fuerte Gratis","probability":5}]'::jsonb, false, 2, true, '2026-05-30T18:00:38.650266+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('c7936999-6a3f-4d87-972b-6705e437d2bc'::uuid, 'Diamante', 450, 'Ramen de la Casa', true, '[{"emoji":"🍽️","title":"Ramen de la casa","probability":85},{"emoji":"✨","title":"Experiencia especial","probability":15}]'::jsonb, false, 3, true, '2026-05-30T18:00:38.650266+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid);

DO $ver$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM reward_tiers WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 6 THEN RAISE EXCEPTION 'reward_tiers FALLO: se esperaban 6 filas y hay %.', v; END IF;
  RAISE NOTICE 'OK reward_tiers: % filas de Sushi Fun.', v;
END $ver$;

-- ─────────────────────────────────────────────────────────────
-- rewards — 3 fila(s) en el origen
-- ─────────────────────────────────────────────────────────────
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM rewards WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 0 THEN
    RAISE EXCEPTION 'rewards: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;
  END IF;
END $guard$;

INSERT INTO rewards (
  id, visit_milestone, title, message_template, is_active, created_at, is_black, point_threshold, tier_id, tenant_id
) VALUES
  ('9ed5ff48-8743-4f73-bf80-4927d8d098fa'::uuid, 3, 'Bebida gratis', '¡Felicidades {{name}}! 🎉 Llevas {{visits}} visitas y te has ganado una bebida gratis. ¡Muestra este mensaje en tu próxima visita!', true, '2026-05-21T19:51:24.712771+00:00'::timestamptz, false, NULL, NULL, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('ca4ab7d7-b0e6-4c35-852a-7b87a0079bda'::uuid, 5, 'Postre gratis', '¡Increíble {{name}}! 🍰 ¡{{visits}} visitas! Te ganaste un postre gratis. ¡Muestra este mensaje para reclamarlo!', true, '2026-05-21T19:51:24.712771+00:00'::timestamptz, false, NULL, NULL, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('d9d40d05-9e7c-47c2-813c-056d73471fc4'::uuid, 7, '20% de descuento', '¡Wow {{name}}! 🌟 ¡{{visits}} visitas! Eres un cliente VIP. Tienes 20% de descuento en tu próxima cuenta. ¡Muestra este mensaje!', true, '2026-05-21T19:51:24.712771+00:00'::timestamptz, false, NULL, NULL, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid);

DO $ver$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM rewards WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 3 THEN RAISE EXCEPTION 'rewards FALLO: se esperaban 3 filas y hay %.', v; END IF;
  RAISE NOTICE 'OK rewards: % filas de Sushi Fun.', v;
END $ver$;

-- ─────────────────────────────────────────────────────────────
-- mystery_box_global_caps — 1 fila(s) en el origen
-- ─────────────────────────────────────────────────────────────
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM mystery_box_global_caps WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 0 THEN
    RAISE EXCEPTION 'mystery_box_global_caps: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;
  END IF;
END $guard$;

INSERT INTO mystery_box_global_caps (
  id, tier_id, prize_title, max_per_period, period, current_count, period_start, created_at, tenant_id
) VALUES
  ('deddb7b7-7db5-45a7-9600-c9bd724f6f76'::uuid, 'af0e6a44-14c2-4af5-8f95-e7207858f6f3'::uuid, 'Plato fuerte gratis', 5, 'month', 0, '2026-05-30T17:50:15.172079+00:00'::timestamptz, '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid);

DO $ver$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM mystery_box_global_caps WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 1 THEN RAISE EXCEPTION 'mystery_box_global_caps FALLO: se esperaban 1 filas y hay %.', v; END IF;
  RAISE NOTICE 'OK mystery_box_global_caps: % filas de Sushi Fun.', v;
END $ver$;

-- ─────────────────────────────────────────────────────────────
-- admin_settings — 24 fila(s) en el origen
-- Trae los *_template_sid de la cuenta Twilio PROPIA de Sushi Fun. Ver el aviso 🔴 del runbook.
-- ─────────────────────────────────────────────────────────────
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM admin_settings WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 0 THEN
    RAISE EXCEPTION 'admin_settings: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;
  END IF;
END $guard$;

INSERT INTO admin_settings (
  key, value, updated_at, tenant_id
) VALUES
  ('avg_ticket', '65000', '2026-06-02T17:27:00.453+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('birthday_template_sid', 'HXe23b0314b39c3ff18c7bd14db93f5fb4', '2026-06-25T04:18:14.645+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('checkin_first_visit_free', 'true', '2026-06-12T05:01:33.543+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('checkin_mode', 'staff_verified', '2026-06-12T05:01:32.897+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('event_bonus_points', '25', '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('event_template_image_sid', '', '2026-06-25T04:18:21.728+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('event_template_video_sid', '', '2026-06-25T04:18:22.343+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('golden_box_result_template_sid', 'HX4eaa55af53a6c31d57a232924bc0faf6', '2026-06-25T04:18:18.574+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('golden_bullet_enabled', 'false', '2026-08-21T12:04:48.582995+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('mystery_box_result_template_sid', 'HX3eca0e1c93e98a4f448adb3ee1c88f12', '2026-06-25T04:18:17.729+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('pity_timer_threshold', '2', '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('points_earned_far_template_sid', 'HX8d6cc05bab60ed0978ae58a2279cfaa7', '2026-06-25T04:18:19.567+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('points_earned_near_template_sid', 'HXd73b41a70580a0fa2774797a0942b7f0', '2026-06-25T04:18:20.338+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('points_per_visit_max', '90', '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('points_per_visit_min', '60', '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('points_system_enabled', 'true', '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('reactivation_aggressive_template_sid', '', '2026-06-25T04:18:20.944+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('reactivation_no_reward_template_sid', 'HXd243ed52d9efd228f26fd22bd4c0b72f', '2026-06-25T04:18:15.26+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('reactivation_reward_id', '', '2026-06-25T04:18:16.518+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('reactivation_with_reward_template_sid', '', '2026-06-25T04:18:15.834+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('reward_safe_template_sid', 'HX2c54b47c2ae9a8401aec1385255c8835', '2026-06-25T04:18:17.109+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('twilio_cost_per_message_usd', '0.0175', '2026-08-21T12:04:48.582995+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('welcome_bonus_points', '0', '2026-05-30T17:50:15.172079+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('welcome_template_sid', 'HX9cc12612474df0990494041862c0edf7', '2026-06-25T04:18:13.782+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid);

DO $ver$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM admin_settings WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 24 THEN RAISE EXCEPTION 'admin_settings FALLO: se esperaban 24 filas y hay %.', v; END IF;
  RAISE NOTICE 'OK admin_settings: % filas de Sushi Fun.', v;
END $ver$;

-- ─────────────────────────────────────────────────────────────
-- authorized_numbers — 2 fila(s) en el origen
-- ─────────────────────────────────────────────────────────────
DO $guard$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM authorized_numbers WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 0 THEN
    RAISE EXCEPTION 'authorized_numbers: Sushi Fun ya tiene % fila(s) acá. Este archivo ya se corrió — no se reinserta.', v;
  END IF;
END $guard$;

INSERT INTO authorized_numbers (
  id, phone, name, is_active, created_at, tenant_id
) VALUES
  ('63248fb9-6f91-4fb3-aaea-a58807c11f53'::uuid, '3155578231', 'Julian', true, '2026-05-21T23:52:12.518729+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid),
  ('f55b1b0d-3dd6-4594-b0b5-1b355c2ad4da'::uuid, '3127161556', 'Sushi fun', true, '2026-06-02T17:08:30.860978+00:00'::timestamptz, 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid);

DO $ver$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM authorized_numbers WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid;
  IF v <> 2 THEN RAISE EXCEPTION 'authorized_numbers FALLO: se esperaban 2 filas y hay %.', v; END IF;
  RAISE NOTICE 'OK authorized_numbers: % filas de Sushi Fun.', v;
END $ver$;


COMMIT;
