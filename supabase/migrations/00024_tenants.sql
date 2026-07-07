-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00024: Fundación Multitenant — tabla tenants + helpers RLS
-- Fecha: 2026-07-04
-- Descripción: Cada fila de `tenants` es un negocio cliente (restaurante,
--   barbería, salón). Las funciones helper leen el tenant/rol desde el JWT
--   (app_metadata) SIN hacer query a la DB, y las usan TODAS las políticas RLS.
-- Riesgo: NULO — solo crea objetos nuevos, no toca datos ni políticas existentes.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenants (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                          text        UNIQUE NOT NULL,
  name                          text        NOT NULL,
  business_type                 text        NOT NULL DEFAULT 'restaurant'
                                CHECK (business_type IN ('restaurant', 'barbershop', 'beauty_salon')),
  config                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Twilio subaccount (se llena al provisionar). El auth_token es SENSIBLE:
  -- nunca se expone en respuestas de API públicas ni del dashboard.
  twilio_subaccount_sid         text        NULL,
  twilio_subaccount_auth_token  text        NULL,
  twilio_messaging_service_sid  text        NULL,
  twilio_whatsapp_number        text        NULL,
  is_active                     boolean     NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active) WHERE is_active = true;

-- ─── Helpers RLS (leen del JWT, sin overhead de DB) ───

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  )
$$;

-- ─── RLS de tenants: solo super_admin ve/edita. Service role bypasa. ───
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_tenants" ON tenants;
CREATE POLICY "super_admin_all_tenants" ON tenants
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00024
-- ═══════════════════════════════════════════════════════════════
