# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-11 (Golden Bullet: los tres textos editables en el panel; Opus 5; el push lo ordena el dueño)
> Toda sesión lo lee PRIMERO. Toda sesión que cierra un bloque lo ACTUALIZA al final. Límite: 150 líneas.
> Lo obsoleto se **saca**, no se tacha: un ítem tachado sigue costando tokens cada vez que alguien lee esto.
>
> **Sus dos hermanos:**
> - [docs/RUNBOOK-DEPLOY.md](docs/RUNBOOK-DEPLOY.md) — los pasos exactos del despliegue, en orden, verificados contra el código.
> - [docs/ESTADO-REQUERIMIENTOS.md](docs/ESTADO-REQUERIMIENTOS.md) — §1–§25 del encargo, auditados contra el código. Ahí vive **qué falta desarrollar**.

---

## 1. Foto actual

| Qué | Estado |
|-----|--------|
| Código | **`origin/main` = `cc13745`** (pusheado el 2026-09-11, 04:25, por orden del dueño: Golden Bullet con los tres textos editables y `{nombre|alternativo}`; antes, `a55f574` a las 03:45: el flag, el Toaster y el normalizador de celulares). Antes, `d47ade8` + su commit de docs (02:30: rendimiento del equipo, 00065 **aplicada antes**). Antes, en el mismo día: `76d99b7` (AIOS + 00064, plantillas) y `3278f66` (invitaciones, 00063). **Local = remoto.** La carpeta sigue en `feat/multisede-aios` (= `main`). Sin mergear a propósito: `master`, `port/sushi-fun-2.8`, `sushi-sync`. **Variables que el código desplegado espera en Vercel:** `TWILIO_MASTER_TENANT_ID` (RUNBOOK §1.b'; sin ella Sushi Service deja de enviar por Twilio) y las tres de Meta (§1.b'', no bloquean) |
| Verificación | ✅ 2026-09-11 (04:05): `tsc` limpio · lint limpio en lo tocado · **suite entera: 48 archivos / 748 tests en verde** · eslint **7 errores preexistentes** (hooks y gráficas del panel, ninguno en lo tocado). El rojo de `aios-health` era del RELOJ (el helper mete dos pedidos con `now() - 1h`/`- 2h`, así que entre medianoche y las 2 a.m. el segundo cae en el día anterior): a esta hora pasa. Sigue sin corregirse. `build` no se corrió |
| Marcas vivas | **5**: sushi-service (542 clientes), demo-ventas (412), sushi-fun (251), don-alirio (244), cafe-frangal (8) |
| Base de datos de producción | ✅ **Aplicadas hasta la `00056`** (dueño, 2026-09-08: `00047`, `00050`, `00051`, `00053`, `00054` y `00056`, todas). El esquema ya alcanza al código de `main`. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga). Huecos: `00048`, `00049`, `00052`, `00055`. **`00062` aplicada** (dueño, 2026-09-11, antes del push). **`00065` aplicada** (dueño, 2026-09-11, antes del push). **Escritas sin aplicar: `00058`, `00059`, `00061`, `00064`** |
| Migraciones: dónde están | El directorio muestra **solo la rama puesta**; el inventario real y el número de la próxima los da `node scripts/proxima-migracion.mjs`. **Desde el 07 la única reserva es la fila del tablero (§2)**: un número citado en cualquier otro doc no reserva nada. `00048`, `00049`, `00052` y `00055` son huecos: no se rellenan |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**; la auditoría estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| AIOS (`Level 2.0/aios-constelarys`) | **Local `c8a1917` (v1.11.0, 2026-09-11, SIN pushear)**: borrar propietario entero, lista Twilio \| Zernio con recarga, reinicio de WhatsApp, Embedded Signup que se anota solo (00010 del AIOS, sin aplicar), `ZERNIO_SIMULATE` solo con `true`. Necesita la **00064 del producto** aplicada y `ZERNIO_API_KEY` vigente en su Vercel. Antes: **`origin/main` = `b6fd308` (v1.10.0), pusheado el 2026-09-10**: las 13 plantillas copiadas del producto (sin 🍣, emoji por rubro), media de muestra desde `ZERNIO_TEMPLATE_SAMPLE_{IMAGE,VIDEO}_URL` **del Vercel del AIOS** (las dos son obligatorias o el paso 4 no arranca), y nombres `_v2` cuando el base ya existe en la WABA |
| Grafo | Reconstruido a mano el 2026-09-11 04:30 (5.535 nodos, 539 comunidades). Hook post-commit instalado el 07 (`graphify hook status`): se actualiza solo en cada commit. ⚠️ 169 comunidades renombradas por su hub: `graphify label` las refresca (cuesta LLM, no se corrió) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

> **Es el TABLERO.** Una fila por sesión viva, anotada y commiteada sola ANTES de tocar nada; se borra al cerrar.
> Dos filas no comparten archivo. La migración escrita acá es su ÚNICA reserva. Regla: `CLAUDE.md` § "modo simple".

| Sesión (qué, quién, cuándo) | Modelo | Archivos / carpetas que toca | Migración | Estado |
|---|---|---|---|---|
| Golden Bullet: el «nombre genérico» de `{{1}}` se escribe al lado del mensaje 1 y se guarda en la marca — Opus 5, 2026-09-11 | Opus 5 | `src/components/dashboard/ImportedContacts{Template,Uploader}.tsx` · `src/services/club-optin.service.ts` · `src/app/api/dashboard/imported-contacts/{template,confirm}/route.ts` · `docs/features/golden-bullet.md` | — | en curso |

## 3. Siguiente, en orden

0.AIOS **Antes de que el dueño registre el número real de Tepuy (mañana, 2026-09-12).** En orden:
   1. **Aplicar la `00064`** en el Supabase del producto (borrado, `aios_deactivate_whatsapp`,
      `aios_wallet_topup`; riesgo nulo salvo la primera, que lleva tres candados) y la **`00010`** en
      el Supabase del AIOS (el retorno del Embedded Signup se anota solo).
   2. **Vercel del AIOS:** `ZERNIO_API_KEY` vigente (la de `.env.local` da 401), **`ZERNIO_SIMULATE`
      fuera** (desde v1.11.0 solo simula con `true`), y `AIOS_ADMIN_PROVISION_SECRET` igual al del producto.
   3. Desplegar producto (`tenant-delete`) y AIOS (v1.11.0). En el AIOS: Tepuy → «Reiniciar el alta de
      WhatsApp» (deja el producto en `twilio` sin el `+573000000000`) → borrar los dos propietarios de
      prueba → rehacer el alta de Tepuy de verdad: el link ya no dice `client_id=sim` y el paso 3 se
      cierra solo cuando la clienta termina.
   ⚠️ `clubtepuy.constelarys.com` (raíz) con DOS sedes activas **no debe llevar a Envigado**: por D21
   responde 409 con la lista de sedes. Si lleva a Envigado, o Laureles está inactiva en el producto, o
   Envigado tiene el dominio raíz como propio. Se mira en `/dashboard/sedes` de Tepuy.
