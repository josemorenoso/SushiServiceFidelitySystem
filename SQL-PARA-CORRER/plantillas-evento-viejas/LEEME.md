# Borrar las plantillas de evento viejas y rehacerlas contra el calendario

**2026-09-10, decisión del dueño.** El texto de las dos plantillas de evento (`evento_imagen`
y `evento_video`) no describía lo que el dueño teclea en el calendario. Se reescribió — una
sola redacción, en `EVENT_INVITE_TEXTS` de `src/constants/template-texts.ts` — y las viejas
salen de circulación.

## Qué tenía de malo el texto viejo

Tres cosas, todas horneadas en un texto que Meta aprueba **literal**:

1. **«vivir una noche especial».** El calendario no filtra por hora y su campo *Tipo* incluye
   promo, activación y aniversario: una promo de mediodía salía invitando a una noche.
2. **Un cierre fijo, «¡Te esperamos con tu familia!», DESPUÉS de `{{5}}`.** `{{5}}` es
   justo el llamado a la acción que el dueño escribe en el formulario, así que el mensaje se
   contradecía solo. Y como el enlace del evento se pega al final de `{{5}}`, el enlace
   quedaba **en la mitad** — mientras el formulario promete que «va al final del mensaje».
3. **La muestra de `{{5}}` era ese mismo cierre**, no una descripción de verdad: la vista
   previa del dueño y el ejemplo que revisa Meta mostraban la frase repetida dos veces.

El texto nuevo deja `{{5}}` como lo último antes del aviso de SALIR, no hornea ningún momento
del día y sirve igual para un restaurante, una barbería o un salón. **La aridad no cambia**
(`{{1}}`..`{{5}}`), así que `calendar.service.ts` manda exactamente lo mismo que ayer.

## Lo que estos scripts NO hacen

**No borran nada en Meta.** Zernio no expone un DELETE de plantillas — el contrato verificado
tiene crear, listar y consultar, y prohíbe inventar rutas (`src/lib/zernio/templates.ts`). El
borrado físico es un clic tuyo en el panel de Zernio / Meta, y es opcional: una plantilla
huérfana no cuesta, no se envía y no estorba. Lo que sí resuelven es que **nada del sistema
vuelva a apuntarlas**, que es el problema real.

## Lo que NO se toca, y por qué

**Los 4 tenants Twilio** (Sushi Service, Don Alirio, Frangal, Demo). Envían eventos hoy con
plantillas aprobadas que además llevan un `{{6}}` que Zernio no usa. Borrarles el puntero les
rompe el calendario sin un solo error a la vista. Por eso los tres scripts filtran por
`messaging_provider = 'zernio'`. **No le quites ese WHERE.**

## Orden

```
0. Desplegá primero el código de este commit.        ← no es opcional, ver abajo
1. 00-VERIFICAR.sql        (solo lectura, guardá la salida)
2. 01-RETIRAR.sql          (una transacción; mirá los conteos antes del COMMIT)
3. 02-VERIFICAR-FINAL.sql  (las tres cosas que tienen que ser verdad)
4. Plantillas → «Crear plantillas» en cada tenant Zernio.
```

**Por qué el paso 0 va primero.** `evento_video` quedó *pending* en Meta. Si Meta la aprueba
después de que el 01 la marque `retired`, el webhook la promovía igual y volvía a escribir el
puntero con el texto viejo: `applyProviderTemplateStatus()` solo miraba `is_current`. Este
commit agrega la guarda que ignora la aprobación tardía de una versión retirada. Con el código
viejo desplegado, el 01 se puede deshacer solo, en silencio, hasta 72 horas después.

## Antes de apretar «Crear plantillas» otra vez

El intento del 09 falló con `Zernio respondió 502: Media upload failed: fetch failed` en
`evento_imagen`. Eso **no es la plantilla**: es que Meta no pudo descargar la imagen de muestra
de `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL`. `evento_video` sí se creó, así que la del video se baja
bien. Abrí la URL de la variable en una pestaña de incógnito: si no muestra la foto, el objeto
no está en el bucket `event-media` o el nombre no coincide. Es el mismo motivo por el que Meta
rechazó `evento_video_sushi_service_barra` en Twilio en su momento (*"Error downloading invalid
media URL"*) — ver `docs/features/calendar.md`.
