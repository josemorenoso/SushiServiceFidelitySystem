# Prompt — AIOS: la jerarquía, cada cosa en su lugar (2026-10-15)

> Escrito por el comandante (Opus 5.5) con lo que el dueño vivió la noche del 14-10 dejando lista a **Tepuy** (dos sedes,
> una marca, un número). **Modelo: Opus.** Una sesión (si la auditoría muestra que son dos, dilo y para después de la
> auditoría). Se abre en la raíz del repo del producto; el código está en el repo anidado `Level 2.0/aios-constelarys`.

---

Eres una sesión de Claude Code. Trabajas en el **AIOS** (`Level 2.0/aios-constelarys`, repo git propio, Next.js, sin
suite de tests). El tablero de sesiones vive en el `ESTADO.md` del producto (raíz).

## 0. Lo que dijo el dueño (textual, 2026-10-14) y lo que pasó

> *«Necesito que me auditen el tema de jerarquía visual en el AIOS porque me parece que no está bien hecho, me parece
> desorganizado, como si se hubiera armado en la marcha y todo quedó en diferentes lugares sin ningún sentido. ¿Por qué
> para activar un celular de toda la marca debo entrar en Tepuy Envigado y luego, de paso, cambiar al final de la página
> el proveedor? O sea, si nunca lo cambio se queda en que falta por instalar. Cosas que no tienen sentido.»*

Lo que pasó, verificado por el comandante:

1. Tepuy conectó su WhatsApp el 13-10 con el link del AIOS (el wizard del **propietario**, paso 3 «Conectar WhatsApp»:
   «Hecho», cuenta `6ace8dcaaa1566485dd2526e`). Pero en el **producto** la marca seguía como Twilio, y su pantalla de
   Plantillas decía «Este negocio no tiene su cuenta de WhatsApp (Twilio) configurada». Faltaba el paso **«4. WhatsApp»
   de una SEDE** (`src/components/sites/SiteProvisioningWizard.tsx:255-330`), con un botón que dice literalmente
   «Activar messaging_provider = zernio» y que llama a `aios_activate_whatsapp()` del producto
   (`src/lib/actions/provisioning.ts:~1990-2060`, `src/lib/product-db.ts:1033`). El dueño lo apretó en la sede Envigado
   y recién ahí la marca quedó en Zernio y pudo mandar sus 16 plantillas.
2. **El número, la cuenta de Zernio y el proveedor son de la MARCA** (un tenant del producto), no de una sede: la propia
   pantalla lo admite («Ya está activado, es la misma marca»; la tarjeta Sistema dice «Domicilios por WhatsApp: es de la
   marca, no de esta sede»). Pero viven dentro de la página de una sede, al final.
3. La tarjeta **Sistema** de la sede decía «Mensajes disponibles 180 · cupo por defecto» mientras el paso 3 del
   propietario, leyendo a Meta en vivo, decía «hasta 2.000 clientes distintos al día». Las dos cosas eran ciertas (el
   producto usa 250 hasta que su sondeo de salud de línea corre, cada hora), pero la pantalla no lo explica y parece
   un error.
4. En pantalla hay términos de programador: «messaging_provider = zernio», «tenant», «proyecto B»,
   `idx_tenants_zernio_account_id`. El usuario del AIOS es el dueño de Cada1, que no es programador.

**Lo que el dueño decidió el 14-10 y no se reabre aquí:** una marca tiene **un solo número de WhatsApp** para todas sus
sedes (el número por sede quedó archivado: `docs/superpowers/specs/2026-10-14-numero-por-sede-design.md`); las sedes
comparten siempre clientes, puntos y premios. «Franquicia» en el AIOS (D5-d) **sigue sin decidir**: no cambies lo que
hace `site_model`.

## 1. Antes de tocar nada

1. Lee el `ESTADO.md` del producto entero. Anota tu fila en §2 («AIOS: la jerarquía», tu modelo, archivos). Commitea SOLO
   `ESTADO.md` (en el repo del producto). Si en §2 hay una fila viva que toque el AIOS, no arranques y avisa.
2. Lee en el AIOS: `README.md`, `CHANGELOG.md` (las últimas 6 versiones), `docs/DECISION-MULTISEDE-2026-09-07.md`,
   `docs/features/whatsapp-connect-link.md` y `docs/zernio-api-contract.md`. En el producto: `docs/features/multi-sede.md`
   §2.bis y la sección «Qué es de la marca y qué es de cada sede, pantalla por pantalla» (la auditoría del panel del
   cliente: la tuya es la del AIOS, con el mismo espíritu).
3. Antes de leer archivos sueltos del AIOS, su grafo:
   `cd "Level 2.0/aios-constelarys" && /c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"`.

## 2. Qué hacer

### 2.1 Primero, la auditoría (por escrito, antes de mover nada)

Recorre TODAS las pantallas del AIOS (`src/app/(app)/**`): la lista de clientes, el detalle de un propietario (y sus
secciones: datos, WhatsApp, sedes, pagos, zona de peligro…), el detalle de una sede (wizard de aprovisionamiento,
Sistema, usuario del panel, condición, checklist manual…), la importación y lo que haya. Para cada tarjeta, paso o botón,
una fila en una tabla nueva, `Level 2.0/aios-constelarys/docs/features/jerarquia.md`:

| Pantalla · tarjeta / paso | De quién es de verdad (propietario · marca · sede) | Dónde vive hoy | Qué está mal (lugar, estado que miente, duplicado, jerga) | Qué propones |

