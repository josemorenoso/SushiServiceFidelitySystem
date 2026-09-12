# Runbook — Sushi Service: de Twilio a Zernio por coexistencia

> **Cuándo:** 2026-09-12. El operador desactivó la SIM prepago de la línea de Twilio; el WhatsApp
> sigue vivo en Cloud API y **los mensajes normales salen bien**, pero en ~un mes el número se
> recicla. Y a la **difusión** (Golden Bullet) la gente la toma por número falso viniendo de ahí.
> **Decisión del dueño:** la difusión sale YA por su **línea de coexistencia** (la que la gente
> conoce, en Zernio); lo normal sigue por Twilio hasta que muera; después, todo a Zernio.
> Meta: sostener **~1.000 mensajes diarios** de difusión.
>
> **Este runbook tiene dos partes.** El **§A «modo puente doble»** es lo de hoy: Zernio conectado
> con la marca todavía en Twilio, y el Golden Bullet saliendo por Zernio. Los §1-§9 de abajo son la
> **migración completa**, para cuando Twilio muera: se ejecutan sobre lo que el §A ya dejó hecho.
> **Quién lo ejecuta:** el dueño, desde el AIOS (`Level 2.0/aios-constelarys`, `origin/main` =
> `62e8c13`, v1.11.2 + «Registrar número en Cloud API») y el editor SQL de Supabase.
> **Verificado contra:** `provisioning.ts` e `import.ts` del AIOS, `00036`/`00064`,
> `whatsapp.service.ts`, `queue-drain/route.ts`, `ImportedContactsUploader.tsx`,
> `docs/features/zernio-messaging.md`, `conexiones.md`, `PENDIENTES-PLANTILLAS.md`.

## A. Modo puente doble — la difusión por Zernio, lo normal por Twilio (HOY)

Lo construido el 2026-09-12 (`docs/features/golden-bullet.md` § "Por qué línea sale la difusión"):
el Golden Bullet lee `admin_settings.golden_bullet_provider`; con `zernio` y la cuenta conectada,
**lista, crea, prueba y manda por Zernio aunque `tenants.messaging_provider` siga en `twilio`**.
El resto de la marca (recibos, campañas, cumpleaños, domicilios por Twilio) no se entera.

**A.1 — Lo previo (ya hecho por el dueño, §1):** migraciones, Vercel del AIOS, AIOS desplegado. Más
lo que exige Meta para coexistencia (§1) y **la verificación del negocio en Meta, arrancada hoy**:
la línea de coexistencia es un número NUEVO para Cloud API y nace en **250 únicos/día**; los 1.000
solo llegan con el negocio verificado. Es la única cosa de este runbook que no se hace en un rato.

**A.2 — En el AIOS, nivel propietario (§3 entero):** importar Sushi Service → condición «Falta
instalar WhatsApp» → paso 0 «el número que ya usa» → profile → número → link (escanear el QR
desde la app) → `accountId` → **«Registrar número en Cloud API»** → paso 6 (webhook, con la URL
revisada). El paso 4 (las 13 plantillas) se puede hacer ya: no se usan hasta la migración completa,
pero así Meta las aprueba con tiempo. **El paso 5 de la sede NO se corre** en el puente: pisaría
los `HX…` de Twilio (y con la marca en `twilio` la función lo rechaza igual).

**A.3 — Dejar los `zernio_*` en el tenant SIN cambiar de proveedor: el botón del AIOS.**
Con la **00067 aplicada** en el Supabase del producto y el AIOS ≥ v1.13.0: en la sede de Sushi
Service (condición **Twilio**, sin cambiarla) → bloque **«4-bis. Zernio en paralelo»** → **«Conectar
Zernio en paralelo (Twilio sigue)»**. Llama a `aios_attach_zernio_account()`: escribe los tres
`zernio_*` y **nunca** `messaging_provider` (se niega si la marca ya es Zernio). No es el paso 4 y
no cambia la condición de la sede. Sin ventana, sin SQL.

Respaldo, si el AIOS no está desplegado o la 00067 no está aplicada (es lo mismo que hace la función):

