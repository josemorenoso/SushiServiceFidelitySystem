-- ═══════════════════════════════════════════════════════════════
-- 10 · CRÉDITO DE ABSORCIÓN — la billetera de Sushi Fun
-- Absorción de Sushi Fun al despliegue principal — 2026-09-06
--
-- Se pega en el SQL Editor del Supabase PRINCIPAL, DESPUÉS del 08.
-- Va después a propósito: el 08 exige que la billetera esté en CERO
-- movimientos, que es como se comprueba que el 07 no le cobró los 92
-- mensajes que Sushi Fun ya había pagado en su propia cuenta de Twilio.
--
-- POR QUÉ EXISTE ESTE ARCHIVO
-- ───────────────────────────
-- Sushi Fun paga su propio Twilio. Cobrarle además por la billetera del
-- producto sería cobrarle dos veces, así que su saldo debería quedarse en 0.
--
-- Pero un saldo en 0 no es neutro: `canSendBulk()` (src/services/wallet.service.ts)
-- calcula `mensajes disponibles = saldo / tarifa` y RECHAZA con 409 toda campaña
-- masiva cuando no alcanza. Con saldo 0 y tarifa 100, son 0 mensajes disponibles:
-- el dueño de Sushi Fun apretaría "Enviar campaña" y le saldría «Saldo
-- insuficiente» sin que nadie entienda por qué.
--
-- Lo transaccional (bienvenida, check-in, premio) NO pasa por ahí y sale igual.
-- Los crons diarios tampoco. Lo único que se traba es el envío masivo manual.
--
-- La salida limpia es un CRÉDITO: plata que no se le cobró y no se le va a
-- cobrar, registrada como lo que es. El trigger de débito irá descontando de
-- este saldo a medida que envíe, así que el número del panel refleja su consumo
-- real aunque nadie le pase una factura.
--
-- REVERSIBLE: sí — al final está el DELETE.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DO $credito$
DECLARE
  -- ═════════════ PARÁMETRO — EDITAR SOLO ESTA LÍNEA ═════════════
  -- 5.000.000 COP ÷ 100 COP/mensaje = 50.000 mensajes.
  -- Sushi Fun mandó 194 mensajes en toda su historia, así que esto le alcanza
  -- de sobra. Ponelo en otro número si querés otra cosa.
  p_monto_cop numeric := 5000000;
  -- ══════════════════════════════════════════════════════════════

  v_sf     uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  v_n      int;
  v_saldo  numeric;
  v_tarifa numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_sf) THEN
    RAISE EXCEPTION 'ABORTA: Sushi Fun no existe todavía. Corré el 01 primero.';
  END IF;

  SELECT count(*) INTO v_n FROM tenant_wallet_transactions WHERE tenant_id = v_sf;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORTA: Sushi Fun ya tiene % movimiento(s) de billetera. Este archivo ya se corrió.', v_n;
  END IF;

  INSERT INTO tenant_wallet_transactions (tenant_id, type, amount_cop, notes, created_by)
  VALUES (
    v_sf,
    'adjustment',
    p_monto_cop,
    'Crédito de absorción 2026-09-06. Sushi Fun paga su propia cuenta de Twilio: '
    || 'este saldo NO se le cobró ni se le va a cobrar. Existe solo para que '
    || 'canSendBulk() no le rechace las campañas masivas con 409.',
    'absorcion-sushi-fun-2026-09-06'
  );

  SELECT tenant_wallet_balance_cop(v_sf) INTO v_saldo;
  SELECT price_per_message_cop INTO v_tarifa FROM tenants WHERE id = v_sf;

  IF v_saldo <> p_monto_cop THEN
    RAISE EXCEPTION '10 FALLO: el saldo quedó en % y se esperaba %.', v_saldo, p_monto_cop;
  END IF;

  RAISE NOTICE 'OK 10: saldo % COP a tarifa % COP/mensaje = % mensajes disponibles.',
    v_saldo, v_tarifa, floor(v_saldo / nullif(v_tarifa, 0));
END $credito$;

COMMIT;

-- Para verlo:
--   SELECT tenant_wallet_balance_cop('b2c3d4e5-f6a7-8901-bcde-f23456789012');
--
-- Para deshacerlo:
--   DELETE FROM tenant_wallet_transactions
--    WHERE tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'
--      AND created_by = 'absorcion-sushi-fun-2026-09-06';
