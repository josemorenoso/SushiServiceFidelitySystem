# Prompt — Ciclo de recuperación, fase 2: la pantalla (2026-10-14)

> Escrito por el comandante (Opus 5.5). **El dueño aprobó el prototipo el 14-10** («me encanta»: A8 cerrada). Son **tres
> partes, una sesión cada una, EN ORDEN** (las tres tocan Campañas): A (los datos) → B (la pantalla «Ciclo») → C (la vista
> por fecha y los creadores). **Modelo recomendado: Sonnet** en las tres (Opus si una parte trae migración). El dueño pega
> la línea de UNA parte; la siguiente arranca cuando el comandante verificó la anterior. **El dueño eligió Opus para B y C**
> (14-10: son la parte visual). A y B, hechas y verificadas el 14-10.

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Construyes **UNA parte** de la fase 2 del ciclo de
recuperación: la que diga la línea que te pegaron («parte A», «parte B» o «parte C»). Si no dice, pregunta. Las fases 0,
0.bis, 1A y 1B están en producción: el motor ya decide, encola y envía (`src/lib/cycle-engine.ts`,
`src/lib/cycle-touch.ts`, `src/services/cycle.service.ts`, migraciones 00070 y 00071), y está **encendido solo en las
marcas que el dueño eligió** (`admin_settings.cycle_enabled`); las demás siguen con el camino viejo.

Lo que pidió el dueño, textual: *«una línea de tiempo… calendario y campañas en el mismo lugar… más fácil, más visual y
dopamínico»*, y *«que para los dueños sea exageradamente fácil de usar»* (el dueño de restaurante entra desde el celular,
entre incendios).

## 1. Antes de tocar nada (todas las partes)

1. Lee `ESTADO.md` entero. Si en §2 hay una fila viva que toque tus archivos, NO arranques y avísame.
2. Anota tu fila en §2 («Ciclo fase 2, parte X: …», modelo, archivos). Si tu parte necesita migración, corre
   `node scripts/proxima-migracion.mjs` y pon el número en la fila (es la única reserva). Commitea SOLO `ESTADO.md`.
3. Lee enteros: el spec `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` **§6, §7.4, §7.6, §10, §11 y
   §14** (si algo choca, manda §14, después §13, después este prompt); **el prototipo aprobado**
   `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-mockup.html` (ábrelo en el navegador: es la referencia de qué
   va dónde y con qué palabras); `docs/features/ritmo-adaptativo.md` §7; `docs/features/campaigns.md`;
   `docs/features/calendar.md`; `docs/PENDIENTES.md` §2 y §8 (bloque A).
4. Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Reglas de las tres partes

- **Un solo motor.** Ningún cálculo de etapa, ritmo, día o caja fuera de `cycle-engine.ts` / `cycle-touch.ts`. La pantalla
  y el cron tienen que decir los mismos días (spec §7.2).
- **Vocabulario de dueño** (spec §6.6): Le recordamos · Le regalamos algo · Le mostramos lo otro · Rescate · Despedida ·
  Dormidos · Toque trimestral · Regalo que vence · «sin mensaje, para comparar». «Archivado», `t1`, `holdout` y «cola» no
  aparecen en pantalla.
- **Marca con el ciclo APAGADO** (la mayoría): la pantalla igual muestra las cajas (con el ritmo de la marca) y dice en una
  línea que el ciclo está apagado. **El interruptor lo ve y lo usa solo el operador de Cada1** (`is_super_admin`); el dueño
  del restaurante ve el estado, no el botón (decisión del comandante, H7: encender sube volumen y costo).
- Celular primero (dos columnas en las cajas). **Ningún hex nuevo horneado**: colores por `--brand-*` (`globals.css`).
  `useSearchParams()` no (CSR bailout): `useSyncExternalStore` como en `rewards/page.tsx`.
- Leer con `requireTenantId()`; escribir con `exigirAlcanceDeMarca()`. Respeta el alcance de sede donde la pantalla de hoy
  lo respeta. Un fallo de base es 500 y la pantalla lo dice: **nunca «0 clientes»** (fue el incidente del 04-10).
