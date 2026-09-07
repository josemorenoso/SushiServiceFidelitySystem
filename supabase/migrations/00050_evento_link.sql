-- Migration: 00050_evento_link
-- Fecha: 2026-09-06
-- ═══════════════════════════════════════════════════════════
-- Agrega `restaurant_events.link_url`: un enlace opcional (carta, reserva,
-- boletería, el post de Instagram) que viaja DENTRO de la invitación de WhatsApp.
--
-- POR QUÉ UNA COLUMNA Y NO UNA VARIABLE NUEVA DE LA PLANTILLA
-- ──────────────────────────────────────────────────────────
-- La plantilla `twilio/media` del calendario está APROBADA por Meta con un
-- contrato fijo de 6 variables ({{1}}..{{6}}, ver docs/features/calendar.md).
-- Agregar un {{7}} obliga a crear una plantilla nueva y esperar 24-72h de
-- aprobación **por cada una de las 25 marcas**. En vez de eso el link se compone
-- dentro de {{5}} (el CTA) al enviar: cero plantillas nuevas, cero re-aprobación,
-- y WhatsApp lo vuelve clicleable igual porque es texto del cuerpo.
--
-- El CHECK es la última línea de defensa, no la primera: la ruta y el servicio
-- ya validan. Está acá porque {{5}} viaja como variable de plantilla y Twilio
-- (21656) rechaza el envío entero si trae saltos de línea — un link con espacios
-- o saltos rompería la invitación de TODA la audiencia, no la de un cliente.
--
-- IMPACTO OPERATIVO: cero. Columna nueva NULLABLE, sin default. Los eventos
-- existentes quedan con NULL = "sin link", que es exactamente su comportamiento
-- de hoy.
--
-- ⚠️ ORDEN DE DESPLIEGUE: esta migración se aplica en Supabase **ANTES** de
-- desplegar el código que la usa. Al revés, `createEvent()` inserta una columna
-- que no existe, PostgREST devuelve 42703 y **crear un evento falla entero**
-- (la trampa documentada en CLAUDE.md para la 00044/00045).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE restaurant_events
  ADD COLUMN IF NOT EXISTS link_url text;

-- Idempotente: si la migración se corre dos veces, el CHECK ya existe.
ALTER TABLE restaurant_events
  DROP CONSTRAINT IF EXISTS restaurant_events_link_url_check;

ALTER TABLE restaurant_events
  ADD CONSTRAINT restaurant_events_link_url_check
  CHECK (
    link_url IS NULL
    OR (
      link_url ~ '^https?://[^\s]+$'
      AND length(link_url) <= 500
    )
  );

COMMENT ON COLUMN restaurant_events.link_url IS
  'Enlace opcional (carta, reserva, boletería, post) que se agrega al final del CTA {{5}} de la plantilla al enviar la invitación. NULL = sin link. Debe ser http(s) y sin espacios: {{5}} es una variable de plantilla y Twilio rechaza (21656) los saltos de línea, lo que tumbaría el envío de toda la audiencia.';
