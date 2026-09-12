# Pendientes — Plantillas de WhatsApp: diagnóstico y rediseño

> **Fecha:** 2026-09-11 · **Origen:** el dueño, textual: *"me está causando mucha fricción el temita de las
> plantillas, me parece que es un sistema altamente mediocre aunque le hayamos metido esfuerzo"*.
> **Estado:** DIAGNÓSTICO CERRADO, RE-DISEÑO SIN DECIDIR. Nada de lo de abajo está construido.
> **Leído para escribirlo:** `template-catalog.ts`, `template-texts.ts`, `template.service.ts`,
> `twilio-catalog.service.ts`, las tres pantallas (`TemplateCatalogEditor`, `TwilioTemplateManager` +
> `StandardCatalogGaps`, `dashboard/settings` § Plantillas), `whatsapp.service.ts`, `check-in/route.ts`,
> el webhook de Zernio, los pasos 4 y 5 del AIOS (`provisioning.ts`), los scripts de Twilio y los cuatro docs.
> Todo lo que dice "verificado" se leyó en el código, no se supuso.

## 0. El diagnóstico en una frase

El sistema no tiene un problema de textos ni de pantallas. Tiene **cuatro sistemas de plantillas que se
ignoran entre sí** (AIOS paso 4, pantalla Zernio, pantalla Twilio, Ajustes) y cada parche agregó uno más en
vez de fundirlos. La fricción es la suma de esas costuras. La medida: plantillas aparecen en **8 de los
últimos 40 bloques del CHANGELOG** y en 200 líneas de ese archivo.

## 1. Las nueve fallas estructurales

### 1.1 Dos catálogos, dos creadores, dos rastreadores de aprobación, cero registro compartido
- El AIOS crea las 13 en el alta (paso 4) con **su copia** de los textos
  (`Level 2.0/aios-constelarys/src/lib/zernio/templates-catalog.ts`), sondea la aprobación **a mano**
  («Actualizar estado») y en el paso 5 carga los punteros **solo de las aprobadas en ese momento**. Las que
  aprueben después no se cargan nunca salvo que alguien vuelva a apretar el paso 5, y nadie lo dice.
- El producto tiene `template_versions`, su pantalla y un webhook `whatsapp.template.status_updated` que
  descarta todo lo creado por el AIOS: `applyProviderTemplateStatus()` devuelve
  `handled: false, "sin versión registrada"`.
- **Verificado:** todo tenant Zernio dado de alta por el AIOS abre Mensajes y ve 13 filas «Activo, pero se
  configuró fuera de este panel y no tenemos su texto» (`adoptedRef`). Su primera edición nace `_v2`.
- El incidente del 🍣 (2026-09-09) no fue un descuido: fue el síntoma de la copia.

### 1.2 El catálogo de 13 no es el conjunto de mensajes que el código manda
El código consume **15 claves** `*_template_sid`. Dos no existen en el catálogo y **ninguna pantalla Zernio
puede crearlas**:

| Clave | Quién la usa | Qué pasa si falta |
|---|---|---|
| `tier_unlocked_template_sid` | `check-in/route.ts:995`, `delivery.service.ts:431`, `check-in-override` | Al cruzar un nivel se manda ESTA **en vez de** «puntos sumados» (cadena `else if`). Si falta, el mejor momento del cliente es **silencio total**: ni nivel, ni puntos |
| `reward_reminder_template_sid` | `cron/reward-reminder` | El cron sale sin hacer nada |

Además `reactivation_with_reward_template_sid` y el legacy `reactivation_template_sid` siguen en Ajustes y en
`campaigns/page.tsx` aunque el catálogo los retiró.

### 1.3 Tres pantallas para una sola cosa, y la asignación separada de la creación
- **Plantillas (Zernio)**: catálogo de 13, editor tipo documento. Bien, pero sola.
- **Plantillas (Twilio)**: lista cruda de la Content API con SID a la vista + formulario libre (nombre,
  categoría, muestras) + tarjeta «Del set estándar te faltan N». Las 2 de evento no se pueden crear ahí.
- **Ajustes › Plantillas WhatsApp**: 13 dropdowns para pegar el puntero. En Twilio hay que crear en un lado,
  esperar 24-72 h y **acordarse** de asignar en el otro.
- ~~**Verificado:** en un tenant Zernio esa sección consulta `/api/dashboard/templates` (Twilio), recibe `[]`~~
  **Resuelto el 2026-09-12:** `/api/dashboard/templates` es consciente del proveedor y a un tenant Zernio le
  devuelve su WABA con la misma forma (`sid` = nombre). Ajustes › Plantillas, las campañas manuales y las
  burbujas de riesgo ya tienen qué elegir en Zernio. Lo que sigue en pie es el resto de esta sección: tres
  pantallas para una sola cosa.