```sql
UPDATE tenants
   SET zernio_profile_id   = '<profileId>',
       zernio_account_id   = '<accountId>',
       zernio_phone_number = '+57XXXXXXXXXX'
 WHERE slug = 'sushi-service'
   AND messaging_provider = 'twilio';
-- esperado: UPDATE 1. Si dice 0, la marca ya no está en twilio: mirar antes de seguir.
```

Comprobar:
```sql
SELECT slug, messaging_provider, zernio_account_id, zernio_phone_number FROM tenants WHERE slug = 'sushi-service';
-- esperado: twilio + los dos zernio_* con valor
```

**A.4 — Vercel del PRODUCTO:** `ZERNIO_API_KEY` (la misma del AIOS: crea la plantilla y manda el
acuse) y `ZERNIO_WEBHOOK_SECRET`. Desplegar el producto con el commit del Golden Bullet por Zernio
(push de `main` = deploy; lo ordena el dueño).

**A.5 — En el panel:** Golden Bullet → **Plantilla** → botón **«Mandar la difusión por la línea de
coexistencia (Zernio)»** (solo aparece con A.3 hecho). Escribir el mensaje 1, los botones y la
foto → **Crear** (va a la WABA de coexistencia; nombre `club_invite_sushi_service[_foto]`) →
Meta 24-48 h → **probar a tu celular** desde el paso 5 del asistente (sale por Zernio) → subir el
CSV y programar la tanda. El costo se etiqueta «Zernio» y el saldo se mira en el panel de Zernio.

**A.6 — El «sí» y el «no».** Al tocar un botón, el webhook de Zernio (`/api/webhook/zernio`)
reconoce el título del botón y **contesta en el acto** con el texto de la pestaña Plantilla y la
foto del regalo (texto libre dentro de la ventana de 24 h, contrato §8). Para que eso funcione:
webhook registrado (A.2, paso 6) y `ZERNIO_WEBHOOK_SECRET` puesto. Se confirma con UN toque desde
tu celular: en los logs de Vercel sale `[webhook/zernio] opt-in por botón … acuse enviado`. Un
`401` ahí es el header de la firma (§7.5).

**A.7 — Cupo.** `messaging_daily_limit` de Sushi Service está en NULL (mide, no frena) y ahora
cuenta las DOS líneas juntas: es de la marca, no de la línea. Con 250/día de Meta en la línea de
coexistencia, el drenador va a ver rechazos de Meta (`131xxx`) pasado el cupo: **hasta que el
negocio esté verificado, programar bloques de ≤250/día**. El escalón real se lee en el WhatsApp
Manager (§6).

**A.8 — Vuelta atrás del puente:** el mismo botón («Volver a mandar la difusión por Twilio») o
`DELETE FROM admin_settings WHERE key = 'golden_bullet_provider' AND tenant_id = (SELECT id FROM tenants WHERE slug = 'sushi-service')`.
Los `zernio_*` pueden quedarse: con el proveedor en `twilio` no hacen nada.

**Cuando Twilio muera (≈ un mes):** seguir con los §4-§6 de abajo — en el AIOS, Datos de la sede →
«Falta instalar WhatsApp», paso 4 («Activar», que ahora sí cambia el proveedor) y paso 5; el SQL de
las claves huérfanas (§5) y el cupo (§6). El §2 (guardar los `HX…`) se hace ANTES de eso.

## 0. Qué cambia y qué no

| | Antes (Twilio) | Después (Zernio, coexistencia) |
|---|---|---|
| `tenants.messaging_provider` | `twilio` (usa las `TWILIO_*` del env por `TWILIO_MASTER_TENANT_ID`) | `zernio` + `zernio_profile_id` / `zernio_account_id` / `zernio_phone_number` |
| Plantillas | 15 punteros `admin_settings.*_template_sid` con SIDs `HX…` de Twilio | Las **13 del catálogo** las crea el AIOS (paso 4) y las carga el paso 5. **Dos quedan huérfanas** (§5) |
| Entrantes (opt-out, domicilios) | `/api/webhook/twilio-incoming` | `/api/webhook/zernio` — exige `ZERNIO_WEBHOOK_SECRET` y firma |
| Campañas a clientes (`/dashboard/campaigns`) | ✅ | ✅ — la cola reconstruye la media según el proveedor ACTUAL (`construirOpciones()`), así que lo encolado hoy sale mañana por Zernio |
| Golden Bullet (`/dashboard/imported-contacts`) | ✅ | ✅ desde el 2026-09-12 (lista/crea/prueba/manda por Zernio y contesta el «sí»); ver §A |
| Cupo | Medido, sin freno (`messaging_daily_limit = NULL`) | Igual hasta que lo fijes (§6). Meta manda: un número nuevo arranca en **250 únicos/día** |
| Check-in, puntos, premios, QR | No dependen de WhatsApp | Igual |

