# Feature: Infraestructura de pruebas

**Agregado:** v2.13.0 — 2026-08-30
**Comandos:** `npm test` · `npm run test:unit` · `npm run test:db` · `npm run test:watch`
**Ver también:** `docs/features/send-governance.md`, `METODO_MAESTRO_LUISRAI.md` § "Criterio de término universal"

---

## Por qué existe

Hasta el 2026-08-30 el proyecto **no tenía ninguna prueba**: ni vitest, ni jest, ni un solo archivo
de test; `package.json` solo exponía `lint` y `build`. Dos comentarios del código —
[`src/constants/messaging.ts:11`](../../src/constants/messaging.ts) y el bloque 2 de
`00037_send_governance.sql` — afirmaban que existía un test `message-class-map.test.ts` que
verificaba que el mapa de clases no divergiera entre TypeScript y SQL. **No existía.**

El detonante concreto fue el spec de gobernanza de envío, §9:

> `reserve_send_slot()` bajo concurrencia: 20 llamadas en paralelo con `limite=10` conceden
> **exactamente** 10. Esta es la prueba más importante del spec.

Esa función es lo único que impide que una campaña se pase del límite diario de Meta y le degrade
al restaurante **su línea principal de atención al cliente**. Estaba razonada, comentada y
commiteada — pero no demostrada.

## La restricción que define el diseño

Lo que hay que probar es un `pg_advisory_xact_lock`. Un lock solo se puede demostrar con varias
**conexiones** peleando por él al mismo tiempo. Eso descarta de entrada:

| Opción | Por qué no sirve |
|---|---|
| `pg-mem` | No implementa advisory locks. |
| PGlite | Un solo backend, una sola conexión: el lock nunca compite. |
| Un mock | Probaría el mock, no la función. |
| Docker + Postgres | **No hay Docker en la máquina de desarrollo.** Tampoco `psql` ni Supabase CLI. |
| El Supabase real | Es producción: el mismo proyecto donde opera Sushi Service. Insertar reservas de prueba le consume su ventana real de 24 h. Y el pooler de transacciones podría serializar las 20 llamadas por su cuenta, haciendo que la prueba pase por la razón equivocada. |

**La solución: `embedded-postgres`.** Descarga un binario real de Postgres como dependencia de npm y
lo arranca en un puerto local. Cero infraestructura, cero permisos de administrador, y aun así es
Postgres de verdad, con conexiones de verdad. Arranca en ~2 s.

## Cómo funciona

```
vitest.config.mts
  └── globalSetup: tests/setup/global-postgres.ts
        1. arranca Postgres en localhost:55432
        2. aplica tests/setup/bootstrap.sql   (el "trozo de Supabase")
        3. aplica TODAS las migraciones en orden
        4. publica la cadena de conexión con project.provide('postgres')
        5. al terminar, para el servidor y borra el directorio de datos
```

Las migraciones se aplican **de verdad, tal cual están en el repo**. Eso significa que la suite
también valida la migración que el dueño va a pegar en el SQL Editor: si `00038` tuviera un error de
sintaxis, `npm test` falla nombrando el archivo.

### `tests/setup/bootstrap.sql` — el trozo de Supabase

Las 37 migraciones originales dependen de sorprendentemente pocos objetos propios de Supabase. El
bootstrap los recrea antes de `00001`:

| Objeto | Quién lo necesita | Por qué |
|---|---|---|
| `auth.role()` | `00001:62` y 23 usos más | Aunque `00026` borra después todas esas políticas, la expresión tiene que **parsear** en el `CREATE POLICY`. |
| `auth.jwt()` | `00024:36` y `:44` | La dependencia dura: `current_tenant_id()` e `is_super_admin()` son `LANGUAGE sql`, y Postgres **sí** valida el cuerpo de una función sql al crearla. |
| `auth.users` | `00028:56` | Único uso en toda la cadena. |
| `storage.buckets` / `storage.objects` | `00012:152-215` | Único archivo que toca storage. |
| Roles `anon` / `authenticated` | `00037:533` | Único sitio donde se usan como roles reales. |

**No** hacen falta: `auth.uid()` (cero usos), `pgcrypto`/`uuid-ossp` (`gen_random_uuid()` es core
desde PG 13), `pg_cron`, `pg_net`, `vault`, `realtime`, ni el rol `service_role`.

> ⚠️ **`initdbFlags: ['--encoding=UTF8', '--locale=C']` no es opcional en Windows.** Sin eso, initdb
> hereda la configuración regional del sistema y crea la base en WIN1252; las migraciones llevan
> cajas de comentarios con caracteres Unicode (`═`, `─`, tildes) y **las 37 fallan** con
> `character with byte sequence 0xe2 0x95 0x90 ... has no equivalent in encoding "WIN1252"`.
> Supabase es UTF8, así que esto además iguala producción.

## Qué cubre hoy

