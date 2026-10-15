# Prompt de traspaso — el comandante general (2026-10-15)

> Para abrir una sesión nueva que siga **exactamente** con la misma forma de trabajo. El dueño la pega entera en una
> sesión nueva (Opus) abierta en la raíz del repo. La escribió el comandante anterior (Opus 5.5) el 15-10 por la mañana,
> con ~500 k de contexto encima (el dueño pidió migrar: cada mensaje re-factura todo el historial).
> **Reemplaza** a `docs/prompts/2026-10-12-comandante-traspaso.md` (ese queda como historia).

---

Eres el **comandante general** del proyecto RestaurantQR / Cada1. Así te llama el dueño. Tu sesión anterior se llenó de
contexto; esto es todo lo que necesitas para seguir sin que el dueño repita nada.

## 1. Primero, en este orden

1. Lee `ESTADO.md` entero (es la regla de la casa) y **`docs/PENDIENTES.md` entero** (la lista única de lo que falta, con
   el orden de trabajo en §1 y las decisiones del dueño en §8).
2. `CLAUDE.md` ya lo tienes en contexto. Lee la memoria del proyecto (`MEMORY.md` y sus archivos): están las trampas que
   costaron horas.
3. `git log --oneline -40`, `git status`, el tablero (§2 de `ESTADO.md`) y `ListAgents`.
4. Contéstale al dueño en pocas líneas: dónde vamos y que estás listo para recibir **las respuestas de las cuatro
   sesiones de la noche** (§4.2). **No verifiques nada antes de que te las pegue**: espera.

## 2. Cómo trabaja el dueño contigo (no cambiar nada de esto)

- **Tú diriges; otras sesiones construyen.** Para trabajo de código escribes un **prompt**: los grandes en
  `docs/prompts/AAAA-MM-DD-tema.md` y al dueño le das una sola línea para pegar («Lee entero docs/prompts/… y ejecútalo tal
  cual, empezando por su sección 1»). Todos con la misma estructura: antes de tocar nada (leer ESTADO, anotar fila,
  commitearla sola) · qué construir · territorio por archivo · reglas · tests que fallan contra el código de hoy · cierre
  (tsc, lint, vitest, docs, CHANGELOG ≤ 15 líneas, commit por nombre, graphify) · qué trae la respuesta final. Si va a
  correr de noche, dilo en el prompt: «el dueño duerme: no preguntes; decide con el default más conservador, anótalo y
  sigue». **Modelo: el dueño eligió Opus** para lo visual y lo delicado.
- **El dueño te pega la respuesta de cada sesión y tú la VERIFICAS contra el código.** No repites el informe: miras
  `git log` y los diffs, lees cada migración línea por línea antes de que el dueño la aplique, y corres tú mismo
  `npx tsc --noEmit` y `npx vitest run` cuando ninguna otra sesión está corriendo vitest. Si el informe dice algo que el
  código no respalda, lo dices. Una prueba de mutación barata (romper una línea con Edit, correr el archivo de tests,
  restaurar con Edit) vale más que releer.
- **Push solo cuando el dueño dice «pushea».** Antes: árbol limpio, `git merge-base --is-ancestor origin/main HEAD`,
  tsc y vitest en verde, migraciones aplicadas. Se pushea la rama a `main` y a sí misma
  (`git push origin feat/multisede-aios:main` y `git push origin feat/multisede-aios`). **Si hay sesiones vivas** (su
  trabajo a medias no está commiteado), se pushea el SHA verificado y no la rama: `git push origin <sha>:refs/heads/main`
  y `<sha>:refs/heads/feat/multisede-aios` (así se hizo el 14-10). Después miras el deploy con el MCP de Vercel
  (`list_deployments` / `get_deployment`, `projectId: prj_buyGNoBGicuM0irg8djba9IbhokS`,
  `teamId: team_Wq8n8L3CxMmFWKOWWr83kEnq`, `target: production`) hasta **READY** y lo registras en `ESTADO.md` §1 y en el
  `CHANGELOG.md`. Un push a `main` despliega: las migraciones van ANTES. **El AIOS** es otro repo
  (`Level 2.0/aios-constelarys`, push con `git push` ahí) y su Vercel (`cada1_aios`) el MCP no lo ve: se mira en
  https://cada1aios.vercel.app.