0.PLANTILLAS **Rediseño del sistema de plantillas: diagnóstico cerrado el 11, decisión pendiente del dueño.**
   Textual: *"me está causando mucha fricción… un sistema altamente mediocre aunque le hayamos metido
   esfuerzo"*. Todo está en **`docs/PENDIENTES-PLANTILLAS.md`**: nueve fallas verificadas en el código y
   un plan de ocho pasos. Las tres que quitan la fricción: (1) el AIOS deja de crear plantillas y llama al
   producto —hoy son DOS catálogos, DOS rastreadores de aprobación y todo tenant Zernio ve 13 «activo sin
   texto»—; (2) el catálogo no cubre `tier_unlocked_template_sid` ni `reward_reminder_template_sid`, así que
   **en Zernio el cruce de nivel es silencio total**; (3) una sola pantalla Mensajes para los dos proveedores
   (hoy tres, y Ajustes › Plantillas le miente a un tenant Zernio). Las dos que bajan el costo: reducir de 13
   a 8 aprobaciones por tenant y probar UTILITY en los recibos. Nada construido.
0.GB **Golden Bullet por bloques y sondeo de salud: construidos el 10, faltan CUATRO cosas del dueño.**
   El código está en la rama (`640ae1f`). En este orden:
   0. **Encender el flag desde la pantalla** (botón «Encender Golden Bullet», 2026-09-11). Sin eso
      todo responde 403: era la causa de «el CSV no carga». El CSV que sube es `telefono,nombre`;
      los dos de Sushi Service ya están listos en `Contactos/salida/GOLDEN-BULLET-*.csv` (7.438
      recientes + 6.688 antiguos; a US$0,0175 son ≈US$247 y Twilio tiene US$18,90: **recargar antes**).
   1. ✅ **La `00060` ya está aplicada** (dueño, 2026-09-10, antes del push).
   2. **Escribir los tres textos y crear la plantilla. Meta tarda 24-48 h**, así que es lo
      primero del día. `/dashboard/imported-contacts` → «Plantilla»: el mensaje 1 entero con
      sus botones (desde el 11 se escribe ahí, `{{1}}` obligatoria y `{{2}}` opcional), la
      respuesta al «sí» con `{nombre}`/`{enlace}` y la **foto del regalo**, y la del «no».
      Antes del «sí»: crear la invitación con premio en Recompensas → Invitaciones y marcar
      «Usar en Golden Bullet» — sin eso, quien se registra **no recibe regalo** (la pantalla lo
      avisa en ámbar). El texto tiene que decir de dónde salió el número, **y ser verdad**.
   3. **Correr el sondeo en modo ensayo ANTES de dejarlo suelto**:
      `GET /api/cron/line-health?dry=1` con el `CRON_SECRET`. Devuelve el escalón y la
      calidad que ESCRIBIRÍA en cada marca, sin escribir. Es la primera vez que algo va a
      poner un número en `messaging_daily_limit`, y ese número es el freno de las campañas
      de marcas en producción: vale la pena mirarlo una vez. **Ese dry-run es además la
      respuesta a "¿de verdad tenemos el límite?"**, la pregunta del dueño del 10.
   4. **Decidir de qué marca es la base de 25.000 y con qué escalón.** El punto 3 lo
      contesta solo. La aritmética que hay que ver antes de prometer nada: a 250 son
      **139 días**; a 1.000, 27; a 10.000, 3. Golden Bullet dejó de ser una bala.
   ⚠️ **Si la base es comprada o de origen desconocido**, la línea de procedencia de la
   plantilla no puede decir «porque nos visitaste». Por eso la plantilla PREGUNTA en vez de
   promocionar: convierte una base sin consentimiento en una lista de gente que sí lo dio.
0.ALFA **ANTES de habilitar la sede 2 de cualquier marca — auditoría adversarial 2026-09-09.**
   Lo que sigue está confirmado leyendo el código, no supuesto. En orden de ejecución:
   1. **En el AIOS, marcar el cliente como «grupo» ANTES de dar de alta las sedes 2..N.**
      Si no, el paso 2 del wizard sigue ofreciendo crear un tenant por sede y salen N MARCAS,
      no N sedes. Es lo que le pasó a Tepuy. (`brands.ts:119` — `attachableBrands` devuelve `[]`
      si el modelo no es `group`.)
   2. **Darle subdominio propio a CADA sede, incluida la primera.** `aios_add_location` rechaza
      la sede 2 con `sede_previa_sin_subdominio` si la sede 1 vive del dominio raíz (00056).
      Elegir para la MARCA un host raíz distinto del de toda sede.
   3. **Asignarle sede a cada mesero — o marcarlo «Rota entre sedes».** Todos los vivos tienen
      `location_id` NULL y `/api/staff/waiters` filtra por sede: con 2+ sedes, **los escáneres
      salen vacíos**. Sigue siendo una DECISIÓN, persona por persona — pero ya no cuesta doce
      formularios: `/dashboard/staff` → «Asignar sede a varios a la vez» (casilla, sede **o
      «Rota entre sedes»**, aplicar; la `00062` ya está aplicada — dueño, 11: «la mayoría son
      rotativos»). Para varias marcas de una sentada, `SQL-PARA-CORRER/meseros-sin-sede/`.
   4. **`authorized_numbers.location_id` por cada sede.** Ya se escribe desde el panel
      (`/dashboard/authorized-numbers`, columna «Sede»); lo que YA existe sigue en NULL y hay que
      asignarlo: esa pantalla o `SQL-PARA-CORRER/authorized-numbers-sin-sede/`. ⚠️ Un celular
      existe UNA vez por marca (`authorized_numbers_phone_tenant_key`): si las 12 comparten de
      verdad el mismo celular de operador **no hay sede correcta**, se queda en «sede desconocida»
      y la salida buena es un celular por sede.
   5. **Confirmar el cupo real de la línea con Meta/Zernio** y ponerlo en
      `tenants.messaging_daily_limit`. Las N sedes comparten UN cupo de destinatarios únicos por
      24 h y el sistema falla CERRADO (00037). Ojo con los dos estados: las 5 marcas vivas están
      en **NULL** (miden, no frenan) y toda marca **nueva** nace en **250**, que con 12 sedes se
      agota a media mañana. El consumo ya se ve en `/dashboard/campaigns` (avisa al 75 %); el
      `UPDATE` con su advertencia está en `docs/RUNBOOK-DEPLOY.md` §8.c.