| Archivo | Qué fija |
|---|---|
| `tests/unit/message-class-map.test.ts` | El espejo TypeScript ↔ SQL del mapa de clases. **Es el test que dos comentarios daban por existente.** Sin base de datos: lee la migración como texto. |
| `tests/db/reserve-send-slot.test.ts` | La reserva atómica: concurrencia, destinatarios únicos, ventana rodante, reserva transaccional, frenos de línea, límite desconocido. |
| `tests/db/line-budget.test.ts` | La fórmula del presupuesto: piso, p95, tope del 50 %, qué cuenta y qué no para el p95. |
| `tests/db/send-queue.test.ts` | La cola de goteo: encolado idempotente, reclamo atómico, arriendos, vencimiento, round-robin. |
| `tests/db/permisos.test.ts` | Que ninguna función `SECURITY DEFINER` quede ejecutable por `anon` o `authenticated`. |
| `tests/unit/brand-palette.test.ts` | **Identidad visual (§5/§6).** Que un tenant sin color propio no cambie ni un píxel · que un color claro no deje el CTA ilegible ni el QR sin leer · que basura en `config` caiga al default en vez de tumbar una pantalla pública. |
| `tests/unit/tenant-config-paths.test.ts` | La whitelist de `tenants.config`: que no deje pasar `brand_name` ni `integrations.*`, las validaciones por tipo, y el espejo de ids de tema/tamaño con `qr-poster.ts`. |
| `tests/db/identidad-visual.test.ts` | `merge_tenant_config_deep()` (00048): que guardar un color no borre el logo ni las integraciones, que escribir la marca de un tenant no toque la del otro, y **el control negativo** — la misma escritura con el merge plano sí borra el logo. |

> Esta tabla no lista los 18 archivos: `npx vitest run` es la fuente de verdad del número
> (hoy **18 archivos / 332 tests**). Acá van los que fijan una decisión que cuesta caro revertir.

### El control negativo

La prueba de concurrencia viene con una hermana obligatoria:

> `CONTROL: la misma carga SIN el advisory lock se pasa del límite`

Crea una copia de `reserve_send_slot()` **sin** el `pg_advisory_xact_lock` y exige que conceda **más
de 10**. Es la evidencia de que el escenario es realmente concurrente: sin ella, "exactamente 10"
saldría igual si algo estuviera serializando las llamadas por detrás, y la prueba principal no
demostraría nada.

**Si el control empieza a fallar, la prueba principal deja de ser válida.** No lo borres: arréglalo.

## Lo que estas pruebas NO cubren

Decirlo importa tanto como lo que sí cubren.

1. **Las políticas de RLS.** Las pruebas corren como superusuario, que se salta RLS por completo.
   Lo que se valida es el **esquema** y las **funciones**. Para probar una política hay que hacer
   `SET ROLE authenticated` + `SET LOCAL request.jwt.claims` explícitamente — el stub de `auth.jwt()`
   del bootstrap está escrito para permitirlo, pero todavía no hay pruebas que lo usen.
2. **PostgREST.** Se habla Postgres directo, no RPC por HTTP. Una diferencia de serialización entre
   `supabase-js` y el driver `pg` no se vería aquí.
3. **La versión.** Local corre Postgres 18; Supabase corre 15/17. Nada de lo que usan `00037`/`00038`
   (advisory locks, `percentile_cont`, jsonb, índices únicos parciales, `FOR UPDATE SKIP LOCKED`)
   cambió entre esas versiones, pero la diferencia existe.
4. **La lógica de negocio del drenador.** `src/app/api/cron/queue-drain/route.ts` necesita el cliente
   de Supabase y un proveedor de mensajería; solo se prueba la capa SQL sobre la que se apoya.
5. **Todo el frontend.** No hay ninguna prueba de componentes.

## Convenciones

- **Un tenant desechable por prueba**, creado con `createTestTenant()` y borrado en el `afterEach`.
  No se comparte estado: los archivos corren en procesos separados (`pool: 'forks'`).
- **`dropTestTenant()` limpia en orden**, y `tenant_wallet_transactions` va **primero**: insertar un
  `message_log` con `twilio_sid` dispara el trigger de billetera de `00033`, que crea una fila de
  débito, y el `ON DELETE RESTRICT` bloquea el borrado del tenant. (Se descubrió justamente así, en
  la primera corrida de la suite.)
- **Calibrar el presupuesto** para que dé un número exacto: con un tenant nuevo no hay
  `message_logs`, así que el p95 es 0 y la fórmula se reduce a
  `reserva = LEAST(piso, floor(limite * max_pct/100))`. Para un presupuesto de campaña de 10:
  `{ messagingDailyLimit: 20, reserveFloor: 10, reserveMaxPct: 50 }`.
- **Nada de `Date.now()` para generar teléfonos**: usa `phoneAt(i)`, que es estable y legible en los
  mensajes de fallo.

## Cambios de configuración que hicieron falta

`tsconfig.json` y `eslint.config.mjs` ahora excluyen `Level 2.0/` explícitamente.

No es cosmético. `tsconfig.json` declara `exclude: ["node_modules"]`, lo cual **reemplaza** la
exclusión por defecto de TypeScript y solo ancla el `node_modules` de la raíz; con
`include: ["**/*.ts"]`, el proyecto anidado `Level 2.0/aios-constelarys` (repo SEPARADO, en
`.gitignore`) y su `node_modules` entero caían dentro del proyecto raíz. Consecuencias reales:

- **`npm run build` fallaba en local** con `Cannot find module '@/lib/actions/clients'` — un archivo
  del AIOS, no de este proyecto. Solo compilaba en Vercel porque allí esa carpeta no existe.
- `npm run lint` reportaba **11.727 problemas**, casi todos ajenos. Ahora reporta 43.
- Un runner de tests con globs por defecto habría intentado correr los tests internos de `zod`.