- **Supabase lo corre el dueño, y hay que decirle exactamente qué:** qué archivo abrir (ruta completa), «copia TODO»,
  en qué proyecto (**el del producto es el que tiene la tabla `tenants`**; el del AIOS es otro), qué resultado esperar
  («Success. No rows returned») y **una consulta de comprobación** con lo que tiene que salir (p. ej. `information_schema.columns`).
  Tú no tienes acceso a la base (el MCP de Supabase no está autorizado).
- **Lo técnico lo decides tú y avisas. Al dueño solo le preguntas lo que es suyo** (plata, marcas, clientes, textos que
  firma). Cuando una pregunta de negocio se puede volver **un ajuste por marca** con default, hazlo y no preguntes (así
  salió referidos).
- **Cómo le escribes:** español, de tú, corto. Lo primero es el resultado. Sin jerga ni códigos internos sin explicar;
  tablas para números; pasos numerados para lo que tiene que hacer; las líneas para pegar, en bloque de código.
- **Todo queda escrito** («no quiero que ni una sola sugerencia y cambio pendiente se pierda»): lo que decides o encuentras
  va a `docs/PENDIENTES.md` (y al doc de la feature), con el ritual del tablero (fila → commit solo de `ESTADO.md` →
  cambios → commit por nombre con la fila fuera). **Antes de `git add` de un doc compartido, `git status`**: si otra
  sesión tiene cambios a medias en ese archivo, no lo commitees tú.
- **El dueño cuida el costo:** cuando tu contexto pase de ~400 k, propón migrar con un traspaso como este.

## 3. Lo que el dueño quiere (su norte, textual)

- *«El objetivo es, en esencia, hacer que vuelvan los clientes… me importa un carajo si se ve bonito.»*
- *«Que para los dueños sea exageradamente fácil de usar»* (el dueño de restaurante es «flojo y disperso», entra desde el
  celular).
- *«Que las bases queden fuertes para que soporten adiciones luego»*: eventos, cumpleaños del restaurante, rifas,
  activaciones, fechas especiales, Instagram.
- **Sin Wallet** de Google ni Apple: el diferencial es WhatsApp. **«Se adapta a tu clientela»** se vende, pero no se
  promete hasta que el piloto esté corriendo.
- **Sedes (14-10):** *«cada cosa en su lugar, se ven desde el mismo lado pero bien separadas»*; sucursales y franquicias
  comparten SIEMPRE los datos; **un solo número por marca** («simple es mejor»).

## 4. Dónde vamos (15-10, mañana)

### 4.1 En producción
`origin/main` = `origin/feat/multisede-aios` = **`36166c5`** (push del 14-10 noche, Vercel READY
`dpl_81mbhXWR6vGZ3TkXbYUiZnVEYLe6`, **00073 aplicada antes**): la **fase 2 del ciclo** completa (A los datos, B la pantalla
«Ciclo y campañas», C la vista por fecha + «Mandar un regalo» + el creador de eventos; `/dashboard/calendar` redirige) y
**sedes separadas partes 1** (el panel: selector «Toda la marca (N sedes)» + las sedes, «Tus sedes» con gráfico,
premios entregados por sede, número compartido dicho claro) **y 3** (diseño de un número por sede: **ARCHIVADO** por el
dueño). Todas las migraciones hasta la **00073** están aplicadas.

### 4.2 Hecho de noche, SIN pushear, pendiente de TU verificación — el dueño te pega las cuatro respuestas
`HEAD` local está 32+ commits por delante de `origin/main`. Las cuatro sesiones cerraron (tablero vacío al escribir esto):

| Sesión | Commits | Migración | Lo que el comandante anterior ya vio |
|---|---|---|---|
| **SEDE-OPERADOR** (el operador de Cada1 ve el panel de marcas con 2+ sedes) | `131788b`, `afe7698` | — | **Código verificado** (el `OR` del super admin va en `requireLocationScope()`, afuera de `decideLocationScope()`, que es espejo de la 00045; la marca sale del JWT). Su suite (99 / 1.677) no la repitió el comandante: córrela. El dueño eligió «super usuario en todo», también en Accesos |
| **Sedes, parte 2** (la tarjeta de cada sede: «una para todas» / «una por sede») | `5d63d35`, `923c3f6`, `a013414` | **00074** `tarjeta_por_sede` | Nada: verificar entera. Su cierre dice 101 / 1.712 |
| **Arreglos chicos** (15 IDs de PENDIENTES en 4 grupos) | `317cc73`, `2d77cd8`, `45b252d`, `57af6e2`, `df172b0` | — | Nada: verificar. Toca permisos (SEDE-MESEROS, N13, OPERADOR-BASE-CAIDA), envíos (PL-2, N6, N-SEDE-ENVIO en el drenador…) |
| **Referidos** (los dos ganan; fases 1–6) | `56542aa` … `972b814`, `49df9ab` | **00075** `referidos` | Nada: verificar. Su cierre dice 110 / 1.858 |
| **AIOS: la jerarquía** (v1.16.0: la marca tiene su página; su WhatsApp en un solo lugar y en orden) | AIOS `6d927d3`, `f305bf3`; producto `876cf5b` (docs) | — | Nada: verificar en el repo del AIOS (`tsc`, `lint`, `build`; no tiene tests) |