0.BETA **Lo que la auditoría dejó SIN JUZGAR** (34 de 95 agentes murieron por el límite de gasto
   de la cuenta, incluida la síntesis). Se corrigieron ya: el selector fantasma, el 409 sin
   pantalla, el 409 falso del PATCH de niveles, las filas heredadas editables y las dos guardas
   del POST de accesos, y el 09 **el agujero de permisos de `/api/dashboard/reward-tiers`**
   (era el más caro): sus escrituras exigen alcance de MARCA. **Quedan SIN verificar**:
   `/api/mystery-box/resolve` (otorga premios sin visita ni límite de tasa) y la coordenada
   con decimales en «Mis sedes».
0.GAMMA **Recompensas por sede: ya se pueden usar, con la `00059` aplicada ANTES.** Los dos
   agujeros están cerrados en el código (09): el «ya reclamé» dejó de llevarse por `tier_id`
   —copiarle los niveles a una sede ya NO le gana un premio a nadie— y `current_tier` pasa a ser
   **el nivel de la MARCA** (se elige la salida «b»; el porqué en `points-mystery-box.md`
   §7.1.bis). **Hasta que la `00059` corra en Supabase, seguir sin apretar «Darle premios
   propios»**: sin ella el código nuevo pide `claimed_tier_key` y PostgREST devuelve 42703.
   Lo que la 00059 NO tapa: `/api/mystery-box/resolve` **no tiene ninguna guarda de «ya
   reclamé»** —ni por id ni por umbral—, así que el único freno sigue siendo que
   `check-in/status` no lo ofrezca. Es el mismo endpoint del 0.BETA y ahora tiene con qué
   guardarse (`claimed_tier_key` / `claimed_threshold`); falta hacerlo. Tampoco se tocó
   `mystery_box_global_caps`, que sigue por `tier_id`: con premios propios el cupo global de
   premios altos pasaría a ser **por sede** sin que nadie lo haya decidido.
0.DELTA **Un administrador de sede abre un panel VACÍO.** `role='location'` nunca ve el cubo
   NULL (`location-scope.ts`, fila 4 del §5.1) y todo el histórico anterior a multi-sede es NULL.
   **(b) ya está hecha** (09): «Accesos» avisa, al elegir «Administrador de sede», que esa
   persona verá su sede **desde hoy** y no el histórico. **Falta la decisión del dueño sobre
   (a)**: darle además el cubo NULL de las sedes que tiene asignadas mientras el histórico no
   esté atribuido. (a) toca `decideLocationScope()` y por lo tanto **los dos espejos** —el TS y
   `can_see_location()` de la 00045, que `tests/db/multisede-permisos.test.ts` vigila—, así que
   no se hace por cuenta propia. El histórico NO se backfillea en ninguno de los dos casos.
0.ZETA **`rewards` y `campaign_rewards` recibieron `location_id` pero NADIE lo lee.** «Las
   recompensas varían por sede» hoy es cierto **solo** para `reward_tiers`. Los premios por
   visitas y los de campaña siguen siendo de la marca.
0.ETA **La importación de clientes por CSV cuenta como importados los que la base rechazó**
   (`dashboard/customers/page.tsx:156-161`: no mira `res.ok`). Con 2+ sedes el registro responde
   409 y la importación reportaría éxito sobre cero filas.
0.THETA **El requisito «un celular por sede» NO está construido** y hay que decirlo antes de
   firmar. La línea se elige leyendo solo columnas de `tenants`; un subdominio de sede resuelve a
   la MISMA fila. Lo que sí hay por sede: enlace `wa.me`, teléfono de domicilios y ficha propia.
0.IOTA **WhatsApp nunca se estrenó de verdad, y los dos restaurantes nuevos estrenan caminos
   DISTINTOS.** `docs/features/zernio-messaging.md` lo dice con todas las letras: *"no se ha
   enviado un mensaje de verdad a un número controlado por el equipo con un tenant
   `messaging_provider='zernio'` en producción"*. Ojo con la confusión de base: **coexistencia
   NO es lo mismo que Zernio**. Coexistencia es `whatsapp_provisioning.route='own_number'`
   (trae su número: `onboarding='business_app'`, `isCoexistence=true`, no cotiza ni compra);
   Zernio es `tenants.messaging_provider`. Sushi Fun es coexistente **por Twilio**, absorbido
   por SQL, no por el wizard — así que no prueba nada del camino nuevo.
   En orden, antes de mandarle un mensaje a un cliente real:
   1. **`ZERNIO_WEBHOOK_SECRET` en Vercel.** Sin él el webhook rechaza TODO (es a propósito:
      exige firma siempre, aunque Zernio la trate como opcional). No está en `.env.local`.
   2. **Confirmar el NOMBRE del header de la firma.** `webhook/zernio/route.ts:580` acepta
      `x-zernio-signature` **o** `x-late-signature` porque nadie confirmó cuál manda Zernio.
      Si no es ninguno de los dos: 401 a todo entrante, no llega ningún cuadro de pedido y
      **parece un problema de permisos**. Se confirma con UN mensaje entrante real.
   3. **Decidir la cuenta/Team de Zernio** (la compartida con otro proyecto o una dedicada).
      El saldo se factura por Team completo y no hay endpoint de saldo por tenant.
   4. **Probar el envío con `scripts/zernio-sandbox-test.mjs --to <tu propio celular>`.**
      ⚠️ El número de sandbox (`+12029087457`) es COMPARTIDO entre todos los desarrolladores
      que prueban Zernio: nunca a un cliente, nunca a un número ajeno.
   5. **Los dos nacen con `messaging_daily_limit = 250`** (DEFAULT de la 00037). Es el punto 5
      del 0.ALFA y aplica igual con una sola sede.
   6. **Plantillas de evento: el dueño las está creando A MANO en Twilio (Sushi Fun, Sushi
      Service, Don Alirio) y ya hubo dos rechazos, los dos leídos con
      `scripts/verificar-plantillas-evento.mjs` (solo lectura, `.env.twilio` / `.env.sushifun`):
      `image_campanas_calendario` → «Error downloading invalid media URL» (`Zernio_template.jpg`
      NO está en la raíz del bucket; usar `5103017800669793459.jpg` y `0906.mp4`, que responden
      200) · `image_campaing` → `INVALID_FORMAT`: el marco tenía 8 palabras para 5 variables y
      Meta exige 3×N+1. **El cuerpo corregido (22 palabras) está en `docs/PLANTILLAS.md`
      § Plantilla 12 y en `SQL-PARA-CORRER/plantillas-evento-viejas/LEEME.md`**, con los ejemplos
      y la Media URL con `{{6}}`. Una plantilla rechazada NO se reintenta en Twilio: se crea otra
      con nombre nuevo. Al aprobar: pegar el `HX…` en `admin_settings.event_template_*_sid` del
      tenant. Zernio (AIOS v1.10.x, Pedacito/Tepuy): «Crear plantillas» cuando tengan el paso 3 y
      las dos `ZERNIO_TEMPLATE_SAMPLE_*_URL` en el Vercel **del AIOS**. Producto y AIOS con el
      cuerpo corregido: **sin pushear** (`675fdbe` en el AIOS).
