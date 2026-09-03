-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00042: "Sede principal" para los tenants que ya existen (migración de DATOS)
-- Fecha: 2026-09-03
-- Spec: docs/superpowers/specs/2026-09-02-multisede-design.md §3.2, §3.3, §4 (F1)
--
-- QUÉ HACE
-- ────────
-- Le da a CADA tenant que ya existe una sede canónica y le delega el subdominio ya
-- impreso en sus QR. Al día de hoy son 4 (Sushi Service, Don Alirio, Frangal, Demo) y
-- **3 de los 4 no tienen ninguna fila** en `restaurant_locations` — porque el AIOS solo
-- mandaba `locations[]` si venían lat Y lon (§4 del spec, arreglado en el mismo commit).
--
-- POR QUÉ HACE FALTA
-- ──────────────────
-- Con este modelo la sede es lo que carga el subdominio, la ficha de Google, los meseros
-- y toda la atribución de D12. Un tenant sin sedes es inservible. Y la "regla del dominio
-- raíz" (§3.2) le da atribución perfecta GRATIS a quien tiene exactamente UNA sede activa:
-- sin esta fila, ni siquiera esa regla puede dispararse.
--
-- QUÉ **NO** HACE
-- ───────────────
-- **NO toca una sola fila de historia.** `visits` (~1581), `point_transactions` (~991),
-- `review_events` (~685) y `customers` (~1176) se quedan como están. Cuando la 00043 (F2)
-- les agregue `location_id`, nace NULL y **se queda en NULL**: NULL significa "sede
-- desconocida" y se MUESTRA como un cubo propio llamado "Sin sede". Repartir ese histórico
-- sería adivinar, y el número adivinado terminaría en un reporte de plata (§4 y §12).
--
-- CERO IMPACTO EN LOS 4 TENANTS TWILIO
-- ────────────────────────────────────
-- Ningún código del producto lee todavía `slug`, `domain`, `is_primary` ni `config` de
-- `restaurant_locations` (eso es F3). `getTenantByDomain` sigue resolviendo por
-- `tenants.domain`, que esta migración NO toca. Después de la 00042 los 4 tenants
-- funcionan exactamente igual que antes.
--
-- IDEMPOTENTE: correrla dos veces no cambia nada — el tenant que ya tiene su sede cae en
--   la rama de UPDATE y los COALESCE dejan todo como está.
-- RIESGO: BAJO. Solo INSERT/UPDATE sobre `restaurant_locations`, tabla con ~1 fila.
-- REVERSIBLE: sí — borrar las filas creadas y volver `slug`/`domain`/`is_primary` a NULL.
-- ORDEN: después de la 00041 (necesita `slug`/`domain`/`is_primary` y lat/lon nullable).
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  t              record;
  v_count        int;
  v_creadas      int := 0;
  v_adoptadas    int := 0;
  v_ambiguos     int := 0;
