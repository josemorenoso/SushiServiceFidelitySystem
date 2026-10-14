# Prompt — Las sedes bien separadas en el panel (2026-10-14)

> Escrito por el comandante (Opus 5.5) con lo que el dueño pidió el 14-10 mirando el panel de **Tepuy** (dos sedes:
> Envigado y Laureles). Son **tres partes, una sesión cada una**: **1** (el panel separado de verdad) → **2** (la tarjeta
> de cada sede), en ese orden, y **3** (diseño de «un número por sede» y las franquicias, solo docs), que puede ir en
> paralelo con cualquiera. **Modelo: Opus en las tres** (el dueño: «mucho cuidado»). El dueño pega la línea de UNA parte;
> la 2 arranca cuando el comandante verificó la 1.

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Construyes **UNA parte** de este prompt: la que diga la
línea que te pegaron («parte 1», «parte 2» o «parte 3»). Si no dice, pregunta.

## 0. Lo que pidió el dueño (textual, 2026-10-14) y lo que decidió

> *«Tiene que haber una distinción clara en el dashboard de cuántos clientes entró cada una… parece un trabajo mediocre…
> como una jerarquía bien hecha… cada cosa en su lugar, se ven desde el mismo lado pero bien separadas, mucho cuidado:
> los clientes deben poder redimir sus premios y acumular puntos en las dos sedes. Si hace falta añadir un nuevo gráfico
> para las que son sucursales, hagámoslo.»*
>
> *«¿Por qué salen 4 opciones? Eso no tiene sentido alguno.»* (el selector: Todas las sedes · Tepuy Laureles · Tepuy
> Envigado · Sin sede) · *«Si escojo una sede u otra, cuando voy a modificar la tarjeta sale la misma para las dos,
> incoherente, a menos que haya un botón que diga "tarjetas separadas"»* · *«Al cambiar de sede en el dashboard no cambia
> nada, teniendo en cuenta que esos datos son de Envigado y Laureles tiene 0 clientes»* (con Envigado elegido, «TOTAL
> CLIENTES 40»; con Laureles, también 40).
>
> *«Comparte número y datos sí, perfecto, pero hay cosas que son de cada sede… Siempre van a compartir datos las
> franquicias y sucursales; lo que puede cambiar es que no compartan número, o que alguna tenga número en coexistencia y
> otra tenga número comprado por Zernio.»*

**El modelo, decidido por el dueño el 14-10:**

1. **Una marca, varias sedes. Los datos se comparten SIEMPRE** (clientes, puntos, premios, niveles): el cliente acumula
   y canjea en cualquier sede. Vale para sucursales y para franquicias.
2. **En el panel, una jerarquía de dos niveles:** arriba la marca, debajo cada sede. **Cada número está en su lugar:** o
   es de la sede elegida, o dice que es de toda la marca. Nunca un total de la marca disfrazado de número de una sede.
3. **Lo que puede ser de cada sede:** sus números (parte 1), su tarjeta si el dueño la separa (parte 2) y su número de
   WhatsApp: compartido, propio en coexistencia o propio comprado por Zernio (parte 3, diseño).

**Esto refina el §8.4 del spec de multi-sede** («las métricas de `customers` son de la marca para siempre»). Lo que el
cliente HACE (puntos, premios, recorrido) sigue siendo de la marca: no se mueve, no se copia ni se parte ningún cliente.
Lo nuevo es la **atribución para el reporte**: dónde se registró (`customers.origin_location_id`, D2, que el check-in YA
llena desde F3) y dónde vino (`visits.location_id`). Si encuentras otro choque con la arquitectura documentada, para y
dilo.

**Por qué el panel se ve así hoy** (verificado por el comandante contra el código): `getFullAnalytics()` devuelve
`{ brand, location }` y todo lo que sale de `customers` va a `brand` sin importar la sede elegida
(`src/types/analytics.types.ts`); `MetricsCards` junta los dos en la misma fila sin decir cuál es cuál
(`dashboard/page.tsx:76`); no existe ninguna comparación entre sedes; «Sin sede» es una opción más del selector
(`LocationSelector.tsx:60`); y `reward_redemptions.redeemed_location_id` no lo escribe nadie (deuda #13:
`recordRedemption()` en `redemption.service.ts:109` no la pone), así que «premios por sede» hoy no se puede contar.

