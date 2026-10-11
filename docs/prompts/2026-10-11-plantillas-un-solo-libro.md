# Prompt — Plantillas: un solo libro, una sola pantalla, las plantillas nuevas juntas (2026-10-11)

> Escrito por el comandante (Opus 5.5) con las decisiones B1–B7 del dueño ya tomadas (`docs/PENDIENTES.md` §8, bloque B).
> **Modelo recomendado: Opus.** Puede correr **al mismo tiempo que la fase 1A del ciclo**
> (`docs/prompts/2026-10-11-ciclo-fase-1a-motor-base.md`): la sección 4 dice qué archivos son de cada una.
> Esta sesión es solo el **producto**. El AIOS (B7) y la reducción de 13 a 8 aprobaciones (B1) van en otra sesión,
> después de esta.

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Tu trabajo es **quitarle la fricción al área de
plantillas**, que el dueño llamó «un sistema altamente mediocre» y que hoy lo obliga a crear plantillas a mano en la
consola de Twilio. Sin push, sin deploy. Si necesitas una migración, la reservas en tu fila y **no la aplicas**.

## 1. Antes de tocar nada (obligatorio, CLAUDE.md § "Cada sesión")

1. Lee `ESTADO.md` entero. Mira el tablero (§2): si la fase 1A está viva, **su fila manda sobre sus archivos** (sección
   4). Si otra fila toca los tuyos, NO arranques y avísame.
2. Anota tu fila en §2 («Plantillas: un solo libro y una sola pantalla», tu modelo, tus archivos). Si vas a necesitar
   migración, corre `node scripts/proxima-migracion.mjs` **después** de leer el tablero y pon el número en tu fila.
   Commitea SOLO `ESTADO.md` con ese cambio.
3. Lee enteros, en este orden:
   - `docs/PENDIENTES-PLANTILLAS.md` (las nueve fallas y el plan; es tu diagnóstico).
   - `docs/PENDIENTES.md` §3 y §8 bloque B (las decisiones del dueño).
   - `docs/prompts/2026-09-12-plantillas-una-por-una.md` (su punto 1 sigue pendiente y es parte de tu trabajo).
   - `docs/features/whatsapp-templates.md`, `docs/PLANTILLAS.md`, `docs/features/zernio-messaging.md`.
   - El spec del ciclo §4 (`docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`): el texto de
     «Regalo que vence».
   - `docs/features/testing.md` (una corrida de vitest a la vez, `TEST_PG_PORT=55432`).
   - Antes de leer código suelto: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Las decisiones que ya tomó el dueño (no se discuten)

- **B3:** «Nivel desbloqueado» y «Recordatorio de premio» son plantillas propias del catálogo.
- **B4:** las plantillas puntuales (las que el dueño crea para una campaña) viven en una **biblioteca reutilizable**,
  en una pestaña aparte dentro de Plantillas.
- **B5:** las marcas Zernio pueden crear plantillas libres desde el panel (hoy no pueden).
- **B6:** las plantillas nuevas entran juntas, para que cada marca haga **un solo viaje** a Meta.
- **Restricción del dueño:** *«me encanta cómo se ven ahora»*. No rediseñes el aspecto. Unificar es reusar los
  componentes que ya hay, no inventar otros.
- Los textos cálidos existentes no se tocan. El contrato `{{n}}` de las plantillas existentes no se toca.

## 3. Qué construir, en orden

1. **Adoptar lo que ya existe en la WABA** (punto 1 del prompt del 12-09): al cargar el catálogo de una marca Zernio,
   reconocer las plantillas que ya están en su cuenta de WhatsApp (nombre base o `_vN`), con su estado y su
   **categoría real** (Meta recategoriza: «bienvenida» de Planeta Wings pasó de UTILITY a MARKETING). Un 400 de nombre
   o categoría repetidos dice «ya existe en tu cuenta» y la adopta; nunca «vuelve a intentarlo más tarde».
   `nextProviderRef()` mira la unión de `template_versions` y la WABA. Usa el caché de 60 s que hizo P1-a (N16).
2. **Cerrar el hueco catálogo ↔ código.** P1-a encontró **cuatro** punteros que el código lee y el catálogo no cubre
   (`tests/unit/p1a-plantillas-paridad.test.ts`, `EXCEPCIONES_CONOCIDAS`):
   - `tier_unlocked_template_sid` y `reward_reminder_template_sid` **entran al catálogo** (B3). Hoy en una marca Zernio
     subir de nivel es silencio total y el recordatorio de premio no sale.
   - `reactivation_with_reward_template_sid` y `reactivation_template_sid` (legacy) **no entran**: los retira la fase 1B
     del ciclo, que reemplaza la reactivación por el ciclo. Se quedan como excepciones, con ese motivo escrito en el test.
3. **Las plantillas nuevas juntas (B6).** Entran al catálogo en este mismo trabajo: «Nivel desbloqueado», «Recordatorio
   de premio» y **«Regalo que vence»** (`gift_expiring`, texto del spec §4, MARKETING; variables `{{1}}` nombre ·
   `{{2}}` regalo · `{{3}}` fecha límite · `{{4}}` camino de niveles). «Cumpleaños — dos días antes» ya está. Las tres
   nuevas pasan las 5 reglas de `tests/unit/template-catalog.test.ts`, la proporción de palabras por variable, y
   **sin emojis de rubro horneados** (usar `${emoji}`; hay un test). Los textos nuevos los propones tú siguiendo el
   estilo cálido; **el dueño los ve en el panel antes de someterlos a Meta** (nada se somete solo).
   `gift_expiring` solo se agrega al catálogo: quién la usa y el adaptador a la insistente son de la fase 1B.
