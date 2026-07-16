-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00032: Reseñas de Google — memoria y tracking
-- Fecha: 2026-07-13
-- Descripción: Bloque 3. Dos piezas con roles distintos:
--
--   1. La MEMORIA (columnas en customers) — a quién se le muestra el pop-up.
--      El navegador del check-in es stateless (cero localStorage, cero cookies):
--      el cliente se identifica SOLO por teléfono. Si la memoria viviera en el
--      navegador se rompería en cuanto abriera su tarjeta desde otro celular.
--
--   2. El FUNNEL (tabla review_events) — si la estrategia funciona.
--      Es la primera tabla de eventos del sistema: no había NADA de analytics
--      en el repo (ni PostHog, ni GA, ni tabla de eventos). Hallazgo 3.7.
--
--   El premio por reseña NO necesita infraestructura nueva: reutiliza entero el
--   motor del Bloque 1 (reward_grants), donde source='review' YA existe en el CHECK
--   de la migración 00031.
--
-- Ref: docs/features/review-flow.md
--      docs/superpowers/specs/2026-07-13-google-review-popup-design.md
--      docs/requerimientos/REQUERIMIENTOS_JULIO_2026.md (R6, R6.a, R6.b, R6.c)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Memoria del cliente ─────────────────────────────────────
-- clicked_at  → fue a Google. NUNCA más se le muestra el pop-up (R6.b).
-- postponed_at → tocó "La próxima lo hago". SÍ se le vuelve a mostrar, en su
--                próximo check-in. Es informativo: el gate no lo consulta.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS google_review_clicked_at timestamptz DEFAULT NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS google_review_postponed_at timestamptz DEFAULT NULL;

-- ─── 2. Funnel de reseñas ───────────────────────────────────────
-- Deliberadamente NO es una tabla de analytics genérica. Tres acciones y un CHECK
-- que las cierra. Una tabla `events(name, payload jsonb)` sería más "flexible" y por
-- eso mismo imposible de consultar sin adivinar qué se guardó.
CREATE TABLE IF NOT EXISTS review_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  action text NOT NULL CHECK (action IN ('shown', 'clicked', 'postponed')),

  -- Solo en 'clicked': el premio que se otorgó. Permite cruzar el funnel con la
  -- entrega real (¿cuántas reseñas terminaron en un premio efectivamente redimido?).
  grant_id uuid DEFAULT NULL REFERENCES reward_grants(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consulta del dashboard: el embudo por rango de fechas.
CREATE INDEX IF NOT EXISTS idx_review_events_funnel
  ON review_events (tenant_id, action, created_at DESC);

-- Dedupe del evento 'shown': si el cliente recarga la pantalla de éxito, no debe
-- contar dos impresiones. El servicio busca por (customer_id, action) en las últimas 12h.
CREATE INDEX IF NOT EXISTS idx_review_events_customer
  ON review_events (customer_id, action, created_at DESC);

-- ─── 3. RLS (patrón multitenant de la migración 00031) ──────────
-- El service role bypasa RLS por diseño; el aislamiento real lo hace el código
-- filtrando tenant_id en cada query. Esta policy protege el path autenticado.
-- Postgres no soporta CREATE POLICY IF NOT EXISTS → DROP + CREATE.
ALTER TABLE review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_all_review_events" ON review_events;
CREATE POLICY "tenant_all_review_events" ON review_events FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ─── 4. Merge atómico de tenants.config (evita lost-update) ─────────────────────
-- El link de reseñas se edita desde el dashboard (PUT /api/dashboard/tenant-config).
-- Hacerlo con lectura → merge-en-JS → escritura abre una condición de carrera: dos
-- escrituras concurrentes sobre `tenants.config` (jsonb con TODO el branding) pueden
-- pisarse y perder la del otro. Esta función mezcla en la propia base de datos con el
-- operador `||`, así que el UPDATE es atómico: el patch se aplica sobre el valor MÁS
-- reciente, no sobre uno leído hace milisegundos.
CREATE OR REPLACE FUNCTION merge_tenant_config(p_tenant_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE tenants
     SET config = COALESCE(config, '{}'::jsonb) || p_patch
   WHERE id = p_tenant_id
  RETURNING config;
$$;

-- ─── 5. Registro deduplicado del evento 'shown' (fix auditoría) ──────────────────
-- El check-then-act en JS (SELECT ... LIMIT 1 → INSERT) hacía DOS idas a la base y dejaba
-- una ventana ancha: dos peticiones casi simultáneas podían ver "no hay impresión reciente"
-- e insertar ambas, inflando el denominador del funnel. Esta función lo hace en UNA sola
-- sentencia (INSERT ... WHERE NOT EXISTS): una ida a la base y la ventana de carrera reducida
-- a lo que dura la sentencia. No es un contador de dinero, así que no se exige atomicidad
-- perfecta; es estrictamente mejor que el check-then-act anterior.
CREATE OR REPLACE FUNCTION log_review_shown_deduped(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_within_hours integer
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO review_events (tenant_id, customer_id, action)
  SELECT p_tenant_id, p_customer_id, 'shown'
  WHERE NOT EXISTS (
    SELECT 1 FROM review_events
     WHERE tenant_id   = p_tenant_id
       AND customer_id = p_customer_id
       AND action      = 'shown'
       AND created_at >= now() - make_interval(hours => p_within_hours)
  );
$$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00032
-- ═══════════════════════════════════════════════════════════════
