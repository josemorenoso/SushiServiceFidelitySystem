-- ═══════════════════════════════════════════════════════════════
-- 01 · Alta del tenant Sushi Fun + su sede principal
-- Absorción de Sushi Fun al despliegue principal — 2026-09-06
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL** (el de Sushi Service).
-- Va DESPUÉS de 00-PREVUELO.sql y ANTES de todo lo demás.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 🔴 ESTE ES EL ARCHIVO PELIGROSO. LOS OTROS SOLO MUEVEN FILAS.            │
-- │                                                                          │
-- │ Hay DOS caminos por los que Sushi Fun hereda, EN SILENCIO, la identidad  │
-- │ de Sushi Service. Los dos se cierran acá y en ningún otro lado:          │
-- │                                                                          │
-- │ 1. WHATSAPP. getTwilioClient() (whatsapp.service.ts:88-96) resuelve      │
-- │    CAMPO POR CAMPO con `??`:                                             │
-- │        tenant.twilio_subaccount_sid        ?? env.TWILIO_ACCOUNT_SID     │
-- │        tenant.twilio_subaccount_auth_token ?? env.TWILIO_AUTH_TOKEN      │
-- │        tenant.twilio_whatsapp_number       ?? env.TWILIO_WHATSAPP_NUMBER │
-- │    En el despliegue standalone esas 3 columnas están en NULL A PROPÓSITO │
-- │    (lo dice su 00028) porque allá el env ES de Sushi Fun. Acá el env es  │
-- │    de SUSHI SERVICE. Las mismas 3 columnas en NULL, en esta base,        │
-- │    significan: los WhatsApp de Sushi Fun salen del NÚMERO DE SUSHI       │
-- │    SERVICE y se le cobran a Sushi Service. Es el fallo exacto que este   │
-- │    producto existe para evitar.                                          │
-- │    Y no es todo-o-nada: `??` es por campo. Llenar 2 de 3 mezcla cuentas. │
-- │    → LAS TRES, O NINGUNA. El bloque de verificación de abajo lo exige.   │
-- │                                                                          │
-- │ 2. MARCA. resolveBranding() (src/lib/branding.ts:75-89) también cae      │
-- │    campo por campo a DEFAULT_BRANDING, que son las NEXT_PUBLIC_BRAND_*   │
-- │    del entorno = Sushi Service. `config = '{}'` era correcto allá y acá  │
-- │    le pone "Sushi Service" en la tarjeta a los 250 clientes de Sushi Fun.│
-- │    → config se llena ENTERO, no se deja vacío.                           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ⚠️ ANTES DE CORRER: llená el bloque de PARÁMETROS. Los tres valores de Twilio
--    NO están en este archivo a propósito (los secretos no se versionan): salen
--    de console.twilio.com de la cuenta de Sushi Fun. El SID empieza por
--    AC04707046… — si el que pegás empieza distinto, es la cuenta equivocada.
--
-- REVERSIBLE: sí — 99-ROLLBACK.sql. Mientras no haya corrido el 02 en adelante,
--    borrar estas 2 filas no deja nada huérfano.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DO $alta$
DECLARE
  -- ═══════════════ PARÁMETROS — EDITAR SOLO ESTE BLOQUE ═══════════════

  -- Identidad. El UUID es el que Sushi Fun YA usa en su propia base: conservarlo
  -- es lo que permite copiar las ~1.100 filas sin remapear una sola FK.
  p_tenant_id     uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  p_sede_id       uuid := 'd6798a6e-40f1-4d1a-91be-5d30770c1448';
  p_slug          text := 'sushi-fun';
  p_name          text := 'Sushi Fun';
  p_domain        text := 'clubsushifun.constelarys.com';   -- ← decidido en el plan MASTER de 2026-07-05 §4.B.4

  -- 🔴 TWILIO — LOS TRES O NINGUNO. Ver el recuadro de arriba.
  p_twilio_sid    text := '<<<PEGAR_ACCOUNT_SID_DE_SUSHI_FUN>>>';    -- empieza por AC04707046…
  p_twilio_token  text := '<<<PEGAR_AUTH_TOKEN_DE_SUSHI_FUN>>>';
  p_twilio_number text := '<<<PEGAR_NUMERO_WHATSAPP_DE_SUSHI_FUN>>>'; -- formato: whatsapp:+57XXXXXXXXXX

  -- Marca. Tienen que coincidir con las NEXT_PUBLIC_BRAND_* del Vercel de Sushi
  -- Fun de HOY, o la tarjeta cambia de aspecto el día del corte.
  -- ⚠️ Todo lo que dejes en NULL cae al branding de Sushi Service. NULL no es
  --    "sin marca": es "la marca de otro".
  p_brand_name       text := 'Sushi Fun';
  p_brand_short      text := 'Sushi Fun';
  p_brand_tagline    text := 'Programa de Fidelidad';
  p_brand_desc       text := NULL;   -- NULL = texto genérico del sistema (no menciona ninguna marca)
  p_staff_label      text := 'Mesero';
  p_visit_label      text := 'visita';
  p_station_label    text := 'mesa';
  p_whatsapp_link    text := NULL;   -- 'https://wa.me/57XXXXXXXXXX' — el WhatsApp HUMANO del negocio
  p_instagram_url    text := NULL;
  p_google_maps_url  text := NULL;   -- ⚠️ sin esto, el botón de reseñas de Sushi Fun manda a la ficha de Sushi Service
  p_card_bg          text := NULL;   -- gradiente de la tarjeta; NULL = el rojo por defecto del sistema
  p_page_bg          text := NULL;

  -- Operación. Sushi Fun NO usa domicilios (0 mensajes 'delivery', 0 campañas de
  -- domicilio en su historial), así que el webhook queda apagado y no hace falta
  -- delivery_default_city.
  p_delivery_webhook boolean := false;

  -- 🟡 NACE APAGADO, Y ES DELIBERADO. NO LO CAMBIES ACÁ.
  -- Con is_active = false el tenant existe y se puede revisar entero desde el
  -- panel, pero NO lo ve nada que dispare mensajes o check-ins: getTenantByDomain,
  -- getActiveTenants (los crons), getTenantBySlug y getTenantByWhatsappNumber
  -- filtran is_active = true (src/lib/tenant.ts). requireLocationScope no, así que
  -- el dueño de Sushi Fun sí puede entrar a mirar sus números.
  --
  -- POR QUÉ IMPORTA: el Vercel VIEJO de Sushi Fun tiene sus propios crons de
  -- cumpleaños (08:00 UTC) y reactivación (10:00 UTC). Los del despliegue
  -- principal corren 13:00 y 15:00 UTC y, SIN ?tenant=, recorren TODOS los tenants
  -- activos. Con los dos vivos a la vez, los mismos clientes de Sushi Fun reciben
  -- el mismo mensaje DOS veces, desde el mismo número. Naciendo apagado, eso no
  -- puede pasar por accidente: se enciende con 09-ACTIVAR.sql, al final, y solo
  -- después de apagar los crons viejos.
  p_is_active boolean := false;

  -- Sede. Los valores son los que la sede ya tiene en la base de Sushi Fun.
  -- La dirección viene literalmente como 'Actualizar dirección' allá: si sabés la
  -- de verdad, ponela; si no, se deja y se corrige después desde el panel.
  p_sede_name     text    := 'Sede principal';
  p_sede_address  text    := 'Actualizar dirección';
  p_sede_lat      numeric := 6.244203;
  p_sede_lon      numeric := -75.581211;
  p_sede_radius   int     := 20;

  -- ════════════════════ FIN DE PARÁMETROS ════════════════════

  v_config jsonb;