**Twilio no se «desvincula» con nada más que el cambio de proveedor.** El ruteo es una sola decisión
en `sendTemplateMessage()`: con `zernio`, la rama Twilio no se toca. Las columnas `twilio_*`, la
variable `TWILIO_MASTER_TENANT_ID` y la cuenta Twilio quedan como están — son la vuelta atrás (§8).
Lo único que conviene apagar en Twilio es el sender del número muerto, para que no siga cobrando.

## 1. Antes de tocar el AIOS (lo que ya confirmó el dueño el 12)

- [x] `00064` aplicada en el Supabase del producto · `00010` en el del AIOS.
- [x] Vercel del AIOS: `ZERNIO_API_KEY` vigente, `ZERNIO_SIMULATE` **fuera**,
      `AIOS_ADMIN_PROVISION_SECRET` = el del producto, `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL` y
      `ZERNIO_TEMPLATE_SAMPLE_VIDEO_URL` (las de `event-media/5103017800669793459.jpg` y `0906.mp4`).
- [x] Vercel del producto: `ZERNIO_WEBHOOK_SECRET`.
- [x] AIOS desplegado (`origin/main` = `62e8c13`).

Y lo que exige **Meta** para coexistencia, que ningún panel puede hacer por vos:
- El número nuevo está en la **app de WhatsApp Business** (no en WhatsApp normal — si la SIM quedó
  en el personal, migrarla desde Ajustes de la app ANTES), app actualizada, con un chat cualquiera
  ya hecho (un número recién registrado y vacío a veces no pasa el flujo).
- El número **no** está en ninguna WABA ni en Cloud API. Si alguna vez lo registraste en Twilio o
  en Meta, primero eliminarlo de allá.
- La línea es **pospago o con recarga automática**. Si el operador la recicla, el siguiente dueño
  del número registra el WhatsApp y Meta te lo da de baja. Es exactamente lo que acaba de pasar.
- **Verificación del negocio en Meta (arrancar HOY, en paralelo):** Meta Business Suite → Configuración
  → Centro de seguridad → Verificación del negocio. Cámara de Comercio o RUT + un dato público del
  negocio (dominio o teléfono). Sin esto el número **no pasa de 250/día**, y es lo único de este
  runbook que tarda días y no depende de nadie del equipo. Si el portafolio de Sushi Service ya
  estaba verificado (por la WABA de Twilio), la WABA nueva lo hereda y arranca en 1.000.

## 2. Guardar los punteros de Twilio (30 segundos, y es la vuelta atrás)

`aios_deactivate_whatsapp()` (el botón «Reiniciar el alta de WhatsApp») **borra** todas las claves
`*_template_sid` del tenant al volver a `twilio`. Si un día hay que volver, los `HX…` de Twilio ya
no estarían. Guardá la salida de esto en un archivo antes de empezar:

```sql
SELECT key, value
  FROM admin_settings
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sushi-service')
   AND (key ~ '_template_sid$' OR key LIKE 'event_template_%' OR key = 'zernio_template_language')
 ORDER BY key;
```

## 3. En el AIOS — nivel PROPIETARIO (el número y las plantillas)

1. **Si Sushi Service no aparece en Clientes:** Clientes → **Importar** → engancharlo como sede de un
   propietario nuevo. Nace con la condición **Twilio** (`import.ts` la copia de
   `tenants.messaging_provider`). No se crea ningún tenant nuevo: `siteCreateTenant` lo rechaza
   con `tenant_ya_existe` a propósito.