- Nada en pesos (D7). Supabase JS: destructura `error` y pásalo por `src/lib/db-failure.ts`. Todo INSERT con `tenant_id`
  explícito.
- Git: solo tus archivos, por nombre. Nunca `git add -A`, ni cambiar de rama, ni `stash`, ni `reset --hard`. Commits
  locales sí; push y deploy NO. Si hay migración, no la aplicas.

## 3. Parte A — los datos (sin pantalla)

Los endpoints del spec §7.4, todos de LECTURA salvo el último, con tests:

1. `GET /api/dashboard/cycle/overview`: ritmo de la marca y sus días; conteo por caja (Recién vino, las etapas que existan
   para la marca, Dormidos) partido en **nuevos** (`total_visits` ≤ 1) y **ya volvieron**; «hoy entran N» por caja; retorno
   a 14 días por etapa **con mensaje y sin mensaje** (últimos 30 días, de `customer_cycle_touches.returned_at` de `sent`
   contra `holdout`); estado del primer uso (regalo pequeño elegido · regalo fuerte elegido · «Regalo que vence» aprobada,
   con la misma pregunta de aprobación que usa el cron); si el ciclo está encendido; y las **tarjetas «Para hoy»** (máximo
   tres, ordenadas por lo que mueven, spec §6.1). La segunda visita (A12): % de clientes de ciclo 1 que abrieron el ciclo 2
   en 60 días, medido con días con visita, no con `cycle_no` (la 1A lo dejó dicho).
2. `GET /api/dashboard/cycle/projection?from&to`: por fecha, cuántos entran a cada etapa (aritmética sobre
   `cycle_started_at` + días del ritmo de cada cliente: sin tabla nueva) + eventos del calendario + fechas especiales.
3. `GET /api/dashboard/cycle/customers?stage=…|day=…|state=dormido`: la lista paginada (nombre, ciclo, visitas, puntos,
   último toque y si volvió).
4. **Fechas especiales** (spec §10): `src/constants/fechas-especiales.ts`, Colombia, por `business_type` donde aplique
   (San Valentín, Amor y Amistad —septiembre en Colombia—, Madre, Padre, Halloween, Navidad, Fin de año, Día del Sushi…).
   Alimenta las tarjetas «Para hoy» («Halloween es en 27 días. ¿Creamos el evento?») y la proyección.
5. **«Hoy no»** (A6: lo automático sale solo; «Hoy no» lo pospone un día): el endpoint que lo escribe y la lectura que hace
   el cron para respetarlo. Elige el mecanismo mínimo (una clave en `admin_settings` con la fecha, por tipo de tarjeta, o lo
   que encaje con `cycle.service.ts`) y dilo. Es la única escritura de la parte A.
- Territorio A: `src/app/api/dashboard/cycle/**` (nuevo), `src/services/cycle-overview.service.ts` (nuevo, o el nombre
  que elijas), `src/constants/fechas-especiales.ts`, lo mínimo de `cycle.service.ts` para «Hoy no», `tests/**` nuevos,
  `docs/features/ritmo-adaptativo.md`, `docs/API_DOCS.md`, `docs/PENDIENTES.md`, `ESTADO.md`, `CHANGELOG.md`.

## 4. Parte B — la pantalla «Ciclo» (`/dashboard/campaigns`)

Con los endpoints de la parte A, como el prototipo:

1. **Primer uso** arriba (spec §6.0): los tres pasos con barra, cada uno con su enlace (los regalos se eligen en
   Recompensas → «Premios para regalar», que ya existe; la plantilla, en Plantillas). Ninguno bloquea el ciclo.
2. **«Para hoy»**: las tarjetas con sus botones (OK · Hoy no · Cambiar regalo · Crear evento · Elegir regalo · Subir
   foto), según el spec §6.1.