BEGIN
  -- ── Guard: los placeholders de Twilio tienen que estar reemplazados ────────
  IF p_twilio_sid LIKE '<<<%' OR p_twilio_token LIKE '<<<%' OR p_twilio_number LIKE '<<<%' THEN
    RAISE EXCEPTION E'ABORTA: quedaron placeholders <<<…>>> en el bloque de Twilio.\nSin las TRES credenciales propias, los WhatsApp de Sushi Fun saldrian del numero de Sushi Service (ver el recuadro del encabezado).';
  END IF;

  IF p_twilio_sid !~ '^AC[0-9a-fA-F]{32}$' THEN
    RAISE EXCEPTION 'ABORTA: el Account SID "%" no tiene forma de SID de Twilio (AC + 32 hex).', left(p_twilio_sid, 8) || '…';
  END IF;

  -- El numero tiene que llevar el prefijo whatsapp: — es lo que Twilio espera en
  -- `from` (messages.create), y sin el prefijo el envio falla en cada mensaje.
  IF p_twilio_number !~ '^whatsapp:\+[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'ABORTA: el numero "%" debe venir como whatsapp:+57XXXXXXXXXX', p_twilio_number;
  END IF;

  -- Que no sea, por error de copiar y pegar, la cuenta de la matriz.
  IF EXISTS (SELECT 1 FROM tenants WHERE twilio_subaccount_sid = p_twilio_sid) THEN
    RAISE EXCEPTION 'ABORTA: ese Account SID ya esta en la fila de otro tenant. Es la cuenta equivocada.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE twilio_whatsapp_number = p_twilio_number) THEN
    RAISE EXCEPTION 'ABORTA: ese numero de WhatsApp ya es de otro tenant. Es el numero equivocado.';
  END IF;

  -- ── 1. Config de marca ────────────────────────────────────────────────────
  -- jsonb_strip_nulls descarta las claves en NULL: una clave ausente cae al
  -- default del sistema, que es el comportamiento documentado de resolveBranding().
  v_config := jsonb_strip_nulls(jsonb_build_object(
    'brand_name',           p_brand_name,
    'brand_short',          p_brand_short,
    'brand_tagline',        p_brand_tagline,
    'brand_description',    p_brand_desc,
    'staff_role_label',     p_staff_label,
    'visit_label',          p_visit_label,
    'station_label',        p_station_label,
    'whatsapp_link',        p_whatsapp_link,
    'instagram_url',        p_instagram_url,
    'google_maps_url',      p_google_maps_url,
    'card_bg',              p_card_bg,
    'page_bg',              p_page_bg,
    'has_delivery_webhook', p_delivery_webhook
  ));

  -- ── 2. El tenant ──────────────────────────────────────────────────────────
  -- messaging_provider = 'twilio' EXPLÍCITO: Sushi Fun no toca Zernio. Es el
  -- default de la 00036, pero escribirlo deja el hecho a la vista de quien lea
  -- la fila dentro de seis meses.
  INSERT INTO tenants (
    id, slug, name, business_type, config, domain,
    twilio_subaccount_sid, twilio_subaccount_auth_token, twilio_whatsapp_number,
    messaging_provider, is_active, is_demo
  ) VALUES (
    p_tenant_id, p_slug, p_name, 'restaurant', v_config, p_domain,
    p_twilio_sid, p_twilio_token, p_twilio_number,
    'twilio', p_is_active, false
  );

  -- ── 3. La sede principal ──────────────────────────────────────────────────
  -- Mismo patrón que la 00042 para los tenants vivos: slug 'sede-principal',
  -- is_primary = true y el subdominio de la marca DELEGADO a la sede — es lo que
  -- hace que clubsushifun.constelarys.com resuelva a marca + sede sin reimprimir
  -- un solo QR.
  --
  -- ⚠️ UNA SOLA SEDE, Y ES DELIBERADO. En la base de Sushi Fun hay DOS filas en
  --    restaurant_locations, idénticas ('Sede principal', misma lat/lon), creadas
  --    con 5 minutos de diferencia el 2026-08-21: un duplicado, no dos locales.
  --    Nada las referencia allá (esa base no tiene ninguna columna location_id).
  --    Copiar las dos NO sería inocuo: con 2 sedes activas, decideLocationScope()
  --    (location-scope.ts:172-188) deja de conceder alcance de marca al usuario
  --    sin fila en dashboard_user_locations y devuelve 403 — el dueño de Sushi Fun
  --    se quedaría fuera de su propio panel. Con UNA sede, entra sin más.
  INSERT INTO restaurant_locations (
    id, tenant_id, name, address, lat, lon, radius_meters,
    slug, domain, is_primary, sort_order, is_active
  ) VALUES (
    p_sede_id, p_tenant_id, p_sede_name, p_sede_address, p_sede_lat, p_sede_lon, p_sede_radius,
    'sede-principal', p_domain, true, 0, true
  );

  RAISE NOTICE '01: tenant % y su sede principal creados. Dominio: %', p_slug, p_domain;
  IF NOT p_is_active THEN
    RAISE NOTICE '01: el tenant nace APAGADO (is_active=false). Se enciende con 09-ACTIVAR.sql, al final del runbook.';
  END IF;
