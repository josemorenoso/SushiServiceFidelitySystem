# Usuario admin del cliente — el alta desde el AIOS

> **Qué resuelve:** un cliente recién dado de alta en el AIOS tenía su marca completa
> (subdominio, sedes, premios, WhatsApp) pero **no tenía con qué entrar**. El usuario
> había que crearlo a mano en el Supabase del producto y pegarle el `tenant_id` con un
> `UPDATE` copiado. Con 25 altas antes del 2026-09-10, eso son 25 oportunidades de
> pegarle el id de la marca equivocada al usuario equivocado.
>
> **Desde 2026-09-08** lo hace la tarjeta **"Usuario del panel"** en la ficha de la sede
> del AIOS. Este documento es el contrato de esa ruta y, sobre todo, lo que **nunca** hace.

---

## 1. Qué es "el super usuario del cliente"

En este sistema **no hay una tabla de usuarios del panel**. Un admin de marca es un
usuario de **Supabase Auth** con una sola cosa especial en su `app_metadata`:

```json
{ "tenant_id": "<uuid de la marca>" }
```

Eso es lo que leen `requireTenantId()` ([src/lib/tenant.ts](../../src/lib/tenant.ts)) y las
políticas RLS (`current_tenant_id()`). El `tenant_id` **viaja dentro del JWT**, no se
consulta: por eso un usuario recién creado (o recién modificado) tiene que **iniciar
sesión de cero**. Refrescar la página no alcanza — el token viejo no lo trae.

> ⚠️ **`role: "super_admin"` es otra cosa y no se otorga desde ninguna pantalla.** Ese es
> el operador de Cada1, que ve **todas** las marcas ([src/lib/admin.ts](../../src/lib/admin.ts)).
> El "super usuario" del que habla el cliente es simplemente el admin de SU marca.

## 2. Por qué hay una ruta HTTP y no una función de base

El AIOS habla con el Postgres del producto con el rol restringido `aios_constelarys`
(migración `00035`, v2 endurecida tras code review), y ese rol **no toca `auth.users` a
propósito**. Crear un usuario de Auth no es una fila más: exige la API de GoTrue, que
solo se maneja con la service key.

La decisión (dueño, 2026-09-08) fue **no llevar la service key del producto al AIOS**:

| | Dónde vive | Qué puede hacer quien la tenga |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **solo en el producto** | todo, sobre las 25 marcas |
| `AIOS_ADMIN_PROVISION_SECRET` | producto **y** AIOS (idéntico) | crear un admin de una marca |

Si el AIOS se ve comprometido, lo que se filtra es lo segundo. La alternativa que se
descartó —una función `SECURITY DEFINER` que escribiera `auth.users` y `auth.identities`
a mano— no abría puerto nuevo, pero replicaba el esquema interno de GoTrue: el día que
Supabase lo cambie, el alta se rompe en silencio.

## 3. El contrato

```
POST /api/aios/tenant-admin
Header: x-aios-secret: <AIOS_ADMIN_PROVISION_SECRET>     ← comparación timing-safe
Body:   { "tenant_slug": "...", "email": "...", "password": "..." }
```

| Código | Cuándo |
|---|---|
| `200` | creado, o el usuario ya existía (lo dice `created` y `warnings[]`) |
| `400` | slug/correo con forma inválida, o contraseña de menos de 12 caracteres |
| `401` | secreto ausente o incorrecto |
| `404` | no existe ninguna marca con ese slug |
| `409` | el correo ya es admin de **otra** marca, o es el super-admin |
| `502` | GoTrue o Postgres fallaron (queda en el log con contexto) |
| `503` | **falta `AIOS_ADMIN_PROVISION_SECRET`** — fail-closed, no crea nada |

Respuesta del caso feliz:

```json
{ "ok": true, "created": true, "user_id": "…", "tenant_id": "…", "tenant_slug": "…",
  "tenant_name": "…", "login_url": "https://…/login",
  "scope_row_created": false, "active_locations": 1, "warnings": [] }
```

## 4. Lo que la ruta NUNCA hace

