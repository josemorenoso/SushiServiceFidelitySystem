-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00061 — Secretos de integración por marca (API de Conversiones de Meta)
-- ═══════════════════════════════════════════════════════════════
-- Pedido del dueño (2026-09-11): «Envía los celulares con la identificación …
-- no tiene sentido estar cargando csv si tenemos nuestra api de conversión
-- aquí activa».
--
-- El píxel del 2026-09-10 corre en el NAVEGADOR del cliente, y ahí un
-- bloqueador de anuncios o el iOS de turno se lo comen: ese check-in no se
-- mide. La API de Conversiones manda el mismo evento desde NUESTRO servidor,
-- y para eso Meta necesita dos cosas: un identificador del cliente (el celular,
-- hasheado con SHA-256) y un TOKEN de acceso de la cuenta publicitaria dueña
-- del píxel.
--
-- ───────────────────────────────────────────────────────────────
-- POR QUÉ UNA TABLA Y NO `tenants.config`
-- ───────────────────────────────────────────────────────────────
-- `tenants.config` es PÚBLICO por construcción: `resolveBranding()` es su
-- proyección y viaja al navegador en cada página. El id del píxel vive ahí
-- (`config.integrations.meta_pixel_id`) porque es un número público que se
-- lee en el HTML. El token NO: con él, cualquiera manda eventos falsos a la
-- cuenta publicitaria del restaurante. Es la regla 1 del espacio `integrations`
-- (`src/types/tenant.types.ts`): «acá NUNCA va un token. Las credenciales van
-- en su propia tabla, con RLS, fuera de `config`». Esta es esa tabla.
--
-- Es genérica a propósito (`provider`): el día que Google necesite su token,
-- entra como una fila más y no como una tabla más. Hoy el CHECK admite un solo
-- proveedor; ampliarlo es una migración de una línea.
--
-- ───────────────────────────────────────────────────────────────
-- QUIÉN LA LEE
-- ───────────────────────────────────────────────────────────────
-- SOLO el service role, desde `src/lib/meta-conversions-server.ts` (para
-- mandar) y `src/app/api/dashboard/meta-conversions/route.ts` (para guardar y
-- para decir «hay token» sin devolverlo nunca). RLS encendido y SIN políticas:
-- para `anon` y `authenticated` la tabla no existe. Es el mismo criterio que
-- `tenants.twilio_subaccount_auth_token`, solo que ese vive en una columna y
-- el tipo `TenantPublic` lo tiene que recortar a mano; acá no hay nada que
-- recortar porque nada de esta tabla llega a un tipo público.
--
-- ⚠️ ORDEN DE DESPLIEGUE: el código que la usa FALLA CERRADO si la tabla no
-- existe (la marca queda sin token → solo se manda al píxel de la plataforma,
-- si lo hay), así que desplegar antes de aplicarla no rompe un check-in.
-- Lo que sí pasa: el panel no puede guardar el token hasta que corra.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_integration_secrets (
    -- SIN DEFAULT, a propósito (mismo criterio que la 00053): un INSERT que
    -- olvide la marca FALLA en vez de guardarle el token a Sushi Service.
    tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider   text NOT NULL CHECK (provider IN ('meta_conversions')),
    secret     text NOT NULL CHECK (length(secret) BETWEEN 1 AND 1024),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Quién lo cargó (auth.users.id del panel). Solo para el rastro; puede ser
    -- NULL cuando lo escribe un script.
    updated_by uuid,
    PRIMARY KEY (tenant_id, provider)
);

COMMENT ON TABLE tenant_integration_secrets IS
  'Credenciales de terceros por marca (hoy: token de la API de Conversiones de Meta). Solo service role. NUNCA en tenants.config. → docs/features/meta-pixel.md';
COMMENT ON COLUMN tenant_integration_secrets.secret IS
  'El token tal cual lo da Meta. No se devuelve por ningún endpoint: el panel solo sabe si existe.';

ALTER TABLE tenant_integration_secrets ENABLE ROW LEVEL SECURITY;

-- Sin políticas: RLS encendido y ninguna fila visible para nadie que no sea el
-- service role. El REVOKE es el cinturón además de los tirantes — si alguien
-- crea una política permisiva por error, `anon` y `authenticated` siguen sin
-- privilegio de tabla.
REVOKE ALL ON tenant_integration_secrets FROM PUBLIC, anon, authenticated;

-- `updated_at` se mantiene solo. Mismo patrón que el resto del esquema.
CREATE OR REPLACE FUNCTION tenant_integration_secrets_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenant_integration_secrets_touch ON tenant_integration_secrets;
CREATE TRIGGER trg_tenant_integration_secrets_touch
  BEFORE UPDATE ON tenant_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION tenant_integration_secrets_touch();