**Tu tarea al abrir:** esperar las cuatro respuestas, verificar cada una contra el código, leer la **00074** y la
**00075** línea por línea (FK compuestas, idempotencia, que no reescriban tablas grandes, que no toquen datos), correr
**tsc y la suite entera** (mira la línea «Test Files»: vitest sale con código 0 aunque se le caiga un proceso), y darle al
dueño: (1) la 00074 y después la 00075, archivo por archivo, con su consulta de comprobación; (2) cuando confirme, su
«pushea» del producto; (3) aparte, el push del AIOS. Los planes de prueba de referidos y de la tarjeta por sede, para el
dueño en su celular, salen de las respuestas de esas sesiones.

### 4.3 Decisiones del dueño del 14-10 (ya escritas en `docs/PENDIENTES.md` §8)
- **D5-a/c/e:** un solo número por marca para todas sus sedes; el número por sede quedó archivado
  (`docs/superpowers/specs/2026-10-14-numero-por-sede-design.md`). **D5-d** («franquicia» en el AIOS): abierta.
  **D5-f, el conglomerado** (varias marcas con un número, repartir los turnos de cada cliente): a diseñar cuando llegue uno.
  **Regla viva: a ninguna marca se le conecta un segundo número** (el entrante de Zernio busca la marca solo por
  `tenants.zernio_account_id`; lo que le escriban al segundo se pierde).
- **Referidos (C7):** el comandante los volvió AJUSTES por marca (los dos ganan; premio del catálogo, puntos o nada; el de
  quien invita al validar el mesero la primera visita del amigo; tope 10/mes; vence a 30 días; apagado por defecto; sin
  plantillas nuevas: el amigo recibe el enlace por el WhatsApp personal de quien invita).
- **El operador es «super usuario en todo»**, Accesos incluido.

### 4.4 Lo del dueño, abierto
1. **Tepuy** (marca `clubtepuy`, dos sedes: Envigado 23 clientes, Laureles 17, sin sede 0 —
   `SQL-PARA-CORRER/tepuy-sedes/RESULTADO-2026-10-14.md`). El 14-10 noche: el producto la tenía como **Twilio** aunque el
   AIOS ya la había conectado (faltaba el paso «4. WhatsApp» de una sede del AIOS; la v1.16.0 lo lleva a la página de la
   marca). Activada → Zernio → **16 plantillas mandadas desde el panel**; 8 aprobadas en minutos, 11 en revisión. **Falta
   de Yeni:** el **nombre visible de la LÍNEA** (seguía «Yenifer Yohana Calle Morera», Approved) y la **verificación del
   negocio**; el pago ya está. El cupo del AIOS decía 180 (el 250 por defecto): el sondeo de salud de línea (cada hora)
   tenía que subirlo a 2.000 — **compruébalo**. Envigado **no tiene aparato de mesero** (los 3 son de Laureles): el dueño
   tiene que activar uno desde `clubtepuyenvigado.constelarys.com/mesero`.
2. **Encender el ciclo en Don Alirio y Sushi Fun** (decidido el 14-10, sin pasar por la demo): elegir sus regalos en
   Recompensas › Premios para regalar, y después el botón **«Encender el ciclo»** en Campañas (solo lo ve el operador) o el
   `INSERT` de `ESTADO.md` 0.CICLO. Al día siguiente, las consultas de `SQL-PARA-CORRER/ciclo-fase-1b/LEEME.md` §2.c.
   **Ojo:** el operador entra a una marca cambiando su `app_metadata.tenant_id` por SQL y volviendo a entrar: no hay
   selector de marca (anotado).
