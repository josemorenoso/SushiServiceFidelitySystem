-- Migration: 00012_calendar_events_and_media
-- Fecha: 2026-05-23
-- ═══════════════════════════════════════════════════════════
-- Agrega:
--   1. Tabla restaurant_events: calendario operativo de eventos/promos/festivales
--      con soporte de media (imagen/video) y modo de envío híbrido (auto vs recordatorio).
--   2. Columnas source/media_url/media_type en campaigns para:
--      - Distinguir origen (manual/calendar/reactivation/birthday) y aplicar cap mensual selectivo.
--      - Persistir el media usado en cada campaña.
--   3. Bucket de Supabase Storage 'event-media' (público) para alojar imágenes y videos.
--
-- IMPACTO OPERATIVO: Cero. Tablas/columnas nuevas con defaults seguros, sin tocar lógica existente.
--   - `source` default 'manual' preserva el comportamiento actual de toda la lógica de campañas.
--   - Sin RLS nueva que pueda romper queries existentes.
-- ═══════════════════════════════════════════════════════════

-- ─── TABLA: restaurant_events ───
CREATE TABLE IF NOT EXISTS restaurant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_time time,
  event_type text NOT NULL CHECK (event_type IN ('promo', 'festival', 'activacion', 'aniversario', 'otro')),
  send_mode text NOT NULL DEFAULT 'remind' CHECK (send_mode IN ('auto', 'remind')),
  scheduled_send_at timestamptz,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_url text,
  media_type text CHECK (media_type IN ('image', 'video') OR media_type IS NULL),
  content_sid text,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'scheduled', 'sent', 'cancelled', 'failed')),
  blackout_days integer NOT NULL DEFAULT 5 CHECK (blackout_days >= 0 AND blackout_days <= 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE restaurant_events IS
  'Calendario operativo de eventos/promos del restaurante. Cada evento puede dispararse automáticamente (send_mode=auto + scheduled_send_at) o quedar como recordatorio para el admin (send_mode=remind).';

COMMENT ON COLUMN restaurant_events.send_mode IS
  '"auto" = el cron calendar-dispatch envía la invitación en scheduled_send_at. "remind" = solo recordatorio visual al admin en el dashboard.';

COMMENT ON COLUMN restaurant_events.scheduled_send_at IS
  'Cuándo se envía el WhatsApp (solo si send_mode=auto). Debe ser <= event_date.';

COMMENT ON COLUMN restaurant_events.filters IS
  'Filtros de audiencia (jsonb). Mismo shape que campaigns.filters: city, minVisits, maxVisits, minAge, maxAge, source.';

COMMENT ON COLUMN restaurant_events.media_url IS
  'URL pública del bucket event-media (Supabase Storage). NULL si el evento no lleva media.';

COMMENT ON COLUMN restaurant_events.media_type IS
  '"image" (JPG/PNG, máx 5MB) o "video" (MP4, máx 16MB). Determina qué content_sid usar al enviar.';

COMMENT ON COLUMN restaurant_events.content_sid IS
  'Twilio Content SID a usar. Se resuelve desde admin_settings.event_template_image_sid o event_template_video_sid según media_type.';

COMMENT ON COLUMN restaurant_events.campaign_id IS
  'Se llena cuando el evento se ejecuta (envío real). Permite trazabilidad desde el evento hacia la campaña + campaign_messages generadas.';

COMMENT ON COLUMN restaurant_events.blackout_days IS
  'Días antes del evento durante los cuales las campañas manuales se bloquean para no quemar cupo del cap mensual antes del evento real. Default 5.';

-- ─── ÍNDICES ───
CREATE INDEX IF NOT EXISTS idx_restaurant_events_date ON restaurant_events(event_date);
CREATE INDEX IF NOT EXISTS idx_restaurant_events_status ON restaurant_events(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_events_scheduled
  ON restaurant_events(scheduled_send_at)
  WHERE scheduled_send_at IS NOT NULL AND status = 'scheduled';

-- ─── TRIGGER: updated_at ───
CREATE OR REPLACE FUNCTION update_restaurant_events_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restaurant_events_updated_at ON restaurant_events;
CREATE TRIGGER trg_restaurant_events_updated_at
  BEFORE UPDATE ON restaurant_events
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurant_events_updated_at();

-- ─── RLS ───
ALTER TABLE restaurant_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_restaurant_events" ON restaurant_events
  FOR ALL USING (auth.role() = 'authenticated');

-- Service role (crons + endpoints internos) — mismo patrón que campaigns
CREATE POLICY "service_select_restaurant_events" ON restaurant_events
  FOR SELECT USING (true);

CREATE POLICY "service_insert_restaurant_events" ON restaurant_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_restaurant_events" ON restaurant_events
  FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════
-- Extensión de campaigns para soportar origen y media
-- ═══════════════════════════════════════════════════════════

-- ─── Columnas nuevas en campaigns ───
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'calendar', 'reactivation', 'birthday'));

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS media_url text;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS media_type text
    CHECK (media_type IN ('image', 'video') OR media_type IS NULL);