0.quinquies **Aplicar la `00058` y la `00059` en Supabase** (producto) y la **`00009` en el Supabase del AIOS**,
   en ese orden y ANTES de desplegar. Sin la 00058, `/dashboard/sedes` responde **503** al guardar
   (`merge_location_config_deep()` no existe) y las columnas `location_id` de recompensas tampoco.
   Sin la 00009 del AIOS, guardar un cliente revienta con el CHECK viejo en cuanto alguien elija
   «grupo» o «franquicia». La `00060` (10) y la `00063` (11) ya las corrió el dueño antes de cada push. Las dos que
   quedan son de RIESGO BAJO: no tocan una sola fila de historia. **Y la `00061`** (`tenant_integration_secrets`, el token de la API
   de Conversiones por marca): tabla nueva, riesgo cero, puede ir después del código; hasta que corra, el panel
   responde 503 al guardar el token de una marca. La `00062` (meseros rotativos) ya está aplicada (11). La `00065` (rendimiento del equipo) ya está aplicada (11).
0.quater **Falta el autoservicio de contraseña** («olvidé mi contraseña» en `/login`). Ya se puede
   cambiar una clave desde «Accesos» y desde el AIOS, así que nadie queda encerrado — pero mientras
   no exista el autoservicio, cada olvido sigue pasando por una persona. Depende de que el SMTP del
   proyecto de Supabase esté configurado, que **no está comprobado**: comprobarlo es el primer paso.
0.ter **Aplicar la `00057` en Supabase** (`aios_list_locations()`, `SECURITY DEFINER`). Sin ella el AIOS
   **no puede leer las sedes**: el paso 3 del alta falla con `42501 permission denied for schema auth` en todo
   negocio con dos locales. No bloquea el alta —el paso 3 solo comprueba—, pero deja la verificación a ojo.
   ⚠️ Su primera versión hacía `GRANT USAGE ON SCHEMA auth` y **no sirve**: en Supabase ese esquema es de
   `supabase_auth_admin` y el GRANT sale como WARNING, no como error. → `docs/features/multi-sede.md` §3.sexies.
0. **`AIOS_ADMIN_PROVISION_SECRET` en los DOS Vercel**, la MISMA cadena — el dueño la estaba cargando el 08,
   con el código ya desplegado. Sin ella el producto responde **503** y la tarjeta «Usuario del panel» se ve
   pero dice que está apagada. Comprobarla dando de alta a **Pedacito de Amor**, que espera su usuario;
   si algo falla, el SQL de `docs/features/alta-usuario-admin.md` §7 hace lo mismo a mano.
0.bis **Tepuy nació como DOS marcas** (`clubtepuylaureles` 01:48 y `clubtepuyenvigado` 01:53): el alta salió con
   el AIOS **v1.5.2**, que creaba un tenant por sede; la v1.6.0 quedó desplegada a las ~01:59. **Decisión del
   dueño (08): se borran las dos y se rehace como UNA marca con dos sedes, compartiendo un solo número.**
   Los QR ya están impresos, así que los dos subdominios se reusan TAL CUAL, ahora como dominio de cada SEDE,
   y la marca estrena `clubtepuy.constelarys.com` (el raíz manda aunque una sede lo repita: sería el 409).
   Paso a paso en `SQL-PARA-CORRER/tepuy-una-marca/LEEME.md` (el 02 va en el Supabase del **AIOS**).
   **Corre prisa**: los dos subdominios responden, y el primer check-in convierte esto en otro problema.
   La clienta pidió **un celular por sede**: eso es **F9** (`location_messaging`, cupo y plantillas por línea)
   y choca con **D6**; por ahora comparten línea. Sin decidir.
1. ✅ **Las seis migraciones (00047–00056) del producto y la `00007` del AIOS están aplicadas** (dueño, 2026-09-08).
   Del AIOS queda **desplegar la v1.6.0** (mergear `feat/multisede-aios` → `main` del AIOS), que lo está puliendo
   otra sesión del dueño el 08. Recién ahí se da de alta Tepuy y la sede 2 engancha.
1.bis **Pusheado `c96bce5` a `main` el 08 (noche).** Falta la mirada del dueño: abrir `/dashboard/marca` (ahora "Tarjeta principal"), cargar redes/sellos de una marca y abrir
   su `/tarjeta` en un celular. Sin config nueva, ninguna marca cambia.
2. **Smoke test** del `docs/RUNBOOK-DEPLOY.md` §5 con Sushi Service real, apenas terminen las cinco:
   crear un evento con enlace, abrir Conexiones, y mirar la tarjeta en un celular.
3. **Asignarle sede a los meseros que ya existen, o marcarlos rotativos.** Todos tienen `location_id` NULL, así
   que **no aparecen en ningún escáner**. Falta solo la DECISIÓN, persona por persona: la herramienta ya está en
   `/dashboard/staff` («Asignar sede a varios a la vez», con la opción «Rota entre sedes» desde la `00062`) y en
   `SQL-PARA-CORRER/meseros-sin-sede/`.
4. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo coexistencia. ⚠️ **Se intentó
   el 08 y no se puede desde esta máquina**: la `ZERNIO_API_KEY` de `.env.local` responde **401** a todo GET
   (`/v1/profiles`, `/v1/phone-numbers`, `/v1/api-keys`), `.env.local` no tiene credenciales de Supabase, y no
   hay un teléfono propio al que mandar. Hace falta: la key vigente (la de Vercel), el `accountId` de la marca
   Zernio y un número del dueño para `scripts/zernio-sandbox-test.mjs --account … --to …`. Con él va
   **`ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL`** = `…/event-media/5103017800669793459.jpg` en Vercel (la muestra
   que Meta YA aprobó; el HEIC del bucket **no sirve**). Sin ella las 2 de calendario salen bloqueadas.
5. **`owner_email` está vacío en las 5 marcas**: Conexiones **solo la opera el super-admin** (`isTenantOwner()`
   es fail-closed y la pantalla lo dice). Una llamada por cada alta hasta que el AIOS lo mande.
