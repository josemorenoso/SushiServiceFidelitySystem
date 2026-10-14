# Prompt — SEDE-OPERADOR: el operador de Cada1 ve el panel de una marca con dos sedes (2026-10-14)

> Escrito por el comandante (Opus 5.5). Una sesión, chica, **sin migración**. Opus (son permisos). Puede correr en
> paralelo con la parte 2 de `docs/prompts/2026-10-14-sedes-separadas.md` (no comparten archivos).

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Arreglas **un** defecto de permisos.

## 0. El defecto (verificado por el comandante contra el código)

El operador de Cada1 (`app_metadata.role = 'super_admin'`) recibe **403** en Métricas, Rendimiento, Redenciones,
Domicilios, Autorizados, Mis sedes y el historial de Campañas de **toda marca con 2+ sedes** (hoy Tepuy). Es
`docs/PENDIENTES.md` §5 **SEDE-OPERADOR**. Ya pasaba antes de las sedes separadas; lo encontró su parte 1.

Causa: `requireLocationScope()` (`src/lib/location-scope.ts:319`) resuelve el alcance solo con las filas de
`dashboard_user_locations` y el operador no tiene fila en las marcas de sus clientes, así que con 2+ sedes el fail-safe
del §5.1 le contesta 403. En SQL esa mitad SÍ está: las policies de la 00045 son `is_super_admin() OR
can_see_location(location_id)` —el `OR` va AFUERA de `can_see_location()`—, y para escribir, `puedeEscribirEnLaMarca()`
(`location-scope.ts:418`) ya lleva el mismo `OR`. El camino de LECTURA es el único que no lo tiene. Consecuencia: el dueño
de Cada1 no puede mirar el panel de Tepuy para dar soporte.

## 1. Antes de tocar nada

1. Lee `ESTADO.md` entero. Si en §2 hay una fila viva que toque tus archivos, NO arranques y avisa.
2. Anota tu fila en §2 («SEDE-OPERADOR: …», modelo, archivos). Commitea SOLO `ESTADO.md`.
3. Lee `docs/features/multi-sede.md` §3.quater (sobre todo «El fail-safe recalibrado — §5.1» y «El selector — §8.4») y
   §3.septies punto 5, y la sección «Qué es de la marca y qué es de cada sede, pantalla por pantalla».
4. Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Qué hacer

1. En `requireLocationScope()`: si quien pide es el operador de Cada1, su alcance en la marca de su sesión es **el de
   marca** —todas las sedes activas, «toda la marca» y lo sin sede—, igual que el `OR` de la 00045. Léelo con la
   función que ya existe (`isSuperAdmin()`, `src/lib/admin.ts`, o el `app_metadata` que `requireLocationScope()` ya
   tiene en la mano) y dilo en un comentario con la referencia a la 00045.
2. **`decideLocationScope()` NO se toca**: es el espejo de `can_see_location()` y `tests/db/multisede-permisos.test.ts`
   lo vigila. El `OR` va afuera, como en SQL.
3. Un administrador de sede (`role='location'`) y un usuario de marca siguen exactamente igual. Las marcas de 0 o 1 sede,
   también.
4. Si el operador elige una sede en el selector, ve esa sede (como un usuario de marca).
5. De paso, mira si el selector y `toScopeView()` le dibujan «Toda la marca (N sedes)» al operador; si no, que sí.
6. **Fuera de este prompt** (anótalo, no lo arregles): `requireBrandScope()` de `src/app/api/dashboard/users/route.ts`
   (quién crea usuarios de una marca ajena es decisión del dueño, ver el comentario de `puedeEscribirEnLaMarca()`), y
   cómo llega el operador a la sesión de una marca (no lo cambies).

- Territorio: `src/lib/location-scope.ts` (solo `requireLocationScope()` y, si hace falta, `toScopeView()`),
  `tests/**` nuevos, `docs/features/multi-sede.md`, `docs/PENDIENTES.md`, `ESTADO.md`, `CHANGELOG.md`.

## 3. Reglas

- Un dato de la marca A jamás se ve en la marca B: el operador ve la marca **de su sesión** (`app_metadata.tenant_id`),
  nada más. Ningún parámetro de la petición le abre otra marca.
- Fail-closed: un fallo al leer la sesión o las sedes sigue siendo 500; sin marca en el JWT, 403 como hoy.
- Git: solo tus archivos, por nombre. Nunca `git add -A`, ni cambiar de rama, ni `stash`, ni `reset --hard`. Una corrida
  de vitest a la vez (avisa por `SendMessage` si hay otra sesión viva). Sin push ni deploy.

## 4. Tests (fallan contra el código de hoy)

Con Postgres real o con la fábrica: el operador en una marca de 2 sedes recibe 200 con «toda la marca» en Métricas (y en
al menos otra ruta de la lista), y con `?location_id=<sede>` ve esa sede; un administrador de sede sigue con solo la
suya; un usuario de marca, igual que hoy; una marca de 1 sede, sin cambios; el operador con el JWT de la marca A no ve
nada de la marca B. Suite entera en verde (la última corrida completa dio **98 archivos / 1.658 tests**); compruébalo
sin `stash` y di cuántos fallan contra el código anterior.

## 5. Cierre

`npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (base: 14) · `npx vitest run` entero (mira la línea «Test
Files»: una corrida que pierde un proceso sale con código 0 igual). SEDE-OPERADOR sale de `docs/PENDIENTES.md` §5;
`multi-sede.md` dice la regla nueva; `CHANGELOG.md` (≤ 15 líneas); tu fila fuera. Commit por nombre y
`/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 6. Tu respuesta final

Hashes, archivos, qué cambiaste (archivo y línea), los tests y cuántos fallan contra el código anterior; tsc, lint y
vitest con números; y lo que anotaste para después.
