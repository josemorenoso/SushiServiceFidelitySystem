# Prompt — SEG-2 y SEG-3: lo que la ola 0 dejó abierto (2026-10-04)

> Propuesta de la sesión que cerró ESCALA-3 y ESCALA-4. **El dueño ordena la cola**: si prefiere otro rumbo
> (la «Ola 1: rastrear» de la auditoría §5, o el orden de `docs/ESTADO-CONSOLIDADO-2026-10-04.md` si ya existe),
> se cambia solo la sección TAREA y el resto del prompt sirve igual.

---

Leé `ESTADO.md` y seguí el ritual de `METODO_MAESTRO_LUISRAI.md` § 3.1: anotá tu territorio en el § 2 y commitealo
solo antes de tocar nada (hay otras sesiones vivas en esta carpeta: si tu territorio se cruza con una fila, esperá).
Después leé `docs/features/points-mystery-box.md` §7.4.ter («Lo que esto NO tapa»), `docs/features/meta-pixel.md`
(la deuda del `PUT /api/dashboard/tenant-config`, hacia la línea 198) y `docs/AUDITORIA-ESCALA-1000-2026-09-28.md` §7 y §8
(qué cerró la ola 0, qué cerraron ESCALA-3/4 y qué quedó abierto).

## CONTEXTO (ya hecho: no lo repitas)
- La ola 0 de seguridad y ESCALA-3/ESCALA-4 están **desplegadas en `main`** (`c055e8e` y `9a06670`). La migración **00069 está
  escrita pero el dueño todavía NO la aplicó** (cierra AISLA-2): no la edites ni asumas que corrió.
- `main` y `feat/multisede-aios` **ya no son lo mismo** (`ESTADO.md` §1, fila Código): la rama tiene cosas que no se despliegan
  (cumpleaños, arreglos de plantillas del 02-10). Lo que haya que llevar a `main` va por `cherry-pick` en un worktree con
  `npm ci` propio, y lo ordena el dueño.

## TAREA
Dos agujeros que la ola 0 dejó anotados y que **siguen vivos en producción**.

- **SEG-2 — la carrera de dos `POST /api/mystery-box/resolve` simultáneos.** `resolve` hace `getNivelOfrecido()` (lee los
  reclamos) → `resolveMysteryBox()` (INSERT en `mystery_box_results`, `src/services/mystery-box.service.ts:322`) →
  `grantReward()` (INSERT en `reward_grants`) → WhatsApp (`src/app/api/mystery-box/resolve/route.ts:102-164`). Nada de eso es
  atómico y `mystery_box_results` no tiene ningún UNIQUE (solo el índice `idx_mystery_box_results_claims`, 00059): dos llamadas
  del mismo cliente leen la oferta antes de que la primera escriba, y **las dos otorgan** — dos `reward_grants` que el mesero
  entrega y dos WhatsApp que paga la marca. El límite de tasa (en memoria de cada instancia) solo acota cuántas entran: un
  cliente con un script lo explota. **Arreglo:** que la BASE rechace el segundo reclamo de forma atómica (p. ej. UNIQUE
  parciales sobre las columnas `claimed_*` de la 00059, o un trigger con `pg_advisory_xact_lock` por cliente que aplique la
  misma regla OR de `elegirNivelSinReclamar()`), y que la ruta traduzca ese rechazo a **409 SIN otorgar ni mandar WhatsApp**.
  ⚠️ Un UNIQUE no se puede crear si ya hay duplicados históricos: **medí primero** (una consulta de solo lectura para que
  el dueño la corra) y decidí qué hacer con ellos ANTES de escribir la migración. Revisá cómo se sellan hoy esas columnas
  (00059): el INSERT de la línea ~328 no las nombra.
- **SEG-3 — `PUT /api/dashboard/tenant-config` exige alcance de marca.** Hoy autentica con `requireTenantId()`: un
  `role='location'` (administrador de UNA sede) cambia logo, paleta, tarjeta, link de reseñas, píxel y QR Studio de TODA la
  marca. Es la misma deuda que OPER-4 (`settings`) y que `reward-tiers`, ya cerradas con `exigirAlcanceDeMarca()`
  (`src/lib/alcance-de-marca.ts`). Aplicalo al `PUT`; el `GET` **se queda** (leer no cruza marcas, y exigir alcance ahí daría
  403 a todos: es el criterio de `reward-tiers`). ⚠️ **Cambia el comportamiento de varias pantallas** (consumidores a
  confirmar con `graphify query` o grep: `/dashboard/marca`, `/dashboard/settings` —tres llamadas—, `brand-logo`,
  `meta-conversions`): quien hoy edita ahí siendo administrador de sede va a recibir 403, y la pantalla tiene que decirlo
  **en español** (o esconder/deshabilitar el control) en vez de fallar muda. El link de reseñas POR SEDE se guarda por
  `/dashboard/sedes` (otra ruta): no se toca. Con 0 o 1 sede activa nada cambia.

