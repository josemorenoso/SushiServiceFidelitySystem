# Decisiones del dueño — QR, sede y mesa (2026-09-06)

> Cerradas por el dueño el 2026-09-06 al final de la sesión "absorción de Sushi Fun + deploy".
> **No se reabren sin él.** Este doc existe para que una sesión nueva no tenga que reconstruir
> el razonamiento desde cero.
>
> Hermanos: `docs/features/multi-sede.md` (la precedencia) · `docs/features/staff-qr-scan.md` (§19) ·
> `docs/features/identidad-visual.md` (el color y el logo del QR).

---

## D-QR-1 · Un QR impreso POR SEDE. No es preferencia: es la única opción que cubre todo

**El razonamiento que lo cierra, del dueño:** *"si todos los primeros escaneos son libres, no se va
a saber de ninguna manera en qué sede están"*.

Un cliente **nuevo** no tiene tarjeta digital, así que **no hay ningún QR de cliente que el mesero
pueda escanear**. La primera visita es obligatoriamente el flujo del cartel (`/check-in`), y ahí el
cartel es la **única** señal de sede que existe: no hay mesero, no hay aparato, no hay nada más.

La alternativa —«que siempre escaneen, aunque sea la primera vez»— se descartó por fricción, y en el
peor momento posible: cuando el cliente todavía no recibió ningún premio.

### Dos consecuencias que ahorran trabajo

1. **NO hace falta el área de alertas** por meseros que registran en la sede equivocada. Con QR por
   sede + el aparato mandando (D-QR-2), las dos señales que deciden son **físicas**: dónde está el
   cartel y dónde está la tablet. Ninguna depende de que una persona se acuerde.
2. **NO se construye el selector de sede para el mesero.** Si un mesero rotativo usa la tablet **de
   la sede donde está**, esa tablet ya sabe dónde está. El selector sería fricción para un problema
   que el hardware ya resolvió.

### Lo que "QR por sede" significa en la práctica

La sede se resuelve del **host**, nunca de un parámetro: no existe ni va a existir `?sede=`. Así que
el QR de una sede apunta a **su subdominio**: `laureles.clubX.constelarys.com/check-in`.

**Y eso hoy es casi gratis.** Verificado el 2026-09-06 al mover Sushi Fun: el wildcard
`*.constelarys.com` ya está en el proyecto de Vercel, así que **no se toca DNS ni se espera
propagación**. Solo se agrega el dominio al proyecto. Segundos.

**No se reimprime nada.** La sede que ya existe conserva su cartel para siempre (`tenants.domain` se
queda y la sede principal lo repite — `docs/features/multi-sede.md` §3.3). Solo la sede *nueva*
imprime el suyo, que es señalética que iba a necesitar de todos modos.

---

## D-QR-2 · Entre el mesero y el aparato, manda el APARATO

Hoy `resolveVisitLocation()` (`src/lib/location-resolver.ts:205`) pone `staffLocationId` por encima
de `deviceLocationId`. Con un mesero rotativo eso atribuye mal: Juan es de Envigado, hace un turno en
Laureles con la tablet de Laureles, y la visita se registra en **Envigado**.

**La tablet del mostrador siempre está donde está; la persona se mueve.** La precedencia actual le
cree a la señal menos confiable de las dos. Se invierte: aparato primero, mesero como respaldo, host
último.

Falta además la **bandera `rotativo`** en `staff_users`: hoy §19 filtra el selector por la sede del
aparato, así que Juan **ni siquiera aparece** en la lista de Laureles. Con la bandera, un mesero
rotativo sale en el selector de todas las sedes activas de su marca, y `location_id` pasa a
significar "su sede de base".

⚠️ **D11 no se toca.** La FK compuesta `(location_id, tenant_id)`, el trigger de la 00044 y el índice
parcial de la 00046 se quedan: el mesero sigue teniendo UNA sede de base. La bandera **agrega
alcance, no reemplaza la llave**. La 00046 ya está aplicada en producción y cambiar la llave ahora
es caro.

⚠️ **El desacuerdo hoy es invisible.** El comentario de `check-in/route.ts:706` dice que
`resolveVisitLocation` marca `location_conflict` cuando el mesero es de otra sede — **es falso**:
`conflict` solo compara el claim `loc` del QR del cliente contra la sede resuelta, nunca mesero
contra aparato. Hay que corregir ese comentario y decidir dónde queda registrado el desacuerdo.

