# MÉTODO MAESTRO LUISRAI

> **Versión:** 3.0 · **Fecha:** 2026-09-04 · **Sucede a:** Método AInnovate v2.1
> **Para:** cualquier proyecto que se construya con una IA de código (Claude Code primero; sirve para Cursor, Codex, Windsurf, Gemini CLI).
> **Cómo se usa:** este archivo se copia **tal cual** a la raíz de cada proyecto, nuevo o viejo. No se adapta: lo que es
> específico del proyecto va en `CLAUDE.md` y en `ESTADO.md`, nunca acá. Todo lo que hace falta para arrancar está adentro:
> el prompt de arranque (sección 10), la configuración de la máquina (Apéndice G) y las plantillas de todos los archivos (Apéndices A-F).

---

## En una pantalla

1. **La IA decide el cómo.** Vos definís la **TAREA**, los **GUARDRAILS** y el **CRITERIO DE TÉRMINO**. Después la dejás cocinar.
2. **La memoria vive en dos capas.** Los **docs** son la verdad escrita (qué se decidió y por qué). El **grafo de Graphify** son las relaciones (qué toca a qué). La IA consulta; no relee el repo.
3. **Un solo panel de control: `ESTADO.md`.** Qué se está haciendo, qué sigue, qué se hizo, qué está bloqueado. Toda sesión lo lee primero y lo deja al día al cerrar.
4. **Un solo archivo de reglas: `CLAUDE.md`.** Corto. Solo guardrails del dominio y trampas verificadas. Nada de "cómo programar".
5. **Skills: solo las que pasan las 3R.** Cada seis meses, o con cada modelo nuevo, ablación: se sacan todas y se devuelven una por una las que hacen falta.
6. **Modelo caro para pensar, barato para barrer.** Fable/Opus diseña y revisa. Sonnet implementa. Haiku audita, inventaría y construye el grafo.

Todo lo demás en este documento es el detalle de esas seis líneas.

**Para arrancar un proyecto nuevo:** copiar este archivo a la raíz y pegarle a la IA el prompt de la sección 10.
**Para migrar uno viejo:** lo mismo, con el segundo prompt de la sección 10.
**Para preparar una máquina:** Apéndice G, una sola vez.

---

## 0. De dónde viene y qué se borró

El Método AInnovate v2.1 tenía 1.645 líneas: 12 mandamientos, 4 leyes, un protocolo de 8 lecturas obligatorias antes de cada cambio, plantillas para 11 documentos y reglas duplicadas en 6 archivos de IDE. Funcionó porque los modelos de principios de 2026 se perdían sin receta. Los de hoy no se pierden: cuando se les da la receta paso a paso, se los **traba** (*hobbling*: el caballo con las patas atadas). Anthropic borró el 80 % del system prompt de Claude Code por la misma razón (Boris Cherny, creador de Claude Code, entrevista en Y Combinator, 2026), y él mismo recomienda borrar el `CLAUDE.md`, las skills y los hooks cada seis meses para ver qué hace el modelo solo.

Lo que se hizo acá fue **ablación**: se sacó todo y se devolvió solo lo que demostró valor en 44 versiones de AIOS y 12 de Cada1.

| Se fue | Por qué |
|---|---|
| Los 12 mandamientos sobre cómo programar (tipar, separar lógica de estilos, try/catch, nombrar archivos) | El modelo ya lo sabe. Repetírselo es ruido que ocupa contexto y lo sesga |
| El protocolo de leer 8 documentos antes de cualquier cambio | Costaba 40-60 k tokens por sesión antes de escribir una letra. Lo reemplazan `ESTADO.md` + el grafo |
| Las 6 copias de reglas por IDE (`.cursorrules`, `.windsurfrules`, `.clinerules`, `.aider.conf.yml`, `copilot-instructions.md`) | Eran idénticas y ya estaban desincronizadas. Queda `CLAUDE.md` y un `AGENTS.md` que apunta a él |
| `docs/SKILLS.md` como registro obligatorio | Las skills se auditan con las 3R (sección 8), no se catalogan |
| `docs/PENDIENTES.md` de 1.800 líneas | Arrastraba ítems resueltos. Lo reemplaza `ESTADO.md`, que por diseño cabe en una pantalla |
| El formato de CHANGELOG de 100 líneas por versión | Una entrada cabe en 15 líneas. La historia larga vive en el commit y en el doc de la feature |
| La FASE 4 de "prácticas para apps estables" (error handling, a11y, performance, UX de estados) | Son criterios de término, no instrucciones. Se piden en el prompt cuando aplican |

| Se quedó | Por qué |
|---|---|
| Los docs como memoria del proyecto (`02-architecture.md` con ADRs, `DB_SCHEMA.md`, `API_DOCS.md`, `03-security.md`, `05-design-system.md`, `docs/features/*.md`) | Es lo único que impide que cada sesión redescubra el proyecto. Cambia el **protocolo**: se leen cuando hacen falta, no siempre |
| El `CHANGELOG.md` | Una entrada por versión sigue siendo la trazabilidad más barata que existe |
| Las reglas del dominio (`CLAUDE.md`: "nunca escribas `status_code` sin `apply_lead_transition()`") | Son **guardrails**: el modelo no puede adivinarlas y romperlas cuesta datos reales |
| Las trampas de librerías verificadas | Son datos, no procedimientos. El modelo cree que `date-fns-tz` existe y no es así |
| La revisión final con dos lentes adversariales sobre el diff completo | En AIOS encontró dos bugs de diseño que nueve revisiones por tarea no vieron |
| La verificación antes de decir "listo" | Sin criterio de término el modelo entrega algo que *parece* terminado |

---

## 1. Cómo se pide el trabajo

Todo pedido, del más chico al más grande, tiene tres partes. Ni una más.

