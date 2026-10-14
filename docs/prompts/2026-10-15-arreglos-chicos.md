# Prompt — Arreglos chicos: lo que falla callado, permisos y mensajes (2026-10-15)

> Escrito por el comandante (Opus 5.5) la noche del 14 al 15-10. **Modelo: Opus.** Una sesión larga, **de noche: el dueño
> duerme y no puede contestar.** Corre en paralelo con otras sesiones (referidos, la auditoría del AIOS, el cierre de la
> parte 2 de sedes): mira el tablero.

---

Eres una sesión de Claude Code en el repo RestaurantQR / Cada1. Cierras una tanda de defectos chicos de
`docs/PENDIENTES.md` §5. Cada uno tiene allí su descripción completa, con archivo y línea: **léela antes de tocarlo** y
**verifica contra el código que sigue siendo verdad** (otras sesiones cerraron cosas hoy). Si uno ya no aplica, dilo y
sáltalo.

**El dueño duerme: no le preguntes nada.** Si algo resulta ser decisión suya, no lo construyas: anótalo en
`docs/PENDIENTES.md` §8 con un default y sigue con el siguiente.

## 1. Antes de tocar nada

1. Lee `ESTADO.md` entero. **Hay sesiones vivas:** mira §2. No toques ningún archivo que esté en la fila de otra (la
   sesión de referidos tiene el registro del check-in, `reward-grant.service.ts`, Recompensas, el mesero y
   `settings-keys.ts`; la parte 2 de sedes, la tarjeta y la config de la marca). Si un arreglo necesita un archivo ajeno,
   sáltalo y anótalo.
