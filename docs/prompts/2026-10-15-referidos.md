# Prompt — Referidos: el cliente trae a un amigo y los dos ganan (2026-10-15)

> Escrito por el comandante (Opus 5.5) la noche del 14 al 15-10. **Modelo: Opus.** Una sesión larga, **de noche: el dueño
> duerme y no puede contestar.** Corre en paralelo con otras sesiones (mira el tablero).

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Construyes el **programa de referidos**: un cliente
comparte su enlace, el amigo se registra con él, y cuando el amigo viene de verdad, los dos ganan.

## 0. De dónde sale y qué ya existe

- El dueño (lista de septiembre, S-6): *«Ya tenemos el apartado de invitaciones: necesito que creemos ya el apartado de
  referidos»*. El 15-10, antes de dormir: *«falta el tema de los referidos»*.
- **El plan ya está escrito:** `docs/features/referral-program.md` (§2 referidos, §4 modelo de datos, §5 rutas, §6 UI, §7
  fases, §8 dudas). Léelo entero: es la base. **Lo que ya está construido y se reusa:** las invitaciones con premio
  (`docs/features/invite-campaigns.md`, migración 00063): el enlace `/c/{slug}`, el premio que queda en la tarjeta desde
  el registro y **se entrega cuando el mesero escanea** (`reward_grant`), la visita #1 que no se suma hasta que el cliente
  viene, el badge del mesero. `invite-campaigns.md` § «Lo que falta para que sea referidos» dice exactamente qué falta.
- El catálogo de premios vive en **Recompensas › Premios para regalar** (S-1, `docs/features/reward-grants.md` §
  «Dónde vive cada premio»), con selectores reusables (`RewardUsageSelectors.tsx`).

## 1. Las decisiones (las tomó el comandante; son AJUSTES de cada marca, así que el dueño las cambia sin código)

1. **Ganan los dos.** El amigo, un regalo de bienvenida; quien lo trajo, su premio. Cada uno se elige por marca: un premio
   del catálogo (Premios para regalar), **o puntos**, **o nada**.
2. **El premio de quien invita se gana cuando el amigo VIENE**, validado por el mesero (el escaneo de su primera visita),
   nunca al registrarse. El regalo del amigo queda en su tarjeta desde el registro y se entrega en esa visita, igual que una
   invitación.
3. **Reglas** (plan §2.3): un teléfono se refiere una sola vez por marca; un cliente que ya existe en la marca no cuenta
   como referido; nadie se refiere a sí mismo; tope de premios por referidor al mes (ajuste, default **10**, el del plan); un referido
   pendiente vence a los **30 días** sin venir (ajuste).
4. **Apagado por defecto en todas las marcas.** Se enciende en Recompensas › Referidos.
5. **Sin plantillas nuevas de WhatsApp en esta sesión.** El amigo recibe el enlace por el WhatsApp PERSONAL de quien
   invita (botón «Compartir por WhatsApp» con `wa.me/?text=…`), no por la línea de la marca: no gasta cupo, no pide
   aprobación de Meta y quien invita nunca escribe el teléfono de su amigo (Ley 1581: el amigo da su propio
   consentimiento al registrarse). El aviso «¡Tu amigo vino, ganaste X!» por WhatsApp y el «trae a un amigo» dentro del
   flujo mensual (S-6.2) quedan para después: anótalos en `docs/PENDIENTES.md` (necesitan plantilla y se cruzan con B1 y el
   motor de piezas del ciclo). En esta sesión, quien invita ve su premio y el estado de sus invitados **en su tarjeta**.
6. **Es de la marca, no de la sede**: el enlace sirve en cualquier sede, el premio se canjea en cualquiera. La sede de
   registro y la de la visita se anotan como siempre (F3). Con 2+ sedes, el registro por el dominio raíz pide la sede (el
   409 del registro): el enlace de quien invita tiene que funcionar igual en una marca de dos sedes como Tepuy (elige cómo
   —el dominio de la sede donde quien invita vino por última vez, o una elección en la landing— y dilo).

**El dueño duerme: no le preguntes nada.** Si algo es suyo de verdad, elige el default más conservador, anótalo en
`docs/PENDIENTES.md` §8 con ese default y sigue.

## 2. Antes de tocar nada

1. Lee `ESTADO.md` entero. **Hay sesiones vivas:** mira §2. **La parte 2 de sedes tiene la tarjeta pública** (`src/app/(public)/tarjeta/**`
   y donde el check-in dibuja la tarjeta): **no toques esos archivos mientras su fila esté en el tablero**. Empieza por lo
   que no los toca (base, servicio, registro, panel, mesero, tests) y deja el botón de la tarjeta para el final; antes de
   tocarla, vuelve a mirar el tablero (si sigue viva, espérala con `Monitor` hasta que su fila salga, o pregúntale por
   `SendMessage`).
2. Anota tu fila en §2 («Referidos», modelo, archivos). Corre `node scripts/proxima-migracion.mjs` y pon el número en la
   fila (es la única reserva). Commitea SOLO `ESTADO.md`.
3. Lee: `docs/features/referral-program.md`, `docs/features/invite-campaigns.md`, `docs/features/reward-grants.md`,
   `docs/features/points-mystery-box.md` §7.4.ter, `docs/features/qr-checkin.md`, `docs/features/staff-qr-scan.md`,
   `docs/features/multi-sede.md` («Columnas de sede», §3.bis) y `docs/PENDIENTES.md` §4.2 y §8 (C7).
4. Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 3. Qué construir, en este orden (un commit por fase, que cada una cierre limpia)