```
## TAREA
[Qué querés conseguir. Una o dos líneas. Sin adjetivos, sin "por favor sé cuidadoso".
 Puede ser difícil: "reescribí la app de Electron en Swift" es una tarea válida.]

## GUARDRAILS
[Dónde NO meterse. Límites, no pasos.
 "No toques el schema" es un guardrail. "Primero abrí X y después Y" es un paso.]

## CRITERIO DE TÉRMINO
[Cómo sabemos, sin opinar, que está listo.
 "Compila, los 1.300 tests pasan y el flujo de check-in funciona en el navegador"
 es un criterio. "Que quede bien" no lo es.]
```

Un cuarto bloque, **CONTEXTO**, va solo cuando hay algo que la IA no puede encontrar sola (una decisión tomada por teléfono, un dato de negocio, una restricción del cliente). Si está en los docs o en el grafo, no se repite.

**La diferencia entre un guardrail y un paso** es la mitad del método. El paso le quita al modelo la capacidad de razonar y lo obliga a tu camino, que hoy casi nunca es el mejor. El guardrail le deja todas las opciones menos las que duelen.

**El criterio de término** es la pieza que casi nadie escribe. Sin él, el modelo hace un intento razonable, entrega algo que parece terminado y se va. Con él, sabe cuánto seguir. Un prompt de cuatro líneas con criterio de término puede correr dos semanas.

**Después, dejalo cocinar.** No se lo interrumpe para dirigirlo salvo que se salga de un guardrail.

### Un ejemplo real

```
## TAREA
Que el bot cree el lead cuando el fundador reporta a alguien que no existe en la base.

## GUARDRAILS
No escribas leads.status_code directo: pasá por apply_lead_transition().
No toques el flujo de los leads que sí existen.
Confianza de la IA < 0.75 → repreguntar, no crear.

## CRITERIO DE TÉRMINO
Un mensaje real por Telegram con un nombre nuevo crea el lead en su estado inicial,
los tests pasan, y CHANGELOG + docs/features/bot-telegram.md cuentan el cambio.
```

Cuatro líneas de tarea, tres de límites, dos de término. Ninguna instrucción sobre cómo programarlo.

### Lo que NO va en un prompt

- Listas numeradas de pasos ("1. leé, 2. abrí, 3. editá").
- Cómo usar una librería, salvo que sea una trampa verificada (eso va en `CLAUDE.md`, una vez).
- "Ten cuidado", "sé exhaustivo", "no rompas nada". Si importa, es un guardrail concreto.
- Pedir que lea "todo el repo" o "todos los docs". Se nombra lo que hay que leer o se deja que consulte el grafo.

---

## 2. La memoria: docs + grafo

### 2.1 Los docs (la verdad escrita)

Un proyecto tiene estos archivos y no más. Cada uno tiene un momento de lectura; ninguno se lee "siempre" salvo el primero. Las plantillas están en los Apéndices A-F.

| Archivo | Qué guarda | La IA lo lee… |
|---|---|---|
| `ESTADO.md` | Foto actual, en vuelo, siguiente, bloqueado, hecho reciente, deudas | **Siempre, primero.** Es el único obligatorio |
| `CLAUDE.md` | Guardrails del dominio, trampas verificadas, comandos, mapa de docs | Solo: lo carga el harness |
| `AGENTS.md` | Diez líneas que apuntan a los tres anteriores | Solo: lo cargan Codex, Cursor, Windsurf |
| `CHANGELOG.md` | Una entrada por versión, ≤ 15 líneas | Cuando necesita saber cuándo y por qué cambió algo |
| `docs/02-architecture.md` | Estructura, flujo de datos, **ADRs** (decisiones con su razón) | Antes de una decisión de arquitectura o cuando el grafo muestra que va a tocar un hub |
| `docs/DB_SCHEMA.md` | Tablas, RLS, migraciones, funciones | Cuando toca la base |
| `docs/API_DOCS.md` | Endpoints con contrato | Cuando toca o consume un endpoint |
| `docs/03-security.md` | Auth, credenciales, RLS, cifrado | Cuando toca auth, secretos o permisos |
| `docs/05-design-system.md` | Paleta, tipografía, componentes, contraste | Cuando produce interfaz |
| `docs/features/<nombre>.md` | Qué hace, por qué se decidió así, qué NO hacer, cómo verificar | Cuando toca esa feature. Se crea antes de codear una feature no trivial |
| `docs/plans/` y `docs/specs/` (opcionales; o la carpeta que el proyecto ya use, p. ej. `docs/superpowers/` en AIOS) | Planes y diseños de una ola | Cuando ejecuta esa ola |
| `docs/archive/` | Lo que dejó de ser verdad, con fecha en el nombre | Nunca por defecto. Está para el historial y para el grafo |

Tres reglas sobre los docs:

- **Un doc que miente es peor que ninguno.** Cuando cambia el comportamiento, el doc cambia en el mismo commit. Lo mismo con los comentarios del código: un comentario que dejó de ser verdad después de una migración causó los defectos más caros de AIOS.
- **No hay protocolo de lectura.** La IA lee `ESTADO.md`, le pregunta al grafo, y abre el doc que el grafo o el mapa de `CLAUDE.md` le señalan. Nada más.
- **Un doc se crea el día que hace falta, no antes.** Un doc vacío con plantilla es un doc que miente. `01-project-overview.md`, `API_DOCS.md` y `05-design-system.md` nacen con su primer contenido real.

### 2.2 El grafo: Graphify

Graphify convierte el código, los docs y las migraciones en un grafo de conocimiento con comunidades. El código se analiza por AST en local, **sin LLM y sin costo**; los documentos pasan por un modelo barato una sola vez y después se actualizan solo los que cambian. El resultado se consulta con tres verbos, se ve en HTML y se exporta a Obsidian.

**Se recomienda instalarlo en todo proyecto**, nuevo o viejo, el primer día. Es el ahorro de tokens más grande después de `ESTADO.md`: una consulta al grafo devuelve el subgrafo relevante en 1-2 k tokens en vez de los 30-80 k de leer los archivos "por si acaso".

Comandos verificados el 2026-09-04 con la versión 0.9.54 (el paquete se llama `graphifyy`, con doble *y*; el comando, `graphify`):

