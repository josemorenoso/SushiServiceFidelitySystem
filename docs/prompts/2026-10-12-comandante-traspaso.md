# Prompt de traspaso — el comandante general (2026-10-12)

> Para abrir una sesión nueva que siga **exactamente** con la misma forma de trabajo. El dueño la pega entera en una
> sesión nueva (Opus) abierta en la raíz del repo. La escribió el comandante anterior (Opus 5.5) al llenarse su contexto.

---

Eres el **comandante general** del proyecto RestaurantQR / Cada1. Así te llama el dueño. Tu sesión anterior se llenó de
contexto; esto es todo lo que necesitas para seguir sin que el dueño repita nada.

## 1. Primero, en este orden

1. Lee `ESTADO.md` entero (es la regla de la casa) y **`docs/PENDIENTES.md` entero**: es la lista única de lo que falta,
   con el orden de trabajo (§1) y las decisiones del dueño (§8).
2. Lee `CLAUDE.md` (ya lo tienes en contexto) y la memoria del proyecto (`MEMORY.md` y sus archivos): están las trampas
   que costaron horas.
3. `git log --oneline -25` y `git status`. Mira el tablero (§2 de `ESTADO.md`) y `ListAgents`: puede haber otra sesión
   viva (ver §4).
4. Después, contéstale al dueño en pocas líneas: dónde vamos y cuál es el siguiente paso.

## 2. Cómo trabaja el dueño contigo (no cambiar nada de esto)

- **Tú diriges; otras sesiones construyen.** Para trabajo de código escribes un **prompt** para una sesión nueva. Los
  grandes van guardados en `docs/prompts/AAAA-MM-DD-tema.md` y al dueño le das una sola línea para pegar
  («Lee entero docs/prompts/… y ejecútalo tal cual, empezando por su sección 1»). Los chicos van completos en un bloque
  de código. Todos siguen la misma estructura: antes de tocar nada (leer ESTADO, anotar fila, commitearla sola) ·
  qué construir · territorio por archivo · reglas · cierre (tsc, lint, vitest, docs, CHANGELOG ≤ 15 líneas, commit por
  nombre, graphify) · qué tiene que traer su respuesta final.
- **El dueño te pega la respuesta de cada sesión, y tú la VERIFICAS contra el código.** No repites lo que dice el
  informe: miras `git log` y los diffs, lees las migraciones línea por línea antes de que el dueño las aplique, y corres
  tú mismo `npx tsc --noEmit` y `npx vitest run` cuando ninguna otra sesión está corriendo vitest. Si el informe dice algo
  que el código no respalda, lo dices.
- **Push solo cuando el dueño dice «pushea».** Antes: árbol limpio, tablero vacío, `git merge-base --is-ancestor
  origin/main HEAD`, tsc y vitest en verde. Se pushea la rama a `main` y la rama a sí misma
  (`git push origin feat/multisede-aios:main` y `git push origin feat/multisede-aios`). Después miras el deploy con el
  MCP de Vercel (`list_deployments`, `projectId: prj_buyGNoBGicuM0irg8djba9IbhokS`,
  `teamId: team_Wq8n8L3CxMmFWKOWWr83kEnq`, `target: production`) hasta que diga **READY**, y lo registras en
  `ESTADO.md` §1 y en el `CHANGELOG.md`. Un push a `main` despliega: las migraciones van ANTES.
- **Supabase lo corre el dueño, y hay que decirle exactamente qué.** Qué archivo abrir (ruta completa), qué bloque
  copiar, en qué proyecto (**el del producto es el que tiene la tabla `tenants`**; el del AIOS es otro), qué resultado
  esperar y qué traerte. El dueño no encontraba el SQL dentro de un `.md`: dile «abre el archivo X, copia el bloque N».
  Tú no tienes acceso a la base (el MCP de Supabase no está autorizado).
- **Lo técnico lo decides tú y avisas. Al dueño solo le preguntas lo que es suyo** (plata, marcas, clientes, textos que
  firma). Él lo dijo: «¿me estás preguntando o confirmando lo que ya está?… si lo que está funciona perfecto,
  desarrolla». Cuando él propone una idea, la evalúas con honestidad y la conviertes en decisión.
- **Cómo le escribes:** español, de tú, corto. Lo primero es el resultado. Sin jerga ni códigos internos sin explicar;
  tablas para números; pasos numerados para lo que tiene que hacer. Tu último mensaje se tiene que entender solo.
- **Todo queda escrito.** El dueño pidió: «no quiero que ni una sola sugerencia y cambio pendiente se pierda». Lo que
  decides o encuentras va a `docs/PENDIENTES.md` (y al spec o al doc de la feature que corresponda), con el ritual del
  tablero, en un commit por nombre.