**Diagnóstico de los datos de Tepuy:** `SQL-PARA-CORRER/tepuy-sedes/01-DIAGNOSTICO.sql` (solo lectura; lo corre el
dueño). Si el comandante te pasa el resultado, úsalo. Si no, no supongas: la pantalla tiene que verse bien con cualquier
resultado (todo con sede, parte sin sede, todo sin sede).

## 1. Antes de tocar nada (las tres partes)

1. Lee `ESTADO.md` entero. **Puede haber otra sesión viva** (la parte C del ciclo, con la 00073): mira su fila en §2.
   Si su fila toca un archivo que necesitas, **no lo toques**: pídeselo por `SendMessage` (`ListAgents` la muestra) o
   espera a que cierre. Hoy son de ella, entre otros, `src/types/database.types.ts`, `docs/API_DOCS.md`,
   `docs/DB_SCHEMA.md`, Campañas, Calendario y todo `src/components/dashboard/cycle/`.
2. Anota tu fila en §2 («Sedes separadas, parte N: …», modelo, archivos). Si tu parte necesita migración, corre
   `node scripts/proxima-migracion.mjs` y pon el número en la fila (es la única reserva). Commitea SOLO `ESTADO.md`.
3. Lee enteros: `docs/features/multi-sede.md` (sobre todo «Columnas de sede», §3.bis, §3.quater, §3.septies, §4 y §5),
   el spec `docs/superpowers/specs/2026-09-02-multisede-design.md` §5 y §8, `docs/features/dashboard.md` y
   `docs/PENDIENTES.md` §8 (D5). La parte 2 además `docs/features/identidad-visual.md`; la parte 3,
   `docs/superpowers/specs/2026-09-06-conexiones-design.md`, `docs/features/conexiones.md` y
   `docs/features/zernio-messaging.md`.
4. Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Reglas de las tres partes

- **Un dato de la marca A jamás se ve en la marca B.** Todo INSERT con `tenant_id` explícito. Toda lectura filtra por
  marca.
- **`location_id` NULL = «sede desconocida», se muestra y NUNCA se backfillea.** Lo que no sabe de qué sede es no se
  reparte ni se esconde: va en su propia fila, con una frase que diga qué es.
- **Toda columna de sede nueva: NULLABLE + FK compuesta `(columna, tenant_id)` ON DELETE RESTRICT.**
- **Permisos de sede:** un administrador de sede (`role='location'`) ve SOLO su sede (`decideLocationScope()` y
  `can_see_location()` de la 00045 son ESPEJOS que `tests/db/multisede-permisos.test.ts` vigila: no se tocan). Escribir
  lo de la marca exige `exigirAlcanceDeMarca()`. 0.DELTA (a) NO es de este prompt.
- **Marcas con 0 o 1 sede activa: no cambia NADA** (las otras 6 marcas vivas). Un test lo fija.
- Un fallo de base es 500 y la pantalla lo dice: **nunca «0 clientes»** (el incidente del 04-10). Supabase JS:
  destructura `error` y pásalo por `src/lib/db-failure.ts`. Listas de más de 1.000 filas: `leerTodo()`.
- Nada en pesos (D7). Ningún hex nuevo (`--brand-*`). Nada de `useSearchParams()` (CSR bailout:
  `useSyncExternalStore` o el contexto de sede, como hoy).
- **Vocabulario del dueño:** «sede», «toda la marca», «las dos sedes», «sin sede». En pantalla nunca «location»,
  «scope», «cubo», «origin».
- Celular primero: el dueño mira el panel desde el teléfono.
- Git: solo tus archivos, por nombre. Nunca `git add -A`, ni cambiar de rama, ni `stash`, ni `reset --hard`. **Una corrida
  de vitest a la vez** (comparten el Postgres del puerto 55432): avisa a la otra sesión por `SendMessage` antes y
  después. Commits locales sí; push, deploy y migraciones en producción NO.

## 3. Parte 1 — el panel separado de verdad

1. **El selector, con sentido.** Para un usuario de marca con 2+ sedes, las opciones son **«Toda la marca (N sedes)»**
   y una por sede: nada más. **«Sin sede» sale del selector** (`?location_id=unknown` sigue existiendo en las rutas:
   no rompas a quien lo use). Lo que no tiene sede se sigue mostrando, en «Tus sedes» (punto 3). Un administrador de
   sede sigue viendo solo la suya (con una sola opción, el selector no se dibuja, como hoy).