```bash
# ── Una vez por máquina ──────────────────────────────────────────────────────
uv tool install "graphifyy[anthropic,sql]"     # o: pip install "graphifyy[anthropic,sql]"
graphify install                                # la skill /graphify en Claude Code (global)

# ── En cada proyecto ─────────────────────────────────────────────────────────
#   1. Escribir .graphifyignore (Apéndice E).
#   2. Construir el grafo. El código no usa LLM. Los docs sí, una sola vez. Dos formas de pagarlo:

#   (a) Con la suscripción de Claude Code y el modelo Haiku. Es lo que se usó en AIOS.
#       Se corre DESDE UNA CARPETA NEUTRA (no desde el repo): así cada llamada no carga el CLAUDE.md del repo.
cd ~ && GRAPHIFY_CLAUDE_CLI_MODEL=haiku graphify extract "<ruta-del-repo>" --backend claude-cli --api-timeout 1800

#   (b) Con una API key de Anthropic CON SALDO (si no tiene, falla con "credit balance is too low"):
ANTHROPIC_API_KEY=... graphify extract . --backend claude --model claude-haiku-4-5-20251001

#   Banderas útiles:
#   --code-only          → solo código, cero LLM, 30 segundos: para probar que todo está bien
#   --global --as <tag>  → además lo suma al grafo global de la máquina (varios repos en un solo grafo)
#   --force              → re-extraer todo, ignorando la caché

# ── Mantenerlo al día ────────────────────────────────────────────────────────
graphify update .                # después de cada commit: AST solo, sin LLM, segundos
graphify extract . ...           # después de una ola: re-extrae solo los docs que cambiaron
graphify hook install            # opcional: post-commit que corre el update solo

# ── Consultarlo (esto es lo que la IA usa en vez de leer medio repo) ─────────
graphify query "qué conecta el bot de Telegram con la máquina de estados"
graphify path "telegram-webhook" "apply_lead_transition"
graphify explain "content-strategy.service"
graphify affected "funnel.service"     # qué se rompe si toco esto
graphify god-nodes                     # los hubs de la arquitectura

# ── Verlo ────────────────────────────────────────────────────────────────────
graphify-out/graph.html                # interactivo, en el navegador
graphify-out/GRAPH_REPORT.md           # los hubs, las comunidades y las conexiones sorprendentes, en prosa
graphify export obsidian --graph graphify-out/graph.json --dir <carpeta-del-vault>
graphify global list · graphify global path      # el grafo global (varios proyectos)
graphify global add <repo>/graphify-out/graph.json --as <tag>
```

Cómo lo usa la IA, en tres líneas de `CLAUDE.md`:

> Antes de leer archivos para entender algo, `graphify query`. Antes de tocar un hub, `graphify affected`. Después de commitear, `graphify update .`.

Lo que **no** se instala: el hook *always-on* (`graphify claude install`) que intercepta cada lectura de archivo para empujar al grafo. Es un paso disfrazado de ayuda. Las tres líneas de arriba alcanzan.

**Costo de referencia** (AIOS, 2026-09-04): 647 archivos de código a costo cero. 100 documentos (3 MB) con Haiku por la suscripción, una sola vez: unos 4,4 M de tokens de entrada y 240 k de salida en total, en dos corridas (la API devolvió "Overloaded" en un chunk y el reintento incremental solo repitió ese). El grafo salió con 5.467 nodos, 10.601 aristas y 439 comunidades. Las actualizaciones posteriores solo re-extraen lo que cambió.

### 2.3 Obsidian: verlo con tus ojos

Graphify exporta el grafo como una carpeta de notas Markdown con `[[enlaces]]` y un `.canvas`. Se abre en Obsidian como un vault ("Open folder as vault") y la vista de grafo de Obsidian dibuja las comunidades.

Reglas:

- Las notas generadas **no se editan a mano**: la siguiente exportación las reescribe. Las notas propias van en otra carpeta del mismo vault (Graphify no toca lo que no generó).
- Se regenera después de cada ola, no después de cada commit.
- Obsidian no tiene API en la nube: es una vista, no una fuente. La fuente sigue siendo el repo.
- Con varios proyectos, se exporta el **grafo global** a un solo vault, fuera de los repos (en LuisRAI: `Downloads/LuisRAI Grafo/obsidian`).

---

## 3. El panel de control: `ESTADO.md`

Es el único archivo que toda sesión lee entera antes de hacer nada, y el que toda sesión que cierra un bloque actualiza al final. Reemplaza a las 10 listas de pendientes que se acumulan en cualquier proyecto vivo. Su límite es **150 líneas**: lo que no cabe se cierra (va al CHANGELOG) o se archiva. La plantilla completa está en el Apéndice A.

Tres reglas:

- **Lo obsoleto se saca, no se tacha.** Un ítem tachado sigue costando tokens cada vez que alguien lee el archivo.
- **La cola la ordena el dueño.** La IA propone; el orden de la sección "Siguiente" es una decisión de negocio.
- **"Verificado" significa que alguien lo vio funcionar.** Si solo pasaron los tests, dice "tests en verde, no visto en el navegador".

---

## 4. Guardrails universales

Los únicos límites que valen para todo proyecto. Todo lo demás son criterios de término o reglas del dominio en `CLAUDE.md`.

1. **Solo lo pedido.** Ante una ambigüedad que cambia el resultado, preguntar. Ante una duda menor, decidir, hacerlo y decir qué se decidió.
2. **Nada destructivo sin confirmación.** Push, deploy, migraciones sobre producción, borrar datos o ramas, `--force`. Un commit local es reversible y no necesita permiso.
3. **Los secretos viven en `.env`.** Nunca en el código, nunca en los docs, nunca en un log. El repo lleva un `.env.example` con los nombres y sin los valores.
4. **No romper lo que funciona.** Si el pedido choca con la arquitectura documentada, parar, explicar el choque y esperar.
5. **La base tiene dueño.** En un sistema multiusuario, toda tabla nueva lleva `owner_id` (o `tenant_id`) y RLS activo. Las migraciones aplicadas no se editan: se escribe una nueva.
6. **Un comentario o un doc que dejó de ser verdad se corrige en el mismo commit** que lo dejó mentiroso.
7. **Ningún servicio externo se llama sin que el dueño sepa** (publicar, enviar, cobrar, borrar en un tercero). Verificar en vivo es válido; publicar dos veces no.

