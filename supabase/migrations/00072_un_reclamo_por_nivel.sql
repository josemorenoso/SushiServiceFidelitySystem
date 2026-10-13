-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 00072: la base rechaza el segundo reclamo del mismo nivel (SEG-2)
-- Fecha: 2026-10-13
-- Feature: docs/features/points-mystery-box.md §7.4.ter
-- Antecedente directo: 00059 (las dos claves del «ya reclamé») y la ola 0
--   (AISLA-1: `resolve` solo otorga lo que `check-in/status` ofrece).
--
-- DE DÓNDE SALE
-- ─────────────
-- `POST /api/mystery-box/resolve` lee la oferta (`getNivelOfrecido()`), escribe el
-- reclamo en `mystery_box_results`, otorga (`reward_grants`) y manda el WhatsApp.
-- Nada de eso es atómico y esta tabla no tenía ningún UNIQUE: dos llamadas del
-- mismo cliente leían la oferta ANTES de que la primera escribiera, y las dos
-- otorgaban — dos premios que el mesero entrega y dos WhatsApp que paga la marca.
-- El límite de tasa (en memoria de cada instancia) acotaba cuántas entraban, no
-- las volvía imposibles. Un cliente con un script lo explotaba. Quedó anotado en
-- la ola 0 como «lo que esto NO tapa» (§7.4.ter) y en la auditoría como SEG-2.
--
-- LA REGLA, EN LA BASE
-- ────────────────────
-- Un INSERT en `mystery_box_results` se RECHAZA (23505) si el mismo cliente ya
-- tiene un reclamo con la misma `claimed_tier_key` O con el mismo
-- `claimed_threshold`. Es la regla de `elegirNivelSinReclamar()`
-- (`src/services/reward-tiers.service.ts`), la única definición de «ya reclamado»,
-- con sus mismas tres decisiones:
--   · en OR, no en AND (§7.4.bis: más conservador que cualquiera de las dos sola);
--   · por CLIENTE y sin mirar `tenant_id` (`getNivelOfrecido()` lee así: un
--     reclamo con la marca mal grabada por el DEFAULT puente sigue contando);
--   · una clave en NULL no coincide con nada (en TS no entra a ningún conjunto).
-- La base NO decide qué nivel se ofrece (eso sigue siendo TypeScript); solo
-- impide que un nivel ya reclamado se reclame otra vez, que es lo único que la
-- carrera puede romper. `tests/db/mystery-box-carrera.test.ts` prueba el espejo
-- caso por caso contra la función de TS, igual que `can_see_location()`.
--
-- POR QUÉ UN TRIGGER Y NO DOS UNIQUE PARCIALES
-- ────────────────────────────────────────────
-- `UNIQUE (customer_id, claimed_tier_key)` + `UNIQUE (customer_id,
-- claimed_threshold)` dirían lo mismo, y son lo primero que se piensa. No se
-- pueden crear si la historia ya tiene duplicados, y la historia casi seguro los
-- tiene: hasta la ola 0 `resolve` no miraba la oferta (AISLA-1: premios sin
-- límite), y antes de la 00059 desactivar «Bronce 150» y crear otro 150 volvía a
-- ofrecer el premio. Para crearlos habría que borrar o marcar reclamos viejos, y
-- cada uno es un premio que ya se entregó o que el mesero tiene pendiente: eso es
-- una decisión del dueño, no de una migración. El trigger compara cada reclamo
-- NUEVO contra la historia tal como esté y no toca una sola fila vieja. La
-- consulta de duplicados (solo lectura) queda en
-- `SQL-PARA-CORRER/seg-2-carrera-resolve/`: informa, no bloquea esta migración.
--
-- POR QUÉ AFTER Y NO BEFORE
-- ─────────────────────────
-- Las claves las sella `trg_mystery_box_results_sella_nivel` (00059), que es
-- BEFORE. Los BEFORE corren en orden alfabético de nombre, así que un BEFORE nuevo
-- dependería de llamarse «después» que aquel; un AFTER ve SIEMPRE la fila ya
-- sellada. Rechazar en un AFTER deshace el INSERT entero, igual que en un BEFORE.
--
-- EL CANDADO, Y POR QUÉ ALCANZA
-- ─────────────────────────────
-- `pg_advisory_xact_lock` por cliente (forma de dos claves: no comparte espacio
-- con el `hashtext(tenant)` de `reserve_send_slot()`, 00037). Se suelta solo al
-- terminar la transacción. Dos reclamos simultáneos del mismo cliente se ponen en
-- fila: el segundo espera a que el primero CONFIRME, y su consulta —con foto nueva,
-- porque en READ COMMITTED cada sentencia toma la suya— ya ve la fila del primero
-- y lo rechaza. Si el primero se deshace, el segundo entra. Depende de READ
-- COMMITTED, que es el nivel de PostgREST y de Supabase; en REPEATABLE READ el
-- segundo no vería al primero. Ningún escritor de esta tabla usa otro.
--
-- QUIÉN ESCRIBE ACÁ: solo `resolveMysteryBox()` (service role) y, a mano, el SQL
-- Editor. Las políticas (00013) le dan a `authenticated` solo SELECT. Por eso la
-- función es SECURITY INVOKER, como `sellar_nivel_reclamado()`: no necesita ver
-- nada que quien inserta no vea, y no suma una SECURITY DEFINER a la lista que
-- vigila `tests/db/ola0-seguridad.test.ts`.
--
-- LO QUE NO HACE: no cambia ninguna fila existente; no mira UPDATE (nadie
-- actualiza las claves); no toca `mystery_box_global_caps` (decisión abierta,
-- §7.1.bis); no decide la oferta.
--
-- RIESGO: BAJO. Una función y un trigger AFTER INSERT. No agrega columnas, no
--   borra nada, no toca RLS ni FK. El costo por reclamo es una consulta por el
--   índice `idx_mystery_box_results_claims` (00059), que ya trae las dos claves.
-- REVERSIBLE: sí, sin pérdida — `DROP TRIGGER trg_mystery_box_results_un_reclamo_por_nivel
--   ON mystery_box_results; DROP FUNCTION rechazar_nivel_ya_reclamado();`
-- ORDEN: después de la 00059 (el bloque 0 lo comprueba). Conviene aplicarla ANTES
--   del push que la acompaña, porque cierra un agujero vivo; ningún orden rompe
--   nada: sin la migración el código nuevo nunca ve el 23505, y sin el código
--   nuevo el reclamo repetido sale como 500 —sin premio ni WhatsApp— en vez de 409.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 0. Guardas de dependencia
-- ─────────────────────────────────────────────────────────────
DO $guardas$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'mystery_box_results'
         AND column_name IN ('claimed_tier_key', 'claimed_threshold')) <> 2
  THEN
    RAISE EXCEPTION '00072 requiere la 00059: faltan las columnas claimed_* de mystery_box_results.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_mystery_box_results_sella_nivel'
       AND tgrelid = 'public.mystery_box_results'::regclass
  ) THEN
    RAISE EXCEPTION '00072 requiere la 00059: falta trg_mystery_box_results_sella_nivel, que sella las claves que este trigger compara.';
  END IF;