COMMENT ON COLUMN campaigns.source IS
  'Origen real de la campaña. Usado por filterByMonthlyCap (cuenta solo manual+calendar+reactivation, NO birthday). Default "manual" preserva backward-compat con campañas existentes.';

COMMENT ON COLUMN campaigns.media_url IS
  'URL del media adjunto al envío (solo si la campaña usó plantilla twilio/media). Se hereda de restaurant_events.media_url para campañas tipo calendar.';

COMMENT ON COLUMN campaigns.media_type IS
  'Tipo de media adjunto: "image" o "video". NULL para campañas de solo texto.';

-- ─── Backfill explícito de source para campañas existentes ───
-- Las campañas creadas antes de esta migración deben heredar el source basado en su type.
UPDATE campaigns
  SET source = type
  WHERE source = 'manual'
    AND type IN ('birthday', 'reactivation')
    AND created_at < now();

-- ─── Índice para el conteo del cap mensual ───
-- filterByMonthlyCap recorre campaign_messages JOIN campaigns por customer_id + mes + source.
CREATE INDEX IF NOT EXISTS idx_campaigns_source_created
  ON campaigns(source, created_at);

-- ═══════════════════════════════════════════════════════════
-- Bucket Supabase Storage para media de eventos
-- ═══════════════════════════════════════════════════════════
-- IMPORTANTE: Twilio Content API tipo twilio/media requiere URL pública accesible para que Meta
-- pueda descargar el asset al momento del envío. Por eso el bucket es público (lectura anónima).
-- La escritura sigue protegida por RLS de storage.objects (solo authenticated).

INSERT INTO storage.buckets (id, name, public)
  VALUES ('event-media', 'event-media', true)
  ON CONFLICT (id) DO NOTHING;

-- Política de lectura pública (cualquiera puede leer — necesario para Twilio/Meta)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'event_media_public_read'
  ) THEN
    CREATE POLICY "event_media_public_read" ON storage.objects
      FOR SELECT
      USING (bucket_id = 'event-media');
  END IF;
END
$$;

-- Política de escritura solo para admins autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'event_media_admin_write'
  ) THEN
    CREATE POLICY "event_media_admin_write" ON storage.objects
      FOR INSERT
      WITH CHECK (bucket_id = 'event-media' AND auth.role() = 'authenticated');
  END IF;
END
$$;

-- Política de update/delete solo para admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'event_media_admin_update'
  ) THEN
    CREATE POLICY "event_media_admin_update" ON storage.objects
      FOR UPDATE
      USING (bucket_id = 'event-media' AND auth.role() = 'authenticated');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'event_media_admin_delete'
  ) THEN
    CREATE POLICY "event_media_admin_delete" ON storage.objects
      FOR DELETE
      USING (bucket_id = 'event-media' AND auth.role() = 'authenticated');
  END IF;
END
$$;
