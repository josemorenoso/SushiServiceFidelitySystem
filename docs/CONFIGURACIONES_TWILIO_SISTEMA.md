# Configuraciones Twilio — Sistema RestaurantQR

> **Última actualización:** 2026-05-07
> **Objetivo:** Documentar TODA la configuración de Twilio que un nuevo restaurante necesita hacer para que el sistema funcione completo: opt-out, auto-respondedor anti-idiotas, plantillas, webhook de domicilios, y cron jobs.

---

## Tabla de Contenidos

1. [Cuentas y números necesarios](#1-cuentas-y-números-necesarios)
2. [Variables de entorno (.env)](#2-variables-de-entorno-env)
3. [Opt-Out automático (STOP/BAJA)](#3-opt-out-automático-stopbaja)
4. [Auto-respondedor anti-idiotas (cliente responde a Twilio)](#4-auto-respondedor-anti-idiotas)
5. [Las 7 plantillas WhatsApp](#5-las-7-plantillas-whatsapp)
6. [Webhook de domicilios (n8n + Twilio)](#6-webhook-de-domicilios)
7. [Cron jobs (cumpleaños y reactivación)](#7-cron-jobs)
8. [Checklist final por restaurante nuevo](#8-checklist-final-por-restaurante-nuevo)

---

## 1. Cuentas y números necesarios

### 1.1 Cuentas

| Cuenta | Para qué | Costo aprox |
|--------|----------|-------------|
| **Twilio** | Envío de WhatsApp + recepción + Content API | ~$0.0058/msg MARKETING, ~$0.003/msg UTILITY |
| **Meta WhatsApp Business** | Aprobación de plantillas | Gratis (Twilio gestiona) |
| **Vercel** | Hosting de la app | Gratis hasta cierto uso |
| **Supabase** | Base de datos | Gratis hasta 500MB |

### 1.2 Números de teléfono (CRÍTICO)

Tu restaurante necesita **DOS números diferentes**:

| Número | Función | Quién atiende |
|--------|---------|---------------|
| **Twilio WhatsApp** (ej: `+14155238886`) | Envío automático de plantillas. Recibe respuestas pero las redirige automáticamente. | Nadie humano |
| **WhatsApp del Restaurante** (ej: `+573001234567`) | Atiende clientes en vivo, recibe pedidos, responde dudas. | Mesero / dueño / CRM humano |

⚠️ **Si pones el mismo número para ambos, vas a tener un caos.** El número Twilio debe ser exclusivo para automatización.

---

## 2. Variables de entorno (.env)

```bash
# ─── Twilio ───
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# ─── Línea principal del restaurante (donde redirigir clientes) ───
RESTAURANT_WHATSAPP_NUMBER=+573001234567
RESTAURANT_WHATSAPP_LINK=https://wa.me/573001234567

# ─── Webhooks ───
WEBHOOK_DELIVERY_SECRET=secret-aleatorio-largo-aqui
CRON_SECRET=otro-secret-aleatorio-largo

# ─── Supabase ───
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

---

## 3. Opt-Out automático (STOP/BAJA)

### 3.1 Cómo funciona

Cuando un cliente responde **STOP, BAJA, CANCELAR, FUERA, UNSUBSCRIBE, QUIT, END** al número Twilio:

1. Twilio bloquea ese número automáticamente (filtro `OptOut`).
2. Cualquier intento futuro de enviarle plantilla devuelve **error 21610** (Recipient has opted out).
3. El bloqueo es permanente hasta que el cliente envíe **START, ALTA, SI**.

### 3.2 Configuración en Twilio Console

1. Ve a **Twilio Console → Messaging → Settings → Opt-Out Management**.
2. Verifica que esté **Enabled** (está por defecto).
3. En **Custom Keywords**, agrega keywords en español:
   - **Opt-out:** `BAJA, CANCELAR, FUERA, NO, BASTA`
   - **Opt-in:** `ALTA, SI, ACEPTO`
   - **Help:** `AYUDA, INFO`
4. **Save**.

### 3.3 Obligación legal en cada plantilla MARKETING

Meta exige que **toda plantilla MARKETING incluya opt-out visible en el cuerpo**. Por eso nuestras plantillas MARKETING terminan con:

```
Para no recibir más mensajes responde STOP.
```

Sin esa línea, Meta rechaza la plantilla en revisión.

⚠️ Las plantillas **UTILITY** (bienvenida, premio ganado, cumpleaños) **NO necesitan** opt-out porque son transaccionales.

---

## 4. Auto-respondedor anti-idiotas

### 4.1 El problema

Los clientes son brutos. Reciben tu mensaje automático y responden cosas como:
- "Hola"
- "Muchas gracias"
- "Y dónde queda?"
- "Pueden traer a mi casa?"
- "A qué hora abren?"

Esto **abre la ventana de 24h** de WhatsApp Business pero tu sistema no tiene nadie atendiéndola → el cliente queda colgado y te ve mal.

### 4.2 Solución: Webhook de auto-reply en Twilio

Cuando un cliente responde al número Twilio, Twilio dispara un webhook. Tu app responde con un mensaje TwiML que **redirige al cliente a la línea principal** mediante un link `wa.me/...`.

### 4.3 Endpoint a crear en tu app

Archivo: `src/app/api/webhook/twilio-incoming/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'

const RESTAURANT_LINK = process.env.RESTAURANT_WHATSAPP_LINK || 'https://wa.me/573001234567'

// Palabras clave para respuestas específicas (opcional pero recomendado)
const KEYWORDS = {
  pedido: ['pedido', 'domicilio', 'delivery', 'comprar', 'ordenar'],
  horario: ['horario', 'abierto', 'abren', 'cierran'],
  ubicacion: ['direccion', 'ubicacion', 'donde', 'queda'],
}

function detectIntent(body: string): keyof typeof KEYWORDS | 'default' {
  const text = body.toLowerCase()
  for (const [intent, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => text.includes(w))) return intent as keyof typeof KEYWORDS
  }
  return 'default'
}

function buildResponse(intent: keyof typeof KEYWORDS | 'default'): string {
  const baseRedirect = `\n\n📲 Escríbenos en: ${RESTAURANT_LINK}`

  switch (intent) {
    case 'pedido':
      return `🍽️ ¡Para pedidos a domicilio te atendemos directamente en la línea principal!${baseRedirect}`
    case 'horario':
      return `🕐 Estamos abiertos de Lunes a Domingo, 12pm a 10pm.${baseRedirect}`
    case 'ubicacion':
      return `📍 Estamos en [DIRECCIÓN]. Mapa: https://maps.google.com/?q=...${baseRedirect}`
    default:
      return `👋 Hola, este número es solo para mensajes automáticos.\n\nPara hablar con nosotros:${baseRedirect}\n\n¡Te respondemos rápido!`
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const body = (formData.get('Body') as string) || ''
  const from = (formData.get('From') as string) || ''

  // Twilio maneja los STOP/START automáticamente — no entran aquí.
  // Solo llegan mensajes que NO son comandos de opt-out.

  const intent = detectIntent(body)
  const message = buildResponse(intent)

  console.log(`[TwilioIncoming] ${from} dijo "${body}" → respuesta: ${intent}`)

  // (Opcional) Notificar al dueño si es default (no clasificó)
  // await notifyOwner(from, body)

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
```

### 4.4 Configurar webhook en Twilio Console

1. Ve a **Twilio Console → Messaging → Senders → WhatsApp Senders**.
2. Click en tu número de WhatsApp.
3. En la sección **"When a message comes in"**:
   - URL: `https://tu-app.vercel.app/api/webhook/twilio-incoming`
   - Método: **HTTP POST**
4. **Save**.

### 4.5 Las 3 capas anti-idiotas

| Capa | Qué hace | Cubre |
|------|----------|-------|
| **1. Link `wa.me/...`** | Convierte 1 tap en conversación con el restaurante | 90% de los casos |
| **2. Keywords** | Detecta intención y responde con info específica | Reduce 70% de respuestas humanas |
| **3. Notificación al dueño** | Si nadie clasifica, notifica al dueño con el mensaje | Casos edge |

### 4.6 Por qué `wa.me/` es mágico

`https://wa.me/573001234567` es un link oficial de WhatsApp que:
- En móvil: abre WhatsApp con la conversación al número listo para escribir.
- En desktop: abre WhatsApp Web con la conversación.

**El cliente NO tiene que copiar el número, agregarlo a contactos, ni nada.** Un solo tap y está hablando con quien sí responde.

---

## 5. Las 7 plantillas WhatsApp

Crear en **Twilio Console → Content API → Create Template** o desde tu Dashboard > Plantillas.

### Reglas de oro de diseño

| Regla | Por qué |
|-------|---------|
| Máximo 4 líneas de texto | WhatsApp móvil corta mensajes largos. |
| 1 emoji por línea max | Más se ve spam. Meta penaliza. |
| **NUNCA `{{name}}` literal** | Twilio sólo entiende `{{1}}, {{2}}, {{3}}`. |
| MARKETING → STOP obligatorio | Sin opt-out, Meta rechaza. |
| UTILITY no necesita STOP | Bienvenida, premio ganado, cumpleaños. |

### Plantilla 1: `bienvenida_primera_visita`
- **Categoría:** UTILITY
- **Variables:** `{{1}}`=nombre

```
¡Hola {{1}}! 🎉 Bienvenid@ a [TU RESTAURANTE].

Acabas de unirte a nuestra familia. En tu próxima visita
te tenemos un beneficio especial.

¡Te esperamos pronto! 🍽️
```

### Plantilla 2: `visita_recurrente_cerca_premio` ⭐
- **Categoría:** MARKETING
- **Variables:** `{{1}}`=nombre, `{{2}}`=visitas, `{{3}}`=título premio

```
¡Hola {{1}}! 🌟 Gracias por tu visita #{{2}}.

🔥 ¡Estás a UNA visita de ganar: {{3}}!

Vuelve pronto y reclámalo. ¡Te esperamos! 🎁

Para no recibir más mensajes responde STOP.
```

### Plantilla 3: `visita_recurrente_lejos_premio`
- **Categoría:** MARKETING
- **Variables:** `{{1}}`=nombre, `{{2}}`=visitas, `{{3}}`=título premio

```
Hola {{1}} 👋 Gracias por tu visita #{{2}}.

Sigue acumulando visitas para ganar: {{3}}.
Cada visita te acerca más al premio. 🎯

¡Te esperamos pronto!

Para no recibir más mensajes responde STOP.
```

### Plantilla 4: `ganaste_premio` 🏆
- **Categoría:** UTILITY
- **Variables:** `{{1}}`=nombre, `{{2}}`=visitas, `{{3}}`=título premio

```
¡FELICIDADES {{1}}! 🎉🏆

Llevas {{2}} visitas y te has ganado: {{3}}

📲 Muestra este mensaje en tu PRÓXIMA visita
para reclamar tu premio.

¡Nos vemos pronto! 🎁
```

⚠️ **"Muestra este mensaje en tu PRÓXIMA visita" es CRÍTICO** — el QR se escanea al final de la comida, así que el cliente gana hoy y redime mañana.

### Plantilla 5: `feliz_cumpleanos` 🎂
- **Categoría:** UTILITY
- **Variables:** `{{1}}`=nombre

```
¡Feliz cumpleaños {{1}}! 🎂🎉

Hoy queremos celebrarte. Pasa por [TU RESTAURANTE]
y reclama tu sorpresa de cumpleaños. 🎁

¡Te esperamos para hacer tu día especial!
```

### Plantilla 6: `reactivacion_sin_regalo` 💔
- **Categoría:** MARKETING
- **Variables:** `{{1}}`=nombre

```
Hola {{1}} 👋 Te echamos de menos en [TU RESTAURANTE].

Hace tiempo que no te vemos por aquí. ¿Qué pasó?
Volvamos a vernos pronto. 🍽️

Para no recibir más mensajes responde STOP.
```

### Plantilla 7: `reactivacion_con_regalo` 🎁
- **Categoría:** MARKETING
- **Variables:** `{{1}}`=nombre, `{{3}}`=título premio

```
Hola {{1}} 💔 Te echamos de menos.

Para que vuelvas, te tenemos un regalo:
🎁 {{3}}

Pasa por [TU RESTAURANTE] esta semana
y reclámalo. ¡Te esperamos!

Para no recibir más mensajes responde STOP.
```

### Asignación en Dashboard > Ajustes

Una vez aprobadas (24-48h por Meta), asigna cada SID:

| Selector | Plantilla |
|----------|-----------|
| Bienvenida (registro nuevo) | 1 |
| Visita: cerca de premio (faltan 1) | 2 |
| Visita: lejos de premio (faltan 2+) | 3 |
| Ganaste premio (milestone) | 4 |
| Cumpleaños (cron) | 5 |
| Reactivación SIN regalo | 6 |
| Reactivación CON regalo | 7 |
| Recompensa para reactivación CON regalo | (selecciona un reward) |

---

## 6. Webhook de domicilios

Para que el flujo de domicilios (mesero reenvía mensaje → n8n parsea → API crea cliente) funcione:

### 6.1 Webhook de Twilio para domicilios

1. Ve a **Twilio Console → Messaging → Senders → WhatsApp Senders**.
2. Click en tu número.
3. ⚠️ Si ya configuraste el `twilio-incoming` arriba, **ese mismo webhook recibe TODOS los mensajes**.
4. Para separar la lógica de domicilios: en el endpoint `twilio-incoming`, detecta si el remitente está en `authorized_numbers` (tabla Supabase). Si SÍ → reenvía a n8n para parseo de pedido. Si NO → auto-respondedor anti-idiotas.

### 6.2 Lógica recomendada en `twilio-incoming/route.ts`

```ts
// Pseudo-código
const isAuthorized = await checkIfAuthorized(from)

if (isAuthorized) {
  // Es un mesero reenviando un pedido → forward a n8n
  await forwardToN8n(body, from)
  return twiml('✅ Pedido recibido')
} else {
  // Es un cliente respondiendo → auto-respondedor
  return twiml(buildResponse(detectIntent(body)))
}
```

### 6.3 Tabla `authorized_numbers` (ya existe en tu schema)

Inserta los celulares de los meseros que están autorizados a reenviar pedidos:

```sql
INSERT INTO authorized_numbers (phone, name, is_active) VALUES
  ('573001234567', 'Mesero Juan', true),
  ('573009876543', 'Mesero Pedro', true);
```

---

## 7. Cron jobs (cumpleaños y reactivación)

### 7.1 Configurar en Vercel

Tu `vercel.json` (o `vercel.ts`) debe tener:

```json
{
  "crons": [
    { "path": "/api/cron/birthday", "schedule": "0 13 * * *" },
    { "path": "/api/cron/reactivation", "schedule": "0 15 * * *" }
  ]
}
```

- **Birthday:** 8am Colombia (13:00 UTC) diario.
- **Reactivation:** 10am Colombia (15:00 UTC) diario.

### 7.2 Variables de entorno

```bash
CRON_SECRET=secret-aleatorio-largo
```

Vercel envía este secret en el header `Authorization: Bearer <secret>` automáticamente. Tu endpoint lo valida.

### 7.3 Configurar plantillas en Dashboard > Ajustes

Como ya cubrimos, asignar:
- Cumpleaños → SID de plantilla 5
- Reactivación SIN regalo → SID de plantilla 6
- Reactivación CON regalo → SID de plantilla 7
- Recompensa para reactivación → un reward (recomendado: el de menor costo, ej "Bebida gratis")

---

## 8. Checklist final por restaurante nuevo

Para activar el sistema completo en un restaurante nuevo:

### Día 1: Setup técnico (2-3 horas)
- [ ] Crear cuenta Twilio + comprar número WhatsApp Business.
- [ ] Conseguir aprobación de Meta para el número (24-48h).
- [ ] Conseguir un **segundo número** WhatsApp para atención humana del restaurante.
- [ ] Configurar variables `.env` (TWILIO_*, RESTAURANT_WHATSAPP_LINK, secrets).
- [ ] Deploy del proyecto en Vercel.
- [ ] Conectar Supabase + ejecutar migraciones.
- [ ] Configurar Opt-Out con keywords en español en Twilio Console.

### Día 2: Plantillas (1 hora hands-on + 24-48h espera)
- [ ] Crear las 7 plantillas en Twilio Content API o Dashboard > Plantillas.
- [ ] Personalizar `[TU RESTAURANTE]` con el nombre real.
- [ ] Marcar correctamente UTILITY vs MARKETING.
- [ ] Esperar aprobación de Meta (1-2 días).

### Día 3: Auto-respondedor (30 min)
- [ ] Crear endpoint `/api/webhook/twilio-incoming` con la lógica del doc.
- [ ] Personalizar keywords en español del restaurante.
- [ ] Configurar webhook URL en Twilio Console → WhatsApp Senders.
- [ ] Probar enviando "hola" al número Twilio desde un celular personal.

### Día 4: Configurar Dashboard
- [ ] En Dashboard > Recompensas: crear los rewards (ej: visita 3, 6, 9, 12).
- [ ] En Dashboard > Ajustes: asignar los 7 SIDs aprobados.
- [ ] En Dashboard > Ajustes: seleccionar la recompensa para reactivación.
- [ ] En Dashboard > Ajustes: configurar ticket promedio (para ROI).

### Día 5: Pruebas E2E
- [ ] Hacer check-in con celular personal nuevo → recibir bienvenida.
- [ ] Repetir hasta llegar a milestone → recibir "ganaste premio".
- [ ] Esperar 21+ días sin visita (o forzar `last_visit_at` antiguo en DB) → trigger manual del cron de reactivación.
- [ ] Configurar fecha de cumpleaños hoy → trigger cron birthday.
- [ ] Responder "hola" al Twilio → debe redirigir al WhatsApp humano.
- [ ] Responder "STOP" → verificar que ya no llegan plantillas.

### Día 6: Configurar n8n (si usa domicilios)
- [ ] Importar workflow `domicilios_whatsapp_v3.json`.
- [ ] Configurar credenciales Supabase + Google Contacts.
- [ ] Insertar números autorizados de meseros en `authorized_numbers`.
- [ ] Probar reenviando un mensaje de pedido desde un mesero.

### Día 7: Operación
- [ ] Capacitar al staff: "Si un cliente quiere redimir premio, debe escanear QR al INICIO de la visita, no al final."
- [ ] Entregar QR físicos en mesas.
- [ ] Monitorear primeras 100 visitas.

---

## 9. Errores comunes y soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| 21610: Recipient has opted out | Cliente respondió STOP | Normal, respeta el opt-out |
| 63016: Failed to send Freeform | Intentaste enviar texto libre fuera de la ventana de 24h | Usar plantillas SIEMPRE |
| 63007: Channel could not find Twilio number | Número Twilio no aprobado por Meta aún | Esperar aprobación (24-48h) |
| Plantilla rechazada por Meta | Falta opt-out en MARKETING, o uso de `{{name}}` en vez de `{{1}}` | Revisar reglas de diseño |
| Cliente no recibe mensajes | accepts_marketing=false en customers, o opt-out previo | Verificar tabla customers + Twilio Opt-Out logs |
| Webhook 403 | Falta `WEBHOOK_DELIVERY_SECRET` o `CRON_SECRET` | Verificar `.env` y header `x-webhook-secret` |

---

## Referencias

- Twilio WhatsApp Docs: https://www.twilio.com/docs/whatsapp
- Twilio Content API (plantillas): https://www.twilio.com/docs/content
- Meta Plantillas WhatsApp: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- Opt-Out Management: https://www.twilio.com/docs/messaging/features/how-to-configure-opt-in-keywords
- Link `wa.me`: https://faq.whatsapp.com/5913398998672934
