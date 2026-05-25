# Configuración de Plantillas WhatsApp — Sushi Service

> Documento de referencia para crear y configurar plantillas en Twilio Content API.
> Aplica a cualquier instancia del sistema (clone-por-restaurante).
> Reemplaza `[Restaurante]` por el nombre del negocio en cada caso.

---

## Tipos de plantilla en este sistema

| Tipo Twilio | Uso | Cómo se crea | Assigned en |
|---|---|---|---|
| `twilio/text` | Comunicaciones operativas (bienvenida, premios, cumpleaños, reactivación, campañas) | Dashboard → Plantillas → formulario | `admin_settings` vía Dashboard → Ajustes |
| `twilio/media` | Invitaciones a eventos del calendario con imagen o video | `scripts/twilio-create-media-templates.mjs` (una sola vez) | `admin_settings` directo en Supabase: `event_template_image_sid` / `event_template_video_sid` |

Las plantillas `twilio/media` **no aparecen** en el formulario de creación de Dashboard → Plantillas porque su estructura es fija y se crea mediante el script de setup. El calendario las usa internamente — el admin solo sube el archivo al crear el evento.

---

## Tabla de Variables por Plantilla

Esta tabla es la verdad única del sistema. El backend envía exactamente estas variables para cada slot.

| Slot en Settings | `{{1}}` | `{{2}}` | `{{3}}` | `{{4}}` |
|---|---|---|---|---|
| **Bienvenida** | Nombre | Roadmap | — | — |
| **Ganó premio** | Nombre | # Visita | Premio ganado | Roadmap |
| **Cerca de premio** (falta 1) | Nombre | # Visita | Próximo premio | Roadmap |
| **Lejos de premio** (faltan 2+) | Nombre | # Visita | Próximo premio | Roadmap |
| **Cumpleaños** | Nombre | Roadmap | — | — |
| **Reactivación sin regalo** | Nombre | Roadmap | — | — |
| **Reactivación con regalo** | Nombre | Premio fijo | Roadmap | — |
| **Campañas manuales** | Nombre | # Visita | Próximo premio | — |

Las plantillas de media tienen 6 variables. Las columnas `{{5}}` y `{{6}}` solo aplican a estas dos:

| Key en admin_settings | `{{1}}` | `{{2}}` | `{{3}}` | `{{4}}` | `{{5}}` | `{{6}}` |
|---|---|---|---|---|---|---|
| **event_template_image_sid** | Nombre | Restaurante | Título evento | Fecha del evento | Descripción / CTA | URL imagen (JPG/PNG) |
| **event_template_video_sid** | Nombre | Restaurante | Título evento | Fecha del evento | Descripción / CTA | URL video (MP4) |

> **Por qué `{{6}}` es la URL del archivo:** Meta aprueba la *estructura* de la plantilla (`HEADER: media` + `BODY: texto con variables`), no el archivo en sí. Al momento de enviar, el backend pasa la URL de la imagen/video como `{{6}}` en `contentVariables`. Esto significa que una sola plantilla aprobada sirve para todos los festivales y promos futuros — solo cambia la imagen.

### Qué es el Roadmap

El roadmap es un bloque de texto generado automáticamente por el backend según las visitas del cliente:

```
🎯 Siguiente premio: Visita #7 → Postre del chef
📋 Después:
  #10 → 15% en tu cuenta
  #15 → Plato principal gratis
  #20 → Cena para 2
```

Si el cliente ya completó todos los milestones: `🌟 ¡Sigue acumulando visitas para más premios!`

---

## Reglas de Meta (WhatsApp)

- Variables deben ser **secuenciales**: si usas `{{3}}` debes tener `{{1}}` y `{{2}}`.
- Sin `{{3}}` solo puedes usar `{{1}}` y `{{2}}`.
- Máximo **1024 caracteres** por variable.
- Sin URLs acortadas, sin urgencia falsa, sin mayúsculas excesivas.
- Tiempo de aprobación: **24 a 72 horas**.

---

## Plantilla 1 — Bienvenida

**Slot:** `welcome_template_sid`
**Categoría Twilio:** `UTILITY`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Roadmap
**Cuándo se envía:** Primer registro del cliente (QR o domicilio)

