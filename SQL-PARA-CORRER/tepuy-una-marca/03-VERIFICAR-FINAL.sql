-- ═══════════════════════════════════════════════════════════════════════════
-- TEPUY — 03. VERIFICACIÓN FINAL (SOLO LEE)
-- SQL Editor del **PRODUCTO**, después de rehacer el alta en el AIOS.
-- Cuatro respuestas. Cualquier ✗ es un problema: pará y avisá.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. UNA sola marca Tepuy ────────────────────────────────────────────────
SELECT CASE WHEN count(*) = 1 THEN '✓' ELSE '✗' END AS ok,
       'Existe UNA sola marca' AS comprobacion,
       count(*) AS marcas, string_agg(slug, ', ') AS cuales
  FROM tenants WHERE slug ILIKE '%tepuy%';

-- ── 2. Los dos QR impresos son sedes de esa marca ──────────────────────────
-- Lo que de verdad importa. Cada host impreso tiene que ser el `domain` de UNA
-- sede activa: así resolveHostContext() encuentra la marca y pickLocationForHost()
-- le da source='host' — la visita se atribuye a su local, sin preguntar nada.
SELECT CASE WHEN count(*) = 2 THEN '✓' ELSE '✗' END AS ok,
       'Los 2 subdominios impresos son sedes' AS comprobacion,
       count(*) AS encontrados
  FROM restaurant_locations l
  JOIN tenants t ON t.id = l.tenant_id
 WHERE t.slug ILIKE '%tepuy%'
   AND l.is_active
   AND l.domain IN ('clubtepuylaureles.constelarys.com', 'clubtepuyenvigado.constelarys.com');

-- ── 3. Ninguno de los dos hosts es el dominio RAÍZ de la marca ─────────────
-- Si lo fuera, ese QR impreso dejaría de registrar y pasaría a preguntar
-- «¿en qué sede estás?» — el dominio raíz manda aunque una sede lo repita
-- (src/lib/location-resolver.ts:136), y con 2+ sedes pide elegir.
SELECT CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END AS ok,
       'Ningún host impreso quedó como raíz de la marca' AS comprobacion,
       count(*) AS problemas
  FROM tenants
 WHERE domain IN ('clubtepuylaureles.constelarys.com', 'clubtepuyenvigado.constelarys.com');

-- ── 4. Exactamente una sede principal ──────────────────────────────────────
SELECT CASE WHEN count(*) FILTER (WHERE is_primary) = 1 THEN '✓' ELSE '✗' END AS ok,
       'Exactamente 1 sede principal' AS comprobacion,
       count(*) FILTER (WHERE is_primary) AS principales,
       count(*) AS sedes_activas
  FROM restaurant_locations l
  JOIN tenants t ON t.id = l.tenant_id
 WHERE t.slug ILIKE '%tepuy%' AND l.is_active;

-- ── La foto final, para mirarla con los ojos ───────────────────────────────
SELECT t.slug AS marca, t.name, t.domain AS raiz_de_la_marca,
       l.name AS sede, l.slug AS sede_slug, l.domain AS subdominio_impreso,
       l.is_primary, l.sort_order, l.is_active
  FROM tenants t
  LEFT JOIN restaurant_locations l ON l.tenant_id = t.id
 WHERE t.slug ILIKE '%tepuy%'
 ORDER BY l.sort_order;

-- ── El número de WhatsApp: UNO para las dos sedes ──────────────────────────
-- Una sola fila con una sola cuenta. Si aparecieran dos marcas con dos cuentas,
-- el modelo volvió a partirse.
SELECT slug, messaging_provider, zernio_account_id, zernio_phone_number
  FROM tenants WHERE slug ILIKE '%tepuy%';