END
$guardas$;


-- ─────────────────────────────────────────────────────────────
-- 1. La función: el espejo de elegirNivelSinReclamar()
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rechazar_nivel_ya_reclamado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $rechazar$
BEGIN
  -- Sin ninguna de las dos claves no hay con qué comparar (en TS no entra a ningún
  -- conjunto). Hoy no pasa: el trigger de la 00059 sella las dos desde el nivel.
  IF NEW.claimed_tier_key IS NULL AND NEW.claimed_threshold IS NULL THEN
    RETURN NULL;
  END IF;

  -- En fila, por cliente, hasta el final de la transacción.
  PERFORM pg_advisory_xact_lock(
    hashtext('mystery_box_results.reclamo'),
    hashtext(NEW.customer_id::text)
  );

  -- `=` con un NULL no es verdadero: una clave en NULL no coincide, como en TS.
  IF EXISTS (
    SELECT 1
      FROM mystery_box_results m
     WHERE m.customer_id = NEW.customer_id
       AND m.id <> NEW.id
       AND (m.claimed_tier_key = NEW.claimed_tier_key
            OR m.claimed_threshold = NEW.claimed_threshold)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'unique_violation',
      MESSAGE = 'nivel_ya_reclamado: el cliente ya reclamo este nivel',
      DETAIL  = format('customer_id=%s claimed_tier_key=%s claimed_threshold=%s',
                       NEW.customer_id, NEW.claimed_tier_key, NEW.claimed_threshold),
      HINT    = 'Misma regla que elegirNivelSinReclamar(): misma clave O mismo umbral. 00072.';
  END IF;

  RETURN NULL; -- AFTER: el valor de retorno no se usa
END;
$rechazar$;

COMMENT ON FUNCTION rechazar_nivel_ya_reclamado() IS
  'Rechaza (23505) el reclamo de un nivel que el cliente ya reclamo: misma claimed_tier_key O mismo claimed_threshold, por cliente, sin mirar tenant. Espejo de elegirNivelSinReclamar() (reward-tiers.service.ts); advisory lock por cliente contra la carrera de dos resolve. 00072.';

DROP TRIGGER IF EXISTS trg_mystery_box_results_un_reclamo_por_nivel ON mystery_box_results;
CREATE TRIGGER trg_mystery_box_results_un_reclamo_por_nivel
  AFTER INSERT ON mystery_box_results
  FOR EACH ROW EXECUTE FUNCTION rechazar_nivel_ya_reclamado();


-- ─────────────────────────────────────────────────────────────
-- 2. Verificación — que no haya quedado a medias
-- ─────────────────────────────────────────────────────────────
DO $verif$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_mystery_box_results_un_reclamo_por_nivel'
       AND tgrelid = 'public.mystery_box_results'::regclass
       AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION '00072 quedo a medias: falta (o esta deshabilitado) trg_mystery_box_results_un_reclamo_por_nivel.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_mystery_box_results_claims') THEN
    RAISE EXCEPTION '00072: falta idx_mystery_box_results_claims (00059); sin el, cada reclamo recorre la tabla.';
  END IF;

  RAISE NOTICE 'OK 00072';
END
$verif$;