END $alta$;

-- ───────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────
DO $ver$
DECLARE
  v_tenant uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  v_n      int;
  v_t      record;
BEGIN
  SELECT * INTO v_t FROM tenants WHERE id = v_tenant;
  IF v_t IS NULL THEN
    RAISE EXCEPTION '01 FALLO: no se creo el tenant.';
  END IF;

  -- 🔴 La verificación que importa: las TRES columnas de Twilio, o el envío se
  -- va por la cuenta de Sushi Service. `??` es campo por campo, así que "dos de
  -- tres" no es medio bien: es una mezcla de dos cuentas.
  IF v_t.twilio_subaccount_sid IS NULL
     OR v_t.twilio_subaccount_auth_token IS NULL
     OR v_t.twilio_whatsapp_number IS NULL THEN
    RAISE EXCEPTION E'01 FALLO: Sushi Fun quedo con alguna columna twilio_* en NULL.\nCon NULL, getTwilioClient() cae al env (= Sushi Service) CAMPO POR CAMPO y sus WhatsApp saldrian del numero de otra marca.';
  END IF;

  -- Que ninguna de las tres sea, por accidente, la de la matriz o la de otro tenant.
  SELECT count(*) INTO v_n
    FROM tenants
   WHERE id <> v_tenant
     AND (twilio_subaccount_sid = v_t.twilio_subaccount_sid
          OR twilio_whatsapp_number = v_t.twilio_whatsapp_number);
  IF v_n > 0 THEN
    RAISE EXCEPTION '01 FALLO: las credenciales Twilio de Sushi Fun coinciden con las de otro(s) % tenant(s).', v_n;
  END IF;

  -- Marca propia: sin brand_name, la tarjeta de Sushi Fun dice "Sushi Service".
  IF COALESCE(v_t.config ->> 'brand_name', '') = '' THEN
    RAISE EXCEPTION '01 FALLO: config.brand_name vacio. La tarjeta de los 250 clientes mostraria la marca del entorno (Sushi Service).';
  END IF;

  IF v_t.messaging_provider <> 'twilio' THEN
    RAISE EXCEPTION '01 FALLO: messaging_provider quedo en "%" y debe ser twilio.', v_t.messaging_provider;
  END IF;

  -- Exactamente UNA sede activa, con is_primary y con el dominio delegado.
  SELECT count(*) INTO v_n FROM restaurant_locations WHERE tenant_id = v_tenant AND is_active;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '01 FALLO: Sushi Fun quedo con % sedes activas y debe tener exactamente 1 (con 2+, su dueno recibe 403 en el panel).', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM restaurant_locations
   WHERE tenant_id = v_tenant AND is_primary AND domain = v_t.domain;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '01 FALLO: la sede no quedo is_primary con el dominio de la marca delegado.';
  END IF;

  -- Ni una fila de otra marca tocada.
  SELECT count(*) INTO v_n FROM restaurant_locations WHERE id = 'd6798a6e-40f1-4d1a-91be-5d30770c1448' AND tenant_id <> v_tenant;
  IF v_n > 0 THEN
    RAISE EXCEPTION '01 FALLO: la sede quedo atribuida a otra marca.';
  END IF;

  IF v_t.is_active THEN
    RAISE WARNING 'AVISO: Sushi Fun quedo ACTIVO desde el minuto cero. Si el Vercel viejo sigue con sus crons, los mismos clientes pueden recibir cumpleanos/reactivacion DOS veces. Lo previsto era nacer apagado y encender con el 09.';
  END IF;

  RAISE NOTICE 'OK 01: Sushi Fun existe, con SUS credenciales Twilio, SU marca y UNA sede principal.';
END $ver$;

COMMIT;
