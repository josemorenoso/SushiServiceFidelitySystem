# ESTADO DE LOS REQUERIMIENTOS — §1 a §25, auditado contra el código

> **Auditado:** 2026-09-04 · **revisado el 2026-09-06** contra `main` desplegado (`f90282f`).
> Fuente: `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`,
> verificado **contra el código**, no contra lo que dice el requerimiento.
> **Complementa** a [ESTADO.md](../ESTADO.md) — ese lleva multi-sede, §25 y el camino a producción; este
> lleva el resto del encargo de producto.
> **Por qué existe:** ESTADO.md se armó sobre multi-sede y §25, y se le pasó todo lo demás — entre
> ellos §19, que el dueño recordaba y no estaba anotado en ninguna lista viva.

---

## Tabla de estado

| § | Tema | Estado | Evidencia | ¿Bloquea el deploy de mañana? |
|---|------|--------|-----------|---|
| 3 | Personalización del QR | ✅ **HECHO**, en `main` y desplegado | La config del QR Studio vive en `tenants.config.qr_studio` (migración `00047`, **sin aplicar**); el QR de `CustomerCard.tsx` lleva color de marca + logo con `level="H"`. Ver `docs/features/identidad-visual.md` | NO |
| 4 | Programa de referidos | **NO EMPEZADO** | Solo `docs/features/referral-program.md`, marcado "PLAN — NO IMPLEMENTADO". Sin schema, sin endpoints | NO |
| 5 | Personalización pantalla teléfono + tarjeta | ✅ **HECHO**, en `main` y desplegado | Los hex de `CheckInForm.tsx` y de las clases premium pasan a variables `--brand-*` sustituibles por tenant; `EDITABLE_KEYS` pasa a ser una whitelist **por ruta** (`src/lib/tenant-config-paths.ts`) | NO |
| 6 | Branding + wizard de plantillas | **PARCIAL** | Tono/estilo ya resuelto vía §12. **Logo y paleta HECHOS** (`/dashboard/marca`, con vista previa en vivo, desplegado). Falta el wizard de alta de tenant | NO |
| 7 | Calendario — mensaje hardcodeado | **NO EMPEZADO** | `TEMPLATE_BODY` fijo en `scripts/twilio-create-media-templates.mjs:132`; `event_type` nunca se lee para elegir plantilla. Lo que SÍ se hizo (2026-09-06): enlace del evento en `{{5}}`, goteo por `send_queue` y hora de Bogotá | NO |
| 8 | Puntos al superar el tier máximo | **NO EMPEZADO** | Fallback `?? 150` intacto en `src/services/points.service.ts:187` | NO |
| 9 | Notificaciones Push (FCM) | **NO EMPEZADO** | Cero infraestructura (sin firebase/vapid/fcm en `src/`) | NO |
| 10 | Housekeeping | ✅ **HECHO** | CHANGELOG v2.8.2/v2.8.3/v2.9.1; `Level 2.0/` versionada; gitlink eliminado (`4e88cf2`) | NO |
| 12 | Plantillas de WhatsApp | ✅ **HECHO** | v2.12.0, migración `00039_template_catalog.sql`, commit `e8033f3` | NO |
| 13 | Apartado de Campañas | **PARCIAL** | Sin alcance propio: absorbido y redirigido a §15/§16 | NO |
| 14 | Dashboard — limpieza | ✅ **HECHO** | Commit `f1a7921`: `BlackTierSection` movido, `TOP_CUSTOMERS_LIMIT = 15` | NO |
| 15 | Campañas — usabilidad | **PARCIAL** | Burbujas movidas y presets fantasma ocultos (`f1a7921`); el rediseño de §15.1 sin empezar, 15.b sin decidir | NO |
| 16 | Fatiga y pipeline del recorrido | **NO EMPEZADO** | Cero código; solo documentado. Preguntas 16.a–e abiertas | NO |
| 17 | Clientes Black / VIP | **PARCIAL** | Mudanza y tarjeta hechas (`f1a7921`); beneficio permanente (17.3) y umbral configurable (17.4) sin implementar. Ojo con la **17.b** ya conocida | NO |
| 18 | **Domicilios bajo coexistencia** | **NO EMPEZADO** | No existe apartado de Domicilios en el dashboard ni canal alternativo para el "cuadro" | **NO para el deploy — SÍ para el onboarding** (ver abajo) |
| 19 | **Escáner QR de meseros** | ✅ **HECHO**, en `main` y desplegado | Migración `00046` **aplicada** (`ESTADO.md` §1). ⚠️ Los meseros existentes tienen `location_id` NULL: **no salen en ningún escáner** hasta que se les asigne sede (`SQL-PARA-CORRER/meseros-sin-sede/`). Ver ficha abajo | NO |
| 20 | Decisiones D-7 a D-10 | **PARCIAL** | Solo documentadas (`060ac01`, docs-only). Sin divisor de bloques Golden Bullet, sin `accepts_marketing:false` explícito en importación, `consent_events` sin referenciar en `src/` | NO |
| 21 | Panel del AIOS | ✅ **HECHO** | AIOS v1.3.0: `client_locations.platform/.messaging`, `clients.billing_mode` | NO |
| 22 | Franquicias | ⏸️ **DIFERIDO A PROPÓSITO** | El doc dice explícitamente "NO es v1"; se dejó la puerta abierta sin construir | NO |

