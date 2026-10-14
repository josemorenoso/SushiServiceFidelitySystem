-- ═══════════════════════════════════════════════════════════════════════════
-- 00073 — Ciclo de recuperación, fase 2 parte C: «incluir dormidos» en un evento
-- 2026-10-14
--
-- Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §3.1, §3.5, §6.5
--      docs/prompts/2026-10-14-ciclo-fase-2-pantalla.md §5 (punto 3)
--      docs/features/calendar.md § «Incluir dormidos»
--
-- QUÉ HACE
--   `restaurant_events.include_dormant`: la casilla «Incluir a los dormidos» del creador de
--   eventos. Con el ciclo ENCENDIDO en la marca, la invitación de un evento NO les llega a los
--   dormidos (ni a los que ya no reciben nada automático) salvo que el dueño marque la casilla
--   (spec §3.1: «eventos del calendario solo si el dueño marcó incluir dormidos»). Con el ciclo
--   apagado nada cambia: el evento le llega a todos los que aceptan mensajes, como siempre.
--
-- QUIÉN LA LEE
--   `audienciaDelEvento()` (`src/services/calendar.service.ts`): la MISMA audiencia para la
--   invitación (`executeAutoEvent()`), para el blackout que pospone el toque del ciclo
--   (`cycle.service.ts`) y para el número de invitados de la pantalla (`cycle-overview.service.ts`).
--
-- LO QUE NO CAMBIA (y por qué aplicarla no cambia ningún envío)
--   Nace en `false` en todos los eventos: con el ciclo apagado en casi todas las marcas, la
--   audiencia es la de siempre. En una marca ENCENDIDA (Don Alirio y Sushi Fun, cuando el dueño
--   las encienda) un evento ya creado deja de llegarle a sus dormidos: es lo que el spec pide
--   (decisión 8, «¿Los eventos van a dormidos? No, salvo casilla en el evento»).
--
-- ⚠️ ORDEN DE DESPLIEGUE: esta migración se aplica en Supabase ANTES del push. Al revés,
--   `createEvent()` inserta una columna que no existe → PostgREST 42703 → crear un evento falla
--   entero, y la lectura de la audiencia del evento falla igual (la trampa de la 00044/00050).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS.
-- RIESGO: BAJO. `ADD COLUMN … NOT NULL DEFAULT <constante>` no reescribe la tabla (PG ≥ 11).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE restaurant_events
  ADD COLUMN IF NOT EXISTS include_dormant boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurant_events.include_dormant IS
  'Casilla «Incluir a los dormidos» del creador de eventos (00073). Con el ciclo de recuperación encendido en la marca, la invitación solo les llega a los dormidos (cycle_state dormido o archivado) si es true. Con el ciclo apagado no se mira: el evento le llega a todos los que aceptan mensajes.';