3. **Arriba, dos o tres números** (spec §6.3): volvieron por un mensaje (con «con mensaje X % / sin mensaje Y %» cuando haya
   datos de control), en el ciclo y dormidos, el próximo evento. **Ninguno es «enviados»**. El cupo de la línea sale de la
   portada (la parte C lo lleva al creador).
4. **Seis cajas + Dormidos** (spec §6.2), nuevos / ya volvieron, «hoy entran N»; tocar una abre la lista. El histograma
   por día, plegado bajo «Ver por día».
5. Pestañas: **Ciclo** (default) · **Historial** (el de hoy). «Mensaje libre (avanzado)» queda como enlace al asistente
   manual de hoy (`ManualCampaigns`), no como pestaña.
6. **Se retiran** (spec §6.7, §7.6): las 4 tarjetas de «Automáticas», la tira «Ciclo de recuperación del cliente» y
   `AtRiskBubbles` del panel principal, que pasa a un **mini-ciclo** (las cajas sin detalle, con enlace). `RISK_LEVELS` y
   `deriveCycleBands()` se retiran **solo si ya nadie los usa** (búscalos; `src/app/demo/page.tsx` también usa
   `AtRiskBubbles`: decide y dilo). La tarjeta «Activa» que no miraba la agresiva desaparece con ellas.
- Territorio B: `src/app/(dashboard)/dashboard/campaigns/page.tsx`, `src/app/(dashboard)/dashboard/page.tsx` (solo el
  mini-ciclo), componentes nuevos en `src/components/dashboard/cycle/`, los que se retiran, `src/constants/rankings.ts`
  (solo retirar lo que quede sin uso), `tests/**`, `docs/features/campaigns.md`, `docs/features/dashboard.md`,
  `docs/PENDIENTES.md`, `ESTADO.md`, `CHANGELOG.md`.

## 5. Parte C — la vista por fecha y los creadores

1. **Vista «por fecha»** (spec §6.4) dentro de Campañas (`?vista=fecha`): el mes en cuadrícula con eventos, fechas
   especiales y la proyección; tocar un día muestra quiénes (nuevos / ya volvieron) y **«Crear aquí»**; el blackout como
   sombra «reservado para el evento». **`/dashboard/calendar` redirige** a `/dashboard/campaigns?vista=fecha`
   (`MediaUploader` y `EventDetailDrawer` se reusan).
2. **«Mandar un regalo» en tres campos** (spec §6.5), el botón principal: regalo (del catálogo, o escribirlo y queda) ·
   hasta cuándo («este domingo» por defecto, 3/7/14 días) · a quién (una caja, dormidos, todos, con conteo vivo) · cuándo
   (hoy a la hora de la marca / una fecha). Vista previa del WhatsApp real. **El regalo se otorga AL ENVIAR y la fecha se
   calcula al enviar**, con el mismo adaptador de plantilla que el ciclo (`gift_expiring` aprobada o la insistente):
   reusa lo de la 1B; si el drenador necesita saber del regalo de un envío que no es un toque, elige el mecanismo mínimo
   (con migración si hace falta) y explícalo. Cuenta para la fatiga y el tope del mes como manual (`source='manual'`). El
   cupo vive aquí: «Hoy puedes mandar 180. Si son más, el resto sale en los días siguientes» (`getLineBudget()`).
3. **Crear un evento** con el mismo trato (spec §6.5): nombre · fecha · foto · **texto sugerido ya escrito y editable** ·
   enlace opcional · casilla **«incluir dormidos»** (default apagada, spec §3.1/§3.5: con el ciclo encendido, un evento no
   les llega a los dormidos salvo esa casilla; necesita una columna en `restaurant_events`, con su migración). Reemplaza a
   `EventCreateDialog`.
4. De paso, dos defectos que dejó anotados la 1B y viven en este código: **N-BLACKOUT** (`getActiveBlackouts()` se calla
   los errores y corta los días en UTC) y **N-AUDIENCIA** (`findCustomersForEvent()` no pagina).