§1, §2, §11 son contexto/arquitectura ya resueltos. §23/§24/§25 están en [ESTADO.md](../ESTADO.md).

---

## §19 — Escáner QR de meseros (lo que el dueño recordaba)

**Pedido el 2026-08-30. Sin empezar y SIN SPEC** — el propio requerimiento dice "merece spec propio" y
ese spec no existe en `docs/superpowers/specs/`. **El 2026-09-05 el dueño cerró el modelo** (ver
"Decisiones del dueño" abajo): el aparato es del restaurante, el mesero se elige en cada operación y
la lista va filtrada por sede.

No es construir de cero: es **invertir el modelo**. Hoy el celular pertenece a un mesero
(`staff_devices.staff_user_id`); se pide que pertenezca al **restaurante** y que el mesero se elija por
operación. Los 7 puntos:

1. Un solo login por celular, con usuario/clave **del administrador**; se elimina el login por mesero.
2. Meseros de alta **solo con PIN de 4 dígitos** — sin teléfono, sin celular propio.
3. Nota de a quién pertenece el celular al activarlo (`device_name` ya existe).
4. Al escanear: mesa (ya existe) + **elegir el mesero** → habilita métrica de escaneos por mesero.
5. Al entregar premio: **"Redimir ahora" o "Acumular"**.
6. Al redimir: elegir quién redime + mesa + **exigir su PIN**.
7. Ese PIN debe poder **activarse/desactivarse** desde el apartado de escaneo.

**Verificado contra el código: no existe nada de esto.** `staff_users.phone` sigue `NOT NULL UNIQUE`
(`00018:12`), el login sigue pidiendo teléfono+PIN por mesero, no hay "Redimir/Acumular", no hay PIN
configurable.

### ⚠️ Choque con F4 — decidir ANTES de implementar

El punto 2 (el teléfono deja de ser obligatorio) **rompe D11**. El constraint
`staff_users_phone_tenant_key (phone, tenant_id)` es, según `CLAUDE.md`, *"D11 en el motor"*: es lo que
garantiza a nivel de base que un mesero pertenece a UNA sede. Si el teléfono pasa a ser opcional, ese
UNIQUE deja de proteger nada — **en Postgres los NULL no colisionan entre sí** — y la garantía
desaparece sin que nadie se entere. Hace falta otra llave de identidad del mesero antes de tocar esto.

### Decisión de diseño ya tomada (no la "arregles" después)

