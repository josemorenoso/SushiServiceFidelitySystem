-- ═══════════════════════════════════════════════════════════════
-- 00054 — CONEXIONES: el estado del alta de WhatsApp del CLIENTE
--
-- Spec: docs/superpowers/specs/2026-09-06-conexiones-design.md §4 y §4.0
-- Doc:  docs/features/conexiones.md
--
-- POR QUÉ EL NÚMERO ES 00054 Y NO 00052
-- ─────────────────────────────────────
-- El diseño reservó la 00052, pero `node scripts/proxima-migracion.mjs` —que mira
-- TODAS las ramas vivas, no solo `supabase/migrations/` de la tuya— manda usar la
-- 00054: la 00053 ya existe en `feat/salud-aios` y la 00052 quedó anotada como
-- reserva en los docs. Se obedece al script. Un hueco es barato; dos archivos con
-- el mismo número, no (pasó el 2026-09-06 con la 00048).
--
-- QUÉ HACE
-- ────────
--   1. `tenant_connections` — una fila por LÍNEA de la marca. Estado del ALTA,
--      no del envío.
--   2. `connection_apply_whatsapp()` — el ÚNICO cuerpo que activa Zernio.
--   3. `aios_activate_whatsapp()` pasa a ser una CÁSCARA de la anterior: mismo
--      nombre, misma firma, mismo error, mismo comportamiento para el AIOS.
--
-- LO QUE NO HACE, A PROPÓSITO
-- ───────────────────────────
--   · NO toca ninguna de las 14 columnas de mensajería de `tenants`.
--     `tenants.zernio_*` sigue siendo la proyección de la línea principal, y
--     `sendViaZernio()`, `line_budget()` y el webhook de entrada quedan byte a
--     byte iguales. Mover 14 columnas que hoy usan 5 marcas vivas, para habilitar
--     un caso que hoy no tiene ni un usuario, es pagar el riesgo antes del
--     beneficio (§4.1).
--   · NO lleva `location_id`. D6 quedó RE-CERRADA el 2026-09-07: **un número por
--     marca, compartido por todas las sedes**. Una línea no pertenece a una sede;
--     es al revés, una sede apunta a una línea — y eso, cuando llegue, vive en la
--     00048 `location_messaging`, que sigue RESERVADA y sin usar.
--   · NO enruta el envío. Con dos líneas activas sigue saliendo todo por la
--     principal. Enrutar es F9.
--
-- Riesgo: BAJO. Tabla nueva + una función nueva + el cuerpo de una función
--   existente movido sin cambiarle la firma ni el contrato. Ninguna tabla de
--   negocio se toca. El backfill solo copia lo que YA es verdad.
--
-- ⚠️ SE APLICA EN SUPABASE **ANTES** DE DESPLEGAR EL CÓDIGO QUE LA USA. Si no,
--   PostgREST devuelve 42703 (columna/tabla inexistente) y la ruta responde
--   **403** — parece un problema de permisos y no lo es.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. La tabla ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Explícito SIEMPRE, y sin DEFAULT. La 00030 nunca se aplicó, así que 18
  -- tablas conservan el DEFAULT puente de la 00028 hacia Sushi Service: un
  -- INSERT que olvide el tenant se va calladito a otra marca, sin error. Esta
  -- tabla nace sin ese default para que el olvido REVIENTE.
  tenant_id     uuid NOT NULL REFERENCES tenants(id),

  provider      text NOT NULL CHECK (provider IN ('whatsapp_zernio')),
  label         text NULL,

  -- NULL = «alta anterior a Conexiones, camino desconocido». No se le inventa un
  -- camino a nadie en el backfill.
  route         text NULL CHECK (route IN ('coexistence','byo_cloud_api','zernio_number')),

  status        text NOT NULL DEFAULT 'sin_empezar' CHECK (status IN (
                  'sin_empezar','camino_elegido','kyc_pendiente','numero_declarado',
                  'numero_comprado','signup_abierto','verificacion_pendiente',
                  'conectada','activa','fallida','suspendida','liberada')),

  phone_e164    text NULL CHECK (phone_e164 ~ '^\+[0-9]{7,15}$'),

  zernio_profile_id text NULL,
  zernio_account_id text NULL,
  waba_id           text NULL,
  phone_number_id   text NULL,

  -- El nonce es NUESTRO, no el `state` que devuelve Zernio. Ver §6.1 del diseño
  -- y el comentario del índice de abajo.
  signup_nonce      text NULL,
  signup_opened_at  timestamptz NULL,

  is_primary        boolean NOT NULL DEFAULT false,

  -- Lo habilita el OPERADOR (super-admin), nunca el dueño del restaurante.
  purchase_allowed  boolean NOT NULL DEFAULT false,
  -- TU tarifa, congelada al comprar. NULL = no se alquila.
  monthly_price_cop numeric NULL,

  last_event        text NULL,
  last_event_at     timestamptz NULL,
  last_error        text NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_connections IS
  'Una fila por LÍNEA de WhatsApp de la marca: estado del ALTA, no del envío. SIN location_id a propósito (D6 re-cerrada 2026-09-07: un número por marca, compartido por todas las sedes). El envío sigue leyendo tenants.zernio_* — enrutar por línea es F9.';