### 1.4 «`promoteVersion()` es el único escritor del puntero» es verdad en un archivo, no en el sistema
Escriben `admin_settings.*_template_sid`: `promoteVersion()`, `fillEmptyPointer()`,
`aios_set_template_settings()` (paso 5), el Guardar de Ajustes (`saveSetting`), y el SQL que se pega a mano
con el `HX…` de eventos. **Cinco caminos, cinco reglas.** El invariante documentado en
`whatsapp-templates.md` promete una garantía que el sistema no tiene.

### 1.5 Cada tenant paga 13 aprobaciones y el diseño lo amplifica en vez de reducirlo
- `points_earned_far` / `points_earned_near`: el mismo mensaje con una línea final distinta.
- `reward_safe` / `mystery_box_result` / `golden_box_result`: «tu premio: X, muéstralo al mesero» con una
  cláusula distinta.
- `reactivation_no_reward` / `reactivation_aggressive`: difieren solo en tono.
- Las 2 de evento sí tienen que ser 2 (Meta congela el formato del header).

| Catálogo | Aprobaciones por tenant | Para 25 marcas |
|---|---|---|
| Hoy | 13 | 325 |
| Propuesto (variación dentro de una variable) | 8 | 200 |

Propuesta de 8: bienvenida · visita (puntos + «siguiente paso» en `{{4}}`) · premio (con «cómo lo ganaste» en
variable) · cumpleaños · reactivación (intensidad en variable) · campaña (el párrafo de CTA en variable) ·
evento imagen · evento video. Ojo con la regla de Meta de 3 palabras fijas por variable + 1 (el test
`template-catalog.test.ts` ya la mide).

### 1.6 Doce de trece son MARKETING, y eso cuesta plata y cupo
- «Sumaste 52 puntos, tu saldo es 127» después de una visita es un **recibo**, no una promo.
- MARKETING obliga la línea SALIR, entra en los topes de frecuencia por usuario de Meta y cuesta **varias
  veces más** que UTILITY por mensaje.
- **Contradicción interna verificada:** `TwilioTemplateManager.tsx:471` le dice al dueño «UTILITY es la
  categoría correcta para check-in, confirmación de visita y recompensas», y el catálogo hace lo contrario.
- Para que Meta lo acepte como UTILITY hay que quitar las frases promocionales del cuerpo («Sigue
  visitándonos y descubre lo que te espera», «Mystery Box con premios todavía mejores»). Meta puede
  recategorizar; se prueba con UNA marca. Candidatas: bienvenida (ya lo es), puntos sumados ×2, premio ×3,
  recordatorio de premio. Siguen MARKETING: cumpleaños, reactivación, campañas, eventos.

### 1.7 El rechazo es un callejón sin salida
- El motivo llega como código crudo (`INVALID_FORMAT`) y se muestra tal cual; nadie lo traduce a una acción.
- El dueño se entera **solo si abre la pantalla** (documentado como «lo que falta» desde el 08-30).
- En Twilio una rechazada **no se reintenta**: se crea con otro nombre. La pantalla no lo dice.
- La regla de 3 palabras por variable se aprendió con un rechazo en producción (2026-09-11, Sushi Fun).
- **Hoy mismo** el dueño crea las de evento a mano en Twilio para 3 marcas, con
  `scripts/verificar-plantillas-evento.mjs` para revisarlas y SQL para pegar el SID, porque la pantalla no
  crea plantillas con media. Ahí está parado.

### 1.8 Lo que no salió es invisible
- Una plantilla **PAUSED** por Meta solo se anota en el log; el puntero sigue apuntándole y cada envío falla
  en silencio (`applyProviderTemplateStatus()`, rama final).
- Un puntero inválido en Twilio da 21655 en el log del servidor y `message_logs.status='failed'`. Solo
  `TwilioMessagesPanel` lo muestra, y solo para Twilio. Para Zernio, nada.
- **Verificado:** `sendCheckinTemplate()` devuelve `reason: 'no_template_configured'` y **ningún componente
  `.tsx` lo consume**: el mesero no se entera de que el cliente no recibió nada.

### 1.9 Ruido acumulado
- Tres validadores con reglas distintas: `validateTemplateBody()` (catálogo), el inline de
  `api/dashboard/templates/route.ts` POST (no exige SALIR ni el juego de variables) y el inline de
  `TwilioTemplateManager`.