```
¡Hola {{1}}! 🎉🍣

Bienvenid@ a la familia de *Restaurante*, nos alegra tenerte aquí

Atent@, en cada visita tendrás un premio o te acercarás a uno 👇

{{2}}

Esperamos verte de regreso pronto ☺️

_— El equipo de (Restaurante)_
```

**Samples para aprobación:**
- `{{1}}` → `María`
- `{{2}}` → `🎯 Siguiente premio: Visita #3 → Bebida gratis\n📋 Después:\n  #5 → 10% descuento\n  #7 → Postre del chef`

---

## Plantilla 2 — Ganó Premio

**Slot:** `reward_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=# Visita · `{{3}}`=Premio ganado · `{{4}}`=Roadmap
**Cuándo se envía:** La visita del cliente coincide exactamente con un milestone de recompensa

```
¡Hola {{1}}! ♥️🍣

Hoy es tu visita numero *{{2}}*, nos alegra que hayas vuelto

Tienes disponible *{{3}}*, muestrale *este mensaje* al mesero para redimir hoy tu recompensa 🎁

{{4}}

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Camila`
- `{{2}}` → `5`
- `{{3}}` → `Bebida gratis`
- `{{4}}` → `🎯 Siguiente premio: Visita #7 → Postre del chef\n📋 Después:\n  #10 → 15% en tu cuenta`

---

## Plantilla 3 — Cerca de Premio (falta 1 visita)

**Slot:** `welcome_back_near_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=# Visita · `{{3}}`=Próximo premio · `{{4}}`=Roadmap
**Cuándo se envía:** Al cliente le falta exactamente 1 visita para ganar su próximo premio

```
¡Hola {{1}}! 🔥🍣

Hoy es tu visita numero *{{2}}*, nos alegra que hayas vuelto

Estás a *una sola visita* de ganar *{{3}}* — la próxima es tuya 👊

{{4}}

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Juan`
- `{{2}}` → `6`
- `{{3}}` → `Postre del chef`
- `{{4}}` → `🎯 Siguiente premio: Visita #7 → Postre del chef\n📋 Después:\n  #10 → 15% en tu cuenta`

---

## Plantilla 4 — Lejos de Premio (faltan 2+ visitas)

**Slot:** `welcome_back_far_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=# Visita · `{{3}}`=Próximo premio · `{{4}}`=Roadmap
**Cuándo se envía:** Al cliente le faltan 2 o más visitas para su próximo premio

```
¡Hola {{1}}! 👋🍣

Hoy es tu visita numero *{{2}}*, nos alegra que hayas vuelto

Tu próximo premio: *{{3}}* — cada visita cuenta 🎯

{{4}}

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Luis`
- `{{2}}` → `3`
- `{{3}}` → `Bebida gratis`
- `{{4}}` → `🎯 Siguiente premio: Visita #5 → Bebida gratis\n📋 Después:\n  #7 → Postre del chef\n  #10 → 15% en tu cuenta`

---

## Plantilla 5 — Cumpleaños

**Slot:** `birthday_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Roadmap
**Cuándo se envía:** Cron diario a las 9am — detecta clientes con cumpleaños hoy

```
¡Hola {{1}}! 🎂🎉

Hoy es tu día y en *[Restaurante]* queremos celebrarlo contigo

Visítanos esta semana y pide tu *sorpresa de cumpleaños* en caja 🎁

{{2}}

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Ana`
- `{{2}}` → `🎯 Siguiente premio: Visita #10 → 15% en tu cuenta\n📋 Después:\n  #15 → Plato principal gratis`

---

## Plantilla 6A — Reactivación sin Regalo

**Slot:** `reactivation_no_reward_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Roadmap
**Cuándo se envía:** Cron automático día 21 sin visitar — usa el roadmap como gancho sin costo
**Estrategia:** El roadmap genera FOMO de los premios acumulados. Costo $0 para el restaurante.

```
¡Hola {{1}}! 👋🍣

Hace un tiempo que no te vemos y te extrañamos

Tus premios siguen aquí esperándote 👇

{{2}}

Pásate cuando quieras, siempre hay algo nuevo en el menú

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Carlos`
- `{{2}}` → `🎯 Siguiente premio: Visita #7 → Postre del chef\n📋 Después:\n  #10 → 15% en tu cuenta\n  #15 → Plato principal gratis`