COMMENT ON COLUMN tenant_connections.signup_nonce IS
  'Nonce PROPIO del Embedded Signup. El `state` que devuelve Zernio ("user-profile-timestamp-callbackurl") NO identifica al tenant de forma confiable: sin este nonce, un `code` pegado desde otra pestaña conectaría la WABA equivocada y los mensajes de una marca saldrían por el número de otra.';
COMMENT ON COLUMN tenant_connections.route IS
  'NULL = alta anterior a Conexiones, camino desconocido. Se CONGELA una vez declarado el número o abierto el signup (lo impone el trigger de más abajo).';
COMMENT ON COLUMN tenant_connections.monthly_price_cop IS
  'TU tarifa de reventa, congelada al momento de comprar. Si mañana la subís, a quien ya compró NO se le re-escribe el precio.';

-- ─── 2. Los tres índices, cada uno con su motivo ────────────────

-- Espeja `idx_tenants_zernio_account_id` (00036). Sin esto, dos marcas podrían
-- reclamar la misma cuenta de Zernio y el webhook resolvería el tenant equivocado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_connections_zernio_account
  ON tenant_connections (zernio_account_id)
  WHERE zernio_account_id IS NOT NULL;

-- PARCIAL a propósito. Es la deuda D3 de multi-sede (`is_primary` sin UNIQUE)
-- resuelta desde el día uno. ⚠️ Un UNIQUE plano sobre `is_primary` NO sirve:
-- en Postgres **los NULL no colisionan entre sí**, y `false` sí colisiona con
-- `false` — o sea que un índice plano prohibiría tener dos líneas secundarias.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_connections_primary
  ON tenant_connections (tenant_id, provider)
  WHERE is_primary;

-- El mismo número no se declara dos veces dentro de la misma marca.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_connections_phone
  ON tenant_connections (tenant_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Resolución del webhook por profile cuando todavía no hay account.
CREATE INDEX IF NOT EXISTS idx_tenant_connections_profile
  ON tenant_connections (zernio_profile_id)
  WHERE zernio_profile_id IS NOT NULL;

-- El nonce se busca EXACTO al volver del Embedded Signup. Único global: dos
-- filas con el mismo nonce harían ambigua justo la comprobación que existe para
-- que no lo sea.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_connections_nonce
  ON tenant_connections (signup_nonce)
  WHERE signup_nonce IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_connections_tenant
  ON tenant_connections (tenant_id);

-- ─── 3. `updated_at` y el congelado del camino ──────────────────
CREATE OR REPLACE FUNCTION tenant_connections_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();

  -- EL CAMINO SE CONGELA (§2 del diseño).
  --
  -- Se puede corregir mientras no se haya declarado número ni abierto el signup;
  -- después no, porque cambiarlo deja un número comprado o una coexistencia a
  -- medias sin dueño. En el AIOS eso lo cuida la UI (`canChangeOwnerRoute()`);
  -- acá va en el MOTOR, porque del lado del cliente una pestaña vieja apuntando
  -- a otro camino es mucho más probable.
  IF TG_OP = 'UPDATE'
     AND OLD.route IS NOT NULL
     AND NEW.route IS DISTINCT FROM OLD.route
     AND (OLD.phone_e164 IS NOT NULL OR OLD.signup_nonce IS NOT NULL)
  THEN
    RAISE EXCEPTION 'camino_congelado'
      USING DETAIL = 'ya hay número declarado o signup abierto para esta conexión';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_connections_touch ON tenant_connections;
CREATE TRIGGER trg_tenant_connections_touch
  BEFORE INSERT OR UPDATE ON tenant_connections
  FOR EACH ROW EXECUTE FUNCTION tenant_connections_touch();

-- ─── 4. RLS ─────────────────────────────────────────────────────
-- Mismo criterio que 00037: el tenant ve y opera SOLO lo suyo; el super-admin,
-- todo. Las rutas del producto hablan con el rol de servicio (que se salta RLS),
-- así que esto es la segunda línea, no la única: la primera es que cada ruta
-- resuelve el tenant DE LA SESIÓN y jamás de un parámetro.
ALTER TABLE tenant_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_all_tenant_connections" ON tenant_connections;
CREATE POLICY "tenant_all_tenant_connections" ON tenant_connections FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ─── 5. Backfill: SOLO lo que ya es verdad ──────────────────────
-- Una fila `activa` únicamente para los tenants que YA tienen cuenta de Zernio.
-- `route` queda NULL = «alta anterior a Conexiones». No se le inventa un camino
-- a nadie, igual que hizo el AIOS con sus filas viejas.
INSERT INTO tenant_connections (
  tenant_id, provider, label, status, phone_e164,
  zernio_profile_id, zernio_account_id, is_primary, last_event, last_event_at
)
SELECT
  t.id, 'whatsapp_zernio', 'Línea principal', 'activa', t.zernio_phone_number,
  t.zernio_profile_id, t.zernio_account_id, true, 'backfill_00054', now()
FROM tenants t
WHERE t.zernio_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tenant_connections c
     WHERE c.zernio_account_id = t.zernio_account_id
  );