1. **No otorga `super_admin`.** El cuerpo no tiene campo `role`: el `app_metadata` que
   escribe es `{ tenant_id }` y nada más. Lo vigila
   [`tests/unit/aios-provision.test.ts`](../../tests/unit/aios-provision.test.ts).
2. **No reatribuye un usuario de una marca a otra.** Si el correo ya tiene `tenant_id` y
   es distinto, responde `409` y no toca nada. Es el principio que no se negocia, aplicado
   a la puerta de entrada.
3. **No cambia contraseñas.** Si el correo ya existe, la contraseña que mandó el AIOS se
   ignora y la respuesta lo dice. Recuperarla es "olvidé mi contraseña" en el panel del
   cliente.
4. **No atiende sin secreto configurado.** Sin la variable responde `503`. Una ruta que
   crea usuarios con marca no puede tener un modo "abierta porque falta la env var".

## 5. El alcance de sedes, y por qué a veces crea una fila

`decideLocationScope()` ([src/lib/location-scope.ts](../../src/lib/location-scope.ts)) le da
alcance de marca a un usuario **sin fila en `dashboard_user_locations`** solo mientras la
marca tenga **una** sede activa: con una sola, "la marca" y "mi sede" son el mismo conjunto
de filas. Con **dos o más** la ausencia de fila es ambigua y el panel responde **403**.

Por eso la ruta cuenta las sedes activas y, si son 2+, inserta la fila `role='brand'`
(`location_id` NULL). No es un extra: es lo que evita que el cliente de una marca con dos
locales entre el primer día y reciba un 403.

## 6. Cómo se ve en el AIOS

Ficha de la sede → tarjeta **"Usuario del panel"**
([`TenantAdminSection.tsx`](../../Level%202.0/aios-constelarys/src/components/sites/TenantAdminSection.tsx)):

- Correo del cliente (viene precargado con `contact_email` del propietario).
- Contraseña **opcional**: vacío = el AIOS genera una de 20 caracteres sin `l/1/I` ni
  `O/0`, porque esto se dicta por teléfono.
- La credencial se muestra **una sola vez**, con botón de copiar. **No se guarda** en
  ninguna tabla del AIOS ni en ningún log.

Si el AIOS no tiene `PRODUCT_WEBHOOK_BASE_URL` + `AIOS_ADMIN_PROVISION_SECRET`, la tarjeta
se ve igual, explica que está apagada y enseña el SQL manual ya rellenado con el slug.

## 7. El camino a mano (respaldo, y para arreglar un caso raro)

```sql
-- 1) Supabase del PRODUCTO → Authentication → Users → Add user
--    correo + contraseña, marcando "Auto Confirm User".
-- 2) SQL Editor:
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('tenant_id', t.id::text)
FROM tenants t
WHERE t.slug = '<slug-de-la-marca>'
  AND u.email = '<correo@delcliente.com>';

-- 3) SOLO si la marca tiene 2+ sedes activas:
INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role)
SELECT u.id, t.id, NULL, 'brand'
FROM auth.users u, tenants t
WHERE u.email = '<correo@delcliente.com>' AND t.slug = '<slug-de-la-marca>';
```

**Rollback de un alta:** borrar el usuario en Authentication → Users (la fila de
`dashboard_user_locations` se va sola: `ON DELETE CASCADE`).

## 8. Configuración

| Variable | Dónde | Nota |
|---|---|---|
| `AIOS_ADMIN_PROVISION_SECRET` | **producto** y **AIOS** | la MISMA cadena en los dos. Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Rotarla = cambiarla en los dos Vercel a la vez |
| `PRODUCT_WEBHOOK_BASE_URL` | AIOS | ya existía (webhook de Zernio). La base pública del producto, sin barra final |

---

**Archivos:** [`src/app/api/aios/tenant-admin/route.ts`](../../src/app/api/aios/tenant-admin/route.ts) ·
[`src/lib/aios-provision.ts`](../../src/lib/aios-provision.ts) (las piezas puras) ·
AIOS: `src/lib/product-auth.ts`, `src/lib/actions/tenant-admin.ts`,
`src/components/sites/TenantAdminSection.tsx`.