## GUARDRAILS
- Solo tus archivos, por nombre. Sin cambiar de rama, sin `stash`, sin `reset --hard`, nunca `git add -A` (modo simple de
  `CLAUDE.md`). **Push y deploy son del dueño**: un push de `main` despliega solo (Vercel). No los hagas.
- **SEG-2:** la regla de «ya reclamado» es UNA sola función (`elegirNivelSinReclamar()` / `getNivelOfrecido()`, en
  `src/services/reward-tiers.service.ts`): no la dupliques en la ruta ni la cambies. Si la base la espeja, el espejo se prueba
  contra ella (igual que `can_see_location()` y su gemelo en TS). No toques `mystery_box_global_caps` (decisión abierta,
  `points-mystery-box.md` §7.1.bis).
- **Migración (si la hay):** el número sale de `node scripts/proxima-migracion.mjs` y se anota en TU fila del § 2 (esa fila es
  la reserva). **No se aplica**: la aplica el dueño ANTES de desplegar el código que la usa. Todo INSERT con `tenant_id`
  explícito (la 00030 nunca se aplicó). Si la función es `SECURITY DEFINER`, lleva
  `REVOKE ALL … FROM PUBLIC, anon, authenticated`; si no, `tests/db/ola0-seguridad.test.ts` se pone rojo, y está bien que lo haga.
  Las migraciones ya aplicadas no se editan.
- **SEG-3:** `tenants.config` es PÚBLICO por construcción; se escribe SOLO con `merge_tenant_config_deep()` y SOLO por rutas
  de la whitelist de `src/lib/tenant-config-paths.ts`: no la amplíes. Falla CERRADO, y un fallo de base es 500, no 403
  (`exigirAlcanceDeMarca()` ya lo hace).
- Una corrida de vitest a la vez (el `globalSetup` fija el puerto 55432; si otra fila del § 2 corre tests, esperá).
  `graphify.exe` lo bloquea Windows: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.
- Fuera de esta sesión: la «Ola 1: rastrear», ESCALA-1 y ESCALA-7 (crons y anti-duplicado de `campaign_messages`), el
  cumpleaños y las plantillas.

## CRITERIO DE TÉRMINO
- **SEG-2:** un test de BASE (`tests/db/`, Postgres embebido; patrón de `reserve-send-slot.test.ts`: N llamadas en paralelo)
  que lance varios reclamos SIMULTÁNEOS del mismo cliente y demuestre que **solo uno otorga**, y que **falla contra el código
  actual**. Más un test unitario de la ruta: el rechazo de la base da 409 sin `grantReward()` ni WhatsApp. El camino legítimo
  sigue otorgando y `tests/unit/mystery-box-resolve.test.ts` sigue en verde.
- **SEG-3:** tests (patrón de `tests/unit/settings-permisos.test.ts`, con los alcances fabricados por `decideLocationScope()`)
  que fallan antes y pasan después: `role='location'` → 403 y NADA escrito; super usuario de marca y operador de Cada1 → 200;
  fallo de base → 500. Las pantallas afectadas dicen el 403 en español.
- `tsc` limpio, lint sin errores nuevos (en la rama hoy son 14, todos preexistentes) y la suite entera en verde (hoy
  **61 archivos / 881 tests**).
- Docs en el mismo commit que el código: `points-mystery-box.md` §7.4.ter (se cierra «Lo que esto NO tapa»), `meta-pixel.md`
  (la deuda del `PUT` sale), `multi-sede.md` §3.septies, `ESTADO.md` (tu fila fuera, foto y cola), `CHANGELOG.md` ≤ 15
  líneas y la auditoría (§9) marcando los dos como cerrados en código. Grafo: `update .` al cerrar.
- Resumen en diez líneas y una línea que me pida el push con el hash. Si hay migración, aclarar cuál va antes.
  ⚠️ `main` no hace fast-forward sobre la rama (`ESTADO.md` §1, fila Código): decí qué commits hay que llevar a `main`
  (el de código, por `cherry-pick`; los docs de seguimiento —`ESTADO`, `CHANGELOG`, auditoría— se quedan en la rama).
