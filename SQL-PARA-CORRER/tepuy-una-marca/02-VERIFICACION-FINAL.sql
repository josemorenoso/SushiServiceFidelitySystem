-- ═══════════════════════════════════════════════════════════════════════════
-- TEPUY — 02. VERIFICACIÓN FINAL (SOLO LEE)
-- SQL Editor del PRODUCTO, después de 01-FUNDIR.sql.
-- Las 5 respuestas que tienen que salir bien. Cualquier ✗ es un problema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Una sola marca, con su raíz propia ──────────────────────────────────
SELECT CASE WHEN count(*) = 1 THEN '✓' ELSE '✗' END AS ok,
       'Existe UNA marca Tepuy' AS comprobacion, count(*) AS encontradas
  FROM tenants WHERE slug = 'clubtepuy';

-- ── 2. La marca borrada ya no existe ───────────────────────────────────────
SELECT CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END AS ok,
       'clubtepuyenvigado ya no existe como marca' AS comprobacion, count(*) AS encontradas
  FROM tenants WHERE slug IN ('clubtepuyenvigado', 'clubtepuylaureles');

-- ── 3. Los dos QR impresos apuntan a su sede ───────────────────────────────
-- Esto es lo que de verdad importa: cada host impreso tiene que ser el `domain`
-- de UNA sede activa de la marca. Así resuelve resolveHostContext() y así
-- pickLocationForHost() le da source='host' (atribución exacta, sin preguntar).
SELECT CASE WHEN count(*) = 2 THEN '✓' ELSE '✗' END AS ok,
       'Los 2 subdominios impresos son sedes de la marca' AS comprobacion,
       count(*) AS encontrados
  FROM restaurant_locations l
  JOIN tenants t ON t.id = l.tenant_id
 WHERE t.slug = 'clubtepuy'
   AND l.is_active
   AND l.domain IN ('clubtepuylaureles.constelarys.com', 'clubtepuyenvigado.constelarys.com');

-- ── 4. Exactamente una sede principal ──────────────────────────────────────
SELECT CASE WHEN count(*) FILTER (WHERE is_primary) = 1 THEN '✓' ELSE '✗' END AS ok,
       'Exactamente 1 sede principal' AS comprobacion,
       count(*) FILTER (WHERE is_primary) AS principales,
       count(*) AS sedes_activas
  FROM restaurant_locations l
  JOIN tenants t ON t.id = l.tenant_id
 WHERE t.slug = 'clubtepuy' AND l.is_active;

-- ── 5. Ningún host quedó compartido entre marcas ───────────────────────────
-- El guardarraíl de la 00051 en versión consulta: un host no puede ser a la vez
-- el dominio de una marca y el de la sede de OTRA.
SELECT CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END AS ok,
       'Ningún host compartido entre marcas' AS comprobacion, count(*) AS choques
  FROM tenants t
  JOIN restaurant_locations l ON l.domain = t.domain AND l.tenant_id <> t.id
 WHERE t.domain IS NOT NULL;

-- ── La foto final, para mirarla con los ojos ───────────────────────────────
SELECT t.slug AS marca, t.name, t.domain AS raiz_de_la_marca,
       l.name AS sede, l.slug AS sede_slug, l.domain AS subdominio_impreso,
       l.is_primary, l.sort_order, l.is_active, l.lat, l.lon
  FROM tenants t
  LEFT JOIN restaurant_locations l ON l.tenant_id = t.id
 WHERE t.slug = 'clubtepuy'
 ORDER BY l.sort_order;

-- ── El usuario del panel, si ya existe ─────────────────────────────────────
-- Tiene que apuntar a la marca (no a la borrada) y volver a iniciar sesión.
SELECT u.email, t.slug AS marca_del_usuario, u.last_sign_in_at
  FROM auth.users u
  JOIN tenants t ON t.id = (u.raw_app_meta_data->>'tenant_id')::uuid
 WHERE t.slug = 'clubtepuy';