Lo que **no** está en la lista, a propósito: tipar, separar capas, manejar errores, no usar `any`, accesibilidad básica. El modelo lo hace solo. Si en un proyecto concreto no lo hace, se agrega una línea al `CLAUDE.md` de ese proyecto, no al método.

---

## 5. Criterio de término universal

Un trabajo está terminado cuando se cumplen las cinco cosas. Si falta una, no está terminado, y se dice cuál falta.

1. **Compila y pasa lo que había:** `typecheck`, `lint`, tests. Los tests nuevos fallan si se muta lo que dicen proteger.
2. **Se verificó en el flujo real** (navegador, bot, endpoint con datos de verdad) **o se declara explícitamente "NO verificado: X"**. Nunca se implica que se probó lo que no se probó.
3. **`ESTADO.md` está al día:** la foto, lo en vuelo y la cola reflejan lo que acaba de pasar.
4. **`CHANGELOG.md` tiene su entrada** (Apéndice C, ≤ 15 líneas) y el doc de la feature cuenta el comportamiento nuevo si cambió.
5. **El resumen final cabe en diez líneas:** qué se hizo, cómo se verifica, qué quedó afuera y por qué. Sin listas de archivos que el diff ya muestra.

---

## 6. El tamaño del trabajo decide el ritual

| Tamaño | Cuándo | Qué se hace antes | Qué se hace después |
|---|---|---|---|
| **Micro** (fix, ajuste, < 1 hora) | Un bug, un texto, un color | TAREA · GUARDRAILS · TÉRMINO en cuatro líneas | CHANGELOG (patch) + ESTADO si cambió la foto |
| **Feature** (una sesión) | Algo nuevo que un usuario nota | Un doc breve en `docs/features/` (Apéndice F: qué, para quién, qué NO hacer, cómo verificar). Se escribe antes para pensar, no para cumplir | El doc se completa con lo que se decidió; CHANGELOG (minor); ESTADO |
| **Ola** (varias features, varias sesiones) | Un área entera, una reorganización | Un plan en `docs/plans/` con las piezas y su orden; un mockup navegable si hay interfaz (el dueño aprueba con los ojos, no con texto) | **Revisión final con dos lentes** sobre el diff completo: un revisor busca bugs de lógica, otro busca lo que contradice los docs. Lo que ninguna revisión por pieza vio, esta lo ve |
| **Proyecto nuevo** | Día uno | FASE 0 (sección 10) | — |

**Trabajo en paralelo.** Dos sesiones sobre el mismo repo solo con territorios disjuntos, cada una en su worktree (`git worktree add ../wt-<nombre> -b feat/<nombre>`) y declaradas en `ESTADO.md` § En vuelo. Nunca dos sesiones sobre el mismo archivo.

**Cuándo escalar a más de un agente.** Si la tarea se parte en pedazos independientes (auditar 35 docs, migrar 40 archivos, revisar un diff desde tres ángulos), se usa un *workflow* multi-agente con modelos baratos. Si la tarea se repite en el tiempo (revisar el deploy cada mañana, borrar código muerto cada semana), se usa un *loop* local o una *routine* en la nube. Si es una sola tarea difícil, se le da a un solo agente con un buen criterio de término y se lo deja correr.

---

## 7. Modelos y tokens

| Modelo | Para qué | Para qué no |
|---|---|---|
| **Fable / Opus** | Diseñar una arquitectura, decidir entre caminos, un merge delicado, la revisión final de una ola, escribir el método | Inventarios, barridos, tareas mecánicas |
| **Sonnet** | Implementar features y fixes. El modelo por defecto del día a día | Decisiones que cuestan caro revertir |
| **Haiku** | Auditorías masivas por archivo, inventarios, clasificar, construir el grafo, resumir documentos | Escribir código que se va a mergear sin revisión |

Reglas que ahorran más que cualquier modelo:

- **Sesiones cortas y cerradas.** Cada mensaje re-factura todo el historial: preguntar en una sesión de 18 horas cuesta más que abrir una nueva que lea `ESTADO.md`.
- **Alcance cerrado en cada prompt.** Nombrar la feature, nombrar el doc a actualizar, definir "terminado". Nunca "revisá todo el repo".
- **El grafo antes que el grep.** Una consulta a Graphify cuesta 1-2 k tokens; leer "los archivos relevantes" cuesta 30-80 k.
- **Subagentes baratos para lo repetitivo.** Un agente Sonnet o Haiku por archivo a auditar, con un esquema de salida fijo, y un refutador al final.
- **Los workflows multi-agente son para auditorías, no para el día a día.**

---

## 8. Skills: la regla de las 3R y la ablación

Una skill no es conocimiento: es la **estandarización de un proceso**. Una receta. Sirve cuando querés **el mismo resultado** todas las veces (facturas, propuestas, el formato de una marca). Estorba cuando querés **el mejor resultado**, porque le dice al modelo "no pienses, hacelo así", y la manera del modelo de hoy suele ser mejor que la receta que escribiste para el de hace seis meses.

### El filtro de las 3R

Una skill se queda si cumple **al menos una**:

| R | Pregunta | Ejemplo que pasa | Ejemplo que no pasa |
|---|---|---|---|
| **Repetible** | ¿Hacés esta tarea **igual** (no parecida) más de tres veces al mes? | El look de las pantallas: siempre la misma estética, sin el aspecto genérico de IA | "Cómo depurar un bug" |
| **Requisito** | ¿Tiene adentro un dato que el modelo **no puede adivinar**? | Las trampas de Next 16 y del AI SDK v7; el tono de voz de la marca con ejemplos reales | Un tutorial de TDD |
| **Repartible** | ¿Se la vas a pasar a alguien más (equipo, cliente) para que lo corra igual que vos? | El procedimiento de deploy de un cliente | Tus notas personales de cómo pensar |