---

## D-QR-3 · El QR Studio: SVG sí, diseños en pausa, mesas fuera

`/dashboard/qr` (583 líneas) arma pósters en un `<canvas>` y los baja como **PNG a 300 DPI**.

**Veredicto del dueño:** *"la gente no va a imprimir con los diseños, es muy básico"*. Y el rediseño
del QR **queda fuera de alcance por ahora** (decisión del 2026-09-06).

| | Decisión |
|---|---|
| **SVG** | **Se agrega.** Es lo único que el dueño necesita del Studio: un QR que no pierda calidad en pósters, pancartas o piezas chicas. La librería `qrcode` que ya está en el proyecto lo hace con `toString(url, { type: 'svg' })` — nada nuevo que instalar |
| **PNG** | **Se queda.** No todo el mundo sabe qué hacer con un SVG |
| **Diseños de póster** (temas, tamaños, textos, acento) | **Se ocultan, NO se borran.** Ni el código ni su config en `tenants.config.qr_studio`. Es una pausa, no una eliminación |
| **QR por mesa** | **Se va del QR.** Ver D-QR-4 |
| **Rediseño visual del QR** | **Fuera de alcance.** El dueño lo definirá cuando le toque |

---

## D-QR-4 · La mesa la elige el MESERO al escanear, no el QR

Hoy el QR por mesa codifica `?mesa=N`, lo lee `CheckInForm.tsx:160` y termina en
`visits.table_number` (migración **00009**). O sea: **el dato existe y se está guardando**.

**Decisión del dueño (2026-09-06):** la mesa sale del QR y pasa al flujo del mesero. Cuando el mesero
escanea al cliente, elige la mesa ahí.

Esto **cierra el hueco** que abría quitar el QR por mesa: sin esto, `visits.table_number` dejaba de
llenarse para siempre y nadie se enteraba.

**Cómo tiene que quedar:**

- El campo de mesa vive en la pantalla del mesero, junto al selector de mesero (`/mesero/confirm`).
- **Es OPCIONAL y nunca bloquea el check-in.** Un check-in que no se completa cuesta un cliente; una
  mesa sin anotar cuesta una estadística. No son comparables.
- Entrada numérica rápida (teclado numérico), no una lista larga: el número de mesas cambia y el
  mesero lo sabe de memoria.
- **En el autoservicio (cliente escaneando el cartel) la mesa ya no se conoce, y está bien.** La mesa
  solo se sabe cuando hay un mesero de por medio.
- **`visits.table_number` y la migración 00009 NO se borran.** El histórico vive ahí.

---

## Aparcado: conectar la cuenta de Meta

El dueño lo pidió el 2026-09-06 y **queda fuera de alcance hasta que él resuelva el consentimiento.**
No es una postergación técnica.

Son dos cosas distintas que conviene no mezclar:

- **El Pixel** en la página de check-in — mide conversiones del navegador. Por tenant, cabe en
  `tenants.config.integrations`, que la 00047 ya reservó para esto.
- **Custom Audiences / Conversions API** — subirle a Meta la lista de teléfonos de los clientes. Es
  lo que de verdad se pidió ("usar estos datos en campaña").

🔴 **El freno no es técnico.** Subirle los teléfonos de los clientes a Meta es una **transferencia de
datos personales a un tercero**, y la Ley 1581 exige consentimiento **para esa finalidad**. El opt-in
actual es "recibir WhatsApp del restaurante": no cubre publicidad en Meta. Y el responsable del dato
no es Constelarys, es **cada restaurante**. Venderle esto a 25 marcas sin resolverlo los expone.

**Antes de escribir una línea, el dueño decide cómo se pide ese consentimiento.**

---

## Orden sugerido

| | Qué | Estado |
|---|---|---|
| 1 | **QR en SVG** + diseños en pausa + mesa fuera del QR + mesa en el escaneo (D-QR-3 y D-QR-4) | Listo para lanzar |
| 2 | **Bandera `rotativo`** + el aparato manda (D-QR-2) | Listo para lanzar |
| 3 | **Subdominio + QR por sede** al dar de alta una sede (D-QR-1) | Es F8, wizard del AIOS |
| 4 | Rediseño visual del QR | Espera al dueño |
| 5 | Meta | Bloqueado por el consentimiento |