2. **Datos de la sede → condición → «Falta instalar WhatsApp»** (`pending`). Mientras diga Twilio,
   el wizard de la sede esconde los pasos 4 y 5 con el aviso «esta sede manda por Twilio y funciona»
   (`SiteProvisioningWizard.tsx:90`).
3. **Wizard de WhatsApp del propietario:**
   - **Paso 0** → «El número que ya usa» (`own_number`). Fija `onboarding=business_app` e
     `isCoexistence=true`; no cotiza ni compra nada.
   - **Paso 1** → crear el profile en Zernio.
   - **Paso 2** → registrar el número nuevo (`3001234567` o `+573001234567`; se lleva a E.164). Sin
     esto el paso 3 no genera el link: es lo único que viaja como `expectedPhoneNumber`.
   - **Paso 3** → generar el link y abrirlo **vos**, con el celular del número a mano. Meta pide
     iniciar sesión en Facebook, elegir el portafolio de negocios de Sushi Service (o crearlo) y
     **escanear un QR desde la app** de WhatsApp Business. Al terminar vuelve a `/conexion/whatsapp`
     con `?connected=whatsapp&accountId=…`. Pegá ese `accountId` en el paso 3 («Registrar cuenta»).
     No hay `code` que pegar: en headless lo canjea Zernio.
   - **«Registrar número en Cloud API»** (mismo paso 3, botón nuevo del 12). Sin esto el número puede
     quedar «sin registrar» en el WhatsApp Manager y las plantillas se quedan «En revisión» horas
     (le pasó a Planeta Wings). Si el número tiene PIN de verificación en dos pasos, se pide ahí.
   - **Paso 4** → «Crear plantillas»: las 13 (`bienvenida`, `puntos_sumados_*`, `tier_desbloqueado_safe`,
     `mystery_box_resultado`, `golden_box_resultado`, `cumpleanos`, `reactivacion_*`, `campana_*`,
     `evento_imagen`, `evento_video`). Sin 🍣: el emoji sale del rubro. Meta tarda de minutos a
     48 h. «Actualizar estado» te dice qué contestó Meta de **cada una**, rechazo con motivo incluido.
     Una rechazada no se reintenta: se corrige el texto y se crea `_v2`.
   - **Paso 6** → registrar el webhook. **Mirá la URL que quedó en el panel de Zernio**: tiene que ser
     exactamente `https://<host del producto>/api/webhook/zernio`, una sola vez. Si aparece
     `/api/webhook/zernio/api/webhook/zernio`, la variable `PRODUCT_WEBHOOK_BASE_URL` del AIOS tiene
     el path adentro: corregirla y re-registrar. Con la URL mal, **todo entrante cae en 404** y
     parece que nadie escribe.

## 4. En el AIOS — nivel SEDE (el interruptor del producto)

- **Paso 4 de la sede → «Activar messaging_provider = zernio»** (`siteActivateMessaging` →
  `aios_activate_whatsapp`). Exige profile + número + cuenta del propietario. Desde este momento
  Sushi Service manda por Zernio: `/dashboard/conexiones` pasa a decir el número nuevo y
  `/dashboard/templates` muestra el gestor de Zernio.
- **Paso 5 de la sede → cargar las plantillas** (`siteLoadTemplateSettings` →
  `aios_set_template_settings`): escribe el `name` de cada plantilla aprobada en su clave
  `admin_settings`, pisando el `HX…` de Twilio de esas 13. Hacelo cuando el paso 4 del propietario
  muestre las 13 aprobadas; si cargás antes, quedan solo las aprobadas hasta ese momento y hay que
  repetir el paso 5 después (es idempotente).

Hasta el paso 4 de la sede, **el producto sigue viendo a Sushi Service como Twilio** (y como el
sender murió, sus envíos fallan igual que hoy). Entre el paso 4 de la sede y la aprobación de las
plantillas, los envíos fallan con «plantilla no encontrada» en `message_logs`: es la ventana de
24-48 h que no hay forma de evitar. Los mensajes de check-in de ese lapso **no se recuperan**; las
campañas encoladas sí salen después.

## 5. Las claves que el catálogo del AIOS NO cubre (SQL, después del paso 5)