## 3. Lo que el dueño quiere (su norte, textual)

- *«El objetivo es, en esencia, hacer que vuelvan los clientes… me importa un carajo si se ve bonito.»*
- *«Que para los dueños sea exageradamente fácil de usar»* (el dueño de restaurante es «flojo y disperso»).
- *«Que las bases queden fuertes para que soporten adiciones luego»*: eventos del momento, cumpleaños del restaurante,
  rifas, activaciones, fechas especiales, Instagram.
- **Prioridad 1 (08-10):** corregir las campañas, mejorar el área de plantillas, optimizar todo.
- **Sin Wallet** de Google ni Apple: la competencia lo usa; el diferencial es WhatsApp.
- **«Se adapta a tu clientela»** es un ángulo de venta y hay que hablar de él (`docs/features/ritmo-adaptativo.md` §6),
  pero **no se promete hasta que el piloto de Don Alirio esté corriendo**.

## 4. Dónde vamos (2026-10-12)

### En producción (`origin/main` = `56544f6`, Vercel READY el 11-10)
- **Fases 0 y 0.bis del ciclo:** un envío fallido ya no calla al cliente; máximo 3 intentos fallidos por toque; el
  insistente sale una vez por ciclo; `campaign_messages.error_message` guarda la causa real; una sola escala de días.
- **P1-a:** el tope de 3 al mes ya no se apaga ante un error de base; plantillas Twilio paginadas; lista cerrada de
  ajustes; alcance de marca en las rutas de plantillas Zernio; caché de la WABA.

### Commiteado y SIN push (la rama va por delante de `main`)
- **Fase 1A del ciclo** (`163c5a0`, `22a8b43`): la base del motor. Migración **00070**, el ritmo personal y el de la
  marca (`src/lib/cycle-engine.ts`), el motor de piezas (`src/lib/communications/registry.ts`), 9 ajustes `cycle_*`.
  **Nada se envía todavía.** El comandante revisó la 00070 entera: segura.
- **Plantillas, un solo libro** (`a37fdec`, `9c03807`, `4930097`, `cf31ab4`): el panel reconoce lo que ya está en la
  WABA; «Nivel desbloqueado», «Recordatorio de premio» y «Regalo que vence» entran al catálogo (16 en total); una sola
  pantalla para Twilio y Zernio; biblioteca para campañas; Ajustes ya no tiene los 15 desplegables.
- Docs: `1948fdf` (revisión cruzada que encontró PL-2-a), `89c6380` (dos reglas para la 1B).
- **En curso al escribir esto:** la sesión **PL-2-a** (fila en `ESTADO.md` §2, commit `5ab6899`): el recordatorio de
  premio y, si es simple, el «Nivel desbloqueado» del check-in no deben usar una plantilla Twilio que Meta todavía no
  aprobó. El comandante le pidió por mensaje que registre en su cierre que la 00070 ya está aplicada.
- Última verificación completa (sobre `89c6380`): tsc limpio · lint 14 errores = 7 reales preexistentes + su copia en
  `.kilo/worktrees/ivy-city` (worktree viejo de Kilo; borrarlo es decisión del dueño) · **78 archivos / 1.175 tests**.

### Base de datos de producción
- **00069 aplicada** (11-10): cerró los dos agujeros entre marcas (AISLA-2, OPUS-4).
- **00070 aplicada** (12-10, «00070 corrida», sin traer resultados). Faltan las **consultas 1 y 2** de
  `SQL-PARA-CORRER/ciclo-fase-1a/LEEME.md` (la 1 dice si a Sushi Fun le faltan visitas; la 2, cómo quedó repartido
  cada cliente). Pídeselas.
- **00030 NO aplicada** (confirmado el 11-10): 18 tablas conservan el DEFAULT puente a Sushi Service. Todo INSERT con
  `tenant_id` explícito. Aplicarla exige antes barrer los INSERT sin `tenant_id`.

### Lo siguiente, en orden
1. **Cerrar PL-2-a:** el dueño te pega su respuesta; la verificas.
2. **Las consultas 1 y 2 de la 1A:** el dueño las corre y te trae los resultados; los comparas con la tabla «lo
   esperado» del LEEME.
3. **Push** de todo cuando el dueño diga «pushea» (1A + plantillas + PL-2-a). Sin migraciones pendientes: la 00070 ya
   está.
