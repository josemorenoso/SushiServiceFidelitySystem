# Rehacer las plantillas de WhatsApp de un propietario Zernio (las 13)

**2026-09-10, decisión del dueño.** El alta del 09 creó 12 de 13 plantillas para el primer
cliente Zernio y las 12 están mal: **10 de las 11 de texto llevan 🍣 horneado** y las de evento
invitan a «vivir una noche especial» con un cierre fijo que le pisa el llamado a la acción del
dueño. Ninguna sirve para una barbería, un salón ni un restaurante que no sea de sushi.

## Qué pasó de verdad (para no volver a buscar la variable)

El botón «Crear plantillas» de la pantalla del cliente es del **AIOS**, no del producto. El AIOS
tenía **su propia copia** del catálogo, hecha antes de que el producto arreglara el emoji por
rubro, y la media de muestra de las de evento **escrita a mano** en el código: `via.placeholder.com`
para la imagen (servicio muerto → `502 Media upload failed: fetch failed`) y un MP4 de w3schools para
el video (vivo, por eso pasó). La variable `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL` del Vercel del
producto no la leía nadie en ese flujo.

Desde el AIOS **v1.10.0** el catálogo se regenera desde la fuente del producto, el emoji sale del
tipo de negocio del cliente, y las URLs de muestra salen de `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL` /
`ZERNIO_TEMPLATE_SAMPLE_VIDEO_URL` **en el Vercel del AIOS**.

## El texto nuevo de evento (imagen y video, idéntico)

```
¡Hola {{1}}! 🎉🍽️
_{{2}}_

*{{3}}*
📅 {{4}}

{{5}}

_Responde SALIR para no recibir más mensajes._
```

`{{1}}` nombre · `{{2}}` marca · `{{3}}` título · `{{4}}` fecha · `{{5}}` descripción + enlace. Es
un marco: lo que ponemos nosotros es «¡Hola!». El emoji cambia por rubro (💈 barbería, 💅 salón,
✨ el resto). Vive una sola vez en `EVENT_INVITE_TEXT` de `src/constants/template-texts.ts`.

## Lo que NO se puede hacer

**Borrar en Meta desde el código.** Zernio no expone DELETE. Y tampoco hace falta: el AIOS elige
el primer nombre libre (`bienvenida` está tomado → crea `bienvenida_v2`), así que las viejas quedan
huérfanas sin que nadie las apunte. Borrarlas a mano en el panel de Meta es opcional y **tiene
trampa**: Meta bloquea un nombre borrado durante 30 días, así que si las borrás, no intentes reusar
el nombre base.

**Tocar a los 4 tenants Twilio** (Sushi Service, Don Alirio, Frangal, Demo). Decisión del dueño del
10: se quedan con sus plantillas aprobadas tal cual. Por eso el 00, 01 y 02 filtran por
`messaging_provider = 'zernio'`.

## Orden

```
0. Desplegar el AIOS v1.10.0 y el producto con estos commits.       ← primero, siempre
1. Subir un JPG y un MP4 de muestra a Supabase → Storage → bucket event-media.
   Copiar las dos URLs públicas. Abrirlas en incógnito: tienen que verse.
2. En Vercel DEL AIOS: ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL y ..._VIDEO_URL. Redesplegar.
   (En el Vercel del producto también, con los mismos valores: los usa su propia pantalla.)
3. 03-RESET-AIOS-PASO-4.sql   → Supabase DEL AIOS (poner el business_name del cliente)
4. AIOS → cliente → «Crear plantillas». Salen las 13 como _v2. «Actualizar estado» hasta 13/13.
5. 00 → 01 → 02              → Supabase DEL PRODUCTO (solo si ese tenant llegó a tener
                                punteros o versiones de evento; en un alta nueva no hay nada)
```

**Por qué el paso 0 va primero.** Con el AIOS viejo, el botón reintenta los nombres base y Meta
los rechaza por repetidos. Y en el producto, una versión que se retira con el 01 podía **revivir**
si Meta la aprobaba tarde (`applyProviderTemplateStatus()` solo miraba `is_current`); este commit
agrega la guarda.