5. **El interruptor del ciclo, también en el servidor** (lo encontró la B; agregado por el comandante el 14-10). Hoy la
   pantalla esconde «Encender/Apagar el ciclo» a quien no es operador de Cada1, pero `PUT /api/dashboard/settings` acepta
   `cycle_enabled` de cualquier super usuario de marca (`exigirAlcanceDeMarca()`). Decisión H7: **`cycle_enabled` lo
   escribe solo el operador** (`isSuperAdmin()`). La regla va en `decidirEscrituraDeAjuste()` (que es PURA: recibe
   `esOperador` como dato y la ruta se lo pasa); a un dueño le contesta 403 con un motivo en español («Encender o apagar
   el ciclo lo hace el equipo de Cada1»). `cycle_rhythm` y lo demás siguen como están.
6. Los botones «Crear evento» y «Subir foto» de «Para hoy» (parte B) ya mandan `?fecha=…&nombre=…` / `?evento=<id>`: la
   vista por fecha y el creador de evento los leen (`docs/PENDIENTES.md` §2.4, «Para C»).
- Territorio C: `campaigns/page.tsx` (la vista y los creadores), `src/app/(dashboard)/dashboard/calendar/**` (redirect),
  `src/lib/settings-keys.ts` y `src/app/api/dashboard/settings/route.ts` (solo el punto 5),
  componentes de `src/components/dashboard/cycle/` y del calendario que reemplaces, `src/app/api/dashboard/cycle/gift`
  (nuevo), `src/services/calendar.service.ts`, `getActiveBlackouts()` en `campaign.service.ts`, lo mínimo del drenador si
  el regalo manual lo pide, `supabase/migrations/<número>_*.sql` si hace falta, `tests/**`, `docs/features/calendar.md`,
  `docs/features/campaigns.md`, `docs/PENDIENTES.md`, `ESTADO.md`, `CHANGELOG.md`.

**Fuera de las tres partes:** los textos y el catálogo de plantillas, `src/constants/messaging.ts`, `vercel.json`, el cron
de cumpleaños, Recompensas (ya hecho, S-1), el AIOS. Si necesitas algo de afuera, para y explícame por qué.

## 6. Tests (cada uno falla contra el código de hoy)

Parte A: cada endpoint con Postgres real (conteos por caja con un ciclo armado a mano, nuevos contra ya volvieron, retorno
con y sin mensaje, segunda visita, aislamiento entre marcas y por sede, un fallo de base da 500) y las fechas especiales.
Parte B: la lógica pura de las tarjetas y de las cajas (sin React) y que la pantalla no muestra «0» ante un error.
Parte C: el regalo manual se otorga al enviar y no al encolar; «incluir dormidos»; el redirect; N-BLACKOUT y N-AUDIENCIA;
un super usuario de marca recibe 403 al escribir `cycle_enabled` y el operador no (punto 5).
Siempre: la suite entera en verde (la última corrida completa dio **86 archivos / 1.373 tests**). Compruébalo sin `stash`
(copias al scratchpad, `git show` de HEAD, corres, restauras) y di cuántos fallan contra el código anterior.

## 7. Cierre (cada parte)

1. `npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (base: 14) · `npx vitest run` entero en verde.
2. Docs de tu territorio al día; `docs/PENDIENTES.md` (lo hecho sale, lo nuevo entra); `ESTADO.md` (tu fila fuera; si hay
   migración, en §3: aplicarla ANTES del push); `CHANGELOG.md` (≤ 15 líneas).
3. Commit de tus archivos por nombre. Después:
   `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 8. Tu respuesta final (el dueño se la pasa al comandante)

Si algo impide desplegar, primero (y si hay migración, que va antes del push). Hashes, número de migración, archivos. Por
cada punto de tu parte: qué hiciste, archivo y línea, y el test. Cuántos tests fallan contra el código anterior. tsc, lint
y vitest con números. Lo que decidiste que no estaba en el prompt (mecanismo de «Hoy no», regalo manual, `AtRiskBubbles`
en la demo…) y lo que no coincida con el prototipo o el spec. **Si es la parte B o C, una captura o descripción de la
pantalla en un celular** (abre el servidor local).
