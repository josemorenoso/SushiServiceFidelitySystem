-- ═══════════════════════════════════════════════════════════════
-- Migration 00039: Catálogo estándar de plantillas + estilos + versionado
-- Fecha: 2026-08-30
-- Requerimiento: docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §12
--                (incluidas las RESPUESTAS DEL DUEÑO del 2026-08-30)
-- Doc de feature: docs/features/whatsapp-templates.md
--
-- ⚠️ NUMERACIÓN: el encargo original decía "00038", pero esa numeración ya la
-- tomó `00038_send_queue_drain.sql` (Bloque 2 de la gobernanza de envío, frente
-- paralelo). Esta migración es la 00039.
--
-- QUÉ RESUELVE
-- ------------
-- Meta no deja editar in-place una plantilla ya aprobada. El flujo real de una
-- "edición" es: crear una plantilla NUEVA, someterla, esperar 24-72h y recién
-- entonces cambiar el puntero. Decisión textual del dueño:
--   "que se cree primero la nueva y una vez quede aprobada se cambie y
--    automáticamente se modifique, pero luego de aprobarla, para nunca
--    arriesgarnos a perder un mensaje".
-- Eso exige poder guardar la plantilla VIGENTE y la PENDIENTE a la vez, con el
-- estado de la pendiente. Hoy `admin_settings` solo guarda una
-- (`*_template_sid`) y es key-value: no tiene dónde registrar QUIÉN editó ni
-- CUÁNDO, que es requisito duro de la decisión 3 del dueño ("el dueño puede, si
-- se las llegan a bloquear va a ser su culpa") — sin registro, esa frase no se
-- sostiene después.
--
-- POR QUÉ UNA TABLA Y NO MÁS CLAVES EN admin_settings
-- ---------------------------------------------------
-- `admin_settings.*_template_sid` SIGUE SIENDO el puntero vigente y su contrato
-- NO cambia: todo el camino de envío (check-in, crons, campañas, calendario) lo
-- lee igual que ayer y no se toca ni una línea. La pendiente, su estado, su
-- autor y su historial viven en `template_versions`. Así el versionado es
-- aditivo: con esta tabla vacía, el sistema envía exactamente como hoy.
--
-- Depende de: 00007 (admin_settings), 00024 (tenants + current_tenant_id /
--             is_super_admin), 00025 (tenant_id), 00028 (PK compuesto
--             (key, tenant_id) en admin_settings), 00036 (messaging_provider)
--
-- Aplicar en el SQL Editor de Supabase (este proyecto no usa Supabase CLI).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Versiones de plantilla (vigente + pendiente + historial)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_versions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Identidad dentro del catálogo estándar (espejo de src/constants/template-catalog.ts)
    template_key           text NOT NULL,
    settings_key           text NOT NULL,

    -- Identidad en el proveedor
    provider               text NOT NULL CHECK (provider IN ('twilio','zernio')),
    provider_ref           text NOT NULL,
    provider_template_id   text,
    language               text NOT NULL DEFAULT 'es',
    category               text NOT NULL CHECK (category IN ('AUTHENTICATION','MARKETING','UTILITY')),

    -- Contenido
    style                  text NOT NULL CHECK (style IN ('calido','elegante','urbano','personalizado')),
    body                   text NOT NULL,

    -- Ciclo de vida ante Meta
    status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected','retired','failed')),
    rejection_reason       text,
    is_current             boolean NOT NULL DEFAULT false,

    -- Registro de responsabilidad (decisión 3 del dueño)
    edited_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    edited_by_email        text,
    disclaimer_accepted_at timestamptz,

    created_at             timestamptz NOT NULL DEFAULT now(),
    submitted_at           timestamptz,
    resolved_at            timestamptz,
    retired_at             timestamptz
);

COMMENT ON TABLE template_versions IS
  'Historial de versiones de cada plantilla del catálogo estándar, por tenant. La fila is_current=true es la que apunta admin_settings.<settings_key>; la fila status=pending es la que Meta está revisando. NUNCA hay un hueco: la vigente sigue vigente hasta que la pendiente se aprueba (REQUERIMIENTOS_AGOSTO_2026.md §12, "Pregunta 1 — RESUELTA").';