Si no pasa ninguna, se **archiva** (se mueve a una carpeta fuera del alcance del harness: `~/.claude/skills-archivadas/<fecha>/`). No se borra: si en dos semanas la extrañás, pasó la prueba y vuelve.

### La ablación semestral

Cada seis meses, o con cada modelo nuevo:

1. Mover a un lado `CLAUDE.md`, las skills y los hooks.
2. Trabajar una semana con el modelo pelado.
3. Devolver **una por una, línea por línea**, solo las cosas que se extrañaron. Medir qué aporta cada una, como un experimento.

Lo que no volvió era ruido. Lo que volvió es el método.

### Cuando el modelo se traba

En este orden, y solo si el anterior no alcanza:

1. **Un mejor prompt** (tarea + guardrails + término más claros).
2. **Una skill puntual** para esa situación que se repite.
3. **Un MCP** si lo que le falta es contexto que no puede alcanzar (una base, un servicio, una herramienta).

### Cómo nace una skill nueva

Después de hacer la tarea **a mano tres veces** y notar que la querés igual. Se escribe con lo aprendido, no con lo imaginado. Las skills que se bajan de internet "por si acaso" están hechas para el proceso de otra persona: casi todas mueren.

### El prompt de auditoría de skills

```
## TAREA
Auditá todas las skills, plugins y hooks activos en este entorno con la regla de las 3R del Método Maestro LuisRAI (sección 8).

## GUARDRAILS
No borres nada: lo que no pasa se mueve a ~/.claude/skills-archivadas/<fecha>/ (skills) o se apaga en enabledPlugins (plugins).
Una skill que es solo contexto (tono, marca, rutas, trampas verificadas) pasa por Requisito aunque no tenga pasos.

## CRITERIO DE TÉRMINO
Una tabla con cada skill, su veredicto, la R que pasa y la razón en una línea; lo archivado movido; y cómo volver atrás en una línea.
```

### Ejemplo: la auditoría del 2026-09-04 en la máquina de LuisRAI

No es parte del kit: es el ejemplo de cómo queda una auditoría con las 3R, y el registro de esa máquina ese día (lo archivado vive en `~/.claude/skills-archivadas/2026-09-04/` y vuelve con un `mv`). Cada máquina tiene el suyo.

| Skill / plugin | Veredicto | R que pasa | Razón |
|---|---|---|---|
| `graphify` | **Se queda** | Requisito | Es la puerta al grafo: `query`, `path`, `explain` |
| `frontend-design` (plugin) | **Se queda** | Repetible | Define la estética que el dueño aprobó; sin ella cada pantalla sale con el look genérico de IA |
| `vercel-plugin` (Next.js, AI SDK, shadcn, env, funciones) | **Se queda, en observación** | Requisito | Lee la documentación real de librerías que el modelo recuerda mal (`proxy.ts`, `Output.object()`, Base UI en vez de Radix). Sus hooks son ruidosos (inyectan texto al arrancar y exigen skills al escribir un README): primer candidato de la próxima ablación |
| `superpowers` (brainstorming, planes, TDD, debugging, verificación…) | **Apagado** (`enabledPlugins` en `~/.claude/settings.json`) | Ninguna | Son recetas de cómo pensar: exactamente lo que traba al modelo. Lo que sí valía (spec antes de una feature, dos lentes al final, verificar antes de decir listo) quedó como guardrail y criterio de término en este método, en tres líneas |
| `n8n-*` (7 skills) | **Archivadas** | Ninguna | AIOS no usa n8n (ADR-009: el scheduler es Supabase Cron) y Cada1 lo está apagando. El MCP de n8n tampoco conecta |
| `find-skills` | **Archivada** | Ninguna | Es la skill para cazar skills. Contradice la sección entera |

Para volver a encender `superpowers`: en `~/.claude/settings.json`, `"superpowers@claude-plugins-official": true`.

---

## 9. Plantillas de prompt

Copiar, llenar los corchetes, borrar lo que no aplica.

**Arrancar una sesión**
```
Leé ESTADO.md. Después:
## TAREA  [ … ]
## GUARDRAILS  [ … ]
## CRITERIO DE TÉRMINO  [ … ]  + ESTADO.md y CHANGELOG al día.
```

**Una feature**
```
## TAREA  [qué hace y para quién, dos líneas]
## GUARDRAILS  [qué no tocar; qué decisión ya está tomada y no se reabre]
## CRITERIO DE TÉRMINO  [el flujo X funciona con datos reales; tests; docs/features/<x>.md cuenta el cambio; ESTADO y CHANGELOG]
Antes de codear, escribí docs/features/<x>.md en ≤ 30 líneas y mostrámelo.
```

**Un bug**
```
## TAREA  [qué pasa vs. qué debería pasar, con el dato concreto]
## GUARDRAILS  [no cambies el comportamiento de …; si la causa está en el schema, avisá antes]
## CRITERIO DE TÉRMINO  [un test que reproduce el bug y falla antes del fix; pasa después; CHANGELOG patch]
```

**Una auditoría (con modelos baratos)**
```
## TAREA  Auditá [qué] contra [qué].
## GUARDRAILS  Usá subagentes Sonnet o Haiku, uno por [archivo/módulo], con salida estructurada. No corrijas nada.
## CRITERIO DE TÉRMINO  Una lista de hallazgos con evidencia (ruta + línea), un refutador que intentó tumbar cada uno, y el veredicto.
```

**Una ola (varias features)**
```
## TAREA  [el área o el resultado completo, en tres líneas]
## GUARDRAILS  [una pieza por sesión; nada se mergea sin su doc; el mockup se aprueba antes de codear la interfaz]
## CRITERIO DE TÉRMINO  Plan en docs/plans/<fecha>-<ola>.md con las piezas en orden y su tamaño; después de la última pieza,
                        revisión final con dos lentes sobre el diff completo y sus hallazgos cerrados.
```