1. **La base** (migración con el número del script): lo mínimo del plan §4 —el código de cada cliente y la relación
   referidor → referido con su estado (pendiente · completado · vencido) y sus fechas—, la fuente `referral` para
   `reward_grants` si el CHECK de fuentes lo exige, y los ajustes `referral_*` en `src/lib/settings-keys.ts` (lista cerrada;
   de paso, **S-1.6**: corrige ahí los comentarios que todavía dicen «Ajustes › …»). Todo INSERT con `tenant_id`; toda
   columna que apunte a un cliente o a una sede, con FK COMPUESTA con `tenant_id`; un UNIQUE que impida referir dos veces
   el mismo teléfono en la marca. Nada de backfill. Las migraciones se aplican en Supabase ANTES del push: no la apliques.
2. **El servicio y el registro:** `src/services/referral.service.ts` (código, validaciones, completar, vencer) y el registro
   con código en `POST /api/check-in` (extiende lo de las invitaciones, no lo dupliques): el amigo entra pendiente del
   mesero con su regalo en la tarjeta. **Al validar el mesero su primera visita**, se completa el referido y se otorga el
   premio de quien invita UNA vez (dos escaneos simultáneos no otorgan dos: candado o UNIQUE, como SEG-2), con
   `granted_location_id` = la sede de esa visita (la resuelve F3/F4). Los vencidos se marcan sin cron nuevo (al leer, o
   donde ya corra algo diario: decide y dilo; `vercel.json` NO se toca).
3. **La landing** `/r/[código]`: «{Nombre} te regaló {beneficio} 🎁» y el formulario de registro de siempre. Un código que
   no existe, de otra marca o con referidos apagados: la landing normal de la marca, sin error feo.
4. **El panel:** Recompensas gana la pestaña **«Referidos»**: encender/apagar, el premio de quien invita y el del amigo
   (los selectores del catálogo que ya existen, o puntos, o nada), el tope al mes, los días de vencimiento, el texto del
   mensaje para compartir (con `{nombre}`, `{beneficio}` y `{enlace}`), y los números: invitados que se registraron, que
   vinieron, premios entregados y los que más traen (conteos, **nunca pesos**). Escribir exige alcance de marca
   (`exigirAlcanceDeMarca()`). Un fallo de base = 500 y la pantalla lo dice, nunca «0».
5. **El mesero:** el regalo del amigo y el premio de quien invita aparecen en su lista con el badge **«REFERIDO»**.
6. **La tarjeta (al final, cuando la parte 2 de sedes haya cerrado):** el botón **«🎁 Gánate {X} por traer a un amigo»**
   (solo con referidos encendidos y premio elegido): abre el enlace, el botón «Compartir por WhatsApp» y la lista «Tus
   invitados» con su estado. Sin hex nuevos (`--brand-*`), celular primero, sin `useSearchParams()`.

## 4. Reglas

- **Un dato de la marca A jamás se ve ni se atribuye a la marca B.** El código de un cliente de la marca A no sirve en la B.
- `location_id` NULL = sede desconocida, se muestra, nunca se backfillea.
- Supabase JS: destructura `error` y pásalo por `src/lib/db-failure.ts`. Listas grandes: `leerTodo()`.
- No toques: plantillas, `src/constants/messaging.ts`, `template-catalog.ts`, `template-texts.ts`, `vercel.json`, el ciclo.
  Si necesitas algo de afuera, anótalo y sigue sin eso.
- Git: solo tus archivos, por nombre. Nunca `git add -A`, ni cambiar de rama, ni `stash`, ni `reset --hard`. **Una corrida
  de vitest a la vez**: hay otras sesiones; avisa por `SendMessage` antes y después. Sin push.

## 5. Tests (fallan contra el código de hoy)

Con Postgres real: el registro con código deja al amigo pendiente con su regalo; el premio de quien invita sale SOLO al
validar el mesero la primera visita, y una sola vez aunque lleguen dos escaneos a la vez; auto-referencia, teléfono ya
cliente y teléfono ya referido: no cuentan; el tope del mes; el vencimiento; una marca con referidos apagados no cambia en
nada; el código de la marca A no sirve en la B; el enlace funciona en una marca de dos sedes y en una de una; el canje en
cualquier sede; los ajustes rechazan un premio de otra marca; un fallo de base es 500. Suite entera en verde (la última
corrida completa dio **99 archivos / 1.677 tests**); compruébalo sin `stash` y di cuántos fallan contra el código anterior.

## 6. Cierre

`npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (base: 14) · `npx vitest run` entero (mira «Test Files»: una
corrida que pierde un proceso sale con código 0 igual). Docs: `docs/features/referral-program.md` pasa de plan a «lo que
hay» (y lo que queda), `invite-campaigns.md`, `reward-grants.md`, `docs/API_DOCS.md`, `docs/DB_SCHEMA.md` (si nadie más los
tiene en su fila; si sí, coordina), `docs/PENDIENTES.md` (S-6 y C7 con lo que quedó), `ESTADO.md` (tu fila fuera; la
migración en §3 con «aplicar ANTES del push»), `CHANGELOG.md` (≤ 15 líneas). Commit por nombre y
`/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 7. Tu respuesta final (el dueño se la pasa al comandante por la mañana)

Primero, si algo impide desplegar (la migración va ANTES del push). Hashes, número de migración, archivos. Por cada punto
del §3: qué hiciste, archivo y línea, y el test. Cuántos fallan contra el código anterior. tsc, lint y vitest con números.
Lo que decidiste y no estaba aquí, lo que quedó sin hacer y por qué, y **cómo se ve en un celular**: la tarjeta con el
botón, la landing del amigo y la pestaña del panel.
