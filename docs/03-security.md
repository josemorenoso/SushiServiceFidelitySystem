# Seguridad — RestaurantQR

## Autenticación
- **Método:** Supabase Auth (email + password) para administradores del dashboard
- **Flujo:** Login → Supabase genera JWT → se almacena en cookies HttpOnly vía `@supabase/ssr`
- **Sesión:** Manejo server-side con middleware de Next.js que refresca tokens automáticamente
- **Rutas públicas:** `/check-in` (no requiere auth — acceso por QR del restaurante), `/tarjeta` (tarjeta digital del cliente, identificado solo por celular — expone nombre + puntos + visitas, equivalente a `/api/check-in/status`)
- **Rutas protegidas:** `/dashboard/*` (requieren login de administrador)

## Autorización
- **Roles:** Solo un rol: `admin` (administradores del restaurante)
- **Clientes:** No tienen cuenta de usuario — se identifican solo por número de celular. El número de celular actúa como identificador público (no como credencial secreta); los datos expuestos (nombre, puntos, visitas) son equivalentes a los que ya retorna `/api/check-in/status`
- **RLS:** Activado en todas las tablas. Las políticas limitan acceso según `auth.uid()` para admins
- **API Routes:** Los webhooks validan origen (números autorizados). Los cron jobs validan `CRON_SECRET`

## Helpers de RLS y el rol del AIOS Constelarys

Las policies multitenant se apoyan en dos funciones de la 00024 que leen el JWT:
`current_tenant_id()` e `is_super_admin()`. Las dos llaman a `auth.jwt()`, y ahi hay
una trampa que ya se cobro una vez.

El rol `aios_constelarys` (migracion 00035 v2) **no tiene USAGE sobre el schema `auth`**
—a proposito: es un rol de solo lectura para un sistema que corre en otra
infraestructura—. Como tampoco es dueno de las tablas ni tiene BYPASSRLS, sus `SELECT`
**si** evaluan las policies. Y sobre `tenants` conviven dos permisivas, que Postgres
combina con OR:

```sql
aios_constelarys_select_tenants  USING (true)              -- 00035 v2
super_admin_all_tenants          USING (is_super_admin())  -- 00024
```

**Que la primera sea `true` no salva a la segunda.** Postgres no garantiza cortocircuitar
el OR: al evaluar `is_super_admin()` en el contexto del rol que llama, `auth.jwt()`
revienta con `42501 permission denied for schema auth` y se cae el `SELECT` entero,
aunque la otra policy lo habria permitido.

La solucion es `SECURITY DEFINER` con `search_path` fijo, versionada en la **migracion
00040**. Es segura porque `auth.jwt()` lee `current_setting('request.jwt.claims')`, un
ajuste de **sesion** y no un permiso del rol: correr como `postgres` devuelve exactamente
los mismos claims del que llama. La funcion sigue respondiendo por el JWT del usuario.

### Reglas al tocar esto

1. **`search_path` fijo es obligatorio** en toda funcion `SECURITY DEFINER`. Sin el,
   quien pueda crear objetos cuela un `jwt()` propio en un schema anterior del path y
   secuestra la funcion.
2. **No revoques el EXECUTE a PUBLIC** de `is_super_admin()`. Las policies la invocan en
   el contexto de `anon` y `authenticated`: un REVOKE deja sin leer a la app entera.
3. **Nunca se arregla un 42501 ampliando GRANTs al rol del AIOS.** El arreglo va siempre
   en la funcion. Darle USAGE sobre `auth`, o BYPASSRLS, tira abajo el doble candado que
   la 00035 v2 monto a proposito (GRANT por columna **mas** RLS).

### Deuda abierta

