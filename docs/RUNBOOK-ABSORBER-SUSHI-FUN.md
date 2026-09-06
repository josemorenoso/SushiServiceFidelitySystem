# RUNBOOK — Absorber Sushi Fun al despliegue principal

> **Escrito:** 2026-09-06 · **Para correr:** 2026-09-07, con el dueño ejecutando y la IA mirando.
> **Estado del SQL:** ensayado de punta a punta contra un Postgres real. Ver §0.
> **Hermanos:** [`docs/PARTE-SUSHI-FUN-2026-09-06.md`](PARTE-SUSHI-FUN-2026-09-06.md) (qué está
> verificado y qué no) · [`docs/RUNBOOK-DEPLOY.md`](RUNBOOK-DEPLOY.md) (el deploy normal).

---

## 🔴 LO PRIMERO: EL WHATSAPP **SÍ** SE RESUELVE POR TENANT — PERO SOLO SI LLENÁS LAS TRES COLUMNAS

**El plan NO se cae.** Se verificó el camino de envío, no solo el del dashboard:

`sendTemplateMessage()` → `getTwilioClient(tenant)`
([`src/services/whatsapp.service.ts:88-96`](../src/services/whatsapp.service.ts#L88-L96)):

```ts
const accountSid     = tenant.twilio_subaccount_sid        ?? process.env.TWILIO_ACCOUNT_SID
const authToken      = tenant.twilio_subaccount_auth_token ?? process.env.TWILIO_AUTH_TOKEN
const whatsappNumber = tenant.twilio_whatsapp_number       ?? process.env.TWILIO_WHATSAPP_NUMBER
```

Ese `tenant` es el que resolvió el dominio/slug, y con él se construye el cliente de Twilio y el
`from` del mensaje. Una cuenta independiente entra igual que una subcuenta, tal como decía el
encargo. **Confirmado.**

**Pero hay una trampa que el encargo no anticipaba, y es peor que la que temía:**

1. **El `??` es CAMPO POR CAMPO.** No es todo-o-nada. `getTenantTwilioCredentials()` (el del
   dashboard) sí exige SID y token juntos (`hasSubaccount`); **`getTwilioClient()` no**. Llenar dos
   de tres mezcla dos cuentas de Twilio en un mismo envío.
2. **Hoy las tres columnas de Sushi Fun están en NULL, y allá eso es CORRECTO.** Su propia
   migración `00028_seed_sushi_fun.sql` lo dice con todas las letras: *"Las columnas `twilio_*` se
   dejan DELIBERADAMENTE EN NULL […] caen a las variables de entorno `TWILIO_*` del proyecto — que
   en este despliegue SON las de la cuenta propia de Sushi Fun."*
   **En el despliegue principal, ese mismo NULL significa la cuenta de Sushi Service.** El acierto
   de ayer es la fuga de mañana.

Lo mismo pasa con la **marca**: `resolveBranding()`
([`src/lib/branding.ts:75-89`](../src/lib/branding.ts#L75-L89)) también cae campo por campo a
`DEFAULT_BRANDING`, que son las `NEXT_PUBLIC_BRAND_*` del entorno = Sushi Service. El `config = '{}'`
que hoy es correcto le pondría **"Sushi Service" en la tarjeta a los 250 clientes de Sushi Fun**.

👉 Por eso [`01-alta-tenant-y-sede.sql`](../SQL-PARA-CORRER/sushi-fun/01-alta-tenant-y-sede.sql)
**aborta** si queda alguna de las tres columnas de Twilio en NULL o si `config.brand_name` viene
vacío. No es una recomendación: el archivo no te deja continuar. Está probado en los dos sentidos.

---

## §0 · Lo que ya se probó (no hace falta creerme)

```
node scripts/probar-absorcion-sushi-fun.mjs
```

Levanta un Postgres desechable con `embedded-postgres` (el mismo del arnés de tests), le aplica el
`bootstrap.sql` y **las migraciones 00001–00045** —el estado que va a tener producción mañana, sin
la 00046— y corre los nueve archivos en orden, más el rollback. Última corrida, **todo en verde**:

| Comprobación | Resultado |
|---|---|
| Los 9 archivos corren en orden, con sus verificaciones | ✅ |
| 1.418 filas de Sushi Fun cargadas, cero cruces de marca | ✅ |
| El 01 **rechaza** los placeholders de Twilio sin reemplazar | ✅ |
| El 01 **rechaza** llenar 2 de 3 columnas de Twilio | ✅ |
| El 01 **rechaza** `brand_name` vacío | ✅ |
| El mismo celular convive en dos marcas sin colisionar | ✅ **confirmado, no supuesto** |
| Correr un archivo dos veces **aborta** en vez de duplicar | ✅ |
| El rollback no deja rastro y las otras marcas quedan iguales | ✅ |
| Tras el rollback, el pre-vuelo vuelve a dar OK (se puede reintentar) | ✅ |
| La billetera de Sushi Fun queda en **0 movimientos** | ✅ |
| Lo mismo **con la 00046 aplicada** (`HASTA=00046 node scripts/…`) | ✅ da igual si aplicaste §19 o no |

Lo que el ensayo **no** cubre está en el parte, §"Lo que sigue siendo supuesto".

---

## §1 · Antes de empezar — las 6 cosas que tenés que tener a mano

| # | Qué | Dónde se saca |
|---|---|---|
| 1 | **Account SID de Twilio de Sushi Fun** | console.twilio.com de esa cuenta. Empieza por `AC04707046…` |
| 2 | **Auth Token de Twilio de Sushi Fun** | mismo sitio |
| 3 | **Número de WhatsApp de Sushi Fun**, como `whatsapp:+57XXXXXXXXXX` | mismo sitio, Messaging → Senders |
| 4 | **Las `NEXT_PUBLIC_BRAND_*` del Vercel viejo de Sushi Fun** | Vercel → proyecto de Sushi Fun → Settings → Environment Variables |
| 5 | La URL de reseñas de Google de Sushi Fun | `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` del mismo sitio |
| 6 | Acceso al SQL Editor de **los dos** Supabase | — |

> Los tres primeros **no están en ningún archivo de este repo, a propósito**. Se pegan en el bloque
> de parámetros del 01 en el momento de correrlo y no se commitean nunca.

**Y las migraciones 00044 y 00045 tienen que estar aplicadas en producción.** El pre-vuelo lo
comprueba y aborta si faltan. Sin ellas, `staff_users.location_id` no existe, el 03 revienta con
42703 y PostgREST lo traduce a un 403 que parece un problema de permisos y no lo es.

---

## §2 · El orden. No se salta ningún paso.

### Paso 1 — Refrescar la foto  ⏱️ 2 min

Los archivos 02–07 llevan los datos **congelados el 2026-09-06 a la 01:41**. Sushi Fun sigue
operando: cada check-in que entre desde entonces suma filas que esos archivos no traen.

1. Pegá [`CONTEO-ORIGEN.sql`](../SQL-PARA-CORRER/sushi-fun/CONTEO-ORIGEN.sql) en el SQL Editor
   **de Sushi Fun** (es el único archivo que va allá).
2. Mirá la columna `estado`:
   - Todo `igual` → seguí al paso 2.
   - Algo dice `CRECIO` → **avisame y regenero los archivos en un minuto**:
     ```
     SUSHIFUN_URL=… SUSHIFUN_SERVICE_KEY=… node scripts/gen-sushi-fun-dump.mjs
     ```
     Si no se regeneran, esas filas se pierden **y el 08 va a fallar a propósito.**

> **Rollback de este paso:** ninguno, solo lee.

### Paso 2 — Congelar Sushi Fun  ⏱️ 5 min

Para que la foto no se mueva mientras cargás:

1. En el **Vercel viejo de Sushi Fun**: Settings → **Pause Project** (o poné el proyecto en
   mantenimiento). Sus dos crons —`/api/cron/birthday` 08:00 UTC y `/api/cron/reactivation`
   10:00 UTC— dejan de dispararse.
2. Anotá la hora. A partir de acá, un check-in de Sushi Fun no se registra en ningún lado.

> **Rollback:** *Resume Project* en Vercel. Todo vuelve como estaba.
> **Por eso conviene hacerlo con el restaurante cerrado.**

### Paso 3 — Pre-vuelo en el destino  ⏱️ 1 min

Pegá [`00-PREVUELO.sql`](../SQL-PARA-CORRER/sushi-fun/00-PREVUELO.sql) en el SQL Editor
**del principal**. Solo lee.

- Termina con `OK PRE-VUELO` → seguí.
- Aborta → **parás**. El mensaje dice exactamente qué falta.

**Anotá los conteos por marca que imprime.** Los vas a comparar al final.

> **Rollback:** ninguno, no escribe.

### Paso 4 — El alta del tenant  ⏱️ 5 min

1. Abrí [`01-alta-tenant-y-sede.sql`](../SQL-PARA-CORRER/sushi-fun/01-alta-tenant-y-sede.sql).
2. Llená el **bloque de parámetros**: los tres valores de Twilio (§1) y los de marca.
   **No toques `p_is_active`.** Nace en `false` a propósito — ver el paso 9.
3. Pegalo entero y corré.

Termina con `OK 01: Sushi Fun existe, con SUS credenciales Twilio, SU marca y UNA sede principal.`

> **Rollback:** [`99-ROLLBACK.sql`](../SQL-PARA-CORRER/sushi-fun/99-ROLLBACK.sql). Borra las 2 filas
> y deja la base como estaba. Si el archivo falla a mitad, se deshace solo (tiene su `BEGIN;`).

### Paso 5 — Los datos  ⏱️ 10 min

En este orden exacto, un archivo a la vez, esperando el `OK` de cada uno:

| Archivo | Qué mueve |
|---|---|
| [`02-catalogo.sql`](../SQL-PARA-CORRER/sushi-fun/02-catalogo.sql) | 6 tiers, 3 premios, 1 cap, 24 ajustes, 2 números autorizados |
| [`03-equipo.sql`](../SQL-PARA-CORRER/sushi-fun/03-equipo.sql) | 1 mesero (Jairo) + 4 dispositivos |
| [`04-clientes.sql`](../SQL-PARA-CORRER/sushi-fun/04-clientes.sql) | **250 clientes** |
| [`05-campanas.sql`](../SQL-PARA-CORRER/sushi-fun/05-campanas.sql) | 93 campañas |
| [`06-hechos.sql`](../SQL-PARA-CORRER/sushi-fun/06-hechos.sql) | 268 visitas, 268 movimientos de puntos, 68 reseñas, 237 envíos de campaña |
| [`07-mensajes.sql`](../SQL-PARA-CORRER/sushi-fun/07-mensajes.sql) | 193 mensajes — **desactiva y reactiva un trigger**, ver abajo |

**Sobre el 07.** `trg_debit_wallet` (00033) dispara `AFTER INSERT` sobre `message_logs` y cobra cada
fila cuyo `twilio_sid` no sea NULL. De las 193, **91 lo traen**: cargar el historial le debitaría a
Sushi Fun 91 mensajes que ya pagó en su propia cuenta de Twilio. El archivo lo desactiva y lo vuelve
a activar **dentro de la misma transacción**, así que un fallo lo restaura solo. Toma un lock breve
sobre `message_logs`: es otra razón para hacerlo con los restaurantes cerrados.

> Si el 07 se corta de un modo que no dispara el ROLLBACK (se cae el navegador, se pierde la
> sesión), lo primero que hacés es:
> ```sql
> ALTER TABLE message_logs ENABLE TRIGGER trg_debit_wallet;
> ```
> Mientras esté desactivado, **los envíos de TODAS las marcas dejan de cobrarse.** El 08 y el 99
> lo comprueban y gritan.

> **Rollback de todo el paso 5:** `99-ROLLBACK.sql`. Correrlo aunque solo hayas hecho algunos
> archivos: borra lo que haya y sigue.

### Paso 6 — Verificación  ⏱️ 2 min

Pegá [`08-VERIFICACION-FINAL.sql`](../SQL-PARA-CORRER/sushi-fun/08-VERIFICACION-FINAL.sql).
Solo lee. Comprueba, y aborta si algo no cuadra:

1. Los 20 conteos, tabla por tabla.
2. **Que ninguna fila de Sushi Fun quedó atribuida a otra marca** — 12 relaciones hijo↔padre.
   Si un INSERT hubiera olvidado `tenant_id`, el DEFAULT puente lo habría mandado a Sushi Service
   y su padre seguiría en Sushi Fun: la fila sale acá.
3. Que no quedó ninguna fila sin marca, en ninguna tabla con `tenant_id`.
4. Que la billetera de Sushi Fun tiene **0 movimientos**.
5. Que `trg_debit_wallet` volvió a estar activo.
6. Que hay **exactamente una** sede activa.
7. Que el mesero tiene sede.
8. Que las tres columnas de Twilio siguen llenas.

Compará los clientes por marca con lo que anotaste en el paso 3: **las otras marcas no se movieron.**

### Paso 7 — El usuario del panel  ⏱️ 5 min

**Esto no lo puede hacer el SQL.** Sushi Fun tiene **un** usuario en su Auth:

```
sushifunandwok@gmail.com   ·   último ingreso 2026-09-02
app_metadata.tenant_id = b2c3d4e5-f6a7-8901-bcde-f23456789012
```

En el Supabase **principal** → Authentication → Users → **Invite user** (o *Add user*) con ese
mismo correo, y después editar su `app_metadata`:

```json
{ "tenant_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012" }
```

- **La contraseña NO se migra.** El usuario entra por el enlace de invitación o por
  "olvidé mi contraseña". Avisale antes.
- **No hace falta** crear filas en `dashboard_user_locations`: con **una sola sede activa**,
  `decideLocationScope()` ([`src/lib/location-scope.ts:172-188`](../src/lib/location-scope.ts#L172-L188))
  le da alcance de marca al usuario sin permisos explícitos. Con **dos** sedes le daría 403 — por
  eso el 01 crea una sola, aunque en la base de Sushi Fun haya dos filas duplicadas.
- Con el tenant todavía apagado ya puede entrar y revisar sus números: `requireLocationScope` no
  filtra por `is_active`.

> **Rollback:** borrar el usuario en Authentication → Users.

### Paso 8 — DNS y webhook de Twilio  ⏱️ 15 min + propagación

1. **Vercel principal** → Settings → Domains → agregar `clubsushifun.constelarys.com`.
2. **DNS**: repuntar el CNAME de `clubsushifun.constelarys.com` al proyecto principal.
3. **Twilio de Sushi Fun** → Messaging → el número de WhatsApp → *A message comes in*:
   cambiar la URL del Vercel viejo a
   `https://clubsushifun.constelarys.com/api/webhook/twilio-incoming`.

   **Esto no es opcional.** `getTenantByWhatsappNumber(To)` es como el webhook de entrada resuelve
   la marca; si el webhook sigue apuntando al Vercel viejo y ese se apaga, **los "SALIR" de los
   clientes dejan de registrarse** y se les sigue escribiendo a personas que pidieron no recibir
   más. Anotá la URL vieja antes de cambiarla.

> **Rollback:** volver el CNAME y la URL del webhook a sus valores anteriores, y *Resume Project*
> en el Vercel viejo. Guardá los dos valores viejos por escrito antes de tocarlos.

### Paso 9 — Encender  ⏱️ 1 min

**Antes de correr el 09, las tres tienen que ser ciertas:**

- [ ] El 08 dio OK.
- [ ] Los dos crons del Vercel viejo están apagados (paso 2).
- [ ] El webhook de Twilio ya apunta al principal (paso 8).

Pegá [`09-ACTIVAR.sql`](../SQL-PARA-CORRER/sushi-fun/09-ACTIVAR.sql).

**Por qué existe este paso separado.** Los crons del despliegue principal, sin `?tenant=`, recorren
**todos los tenants activos**. Los del Vercel viejo de Sushi Fun corren a las 08:00 y 10:00 UTC; los
del principal a las 13:00 y 15:00. Con los dos vivos y el tenant activo, **los mismos clientes
reciben el mismo cumpleaños dos veces, desde el mismo número.** Naciendo apagado, eso no puede pasar
por descuido.

> **Rollback (rápido, sin borrar nada):**
> ```sql
> UPDATE tenants SET is_active = false WHERE slug = 'sushi-fun';
> ```
> **A partir de acá el rollback ya no es limpio:** borrar filas no des-envía un WhatsApp.

### Paso 10 — Prueba en vivo  ⏱️ 10 min

Con un teléfono de prueba **que no esté en ninguna de las dos bases**:

1. Abrí `clubsushifun.constelarys.com` y registrate.
2. **En el SQL del principal:**
   ```sql
   SELECT t.slug, c.name, c.phone, c.created_at
     FROM customers c JOIN tenants t ON t.id = c.tenant_id
    WHERE c.phone = '<el de prueba>';
   ```
   **Tiene que decir `sushi-fun`.** Si dice `sushi-service`, parás todo y apagás el tenant: es la
   fuga del DEFAULT puente.
3. Que llegue el WhatsApp de bienvenida. **Mirá desde qué número llega**: tiene que ser el de
   Sushi Fun, no el de Sushi Service. Este es EL chequeo del día.
4. Abrí la tarjeta: tiene que decir **Sushi Fun**, no Sushi Service.
5. Entrá al panel con `sushifunandwok@gmail.com`: 250 clientes (+1), y **solo** los de Sushi Fun.
6. Entrá al panel de Sushi Service: sus números **no se movieron**.
7. Respondé `SALIR` al WhatsApp de bienvenida y comprobá que se registra:
   ```sql
   SELECT phone, whatsapp_opt_out_at FROM customers WHERE phone = '<el de prueba>';
   ```
8. Borrá el cliente de prueba:
   ```sql
   DELETE FROM customers
    WHERE phone = '<el de prueba>'
      AND tenant_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
   ```

---

## §3 · Qué se apaga, y cuándo. **Nada antes de que el paso 10 esté en verde.**

| Cuándo | Qué | Por qué en ese orden |
|---|---|---|
| Paso 2 (durante el corte) | **Crons** del Vercel viejo | Doble envío. Es lo único que se apaga antes de verificar. |
| Paso 8 | **DNS** de `clubsushifun.constelarys.com` | Es lo que manda el tráfico al principal. |
| Paso 8 | **Webhook de entrada de Twilio** | Si no, los "SALIR" se pierden. |
| **+7 días** de operación normal | **Vercel viejo**: borrar el proyecto | Mientras exista pausado, la vuelta atrás es *Resume* + repuntar DNS. Una semana es el plazo para que aparezca cualquier cosa que no se vio el día 1. |
| **+30 días** | **Supabase de Sushi Fun**: primero un backup descargado, después borrar el proyecto | **Es el único respaldo real de los datos originales.** Mientras viva, la absorción es reversible sin pérdida. No lo borres sin haber bajado el backup a un disco. |
| **+30 días** | **Repo `Sushi-Fun-System`**: archivarlo en GitHub, no borrarlo | Archivar conserva la historia y deja claro que no se toca. El remoto `fun` de este repo se puede quitar con `git remote remove fun`. |
| Cuando quieras | El dominio viejo de Sushi Fun (si tenía uno propio) | Redirección 301 a `clubsushifun.constelarys.com`, no un dominio muerto. |

**Lo que NO se apaga:** la cuenta de **Twilio** de Sushi Fun. Es la que sigue enviando sus mensajes.
Mover su número a una subcuenta bajo la matriz es otro proyecto (necesita ticket a soporte de Twilio
y arriesga una re-aprobación de Meta) y está aplazado desde el plan MASTER del 2026-07-05.

---

## §4 · Si algo sale mal

| Síntoma | Qué es | Qué hacer |
|---|---|---|
| Un archivo aborta con `RAISE EXCEPTION` | Hizo su trabajo: la transacción se deshizo sola | Leé el mensaje. No hace falta el 99. |
| El 08 dice que los conteos no cuadran | El origen creció desde la foto | Regenerar (paso 1), correr el 99, y volver desde el paso 3 |
| El 08 encuentra filas cruzando de marca | Un INSERT perdió su `tenant_id` | **99 inmediatamente.** Avisame antes de reintentar |
| Un WhatsApp de Sushi Fun sale del número de Sushi Service | Alguna columna `twilio_*` quedó en NULL | `UPDATE tenants SET is_active = false WHERE slug = 'sushi-fun';` **ya**, después arreglar la fila |
| La tarjeta de Sushi Fun dice "Sushi Service" | `config` incompleto | `UPDATE tenants SET config = config \|\| '{"brand_name":"Sushi Fun"}'::jsonb WHERE slug = 'sushi-fun';` |
| El dueño de Sushi Fun recibe 403 en el panel | Quedó con 2 sedes activas | `SELECT id, name, is_active FROM restaurant_locations WHERE tenant_id = '<sf>';` → desactivar la sobrante |
| Los clientes reciben todo dos veces | El Vercel viejo sigue con crons | Pausar el Vercel viejo |
| `trg_debit_wallet` quedó desactivado | Se cortó el 07 | `ALTER TABLE message_logs ENABLE TRIGGER trg_debit_wallet;` |

**El rollback completo, en una línea:** pegar
[`99-ROLLBACK.sql`](../SQL-PARA-CORRER/sushi-fun/99-ROLLBACK.sql) en el principal. Borra todo lo de
Sushi Fun en orden inverso de dependencias, verifica que no quedó ni una fila y comprueba que el
trigger de billetera está activo. No toca ninguna otra marca. **No toca el Supabase de Sushi Fun**,
que sigue intacto y es el respaldo de verdad.