-- ─── 6. El cuerpo único: `connection_apply_whatsapp()` ──────────
--
-- Hoy `aios_activate_whatsapp()` es el único escritor de `tenants.zernio_*`.
-- Conexiones NO puede volverse un segundo escritor con su propia validación: ahí
-- es donde las invariantes se separan y un día un tenant queda con
-- `messaging_provider='zernio'` y sin `account_id` — exactamente el caso que
-- `sendViaZernio()` corta con `zernio_not_configured`.
--
-- Un cuerpo, dos puertas: esta función, y `aios_activate_whatsapp()` como cáscara.
--
-- `activa` exige `zernio_account_id` Y `zernio_phone_number`, y el flip de
-- `messaging_provider` ocurre en ESTA MISMA transacción. Nunca antes.
CREATE OR REPLACE FUNCTION connection_apply_whatsapp(
  p_tenant_id  uuid,
  p_profile_id text,
  p_account_id text,
  p_phone      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_connection_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = COALESCE(p_tenant_id::text, '(null)');
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+[0-9]{7,15}$' THEN
    RAISE EXCEPTION 'phone_invalido'
      USING DETAIL = 'formato esperado E.164 con +, recibido: ' || COALESCE(p_phone, '(null)');
  END IF;
  IF p_account_id IS NULL OR length(trim(p_account_id)) = 0 THEN
    RAISE EXCEPTION 'account_id_requerido';
  END IF;

  -- 6.a — La proyección de la línea principal en `tenants`. Es lo que lee
  -- `sendViaZernio()`, y por eso no cambia de sitio: mover esas columnas es F9.
  UPDATE tenants
     SET messaging_provider  = 'zernio',
         zernio_profile_id   = p_profile_id,
         zernio_account_id   = p_account_id,
         zernio_phone_number = p_phone
   WHERE id = p_tenant_id;

  -- 6.b — La fila de la conexión, en la MISMA transacción.
  --
  -- Se busca por `zernio_account_id` primero (el índice único global lo hace
  -- determinista) y, si no, por la línea principal de esa marca: es el caso de
  -- una conexión que venía del flujo del cliente y todavía no tenía cuenta.
  SELECT id INTO v_connection_id
    FROM tenant_connections
   WHERE zernio_account_id = p_account_id
   LIMIT 1;

  IF v_connection_id IS NULL THEN
    SELECT id INTO v_connection_id
      FROM tenant_connections
     WHERE tenant_id = p_tenant_id
       AND provider = 'whatsapp_zernio'
       AND is_primary
     LIMIT 1;
  END IF;

  IF v_connection_id IS NULL THEN
    INSERT INTO tenant_connections (
      tenant_id, provider, label, status, phone_e164,
      zernio_profile_id, zernio_account_id, is_primary, last_event, last_event_at
    ) VALUES (
      p_tenant_id, 'whatsapp_zernio', 'Línea principal', 'activa', p_phone,
      p_profile_id, p_account_id, true, 'connection_apply_whatsapp', now()
    )
    RETURNING id INTO v_connection_id;
  ELSE
    UPDATE tenant_connections
       SET status            = 'activa',
           phone_e164        = p_phone,
           zernio_profile_id = p_profile_id,
           zernio_account_id = p_account_id,
           -- El nonce se quema al cerrar: un `code` reenviado no vuelve a entrar.
           signup_nonce      = NULL,
           last_error        = NULL,
           last_event        = 'connection_apply_whatsapp',
           last_event_at     = now()
     WHERE id = v_connection_id
       -- Cinturón: la fila tiene que ser DE ESTA MARCA. Sin este AND, un
       -- `account_id` repetido apuntaría a la conexión de otro tenant.
       AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'conexion_de_otra_marca'
        USING DETAIL = 'ese account de Zernio ya pertenece a otro tenant';
    END IF;
  END IF;

  RETURN v_connection_id;
END;
$$;

COMMENT ON FUNCTION connection_apply_whatsapp(uuid, text, text, text) IS
  'ÚNICO cuerpo que activa Zernio para una marca: escribe tenants.messaging_provider + los tres zernio_* Y la fila de tenant_connections en UNA transacción. Dos puertas lo llaman: aios_activate_whatsapp() (rol aios_constelarys) y las rutas de /api/dashboard/conexiones (admin del tenant, con su tenant_id de sesión).';

-- ─── 7. `aios_activate_whatsapp()` pasa a ser CÁSCARA ───────────
--
-- ⚠️ TRAMPA VERIFICADA DE POSTGRES: agregarle o cambiarle parámetros a una
-- función NO es un `CREATE OR REPLACE`, es una **SOBRECARGA** — y la llamada
-- vieja pasa a ser ambigua (42725) dentro de un `catch` que solo loguea. Pasó
-- con `log_review_shown_deduped()` el 2026-09-04. Acá la firma NO cambia, pero
-- el DROP va igual: es lo único que garantiza que quede UNA sola.
DROP FUNCTION IF EXISTS aios_activate_whatsapp(text, text, text, text);

CREATE FUNCTION aios_activate_whatsapp(
  p_slug text,
  p_profile_id text,
  p_account_id text,
  p_phone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Mismo contrato que antes para el AIOS: mismo nombre, misma firma, mismos
  -- errores ('tenant_no_existe', 'phone_invalido', 'account_id_requerido') y
  -- mismo efecto sobre `tenants`. Lo único que cambia es que ahora TAMBIÉN deja
  -- la fila de `tenant_connections` al día — el estado canónico pasa a ser esa
  -- tabla, y el wizard del AIOS queda como escotilla que la lee.
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_slug;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;

  PERFORM connection_apply_whatsapp(v_tenant_id, p_profile_id, p_account_id, p_phone);
END;
$$;

COMMENT ON FUNCTION aios_activate_whatsapp(text, text, text, text) IS
  'CÁSCARA de connection_apply_whatsapp() desde la 00054. Mismo contrato que en la 00036 para el AIOS; el cuerpo vive en un solo sitio para que Conexiones y el wizard no puedan divergir en las validaciones.';

-- ─── 8. GRANTs ──────────────────────────────────────────────────
-- Todo proyecto Supabase trae `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated`, así que cada función nace con un GRANT
-- nominal a esos roles. Se revoca a mano, igual que hizo la 00037.
REVOKE EXECUTE ON FUNCTION connection_apply_whatsapp(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION aios_activate_whatsapp(text, text, text, text)    FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    GRANT EXECUTE ON FUNCTION aios_activate_whatsapp(text, text, text, text) TO aios_constelarys;
    -- El AIOS LEE el estado del alta del producto (§7 del diseño): el estado
    -- canónico es esta tabla, no su JSONB.
    GRANT SELECT ON tenant_connections TO aios_constelarys;
  END IF;
END $$;

-- ─── 9. Verificación: que la migración no se dé por buena a medias ─
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
  v_n     int;
BEGIN
  IF to_regclass('public.tenant_connections') IS NULL THEN
    v_falta := v_falta || 'tenant_connections (tabla)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'connection_apply_whatsapp') THEN
    v_falta := v_falta || 'connection_apply_whatsapp()';
  END IF;

  -- Que haya EXACTAMENTE UNA `aios_activate_whatsapp`. Dos = la sobrecarga de
  -- 42725, y el AIOS se rompería dentro de un catch que solo loguea.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'aios_activate_whatsapp';
  IF v_n <> 1 THEN
    v_falta := v_falta || ('aios_activate_whatsapp() tiene ' || v_n || ' versiones, debe tener 1');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_tenant_connections_primary') THEN
    v_falta := v_falta || 'uq_tenant_connections_primary (indice parcial)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_tenant_connections_nonce') THEN
    v_falta := v_falta || 'uq_tenant_connections_nonce (indice parcial)';
  END IF;

  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00054 incompleta, falta: %', array_to_string(v_falta, ', ');
  END IF;

  SELECT count(*) INTO v_n FROM tenant_connections;
  RAISE NOTICE '00054 OK: tenant_connections (% filas de backfill), connection_apply_whatsapp() y aios_activate_whatsapp() como cascara. tenants.zernio_* y el envio: SIN TOCAR.', v_n;
END $$;
