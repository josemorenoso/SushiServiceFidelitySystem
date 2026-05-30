-- ═══════════════════════════════════════════════════════════════
-- Migration 00015: Staff QR Scan System
-- Fecha: 2026-05-30
-- Descripción: Tablas staff_users, staff_devices, FK en visits,
--              settings para checkin_mode y checkin_first_visit_free
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. staff_users ───
CREATE TABLE IF NOT EXISTS staff_users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    phone           text NOT NULL UNIQUE,
    pin             text,                    -- bcrypt hashed (null = device trust only)
    role            text NOT NULL DEFAULT 'waiter',
    is_active       boolean NOT NULL DEFAULT true,
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_users_phone ON staff_users(phone);
CREATE INDEX IF NOT EXISTS idx_staff_users_active ON staff_users(is_active);

COMMENT ON TABLE staff_users IS 'Meseros con login opcional (PIN) para app de escaneo QR';
COMMENT ON COLUMN staff_users.pin IS 'PIN hasheado con bcrypt; NULL = no puede hacer login individual (solo device trust)';
COMMENT ON COLUMN staff_users.role IS 'waiter | supervisor | admin';

-- ─── 2. staff_devices ───
CREATE TABLE IF NOT EXISTS staff_devices (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_user_id       uuid REFERENCES staff_users(id) ON DELETE CASCADE,
    device_fingerprint  text NOT NULL,
    device_name         text,
    is_trusted          boolean NOT NULL DEFAULT true,
    trusted_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz,
    last_used_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_devices_fingerprint ON staff_devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_staff_devices_staff ON staff_devices(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_devices_trusted ON staff_devices(is_trusted, expires_at);

COMMENT ON TABLE staff_devices IS 'Dispositivos de confianza del restaurante (celular/tablet de caja)';

-- ─── 3. FK en visits ───
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'visits' AND column_name = 'registered_by_staff_id'
    ) THEN
        ALTER TABLE visits ADD COLUMN registered_by_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL;
        CREATE INDEX idx_visits_registered_by ON visits(registered_by_staff_id);
    END IF;
END
$$;

-- Ampliar source enum implícito: ya es text, solo documentamos
COMMENT ON COLUMN visits.source IS 'qr | delivery | staff_scan';

-- ─── 4. Settings seeds ───
INSERT INTO admin_settings (key, value, updated_at) VALUES
    ('checkin_mode', 'auto', now()),
    ('checkin_first_visit_free', 'true', now())
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN admin_settings.value IS 'checkin_mode: auto | staff_verified; checkin_first_visit_free: true | false';

-- ─── 5. RLS staff_users ───
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_staff_users" ON staff_users
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "service_select_staff_users" ON staff_users
    FOR SELECT USING (true);

-- ─── 6. RLS staff_devices ───
ALTER TABLE staff_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_staff_devices" ON staff_devices
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "service_select_staff_devices" ON staff_devices
    FOR SELECT USING (true);

-- ─── 7. Trigger updated_at staff_users ───
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_staff_users_updated ON staff_users;
CREATE TRIGGER on_staff_users_updated
    BEFORE UPDATE ON staff_users
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();