- Dos esquemas de nombre: Twilio `bienvenida_<marca>`, Zernio `bienvenida` → `bienvenida_v2`.
- Cuatro docs: `PLANTILLAS.md` (731 líneas), `whatsapp-templates.md` (386), `flujo-plantillas-recompensas-
  campanas.md` (317, describe un contrato de 3 variables **que ya no existe**, v0.23) y el LEEME de
  `SQL-PARA-CORRER/plantillas-evento-viejas/`.

## 2. Dónde se cae la gente, en orden

**Alta Zernio:** paso 3 → paso 4 (no arranca sin `ZERNIO_TEMPLATE_SAMPLE_{IMAGE,VIDEO}_URL` en el Vercel del
AIOS) → esperar 1-3 días → alguien aprieta «Actualizar estado» → paso 5 carga solo las aprobadas → las
pendientes quedan huérfanas → el producto muestra 13 «sin texto» → el dueño edita → nace `_v2` → vuelve a
esperar. **Nivel desbloqueado nunca existe.**

**Twilio:** Plantillas → crear (libre o «huecos») → esperar → Ajustes → asignar (o no) → para eventos:
script + bucket + script de verificación + SQL a mano.

## 3. Lo que se propone, en orden (SIN DECIDIR)

| # | Qué | Efecto | Costo |
|---|---|---|---|
| 1 | **Un solo libro mayor.** Sacar la creación del AIOS: el paso 4 llama al producto (con `AIOS_ADMIN_PROVISION_SECRET`, que ya existe) y el producto crea las 13 con `submitSuggestedTemplate()`. Se muere la copia, el sondeo manual, el paso 5 y el estado «sin texto». El webhook conoce todas | Quita 1.1 y 1.4 | Un endpoint nuevo + borrar código del AIOS |
| 2 | **Cerrar el hueco catálogo ↔ código.** Meter `tier_unlocked` y `reward_reminder` al catálogo, **o** fundir `tier_unlocked` en `points_earned_near`. Retirar las claves legacy de Ajustes y de `campaigns/page.tsx` | Quita 1.2 | Decisión + 2 textos |
| 3 | **Una sola pantalla Mensajes para los dos proveedores.** Un renglón por mensaje, un botón, el puntero se asigna solo al aprobar (Zernio ya lo hace; `fillEmptyPointer` ya lo hace). Desaparecen Ajustes › Plantillas y el formulario libre de Twilio. Media de evento creable desde ahí | Quita 1.3 y el camino manual de 1.7 | Mediano: unificar `twilio-catalog.service` con `template.service` |
| 4 | **Reducir a 8** con la variación en variable. **Ahora es el momento barato:** ningún tenant Zernio ha mandado un mensaje real (0.IOTA) | Quita 1.5 | Cambia el contrato de variables: toca emisores y `TEMPLATE_CATALOG`; re-aprobar en los Zernio existentes |
| 5 | **Probar UTILITY** en bienvenida, puntos sumados, premios y recordatorio, con UNA marca, sin frases promocionales | Baja costo por mensaje y saca esos envíos del tope de marketing | Una tarde + esperar a Meta |
| 6 | **Rechazos y pausas con salida:** traducir los motivos frecuentes a una acción, abrir el editor con el texto rechazado, avisar al dueño (correo o WhatsApp), y tratar PAUSED como «dejar de enviar este mensaje y avisar» | Quita 1.7 y la mitad de 1.8 | Pequeño |
| 7 | **Mostrar lo que no salió:** franja en Mensajes con los fallos por plantilla desde `message_logs.error_code`, y el escáner le dice al mesero «este cliente no recibió WhatsApp» | Quita 1.8 | Pequeño |
| 8 | Borrar `flujo-plantillas-recompensas-campanas.md` y fundir los otros tres docs en uno | Quita 1.9 | Solo docs |

**Los puntos 1, 2 y 3 quitan la fricción. 4 y 5 bajan el costo.** El resto es pulido.

## 4. Lo que NO cambia con nada de esto
- Meta sigue tardando 24-72 h por plantilla. Ningún rediseño lo evita; solo se puede pedir menos veces (4).
- Decisión 3 del dueño (el dueño edita, con advertencia y registro) y decisión 6 (los 4 tenants Twilio no se
  re-someten) se respetan: 3 unifica la PANTALLA, no re-crea lo aprobado.
- El contrato de `{{n}}` sigue siendo fijo por plantilla; 4 lo cambia UNA vez, por decisión, no por accidente.