2. **Métricas con UNA sede elegida: cada tarjeta es de esa sede o lo dice.** Como mínimo, de la sede: **«Clientes de
   esta sede»** (los que se registraron ahí: `origin_location_id`), **«Nuevos hoy / esta semana»** (registrados ahí),
   **«Vinieron a esta sede»** (clientes distintos con visita ahí en 30 días: un cliente que va a las dos cuenta en las
   dos, y la pantalla lo dice), y lo que ya es de sede (visitas, QR, domicilios, mapa de calor). Para cada una de las
   demás (cumpleaños, niveles, Black, Power Ranking, adquisición, reactivación, ROI…) decide: o se parte con una regla
   que puedas defender en una línea (por ejemplo, los niveles de los clientes registrados en esa sede), o lleva la
   etiqueta **«Toda la marca»** visible. **Ninguna tarjeta puede mostrar el total de la marca sin decirlo** (es lo de
   hoy: Envigado y Laureles dicen «40 clientes»). El tipo partido `{ brand, location }` se queda (es la red que no deja
   mezclar por descuido); súmale lo de sede que haga falta, con el mismo cuidado.
3. **«Toda la marca» elegida (2+ sedes): los totales y, debajo, «Tus sedes».** Una tarjeta por sede, lado a lado (dos
   columnas en el celular), con: **clientes que trajo** (total y este mes), **clientes que vinieron** (30 días),
   **visitas** (30 días) y **premios entregados** (30 días). Una línea **«N clientes van a las dos sedes»** (se cuentan,
   no se reparten). Si hay datos sin sede, **una fila «Sin sede»** con su explicación («N clientes se registraron antes
   de tener dos sedes, o por el enlace general de la marca»); si no hay, no aparece. **Un gráfico nuevo para las
   sucursales:** visitas por día de cada sede en el mismo gráfico (una serie por sede, con los colores de la marca, y su
   leyenda), los últimos 30 días.
4. **Premios entregados por sede, de verdad.** `recordRedemption()` (`src/services/redemption.service.ts`), llamada
   desde `POST /api/reward-redeem`, escribe `reward_redemptions.redeemed_location_id` con la sede del mesero que entrega:
   **la misma precedencia que el check-in** (`staff_users.location_id` → `staff_devices.location_id` del aparato → el
   host; un rotativo, la del aparato; sin sede → NULL; nunca adivinar). Reusa el resolver de F3/F4
   (`src/lib/location-resolver.ts`), no escribas otro. Sin backfill: lo viejo queda «sin sede».
   `reward_grants.granted_location_id` (dónde se GANÓ) NO es de esta parte: déjalo anotado en PENDIENTES.
   **El canje y los puntos en cualquier sede siguen funcionando** (punto 2 del modelo): un test con un cliente
   registrado en la sede A que suma puntos y canjea en la sede B.
5. **El número compartido, dicho claro.** En «Mis sedes» (`/dashboard/sedes`) y en Conexiones, una línea visible:
   «Las N sedes comparten el WhatsApp {número} ({Twilio o Zernio}). Un número propio para cada sede: próximamente».
   Lee el número de donde el panel ya lo lee; no inventes columnas.
6. **La auditoría, por escrito.** Recorre las pantallas del menú lateral una por una (Métricas, Clientes, Rendimiento,
   Recompensas, Campañas, Golden Bullet, Calendario, QR Studio, Tarjeta principal, Mis sedes, Plantillas, Meseros QR,
   Domicilios, Conexiones, Accesos, Configuración…) y deja en `docs/features/multi-sede.md` una sección nueva **«Qué es
   de la marca y qué es de cada sede, pantalla por pantalla»**: qué muestra, si hoy respeta la sede elegida, si debería,
   y qué hiciste. **Las que son de toda la marca** (Tarjeta principal mientras no exista la parte 2, Plantillas,
   Conexiones, Golden Bullet…) dicen arriba, en una línea: **«Esto es de toda la marca: lo ven y lo usan las N sedes»**,
   y el selector no puede parecer que las cambia (elige: la franja sola, o el selector deshabilitado con esa frase, y
   dilo). **Campañas y Calendario son de la parte C del ciclo (viva): no las toques**; anótalas en la tabla y deja su
   línea en PENDIENTES. Lo que encuentres roto que no sea de esta parte va a `docs/PENDIENTES.md` con su ID.