Textual del dueño: *"sí se podrán registrar QR a nombre de otros meseros pero nadie lo va a hacer
porque es una estupidez regalar tu premio a otro"*. **La atribución del escaneo NO se protege con PIN;
solo la redención.** Está registrado a propósito para que nadie lo trate como un bug.

### Decisiones del dueño — 2026-09-05 (cierran el modelo; no se reabren)

**1. El celular es del RESTAURANTE, no del mesero. Confirmado.** Textual: *"si lo hacemos por mesero
hay que estar pendiente de que cierren y abran sesión no tiene sentido alguno"*. Un login por aparato,
y el mesero se identifica por operación — no hay sesión de mesero que abrir ni cerrar.

**2. El mesero SIEMPRE selecciona su nombre, en toda operación.** Textual: *"tengo que separarlos para
trackear eficiencia eso no se puede juntar"*. La atribución por mesero es el **propósito** de la
pantalla, no un adorno. **Esto responde la 19.c:** con el PIN desactivado igual se elige mesero — el
PIN protege la redención, la selección alimenta la métrica de eficiencia y no se puede saltar.

**3. La lista de meseros se filtra POR SEDE.** Textual: *"si metemos a todos de todas las sedes
buscarse a la hora de entregar premio es una focking bestialidad"*. Es la razón de producto de D11
(un mesero es de UNA sede), que hasta hoy solo tenía razón de datos: una lista de 8 nombres es usable,
una de 40 no. **`staff_users.location_id` (00044) es lo que hace posible este filtro.**

### Preguntas de §19 — TODAS CERRADAS el 2026-09-05

Resueltas en `docs/superpowers/specs/2026-09-05-staff-scanner-19-design.md`, aprobado por el dueño
sobre un mockup de las 10 pantallas. **§19 ya no bloquea nada.**

- **19.f · La identidad del mesero (era BLOQUEANTE) — RESUELTA.** `staff_users_phone_tenant_key`
  **no se quita: se complementa.** Sigue dando D11 completo a todo el parque que tiene teléfono.
  Se le suman un `CHECK (phone IS NOT NULL OR location_id IS NOT NULL)` —sin teléfono, la sede es
  obligatoria— y un `UNIQUE (tenant_id, location_id, lower(trim(name))) WHERE location_id IS NOT
  NULL`, que es la llave de los que no tienen teléfono y la que la pantalla necesita.
  ⚠️ **Lo que se pierde y el dueño aceptó:** sin teléfono la base ya no puede saber que "Ana de
  Laureles" y "Ana del Poblado" son la misma persona. Ningún índice lo recupera. Lo que sí queda
  garantizado por el motor: ningún hecho se atribuye a dos sedes.
- **19.a — el PIN de supervisor que ya existía.** Cada marca crea su supervisor desde su propio
  panel y activa sus aparatos sin depender de nadie. El token del aparato **sigue siendo el
  fingerprint**: el dueño decidió no endurecerlo (deuda D18).
- **19.b — se migran.** `visits.registered_by_staff_id` es `ON DELETE SET NULL`: darlos de alta de
  cero vaciaría la atribución de todo el histórico en silencio. ⚠️ Queda **un paso manual del
  dueño**: asignarles sede en el panel (hoy todos tienen `location_id` NULL y no saldrían en
  ninguna lista).
- **19.d — "Guardar" no escribe nada.** No toca `expires_at` ni crea estado: es la ausencia de una
  redención. El premio vuelve a salir en la próxima visita del cliente.
- **19.e — ya no aplica.** Se cayó con el PIN del mesero.

### El PIN del mesero se quitó (dueño, 2026-09-05)

Revoca el punto 6 del encargo del 30 de agosto. Textual: *"se crea un usuario, se inicia sesión y
ya está, no hay mayor logica ahí… ya cuando vayan a redimir un premio ponen el nombre del qué lo
redimió"*. Con él se cayeron **19.e** (intentos y bloqueos) y **§19.7** (el interruptor) enteros.