4. **Una sola pantalla para Twilio y Zernio.** Un renglón por mensaje del catálogo, con su estado real y un botón
   (crear / someter / ver motivo del rechazo). El puntero se asigna **solo** al aprobarse (`fillEmptyPointer()` ya existe
   en el lado Twilio; Zernio ya lo hace con `promoteVersion()`). Cuando la pantalla única cubra a Twilio,
   **desaparece «Ajustes › Plantillas WhatsApp»**: así se cierra OPER-4-bis (hoy en una marca Zernio esa sección traga un
   400 sin avisar). Si quitarla deja a alguna marca sin forma de asignar un puntero que hoy asigna por ahí, NO la quites
   y dímelo.
5. **La biblioteca de puntuales (B4) y las libres de Zernio (B5).** Pestaña aparte en Plantillas: las que el dueño crea
   para campañas, reutilizables, en los dos proveedores. Zernio usa el endpoint de creación que ya existe para el catálogo
   (rutas de `docs/features/zernio-messaging.md` y del contrato de Zernio; **las rutas de Zernio no se inventan**:
   salen de `Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §4). Campañas → Mensaje libre las lista.
6. **N5-bis:** las rutas de plantillas de Twilio exigen alcance de marca (`exigirAlcanceDeMarca()`), como las de Zernio
   desde P1-a.

**Si el trabajo no cabe en una sesión:** cierra con todo en verde al terminar el punto 3 (o el 4), dilo en tu respuesta, y
el resto lo toma otra sesión con este mismo prompt.

## 4. Territorio, y qué es de la fase 1A

- **Tuyo:** `src/constants/template-catalog.ts`, `src/constants/template-texts.ts`, `src/services/template.service.ts`,
  `src/services/twilio-catalog.service.ts`, `src/lib/zernio/templates.ts`, `src/lib/twilio/content-list.ts`,
  `src/app/api/dashboard/templates/**`, `src/app/(dashboard)/dashboard/templates/**`,
  `src/components/dashboard/templates/**`, la sección de plantillas de `src/app/(dashboard)/dashboard/settings/page.tsx`,
  `src/components/dashboard/ManualCampaigns.tsx` (solo para listar la biblioteca), `tests/**` nuevos y
  `tests/unit/p1a-plantillas-paridad.test.ts`, `docs/features/whatsapp-templates.md`, `docs/PLANTILLAS.md`,
  `docs/PENDIENTES-PLANTILLAS.md`, `docs/PENDIENTES.md`, `ESTADO.md`, `CHANGELOG.md`.
- **De la fase 1A mientras su fila esté viva:** `src/lib/settings-keys.ts`, `src/lib/cycle-engine.ts`,
  `src/lib/communications/**`, `src/constants/rankings.ts`, las migraciones que ella reserve, `docs/DB_SCHEMA.md`.
  Si necesitas cambiar `settings-keys.ts` (por ejemplo, porque los punteros nuevos del catálogo entran a la lista
  cerrada, que se arma desde `TEMPLATE_CATALOG`), **espera a que la 1A cierre** o deja el cambio anotado y dímelo.
- **Nadie lo toca:** `src/constants/messaging.ts`, `vercel.json`, los crons, `queue-drain`, `whatsapp.service.ts` (salvo
  que un punto lo exija: para y explícame por qué).

## 5. Reglas que no se rompen

- **`promoteVersion()` es el único escritor de `admin_settings.*_template_sid` en las marcas Zernio.** `fillEmptyPointer()`
  es aditivo: solo rellena claves vacías, nunca cambia un puntero vivo.
- Cada cosa lleva un test que **falla contra el código de hoy** y pasa con el tuyo. Compruébalo sin `stash`: copia tus
  archivos al scratchpad, vuelve a los de HEAD con `git show`, corre los tests, restaura. Dilo en el CHANGELOG.
- Supabase JS: destructura siempre `error` y pásalo por `src/lib/db-failure.ts`. Todo INSERT con `tenant_id` explícito
  (la 00030 no corrió: confirmado el 11-10).
- **No sometas nada a Meta, Twilio ni Zernio de verdad.** No mandes ningún WhatsApp. Los tests usan dobles.
- Git: solo tus archivos, por nombre. Nunca `git add -A` ni `git add .`. Nunca cambies de rama, ni `stash`, ni
  `reset --hard`. Commits locales sí; push y deploy NO.

## 6. Cierre

1. `npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (hoy hay 14 preexistentes) · `npx vitest run` entero en
   verde (hoy: 71 archivos / 1.017 tests). Si la fase 1A está corriendo tests, espera: una corrida a la vez.
2. `docs/features/whatsapp-templates.md` reescrito a lo que hace el código; `docs/PENDIENTES-PLANTILLAS.md` con los pasos
   hechos marcados; `docs/PENDIENTES.md` §3 sin lo que cerraste.
3. `ESTADO.md`: borra tu fila. En §3 deja lo que el dueño tiene que hacer por marca: revisar los tres textos nuevos y
   someterlos **juntos** con «Cumpleaños — dos días antes» (un solo viaje a Meta).
4. `CHANGELOG.md`: una entrada de 15 líneas como máximo.
5. Commit de tus archivos por nombre. Después:
   `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 7. Tu respuesta final (el dueño se la pasa al comandante)

- Si algo impide desplegar, dilo primero. Si dejaste puntos para otra sesión, cuáles.
- Hash del commit, migración (si hubo) y lista exacta de archivos.
- Por cada punto de la sección 3: qué hiciste, archivo y línea, y el nombre del test.
- Cómo comprobaste que los tests fallan contra el código anterior, y cuántos fallaron.
- tsc, lint y vitest con números.
- Los tres textos nuevos completos, tal como los verá el dueño.
- Lo que no coincida con este prompt o con el código.