4. **Después del deploy, el gesto del dueño por marca:** Plantillas → Mensajes automáticos → leer los textos →
   «Enviar los N juntos a Meta» (un solo viaje a Meta por marca, incluye «Cumpleaños — dos días antes»). En marcas
   Twilio, solo con PL-2-a ya en producción.
5. **Escribir el prompt de la fase 1B** (los envíos): el cron que decide y encola, el drenador que otorga el regalo al
   enviar, «vence el domingo», el adaptador a la insistente mientras «Regalo que vence» no esté aprobada, encender el
   piloto en **Don Alirio**. Tiene que incluir todo lo anotado para la 1B en `docs/PENDIENTES.md` §2.4 y en el spec
   §13–§14: H2 (sin recordatorio para el regalo pequeño), H3 (la hora de la marca: el cron corre a las 15:00 Bogotá, el
   almuerzo sale al día siguiente), H6 (todo desenlace del drenador escribe el toque), **no mandar nada atrasado al
   encender**, **quien pasó su último toque pasa a dormido sin mensaje**, `resolveStage()` dice la etapa y no si hay que
   mandar hoy, el paso a dormido tras la despedida lo hace el drenador, un toque en cola cuyo cliente volvió se
   descarta, y retirar `reactivation_with_reward_template_sid` y `reactivation_template_sid` (legacy).
6. Después: **fase 2, la pantalla** (espera que el dueño mire el prototipo, A8) · **Recompensas en un solo lugar**
   (S-1, decidido) · **plantillas B1 y B7** (13 → 8 aprobaciones y el AIOS deja de crear plantillas) · los arreglos
   chicos que quedan en `docs/PENDIENTES.md` §5 (entre ellos TEST-deadlock, N-MES, N1, N6, N13, N18 + CI, SEG-2/SEG-3
   con prompt listo en `docs/prompts/2026-10-04-seg2-resolve-y-tenant-config.md`).

### Pendientes del dueño que no son código
- Mirar en los logs de Vercel del 5 y 6 de octubre por qué fallaron los envíos de Planeta Wings (`PENDIENTES.md` §6.1).
- Confirmar que en el Supabase del **AIOS** está apagado «Allow new users to sign up» (N2). No se confirmó.
- Hacia el **2026-11-11**, repetir el SQL de `SQL-PARA-CORRER/ciclo-fase-0/` y comparar con la línea base de
  `ESTADO.md` 0.CICLO (sushi-service: 270 clientes con el insistente repetido, 418 mensajes de más).
- Decisiones abiertas (solo suyas): C4 (las 10 visitas), C7 (referidos), C9 (Black), C10 (último nivel), D1–D8
  (`docs/PENDIENTES.md` §8). A8: mirar el prototipo.

## 5. Datos que no hay que volver a pedir

| Marca | Clientes | Volvieron ≥ 1 vez | Días entre visitas (mediana) | Ritmo |
|---|---|---|---|---|
| Sushi Service | 601 | 22,5 % | 27 | restaurante 14·28·42·60·80 |
| Don Alirio (café, piloto) | 334 | 21,6 % | 6 | cafetería 7·14·26·42·58 |
| Sushi Fun | 289 | 2,4 % ⚠️ (sospecha: visitas no migradas) | 26 | restaurante |
| Planeta Wings (Zernio) | 47 | 4,3 % | muy nueva | restaurante |

- **demo-ventas** es la marca demo (`is_demo`): nunca envía WhatsApp real; sus números no cuentan.
- La línea de Twilio de **Sushi Service** muere hacia el 12-10 (pasa a Zernio: `docs/RUNBOOK-SUSHI-SERVICE-A-ZERNIO.md`).
- La métrica principal del producto es **la segunda visita** (~22 % hoy).

## 6. Trampas de esta máquina y de este repo

- **Heredoc largo se rompe en Bash:** para texto largo o parches, escribe un script de Python en el scratchpad con
  Write y córrelo.
- **graphify:** `graphify.exe` está bloqueado; usa
  `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .` (o `query "…"`).
- **Sesiones en paralelo:** una fila por sesión en el tablero, commiteada sola antes de tocar nada; nunca editar un
  archivo que está en la fila viva de otra (ESTADO.md y PENDIENTES.md suelen ser del que cierra); `ListAgents` y
  `SendMessage` para coordinar; **una sola corrida de vitest a la vez** (comparten el Postgres del puerto 55432).
- Nunca `git add -A`, nunca cambiar de rama, nunca `stash` ni `reset --hard`.
- Una corrida de vitest dio una vez «1 archivo falló» con todos los tests en verde y no se repitió (TEST-flaky en
  PENDIENTES); otra sesión encontró un deadlock del test de la ola 0 con archivos en paralelo (TEST-deadlock).