El código lee **15** claves `*_template_sid`; el AIOS crea y carga **13**. Las otras quedan con su
`HX…` de Twilio, y en Zernio un `HX…` es un nombre de plantilla que no existe → `message_logs`
`failed`. Las dos que importan:

| Clave | Qué pasa si queda con el `HX…` |
|---|---|
| `tier_unlocked_template_sid` | Al cruzar un nivel, el check-in manda **esta** en vez de «puntos sumados» (`check-in/route.ts:995`, cadena `else if`). Falla → **el mejor momento del cliente es silencio** |
| `reward_reminder_template_sid` | El cron `reward-reminder` sale sin hacer nada |

Y dos legacy que ya nadie manda pero Ajustes sigue mostrando: `reactivation_with_reward_template_sid`,
`reactivation_template_sid`.

Cómo resolverlo, en orden de preferencia:
1. **Crear las dos plantillas en la WABA nueva** — desde el **WhatsApp Manager de Meta** (Cuenta de
   WhatsApp → Plantillas de mensajes → Crear), nombres `tier_desbloqueado` y `recordatorio_premio`,
   idioma `es`. El cuerpo se copia del que Sushi Service tiene hoy en Twilio (Content Template
   Builder → la plantilla que apunta cada `HX…` del §2), con las mismas variables `{{n}}` en el
   mismo orden: «Tier desbloqueado» lleva 4 (`docs/PLANTILLAS.md` L68 y L649: nombre, nivel, premio
   seguro, roadmap); «Recordatorio de premio» no está documentada en `PLANTILLAS.md`, así que Twilio
   es la única fuente de su texto. Zernio manda por `name` + `language`
   contra esa misma WABA, así que las ve (confirmalo con `GET /v1/whatsapp/templates?accountId=…`).
   No hay pantalla que las cree: es la deuda 1.2 de `PENDIENTES-PLANTILLAS.md`.
2. Cuando Meta las apruebe, apuntar las claves y limpiar las legacy:

```sql
-- SOLO después de ver APPROVED en el WhatsApp Manager. El name es el de Meta, no un HX.
UPDATE admin_settings
   SET value = 'tier_desbloqueado'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sushi-service')
   AND key = 'tier_unlocked_template_sid';

UPDATE admin_settings
   SET value = 'recordatorio_premio'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sushi-service')
   AND key = 'reward_reminder_template_sid';

-- Mientras no estén aprobadas: mejor NULL que un HX. Con NULL el cron no manda y el check-in
-- registra 'no_template_configured' (check-in/route.ts:129) en vez de un intento fallido contra
-- Zernio. Vale también para las dos de arriba si Meta se demora: NULL hasta que apruebe.
UPDATE admin_settings
   SET value = NULL
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sushi-service')
   AND key IN ('reactivation_with_reward_template_sid', 'reactivation_template_sid')
   AND value LIKE 'HX%';
```

3. Verificar que **ninguna** clave quedó con un `HX…`:

```sql
SELECT key, value FROM admin_settings
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sushi-service')
   AND key ~ '_template_sid$' AND value LIKE 'HX%';
-- esperado: 0 filas
```

## 6. Verificar el número y fijar el cupo (los 1.000 diarios)

**La fuente de verdad es el WhatsApp Manager**, no Zernio (su contrato no expone el cupo):
`business.facebook.com/wa/manage/phone-numbers/` → portafolio de Sushi Service → la fila del número:

| Columna | Lo que tiene que decir |
|---|---|
| Estado | **Conectado** (si dice «Pendiente» o «Sin registrar», volver a «Registrar número en Cloud API») |
| Nombre visible | Aprobado. Rechazado = los mensajes salen pero sin nombre |
| Calificación de calidad | Verde. Amarillo baja el cupo; rojo lo congela |
| Límite de mensajes | `250` · `1.000` · `10.000` · `100.000` · ilimitado — **destinatarios únicos por 24 h rodantes** |

Por API, si querés dejar de mirar pantallas (token de administrador del portafolio):
`GET graph.facebook.com/v21.0/{phone_number_id}?fields=display_phone_number,verified_name,name_status,quality_rating,messaging_limit_tier,platform_type`
→ `messaging_limit_tier` ∈ `TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED`,
`platform_type = CLOUD_API`.