- Territorio parte 1: `src/components/layout/LocationSelector.tsx` (y `DashboardHeader.tsx` solo si hace falta),
  `src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/MetricsCards.tsx` y los componentes del panel que
  etiquetes, componentes nuevos en `src/components/dashboard/sedes/`, `src/services/dashboard.service.ts`,
  `src/types/analytics.types.ts`, `src/hooks/useDashboardAnalytics.ts`, `src/app/api/dashboard/analytics/**` (o una ruta
  nueva `src/app/api/dashboard/sedes/**`), `src/services/redemption.service.ts` (`recordRedemption`),
  `src/app/api/reward-redeem/route.ts`, `src/app/(dashboard)/dashboard/sedes/page.tsx`, la página de Conexiones (solo la
  línea del número), una franja «toda la marca» y las páginas donde la pongas (solo esa línea, fuera de Campañas y
  Calendario), `tests/**` nuevos, `docs/features/multi-sede.md`, `docs/features/dashboard.md`, `docs/PENDIENTES.md`,
  `ESTADO.md`, `CHANGELOG.md`. **Sin migración** salvo que demuestres que hace falta (y entonces, antes de escribirla,
  dilo en tu fila con su número).

## 4. Parte 2 — la tarjeta de cada sede

La tarjeta es lo que el cliente ve después de escanear el QR (de la segunda visita en adelante). Hoy es una sola por
marca (`tenants.config`, «Tarjeta principal»), y en el panel parece que cambia con la sede elegida, pero no cambia.

1. **Una elección clara en «Tarjeta principal»** (solo con 2+ sedes): **«La misma tarjeta para todas las sedes»** (lo de
   hoy, el default) o **«Una tarjeta para cada sede»**. Con la primera, la página dice arriba «Las N sedes muestran esta
   tarjeta» y el selector no finge cambiarla. Con la segunda, la página edita la tarjeta de la sede elegida, con
   «Copiar la de {otra sede}» para no empezar de cero.
2. **Lo que ya es de cada sede no se duplica:** dirección, horario, teléfonos, redes y ficha de Google ya viven por sede
   (`restaurant_locations.config`, 00058, «Mis sedes»). La tarjeta de un cliente en Laureles muestra los de Laureles
   **aunque la tarjeta sea compartida**. Verifícalo primero: si hoy muestra los de la marca, ese es el primer arreglo.
3. **La tarjeta pública toma la sede del QR que se escaneó** (`resolveHostContext()`); sin sede, la de la marca.
   `getTenantByDomain()` conserva su firma.
4. **`tenants.config` y `restaurant_locations.config` son PÚBLICOS** (viajan al navegador). Lo nuevo va en un espacio
   con nombre (`card` en el config de la sede, con las MISMAS listas cerradas de dibujos que la marca), se escribe SOLO
   con el `merge_*_deep()` que corresponda y SOLO por rutas de la whitelist (`src/lib/tenant-config-paths.ts`,
   `src/lib/location-config-paths.ts` y su espejo en la base, si lo tiene: con migración, número del script en tu
   fila). Quién puede cambiar la tarjeta de una sede: decide (¿el administrador de esa sede, o solo la marca como hoy
   desde SEG-3?) y dilo.
- Territorio parte 2: `src/app/(dashboard)/dashboard/marca/page.tsx`, `src/lib/branding.ts`, `src/lib/branding-server.ts`,
  `src/lib/tenant-config-paths.ts`, `src/lib/location-config-paths.ts`, la tarjeta pública (`src/app/(public)/tarjeta/**`
  y donde el check-in la dibuja), las rutas que escriben la config de la marca y de la sede,
  `supabase/migrations/<número>_*.sql` si hace falta, `tests/**`, `docs/features/identidad-visual.md`,
  `docs/features/multi-sede.md`, `docs/PENDIENTES.md`, `ESTADO.md`, `CHANGELOG.md`.

## 5. Parte 3 — un número por sede, y las franquicias (DISEÑO, sin código)

Entregable: un spec nuevo, `docs/superpowers/specs/2026-10-14-numero-por-sede-design.md`, verificado contra el código
(archivo y línea en cada afirmación), que conteste:

1. **Qué línea usa cada mensaje** cuando las sedes no comparten número: bienvenida y puntos (la sede del check-in),
   premios, cumpleaños, el ciclo de recuperación, campañas, Golden Bullet, domicilios. El §6.1 del spec de multi-sede
   diseñó una cascada `last_visit_location_id` → `origin_location_id` para imputar los envíos masivos a una sede, y
   quedó para F6 (`whatsapp.service.ts:52-62` lo dice): ¿sirve para elegir la línea?
2. **Plantillas:** un número en otra WABA necesita sus propias plantillas aprobadas. ¿Cuántas aprobaciones más por sede?
   ¿Cómo lo vive Plantillas? ¿Y el puntero `*_template_sid`, que hoy es por marca?
3. **Cupo por línea** (`line_budget()`, `message_logs.line_location_id` ya existe), **opt-out** (¿«SALIR» es por marca o
   por número? Ley 1581), **el webhook entrante** (qué sede recibe un domicilio o un «sí»), y **Twilio y Zernio mezclados
   en una misma marca** (una sede en coexistencia, otra con número comprado).
4. **El AIOS:** hoy `site_model` = `single | group | franchise`, y «franquicia» crea marcas separadas que no comparten
   nada (AIOS v1.9.0, `docs/features/multi-sede.md` §2.bis). Con la regla del dueño («siempre comparten datos») eso
   cambia: propón cómo, sin tocar el AIOS (`Level 2.0/aios-constelarys`, solo leer).
5. Lo que ya existe y choca: F9 `location_messaging` (spec de conexiones), D6, 0.THETA, D9.
6. Fases (cuál primero y por qué), migraciones, riesgos, costo para el dueño, y **lo que tiene que decidir el dueño:
   máximo cinco preguntas, cada una con su valor por defecto.**
- Territorio parte 3: el spec nuevo, `docs/PENDIENTES.md`, `ESTADO.md`, `CHANGELOG.md`. Nada de código.

## 6. Tests (cada uno falla contra el código de hoy)

**Parte 1**, con Postgres real: una marca con dos sedes y otra marca aparte; con una sede elegida, «clientes de esta
sede», «nuevos» y «vinieron» son los de esa sede, y con «toda la marca» los totales cuadran con las sedes más «sin sede»
(un cliente que va a las dos se cuenta una vez en el total); la marca B no aparece nunca; un administrador de sede ve su
sede y no la otra; el canje en la otra sede guarda `redeemed_location_id` y los puntos suman igual; el selector ofrece
«toda la marca» + las sedes y no «sin sede»; una marca de 1 sede devuelve lo mismo que hoy; un fallo de base es 500.
**Parte 2:** con la tarjeta compartida, una marca de 1 sede se ve exactamente igual que hoy; con tarjetas separadas, el
host de Laureles ve la de Laureles y el de Envigado la suya; la whitelist rechaza una ruta de fuera; quien no tiene
permiso recibe 403. **Parte 3:** sin tests (es un documento).
Siempre: la suite entera en verde (la última corrida completa dio **91 archivos / 1.550 tests**, antes de la parte C).
Compruébalo sin `stash` (copias al scratchpad, `git show` de HEAD, corres, restauras) y di cuántos fallan contra el
código anterior.

## 7. Cierre (cada parte)

1. `npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (base: 14) · `npx vitest run` entero en verde (mira la
   línea «Test Files»: una corrida que pierde un proceso sale con código 0 igual, TEST-flaky).
2. Docs de tu territorio al día; `docs/PENDIENTES.md` (lo hecho sale, lo nuevo entra); `ESTADO.md` (tu fila fuera; si
   hay migración, en §3: aplicarla ANTES del push); `CHANGELOG.md` (≤ 15 líneas). Si la otra sesión sigue viva, cada una
   commitea solo sus trozos de esos tres archivos.
3. Commit de tus archivos por nombre. Después:
   `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 8. Tu respuesta final (el dueño se la pasa al comandante)

Si algo impide desplegar, primero (y si hay migración, que va antes del push). Hashes, número de migración, archivos.
Por cada punto de tu parte: qué hiciste, archivo y línea, y el test. Cuántos tests fallan contra el código anterior.
tsc, lint y vitest con números. Lo que decidiste que no estaba en el prompt y lo que no pudiste hacer. **Partes 1 y 2:
una descripción de la pantalla en un celular** con una marca de dos sedes de prueba (abre el servidor local; no toques
producción): qué ve el dueño con «toda la marca», con cada sede, y la fila «sin sede». **Parte 1:** además, la tabla de la
auditoría (punto 6) resumida.
