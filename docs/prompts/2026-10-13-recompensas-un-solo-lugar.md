# Prompt — Recompensas en un solo lugar (S-1) — 2026-10-13

> Escrito por el comandante (Opus 5.5). Decisiones del dueño ya tomadas: **A7** («Premios» sale de Campañas y va a
> Recompensas), **C1** (Recompensas absorbe los premios que hoy están en Ajustes; puntos y Black, después), **C2**
> («temporal» es la ventana de reclamo que ya existe), **C3** (los tres tipos de premio no se unifican todavía; las
> invitaciones eligen del catálogo). **Modelo recomendado: Sonnet** (mover pantallas, una ruta con permisos; sin cron ni
> drenador). Una sesión. Va **antes** de la fase 2 del ciclo: las dos tocan `campaigns/page.tsx`.

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Tu trabajo es **juntar los premios en Recompensas**. Hoy
viven en cuatro lugares: Recompensas (Niveles · Invitaciones · Redenciones), Campañas → pestaña «Premios» (el catálogo
`campaign_rewards`), Ajustes (premio de la reactivación agresiva y premio de la reseña) y el texto libre del premio de cada
invitación. Crear el premio de la insistente cuesta cuatro pantallas. Lo que pidió el dueño, textual: *«un solo apartado de
recompensas… que maneje todo»*. Y su regla para lo visual: *«me encanta cómo se ven ahora»*: **se mueve, no se rediseña**.

## 1. Antes de tocar nada (obligatorio, CLAUDE.md § "Cada sesión")

1. Lee `ESTADO.md` entero. Si en §2 hay una fila viva que toque tus archivos, NO arranques y avísame.
2. Anota tu fila en §2: «Recompensas en un solo lugar (S-1)», tu modelo y los archivos de la sección 4. Si al final
   necesitas migración (solo la de 2.4, si hace falta), corre `node scripts/proxima-migracion.mjs` ANTES de escribirla y
   pon el número en tu fila. Commitea SOLO `ESTADO.md`.
3. Lee: `docs/PENDIENTES.md` §4.1 y §8 (C1–C3, A7); `docs/ESTADO-CONSOLIDADO-2026-10-04.md` líneas 591–600 (la Tarea 1
   del dueño con el diagnóstico); `docs/features/reward-grants.md`, `docs/features/invite-campaigns.md`,
   `docs/features/points-mystery-box.md` §7 y `docs/features/ritmo-adaptativo.md` §7 (los regalos del ciclo, fase 1B).
   Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Qué construir

### 2.1 Una pestaña nueva en Recompensas: «Premios para regalar»

- `src/app/(dashboard)/dashboard/rewards/page.tsx` gana una cuarta pestaña, `?tab=premios`, con el catálogo
  (`CampaignRewardsCatalog`) **tal como se ve hoy**. Mismo patrón de lectura de la pestaña (`useSyncExternalStore`, nunca
  `useSearchParams()`).
- Campañas pierde la pestaña «Premios». `/dashboard/campaigns?tab=premios` y `/dashboard/campaign-rewards` llevan a
  `/dashboard/rewards?tab=premios` (los enlaces viejos siguen sirviendo). Nada más de `campaigns/page.tsx` se toca.

### 2.2 Dentro de esa pestaña, arriba del catálogo: «Para qué se usa cada premio»

Un bloque con los selectores que hoy están en Ajustes, más los del ciclo. Cada selector elige del catálogo de la marca y
guarda por `PUT /api/dashboard/settings` (ya tiene lista cerrada y alcance de marca):

| Selector | Clave | Texto de ayuda (vocabulario de dueño, spec §6.6) |
|---|---|---|
| **Regalo fuerte** (rescate) | `aggressive_reward_id` + `aggressive_reward_window_days` | «El que recibe quien lleva tiempo sin venir. Vence a los N días.» Con el ciclo encendido, es el del rescate y vence el domingo (`cycle_strong_reward_id` queda vacío y cae a este: **una sola elección para los dos caminos**) |
| **Regalo pequeño** | `cycle_small_reward_ids` (el primero) | «El del mensaje "Le regalamos algo". Lo usa el ciclo de recuperación cuando se encienda en tu marca.» |
| **Premio por reseña** | `review_reward_id` + `review_reward_window_days` | El de hoy, igual |

- En Ajustes, los dos bloques que se van («Premio de Reactivación Agresiva» y el selector de premio de «Reseñas de
  Google») dejan una tarjeta corta que lleva a Recompensas, como hizo «Plantillas» el 11-10. **Lo demás de Ajustes no se
  mueve** (puntos, Black, ticket promedio, check-in, el resto de reseñas): C1 dice «después».
- **C2, «temporal»:** donde se elige o se muestra un premio que vence, que se lea cuántos días dura («vence a los 7
  días», «vence el domingo» en el ciclo). No hay tipo nuevo de premio.
- Si una clave apunta a un premio desactivado o de otra marca, el selector lo dice («este premio ya no está activo: elige
  otro») en vez de mostrarse vacío. Un fallo de base **no** se muestra como «sin premio».

### 2.3 Permisos del catálogo (encontrado al escribir este prompt)

`src/app/api/dashboard/campaign-rewards/route.ts`: sus escrituras (crear, editar, borrar) autentican con
`requireTenantId()`, así que un administrador de UNA sede (`role='location'`) cambia el catálogo de TODA la marca. Es el
mismo agujero que se cerró en `reward-tiers` el 09-09. Las escrituras pasan por `exigirAlcanceDeMarca()`
(`src/lib/alcance-de-marca.ts`); el GET queda como está. Test que falla contra el código de hoy. Revisa si la pantalla
ofrece crear o borrar a un administrador de sede y, si sí, que no lo ofrezca.

