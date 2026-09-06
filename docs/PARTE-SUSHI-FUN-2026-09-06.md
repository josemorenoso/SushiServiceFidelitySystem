# Parte — Preparación de la absorción de Sushi Fun

**Fecha:** 2026-09-06 · **Rama:** `feat/absorber-sushi-fun` · **Nada se ejecutó contra ninguna base viva.**

> Este parte dice, sin optimismo, qué quedó **verificado**, qué es **supuesto**, y qué **preguntas**
> hay que responder antes de correr nada.
> El paso a paso está en [`RUNBOOK-ABSORBER-SUSHI-FUN.md`](RUNBOOK-ABSORBER-SUSHI-FUN.md).

---

## 1. Lo primero que pediste comprobar: **el plan NO se cae**

> *"Comprobá si el CAMINO DE ENVÍO también resuelve credenciales por tenant, o si envía siempre con
> la cuenta matriz del `.env`."*

**Resuelve por tenant.** `sendTemplateMessage()` llama a `getTwilioClient(tenant)`
([`whatsapp.service.ts:88-96`](../src/services/whatsapp.service.ts#L88-L96)), que lee
`tenant.twilio_subaccount_sid`, `…_auth_token` y `…_whatsapp_number` de la fila del tenant y con
ellos construye el cliente y el `from`. Una cuenta independiente entra igual que una subcuenta.
El tipo `Tenant` incluso lo documenta: *"sea una subcuenta real […] o una cuenta separada (Sushi
Fun). El código las trata igual."* **Seguimos adelante.**

**Pero encontré dos cosas peores que la que temías, y las dos son silenciosas.**

### 1.a · El `??` es campo por campo, no todo-o-nada

`getTenantTwilioCredentials()` (el del dashboard) exige SID **y** token juntos antes de usar los del
tenant. **`getTwilioClient()` no hace esa comprobación**: cada uno de los tres campos cae al entorno
por su cuenta. Llenar dos de tres produce un envío que **mezcla dos cuentas de Twilio**.

### 1.b · Hoy las tres columnas de Sushi Fun están en NULL — y allá eso es lo correcto

Su propia `00028_seed_sushi_fun.sql` lo dice explícitamente: las dejan en NULL **a propósito**,
porque en su despliegue el `.env` *es* el de Sushi Fun. En el despliegue principal el `.env` es el
de **Sushi Service**. La misma fila, sin cambiar un bit, pasa de correcta a fuga.

**Lo mismo con la marca:** `resolveBranding()` también cae campo por campo a las
`NEXT_PUBLIC_BRAND_*` del entorno. El `config = '{}'` de Sushi Fun le pondría **"Sushi Service" en
la tarjeta a sus 250 clientes**.

**Cómo quedó cerrado:** el `01` **aborta** si falta cualquiera de las tres columnas de Twilio o si
`config.brand_name` viene vacío, y el `08` y el `09` lo vuelven a comprobar. Los tres rechazos están
**probados en el ensayo**, no solo escritos.

---

## 2. Verificado — hechos, no supuestos

### 2.a · Tuve acceso de lectura al Supabase de Sushi Fun

Usaste las credenciales que dejaste. **Solo hice GET por PostgREST; no escribí una sola fila en
ninguna de las dos bases.** Eso convirtió en hecho casi todo lo que el encargo daba por supuesto.

### 2.b · El inventario real (2026-09-06 01:41)

**22 tablas**, no 15: la TANDA 0 del commit `a1ba505` **sí se corrió**. `restaurant_locations`,
`reward_redemptions` e `imported_contacts` existen. El encargo decía "le faltan 3 de las 18 tablas";
**ya no es cierto**.

| Tabla | Filas | | Tabla | Filas |
|---|---:|---|---|---:|
| customers | **250** | | campaign_messages | 237 |
| visits | **268** | | message_logs | **193** (91 con `twilio_sid`) |
| point_transactions | **268** | | review_events | 68 |
| campaigns | 93 | | admin_settings | 24 |
| reward_tiers | 6 | | staff_devices | 4 |
| rewards | 3 | | authorized_numbers | 2 |
| restaurant_locations | **2** ⚠️ | | staff_users | 1 |
| mystery_box_global_caps | 1 | | tenants | 1 |
| **reward_grants** | **0** | | **reward_redemptions** | **0** |
| **mystery_box_results** | 0 | | imported_contacts / campaign_rewards / restaurant_events | 0 |

**Total a trasladar: 1.418 filas.**

**Premios: Sushi Fun nunca otorgó ni redimió uno.** Las tres tablas están en cero. La feature de
premios entera es historia vacía.

### 2.c · Lo que NO tiene destino

- **Billetera prepagada**: correcto, no tiene la 00027 ni la 00033 y **no hay ningún dato que
  mover**. `tenant_wallet_transactions` no existe allá. Su billetera en el principal nace en cero,
  con `price_per_message_cop` en el default de 100 COP → **pregunta 4**.
- **Nada más queda huérfano.** Las 22 tablas del origen tienen destino en el principal.

### 2.d · Lo que el destino tiene y el origen no

`send_queue`, `send_reservations`, `consent_events`, `line_health_snapshots`, `message_class_map`
(00037/00038), `template_versions` (00039), `dashboard_user_locations` (00045) y **todas las
columnas `location_id`** (00041–00045). Sushi Fun entra con esas tablas **vacías**, que es lo
correcto: son estado vivo, no historia. Consecuencia visible → **pregunta 5**.

### 2.e · Los UUID se conservan enteros. Cero remapeo.

El `tenant_id` de Sushi Fun ya es un UUID fijo — `b2c3d4e5-f6a7-8901-bcde-f23456789012` — distinto
del de Sushi Service (`a1b2c3d4-…`). Revisé los únicos dos UUID escritos a mano en las 46
migraciones: no chocan. Todos los demás salen de `gen_random_uuid()` en los dos proyectos.
**Ninguna FK se remapea y no hay tabla de equivalencias porque no hace falta.**

### 2.f · `customers_phone_tenant_key` — **confirmado, no asumido**

Es `UNIQUE (phone, tenant_id)` (`00028_seed_sushi_service.sql:68`). Y el ensayo lo **probó**:
insertó un celular de Sushi Fun bajo otra marca en el mismo Postgres y **entró sin colisionar**.
Lo mismo vale para `authorized_numbers`, `staff_users` y `admin_settings` (PK `(key, tenant_id)`).

### 2.g · Tres trampas que encontré y que el encargo no listaba

1. **El trigger de billetera cobra el historial.** `trg_debit_wallet` (00033) dispara `AFTER INSERT`
   sobre `message_logs`. De las 193 filas, **91 traen `twilio_sid`** → cargar el historial le
   debitaría a Sushi Fun 91 mensajes que **ya pagó en su propia cuenta de Twilio**. El guard
   `v_price IS NULL` no salva: `price_per_message_cop` es `NOT NULL DEFAULT 100`.
   → El `07` desactiva y reactiva el trigger **dentro de la misma transacción**, y el `08` verifica
   que la billetera quedó en 0 movimientos y que el trigger volvió.

2. **Las dos `restaurant_locations` duplicadas son una trampa de permisos.** Son idénticas, creadas
   con 5 minutos de diferencia el 2026-08-21. Copiar las dos daría 2 sedes activas, y con 2 sedes
   `decideLocationScope()` ([`location-scope.ts:172-188`](../src/lib/location-scope.ts#L172-L188))
   **deja de conceder alcance de marca** al usuario sin fila en `dashboard_user_locations` y
   devuelve **403**: el dueño de Sushi Fun se quedaría fuera de su propio panel el día uno.
   → El `01` crea **una** sola, y el `08` verifica que sea exactamente una.

3. **Doble envío por crons.** El Vercel viejo de Sushi Fun tiene sus propios crons de cumpleaños
   (08:00 UTC) y reactivación (10:00 UTC). Los del principal corren 13:00 y 15:00 y, **sin
   `?tenant=`, recorren todos los tenants activos**. Con los dos vivos, los mismos clientes reciben
   el mismo mensaje dos veces desde el mismo número.
   → El tenant **nace con `is_active = false`** y se enciende al final con el `09`, después de
   apagar los crons viejos. Verifiqué que `is_active=false` es un estado "aparcado" de verdad:
   `getTenantByDomain`, `getActiveTenants`, `getTenantBySlug` y `getTenantByWhatsappNumber` filtran
   por él, pero `requireLocationScope` no — así que el dueño puede entrar a revisar antes de abrir.

### 2.h · El ensayo completo, en un Postgres real

`node scripts/probar-absorcion-sushi-fun.mjs` levanta un Postgres desechable, aplica el bootstrap y
**las migraciones 00001–00045** (el estado que tendrá producción mañana, sin la 00046) y corre los
nueve archivos más el rollback. **Todo en verde**: 1.418 filas, cero cruces de marca, los tres
rechazos del `01` funcionando, idempotencia, y un rollback que no deja rastro y tras el cual el
pre-vuelo vuelve a dar OK.

Lo corrí **también con la 00046 aplicada** (`HASTA=00046 node scripts/probar-absorcion-sushi-fun.mjs`):
verde igual. Da lo mismo si para mañana decidiste aplicar la de §19 o no.

---

## 3. Lo que sigue siendo **supuesto**

| # | Supuesto | Riesgo si me equivoco | Cómo se confirma |
|---|---|---|---|
| S1 | El SID de Twilio de Sushi Fun es el de `.env.sushifun` (`AC04707046…`) y **ese token sigue siendo válido** | Todos sus envíos fallan con 401 | Abrir console.twilio.com de esa cuenta. El `01` valida la forma, no que funcione |
| S2 | **No sé cuál es su número de WhatsApp.** No está en el repo ni en su base | Sin él no se puede llenar la 3ª columna → **el `01` aborta** | Twilio → Messaging → Senders |
| S3 | **No sé sus `NEXT_PUBLIC_BRAND_*` reales.** Puse `Sushi Fun` / `Programa de Fidelidad` de mi cosecha | La tarjeta cambia de aspecto el día del corte | Vercel viejo → Settings → Environment Variables |
| S4 | **No sé su URL de reseñas de Google.** Queda NULL | El botón de reseñas de Sushi Fun manda a **la ficha de Sushi Service** | Misma pantalla de Vercel |
| S5 | `clubsushifun.constelarys.com` es el dominio correcto | El DNS no resuelve | Lo decidió el plan MASTER del 2026-07-05 §4.B.4; falta confirmar que el CNAME existe |
| S6 | Sushi Fun **no usa domicilios** (0 mensajes `delivery`, 0 campañas de domicilio en 193 y 93 filas) | Si sí los usa, `has_delivery_webhook: false` lo deja sin esa vía | Preguntarte |
| S7 | Los 4 `staff_devices` (huellas de navegador) siguen sirviendo tras el cambio de dominio | Jairo tiene que volver a emparejar la tablet | Se ve el día 1. Molestia, no pérdida |
| S8 | Las 46 migraciones del arnés replican fielmente el Supabase real (Postgres 18 vs. 15/17, sin RLS, sin PostgREST) | Algo que solo pasa en Supabase | Las diferencias están documentadas en `tests/setup/global-postgres.ts` |
| S9 | **Los conteos se mueven.** Son la foto del 2026-09-06 01:41 y Sushi Fun sigue vivo | Las filas nuevas se pierden en el traslado | `CONTEO-ORIGEN.sql` antes de correr. Si creció, regenero en un minuto |

---

## 4. Preguntas que necesito que respondas **antes** de correr nada

1. **¿Cuál es el número de WhatsApp de Sushi Fun?** (formato `whatsapp:+57…`). Sin él el `01` no
   corre — a propósito. **Es la única pregunta que bloquea.**

2. **¿Cuáles son sus `NEXT_PUBLIC_BRAND_*` y su URL de reseñas de Google, hoy?** Si no me las das,
   el `01` corre igual con lo que puse, pero la tarjeta puede verse distinta y el botón de reseñas
   apunta a la ficha de Sushi Service.

3. **Los 2 `reward_tiers` inactivos** (`Plata` 350 y `Oro` 600, ambos `is_active=false`) parecen
   restos de una configuración vieja. Los copio tal cual porque son historia y no se ven.
   **¿Los dejo, o los descarto en el traslado?**

4. **¿Qué tarifa por mensaje le ponés a Sushi Fun?** La fila nace con el default de **100 COP**.
   Como paga su propia cuenta de Twilio aparte, cobrarle también por la billetera del producto
   **sería cobrarle dos veces**. Opciones: dejarlo en 100 y no recargarle nunca (la billetera queda
   en negativo y no molesta a nadie), o poner el precio que corresponda. **Es una decisión de plata,
   no técnica.**

5. **`template_versions` nace vacío.** El catálogo de plantillas del panel le va a aparecer sin
   versiones, aunque los envíos funcionen (leen `admin_settings.*_template_sid`, que sí se copian).
   Reconstruirlo obligaría a escribir en `admin_settings.*_template_sid` por fuera de
   `promoteVersion()`, que según `CLAUDE.md` es su **único** escritor legítimo. **Lo dejé sin tocar.
   ¿Confirmás?**

6. **El PIN de Jairo viaja como hash bcrypt** dentro de `03-equipo.sql`, ahora commiteado en el
   repo. Es un hash, no el PIN, y ya estaba en la base de origen — pero es un credencial en un
   archivo versionado. **¿Lo dejo así (Jairo sigue entrando con su PIN de siempre), o lo pongo en
   NULL y que lo vuelva a definir?**

7. **¿Cuándo borramos el Supabase de Sushi Fun?** Propongo **30 días y con backup descargado
   antes**: mientras exista, la absorción es reversible sin pérdida. Dijiste que "se va a borrar
   pronto" — si "pronto" es antes de eso, decímelo y ajustamos el runbook.

---

## 5. Lo que entregué

```
SQL-PARA-CORRER/sushi-fun/
  00-PREVUELO.sql              solo lee; aborta si el terreno no está listo
  01-alta-tenant-y-sede.sql    ← el peligroso. Bloque de parámetros a llenar
  02-catalogo.sql              tiers, premios, ajustes, números autorizados
  03-equipo.sql                meseros y dispositivos
  04-clientes.sql              250 clientes
  05-campanas.sql              93 campañas
  06-hechos.sql                visitas, puntos, reseñas, envíos de campaña
  07-mensajes.sql              193 mensajes, con el trigger de billetera apagado
  08-VERIFICACION-FINAL.sql    solo lee; los conteos y el cruce de marcas
  09-ACTIVAR.sql               el interruptor final
  99-ROLLBACK.sql              deshace todo
  CONTEO-ORIGEN.sql            ⚠️ el único que va en el Supabase DE SUSHI FUN
  CONTEOS-ORIGEN.json          la foto, para comparar

docs/RUNBOOK-ABSORBER-SUSHI-FUN.md   10 pasos, cada uno con su rollback
docs/PARTE-SUSHI-FUN-2026-09-06.md   este parte

scripts/gen-sushi-fun-dump.mjs        regenera 02-08 desde el origen (solo GET)
scripts/probar-absorcion-sushi-fun.mjs ensayo completo en Postgres desechable
```

**Cada INSERT lleva `tenant_id` explícito** — el generador **aborta** si una tabla con `tenant_id`
se emite sin él, y el `08` lo verifica desde el otro lado con 12 relaciones hijo↔padre.

**No toqué `ESTADO.md` ni `CHANGELOG.md`**, como pediste.