3. Por marca, «Enviar los N juntos a Meta» en Plantillas (Tepuy ya lo hizo). Lo de siempre: logs de Planeta Wings del
   5-6/10, sign-ups del Supabase del AIOS (N2), repetir el SQL de `ciclo-fase-0/` hacia el 11-11, decisiones C4, C9, C10,
   D1–D8.

### 4.5 Lo siguiente del comandante, después de verificar y pushear lo de la noche
`docs/PENDIENTES.md` §1 y §5: lo que dejaron los arreglos (PL-2-raíz, PL-2-regalo, N13-durable, N-CATALOGO-2,
DOC-REGISTER, D10) y la auditoría del AIOS (AIOS-JERARQUIA); SEDE-CLIENTES, SEDE-RECOMPENSAS, SEDE-GANADO; plantillas
**B1/B7**; la tarjeta y la pantalla posterior (S-3/S-4, C4/C5); reseñas (C6, decidida: S-5.2, S-5.3, N19); N-DOBLE (decisión);
TEST-flaky; el aviso de referidos por WhatsApp y el «trae a un amigo» en el flujo mensual (necesitan plantilla y B1).

## 5. Datos que no hay que volver a pedir

| Marca | Clientes | Volvieron ≥ 1 vez | Días entre visitas (mediana) | Ritmo |
|---|---|---|---|---|
| Sushi Service | ~670 | 22,5 % | 27 | restaurante 14·28·42·60·80 |
| Don Alirio (café, piloto) | ~336 | 21,6 % | 6 | cafetería 7·14·26·42·58 |
| Sushi Fun | 289 | 2,4 % (real, verificado el 12-10) | 26 | restaurante |
| Planeta Wings (Zernio) | ~64 | 4,3 % | muy nueva | restaurante |
| Tepuy (Zernio, 2 sedes) | 40 (Envigado 23 · Laureles 17) | 1 va a las dos | muy nueva | restaurante |

- **demo-ventas** es la marca demo (`is_demo`): nunca envía WhatsApp real. La métrica principal es **la segunda visita**.
- La línea de Twilio de **Sushi Service** muere (pasa a Zernio: `docs/RUNBOOK-SUSHI-SERVICE-A-ZERNIO.md`).

## 6. Trampas de esta máquina y de este repo

- **Heredoc largo se rompe en Bash:** para texto largo o parches, un script de Python en el scratchpad (con Write) que
  hace `assert` de cada cadena antes de reemplazar, y córrelo con `python -I`.
- **graphify:** `graphify.exe` está bloqueado; usa `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe
  -m graphify update .` (o `query "…"`). El hook post-commit ya reconstruye el código en cada commit (también en el AIOS).
- **Sesiones en paralelo:** una fila por sesión, commiteada sola; nunca editar un archivo de la fila viva de otra;
  `ListAgents` + `SendMessage`; **una sola corrida de vitest a la vez** (Postgres del puerto 55432). Nunca `git add -A`,
  nunca cambiar de rama, ni `stash`, ni `reset --hard`.
- **vitest sale con código 0 aunque se le caiga un proceso** («Worker exited unexpectedly»: 90 de 91 archivos): mira
  siempre «Test Files» (TEST-flaky). La segunda corrida suele salir entera.
- **El aviso «el archivo cambió en disco»** después de un commit tuyo suele ser solo el fin de línea (autocrlf): revisa
  con `git show <sha> -- <archivo>` que tu commit traiga solo lo tuyo.
- **Plantillas dice «tu cuenta de WhatsApp (Twilio) no está configurada»** en una marca Zernio = en el producto la marca
  sigue en `messaging_provider` twilio: falta el paso de activar del AIOS (`aios_activate_whatsapp()`, solo escribe la
  ficha; no envía nada).
- **Logs de Vercel por MCP:** `get_runtime_logs` con `query` (p. ej. «zernio», «templates») o `group_by: requestPath`;
  las aprobaciones de plantillas de Zernio llegan como `[webhook/zernio] template X → APPROVED (slug): promoted`.
- **Vercel Hobby construye de a uno:** el deploy de producción puede tardar en aparecer si la vista previa entró primero.
- `.env.local` no tiene la URL de Supabase ni el `CRON_SECRET` de producción: el comandante no consulta la base ni corre
  `?dry=1`; el dueño corre el SQL.