6. **Subdominio sin tenant muestra Sushi Service** (comprobado el 07 con `pedacitodeamorclub.constelarys.com`):
   `getBrandingForHost()` cae a `DEFAULT_BRANDING` (`NEXT_PUBLIC_BRAND_*`). Sin fuga de datos, pero un cliente
   que abre su enlace antes del alta ve otra marca. **Qué mostrar (404, página neutra) es decisión del dueño.**
7. **De §18 quedan DOS** (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`): **18.e** (a los clientes de Sushi Fun
   se les contesta que ese número «es exclusivo para mensajes automáticos») y **18.c** (plantilla de fallo de Zernio).
8. **De `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md`** queda vivo el AMARILLO de `reward-reminder` (Crons). El
   ROJO 3 está entero en `main` y vive solo hasta que corra la 00053. Siguen stale: `docs/ESTADO-REQUERIMIENTOS.md`
   (además da por abierta la **18.e**, que ya está hecha en Conexiones C1) y `docs/04-deployment.md`.
9. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
10. **Onboarding de los 25**: wildcard DNS ya resuelto y probado con Sushi Fun.

**El norte** (dueño, 2026-09-05, corregido el 09-11): **Meta ya está entera** — píxel + API de Conversiones, y
**cada marca conecta la suya** desde el panel (`docs/features/meta-pixel.md`). **El píxel de Cada1 queda APAGADO
por decisión** (09-11): cruzar la base de una marca para la campaña de otra viola finalidad y responsable de la
Ley 1581, así que un buzón con las 25 juntas no aporta nada que valga ese riesgo. **NO se desarrollan todavía**:
automatizaciones dentro del restaurante y **Google** para reseñas.

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Aplicar la `00061` en Supabase** (`tenant_integration_secrets`). Es lo ÚNICO que un restaurante necesita de
  nuestro lado para conectar su píxel: sin ella el panel responde 503 al guardarle el token. Riesgo cero.
- **Ver la API de Conversiones funcionar UNA vez** con el píxel de un restaurante real y el código de «Probar
  eventos» de SU Administrador de eventos: es la única verificación que esta feature no tuvo
  (`docs/features/meta-pixel.md` § Cómo se verifica). `NEXT_PUBLIC_META_PIXEL_ID` y
  `META_CONVERSIONS_ACCESS_TOKEN` **se quedan vacías**: el píxel de Cada1 está apagado por decisión (§3, el norte).
- **Decidir qué pasa con los clientes que ya existían.** La casilla nueva (celular cifrado a Meta) la aceptan
  los que se registran desde hoy; los anteriores aceptaron WhatsApp y nada más, y sus check-ins **sí** se mandan
  con el celular hasheado. Separarlos cuesta guardar la versión del consentimiento por cliente y filtrar en
  `scheduleMetaConversion()`. Es una decisión, no un bug.
- **Borrar las ramas locales ya mergeadas** (`feat/salud-aios`, `feat/domicilios`, `feat/conexiones`, `feat/visual`,
  `preview/capa-visual`) y el **stash** olvidado de `fix/opt-out-visible` (`git stash show -p stash@{0}` para mirarlo).
- **Borrar el Supabase de Sushi Fun.** Esperar a un fin de semana de operación normal. El respaldo son los
  `SQL-PARA-CORRER/sushi-fun/*.sql` (1.421 filas), que **NO cubren** Auth, RLS ni storage. El Vercel viejo queda **pausado**.
- **Las preguntas abiertas de producto** (§18.a–d, §16.a–e, §17.a–d, §15.b, §12, §9): `docs/ESTADO-REQUERIMIENTOS.md`.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.
- Decisiones ya CERRADAS que no se reabren: **D6** (N líneas por marca, la sede no obliga a ninguna; `multi-sede.md` §5) ·
  **D21** (un subdominio por sede, todas pares; con 2+ sedes el dominio RAÍZ deja de registrar, 409; `multi-sede.md` §3.5).

## 5. Hecho reciente

- **Golden Bullet, listo para la campaña de amor y amistad** (2026-09-11, sin migración, **desplegado** en `cc13745`):
  el CSV «no cargaba» porque el flag nacía apagado y el 403 era mudo (ahora hay botón para encenderlo y la
  página monta el Toaster); los tres textos del flujo se escriben en el panel (mensaje 1 con botones,
  respuestas al sí —con foto y `{nombre|¿cómo estás?}`— y al no); `{{2}}` es opcional; el normalizador de
  celulares ya no deja pasar extranjeros. Los dos CSV de Sushi Service (7.438 + 6.688) están en
  `Contactos/salida/GOLDEN-BULLET-*.csv`, fuera del repo. Faltan del dueño: invitación con premio,
  plantilla a Meta (24-48 h), billetera COP y saldo Twilio (ver 0.GB).
- **Rendimiento del equipo** (2026-09-11, migración `00065`, **aplicada y desplegada**): el dueño preguntó dónde se
  veía cuántos clientes escaneó cada mesero y qué mesas piden más, y la respuesta era «en ningún lado»: los
  datos se guardaban desde la 00009/00018 y nadie los leía. Apartado nuevo **«Rendimiento»**
  (`/dashboard/rendimiento`): escaneos · nuevos · frecuentes · premios por mesero, y mesas por escaneos y premios.
  «Nuevo» = primera visita del cliente en la marca (por historia, no por flag). Sin mesero / sin mesa = fila
  propia. Nada en pesos. → `docs/features/staff-activity.md`.
- **El AIOS borra, deshace y recarga** (2026-09-11, migración `00064`, **SIN aplicar**; AIOS v1.11.0
  local): `aios_delete_tenant` (toda tabla con `tenant_id`, por pasadas, nunca el puente ni >100
  comensales, `dry_run` por defecto) detrás de `POST /api/aios/tenant-delete`, que además borra los
  usuarios de Auth por GoTrue; `aios_deactivate_whatsapp` (Tepuy tenía el número del simulador);
  `aios_wallet_topup` solo Twilio. En el AIOS: lista en dos grupos Twilio \| Zernio, «Simulado» en
  vez de un cupo inventado, y el retorno del Embedded Signup escribe solo por una función `anon`
  con candado (00010). → `docs/features/aios-borrado.md`.
- **Invitaciones con premio** (2026-09-11, migración `00063`): un enlace `/c/{slug}` o su QR que
  regala algo a quien se registre; el premio le queda en la tarjeta desde el registro y **solo se
  entrega cuando el mesero lo escanea**. No hay «tarjeta provisional»: el premio es un `reward_grant`
  con `source='invite'`. Quien llega por invitación **no** suma la visita #1 hasta que viene — se
  fuerza por el ORIGEN del registro, no con el interruptor global. Recompensas pasó a ser una
  pantalla con tres pestañas (Niveles · Invitaciones · Redenciones); `/dashboard/redemptions`
  redirige. Golden Bullet puede usar una invitación como regalo de bienvenida. Referidos (§2 del
  diseño) sigue sin construir y se para encima de esto. → `docs/features/invite-campaigns.md`.
- **Meseros rotativos** (2026-09-11, migración `00062`, **aplicada y desplegada**): el
  panel obligaba a UNA sede por mesero (D11) y «la mayoría son rotativos». Estado explícito
  `staff_users.works_any_location` —no se reinterpreta el NULL, que sigue siendo «sin sede
  asignada» y sigue sin backfillearse—: el rotativo tiene sede NULL (CHECK), sale en la lista de
  TODOS los aparatos de la marca además de los de cada sede, y la visita se atribuye a la sede
  del APARATO. Cuarta llave de identidad (UNIQUE de nombre entre rotativos + trigger anti-cruce
  con los de sede). Selector de Sede con «Rota entre sedes» en Crear, Editar y en masa. D11
  revisada, no derogada: una fila, una persona, una sede por visita; lo prohibido sigue siendo
  «de dos». → `docs/features/staff-qr-scan.md` § «Meseros rotativos».
- **El asistente dejó de ofrecer plantillas que romperían el envío entero** (2026-09-10, sin
  migración): las MARKETING del catálogo llevan 3 o 4 variables y Golden Bullet solo rellena dos,
  así que elegir una mandaba un envío con variables faltantes que el proveedor rechaza al 100% de
  los destinatarios — y solo se veía después de confirmar. Ahora se ofrecen únicamente las que
  usan `{{1}}` y `{{2}}`.
- **El goteo dejó de ser a ciegas** (2026-09-10, sin migración): pestaña «En curso» con lo que
  salió HOY y **botón de parar**. Pausar NO es un estado nuevo —sería un error caro: el
  anti-duplicado de la 00038 solo cubre `status='queued'`, así que sacar un item de ahí libera
  su hueco y la campaña se podría re-encolar entera— sino `not_before` en el año 9999.
  Reanudar reprograma desde hoy y acepta otro ritmo. La plantilla se crea desde el panel, sin
  copiar tokens. El bloque que se propone por defecto pasó a ser **la mitad** del cupo: los
  cumpleaños no pasan por esta cola y un goteo que vacía el presupuesto de madrugada los mata.
- **Golden Bullet por bloques + el freno de línea encendido** (2026-09-10, migración `00060`):
  encolaba nada y enviaba todo dentro del request — con 25.000 contactos moría a los 300 s.
  Ahora reparte en bloques diarios con un `not_before` escalonado (el drenador no cambió) y
  `/api/cron/line-health` escribe por fin `messaging_daily_limit`, que estaba en NULL en las
  5 marcas: el freno de la 00037 llevaba desde agosto **medido y apagado**. De paso:
  `isPhoneOptedOut()` miraba solo `customers`, así que el "no" de quien nunca fue cliente no
  lo leía nadie.
- **El píxel de Cada1 queda apagado** (2026-09-11, solo docs): el dueño preguntó para qué le servía un píxel
  propio y la respuesta honesta es que solo para tirar campañas a los comensales de sus clientes; hacerlo con la
  base de una marca para otra es tratamiento sin autorización (Ley 1581: finalidad y responsable), y con la de
  cada marca para esa marca lo hace igual de bien el píxel de la propia marca. El código queda (dos variables
  vacías = cero bytes de Meta), la decisión vive en `meta-pixel.md`. Si un día ofrece «yo te manejo los
  anuncios», el camino es acceso de socio a la cuenta publicitaria del restaurante, no un píxel de Cada1.
- **La API de Conversiones de Meta** (2026-09-11, **migración `00061`, SIN aplicar**): cada registro y
  cada check-in se manda también desde el servidor (`after()` en `POST /api/check-in`) con el celular
  **hasheado SHA-256**, a los dos píxeles, cada uno con SU token (Cada1: env; la marca:
  `tenant_integration_secrets`, solo service role, ningún endpoint lo devuelve). Navegador y servidor
  comparten un `event_id` **determinista** (`reg-<customer.id>` / `visit-<visit.id>`) porque el
  navegador dispara a veces mucho después (el QR del mesero); `status` lo devuelve. **Con mesero no
  viajan IP, user-agent ni `_fbp`**: serían del mesero y Meta aprendería que su celular es cada
  cliente. La primera visita no es `CheckIn`. La casilla del check-in y `/privacidad` §7 dicen que el
  celular sale cifrado y que cifrado no es anónimo. → `docs/features/meta-pixel.md`.
- **El píxel de Meta, y la política que lo dice** (2026-09-10, sin migración): las páginas públicas
  disparan `PageView`, `CompleteRegistration` (cliente nuevo) y `CheckIn` (el que vuelve; el
  duplicado NO cuenta). **Son DOS píxeles y no uno**, porque un píxel solo alimenta a la cuenta que
  lo creó: el de Cada1 (`NEXT_PUBLIC_META_PIXEL_ID`, el mismo en las 25 marcas, con el slug y la
  sede en cada evento) y el propio de cada restaurante (Configuración → Píxel de Meta, que estrena
  `config.integrations` con su ÚNICA ruta en la whitelist — un id de píxel es público y no lo
  escribe ningún OAuth; un token sigue sin entrar ahí ni nunca). **A Meta no le va ni un dato
  personal**: solo marca, sede y pantalla, por una única fábrica con un test que fija la lista de
  claves. **`/mesero/*` no se mide** — cuarenta escaneos por turno meterían al empleado en la
  audiencia como el cliente más fiel de la marca —, y el aviso al cliente sale del MISMO predicado
  que el script, así que no puede haber una página que mida sin avisar. La política de privacidad
  estrena §7 (qué se manda, qué no, cómo evitarlo) y §6 dejó de decir que no compartimos nada con
  terceros, que ya no era verdad. → `docs/features/meta-pixel.md`.
- **Los tres huecos del día 1 de una marca de 12 sedes** (2026-09-09, sin migración): (a) asignar
  sede a los meseros deja de ser un formulario por persona — `/dashboard/staff` gana «Asignar sede a
  varios a la vez», que **no adivina nada** (solo deja marcar a quien NO tiene sede y repite por
  dentro el mismo `PATCH` del lápiz, uno por uno, con las guardas del motor intactas); (b)
  `authorized_numbers.location_id` **ya se escribe** desde el panel —existía desde la 00043 y nadie
  lo escribía, así que todos los domicilios de todas las sedes caían en «sede desconocida»— con la
  guarda de que un administrador de sede no se los lleve a la sede hermana (`decidirSedeDestino()`,
  7 pruebas); (c) el cupo de envío, que es de la MARCA y falla CERRADO **en silencio**, se ve ahora
  en `/dashboard/campaigns` y avisa al 75 % — antes solo estaba en Conexiones, que con `owner_email`
  vacío solo abre el super-admin. **El modelo de cupo NO se tocó** (es F9, choca con D6).
  → `docs/features/delivery-webhook.md`, `send-governance.md`, `RUNBOOK-DEPLOY.md` §8.
- **Copiarle los premios a una sede ya no regala premios** (2026-09-09, **migración `00059`,
  SIN aplicar**): el «ya reclamé» se llevaba por `tier_id` y los niveles propios de una sede son
  COPIAS con ids nuevos, así que «Darle premios propios» le devolvía a los 542 clientes de la
  marca todos sus niveles sin reclamar allí — un regalo masivo a un botón de distancia. Ahora un
  nivel tiene identidad propia (`reward_tiers.tier_key`, que la copia HEREDA) y cada reclamo se
  sella con esa clave **y** con el umbral cruzado; vale cualquiera de las dos, que es la lectura
  conservadora a propósito. `customers.current_tier` pasa a ser el nivel de la MARCA: con
  escaleras por sede podía RETROCEDER de nombre mientras el cliente subía de puntos.
  → `docs/features/points-mystery-box.md` §7.1.bis y §7.4.bis.
- **Los premios ya no los cambia un administrador de sede** (2026-09-09, sin migración): los
  cuatro verbos de `/api/dashboard/reward-tiers` autenticaban con `requireTenantId()`, que solo
  mira que el JWT traiga una marca — así que un `role='location'` editaba y borraba los premios
  de la marca **y los de sus sedes hermanas**, y la pantalla se lo ofrecía por defecto. Ahora las
  tres escrituras pasan por `exigirAlcanceDeMarca()`; el GET se queda como estaba **a propósito**
  (leer no cruza marcas, y exigir alcance ahí daría 403 a todos: el panel pide `?location_id=brand`,
  que `decideLocationScope()` rechaza). La decisión vive en `puedeEscribirEnLaMarca()`, que es PURA
  y lleva el `OR` del operador de Cada1 que el RLS ya tenía (`is_super_admin()`, 00045) y el TS no:
  sin él, el operador perdía el panel de todo cliente con dos sedes. Falla CERRADO, y un fallo de
  base sale como 500, no como 403. Con 0 o 1 sede activa nada cambia. Y «Accesos» avisa, al elegir
  «Administrador de sede», que esa persona ve su sede **desde hoy** y no el histórico (0.DELTA (b)).
  → `docs/features/multi-sede.md` §3.septies.
- **Cada sede manda a reseñar SU ficha de Google** (2026-09-09, sin migración, **en `main`**):
  `getReviewPromptState` recibía solo la marca aunque `review-prompt/route.ts:52` ya tenía la
  sede resuelta en la variable de al lado. Guardar y mostrar el link por sede ya funcionaba;
  mandar a reseñar, no. Era el requisito original del dueño. → `docs/features/review-flow.md`.
- **Las recompensas ya varían por sede** (2026-09-08, dentro de la `00058`): el cuello de botella no
  eran los llamadores de `getAllTiers` sino TRES funciones intermedias con 18 call-sites
  (`evaluateNewTier`, `getNextTier`, `buildTiersRoadmap`). Enhebrado en check-in, domicilios, tarjeta,
  `check-in/status`, las dos rutas públicas y la mystery box. **Sin sede a propósito**: el override del
  panel y los crons (no existe una «sede del acto»; esa cascada es F6). Pantalla con selector de alcance
  y `/reward-tiers/copiar`, que evita que una sede se quede con UN solo premio al crear el primero.
- **Las sedes ya son del cliente** (2026-09-08, **migración `00058`, SIN aplicar**): hasta hoy
  multi-sede era una función NUESTRA — el cliente filtraba por sede pero solo podía editar la
  principal, y solo su geocerca. Ahora **`/dashboard/sedes`** (ver, elegir y editar cualquier
  sede: ficha de Google, dirección, horario, teléfonos, redes) y **`/dashboard/accesos`**
  (super usuario / administrador de sede, altas, bajas y **contraseña nueva**). La 00041 había
  dejado `restaurant_locations.config` sin whitelist ni escritor, así que las dos sedes de una
  marca mandaban a reseñar **la misma ficha de Google**: la de la segunda nacía muerta.
  Con 0 o 1 sede activa ninguna marca ve un solo cambio. → `docs/features/multi-sede.md` §3.septies.
- **Se puede cambiar una contraseña** (2026-09-08, sin migración): hasta hoy **no podía nadie**.
  El AIOS remitía a «olvidé mi contraseña» y ese flujo **no existe** en el producto (no hay
  `resetPasswordForEmail`, `/login` no tiene enlace). Ahora desde «Accesos» y desde el AIOS
  (`reset_password` en `/api/aios/tenant-admin`). El autoservicio sigue faltando: §3 punto 0.quater.
- **El alta del AIOS pregunta bien** (2026-09-08, AIOS v1.9.0, **migración `00009` del AIOS, SIN
  aplicar**): «¿cuántas sedes?» no distinguía un GRUPO (comparten marca, clientes y puntos) de una
  FRANQUICIA (no comparten nada) — las dos contestaban «varias» y la diferencia solo se veía cuando
  ya era irreversible. **Tepuy nació de ahí.** `site_model` pasa a `single | group | franchise`.
- **El subdominio de una sede ya resuelve la marca en TODO lo público** (2026-09-08, sin migración,
  **en `main`**): la tarjeta, `/api/check-in/status`, `/api/mystery-box/resolve` y las tres rutas de
  `/api/public/*` resolvían con `getTenantByDomain()` (solo `tenants.domain`) y respondían **404** en el
  subdominio de una sede; el branding caía a `DEFAULT_BRANDING`, o sea **el cliente veía Sushi Service al
  escanear el QR de su sede**. Nuevo `getTenantByHost()`, que es el cuerpo que ya usaba
  `resolveHostContext()`. Lo destapó Tepuy. → `docs/features/multi-sede.md` §3.quinquies.
- **El cliente ya nace con usuario** (2026-09-08, sin migración, **en `main` y pusheado**): el AIOS dejaba la marca
  completa y el cliente abría su enlace **sin con qué entrar**. Ahora `POST /api/aios/tenant-admin`
  (llave: `x-aios-secret`, **503 sin la variable**) + tarjeta «Usuario del panel» del AIOS v1.7.0. Nunca da
  `super_admin`, nunca reatribuye un usuario de otra marca (409), nunca cambia una contraseña existente; con
  2+ sedes crea la fila `role='brand'` que evita el 403. → `docs/features/alta-usuario-admin.md`.
- **Cambios pre-reunión** (2026-09-08, `596fb5b`, **en `main` y pusheado**, sin migración): "Identidad visual" pasa a
  **"Tarjeta principal"**; la tarjeta muestra símbolo del sello (20), decoración de contorno (6), redes, perfil de
  Google, descripción, contacto/horario y políticas, plegados (`CardExtras`/`CardMotif`/`StampIcon`; se guarda en
  `config.card.*` + `instagram_url`/`whatsapp_link` por la whitelist, listas cerradas para los dibujos). **Sin config
  no cambia nada.** Premios de campaña vive como pestaña de Campañas (la ruta vieja redirige). Domicilios: cuadro
  modelo con "Copiar modelo" y pasos plegables. → `docs/features/identidad-visual.md`, `campaigns.md`, `delivery-dashboard.md`.
- **El AIOS aprende lo que es una sede** (2026-09-07, F8): creaba **un tenant por sede**, así que un negocio
  con dos locales nacía como dos MARCAS. Migración **`00056`** (`aios_add_location`, `aios_set_location`, y
  `aios_provision_tenant` reemplazada porque no escribía `slug` ni `domain`: un alta de dos sedes nacía
  **creada pero muerta**). → `docs/features/multi-sede.md` §2.bis.
- **Un domicilio perdido deja rastro** (2026-09-07, ROJO 3, **en `main`, sin desplegar**): `delivery_intake_failures`
  (00053). El INSERT vive dentro de `logDeliveryIntakeFailure()`, que pasa a `async`. Con ella va `aios_health()`.
- **Conexiones: el cliente conecta su propio WhatsApp** (2026-09-07, **en `main`**, 00054). Destapó que el
  `redirect_url` apuntaba a `/api/webhook/zernio` (405 a un navegador) y que `verification_required` no lo miraba
  nadie. Nonce del `state` NUESTRO; `isTenantOwner()` fail-closed. → `docs/features/conexiones.md`.
- **Lo del 2026-09-06, desplegado** (detalle en `CHANGELOG.md`): `SALIR` visible y contestado · los 3 AMARILLO del
  calendario · Recovery Zone · alta de mesero por ROL · Sushi Fun absorbido (1.421 filas). Con migración sin aplicar:
  enlace del evento (00050) y dominio cruzado simétrico D2 (00051). Lo anterior (§19, F7/F4/F3, identidad visual) está desplegado.

## 6. Deudas y límites conocidos

**Multi-sede** (`docs/features/multi-sede.md`): **D3** `is_primary`
sin UNIQUE por tenant · **D4** diagrama ER de DB_SCHEMA obsoleto · **D5** conteo de migraciones stale en comentarios ·
**D7** premios sin precio · **D8** adopción de histórico irreversible · **D9** el 409 de sede no acepta elección por API ·
**D12** campañas masivas con `location_id` NULL (es F6) · **D13** 5 columnas de sede vacías · **D15** FK simple en
`staff_devices.staff_user_id` (mitigada con trigger). **D1 y D17 CERRADAS por la `00058`**: la whitelist de
`restaurant_locations.config` existe (en la base) y el cliente edita cualquier sede desde `/dashboard/sedes`.

**Rutas que F7 dejó SIN cablear a propósito**: `send-queue` GET, `check-in-override`, `campaigns/manual`,
`imported-contacts/confirm`, `campaigns/run-auto`. El filtro de sede ahí es **no-op seguro (fail-closed)** hasta F6.

**De §19**: **D18** el token del aparato es el fingerprint del navegador y la ÚNICA credencial del local (aceptado) ·
**D19** un mesero sin teléfono en dos sedes cuenta como dos · **D20** quién activó un aparato solo queda en `device_name`.

**Fuera de multi-sede:**
- **00030 sin aplicar**: DEFAULT puente → un INSERT sin `tenant_id` se va calladito a Sushi Service.
  Y **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el panel (`POWER_RANKS`).
- **Domicilios perdidos sin rastro** (ROJO 3): entero en `main`, pero **no sirve hasta que corra la 00053**.
- **Huecos de migración**: `00048` y `00049` los citó el diseño (F9 se escribió, pero como `00058`; F10 no);
  `00052` y `00055` los fabricó el script viejo al leer una cita como reserva. Ninguno se rellena.
- **Choques de migración en ramas muertas**: `sushi-sync` (00015) y `port/sushi-fun-2.8` (00028).
- **Catálogo de producto sin empezar** (referidos, push, fatiga, §7, §8, §18): `docs/ESTADO-REQUERIMIENTOS.md`.
- **Plantillas (2026-09-11)**: cinco escritores de `admin_settings.*_template_sid` (el invariante de
  `promoteVersion()` vale en un archivo, no en el sistema) · `tier_unlocked` y `reward_reminder` fuera del
  catálogo · una plantilla PAUSED por Meta sigue apuntada y falla en silencio · `no_template_configured` no
  llega a ninguna pantalla · `flujo-plantillas-recompensas-campanas.md` describe un contrato que ya no existe.
  Diagnóstico y plan: `docs/PENDIENTES-PLANTILLAS.md` (§3 0.PLANTILLAS).

## 7. Reglas de esta casa

- **Cada sesión abre y cierra igual** (`CLAUDE.md` § "Cada sesión"): al abrir, fila en §2 commiteada sola; al cerrar,
  tsc · lint · tests, fila borrada, `CHANGELOG.md` (≤15 líneas), `graphify update .`, commit por nombre.
- **Varias a la vez: misma carpeta, misma rama, territorios por archivo.** Nadie cambia de rama, nadie hace `stash`
  ni `reset --hard`, nadie hace `git add -A`. Una corrida de tests a la vez. Worktrees solo como excepción declarada.
- **El número de una migración sale de `node scripts/proxima-migracion.mjs`** y se escribe en la fila del §2: esa es la reserva.
- **La migración se aplica ANTES de desplegar el código que la usa.** Con la 00047 se hizo al revés y salió barato
  de casualidad; con la 00044 habría dado 403 a todos los meseros.
- **Push y deploy son del dueño.** Un push de `main` despliega.
- **Cerrar las sesiones viejas.** Cada mensaje re-factura todo el historial.
- **El grafo antes que el grep**: `graphify query` cuesta 1-2 k tokens; leer "los relevantes", 30-80 k.
- **Modelo por defecto para implementar: Sonnet.** Opus para diseño, planificar el día y el cierre. Haiku para auditorías.
- **Prompts con alcance cerrado**: tarea · guardrails · criterio de término. Nada de "revisá todo el repo".
- **Nada de carpetas fuera del proyecto.** Los respaldos van a GitHub (dueño, 2026-09-06).
