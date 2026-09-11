# Feature — Borrar una marca desde el AIOS (y deshacer WhatsApp, y recargar)

> Migración **00064** · endpoint `POST /api/aios/tenant-delete` · AIOS v1.11.0.
> Hermana de [`alta-usuario-admin.md`](alta-usuario-admin.md): misma llave, misma razón de ser.

## Qué

Tres cosas que el AIOS no podía hacer porque su rol Postgres (`aios_constelarys`, 00035 v2) no
tiene DELETE, UPDATE ni INSERT directo sobre nada — a propósito:

| Función (00064) | Qué hace | Quién la llama |
|---|---|---|
| `aios_delete_tenant(slug, dry_run)` | Borra **toda** tabla con `tenant_id` y la fila de `tenants`, en una transacción. `dry_run = true` (default) solo devuelve el inventario. | `POST /api/aios/tenant-delete` (service role, después de borrar los usuarios de Auth) y el rol del AIOS |
| `aios_deactivate_whatsapp(slug)` | El espejo de `aios_activate_whatsapp`: `messaging_provider` vuelve a `twilio`, `zernio_*` a NULL, `quality_rating` a `unknown`, y se retiran los `*_template_sid` que el AIOS sembró. Idempotente. | El AIOS, «Reiniciar el alta de WhatsApp» |
| `aios_wallet_topup(slug, cop, nota)` | `topup` en `tenant_wallet_transactions` de un tenant **Twilio**. Rechaza Zernio (billetera apagada, 00037), cero y más de $5.000.000. | El AIOS, «Recargar mensajes» en Sistema de la sede |

## Para quién

El operador de Cada1, desde el AIOS. Ningún cliente ve nada de esto.

## Los candados del borrado

1. **El tenant puente no se borra.** La 00028 dejó `tenant_id` con DEFAULT al id de Sushi Service
   en 18 tablas (la 00030 nunca se aplicó): la función lee `information_schema.columns` y si el
   id aparece en un `column_default`, se niega (`tenant_puente`).
2. **Más de 100 comensales, no.** Una marca así está viva; se borra a mano, con la migración a
   la vista (`tenant_demasiado_grande`).
3. **`dry_run` por defecto**, y borrar exige en el cuerpo del endpoint `dry_run: false` **y**
   `confirm_slug` igual al slug (`parseTenantDeleteBody`, con tests).
4. **Todo o nada.** El borrado va en pasadas: cada tabla se intenta y la que choque con una FK
   `RESTRICT` (00025) espera a la siguiente pasada. Si después de diez queda algo,
   `borrado_incompleto` y la transacción entera se deshace.

**Orden en el endpoint:** inventario → usuarios de Auth (`auth.admin.deleteUser`, nunca el
super-admin) → `aios_delete_tenant(…, false)`. Si los usuarios fallan, la marca sigue entera y se
reintenta. Si la función falla después, los usuarios ya no están — pero sin marca no entraban a
nada, y crearlos de nuevo es un click en el AIOS.

**Lo que NO se borra:** `auth.users` desde la función (el rol no llega; lo hace el endpoint) y los
archivos del bucket `event-media` de esa marca (quedan huérfanos, sin daño).

## Qué NO hacer

- No abrir `aios_delete_tenant` a `anon`/`authenticated`: nace ejecutable por PUBLIC como toda
  SECURITY DEFINER y la migración lo revoca; la verificación final lo comprueba.
- No subir el umbral de 100 «para borrar una marca real más rápido». Esa marca se borra con SQL.
- No llamar a `aios_deactivate_whatsapp` sobre un tenant nacido en Twilio con sids propios: no
  aplica (devuelve `reset: false`), pero tampoco tiene sentido.

## Cómo se verifica

1. Aplicar la 00064 en Supabase: el bloque final imprime `00064: OK.` o revienta diciendo qué falta.
2. Con la 00064 aplicada y `AIOS_ADMIN_PROVISION_SECRET` en los DOS Vercel, en el AIOS abrir un
   propietario de prueba → «1. Ver qué se borraría» devuelve comensales, filas por tabla y usuarios.
3. Escribir el nombre → «Borrar todo» → `/clientes` muestra el resumen. En Supabase:
   `SELECT 1 FROM tenants WHERE slug = '<slug>'` no devuelve nada; el correo del admin ya no está
   en Authentication → Users.
4. `npx vitest run tests/unit/aios-provision.test.ts` — los dos candados del cuerpo.

**NO verificado en el flujo real (2026-09-11):** ninguna de las tres funciones corrió contra
Supabase todavía; la 00064 está escrita, no aplicada.