**Cómo llega a 1.000 y se queda ahí:**
- **250 → 1.000:** solo con la verificación del negocio (§1). No hay atajo.
- **1.000 → 10.000:** automático cuando en 7 días usás al menos la mitad del cupo con calidad
  media o alta. Con 1.000/día de verdad, sube solo en la segunda semana.
- **Lo baja:** bloqueos y reportes de spam. Por eso la plantilla lleva opt-out y por eso el
  Golden Bullet pregunta antes de mandar el enlace.
- Meta cuenta **únicos**: 1.000 mensajes a 1.000 personas distintas consumen todo; 1.000 mensajes
  repartidos en las mismas 300 personas consumen 300.

Cuando el WhatsApp Manager diga el escalón, fijarlo en el producto (RUNBOOK-DEPLOY §8.c):

```sql
-- Sushi Service está en NULL (mide, no frena). Con el número puesto, reserve_send_slot() falla
-- CERRADO al agotarse: lo que no cabe se encola y sale con el drenador (cada 15 min, 240 s, 20 en
-- paralelo). Poner el número REAL de Meta, nunca uno mayor.
UPDATE tenants
   SET messaging_daily_limit = 1000,        -- ← el del WhatsApp Manager
       messaging_limit_synced_at = now()
 WHERE slug = 'sushi-service';
```

El consumo se ve en `/dashboard/campaigns` (avisa al 75 %). Ritmo del drenador: 20 en paralelo ×
un cron cada 15 min es muy superior a 1.000/día; el techo lo pone Meta, no el sistema.

## 7. Lo que NO funciona en Zernio hoy, y pesa para los 1.000 diarios

1. ~~Golden Bullet es Twilio de punta a punta.~~ **Resuelto el 2026-09-12** (§A): lista, crea,
   prueba y manda por Zernio, y contesta el «sí» con texto libre en la ventana de 24 h. Lo que no
   cambió: el cupo es de la marca (A.7) y el saldo de Zernio se mira en su panel.
2. **Campañas a clientes existentes** (`/dashboard/campaigns`, cumpleaños, reactivación, eventos):
   sí funcionan en Zernio.
3. **Silencio conocido de Zernio**: la confirmación al operador de domicilios (18.c) y el acuse al
   SALIR por palabra clave. Ya no necesitan plantilla —`sendZernioConversationMessage()` manda texto
   libre en la ventana de 24 h—; falta decidir el texto y llamarlo.
4. **No hay saldo por tenant en Zernio**: se factura por Team. `/dashboard/twilio-balance` deja de
   aplicar; la billetera COP (`trg_debit_wallet`) sigue cobrando por `message_logs.twilio_sid`
   (que en Zernio guarda el `messageId`).
5. **El header de la firma del webhook** no está confirmado (`x-zernio-signature` o
   `x-late-signature`, `webhook/zernio/route.ts:580`). Se confirma con **un** entrante real: escribile
   al número desde tu celular y buscá en los logs de Vercel `[Zernio]`; un 401 ahí es este punto.

## 8. Prueba mínima antes del primer cliente

1. `node scripts/zernio-sandbox-test.mjs --account <accountId> --to 57<tu celular>` — **solo a tu
   número**.
2. Un check-in tuyo con el QR de Sushi Service → llega `bienvenida` o `puntos_sumados_*`.
3. Escribirle «hola» al número desde tu celular → en `message_logs` / logs de Vercel aparece el
   entrante sin 401. Escribir «BAJA» → aparece en opt-out.
4. Un pedido de domicilio desde un número de `authorized_numbers` → cae en `/dashboard/domicilios`.

## 9. Vuelta atrás

AIOS → propietario → «Reiniciar el alta de WhatsApp» (`ownerResetWhatsapp` → `aios_deactivate_whatsapp`):
Sushi Service vuelve a `twilio`, se vacían los `zernio_*` y **se borran todas las claves
`*_template_sid`** — por eso el §2. Restaurarlas a mano desde ese archivo, y en Twilio hace falta
un sender vivo (el que murió no vuelve). Zernio conserva el profile y la cuenta: reconectar el mismo
número da 409 y hay que registrar esa cuenta a mano en el paso 3.