### 2.4 Invitaciones eligen del catálogo (C3)

En `InviteCampaignsPanel`, el premio de una invitación se **elige del catálogo** (y se puede seguir escribiendo uno libre
si el dueño lo prefiere, como hoy). Mira primero cómo otorga la invitación su premio (`reward_grants` con
`source='invite'`, 00063): si para enlazarlo al catálogo hace falta guardar `campaign_reward_id` en `qr_campaigns`, es UNA
columna nullable con FK `ON DELETE SET NULL` y su migración (número del script, aplicada por el dueño ANTES del push). Si
no hace falta, sin migración: el selector llena el título. Di cuál elegiste y por qué. Los tres modelos de premio NO se
unifican (C3).

### 2.5 Lo que queda fuera (no lo hagas, anótalo si lo tocas de cerca)

Puntos y Black (C1, después) · los topes globales de la caja misteriosa (`mystery_box_global_caps`, sin pantalla: van por
`tier_id` y con premios por sede cambiarían de significado, 0.GAMMA) · la tarjeta «Activa» de la reactivación en Campañas
que no mira la agresiva (la reemplaza la fase 2) · el interruptor de premio de la reseña (S-5.2, C6, otra sesión).

## 3. Tests (fallan contra el código de hoy)

- Las escrituras de `campaign-rewards` rechazan a un `role='location'` con 403 y dejan pasar al de marca y al super-admin
  (mira cómo lo prueba `reward-tiers`).
- El selector «Regalo fuerte» escribe `aggressive_reward_id` y el ciclo lo usa como fuerte cuando `cycle_strong_reward_id`
  está vacío (ya lo hace `normalizeCycleSettings()`: un test que lo fije).
- Si hiciste la migración de 2.4: CHECK/FK y que una invitación con premio del catálogo otorga ese premio.
- Siguen en verde: toda la suite (la última corrida completa dio **82 archivos / 1.277 tests**).

Compruébalo sin `stash`: copia tus archivos al scratchpad, vuelve a los de HEAD con `git show`, corre tus tests, restaura.

## 4. Territorio

`src/app/(dashboard)/dashboard/rewards/page.tsx` · `src/app/(dashboard)/dashboard/campaigns/page.tsx` (solo quitar la
pestaña y su redirección) · `src/app/(dashboard)/dashboard/campaign-rewards/page.tsx` · `src/app/(dashboard)/dashboard/settings/page.tsx`
(solo los dos bloques de premio) · `src/components/dashboard/CampaignRewardsCatalog.tsx` · `src/components/dashboard/InviteCampaignsPanel.tsx`
· componentes nuevos en `src/components/dashboard/` · `src/app/api/dashboard/campaign-rewards/route.ts` (y su `[id]` si
existe) · lo mínimo de la ruta de invitaciones si 2.4 lo pide · `supabase/migrations/<número>_*.sql` (solo si 2.4 lo pide)
· `tests/**` nuevos · `docs/features/reward-grants.md` · `docs/features/invite-campaigns.md` · `docs/features/campaigns.md`
· `docs/features/dashboard.md` · `docs/PENDIENTES.md` · `ESTADO.md` · `CHANGELOG.md`.
**Fuera no se toca**: los crons, el drenador, `cycle-engine.ts`, `settings-keys.ts` (las claves ya existen), las
plantillas, el check-in. Si necesitas algo de afuera, para y explícame por qué.

## 5. Reglas que no se rompen

- **Se mueve, no se rediseña** (S-2.4). Ningún hex nuevo horneado: los colores van por `--brand-*`.
- Nada en pesos (D7). Todo INSERT con `tenant_id` explícito; la sede, nullable con FK COMPUESTA si aparece.
- Supabase JS: destructura `error` y pásalo por `src/lib/db-failure.ts`. Un fallo de base no es «vacío».
- `useSearchParams()` no (CSR bailout): `useSyncExternalStore` como en `rewards/page.tsx`.
- Git: solo tus archivos, por nombre. Nunca `git add -A` ni `git add .`, ni cambiar de rama, ni `stash`, ni
  `reset --hard`. Commits locales sí; push y deploy NO. Si hay migración, no la aplicas.

## 6. Cierre

1. `npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (base: 14) · `npx vitest run` entero en verde.
2. Docs: dónde vive cada premio ahora (`reward-grants.md`, `campaigns.md`, `dashboard.md`); corrige las menciones a
   «Campañas → Premios» y a «Ajustes → Premio de reactivación» en `docs/features/` (las de docs viejos de auditoría, no).
3. `docs/PENDIENTES.md`: S-1.1, S-1.3 y lo que cierres salen de §4.1; lo nuevo, donde corresponda.
4. `ESTADO.md`: borra tu fila; si hay migración, en §3 lo que el dueño tiene que aplicar ANTES del push.
5. `CHANGELOG.md`: una entrada de 15 líneas como máximo.
6. Commit de tus archivos por nombre. Después:
   `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 7. Tu respuesta final (el dueño se la pasa al comandante para revisarla)

- Si algo impide desplegar, dilo primero (y si hay migración, que va antes del push).
- Hashes, número de migración si hubo, lista exacta de archivos.
- Por cada punto de la sección 2: qué hiciste, archivo y línea, y el test.
- Cuántos tests fallan contra el código anterior y cómo lo comprobaste.
- tsc, lint y vitest con números.
- Qué decidiste en 2.4 y por qué.
- Lo que no coincida con este prompt, aunque no lo hayas arreglado.