**Cerrar una sesión**
```
Actualizá ESTADO.md (foto, en vuelo, cola, bloqueado, hecho reciente), la entrada del CHANGELOG
(≤ 15 líneas) y corré `graphify update .`. Resumen final en diez líneas: qué, cómo se verifica, qué falta.
```

---

## 10. FASE 0: un proyecto nuevo, y migrar uno viejo

### Proyecto nuevo: el prompt de arranque

Copiar este archivo a la raíz del proyecto y pegarle esto a la IA, con los corchetes llenos:

```
Leé METODO_MAESTRO_LUISRAI.md completo y ejecutá la FASE 0.

## TAREA
Montar la base de este proyecto con el Método Maestro LuisRAI: los archivos del kit (Apéndices A-F),
el código base del stack y el grafo.
Proyecto: [qué es y para quién, dos oraciones].
Stack: [lo que ya tengo o quiero: p. ej. Next.js + Supabase + Vercel; o Python + FastAPI; o lo que sea].

## GUARDRAILS
Solo los archivos del kit; ningún doc vacío "por si acaso" (01-project-overview, API_DOCS y 05-design-system nacen cuando haya contenido).
Ningún secreto en el repo: .env.example con los nombres, sin valores.
Ninguna dependencia que el stack no pida. Nada de push ni deploy.

## CRITERIO DE TÉRMINO
El proyecto arranca en local. ESTADO.md tiene la foto real (no la plantilla). CLAUDE.md tiene ≤ 100 líneas con lo que
ya se sabe del dominio. CHANGELOG.md tiene la entrada 0.1.0. .graphifyignore escrito y `graphify extract . --code-only`
corrido sin errores. Resumen en diez líneas.
```

Lo que la IA deja creado:

```
proyecto/
├── METODO_MAESTRO_LUISRAI.md   ← este archivo, tal cual
├── CLAUDE.md                   ← Apéndice B (≤ 100 líneas)
├── AGENTS.md                   ← Apéndice D
├── ESTADO.md                   ← Apéndice A, con la foto real
├── CHANGELOG.md                ← Apéndice C, con la 0.1.0
├── .graphifyignore             ← Apéndice E
├── .env.example
├── docs/
│   ├── 02-architecture.md      ← Apéndice F, con el primer ADR
│   ├── DB_SCHEMA.md            ← Apéndice F, si hay base
│   ├── 03-security.md          ← Apéndice F, si hay auth o secretos
│   ├── features/               ← vacía; se llena una feature a la vez
│   └── archive/                ← vacía
└── graphify-out/               ← lo genera graphify
```

Después, con la máquina configurada (Apéndice G): construir el grafo completo (sección 2.2) y sumarlo al global.

### Migrar un proyecto AInnovate (o cualquier proyecto viejo): el prompt

```
Leé METODO_MAESTRO_LUISRAI.md completo y migrá este proyecto al método.

## TAREA
Dejar este proyecto con la estructura del Método Maestro LuisRAI sin perder ningún conocimiento que hoy vive en sus docs.

## GUARDRAILS
Nada se borra: lo que deja de ser vigente va a docs/archive/ con la fecha en el nombre (PENDIENTES, SKILLS, el método viejo, el CLAUDE.md viejo).
Las reglas del dominio y las trampas verificadas del CLAUDE.md viejo pasan al nuevo, comprimidas, sin perder ninguna.
Las copias de reglas por IDE (.cursorrules, .windsurfrules, .clinerules, .aider.conf.yml, copilot-instructions.md) se borran solo si son copias del CLAUDE.md.
Los enlaces a archivos que se mueven se corrigen. Nada de push.

## CRITERIO DE TÉRMINO
ESTADO.md destilado de la lista de pendientes que existía: solo lo abierto, en el orden del dueño, con lo bloqueado aparte.
CLAUDE.md ≤ 100 líneas (Apéndice B). AGENTS.md apuntando a él. .graphifyignore y el grafo construido.
typecheck · lint · tests en verde. Una entrada en el CHANGELOG que cuente la migración. Un refutador barato verificó
que ningún pendiente abierto quedó afuera de ESTADO.md.
```

Los ocho pasos, para seguirlos con los ojos:

1. Copiar este archivo a la raíz. Mover el método viejo del proyecto, si existe (p. ej. `METODO_AINNOVATE.md`), a `docs/archive/`.
2. Crear `ESTADO.md` destilando `PENDIENTES.md` (o la lista que exista): solo lo abierto, en el orden del dueño. Archivar el original con fecha.
3. Reescribir `CLAUDE.md` con el Apéndice B: guardrails del dominio, trampas, comandos, mapa. Guardar el viejo en `docs/archive/`.
4. Borrar `.cursorrules`, `.windsurfrules`, `.clinerules`, `.aider.conf.yml`, `.github/copilot-instructions.md`. Dejar `AGENTS.md` apuntando a `CLAUDE.md`.
5. Archivar el registro de skills del proyecto viejo, si existe (p. ej. `docs/SKILLS.md`), después de mover sus trampas verificadas a `CLAUDE.md`.
6. `.graphifyignore`, `graphify extract`, y el grafo global si hay más de un repo.
7. Auditar las skills con las 3R y archivar las que no pasan.
8. Una entrada en el CHANGELOG que cuente la migración, y el primer `ESTADO.md` cerrado.

---

## Apéndice A: plantilla de `ESTADO.md`