BEGIN
  -- Se recorren TODOS los tenants, no una lista de slugs a mano: hoy son exactamente
  -- los 4 vivos, y una lista fija dejaría fuera a cualquiera que se hubiera dado de
  -- alta entre que se escribió esta migración y se pegó en el SQL Editor.
  FOR t IN SELECT id, slug, name, domain FROM tenants ORDER BY created_at, slug
  LOOP
    SELECT count(*) INTO v_count FROM restaurant_locations WHERE tenant_id = t.id;

    IF v_count = 0 THEN
      -- El caso de 3 de los 4: el tenant nunca tuvo sede.
      -- lat/lon quedan NULL a propósito (la 00041 lo permite): la geocerca está
      -- apagada y exigir coordenadas es justo lo que dejó a estos tenants sin sede.
      INSERT INTO restaurant_locations (
        tenant_id, name, slug, domain, is_primary, sort_order, is_active
      ) VALUES (
        t.id, 'Sede principal', 'sede-principal', t.domain, true, 0, true
      );
      v_creadas := v_creadas + 1;
      RAISE NOTICE '00042: sede creada para % (dominio: %)', t.slug, COALESCE(t.domain, '(sin dominio)');

    ELSIF v_count = 1 THEN
      -- El caso del cuarto: ya hay una fila (la semilla de la 00014, o la que creó el
      -- AIOS cuando sí venían coordenadas). Con una sola fila, ESA es la sede principal
      -- por definición. Se adopta en vez de crear una segunda.
      -- Los COALESCE hacen esto idempotente y no pisan un valor puesto a mano.
      UPDATE restaurant_locations
         SET slug       = COALESCE(slug, 'sede-principal'),
             domain     = COALESCE(domain, t.domain),
             is_primary = true
       WHERE tenant_id = t.id;
      v_adoptadas := v_adoptadas + 1;
      RAISE NOTICE '00042: sede existente adoptada para % (dominio: %)', t.slug, COALESCE(t.domain, '(sin dominio)');

    ELSE
      -- No puede pasar hoy (los 4 tenants suman ~1 fila), y si pasa NO se adivina cuál
      -- es la principal: elegir mal delegaría el subdominio impreso a la sede equivocada
      -- y toda la atribución del dominio raíz saldría al revés. Se avisa y se sigue.
      v_ambiguos := v_ambiguos + 1;
      RAISE WARNING '00042: el tenant % ya tiene % sedes — NO se toca. Marcá a mano cuál es is_primary y cuál lleva el dominio %.',
        t.slug, v_count, COALESCE(t.domain, '(sin dominio)');
    END IF;
  END LOOP;

  RAISE NOTICE '00042: % sedes creadas, % adoptadas, % tenants ambiguos (sin tocar).',
    v_creadas, v_adoptadas, v_ambiguos;
END $$;

-- ───────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_sin_sede      int;
  v_sin_principal int;
  v_dominio_malo  int;
BEGIN
  SELECT count(*) INTO v_sin_sede
    FROM tenants t
   WHERE NOT EXISTS (SELECT 1 FROM restaurant_locations l WHERE l.tenant_id = t.id);

  -- Solo se exige `is_primary` donde esta migración pudo decidirlo sin adivinar
  -- (tenants con exactamente una sede). Los ambiguos ya avisaron con WARNING arriba.
  SELECT count(*) INTO v_sin_principal
    FROM tenants t
   WHERE (SELECT count(*) FROM restaurant_locations l WHERE l.tenant_id = t.id) = 1
     AND NOT EXISTS (
       SELECT 1 FROM restaurant_locations l
        WHERE l.tenant_id = t.id AND l.is_primary
     );

  -- El subdominio impreso tiene que haber bajado a la sede: es lo que hace que
  -- `clubsushiservice.constelarys.com` resuelva mañana a marca + sede sin reimprimir.
  SELECT count(*) INTO v_dominio_malo
    FROM tenants t
   WHERE t.domain IS NOT NULL
     AND (SELECT count(*) FROM restaurant_locations l WHERE l.tenant_id = t.id) = 1
     AND NOT EXISTS (
       SELECT 1 FROM restaurant_locations l
        WHERE l.tenant_id = t.id AND l.domain = t.domain
     );

  IF v_sin_sede > 0 THEN
    RAISE EXCEPTION '00042 FALLÓ: % tenants siguen sin ninguna sede.', v_sin_sede;
  END IF;
  IF v_sin_principal > 0 THEN
    RAISE EXCEPTION '00042 FALLÓ: % tenants de una sola sede quedaron sin is_primary.', v_sin_principal;
  END IF;
  IF v_dominio_malo > 0 THEN
    RAISE EXCEPTION '00042 FALLÓ: % tenants con dominio no se lo delegaron a su sede.', v_dominio_malo;
  END IF;

  RAISE NOTICE 'OK 00042: todos los tenants tienen sede, con is_primary y con el subdominio ya impreso delegado. Cero filas de historia tocadas.';
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00042 — cierra la Fase 1 del spec de multi-sede.
-- Siguiente: 00043 (F2) agrega `location_id` a las tablas de eventos, todas NULL.
-- ═══════════════════════════════════════════════════════════════