`current_tenant_id()` tiene el mismo defecto y **sigue sin arreglar** (verificado el
2026-09-01 contra produccion: devuelve 42501). Hoy no rompe nada porque las dos unicas
tablas que el AIOS lee —`tenants` y `tenant_wallet_transactions`— tienen policies que
solo llaman a `is_super_admin()`. Pero el patron dominante del resto del esquema es
`USING (tenant_id = current_tenant_id() OR is_super_admin())`: **el dia que alguien le
agregue a una de esas tablas una policy `aios_constelarys_select_*` para que el panel la
lea, la lectura muere con el mismo 42501 silencioso.** Cambiarlo altera como se evalua el
RLS de cada tabla multitenant, asi que es una decision del dueno con su propia
verificacion, no un efecto colateral.

## Variables de Entorno
| Variable | Exposición | Protección |
|----------|-----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente (pública) | Solo lectura vía RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente (pública) | Limitada por políticas RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | NUNCA exponer al cliente |
| `TWILIO_ACCOUNT_SID` | Solo servidor | En .env.local |
| `TWILIO_AUTH_TOKEN` | Solo servidor | En .env.local |
| `TWILIO_WHATSAPP_NUMBER` | Solo servidor | En .env.local |
| `CRON_SECRET` | Solo servidor | Valida peticiones a /api/cron/* |

## Validaciones de Entrada
- **Número de celular:** Formato colombiano validado (10 dígitos, prefijo 3)
- **Nombre:** Sanitizado, longitud mínima 2 caracteres
- **Fecha de nacimiento:** Formato válido, no futura
- **Webhook de domicilios:** Valida que el número remitente esté en `authorized_numbers`
- **Cron jobs:** Valida header `Authorization: Bearer {CRON_SECRET}`
- **Webhook de Zernio** (`/api/webhook/zernio`, tenants `messaging_provider='zernio'`): firma HMAC-SHA256
  obligatoria (`X-Zernio-Signature`, alias `X-Late-Signature`) contra `ZERNIO_WEBHOOK_SECRET`, comparación
  en tiempo constante. Zernio trata su propia firma como OPCIONAL (solo firma si se configuró un
  `secret` al crear el webhook) — este proyecto la exige SIEMPRE: sin header o sin
  `ZERNIO_WEBHOOK_SECRET` configurado, se rechaza con 401 en vez de aceptar el webhook sin firmar. Ver
  `src/lib/zernio/webhooks.ts` y `docs/features/zernio-messaging.md`.

## Rate Limiting

| Ruta | Límite | Mecanismo |
| ---- | ------ | --------- |
| `POST /api/check-in` | lookup 30/min, register 5/h, checkin 20/min por IP | `rateLimit()` en-memoria |
| `GET /api/check-in/status` | 40/min por **teléfono** | `rateLimit()` en-memoria (anti-enumeración) |
| `GET /api/public/customer-card` | 30 req/min por IP | `rateLimit()` en-memoria |
| `GET /tarjeta` (SSR) | 30 req/min por IP | `rateLimit()` al inicio del Server Component |
| `POST /api/webhook/delivery` | 60/min por IP | `rateLimit()` en-memoria |

> **`/api/check-in/status` se limita por teléfono, no por IP**, a propósito: el celular del cliente hace polling cada 5s (~12/min) mientras espera al mesero, y varios clientes comparten el WiFi del local o el NAT del operador móvil. Limitar por IP rompería el polling legítimo; limitar por teléfono bloquea la enumeración de la base (probar números secuenciales para extraer nombre/puntos/visitas) sin afectar el uso real.

> El rate-limit en memoria no se comparte entre instancias de Vercel (serverless). Para producción a escala real, migrar a Upstash Redis. Para el MVP (3 restaurantes, ~100 check-ins/día) es suficiente como barrera anti-abuse.

## Reglas INVIOLABLES
- NUNCA hardcodear credenciales en el código
- NUNCA exponer `SUPABASE_SERVICE_ROLE_KEY` en el cliente
- NUNCA desactivar RLS sin autorización explícita
- NUNCA hacer deploy sin checklist de seguridad
- SIEMPRE validar input en servidor (no confiar en cliente)
- SIEMPRE usar tipos TypeScript para prevenir inyección
- SIEMPRE sanitizar datos de WhatsApp antes de guardar en DB
- SIEMPRE validar origen de webhooks (números autorizados)