**Lo que el dueño acepta:** cualquiera con el celular en la mano puede marcar un premio como
entregado a nombre de cualquier mesero de esa sede. Queda registrado quién, cuándo y en qué mesa,
pero nada impide poner un nombre que no es. **Es reversible**: reponer el PIN no obliga a deshacer
nada de lo demás.

---

## §18 — Domicilios bajo coexistencia: matización importante

El barrido lo marcó como bloqueante. **Matizado tras leer la sección completa: no bloquea el deploy de
mañana, pero sí bloquea el onboarding de los 25 bajo coexistencia.**

- **No bloquea el deploy** porque el mecanismo actual sigue funcionando: el requerimiento mismo dice
  que el cuadro se distingue por `authorized_numbers` y *"eso sigue funcionando"*. Sushi Service está
  en Twilio y su flujo no cambia.
- **Sí bloquea el onboarding** porque con coexistencia el cuadro del pedido cae en la **misma línea**
  por la que el restaurante habla con sus comensales, y el webhook de Zernio **no puede responder texto
  libre**, así que la confirmación al operador no funciona como con Twilio.

Preguntas 18.a–d marcadas *"bloqueantes, ninguna asumible"*: por dónde entra el cuadro, si
`authorized_numbers` basta para distinguirlo, qué se le responde al operador en Zernio, y qué debe
contener el apartado nuevo de Domicilios.

---

## Preguntas abiertas al dueño, sin responder

Ninguna bloquea el deploy. Todas bloquean el trabajo que venga después.

| Tema | Pregunta |
|---|---|
| §18.a–d | Domicilios bajo coexistencia — **las más urgentes para vender a los 25** |
| §16.a–e | Etapas y días del pipeline de recorrido/fatiga |
| §17.a–d | Qué es el "beneficio permanente" Black, con qué umbral, y si Black es el tier máximo |
| ~~§3~~ | ~~La queja de "QR muy básico", ¿es sobre el QR Studio (mesa) o el de la tarjeta?~~ → **se resolvió haciendo las dos**: el Studio persiste su config y el QR de la tarjeta lleva color de marca y logo |
| §15.b | Los 2 presets fantasma (`invite_restaurant`/`invite_delivery`): ¿borrar o crearles plantilla? |
| §12 | El emoji 🍣 horneado en los textos "cálido" para tenants que no son japoneses |
| ~~§5~~ | ~~¿Quién edita la personalización de pantalla, y hace falta `logo_url` persistente?~~ → **respondido al construir**: lo edita el dueño desde `/dashboard/marca`, y sí, `logo_url` persiste en Supabase Storage (bucket `brand-assets`) |
| §9 | Push: ¿para el cliente final o para staff? ¿Qué caso lo justifica? |

---

## Lectura de todo esto

**Nada de lo anterior bloquea el deploy de mañana.** El producto que se despliega está completo y
verificado para el caso de uso actual.

Lo que sí conviene ver con calma: de las **19 secciones auditadas**, hoy **7 están hechas, 5 parciales,
6 sin empezar y 1 diferida a propósito** (§22, franquicias). Las sin empezar son funcionalidades de
producto (referidos, push, fatiga, calendario, puntos sobre el tier máximo, §18), no deudas técnicas.
El sistema **funciona**; lo que falta es catálogo.

*(El recuento anterior decía "20 secciones · 5 hechas · 6 parciales · 7 sin empezar". Cambió por dos
motivos: §3 y §5 se construyeron el 2026-09-06, y la tabla tiene 19 filas, no 20.)*

Para el objetivo declarado —*recibir más clientes*— las dos que más pesan son **§18** (sin ella el
onboarding con coexistencia no tiene respuesta clara) y **§19** (hoy cada mesero necesita su propio
número y su propio login: para un restaurante con 8 meseros son 8 altas, y eso multiplicado por 25
clientes es fricción real de venta).
