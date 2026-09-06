# §19 — Escáner de meseros: el aparato es del local

> **Estado:** APROBADO por el dueño el 2026-09-05 e IMPLEMENTADO en `feat/staff-scanner-19`.
> **La migración `00046` se dejó SIN APLICAR: aplicarla en producción lo decide el dueño.**
> **Encargo:** `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §19 · ficha en
> `docs/ESTADO-REQUERIMIENTOS.md` §19 · feature: `docs/features/staff-qr-scan.md`
> **Mockup aprobado:** las 10 pantallas, en el artefacto del 2026-09-05.

---

## 1. Qué se invierte

Hoy el celular **pertenece a un mesero** (`staff_devices.staff_user_id`) y la atribución se
DEDUCE de esa fila. §19 lo da vuelta: el celular es **del local**, y el mesero se **elige en
cada operación**.

| | Antes | Después |
|---|---|---|
| Dueño del aparato | un mesero (`staff_user_id`) | nadie (`staff_user_id = NULL`) |
| Sede del aparato | heredada de su dueño | **elegida al activarlo** |
| Login | cada mesero, teléfono + PIN | **uno, del aparato, una vez en su vida** |
| Alta de un mesero | nombre + teléfono + PIN | **solo el nombre** (+ sede) |
| Quién hizo el check-in | deducido del aparato | **`registered_by_staff_id` en el cuerpo** |
| Quién entregó el premio | deducido del aparato | **`redeemed_by_staff_id` en el cuerpo** |

No se toca **ninguna fila** de `staff_devices` en producción: los aparatos ya activados
siguen siendo sesiones válidas. La inversión es de código, no de datos.

## 2. Decisiones del dueño

**Modelo (2026-09-05):** el aparato es del restaurante — *"si lo hacemos por mesero hay que
estar pendiente de que cierren y abran sesión no tiene sentido alguno"* · el mesero SIEMPRE
selecciona su nombre — *"tengo que separarlos para trackear eficiencia eso no se puede
juntar"* · la lista se filtra por sede — *"si metemos a todos de todas las sedes buscarse a la
hora de entregar premio es una focking bestialidad"*.

| # | Decisión | Por qué |
|---|---|---|
| **19.a** | **PIN de supervisor**, lo que ya existía. El token del aparato **sigue siendo el fingerprint** | Cada marca es autosuficiente: crea su supervisor desde su propio panel y activa sus aparatos sin depender de nadie |
| **19.b** | **Se migran**, no se dan de alta de cero | `visits.registered_by_staff_id` es `ON DELETE SET NULL` (00018:56): borrarlos vacía la atribución de todo el histórico, en silencio |
| **19.c** | Con o sin PIN, el mesero **siempre** se elige | Es el propósito de la pantalla |
| **19.d** | **"Guardar" no escribe nada.** No toca `expires_at`, no crea estado | Ya funciona así: `reward_grants.expires_at` es `DEFAULT NULL` y `grantReward()` solo pone ventana con `windowDays`. Guardar es la AUSENCIA de redención |
| **19.e** | **No aplica.** Se cayó con el PIN | — |
| **19.f** | Ver §3 | Era el bloqueante |
| **§19.6-7** | **SIN PIN del mesero al entregar.** *"se crea un usuario, se inicia sesión y ya está… ya cuando vayan a redimir un premio ponen el nombre del qué lo redimió"* | Decisión del dueño, 2026-09-05, revocando el punto 6 del encargo del 30-ago. Con ella se cayeron también 19.e y §19.7 enteros |

**Lo que el dueño acepta al quitar el PIN, por escrito:** cualquiera con el celular en la mano
puede marcar un premio como entregado a nombre de cualquier mesero de esa sede. Queda
registrado quién, cuándo y en qué mesa, pero nada impide poner un nombre que no es. Es
reversible: reponer el PIN no obliga a deshacer nada de lo demás.

## 3. 19.f — la llave de identidad

D11 tenía **dos mitades**, encadenadas: identidad = teléfono → un teléfono no se repite dentro
de la marca → **una fila por persona** → una `location_id` por fila → **una sede**.

Al volver `phone` opcional, la base **pierde para siempre la forma de saber que "Ana de
Laureles" y "Ana del Poblado" son la misma persona.** Ningún UNIQUE lo recupera: el dato que
las unía dejó de existir. Es consecuencia directa de dar de alta meseros solo con nombre.

**Lo que sí queda garantizado por el motor:** ningún hecho se atribuye jamás a dos sedes. Una
fila tiene exactamente una `location_id`.

**Riesgo residual aceptado:** un mesero sin teléfono dado de alta en dos sedes cuenta como dos
meseros y su métrica de eficiencia se parte. Se mitiga por operación: cada sede da de alta a
los suyos.

## 4. Migración `00046` — escrita y SIN aplicar

Depende de la **00044**; el bloque 0 aborta si falta. No backfillea nada.

| Bloque | Qué |
|---|---|
| 1 | `staff_users.phone` → NULLABLE (§19.2) |
| 2 | **`staff_users_phone_tenant_key` NO se toca.** Sigue dando D11 completo a todo el parque que tiene teléfono — hoy el 100 % de las filas |
| 3 | `CHECK staff_users_identidad_minima (phone IS NOT NULL OR location_id IS NOT NULL)`. Sin él se podrían crear N "Ana" con sede NULL, que quedan fuera del UNIQUE de teléfono **y** del índice del bloque 4: la misma trampa de los NULL un piso más abajo |
| 4 | `UNIQUE (tenant_id, location_id, lower(trim(name))) WHERE location_id IS NOT NULL`. La llave que la pantalla necesita. **Parcial a propósito**: sin la cláusula, las filas con sede NULL volverían a no colisionar entre sí y el índice mentiría sobre su alcance |
| 5-6 | Comentarios y verificación final |

## 5. La sede del aparato

`staff_devices.location_id` deja de heredarse de un dueño que ya no existe.

- **Al activar:** la elige el supervisor → si no, su propia sede → si no, la del host.
  **Es obligatoria**: si la marca tiene sedes y no se resolvió ninguna, la ruta responde
  `sede_requerida` y la pantalla muestra el paso. Solo se permite NULL en una marca que
  todavía no tiene ninguna sede creada — no se puede exigir elegir entre cero opciones.
- **Y casi nunca se pregunta:** `GET /api/staff/locations` devuelve `auto` cuando hay UNA sola
  sede (o el subdominio ya la resolvió), y entonces el paso no se muestra. Era la
  preocupación explícita del dueño *("me parece que se va a volver un revoltillo completo")*.
- **Al leer:** `staff_devices.location_id` → `resolveHostContext().locationId` → nada.
- **Sin sede: fail-closed.** `GET /api/staff/waiters` responde **409**, nunca la marca entera.
  Devolver "todos por si acaso" es justo lo que el dueño rechazó, y encima disfrazado de
  éxito: la pantalla no tendría forma de notar que el filtro no se aplicó. El parque instalado
  (todo con sede NULL) pasa una vez por la pantalla de asignación.

## 6. Superficie

| Ruta | Cambio |
|---|---|
| `GET /api/staff/waiters` | **Nueva.** Los meseros activos de la sede del aparato. 409 `sede_no_asignada` si no hay sede |
| `GET /api/staff/locations` | **Nueva.** Sedes activas + `auto`. Sin sesión: se consulta antes de que exista |
| `POST /api/staff/login` | **Eliminada.** El login por mesero desapareció |
| `POST /api/staff/device/register` | Acepta `location_id`; escribe `staff_user_id = NULL`; se retiró `assign_staff_phone`. Es también el camino para asignar o cambiar la sede de un aparato ya activo |
| `GET /api/staff/me` | Devuelve `device.location_id` y `device.location_name` |
| `POST /api/check-in` | `registered_by_staff_id` **obligatorio** para `source: 'staff_scan'` y tomado del cuerpo |
| `POST /api/reward-redeem` | `redeemed_by_staff_id` **obligatorio**, del cuerpo. Sin PIN |
| `POST/PATCH /api/dashboard/staff` | `phone` y `pin` opcionales; sede obligatoria si no hay teléfono |
| `src/lib/staff-auth.ts` | `resolveStaffAuth` devuelve `via`, `deviceId`, `deviceLocationId`. **La rama de aparato devuelve `staffId: null`** aunque la fila tenga dueño |

**Dos trampas que costaron un rato y quedan fijadas en el código:**

1. En `/api/check-in`, mesero y aparato eran **excluyentes** (`else if`). §19 manda los dos a
   la vez —el mesero en el cuerpo, el aparato en la cabecera— así que pasaron a validarse por
   separado. La derivación desde cabeceras también era `if (!staff && !device)`: con el cuerpo
   trayendo el mesero, nunca se habría cumplido, `device_token` habría quedado vacío y **todos
   los meseros habrían recibido 403**.
2. El cupo del rate limit se cuenta **por aparato** cuando hay aparato. Como
   `registered_by_staff_id` ahora viene siempre, la preferencia contraria habría multiplicado
   el cupo real de una tablet por el número de meseros de la sede.

## 7. Pantallas

| Pantalla | Cambio |
|---|---|
| `/mesero` | Deja de ser un login: es la **activación del aparato**. Supervisor + PIN + nombre del aparato, y el paso de sede solo si hay 2 o más. Detecta el aparato activo sin sede y pide asignarla |
| `/mesero/dashboard` | Muestra a qué sede atribuye el aparato, o «Sin sede» |
| `/mesero/confirm` | **+ selector de mesero, obligatorio**, junto a la mesa |
| `/mesero/rewards` | Por premio: **"Entregar" / "Guardar"**. Entregar despliega mesa + selector |
| `dashboard/staff` | Alta solo con nombre · sede obligatoria si no hay teléfono · «Sin sede» se sigue mostrando |

Piezas compartidas nuevas: `src/hooks/useWaiters.ts` y
`src/components/features/staff/WaiterPicker.tsx`, con los tres estados vacíos separados (sin
sede / sin meseros / falló la base): un selector vacío y mudo haría registrar sin atribuir.

## 8. Lo que NO se tocó

- Nada pendiente de desplegar: **multi-sede F4/F7 ni §25 F2**. Las migraciones 00044 y 00045
  no se editaron.
- `staff_users_phone_tenant_key` — se conserva.
- `getTenantByDomain()` conserva su firma; la sede viaja por `resolveHostContext()`.
- `resolveVisitLocation()` y la precedencia del §3.1 — solo cambia su entrada.
- **La sede jamás entra en el JWT.** Vive en la fila y se relee en cada petición.
- Todo INSERT lleva `tenant_id` explícito (la 00030 nunca se aplicó).

## 9. Verificación

`tsc` limpio · eslint **7 errores, los mismos 7 preexistentes en los mismos 4 archivos** (y 3
warnings menos) · **vitest 15 archivos / 278 tests en verde** (eran 14 / 261; +17, ninguno
perdido). El arnés levanta un Postgres real, así que la 00046 se aplica de verdad en cada
corrida.

Dos pruebas existentes cambiaron **de contrato a propósito**, no de exigencia:

- `tests/db/multisede-meseros.test.ts` — el fixture creaba todos los meseros con el nombre
  `'Mesero de prueba'` en la misma sede compartida, y el UNIQUE nuevo hacía fallar 16 pruebas
  de la 00044 por un invariante que no es el que miden. Ahora el nombre por defecto es único.
- `tests/unit/db-failure.test.ts` — la rama de aparato devolvía `staffId: 'mesero-9'`. Se
  partió en dos pruebas: una fija la sede que ahora sí trae, y otra fija que **el dueño del
  aparato se ignora aunque esté en la fila**, con el porqué escrito al lado.

## 10. Deudas que abre

- **D18 — el token del aparato es el fingerprint** (user agent + resolución + plataforma).
  Con §19 pasa a ser la ÚNICA credencial del local: quien lo reproduzca puede atribuir
  check-ins a cualquier mesero de la sede y entregar premios. **El dueño decidió dejarlo así
  (2026-09-05).** El arreglo, cuando toque: emitir un token opaco aleatorio al activar y
  guardar su hash, dejando el fingerprint como señal secundaria.
- **D19 — identidad de meseros sin teléfono** (§3): la mitad de D11 que se pierde.
- **D20 — quién activó un aparato** deja de quedar en `staff_user_id`; solo en `device_name`
  y `trusted_at`.
- **Onboarding de los 25**: cada marca necesita **un `staff_users` con rol `supervisor`,
  teléfono y PIN** antes de poder activar su primer aparato. Va al checklist de provisioning.
- **Un mesero en DOS sedes sería caro.** Choca con D11, que vive en la FK compuesta, en el
  trigger de la 00044 y en el índice nuevo. Advertido al dueño el 2026-09-05: si aparece esa
  necesidad, cambiar el diseño de la llave es barato **hoy** y caro después.