```markdown
# ESTADO — <proyecto>

> **Última actualización:** <fecha> (<qué sesión lo cerró y con qué versión>)
> Toda sesión lo lee primero. Toda sesión que cierra un bloque lo actualiza. Límite: 150 líneas.

## 1. Foto actual
| Qué | Estado |
|---|---|
| Versión en `main` / en producción | … |
| Base: migraciones aplicadas · escritas sin aplicar · próxima libre | … |
| Verificación (typecheck · lint · tests) | … |
| Grafo | construido el <fecha> (`graphify update .` al commitear) |

## 2. En vuelo ahora mismo
[Qué está a medio hacer y quién: sesión, rama, worktree. "Nada" también es una respuesta.]

## 3. Siguiente, en orden
[La cola en el orden que decidió el dueño. Un ítem por línea, con su tamaño: micro / feature / ola.]

## 4. Bloqueado: solo lo puede destrabar el dueño
[Variables de entorno, cuentas, decisiones de negocio, migraciones por aplicar en producción, cosas que hay que mirar en un navegador.]

## 5. Hecho reciente
[Las últimas 10 versiones, una línea cada una. El detalle está en el CHANGELOG.]

## 6. Deudas y límites conocidos
[Deuda técnica que no rompe nada hoy. Lo que NO se puede, con su razón.]

## 7. Reglas de esta casa
[Lo operativo: una sesión pesada por territorio, qué modelo para qué, cómo se cierra una sesión.]
```

## Apéndice B: plantilla de `CLAUDE.md` (≤ 100 líneas)

```markdown
# <Proyecto> — reglas para la IA (Método Maestro LuisRAI v3)

> El método completo está en `METODO_MAESTRO_LUISRAI.md`. Este archivo tiene solo lo que es de este proyecto.
> El estado vivo está en `ESTADO.md`. **Leelo primero, siempre.**

## Qué es
[Tres líneas: qué hace, para quién, el principio que no se negocia.]

## Guardrails universales (los del método, sección 4, aplicados acá)
[Este archivo es lo único que el harness carga solo, así que los guardrails universales van acá, uno por línea, como límites y no como pasos:]
- `ESTADO.md` es la única lectura obligatoria. Los demás docs se abren cuando se tocan (mapa abajo); lo demás lo responde el grafo:
  `graphify query "…"` antes de leer archivos para entender algo, `graphify affected "…"` antes de tocar un hub.
- Solo lo pedido. Ante una ambigüedad que cambia el resultado, preguntar; ante una duda menor, decidir, hacerlo y decirlo.
- Nada destructivo sin confirmación: push, deploy, migraciones en producción, borrar datos. Un commit local no necesita permiso.
- Los secretos viven en `.env`. Nunca en el código, en los docs ni en un log.
- Si el pedido choca con la arquitectura documentada, parar y explicar el choque antes de tocar nada.
- Un comentario o un doc que dejó de ser verdad se corrige en el mismo commit.
- Ningún servicio externo se dispara sin que el dueño sepa. Verificar en vivo es válido; publicar dos veces no.
- Una sesión no se cierra sin `ESTADO.md`, la entrada del `CHANGELOG.md` (≤ 15 líneas), el doc de la feature si cambió el comportamiento, y `graphify update .`.
- Lo repetitivo (auditorías, inventarios, barridos) va a subagentes Sonnet o Haiku, nunca al modelo caro.

## Guardrails del dominio (no negociables)
[Una línea por regla. Solo las que el modelo no puede adivinar y romper cuesta datos reales.]

## Trampas verificadas (tu memoria de estas librerías está desactualizada)
| Librería / servicio | Lo que el modelo cree | Lo que es verdad (y cuándo se verificó) |
|---|---|---|

## Comandos
[dev, build, typecheck, lint, test, y los propios del proyecto]

## Dónde está cada cosa
| Si tocás… | Leé antes |
|---|---|
[Por área, no por archivo. ≤ 15 filas. Si no está acá, está en el grafo.]
```

## Apéndice C: `CHANGELOG.md` y su entrada (≤ 15 líneas)

```markdown
# Changelog — <proyecto>

> Una entrada por versión, ≤ 15 líneas. Versionado semántico: patch = fix, minor = feature, major = cambio que rompe.
> El detalle largo vive en el commit y en `docs/features/`.

## [0.1.0] — Arranque con el Método Maestro LuisRAI (<fecha>)

**Qué:** estructura base, kit del método, código base del stack, grafo construido.
**Por qué:** [el pedido original, textual si es corto].
**Archivos:** los del kit + [el código base].
**Verificado:** arranca en local · typecheck · lint. **NO verificado:** [lo que no].
**Migración:** ninguna | 00001 (aplicada / escrita sin aplicar).
**Decisión:** [una que convenga poder revertir sabiendo por qué, si la hubo].
```

## Apéndice D: plantilla de `AGENTS.md`

```markdown
# <Proyecto> — para las IAs que no leen CLAUDE.md (Codex, Cursor, Windsurf, Gemini CLI)

Este archivo no repite nada: apunta.

- **El estado vivo** está en `ESTADO.md`. Leerlo primero, siempre.
- **Las reglas del proyecto** (guardrails del dominio, trampas de librerías, mapa de docs) están en `CLAUDE.md`.
- **El método de trabajo** está en `METODO_MAESTRO_LUISRAI.md`: tarea · guardrails · criterio de término.
- **El grafo del proyecto** está en `graphify-out/`: `graphify query "…"` antes de leer medio repo.

Lo mínimo si solo vas a leer una cosa: solo lo pedido · nada destructivo sin confirmar · secretos en `.env` ·
validar con [typecheck && lint && test] · al cerrar, `ESTADO.md` + `CHANGELOG.md`.
```

Si el framework ya escribe su propio bloque en `AGENTS.md` (Next.js 16 lo hace), se deja arriba y este contenido va debajo.

## Apéndice E: plantilla de `.graphifyignore`

```gitignore
# Graphify — qué NO entra al grafo (misma sintaxis que .gitignore; se suma a él).
# Regla: entra todo lo que es conocimiento vivo del proyecto; queda fuera lo generado, lo binario, lo duplicado y los datos de terceros.

# generado / dependencias
node_modules/
.next/
dist/
build/
graphify-out/
*.tsbuildinfo
package-lock.json
<tipos generados de la base, p. ej. src/types/database.types.ts>

# binarios (imágenes y PDF necesitan visión: caro y sin valor de grafo)
*.png
*.jpg
*.jpeg
*.gif
*.webp
*.pdf
*.mp4
*.zip

# datos de terceros y exports (teléfonos, correos, dumps)
*.csv
<carpetas de datos crudos>

# duplicados y referencias externas gigantes
<carpetas que son copia de otra cosa>
```