**Los tres niveles**, para que la tabla tenga una sola vara:
- **Propietario** = el cliente de Cada1 que paga (la empresa o la persona): sus datos, su billetera y pagos, cuántas
  marcas tiene.
- **Marca** = un tenant del producto (un slug, una tarjeta, un panel): **su WhatsApp** (número, cuenta de Zernio,
  proveedor activado en el producto, plantillas, lo que falta en Meta, el cupo), domicilios por WhatsApp, el usuario del
  panel, el dominio raíz, y la lista de sus sedes.
- **Sede** = un local: subdominio, dirección y geocerca, su condición, y lo que el producto ya trata por sede.

Si hoy el AIOS no tiene una pantalla de MARCA (la marca se deduce de las sedes que comparten `tenant_slug`), dilo en la
auditoría y propón cómo darle una **sin tabla nueva** si se puede (agrupando por `tenant_slug`). Una migración del AIOS
solo si la auditoría demuestra que hace falta, y dilo antes de escribirla.

### 2.2 Después, reordenar (lo mínimo que deja cada cosa en su lugar)

1. **El WhatsApp de la marca, en UN solo lugar y en orden:** conectar (el link que ya existe) → **activarlo en el
   producto** → plantillas → lo que falta en Meta (pago, nombre visible, verificación). Cada paso con su estado de
   verdad. **Activar en el producto** deja de estar al final de la página de una sede: es un paso de la marca, justo
   después de «conectado», con un texto que diga qué hace («Desde aquí el panel de {marca} manda por este número») y un
   estado imposible de pasar por alto mientras falte («Conectado en Meta, falta activarlo en el panel de la marca»).
   Ese pendiente también aparece en la lista de clientes. **No se activa solo**: lo aprieta el operador (activar puede
   hacer salir mensajes en cuanto Meta apruebe las plantillas). La regla de una marca con varias sedes no cambia: se
   activa UNA vez, para toda la marca.
2. **Plantillas: el AIOS ya no las crea en este flujo.** El paso dice que se mandan desde el panel de la marca
   (Plantillas → «Enviar los N juntos a Meta», que es el único libro: la copia del AIOS no tiene las tres del 11-10) y
   enlaza allá. Decide si el botón viejo del AIOS se retira o queda oculto, y dilo. Que el AIOS se lo pida al producto por
   API (B7 completo) NO es de esta sesión: anótalo.
3. **El cupo dicho una sola vez y sin contradicción:** lo que Meta permite (leído en vivo, como el paso 3) y lo que el
   producto usa hoy, con la razón si difieren («el panel usa 250 hasta su próximo sondeo, cada hora»).
4. **Sin jerga:** ningún `messaging_provider`, `tenant`, «proyecto B», nombre de índice ni de función en pantalla. Eso va
   a un detalle plegado «para soporte» si hace falta. Todo de **tú** (incluida `/conexion/whatsapp`, que sigue en vos).
5. **La página de una sede** queda con lo de la sede, y un enlace claro «WhatsApp y sistema de la marca {marca}» que
   lleva al lugar de la marca. Una marca de una sola sede no puede quedar peor que hoy: menos clics o los mismos.
6. **Nada cambia en el producto** salvo que sea imprescindible: las funciones `aios_*` del producto (`aios_activate_whatsapp()`,
   `aios_attach_zernio_account()`…) se llaman igual. Si de verdad necesitas algo del producto, para y explícalo.

## 3. Reglas

- Los números y las cuentas son del cliente: nada de llamadas que escriban en Zernio, Meta o el producto mientras
  trabajas. Solo lectura para probar. Ningún servicio externo se dispara sin que el dueño sepa.
- Los secretos no se imprimen ni se escriben en docs.
- Las rutas de Zernio salen de `docs/zernio-api-contract.md`: no se inventan.
- Git: solo tus archivos, por nombre, en el repo del AIOS; tu fila en el `ESTADO.md` del producto. Nunca `git add -A`, ni
  cambiar de rama, ni `stash`, ni `reset --hard`. **Sin push** (el AIOS lo despliega Vercel al pushear: es del dueño).

## 4. Verificación y cierre

1. En el AIOS: `npx tsc --noEmit` · `npm run lint` · `npm run build` limpios (o los mismos errores de la base, dichos).
2. **Una descripción de cada pantalla reordenada**, con Tepuy como caso (propietario Tepuy, marca `clubtepuy`, sedes
   Envigado y Laureles, WhatsApp conectado y ya activado el 14-10 desde Envigado, plantillas mandadas desde el producto):
   qué ve el dueño en la lista, en el propietario, en la marca y en una sede, y cuántos clics le toma activar el WhatsApp
   de una marca nueva antes y después.
3. Docs: `docs/features/jerarquia.md` (la auditoría y lo hecho), `CHANGELOG.md` del AIOS (versión nueva, ≤ 15 líneas),
   `README.md` si cambia algo de lo que promete. En el producto: tu fila fuera del `ESTADO.md` y, en §3 0.AIOS, una línea
   con lo hecho y la versión (sin pushear); lo que quede para después, a `docs/PENDIENTES.md` del producto.
4. Commits por nombre en cada repo. Grafo del AIOS:
   `cd "Level 2.0/aios-constelarys" && /c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify update .`

## 5. Tu respuesta final

Hashes (AIOS y producto), versión del AIOS, archivos. La tabla de la auditoría resumida (cuántas cosas estaban en el
nivel equivocado y cuáles moviste). Por cada punto del §2.2: qué hiciste, archivo y línea. tsc, lint y build. Lo que
decidiste que no estaba aquí, lo que no pudiste hacer, y lo que dejaste anotado (B7, D5-d…).