2. Anota tu fila en §2 («Arreglos chicos 15-10», modelo, archivos). Commitea SOLO `ESTADO.md`.
3. Lee `docs/PENDIENTES.md` §3.2 y §5 enteros.
4. Antes de leer archivos sueltos: `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. La tanda, en este orden (un commit por grupo)

**Grupo 1 · Permisos**
1. **SEDE-MESEROS**: un administrador de sede lista y edita los meseros y aparatos de la OTRA sede de su marca
   (`/api/dashboard/staff` usa `requireTenantId()`). Arreglo: `requireLocationScope()` y filtrar por sede, con los
   rotativos visibles para los dos. Un usuario de marca y el operador, igual que hoy.
2. **N13**: el PIN del supervisor no tiene límite de intentos. Ponle uno (mismo patrón que el límite de tasa de
   `mystery-box/resolve`, si sirve), con un mensaje en español y sin decir si el teléfono existe.
3. **OPERADOR-BASE-CAIDA**: si leer el alcance falla, `exigirAlcanceDeMarca()` deja escribir igual al operador. Que sea
   500, como dicen los docs.

**Grupo 2 · Lo que falla callado** (un fallo nunca se ve como «0» ni como «guardado»)
4. **OPER-4-mudo**: en Configuración, «Beneficios Black», «Sistema de puntos» y «Check-in» se tragan el error al guardar.
5. **0.ETA**: la importación de clientes por CSV cuenta como importados los que la base rechazó (mira `res.ok`).
6. **N-RADAR**: `SegmentRadar` pinta «NaN clientes» y ceros ante un 500; y su texto sigue con los días de antes
   (17 · 21 · 25). Arregla el fallo y alinea el texto con la escala del ciclo (las funciones del motor, nunca números a
   mano), o retíralo si ya no aporta nada al lado del ciclo: decide y dilo.

**Grupo 3 · Mensajes**
7. **PL-2** (`docs/PENDIENTES.md` §3.2): el check-in manual del panel (`check-in-override`) y el registro de un domicilio
   (`delivery.service.ts`) mandan «Nivel desbloqueado» sin preguntar si la plantilla Twilio está aprobada. Cópiales la
   pregunta (`punteroAprobado()` del cron de recordatorios).
8. **PL-2-ciclo**: el ciclo pregunta solo por «Regalo que vence»; que pregunte también por las otras cuatro que usa.
9. **N-OVERRIDE-LOG**: `check-in-override` manda sin `logContext`: no deja fila en `message_logs` y gasta cupo de
   campaña siendo transaccional.
10. **N6**: los botones sí/no del webhook de Zernio esperan 10 s antes de contestar. Que conteste enseguida y haga el
    trabajo después (`after()`, como ESCALA-3).
11. **N-PORTADA-TWILIO**: la portada del ciclo le pregunta a Twilio en cada carga. Un caché corto por marca (como el de
    la WABA de P1-a).
12. **N-SEDE-ENVIO** (si te alcanza): el drenador, la caja misteriosa y el envío inmediato del calendario conocen la sede
    y no la pasan a `message_logs`. Sin backfill.

**Grupo 4 · Textos que dejaron de ser verdad**
13. **S-1.7** y **N-CATALOGO-1B** (`template-catalog.ts`: solo las descripciones y los comentarios, **nunca el cuerpo de
    una plantilla ni sus variables** —el contrato `{{n}}` es fijo—; y `PointsCalibrator.tsx`).
14. **SEDE-AJUSTES**: Ajustes › Ubicación del Local edita solo la sede principal; con 2+ sedes, que mande a Mis sedes.
15. **Plantillas, el aviso amarillo** (nuevo, lo vio el comandante en Tepuy el 14-10): «WhatsApp está revisando N
    mensajes… **Mientras tanto tus clientes siguen recibiendo los mensajes actuales**». En una marca que todavía no tenía
    ninguno aprobado (Tepuy) eso es falso: que el texto diga la verdad en los dos casos.

**Fuera de esta tanda** (no los toques): N-DOBLE y N18-CI (son decisiones), SEDE-CLIENTES, SEDE-RECOMPENSAS y SEDE-GANADO
(se cruzan con referidos), S-1.6 (lo hace referidos), TEST-flaky (si lo ves, guarda la salida y anótalo), lo del AIOS.

## 3. Reglas

- Un dato de la marca A jamás se ve en la B. `location_id` NULL = sede desconocida, nunca se backfillea.
- Supabase JS: destructura `error` y pásalo por `src/lib/db-failure.ts`.
- Nada en pesos. Ningún hex nuevo. Nada de `useSearchParams()`.
- No toques `src/constants/messaging.ts`, `template-texts.ts`, `vercel.json` ni el cuerpo de una plantilla.
- Git: solo tus archivos, por nombre. Nunca `git add -A`, ni cambiar de rama, ni `stash`, ni `reset --hard`. **Una corrida
  de vitest a la vez**: avisa a las otras sesiones por `SendMessage` antes y después. Sin migración salvo que un arreglo la
  pida de verdad (entonces, número del script en tu fila, y dilo). Sin push.

## 4. Tests

Cada arreglo con su test, que falla contra el código de hoy (los de permisos y los de mensajes, con Postgres real donde
el arreglo toca la base). Suite entera en verde (la última corrida completa dio **99 archivos / 1.677 tests**);
compruébalo sin `stash` y di cuántos fallan contra el código anterior.

## 5. Cierre

`npx tsc --noEmit` limpio · `npm run lint` sin errores nuevos (base: 14) · `npx vitest run` entero (mira «Test Files»).
Cada arreglo hecho SALE de `docs/PENDIENTES.md` §5 (o §3.2) y entra al `CHANGELOG.md` (una entrada, ≤ 15 líneas); el doc
de la feature que cambió, al día; tu fila fuera de `ESTADO.md`. Con otras sesiones vivas, cada una commitea solo sus
trozos de esos archivos. Commit por nombre y
`/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 6. Tu respuesta final (el dueño se la pasa al comandante por la mañana)

Hashes y archivos. Una tabla: cada ID, hecho / saltado (y por qué), archivo y línea, test. Cuántos tests fallan contra el
código anterior. tsc, lint y vitest con números. Lo que anotaste para después.