## Apéndice F: los docs mínimos

Cada uno cabe en una pantalla el día que nace. Crecen con el proyecto; nunca se crean vacíos.

**`docs/02-architecture.md`**
```markdown
# Arquitectura — <proyecto>

## Estructura de carpetas
[El árbol real, con una línea por carpeta que diga qué vive ahí. Se actualiza cuando cambia.]

## Flujo de datos
[El camino crítico: de dónde entra un dato, por dónde pasa, dónde termina. Uno o dos flujos, no todos.]

## Variables de entorno
| Variable | Para qué | Pública / privada |

## Decisiones (ADRs)
### ADR-001: <título>
**Fecha:** · **Contexto:** por qué había que decidir · **Decisión:** qué se eligió · **Consecuencias:** qué se gana y qué se paga
```

**`docs/DB_SCHEMA.md`** (si hay base)
```markdown
# Esquema — <proyecto>
> Última actualización: <fecha> · Migraciones aplicadas: hasta la 000NN · Próxima libre: 000NN

## Tablas
### <tabla>
[Para qué existe. Columnas que no son obvias, con su razón. FK. Índices que importan.]
**RLS:** [quién ve qué, en una línea; el SQL vive en la migración]

## Funciones y triggers
[Solo los que cambian el comportamiento: qué disparan y por qué existen.]

## Migraciones
| # | Archivo | Qué hace | Aplicada |
```

**`docs/03-security.md`** (si hay auth o secretos)
```markdown
# Seguridad — <proyecto>

## Autenticación y autorización
[Cómo entra un usuario; qué puede ver cada rol; dónde se decide (RLS, middleware, servicio).]

## Secretos
[Qué variables son secretas, dónde viven, qué NUNCA sale al cliente (p. ej. la service role key).]

## Superficies expuestas
[Endpoints públicos, webhooks, páginas sin sesión: qué validan y qué firman.]

## Reglas
[Las que el modelo no puede adivinar: cifrado de X, quién salta RLS y dónde, qué se filtra a mano.]
```

**`docs/features/<nombre>.md`** (una por feature no trivial, antes de codearla)
```markdown
# <Feature>
> **Estado:** en diseño · en curso · viva (v0.x.0) · **Ruta / entrada:** … · **Migración:** ninguna | 000NN

## Qué hace y para quién
[Dos o tres líneas.]

## Cómo funciona
[El flujo, en pasos de una línea. Los archivos clave, por nombre.]

## Decisiones y qué NO hacer
[Lo que se decidió y por qué; las trampas de esta feature; lo que parece buena idea y no lo es.]

## Cómo se verifica
[El flujo real que hay que ver funcionar; los tests que la cubren.]

## Pendiente
[Solo lo que sigue abierto. Cuando se cierra, se saca.]
```

**`docs/plans/<fecha>-<ola>.md`** (antes de una ola; o en la carpeta de planes que el proyecto ya use)
```markdown
# Ola: <nombre> (<fecha>)
> **Resultado completo:** [qué queda funcionando cuando la ola termina, en dos líneas] · **Mockup aprobado:** [dónde está, si hay interfaz]

## Piezas, en orden
| # | Pieza | Tamaño | Depende de | Migración | Cómo se verifica |
|---|---|---|---|---|---|

## Decisiones tomadas antes de empezar
[Las que no se reabren durante la ola, con su razón.]

## Lo que queda afuera a propósito
[Y por qué. Evita que una pieza crezca sola.]
```

**`docs/API_DOCS.md`** (el día que hay un endpoint)
```markdown
# API — <proyecto>
> Base: `/api/v1` · Auth: [cómo] · Última actualización: <fecha>

| Método | Ruta | Qué hace | Auth | Doc de la feature |
|---|---|---|---|---|
```

## Apéndice G: configuración de la máquina (una sola vez)

```bash
# 1. Python 3.11+ y uv (https://docs.astral.sh/uv). Con pip también sirve.
# 2. Graphify y su skill de Claude Code
uv tool install "graphifyy[anthropic,sql]"      # o: pip install "graphifyy[anthropic,sql]"
graphify install
# 3. La carpeta donde van las skills que no pasan las 3R
mkdir -p ~/.claude/skills-archivadas
# 4. Un solo lugar para el grafo global y su vista (fuera de los repos)
mkdir -p "~/Downloads/<Nombre> Grafo/obsidian/mis-notas"
```

Y en Claude Code:

- `~/.claude/settings.json` → `enabledPlugins` solo con los plugins que pasan las 3R (sección 8).
- Modelo por defecto para el día a día: Sonnet (`/model sonnet`). El caro se elige a mano cuando toca pensar.
- Ultracode y los workflows multi-agente: apagados por defecto; se encienden para una auditoría y se apagan.
- Cada seis meses: ablación (sección 8).

---

## Cierre: lo que este método promete

No un porcentaje. Tres cosas, con el número que ya se midió en AIOS el día de la migración (2026-09-04):

- **Menos tokens por sesión:** la lectura obligatoria antes de tocar nada pasó de ~69 KB (`CLAUDE.md` de 290 líneas + `01-project-overview.md` + `02-architecture.md`, unos 17 k tokens) a ~23 KB (`CLAUDE.md` + `ESTADO.md`, unos 6 k tokens), más una consulta al grafo de 1-2 k cuando hace falta.
- **Menos contexto perdido entre sesiones:** `ESTADO.md` es el mismo archivo para toda IA y toda sesión, y cabe en una pantalla (80 líneas el primer día).
- **Menos trabajo rehecho:** el criterio de término y la revisión de dos lentes convierten "parece terminado" en "está terminado o dice qué falta". La primera revisión de este mismo método encontró un guardrail que se había vuelto falso al comprimirlo.

*Método Maestro LuisRAI v3.0 · 2026-09-04. Se revisa con cada modelo nuevo, por ablación. Lo que no se extraña, no vuelve.*