---

## Plantilla 6B — Reactivación con Regalo

**Slot:** `reactivation_with_reward_template_sid`
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Premio fijo · `{{3}}`=Roadmap
**Cuándo se envía:** Cron día 21, modo activado en Settings con un premio específico seleccionado
**Estrategia:** Para usar solo si la conversión del 6A es baja. El premio fijo tiene un costo real.

```
¡Hola {{1}}! 👋🍣

Hace un tiempo que no te vemos y queremos darte un motivo para volver

Te tenemos un *{{2}}* esperándote, menciónalo en tu próxima visita para reclamarlo 🎁

{{3}}

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Sofía`
- `{{2}}` → `Postre de bienvenida`
- `{{3}}` → `🎯 Siguiente premio: Visita #5 → Bebida gratis\n📋 Después:\n  #7 → Postre del chef`

---

## Plantilla 7 — Campaña: Presencial → Domicilio

**Uso:** Campaña manual desde Dashboard > Campañas
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=# Visita · `{{3}}`=Próximo premio
**Objetivo:** Convertir clientes que solo vienen al local a pedir también domicilio

```
¡Hola {{1}}! 🛵🍣

¿Sabías que también llevamos *[Restaurante]* hasta tu puerta?

Pide tus favoritos sin salir de casa — escríbenos por WhatsApp y te lo llevamos 🏠

Las visitas de domicilio *también cuentan* para tus premios — estás en la visita *{{2}}* y vas por *{{3}}*

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Daniela`
- `{{2}}` → `4`
- `{{3}}` → `Bebida gratis`

---

## Plantilla 8 — Campaña: Domicilio → Presencial

**Uso:** Campaña manual desde Dashboard > Campañas
**Categoría Twilio:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=# Visita · `{{3}}`=Próximo premio
**Objetivo:** Llevar clientes de domicilio a comer en el restaurante

```
¡Hola {{1}}! ♥️🍣

Nos encanta llevarte el sushi a casa, pero la experiencia en *[Restaurante]* es otro nivel

Te invitamos a visitarnos — llevas la visita *{{2}}* y tu próximo premio es *{{3}}* 🎯

¡Te esperamos para conocernos en persona!

_— El equipo de [Restaurante]_
```

**Samples para aprobación:**
- `{{1}}` → `Pedro`
- `{{2}}` → `3`
- `{{3}}` → `Bebida gratis`

---

## Plantilla 9 — Evento con Imagen (Calendar Auto-dispatch)

**Key en admin_settings:** `event_template_image_sid`
**Tipo Twilio:** `twilio/media`
**Categoría Meta:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Restaurante · `{{3}}`=Título evento · `{{4}}`=Fecha · `{{5}}`=CTA · `{{6}}`=URL imagen (dinámica)
**Cuándo se envía:** Cron cada 15 min detecta eventos con `send_mode='auto'` + `scheduled_send_at <= now()` → `executeAutoEvent()` pasa la URL de la imagen subida al bucket como `{{6}}`

**Body (fijo — Meta aprueba esto):**
```
¡Hola {{1}}! 🎉 *{{2}}* te invita a *{{3}}* — {{4}}.

{{5}}
```

**HEADER:** imagen JPG/PNG (el URL varía por evento, Meta aprueba el slot, no el archivo)

**Samples para aprobación:**
- `{{1}}` → `María`
- `{{2}}` → `[Restaurante]`
- `{{3}}` → `Festival Gastronómico`
- `{{4}}` → `sábado 14 de junio`
- `{{5}}` → `¡Te esperamos con tu familia! 🍽️`
- `{{6}}` → `https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/JPEG_example_flower.jpg/800px-JPEG_example_flower.jpg`

> El sample de `{{6}}` es solo para aprobación — cualquier imagen pública válida funciona. En producción se usa la URL del bucket `event-media` de Supabase Storage.

---

## Plantilla 10 — Evento con Video (Calendar Auto-dispatch)

**Key en admin_settings:** `event_template_video_sid`
**Tipo Twilio:** `twilio/media`
**Categoría Meta:** `MARKETING`
**Variables:** `{{1}}`=Nombre · `{{2}}`=Restaurante · `{{3}}`=Título evento · `{{4}}`=Fecha · `{{5}}`=CTA · `{{6}}`=URL video (dinámica)
**Cuándo se envía:** Igual que la 9 pero para eventos con `media_type='video'`