COMMENT ON COLUMN template_versions.provider_ref IS
  'El identificador con el que el camino de envío llama a esta plantilla: `name` de Zernio (ej. bienvenida_v2) o ContentSid de Twilio. Es el valor que se copia a admin_settings.<settings_key> al promover.';
COMMENT ON COLUMN template_versions.style IS
  'Estilo del banco de textos con el que nació. `personalizado` = el dueño editó el texto a mano y ya no coincide con ningún estilo del banco.';
COMMENT ON COLUMN template_versions.status IS
  'pending = en revisión de Meta | approved = vigente o disponible | rejected = Meta la negó (la vigente NO se toca) | retired = fue vigente y la reemplazó una nueva | failed = ni siquiera se pudo crear en el proveedor.';
COMMENT ON COLUMN template_versions.disclaimer_accepted_at IS
  'Momento en que el editor aceptó la advertencia de responsabilidad ("si Meta te bloquea la plantilla es tu responsabilidad"). Sin este registro la advertencia no se puede sostener después — decisión 3 del dueño.';
COMMENT ON COLUMN template_versions.retired_at IS
  'Cuándo dejó de ser la vigente. La plantilla NO se borra del proveedor: el contrato verificado de Zernio (Level 2.0/aios-constelarys/docs/zernio-api-contract.md §4) no expone un DELETE de plantillas, y esa doc prohíbe explícitamente inventar rutas. Queda huérfana en la WABA, sin costo ni efecto sobre el envío.';

-- Una sola vigente por slot. Es la garantía de que admin_settings nunca queda ambiguo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_one_current
    ON template_versions (tenant_id, settings_key) WHERE is_current;

-- Una sola pendiente por slot: dos ediciones simultáneas del mismo mensaje
-- competirían por el mismo puntero al aprobarse. La UI bloquea el botón, pero la
-- garantía tiene que estar en la base.
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_one_pending
    ON template_versions (tenant_id, settings_key) WHERE status = 'pending';

-- El `name` de una plantilla es único por WABA en Meta. Reusarlo mientras la
-- vieja existe hace fallar la creación en el proveedor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_provider_ref
    ON template_versions (tenant_id, provider_ref, language);

-- El webhook `whatsapp.template.status_updated` llega con (name, language) y
-- resuelve el tenant por account: este índice es el lookup de ese camino.
CREATE INDEX IF NOT EXISTS idx_template_versions_lookup
    ON template_versions (provider_ref, language, status);

CREATE INDEX IF NOT EXISTS idx_template_versions_tenant
    ON template_versions (tenant_id, template_key, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. Estilo del tenant (SUGERENCIA, no candado — decisión 4 del dueño)
-- ─────────────────────────────────────────────────────────────
-- `template_style` es el default con el que NACE cada plantilla nueva del
-- catálogo. El dueño puede cambiarlo cuando quiera; cambiarlo NO reescribe nada
-- por sí solo — re-aplicarlo a las 13 es una acción explícita aparte, porque son
-- 13 aprobaciones nuevas de Meta.
--
-- Solo se siembra en tenants Zernio: los 4 tenants Twilio (Sushi Service, Don
-- Alirio, Frangal, Demo) no se tocan — decisión 6 del dueño, textual: "los 4
-- tenants que están con twilio déjalos así, ni los toques".
INSERT INTO admin_settings (key, value, tenant_id, updated_at)
SELECT 'template_style', 'calido', t.id, now()
  FROM tenants t
 WHERE t.messaging_provider = 'zernio'
ON CONFLICT (key, tenant_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. RLS — mismo criterio que el resto del modelo multitenant
-- ─────────────────────────────────────────────────────────────
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'template_versions' AND policyname = 'tenant_all_template_versions'
  ) THEN
    CREATE POLICY "tenant_all_template_versions" ON template_versions FOR ALL
      USING      (tenant_id = current_tenant_id() OR is_super_admin())
      WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());
  END IF;
END $$;