**Body (idéntico al 9):**
```
¡Hola {{1}}! 🎉 *{{2}}* te invita a *{{3}}* — {{4}}.

{{5}}
```

**HEADER:** video MP4

**Samples para aprobación:**
- `{{1}}` → `María`
- `{{2}}` → `[Restaurante]`
- `{{3}}` → `Festival Gastronómico`
- `{{4}}` → `sábado 14 de junio`
- `{{5}}` → `¡Te esperamos con tu familia! 🍽️`
- `{{6}}` → `https://www.w3schools.com/html/mov_bbb.mp4`

---

## Cómo el Sistema Elige la Plantilla Correcta

Para clientes frecuentes, el backend evalúa automáticamente:

```
¿La visita de hoy coincide con un milestone?
├── SÍ → Plantilla 2 (Ganó Premio)
└── NO → ¿Cuántas visitas faltan para el siguiente?
           ├── Falta 1 → Plantilla 3 (Cerca)
           └── Faltan 2+ → Plantilla 4 (Lejos)
```

Para el calendario (cron cada 15 min):

```
¿Hay eventos con send_mode='auto' y scheduled_send_at <= ahora?
└── SÍ → executeAutoEvent(eventId)
          ├── event.media_type = 'image' → Plantilla 9 (event_template_image_sid)
          ├── event.media_type = 'video' → Plantilla 10 (event_template_video_sid)
          └── event.media_type = null    → Plantilla 9 como fallback (texto sin media útil)
```

No hay configuración manual por visita — el sistema decide en tiempo real.

---

## Flujo Completo del Cliente

```
CLIENTE NUEVO
└── Escanea QR o pide domicilio → Plantilla 1 (Bienvenida)

CLIENTE FRECUENTE (cada visita)
├── Ganó premio    → Plantilla 2 — "muestra este mensaje"
├── Falta 1 visita → Plantilla 3 — "la próxima es tuya"
└── Faltan 2+      → Plantilla 4 — "cada visita cuenta"

AUTOMATIZACIONES (sin acción del cliente)
├── Cumpleaños (cron 8am)      → Plantilla 5
├── Día 21 sin visitar         → Plantilla 6A (o 6B si está configurada)
├── Día 25+ sin visitar        → Campaña manual agresiva (Campañas > Manuales)
└── Evento programado (*/15m)  → Plantilla 9 (imagen) o 10 (video) — Calendar

CAMPAÑAS MANUALES (solo twilio/text)
├── Presencial → Domicilio → Plantilla 7
└── Domicilio → Presencial → Plantilla 8
```

---

## Checklist para Implementar en un Restaurante Nuevo

**Plantillas de texto (1-8) — Dashboard:**
- [ ] Crear las 8 plantillas en Twilio Content API con sus samples (Dashboard → Plantillas o `twilio-setup.mjs`)
- [ ] Esperar aprobación de Meta (24-72h)
- [ ] En Dashboard → Ajustes, asignar cada plantilla a su slot correspondiente
- [ ] Configurar recompensas en Dashboard → Recompensas (milestones)
- [ ] Verificar envío con un check-in de prueba
- [ ] Si la plantilla 6A tiene conversión < 10%, activar 6B con un regalo pequeño

**Plantillas de media (9-10) — Script de setup:**
- [ ] Ejecutar `node scripts/twilio-create-media-templates.mjs` con las credenciales del cliente
- [ ] Esperar aprobación de Meta (24-72h — independiente de las otras)
- [ ] Agregar los SIDs resultantes en Supabase `admin_settings`:
  - `event_template_image_sid` = SID de `evento_imagen_<brand>`
  - `event_template_video_sid` = SID de `evento_video_<brand>`
- [ ] Crear un evento de prueba en Dashboard → Calendario con `send_mode='auto'` y `scheduled_send_at` en 15 minutos
- [ ] Verificar que llega el mensaje con imagen al número de prueba

> **Nota:** Las plantillas 9 y 10 no se configuran en Dashboard → Ajustes porque no son slots del flujo QR/domicilio. Se configuran directamente en la tabla `admin_settings` de Supabase.

---

*Última actualización: v0.35.0 — 2026-05-24*
